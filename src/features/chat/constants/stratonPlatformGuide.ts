/** Statische Straton-UI-Karte — nur verifizierte Funktionen; keine erfundenen Features. */

export function getStratonPlatformGuideInstruction(): string {
  return [
    'Straton AI — Plattform & Navigation (verbindlich bei Fragen zu Bedienung, Einstellungen, «wo finde ich …»):',
    '',
    '**Wahrheit zuerst:** Nur Features nennen, die unten explizit gelistet sind. Lieber «geht nicht» / «nicht verfügbar» als etwas erfinden.',
    '',
    '**Einstellungen öffnen**',
    '- Desktop: in der Chat-Sidebar **oben** auf **Einstellungen** (direkt unter «Neuer Chat»).',
    '- Mobile: Profil/Avatar oben → Profil-Sheet → gewünschter Menüpunkt.',
    '',
    '**Einstellungs-Bereiche (Menü links)**',
    '- **Konto:** Name, E-Mail, Profilbild; Abo-Plan; Verbrauch/Limits (Tokens, Bilder, Websuche, Thinking, Dateien).',
    '- **Einführung:** Freitext oder Fragebogen für KI-Kontext (Hobbys, Beruf, Ziele).',
    '- **Allgemein:** App-Sprache.',
    '- **Chat Einstellungen:** Emoji in KI-Antworten; kompakte Nachrichtenbox; Ordner in Desktop-Sidebar; persönlicher KI-Speicher; Auto-Löschen leerer Chats.',
    '- **Einladungen:** Geteilte Chats — Einladungen verwalten.',
    '- **Archiv:** Archivierte Chats wiederherstellen oder löschen.',
    '- **Personalisieren:** Theme (White/Dark/Pink Glass/Black); Sidebar-Skalierung; Akzentfarbe; Hover-Farbton; Message-Box-Farbton; Lernpfad-Titel-Farbe.',
    '- **Status:** System-/Fehlerstatus.',
    '- **Feedback:** Feedback ans Team senden.',
    '- **Straton:** App-Version.',
    '',
    '**In Personalisieren — NICHT als «Chat-Hintergrund ändern» bewerben**',
    '- Der **Chat-Hintergrund ist für Nutzer nicht frei einstellbar** (kein eigenes Bild, keine beliebige Farbe).',
    '- **Nicht** behaupten, man könne den Chat-Hintergrund wie Theme oder Akzentfarbe ändern.',
    '- Wenn gefragt: «Nein — den Chat-Hintergrund kannst du in Straton nicht selbst ändern.» Optional Theme unter Personalisieren (White/Dark/…).',
    '',
    '**Direkt im Chat (nicht in Einstellungen)**',
    '- **KI-Modus:** Leiste über der Nachrichtenbox — Smart Instant, Custom oder Thinking.',
    '- **Antwortmodus / Modell:** in der Chat-Leiste.',
    '- **Neuer Chat:** Sidebar oben «Neuer Chat» (Desktop) oder FAB (Mobile).',
    '- **Chat-Aktionen:** Rechtsklick/Long-Press auf Chat — umbenennen, archivieren, löschen, in Ordner verschieben.',
    '- **Ordner:** «+ Ordner»; Ordner Bearbeiten (Name + Farbe); Chat in Ordner verschieben.',
    '- **Lernpfade:** Sidebar «Lernpfade» (In Entwicklung) oder «Lernpfad erstellen» im Chat.',
    '',
    '**Typisch NICHT verfügbar — ehrlich ablehnen**',
    '- Chat-Hintergrund frei wählen; eigenes Wallpaper; Schriftgrösse im Chat; Benachrichtigungen in der App (falls nicht oben gelistet).',
    '- Einstellungen «unten in der Sidebar» — **falsch**, sie sind **oben**.',
    '',
    '**Antwort-Regeln**',
    '- Konkreter Pfad: «Einstellungen (Sidebar oben) → Personalisieren → Akzentfarbe».',
    '- Feature nicht in der Liste → «Das geht in Straton so nicht» — keine erfundenen Menüpunkte.',
    '- Keine Websuche für Straton-Bedienung.',
    '- Kurz, nummerierte Schritte.',
  ].join('\n')
}

const PLATFORM_NAV_PATTERNS: RegExp[] = [
  /\bwo\s+(kann|finde|stelle|ändere|schalte|aktiviere|deaktiviere|finde ich)\b/i,
  /\bwo\s+ist\b/i,
  /\bwie\s+(kann ich|ändere ich|stelle ich|aktiviere ich|deaktiviere ich|finde ich)\b/i,
  /\b(einstellung|einstellungen|menü|sidebar|profil)\b/i,
  /\b(straton|in der app|in straton|auf der plattform)\b/i,
  /\b(theme|dark\s*mode|heller?\s*modus|akzentfarbe|hintergrund|chat[\s-]?hintergrund)\b/i,
  /\b(ordner|archiv|einladung|abo|verbrauch|limit|guthaben|speicher)\b.*\b(einstell|find|wo|änder)/i,
  /\b(einstell|find|wo|änder).*\b(ordner|archiv|einladung|abo|verbrauch|emoji|sprache|konto)\b/i,
]

export function userMessageAsksStratonPlatformNavigation(text: string): boolean {
  const t = text.trim()
  if (t.length < 8) {
    return false
  }
  const looksLikeHowTo =
    /\b(wo|wie)\b/i.test(t) &&
    /\b(einstell|änder|umschalt|aktivier|deaktivier|finde|navigier|menü|kann ich)\b/i.test(t)
  if (looksLikeHowTo) {
    return true
  }
  return PLATFORM_NAV_PATTERNS.some((re) => re.test(t))
}

export function userMessageAsksChatBackgroundChange(text: string): boolean {
  return /\b(chat[\s-]?hintergrund|hintergrund.{0,30}chat|wallpaper|hintergrundbild)\b/i.test(text.trim())
}

export function buildStratonPlatformNavigationTurnBriefing(): string {
  return [
    'Straton-Bedienhilfe (verbindlich für diesen Turn):',
    '- Nur Features aus dem Plattform-Leitfaden — **nichts dazuerfinden**.',
    '- Einstellungen Desktop: Sidebar **oben** (unter Neuer Chat), **nicht unten**.',
    '- **Chat-Hintergrund:** Nutzer kann ihn **nicht** ändern → klar «Nein» sagen, nicht Anleitung erfinden.',
    '- Sonst: «Einstellungen → [Bereich] → [Option]» oder «im Chat: Leiste über der Eingabe».',
    '- Unbekanntes Feature → «Das ist in Straton nicht verfügbar».',
  ].join('\n')
}

export function buildChatBackgroundNotAvailableBriefing(): string {
  return [
    'Chat-Hintergrund (verbindlich):',
    '- In Straton kann der Nutzer den **Chat-Hintergrund nicht selbst ändern**.',
    '- Antworte klar mit Nein — keine Schritt-für-Schritt-Anleitung zu «Chat-Hintergrund» in den Einstellungen.',
    '- Optional: Theme (hell/dunkel) unter Einstellungen → Personalisieren — das ist **nicht** dasselbe wie Chat-Hintergrund.',
  ].join('\n')
}
