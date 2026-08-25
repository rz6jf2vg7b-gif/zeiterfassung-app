// Fachliche Datenzugriffe. Der Rest der App kennt nur diese Funktionen,
// nie IndexedDB direkt — dadurch bleibt ein Wechsel der Ablage lokal.
import * as db from "./db.js";
import { heute } from "../core/time.js";

const jetzt = () => new Date().toISOString();
const neueId = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : "e-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// ---------- Einstellungen ------------------------------------------------

/** Was je Lebensbereich getrennt gilt.
 *  Geschäftsjahr, Urlaubsanspruch und Sollstunden sind bei der MVV andere als
 *  in der Selbstständigkeit — sie zusammenzufassen würde beides verfälschen. */
export const STANDARD_BEREICH = {
  kontoFuehren: false,        // Stunden- und Urlaubskonto für diesen Bereich führen
  geschaeftsjahrStart: 1,     // 1 = Kalenderjahr, 10 = 01.10.–30.09.
  sollStundenTag: 8,
  arbeitstage: [1, 2, 3, 4, 5],   // 1 = Montag … 7 = Sonntag
  saldoStart: null,           // null = ab dem ersten Eintrag dieses Bereichs
  saldoAnfang: 0,             // Überstunden, die vor saldoStart schon bestanden
  urlaubstage: 0,
  urlaubUebertrag: 0,
};

export const STANDARD_EINSTELLUNGEN = {
  // Gilt übergreifend — Feiertage hängen am Wohnort, nicht am Auftraggeber
  bundeslaender: ["HE", "BW"],
  lueckenwarnung: true,
  abrechenbarVorgabe: true,
  kalenderLesen: false,
  kalenderSchreiben: false,
  kalenderId: null,
  autoAbgleich: true,

  bereiche: {
    kl:     { ...STANDARD_BEREICH },
    // MVV: Geschäftsjahr 01.10.–30.09., Überstunden und Urlaub entstehen hier
    mvv:    { ...STANDARD_BEREICH, kontoFuehren: true, geschaeftsjahrStart: 10, urlaubstage: 30 },
    privat: { ...STANDARD_BEREICH },
  },
};

/** Alte flache Einstellungen in die Bereichsstruktur überführen.
 *  Bis v3.1 galten Geschäftsjahr, Soll und Urlaub global für genau einen
 *  Bereich (saldoBereich). Die Werte wandern unverändert dorthin. */
function migriereEinstellungen(gespeichert) {
  if (!gespeichert || gespeichert.bereiche) return gespeichert;
  const ziel = gespeichert.saldoBereich || "mvv";
  const bereiche = {};
  for (const id of Object.keys(STANDARD_EINSTELLUNGEN.bereiche)) {
    bereiche[id] = { ...STANDARD_EINSTELLUNGEN.bereiche[id] };
  }
  bereiche[ziel] = {
    ...bereiche[ziel],
    kontoFuehren: true,
    geschaeftsjahrStart: gespeichert.geschaeftsjahrStart ?? bereiche[ziel].geschaeftsjahrStart,
    sollStundenTag: gespeichert.sollStundenTag ?? 8,
    arbeitstage: gespeichert.arbeitstage ?? [1, 2, 3, 4, 5],
    saldoStart: gespeichert.saldoStart ?? null,
    saldoAnfang: gespeichert.saldoAnfang ?? 0,
    urlaubstage: gespeichert.urlaubstage ?? 30,
    urlaubUebertrag: gespeichert.urlaubUebertrag ?? 0,
  };
  return { ...gespeichert, bereiche };
}

export async function einstellungen() {
  const gespeichert = migriereEinstellungen(await konfig("einstellungen", {}));
  const bereiche = {};
  for (const [id, standard] of Object.entries(STANDARD_EINSTELLUNGEN.bereiche)) {
    bereiche[id] = { ...STANDARD_BEREICH, ...standard, ...(gespeichert.bereiche?.[id] || {}) };
  }
  return { ...STANDARD_EINSTELLUNGEN, ...gespeichert, bereiche };
}

export async function setzeEinstellung(schluessel, wert) {
  const alle = migriereEinstellungen(await konfig("einstellungen", {})) || {};
  alle[schluessel] = wert;
  await setzeKonfig("einstellungen", alle);
  return alle;
}

/** Einen einzelnen Wert eines Bereichs setzen. */
export async function setzeBereichEinstellung(bereichId, schluessel, wert) {
  const alle = migriereEinstellungen(await konfig("einstellungen", {})) || {};
  alle.bereiche = alle.bereiche || {};
  alle.bereiche[bereichId] = { ...(alle.bereiche[bereichId] || {}), [schluessel]: wert };
  await setzeKonfig("einstellungen", alle);
  return alle;
}

// ---------- Einträge -----------------------------------------------------

/** Gelöschte Einträge bleiben als Grabstein liegen (geloescht = Zeitstempel).
 *  Ohne das würde der OneDrive-Abgleich einen auf Gerät A gelöschten Eintrag
 *  von Gerät B wieder einspielen — der klassische Sync-Zombie. */
export async function eintraege({ mitGeloeschten = false } = {}) {
  const alle = await db.alle(db.STORE_EINTRAEGE);
  return mitGeloeschten ? alle : alle.filter((e) => !e.geloescht);
}

