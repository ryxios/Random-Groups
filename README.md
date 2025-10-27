# Random Groups Planner

Eine SvelteKit-Anwendung zum Erstellen ausgewogener Lerngruppen mit Offline-Unterstützung. Alle Daten bleiben lokal im Browser und lassen sich nach Bedarf exportieren oder erneut gruppieren.

## Live-Demo

- [GitHub Pages – Random Groups Planner](https://ryxios.github.io/Random-Groups/)

## Funktionen

- **Klassenverwaltung:** Klassen lassen sich lokal über IndexedDB speichern, umbenennen und jederzeit wieder laden. Ein Dialog unterstützt das Anlegen neuer Klassen samt manueller Eingabe oder Import vorhandener Listen.
- **Flexible Datenerfassung:** Lernende können direkt in der Oberfläche hinzugefügt, editiert und entfernt werden. Pro Person stehen Notizen sowie Leistungsniveaus (hoch/mittel/unterstützend) zur Verfügung.
- **Beziehungsregeln:** Für jede Person lassen sich Beziehungen vom Typ „bevorzugt“, „vermeiden“ und „niemals“ pflegen. Beim Entfernen von Lernenden werden betroffene Regeln automatisch bereinigt.
- **Import & Export:** Klassen können als JSON oder CSV importiert beziehungsweise exportiert werden. Beim Import weist die App auf eventuelle Warnungen hin und normalisiert ältere Datenstrukturen.
- **Konfigurierbare Gruppierung:** Die Gruppierung läuft in einem Web Worker, berücksichtigt Leistungsbalance und Beziehungen und arbeitet entweder mit Ziel-Gruppengröße oder fester Gruppenanzahl. Konflikte und Warnungen werden im Ergebnis hervorgehoben.
- **Iteratives Neu-Gruppieren:** Über „Wiederholen“ lässt sich die Gruppierung mit den bestehenden Regeln erneut starten, um alternative Kombinationen zu erhalten.
- **Offline & PWA:** Die Anwendung ist als Progressive Web App konfiguriert und funktioniert auch ohne Netzverbindung.

## Entwicklung

```bash
npm install
npm run dev -- --open
```

## Linting & Typprüfung

```bash
npm run check
```

## Produktion

```bash
npm run build
npm run preview
```

Die PWA-Dateien (Service Worker & Manifest) werden beim Build automatisch erzeugt. Icons befinden sich im Ordner `static/`.
