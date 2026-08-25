// Zentraler Zustand. Einzige Schreibstelle der App — Views lesen und melden
// Absichten, sie fassen die Daten nicht selbst an.
import * as repo from "../data/repo.js";
import * as katalog from "../data/catalog.js";
import { feiertageImZeitraum } from "./feiertage.js";
import { wirdGutgeschrieben, bereichWerte, kontoBereiche } from "./konten.js";
import { heute, alsDatumString, ausDatumString } from "./time.js";

const zuhoerer = new Set();

export const zustand = {
  bereit: false,
  eintraege: [],
  einstellungen: { ...repo.STANDARD_EINSTELLUNGEN },
  timer: null,
  zuletzt: [],
  kalender: { jahr: new Date().getFullYear(), monat: new Date().getMonth() },
  auswertung: { zeitraum: "monat", bereich: null, gruppierung: "projekt" },
};

export function abonnieren(fn) {
  zuhoerer.add(fn);
  return () => zuhoerer.delete(fn);
}

export function melden() {
  for (const fn of zuhoerer) fn(zustand);
}

export async function starten() {
  await katalog.laden();
  const [eintraege, einstellungen, timer, zuletzt] = await Promise.all([
    repo.eintraege(),
    repo.einstellungen(),
    repo.konfig("timer", null),
    repo.zuletztGenutzt(),
  ]);
  Object.assign(zustand, { eintraege, einstellungen, timer, zuletzt, bereit: true });
  melden();
}

async function nachladen() {
  zustand.eintraege = await repo.eintraege();
  zustand.zuletzt = await repo.zuletztGenutzt();
  melden();
}

// ---------- Einträge -----------------------------------------------------

export async function eintragAnlegen(daten) {
  const e = await repo.speichereEintrag(repo.neuerEintrag(daten));
  await nachladen();
  return e;
}

export async function eintragAendern(eintrag) {
  await repo.speichereEintrag(eintrag);
  await nachladen();
}

export async function eintragLoeschen(id) {
  const e = await repo.loescheEintrag(id);
  await nachladen();
  return e;
}

export async function eintragZurueckholen(id) {
  await repo.stelleEintragWiederHer(id);
  await nachladen();
}

/** Abwesenheit über einen Zeitraum: legt je Arbeitstag einen Eintrag an.
 *  Feiertage und Wochenenden werden übersprungen — an denen hat man keinen
 *  Urlaub, das würde nur die Urlaubstage falsch hochzählen. */
export async function abwesenheitAnlegen({ kategorie, von, bis, bereich, notiz }) {
  const werte = bereichWerte(zustand.einstellungen, bereich || "mvv");
  const feiertage = feiertageDerZeitspanne(von, bis);
  const angelegt = [];

  for (let d = ausDatumString(von); alsDatumString(d) <= bis; d.setDate(d.getDate() + 1)) {
    const datum = alsDatumString(d);
    const wochentag = d.getDay() === 0 ? 7 : d.getDay();
    if (!werte.arbeitstage.includes(wochentag)) continue;
    if (feiertage.has(datum)) continue;

    // Gleitzeit wird nicht gutgeschrieben -- an einem Abfeiertag wurde nichts
    // geleistet. Der Eintrag markiert den Tag trotzdem, damit er nicht als
    // Luecke gilt; er zaehlt nur null Stunden.
    angelegt.push(repo.neuerEintrag({
      art: "abwesenheit", kategorie, bereich: bereich || "mvv",
      datum,
      minuten: wirdGutgeschrieben(kategorie) ? Math.round(werte.sollStundenTag * 60) : 0,
      notiz, quelle: "abwesenheit",
    }));
  }

  if (angelegt.length) await repo.speichereEintraege(angelegt);
  await nachladen();
  return angelegt;
}

/** Arbeitstage eines Bereichs im Zeitraum -- fuer die Vorschau beim Urlaub. */
export function arbeitstageZaehlen(von, bis, bereich) {
  if (!von || !bis || bis < von) return 0;
  const werte = bereichWerte(zustand.einstellungen, bereich);
  const feiertage = feiertageDerZeitspanne(von, bis);
  let n = 0;
  for (let d = ausDatumString(von); alsDatumString(d) <= bis; d.setDate(d.getDate() + 1)) {
    const datum = alsDatumString(d);
    const wt = d.getDay() === 0 ? 7 : d.getDay();
    if (werte.arbeitstage.includes(wt) && !feiertage.has(datum)) n += 1;
  }
  return n;
}

// ---------- Feiertage ----------------------------------------------------

export function feiertageDerZeitspanne(von, bis) {
  return feiertageImZeitraum(von, bis, zustand.einstellungen.bundeslaender || []);
}

export function feiertageDesMonats(jahr, monat) {
  const von = `${jahr}-${String(monat + 1).padStart(2, "0")}-01`;
  const bis = `${jahr}-${String(monat + 1).padStart(2, "0")}-31`;
  return feiertageDerZeitspanne(von, bis);
}

/** Ist der Tag fuer diesen Bereich ein Arbeitstag (Werktag laut Einstellung,
 *  kein Feiertag)? */
export function istArbeitstag(datum, bereich, feiertage = null) {
  const werte = bereichWerte(zustand.einstellungen, bereich);
  const d = ausDatumString(datum);
  const wochentag = d.getDay() === 0 ? 7 : d.getDay();
  if (!werte.arbeitstage.includes(wochentag)) return false;
  const ft = feiertage || feiertageDerZeitspanne(datum, datum);
  return !ft.has(datum);
}

export const kontoBereicheDerApp = () => kontoBereiche(zustand.einstellungen);

// ---------- Timer --------------------------------------------------------
// Der Startzeitpunkt liegt in der Datenbank, nicht in einer laufenden Variable.
// Dadurch überlebt der Timer App-Wechsel, Bildschirmsperre und Neustart.

export async function timerStarten(projektId, bereich, notiz = null) {
  zustand.timer = { projektId, bereich, startIso: new Date().toISOString(), notiz };
  await repo.setzeKonfig("timer", zustand.timer);
  melden();
}

export async function timerAbbrechen() {
  zustand.timer = null;
  await repo.setzeKonfig("timer", null);
  melden();
}

// ---------- Einstellungen ------------------------------------------------

export async function einstellungSetzen(schluessel, wert) {
  await repo.setzeEinstellung(schluessel, wert);
  zustand.einstellungen = await repo.einstellungen();
  melden();
}

export async function bereichEinstellungSetzen(bereichId, schluessel, wert) {
  await repo.setzeBereichEinstellung(bereichId, schluessel, wert);
  zustand.einstellungen = await repo.einstellungen();
  melden();
}

export async function projekteNachladen() {
  await katalog.laden();
  melden();
}
