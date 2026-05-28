# Materialausgabe

Mobile Webapp (Dark Mode) für Studenten zum Verbuchen von Materialbezügen.
Buchungen werden als JSON-Datei (`data/bookings.json`) im Repository gespeichert.

## Features

- Profil mit Vor-/Nachname, ID-Person, E-Mail, Jahreskurs (lokal gespeichert)
- Material-Katalog mit Mehrfachauswahl und Stückzahlen
- Live-Summenanzeige in CHF
- **Buchen** schreibt direkt via GitHub API in `data/bookings.json`
- **Buchungsliste** zeigt alle Buchungen aller Studenten (read-only via Raw-URL, ohne Rate-Limit)
- **Buchungen anpassen**: nur eigene Buchungen, sortiert nach Datum, mit Bearbeiten/Löschen

## Setup

1. **Repo public** machen (damit der anonyme Lese-Zugriff via `raw.githubusercontent.com` funktioniert).
2. **GitHub Pages** aktivieren: Settings → Pages → Source: *GitHub Actions*.
3. Auf `main` pushen — der Workflow `.github/workflows/pages.yml` deployed automatisch.
4. **Einmalig** einen Fine-grained PAT erstellen und als Repository-Secret hinterlegen:
   - https://github.com/settings/personal-access-tokens → neuer Token
   - Repository access: nur `nephlonor/materialausgabe`
   - Permissions: **Contents: Read and write**
   - Den Token-String in Settings → Secrets and variables → Actions → New repository secret
   - Name: `MA_GITHUB_TOKEN`, Value: der erzeugte PAT
   - Danach den Pages-Workflow neu starten (Actions → "Deploy to GitHub Pages" → Run workflow)
5. Studenten öffnen die Seite, geben ihr Profil ein und können sofort buchen — kein eigener Token nötig.
   Jeder Browser bekommt eine automatisch generierte Geräte-ID (in `localStorage`); damit werden „eigene" Buchungen identifiziert.

> **Hinweis zur Sicherheit:** Der Token wird beim Build in das deployte JS injiziert und ist im Browser einsehbar. Das Repo wird nicht damit kontaminiert (Secret-Scanning bleibt sauber), aber jeder der die Seite besucht, könnte den Token aus dem DevTools extrahieren und damit `data/bookings.json` direkt manipulieren. Token regelmässig rotieren oder bei Bedarf widerrufen.

## Struktur

```
index.html              # Entry
css/style.css           # Dark-Mode UI
js/materials.js         # Material-Katalog (Preise)
js/github.js            # GitHub Contents API
js/app.js               # State + Views
data/bookings.json      # Datenstore
.github/workflows/      # Pages-Deploy
```

## Buchungs-Datenmodell

```json
{
  "id": "abc123",
  "createdAt": "2026-05-28T10:00:00.000Z",
  "firstName": "...", "lastName": "...",
  "idPerson": "...", "email": "...", "jahreskurs": "...",
  "items": [
    { "materialId": "gk-80x55-1.0", "group": "...", "label": "1 mm", "unitPrice": 1.50, "qty": 2 }
  ],
  "total": 3.00
}
```