export function neuerEintrag(daten) {
  const ts = jetzt();
  return {
    id: neueId(),
    art: daten.art || "buchung",           // "buchung" | "abwesenheit"
    kategorie: daten.kategorie || null,    // bei Abwesenheit: urlaub | krank | sonstiges
    projektId: daten.projektId || null,
    bereich: daten.bereich || "kl",
    datum: daten.datum || heute(),
    minuten: Math.max(0, Math.round(daten.minuten || 0)),
    von: daten.von || null,
    bis: daten.bis || null,
    pause: daten.pause || 0,
    notiz: (daten.notiz || "").trim() || null,
    abrechenbar: daten.abrechenbar ?? null,
    quelle: daten.quelle || "manuell",
    kalenderId: daten.kalenderId || null,  // Gegenstück im Outlook-Kalender
    angelegt: ts,
    geaendert: ts,
    geloescht: null,
  };
}

export async function speichereEintrag(eintrag) {
  eintrag.geaendert = jetzt();
  await db.schreiben(db.STORE_EINTRAEGE, eintrag);
  if (eintrag.art === "buchung" && eintrag.projektId) await merkeProjekt(eintrag.projektId);
  return eintrag;
}

export const speichereEintraege = (liste) => db.schreibeViele(db.STORE_EINTRAEGE, liste);

export async function loescheEintrag(id) {
  const e = await db.holen(db.STORE_EINTRAEGE, id);
  if (!e) return null;
  e.geloescht = jetzt();
  e.geaendert = e.geloescht;
  await db.schreiben(db.STORE_EINTRAEGE, e);
  return e;
}

export async function stelleEintragWiederHer(id) {
  const e = await db.holen(db.STORE_EINTRAEGE, id);
  if (!e) return;
  e.geloescht = null;
  e.geaendert = jetzt();
  await db.schreiben(db.STORE_EINTRAEGE, e);
}

// ---------- Eigene Projekte ---------------------------------------------

export async function eigeneProjekte() {
  const alle = await db.alle(db.STORE_PROJEKTE);
  return alle.filter((p) => !p.geloescht);
}

export function neuesProjekt({ bereich, name, nr = null, kuerzel = null, adresse = null, sammelposten = false }) {
  const ts = jetzt();
  return {
    id: "eig-" + neueId().slice(0, 12),
    quelle: "eigen",
    bereich,
    nr: nr || null,
    name: name.trim(),
    kuerzel: (kuerzel || "").trim().toUpperCase() || null,
    adresse: adresse || null,
    sammelposten,
    aktiv: true,
    angelegt: ts, geaendert: ts, geloescht: null,
  };
}

export async function speichereProjekt(p) {
  p.geaendert = jetzt();
  await db.schreiben(db.STORE_PROJEKTE, p);
  return p;
}

export async function loescheProjekt(id) {
  const p = await db.holen(db.STORE_PROJEKTE, id);
  if (!p) return;
  p.geloescht = jetzt();
  p.geaendert = p.geloescht;
  await db.schreiben(db.STORE_PROJEKTE, p);
}

export const speichereProjekte = (liste) => db.schreibeViele(db.STORE_PROJEKTE, liste);

// ---------- Extras (Adresse, Koordinaten, Favorit) ------------------------
// Gilt für Katalogprojekte genauso wie für eigene: untermStrich und die
// MVV-Liste führen keine Straßenadresse, deshalb liegt sie hier daneben.

export const alleExtras = () => db.alle(db.STORE_EXTRAS);

export async function setzeExtra(projektId, felder) {
  const vorhanden = (await db.holen(db.STORE_EXTRAS, projektId)) || { id: projektId };
  const neu = { ...vorhanden, ...felder, geaendert: jetzt() };
  await db.schreiben(db.STORE_EXTRAS, neu);
  return neu;
}

// ---------- Projektkataloge ----------------------------------------------
// Die Listen aus untermStrich und der MVV-Gruppenprojektliste. Sie lagen frueher
// als data/projects.*.json neben der App und waren damit fuer jeden im Netz
// lesbar — Auftragsnummern, Auftraggeber, Projektleiter. Seit 25.08.2026 liegen
// sie ausschliesslich hier im Geraet und kommen aus Steffens OneDrive oder aus
// einer von Hand gewaehlten Datei. Nie wieder aus dem ausgelieferten Web-Ordner.

export const katalogHolen = (id) => db.holen(db.STORE_KATALOGE, id);
export const katalogeAlle = () => db.alle(db.STORE_KATALOGE);
export const katalogLoeschen = (id) => db.entfernen(db.STORE_KATALOGE, id);

export function katalogSchreiben(id, inhalt, { quelle, etag = null }) {
  return db.schreiben(db.STORE_KATALOGE, {
    id,
    quelle,                                   // "onedrive" oder "datei"
    etag,                                     // spart den Download, wenn unveraendert
    anzahl: inhalt?.anzahl ?? (inhalt?.projekte || []).length,
    generiertAm: inhalt?.generiertAm || null, // Stand der Liste selbst
    geladenAm: jetzt(),                       // wann dieses Geraet sie geholt hat
    projekte: inhalt?.projekte || [],
  });
}

// ---------- Konfiguration ------------------------------------------------

export async function konfig(key, standard = null) {
  const w = await db.holen(db.STORE_KONFIG, key);
  return w ? w.value : standard;
}

export const setzeKonfig = (key, value) => db.schreiben(db.STORE_KONFIG, { key, value });
export const alleKonfig = () => db.alle(db.STORE_KONFIG);

/** Zuletzt gebuchte Projekte — sie stehen bei der Erfassung ganz oben.
 *  Das spart in der Praxis die meisten Tipps: man bucht Tag für Tag
 *  auf dieselben zwei, drei Baustellen. */
export async function merkeProjekt(projektId) {
  const liste = await konfig("zuletzt", []);
  const neu = [projektId, ...liste.filter((x) => x !== projektId)].slice(0, 8);
  await setzeKonfig("zuletzt", neu);
}

export const zuletztGenutzt = () => konfig("zuletzt", []);
