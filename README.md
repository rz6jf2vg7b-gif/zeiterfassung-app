# Stundenerfassung — kreativLABOR42

PWA zum Buchen von Arbeitsstunden auf Projekte. Läuft im Browser und lässt sich
auf iPhone/iPad über „Zum Home-Bildschirm" wie eine App installieren.

**Live:** https://rz6jf2vg7b-gif.github.io/zeiterfassung-app/

## Was sie kann

- **Drei Wege zu erfassen** — Schnellkacheln (0:15 bis 8:00), Von–Bis mit Pause,
  freie Dauereingabe („1:30", „1,5", „90", „1h30", „730" = 7:30). Dazu ein Timer,
  der weiterläuft, während die App geschlossen ist.
- **Kürzelsuche** über 778 Projekte — 157 aus untermStrich (kreativLABOR42),
  612 aus der MVV-Gruppenprojektliste TV.D.3, dazu 9 Sammelposten.
  „UW3" tippen genügt; auch die Auftragsnummer wird durchsucht.
- **Sammelposten** für Tätigkeiten ohne Projekt: NOP bei MVV (Jour Fixe, Schulung,
  Gremien) und Akquise/Büro bei kreativLABOR42. Nie abrechenbar, eigene Zeile.
- **Abwesenheit** — Urlaub, Krank, Gleitzeit über einen Zeitraum; je Arbeitstag ein
  Eintrag mit den Soll-Stunden, Wochenenden und Feiertage übersprungen.
- **Feiertage** aller 16 Bundesländer, berechnet statt nachgeschlagen, mehrere
  Länder gleichzeitig wählbar.
- **Kalender** mit Stunden je Tag, Feiertagen, Abwesenheit und schraffierten Lücken
  (vergangene Arbeitstage ohne Buchung).
- **Auswertung** — Lebensbereiche immer getrennt nebeneinander, dazu Aufschlüsselung
  nach Projekt, Bereich, Monat oder Abrechenbarkeit.
- **Export** als Excel (21 Spalten, Dezimalstunden, Auftragsnummer, Abrechenbarkeit,
  Autofilter, Summenblatt) und PDF-Stundennachweis.
- **Outlook-Kalender** in beide Richtungen: Termine als Buchungsvorschlag lesen —
  an jedem Datum, nicht nur heute (Kalender → Tag antippen) — und Urlaub als
  Ganztagestermin schreiben. Der iOS-Kalender selbst ist für Web-Apps gesperrt,
  über Outlook landet es trotzdem auf dem iPhone.
- **Karte** aller Projekte mit Ortsangabe, Navigation über Apple/Google Maps.
- **OneDrive-Abgleich** zwischen iPhone, iPad und Mac; alternativ Sicherung als Datei.
- **Konten je Lebensbereich** — Geschäftsjahr, Sollstunden, Arbeitstage,
  Urlaubsanspruch und Anfangsbestand gelten getrennt. Die MVV rechnet vom 01.10.
  bis 30.09. mit 30 Urlaubstagen, kreativLABOR42 kann im Kalenderjahr mit
  anderen Arbeitstagen laufen. Je Bereich ein eigener Block mit Überstundensaldo
  und Urlaubskonto.
- **Geschäftsjahr-Abschluss** — bis zum Ende müssen alle Stunden gebucht sein,
  sonst lassen sich die Projekte nicht abrechnen. Die App zeigt die offenen
  Arbeitstage (antippen trägt nach), zählt die Tage bis zum Buchungsschluss und
  warnt ab acht Wochen vorher auf der Heute-Ansicht.
- **Diagramme** — Verlauf je Tag, Kalenderwoche oder Monat mit Soll-Linie, dazu
  der Anteil der Lebensbereiche als Balken. Reines SVG, monochrom, kein
  Diagrammpaket.
- **Automatischer Abgleich** — beim Start, verzögert nach jeder Änderung, beim
  Zurückkehren zur App und alle zehn Minuten im Betrieb. Von Hand abzugleichen
  heißt, es zu vergessen.

## Wie die Konten rechnen

| | Zählt zum Soll | Wird gutgeschrieben | Wirkung auf den Saldo |
|---|---|---|---|
| Feiertag | nein | — | neutral |
| Urlaub | ja | ja | neutral |
| Krank | ja | ja | neutral |
| **Gleitzeit** | ja | **nein** | **−1 Tagessoll** |

Die letzte Zeile ist der Zweck: Abfeiern heißt, das Überstundenkonto zu
verbrauchen. Der Kontostand rechnet bis einschließlich **gestern** — sonst zeigt
er jeden Morgen ein Minus in Höhe des Tagessolls.

Alle Werte der Tabelle gelten **je Lebensbereich**. Sowohl der Saldo als auch die
Prüfung auf offene Tage beginnen frühestens beim ersten Eintrag des jeweiligen
Bereichs in dieser App. Sonst meldet eine frische Installation im August
das halbe Geschäftsjahr als „nicht gebucht", obwohl die Stunden im MVV-System
längst stehen. Wer weiter zurück rechnen will, setzt Startdatum und
Anfangsbestand unter *Mehr*.

## Gestaltung

Monochrom, ohne Akzentfarbe. Hierarchie entsteht über Schriftgewicht, Größe und
Haarlinien — die Sprache technischer Zeichnungen. Alle Farbwerte stehen
ausschließlich in `css/tokens.css`.

Ab 768 px Breite (iPad) wandert die Navigation von unten nach links in eine
Seitenleiste, Dialoge erscheinen mittig statt von unten, das Kalenderraster wird
größer. Reines CSS — dieselbe Struktur, keine zweite Fassung zu pflegen.

## Aufbau

```
js/core/    Zeitrechnung · Feiertage · Konten · Geschäftsjahr · Zustand · Router
js/data/    IndexedDB · Repository · Projektkatalog · Sammelposten
js/ui/      Sheet · Projektsuche · Erfassung · Abwesenheit · Konten · Diagramm
            Terminvorschläge · Liste · Karte
js/views/   Heute · Kalender · Projekte · Auswertung · Mehr
js/sync/    Microsoft-Anmeldung (PKCE) · OneDrive · Outlook · Abgleich · Automatik
js/export/  Excel · PDF · Sicherung · Dateiausgabe
```

Kein Build-Schritt, keine Abhängigkeiten außer den vier Bibliotheken unter
`vendor/`. Push auf `main` veröffentlicht über GitHub Pages.

## Projektkataloge aktualisieren

kreativLABOR42 aus der untermStrich-REST-API (Zugangsdaten aus dem macOS-Keychain):

```bash
python3 ~/Library/CloudStorage/OneDrive-kreativLABOR42/CoWork_OS/00_resources/scripts/zeiterfassung_projekte.py
```

MVV aus der Gruppenprojektliste TV.D.3 (Export nach
`02_AREAS/MVV_Netze/` legen, Dateiname im Skript anpassen oder `--quelle` nutzen):

```bash
python3 ~/Library/CloudStorage/OneDrive-kreativLABOR42/CoWork_OS/00_resources/scripts/zeiterfassung_mvv.py
```

Beide schreiben nach `OneDrive → Apps → Stundenerfassung → kataloge/`.
**Nicht ins Repo** — dort lagen sie bis zum 25.08.2026 und wurden von GitHub
Pages öffentlich mit ausgeliefert (612 MVV-Projekte samt Auftragsnummer,
Auftraggeber und Projektleiter, 157 kreativLABOR42-Kundenprojekte). Projektdaten
gehören ausschließlich auf das Gerät oder in Steffens OneDrive.

Die App holt die Listen beim Abgleich über Graph (`js/sync/kataloge.js`) und legt
sie lokal in IndexedDB ab. Ohne Anmeldung geht der Weg über
**Mehr → Projektlisten → Aus Datei laden**. Ein Commit ist nicht mehr nötig —
neue Listen sind nach dem nächsten Abgleich auf allen Geräten da.

## OneDrive-Abgleich einrichten

Einmalig im Azure-Portal → App-Registrierungen → **CoWork_OS Claude** →
Authentifizierung → Plattform **Einzelseitenanwendung (SPA)** hinzufügen mit
Umleitungs-URI `https://rz6jf2vg7b-gif.github.io/zeiterfassung-app/`.
Die Berechtigungen `Files.ReadWrite.All` und `Calendars.ReadWrite` sind bereits erteilt.

Ablage der Daten: `OneDrive → Apps → Stundenerfassung → stunden.json`,
Projektlisten daneben in `kataloge/`.

Details zum Datenmodell: [docs/SCHEMA.md](docs/SCHEMA.md)
