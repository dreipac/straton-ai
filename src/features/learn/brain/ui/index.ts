/**
 * Anbindungsschicht zwischen Gehirn und Oberflaeche.
 *
 * Referenz: `straton-ui-spezifikation.md`, Kapitel 15 („Datenbedarf pro Bildschirm"). Diese
 * Tabelle ist verbindlich; jede Datei hier setzt genau einen ihrer Abschnitte um.
 *
 * | Bildschirm       | Datei                          |
 * |------------------|--------------------------------|
 * | Lernpfad-Kopf    | `pathView.ts`                  |
 * | Jetzt-Karte      | `pathView.ts`                  |
 * | Themenliste      | `pathView.ts`                  |
 * | Knoten-Panel     | `pathView.ts`                  |
 * | Lernsitzung      | `sessionView.ts`               |
 * | Abschlussbilanz  | `sessionView.ts`               |
 * | Wiederholen      | `reviewView.ts`                |
 * | Einsichten       | `insightsView.ts`              |
 *
 * Dazu zwei Ansichten, die Kapitel 15 nicht auffuehrt, weil sie keine Gehirnwerte zeigen, sondern
 * ueber sie verfuegen:
 *
 * | Ziel setzen (Kap. 7) | `goalView.ts`              |
 * | Quellen (Kap. 6)     | `materialView.ts`          |
 *
 * Alles hier ist rein: keine React-Komponenten, kein Netzwerk, keine eigene Zeitquelle. Damit
 * bleibt die Zuordnung aus Kapitel 15 pruefbar, ohne eine Oberflaeche zu rendern — und ein
 * Umbau des Layouts kann die Produktentscheidungen aus den Kapiteln 3.5, 4.7 und 4.8 nicht
 * versehentlich mitnehmen.
 *
 * Farben, Abstaende und Typografie stehen bewusst NICHT hier. Sie kommen aus dem bestehenden
 * Designsystem; `straton-prototyp.html` zeigt Verhalten und Zustandswechsel, ist aber kein
 * Styleguide.
 */

export * from './pathView'
export * from './sessionView'
export * from './reviewView'
export * from './insightsView'
export * from './goalView'
export * from './materialView'
