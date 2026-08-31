/**
 * Aufbereitung eines Lernpfads: aus jedem hochgeladenen Arbeitsheft wird einmal Lehrstoff.
 *
 * Warum als eigener Schritt und nicht beiläufig bei der Aufgabenerzeugung: siehe den Kopf von
 * `../preparation/derive.ts`. Kurz — bisher wurde die Lücke „das Dossier stellt die Frage, ohne
 * sie zu beantworten" bei JEDER Aufgabe neu und unsichtbar gefüllt. Hier geschieht es einmal, das
 * Ergebnis ist nachlesbar, und danach gilt Invariante I5 wieder gegen einen Text, der vorher da war.
 *
 * Einmalig je Material: Ein abgeleitetes Material trägt `derivedFrom` mit der `id` seiner Quelle.
 * Existiert es bereits, passiert nichts. Ohne diese Sperre liefe die Aufbereitung bei jedem Öffnen
 * des Pfads erneut — teuer, langsam, und das Ergebnis wäre jedes Mal ein anderer Text.
 */

import { useEffect, useRef, useState } from 'react'
import {
  derivationSummary,
  deriveFromMaterial,
  derivedMaterialName,
  type DerivationSummary,
} from '../preparation/derive'
import { updateLearningPathById, type UploadedMaterial } from '../../services/learn.persistence'
import type { WorkbookItem } from '../agents/contracts'

export type PreparationState = {
  phase: 'idle' | 'running' | 'done' | 'failed'
  /** Name des Materials, das gerade aufbereitet wird. */
  currentMaterial: string | null
  done: number
  total: number
  summary: DerivationSummary | null
  error: string | null
}

const INITIAL: PreparationState = {
  phase: 'idle',
  currentMaterial: null,
  done: 0,
  total: 0,
  summary: null,
  error: null,
}

type Args = {
  pathId: string | null
  isSetupComplete: boolean
  materials: UploadedMaterial[]
  searchWeb?: (query: string) => Promise<string>
  /** Die aufbereiteten Punkte je abgeleitetem Material — Grundlage der Anzeige (Schritt 5). */
  onItems: (materialId: string, items: WorkbookItem[]) => void
  /** Die neue Materialliste, nachdem der abgeleitete Lehrstoff dazugekommen ist. */
  onMaterialsChanged: (materials: UploadedMaterial[]) => void
}

/** Welche hochgeladenen Materialien haben noch keinen abgeleiteten Lehrstoff? */
export function materialsAwaitingPreparation(materials: UploadedMaterial[]): UploadedMaterial[] {
  const derivedFor = new Set(
    materials
      .filter((material) => material.origin === 'derived' && material.derivedFrom)
      .map((material) => material.derivedFrom as string),
  )
  return materials.filter(
    (material) =>
      material.origin !== 'derived' && material.excerpt.trim().length > 0 && !derivedFor.has(material.id),
  )
}

export function useMaterialPreparation(args: Args): PreparationState {
  const [state, setState] = useState<PreparationState>(INITIAL)
  const startedRef = useRef<string | null>(null)

  const onItemsRef = useRef(args.onItems)
  onItemsRef.current = args.onItems
  const onMaterialsChangedRef = useRef(args.onMaterialsChanged)
  onMaterialsChangedRef.current = args.onMaterialsChanged
  const materialsRef = useRef(args.materials)
  materialsRef.current = args.materials
  const searchWebRef = useRef(args.searchWeb)
  searchWebRef.current = args.searchWeb

  const pending = materialsAwaitingPreparation(args.materials)
  const pendingKey = pending.map((material) => material.id).join('|')

  useEffect(() => {
    const { pathId, isSetupComplete } = args
    if (!pathId || !isSetupComplete || !pendingKey) {
      return
    }
    // Derselbe Pfad mit derselben offenen Liste wird nicht zweimal angestossen.
    const runKey = `${pathId}::${pendingKey}`
    if (startedRef.current === runKey) {
      return
    }
    startedRef.current = runKey

    const controller = new AbortController()
    let cancelled = false

    void (async () => {
      const todo = materialsAwaitingPreparation(materialsRef.current)
      setState({ ...INITIAL, phase: 'running', total: todo.length })

      const added: UploadedMaterial[] = []
      const collected: WorkbookItem[] = []

      for (let index = 0; index < todo.length; index += 1) {
        if (cancelled) {
          return
        }
        const material = todo[index]
        setState((current) => ({ ...current, currentMaterial: material.name, done: index }))

        try {
          const derivation = await deriveFromMaterial({
            material,
            ...(searchWebRef.current ? { searchWeb: searchWebRef.current } : {}),
            signal: controller.signal,
          })
          if (cancelled) {
            return
          }
          collected.push(...derivation.items)

          /*
           * Kein Lehrtext heisst: dieses Material enthielt keine einzige Wissensfrage. Das ist
           * kein Fehler — ein Lehrbuch braucht keine Aufbereitung. Es entsteht dann auch kein
           * abgeleitetes Material, und beim naechsten Oeffnen wuerde es erneut versucht. Damit
           * das nicht bei jedem Start passiert, wird ein leerer Platzhalter abgelegt: er haelt
           * fest, DASS geprueft wurde.
           */
          const derived: UploadedMaterial = {
            id: `derived-${material.id}`,
            name: derivedMaterialName(material.name),
            size: derivation.text.length,
            excerpt: derivation.text,
            origin: 'derived',
            derivedFrom: material.id,
          }
          added.push(derived)
          onItemsRef.current(derived.id, derivation.items)
        } catch (cause) {
          if (cancelled) {
            return
          }
          setState((current) => ({
            ...current,
            phase: 'failed',
            error: cause instanceof Error ? cause.message : 'Die Aufbereitung ist fehlgeschlagen.',
          }))
          return
        }
      }

      if (cancelled || added.length === 0) {
        return
      }

      const next = [...materialsRef.current, ...added]
      try {
        await updateLearningPathById(pathId, { materials: next })
      } catch {
        /*
         * Speichern fehlgeschlagen: der abgeleitete Stoff gilt trotzdem fuer diese Sitzung. Beim
         * naechsten Oeffnen wird erneut aufbereitet — aergerlich, aber folgenlos. Ein harter
         * Abbruch waere hier schlechter: er wuerfe eine bereits fertige Aufbereitung weg.
         */
      }
      if (cancelled) {
        return
      }
      onMaterialsChangedRef.current(next)
      setState((current) => ({
        ...current,
        phase: 'done',
        currentMaterial: null,
        done: current.total,
        summary: derivationSummary(collected),
      }))
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.pathId, args.isSetupComplete, pendingKey])

  return state
}

