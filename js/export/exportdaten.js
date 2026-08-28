// Aufbereitung der Buchungen für die Ausgabe — gemeinsam für PDF und Excel.
//
// Hier wird aus rohen Einträgen das, was auf dem Papier steht: Summen je
// Projekt, Summen je Monat, Kennzahlen, und erst zuletzt die Einzelzeilen.
// Getrennt von der Zeichenschicht, damit beide Ausgaben garantiert dieselben
// Zahlen zeigen -- vorher rechnete jede für sich, und schon die Reihenfolge
// der Projekte konnte auseinanderlaufen.
import * as katalog from "../data/catalog.js";
import * as fmt from "../core/fmt.js";

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const alsDatum = (iso) => {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j, m - 1, t);     // lokale Mitternacht, sonst hängt Excel eine Uhrzeit an
};

function kalenderwoche(iso) {
  const d = alsDatum(iso);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  return Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

/** @param eintraege  bereits auf Zeitraum UND Lebensbereich gefiltert
 *  @param opts { bereich, von, bis, erstelltAm } */
export function aufbereiten(eintraege, { bereich, von, bis }) {
  const sortiert = eintraege.slice()
    .filter((e) => e.art !== "abwesenheit")
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""));

  const gesamtMinuten = sortiert.reduce((s, e) => s + e.minuten, 0);
  const abrechenbarMinuten = sortiert.filter((e) => e.abrechenbar !== false)
    .reduce((s, e) => s + e.minuten, 0);

  // ---- je Projekt
  const proProjekt = new Map();
  for (const e of sortiert) {
    const p = katalog.projekt(e.projektId);
    const g = proProjekt.get(e.projektId) || {
      // Eigene Projekte aus der alten Fassung tragen dieselbe Zeichenkette in
      // Nummer und Kürzel -- doppelt gedruckt sieht das nach Fehler aus.
      nr: p?.nr && p.nr !== p.kuerzel ? p.nr : "",
      kuerzel: p?.kuerzel || "",
      name: p?.name || katalog.fehlendesProjektText(e.projektId),
      marke: p?.kuerzel || p?.nr || "",
      auftrag: p?.auftrag || "",
      buchungen: 0, minuten: 0,
    };
    g.buchungen += 1; g.minuten += e.minuten;
    proProjekt.set(e.projektId, g);
  }
  const projekte = [...proProjekt.values()]
    .map((g) => ({ ...g, stunden: g.minuten / 60 }))
    .sort((a, b) => b.minuten - a.minuten);

  // ---- je Monat
  const proMonat = new Map();
  for (const e of sortiert) {
    const k = e.datum.slice(0, 7);
    const g = proMonat.get(k) || {
      label: `${fmt.MONATE[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`, buchungen: 0, minuten: 0,
    };
    g.buchungen += 1; g.minuten += e.minuten;
    proMonat.set(k, g);
  }
  const monate = [...proMonat.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, g]) => ({ ...g, stunden: g.minuten / 60 }));

  // ---- Einzelzeilen
  let letzterTag = null;
  const zeilen = sortiert.map((e) => {
    const p = katalog.projekt(e.projektId);
    const tagesbeginn = e.datum !== letzterTag;
    letzterTag = e.datum;
    return {
      // fürs PDF
      datumAnzeige: tagesbeginn ? `${WOCHENTAG[alsDatum(e.datum).getDay()]} ${e.datum.slice(8)}.${e.datum.slice(5, 7)}.` : "",
      tagesbeginn,
      zeit: e.von && e.bis ? `${e.von}–${e.bis}` : "",
      projekt: p ? p.name : katalog.fehlendesProjektText(e.projektId),
      notiz: e.notiz || "",
      stunden: e.minuten / 60,
      // zusätzlich fürs Blatt "Buchungen"
      datumWert: alsDatum(e.datum),
      wochentag: WOCHENTAG[alsDatum(e.datum).getDay()],
      kw: kalenderwoche(e.datum),
      bereich: katalog.bereichLabel(e.bereich),
      nr: p?.nr || "", kuerzel: p?.kuerzel || "", name: p?.name || "unbekannt",
      auftrag: p?.auftrag || "", auftraggeber: p?.auftraggeber || "",
      von: e.von || "", bis: e.bis || "", pause: e.pause || 0,
      abrechenbar: e.abrechenbar === false ? "nein" : "ja",
      quelle: e.quelle || "",
    };
  });

  const zeitraum = sortiert.length
    ? `${fmt.datumDeutsch(sortiert[0].datum)} bis ${fmt.datumDeutsch(sortiert.at(-1).datum)}`
    : `${fmt.datumDeutsch(von)} bis ${fmt.datumDeutsch(bis)}`;

  return {
    kopf: {
      bereich: katalog.bereichLabel(bereich),
      zeitraum,
      firma: "kreativLABOR42",
      person: "Steffen Schober",
      // Zweistellig, sonst steht "28.8.2026" neben "13.08.2026 bis 26.08.2026"
      erstelltAm: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    },
    kennzahlen: [
      { label: "Stunden", wert: fmt.dezimal(gesamtMinuten), zahl: gesamtMinuten / 60 },
      { label: "Buchungen", wert: String(sortiert.length), zahl: sortiert.length, nachkomma: 0, roh: sortiert.length },
      { label: "Projekte", wert: String(projekte.length), zahl: projekte.length, nachkomma: 0 },
      { label: "davon abrechenbar", wert: fmt.dezimal(abrechenbarMinuten), zahl: abrechenbarMinuten / 60 },
    ],
    projekte, monate, eintraege: zeilen,
    gesamtStunden: gesamtMinuten / 60,
  };
}

export const dateibasis = (bereich) =>
  `Stundennachweis_${katalog.bereichKurz(bereich).replace(/[^A-Za-z0-9]/g, "")}`;
