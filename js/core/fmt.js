// Ausgabeformate — deutsch, einheitlich, an einer Stelle.
import { ausDatumString, alsDezimalstunden } from "./time.js";

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** 90 -> "1:30 h" — die Schreibweise, in der auf dem Bau gesprochen wird. */
export function dauer(minuten) {
  const neg = minuten < 0;
  const m = Math.abs(Math.round(minuten));
  const s = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
  return neg ? "−" + s : s;
}

/** 90 -> "1,50" — fuer Abrechnung und Export. */
export function dezimal(minuten, stellen = 2) {
  return alsDezimalstunden(minuten, stellen).toFixed(stellen).replace(".", ",");
}

export function datumKurz(datumString) {
  const d = ausDatumString(datumString);
  return `${WOCHENTAG[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function datumLang(datumString) {
  const d = ausDatumString(datumString);
  return `${WOCHENTAG[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

export function datumDeutsch(datumString) {
  const [j, m, t] = datumString.split("-");
  return `${t}.${m}.${j}`;
}

/** Projekt als eine Zeile: "1909 · QGW — Stadtquartier _ Worms-Hochheim" */
export function projektZeile(p) {
  if (!p) return "Unbekanntes Projekt";
  const kopf = [p.nr, p.kuerzel].filter(Boolean).join(" · ");
  return kopf ? `${kopf} — ${p.name}` : p.name;
}

export function projektKurz(p) {
  if (!p) return "?";
  return p.kuerzel || p.nr || p.name;
}

/** "1 Buchung" statt "1 Buchungen". */
export function anzahl(n, einzahl, mehrzahl) {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

export const KATEGORIEN = {
  urlaub: "Urlaub",
  krank: "Krank",
  feiertag: "Feiertag",
  gleitzeit: "Gleitzeit",
  sonstiges: "Abwesend",
};

export const kategorieLabel = (k) => KATEGORIEN[k] || "Abwesend";

/** Kurzzeichen für die Kalenderzelle — ein Buchstabe statt einer Farbe. */
export const kategorieZeichen = (k) =>
  ({ urlaub: "U", krank: "K", feiertag: "F", gleitzeit: "G", sonstiges: "A" }[k] || "A");
