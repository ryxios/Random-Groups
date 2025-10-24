# Random Groups Planner

Eine SvelteKit-Anwendung zum Erstellen ausgewogener Lerngruppen mit Offline-Unterstützung. Die App erlaubt das Importieren und Exportieren von Lerndaten (JSON/CSV), die Verwaltung von Beziehungen zwischen Lernenden sowie die lokale Speicherung kompletter Klassen per IndexedDB (Dexie).

## Funktionen

- Konfiguration nach Gruppengröße oder Gruppenanzahl
- Heuristische Gruppierung im Web Worker unter Berücksichtigung von Leistungsniveaus und Beziehungen
- Beziehungen „arbeitet gut mit …“ und „nicht zusammen mit …“
- Import/Export von Lernenden im JSON- oder CSV-Format (Papa Parse + zod-Validierung)
- Lokale Persistenz mehrerer Klassenprofile über Dexie/IndexedDB
- Offline-fähig dank PWA-Integration via `@vite-pwa/sveltekit`

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
