/**
 * Macht eine Bildadresse absolut, bevor sie in eine CSS-Eigenschaft wandert.
 *
 * Nötig, weil `vite.config.ts` mit `base: './'` baut: `import.meta.env.BASE_URL` ist im Build `./`,
 * eine daraus gebaute Adresse also relativ. Im Dev-Server ist BASE_URL dagegen `/`, die Adresse
 * damit absolut — deshalb fällt das lokal nie auf, sondern erst im Deploy.
 *
 * Bei `<img src>` wäre das harmlos: dort erfolgt die Auflösung gegen die Dokumentadresse. In einer
 * CSS-Eigenschaft ist sie dagegen mehrdeutig — je nach Browser gegen das Dokument oder gegen das
 * Stylesheet, in dem die Eigenschaft per `var()` benutzt wird. Das gebündelte Stylesheet liegt unter
 * `<base>/assets/`; von dort aus wird aus `./assets/logo/Straton.png` ein doppeltes
 * `assets/assets/logo/Straton.png` und damit ein 404. Bei einer Maske heisst das: kein kaputtes
 * Bild, kein Platzhalter — das Zeichen verschwindet spurlos.
 *
 * Absolut aufgelöst ist die Adresse eindeutig, egal welche Regel der Browser anwendet. Fertige
 * Adressen mit Schema (`data:`, `https:`) bleiben unangetastet — Vite bettet kleine SVGs als
 * `data:`-URI ein, die dürfen nicht angefasst werden.
 *
 * Gilt für jede zur Laufzeit gebaute Adresse, die in CSS landet; für Zeichen aus `public/` also
 * immer. Per `import` eingebundene Dateien lösen ihre Adresse schon beim Bauen auf.
 */
export function toAbsoluteAssetUrl(src: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) {
    return src
  }
  try {
    return new URL(src, document.baseURI).href
  } catch {
    return src
  }
}

/** Fertiger `url("…")`-Wert für eine CSS-Eigenschaft, mit absolut gemachter Adresse. */
export function cssUrl(src: string): string {
  return `url("${toAbsoluteAssetUrl(src)}")`
}
