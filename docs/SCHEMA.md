# Datenschema — Stundenerfassung v2

Nur primitive Typen und ISO-8601-Datumsstrings. Damit ist dieselbe Struktur
ohne Anpassung als Swift-`Codable`-Struct nutzbar, falls die App später
nativ neu gebaut wird.

## Zeiteintrag (`eintraege`)

```json
{
  "id": "uuid-v4",
  "projektId": "us-58",
  "bereich": "kl",
  "datum": "2026-08-24",
  "minuten": 240,
  "von": "07:30",
  "bis": "12:00",
  "pause": 30,
  "notiz": "Baustellentermin Geländer",
  "quelle": "spanne",
  "angelegt": "2026-08-24T06:12:00.000Z",
  "geaendert": "2026-08-24T06:12:00.000Z",
  "geloescht": null
}
```

| Feld | Bedeutung |
|---|---|
| `projektId` | `us-<id>` aus untermStrich, `eig-<id>` für selbst angelegte, `alt-<id>` aus der v1-Migration |
| `bereich` | `kl` · `mvv` · `privat` |
| `minuten` | **führend** — `von`/`bis`/`pause` sind nur die Herleitung |
| `quelle` | `timer` · `spanne` · `dauer` · `schnell` · `manuell` · `migriert` |
| `geloescht` | Grabstein. Gesetzt = gelöscht. Der Datensatz bleibt, damit der OneDrive-Abgleich die Löschung auf andere Geräte überträgt statt den Eintrag zurückzuholen. |

**Warum `minuten` und nicht Dezimalstunden gespeichert wird:** Ganzzahlen summieren
sich exakt. 0,1 h ist im Binärformat nicht darstellbar — bei hundert Buchungen
weicht die Summe sonst sichtbar ab. Dezimal wird nur zur Ausgabe gerechnet.

## Projekt (`projekte`, nur selbst angelegte)

```json
{
  "id": "eig-a1b2c3d4e5f6",
  "quelle": "eigen",
  "bereich": "mvv",
  "nr": "UW-001",
  "name": "Umspannwerk Roche",
  "kuerzel": "UWR",
  "adresse": "Sandhofer Str. 116, 68305 Mannheim",
  "aktiv": true,
  "angelegt": "…", "geaendert": "…", "geloescht": null
}
```

Die kreativLABOR42-Projekte stehen **nicht** hier, sondern im Store
`kataloge` (siehe unten) — erzeugt von
`CoWork_OS/00_resources/scripts/zeiterfassung_projekte.py` aus der
untermStrich-REST-API.

Feldzuordnung untermStrich → App (Quelle: `M365/ustrich_Fachwissen.md`, Abschnitt 5):

| ustrich | App | Zweck |
|---|---|---|
| `project_number` | `nr` | Projektnummer |
| `project_name` | `name` | |
| `f_16` | `kuerzel` | **Kürzelsuche** („QGW" tippen) |
| `f_19` / `f_18` / `f_13` | `ort` / `kreis` / `land` | Kartenpin auf Ortsebene |
| `f_29` | `aktiv` | Projekt aktiv |
| `sum_hours` | `stundenUstrich` | Nur zur Anzeige |

## Projektlisten (`kataloge`)

Seit DB-Version 3 (25.08.2026). Ein Datensatz je Liste, Schlüssel `ustrich`
bzw. `mvv`:

```json
{
  "id": "mvv",
  "quelle": "onedrive",
  "etag": "\"{…},3\"",
  "anzahl": 612,
  "generiertAm": "2026-08-24",
  "geladenAm": "2026-08-25T15:24:00.000Z",
  "projekte": [ … ]
}
```

Davor lagen die Listen als `data/projects.*.json` im Repo und wurden von GitHub
Pages **öffentlich** ausgeliefert. Sie kommen jetzt aus
`OneDrive → Apps → Stundenerfassung → kataloge/` (`js/sync/kataloge.js`) oder aus
einer von Hand gewählten Datei. Der `etag` spart den Download, solange sich in
OneDrive nichts geändert hat — der Abgleich läuft alle zehn Minuten, die 170 KB
jedes Mal über Mobilfunk zu ziehen wäre Verschwendung.

## Extras (`extras`)

Zusatzinfos zu **beliebigen** Projekten, auch zu denen aus untermStrich —
liegen bewusst getrennt, damit ein Katalog-Update sie nicht überschreibt.

```json
{ "id": "us-58", "adresse": "…", "lat": 49.63, "lng": 8.35, "favorit": false, "geaendert": "…" }
```

## Konfiguration (`konfig`)

| Schlüssel | Inhalt |
|---|---|
| `timer` | `{ projektId, bereich, startIso, notiz }` oder `null` — **in der Datenbank, nicht im Speicher**, damit der Timer App-Neustart und Bildschirmsperre übersteht |
| `zuletzt` | Liste der zuletzt gebuchten Projekt-IDs (max. 8) |
| `letzterAbgleich` | Zeitstempel des letzten OneDrive-Abgleichs |
| `migrationV1` | Meldung über aus v1 übernommene Buchungen |

## OneDrive-Datei

`OneDrive → Apps → Stundenerfassung → stunden.json`

```json
{ "format": 2, "geschriebenAm": "…", "geraet": "…",
  "eintraege": [], "projekte": [], "extras": [] }
```

Abgleichsregel: pro Datensatz gewinnt der jüngere `geaendert`-Zeitstempel.
Grabsteine gewinnen dadurch genauso wie Änderungen.

## Migration v1 → v2

| v1 | v2 |
|---|---|
| `lifeArea: "kreativlabor42"` | `bereich: "kl"` |
| `date` | `datum` |
| `durationMinutes` | `minuten` |
| `note` | `notiz` |
| `createdAt` / `updatedAt` | `angelegt` / `geaendert` |
| — | `geloescht` (neu) |

Die alten Projekt-IDs waren Slugs (`qgw`, `fielmann-glinde`) und existieren im
ustrich-Katalog nicht. Sie werden als eigene Projekte mit Präfix `alt-` angelegt,
damit keine Buchung ihren Bezug verliert; in den Einstellungen erscheint ein
Hinweis zur einmaligen Durchsicht.
