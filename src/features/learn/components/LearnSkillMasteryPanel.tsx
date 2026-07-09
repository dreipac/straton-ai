import { useMemo } from 'react'
import type { ChapterSession } from '../services/learn.persistence'

export type LearnSkillMasteryPanelProps = {
  skillMasteryBySkillId: ChapterSession['skillMasteryBySkillId']
}

type MasteryTier = 'strong' | 'mid' | 'weak'

type MasterySkillView = {
  skillId: string
  label: string
  scorePct: number
  attempts: number
  correct: number
  tier: MasteryTier
}

const STRONG_SCORE = 0.85
const WEAK_SCORE = 0.6
const STRONG_MIN_ATTEMPTS = 2

/** Konzept-Slug (z. B. "concept:mwst-berechnung") in lesbares Label umwandeln. */
function humanizeSkillLabel(skillId: string, storedLabel: string | undefined): string {
  const conceptMatch = /^concept:(.+)$/.exec(skillId)
  if (conceptMatch?.[1]) {
    const words = conceptMatch[1]
      .split('-')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    if (words.length > 0) {
      return words.join(' ')
    }
  }
  const fallback = storedLabel?.trim() ?? ''
  if (fallback) {
    return fallback.length > 64 ? `${fallback.slice(0, 64).trim()}…` : fallback
  }
  return 'Konzept'
}

function tierForScore(score: number): MasteryTier {
  if (score >= STRONG_SCORE) {
    return 'strong'
  }
  if (score >= WEAK_SCORE) {
    return 'mid'
  }
  return 'weak'
}

export function LearnSkillMasteryPanel({ skillMasteryBySkillId }: LearnSkillMasteryPanelProps) {
  const { skills, masteredCount, inProgressCount, toMasterCount, bestStreak } = useMemo(() => {
    const entries = Object.entries(skillMasteryBySkillId ?? {}).filter(([, entry]) => entry.attempts > 0)

    const views: MasterySkillView[] = entries
      .map(([skillId, entry]) => {
        const score = Math.max(0, Math.min(1, entry.score ?? 0))
        return {
          skillId,
          label: humanizeSkillLabel(skillId, entry.label),
          scorePct: Math.round(score * 100),
          attempts: entry.attempts,
          correct: entry.correct,
          tier: tierForScore(score),
        }
      })
      .sort((a, b) => b.scorePct - a.scorePct || b.attempts - a.attempts)

    let mastered = 0
    let toMaster = 0
    let best = 0
    for (const [, entry] of entries) {
      const score = Math.max(0, Math.min(1, entry.score ?? 0))
      if (score >= STRONG_SCORE && entry.attempts >= STRONG_MIN_ATTEMPTS) {
        mastered += 1
      } else if (score < WEAK_SCORE) {
        toMaster += 1
      }
      best = Math.max(best, entry.correctStreak ?? 0)
    }

    return {
      skills: views,
      masteredCount: mastered,
      toMasterCount: toMaster,
      inProgressCount: Math.max(0, views.length - mastered - toMaster),
      bestStreak: best,
    }
  }, [skillMasteryBySkillId])

  if (skills.length === 0) {
    return (
      <section className="learn-mastery-panel" aria-label="Kompetenzen">
        <p className="learn-mastery-empty learn-muted">
          Sobald du Fragen beantwortest, erscheint hier dein Kompetenz-Fortschritt — pro Thema ein Balken.
        </p>
      </section>
    )
  }

  return (
    <section className="learn-mastery-panel" aria-label="Kompetenzen">
      <div className="learn-mastery-summary">
        <div className="learn-mastery-chip learn-mastery-chip--mastered">
          <span className="learn-mastery-chip-value">{masteredCount}</span>
          <span className="learn-mastery-chip-label">Gemeistert</span>
        </div>
        <div className="learn-mastery-chip learn-mastery-chip--progress">
          <span className="learn-mastery-chip-value">{inProgressCount}</span>
          <span className="learn-mastery-chip-label">In Arbeit</span>
        </div>
        <div className="learn-mastery-chip learn-mastery-chip--todo">
          <span className="learn-mastery-chip-value">{toMasterCount}</span>
          <span className="learn-mastery-chip-label">Noch zu meistern</span>
        </div>
        {bestStreak >= 2 ? (
          <div className="learn-mastery-chip learn-mastery-chip--streak">
            <span className="learn-mastery-chip-value">{'🔥'} {bestStreak}</span>
            <span className="learn-mastery-chip-label">Beste Serie</span>
          </div>
        ) : null}
      </div>

      <div className="learn-mastery-bars" role="list" aria-label="Kompetenz-Fortschritt pro Thema">
        {skills.map((skill) => (
          <div key={skill.skillId} className="learn-mastery-row" role="listitem">
            <div className="learn-mastery-row-head">
              <span className="learn-mastery-row-label" title={skill.label}>
                {skill.label}
              </span>
              <span className={`learn-mastery-row-pct learn-mastery-row-pct--${skill.tier}`}>
                {skill.scorePct}%
              </span>
            </div>
            <div
              className="learn-mastery-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={skill.scorePct}
              aria-label={`${skill.label}: ${skill.scorePct}% beherrscht`}
            >
              <span
                className={`learn-mastery-fill learn-mastery-fill--${skill.tier}`}
                style={{ width: `${skill.scorePct}%` }}
              />
            </div>
            <p className="learn-mastery-row-meta learn-muted">
              {skill.correct}/{skill.attempts} richtig
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
