# Straton — Hinweise für Claude Code

## CSS: Design-Tokens statt neuer Rohwerte

Bevor du irgendwo `font-size` oder `border-radius` schreibst oder änderst: lies
[`dokumentation/design-system.md`](dokumentation/design-system.md). Beide haben eine feste
Stufen-Skala (`--fs-*` in `src/styles/theme.css`, `--radius-*` ebenda) — nimm die nächstliegende
Stufe, erfinde keinen neuen Einzelwert (`font-size: 0.91rem`, `border-radius: 13px`, …). Die Datei
listet auch die bewussten Ausnahmen (feste `px` auf Inputs, `em`-Werte, responsive `clamp()`).

Dieselbe Datei nennt weitere, noch offene Design-System-Baustellen (Schatten, Fokus-Ring,
Button-Varianten) — vor einer größeren UI-Änderung dort nachsehen, ob die Änderung eine davon
gleich mit erledigen sollte, statt eine weitere Einzellösung zu bauen.

## CSS: Sidebar-Footer-Buttons teilen EINEN Hover-Style

Jeder Sidebar-Footer-Button (Einstellungen, Administrator, Updates, Freunde, "Mehr", jeder
künftige) trägt immer die gemeinsame Basisklasse `.chat-sidebar-footer-nav-button`
(`src/styles/layout.css`). Der Hover-/Aktiv-Look (transparenter Hintergrund, `backdrop-filter:
brightness(1.08)`, Text in `--color-accent`) sitzt **ausschließlich** auf dieser Basisklasse
(`.chat-sidebar-footer-nav-button:hover:enabled` etc.) — nicht auf den einzelnen
Button-Modifier-Klassen (`-settings-button`, `-more-button`, `-admin-button`,
`chat-sidebar-nav-button--news/--friends`, …).

**Für einen neuen Sidebar-Footer-Button:** einfach `chat-sidebar-footer-nav-button` mit vergeben —
der Hover kommt automatisch, ohne eigene Kopie der vier Zeilen. Eine einzelne Farb-Ausnahme (wie
beim Administrator-Button: Rot statt Akzent für "sensibler Bereich") überschreibt in der eigenen
Modifier-Klasse **nur** `color`, nie Hintergrund/Blur erneut.

Bewusst ausgenommen: `.chat-sidebar-nav-button` (ohne "-footer-") — die Chats-/Lernpfade-Bereiche
der Sidebar. Die haben einen eigenen, unabhängigen Look und sollen ihn behalten; nie versehentlich
in diese globale Regel hineinziehen (z. B. durch Umbenennen einer Klasse).

Gleiches Prinzip gilt für die Einträge im aufgeklappten "Mehr"-Flyout (`.chat-sidebar-footer-subnav-button`,
eigene Basisklasse, aber Geschwister-Konzept): deren Hover- **und** `.is-active`-Regel müssen exakt
denselben Look tragen wie oben (transparent + Blur + `--color-accent`, **keine** eigene getönte
Füllfläche à la `color-mix(...)`) — das war schon einmal auseinandergelaufen (`.is-active` hatte
eine Füllfläche, der Rest nicht) und sah dadurch "aktiver"/bunter aus als Einstellungen, obwohl
beide denselben Zustand meinten.

## Lernbereich-Architektur

Für alles unter `src/features/learn/` (v. a. `brain/`): [`dokumentation/README.md`](dokumentation/README.md)
zuerst lesen — beschreibt zwölf bindende Invarianten und wo sie im Code durchgesetzt werden.
