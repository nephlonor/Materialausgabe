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
4. Jeder Student braucht einen **Fine-grained Personal Access Token**:
   - https://github.com/settings/personal-access-tokens
   - Repository access: `nephlonor/materialausgabe`
   - Permissions: **Contents: Read and write**
   - Token in der App unter ⚙ → "GitHub Token" eintragen (wird nur lokal gespeichert).

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
