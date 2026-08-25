// Alle Zeitrechnungen der App an genau einer Stelle.
// In der alten Fassung war Dauer-Logik ueber fuenf Dateien verstreut und jede
// hatte ihr eigenes formatDuration() — vier fast identische Kopien.

/** Heutiges Datum als "JJJJ-MM-TT" in lokaler Zeit.
 *  NICHT toISOString().slice(0,10) verwenden: das rechnet nach UTC und liefert
 *  in deutscher Sommerzeit vor 02:00 Uhr den Vortag. Genau dieser Fehler steckte
 *  in der alten App an fuenf Stellen. */
export function heute() {
  return alsDatumString(new Date());
}

export function alsDatumString(d) {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${j}-${m}-${t}`;
}

export function ausDatumString(s) {
  const [j, m, t] = s.split("-").map(Number);
  return new Date(j, m - 1, t);
}

/** Aktuelle Uhrzeit als "HH:MM", auf 5 Minuten gerundet (Baustellen-Realitaet). */
export function jetztUhrzeit(rasterMinuten = 5) {
  const d = new Date();
  let min = d.getHours() * 60 + d.getMinutes();
  min = Math.round(min / rasterMinuten) * rasterMinuten;
  return minutenAlsUhrzeit(Math.min(min, 23 * 60 + 55));
}

export function minutenAlsUhrzeit(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "7:30" | "0730" | "7.30" | "7" -> Minuten seit Mitternacht, sonst null. */
export function uhrzeitAlsMinuten(text) {
  if (!text) return null;
  const s = String(text).trim().replace(/[.,]/g, ":");
  let m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  m = s.match(/^(\d{1,2})$/);
  if (m && +m[1] <= 23) return +m[1] * 60;
  // Ziffernfolge ohne Trenner: "730" = 7:30, "0730" und "1200" ebenso.
  // Die dreistellige Form fehlte zuerst -- genau so wird aber getippt.
  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m && +m[1] <= 23 && +m[2] <= 59) return +m[1] * 60 + +m[2];
  return null;
}

/** Dauer-Eingabe tolerant lesen: "1:30" "1,5" "1.5h" "90" "90min" "1h30".
 *  Bare Zahlen bis 24 gelten als Stunden, groessere als Minuten —
 *  "8" meint einen Arbeitstag, "90" meint anderthalb Stunden. */
export function dauerAlsMinuten(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  let m = s.match(/^(\d{1,2}):(\d{1,2})$/);            // 1:30
  if (m) return +m[1] * 60 + +m[2];

  m = s.match(/^(\d{1,2})h(\d{1,2})m?(?:in)?$/);       // 1h30
  if (m) return +m[1] * 60 + +m[2];

  m = s.match(/^(\d+(?:[.,]\d+)?)h(?:rs?|ours?)?$/);   // 1,5h
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);

  m = s.match(/^(\d+)m(?:in)?$/);                       // 90min
  if (m) return +m[1];

  m = s.match(/^(\d+(?:[.,]\d+)?)$/);                   // 1,5 | 90 | 8
  if (m) {
    const zahl = parseFloat(m[1].replace(",", "."));
    if (!Number.isInteger(zahl)) return Math.round(zahl * 60); // 1,5 = 90 min
    return zahl <= 24 ? zahl * 60 : zahl;                      // 8 = 8 h, 90 = 90 min
  }
  return null;
}

/** Von–Bis–Pause -> Minuten. Endet die Zeit vor dem Start, gilt sie als
 *  ueber Mitternacht (Nachtschicht/Bereitschaft), nicht als Fehler. */
export function spanneAlsMinuten(von, bis, pauseMinuten = 0) {
  const a = uhrzeitAlsMinuten(von);
  const b = uhrzeitAlsMinuten(bis);
  if (a === null || b === null) return null;
  let dauer = b - a;
  if (dauer < 0) dauer += 24 * 60;
  dauer -= Math.max(0, pauseMinuten || 0);
  return dauer > 0 ? dauer : null;
}

/** Dezimalstunden fuer Abrechnung und Excel — 90 min -> 1,5 */
export function alsDezimalstunden(minuten, stellen = 2) {
  const f = 10 ** stellen;
  return Math.round((minuten / 60) * f) / f;
}

/** Montag der Woche, in der das Datum liegt. */
export function wochenstart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const versatz = (x.getDay() + 6) % 7; // Montag = 0
  x.setDate(x.getDate() - versatz);
  return x;
}

/** ISO-8601-Kalenderwoche (die in Deutschland gilt). */
export function kalenderwoche(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const jahresstart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - jahresstart) / 86400000 + 1) / 7);
}

export function tageImMonat(jahr, monat) {
  return new Date(jahr, monat + 1, 0).getDate();
}

/** Wie viele Minuten laeuft der Timer schon? */
export function laufzeitMinuten(startIso) {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 60000));
}
