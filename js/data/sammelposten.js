// Sammelposten — Tätigkeiten ohne Projektbezug.
// Bei MVV die nicht-operativen Stunden (NOP): Schulung, Jour Fixe, Gremien.
// Bei kreativLABOR42 alles, was kein Kundenprojekt ist: Akquise, Buchhaltung.
// Ohne diese Einträge landen solche Stunden entweder gar nicht in der Erfassung
// oder falsch auf einem Kundenprojekt — beides verfälscht die Auswertung.
//
// Sie verhalten sich wie Projekte, sind aber als sammelposten markiert:
// nie abrechenbar vorbelegt, eigene Zeile in der Erfassung, in der Auswertung
// getrennt ausweisbar.

export const SAMMELPOSTEN = [
  // --- MVV Netze: nicht-operative Stunden --------------------------------
  { id: "nop-mvv-jourfixe",    bereich: "mvv", kuerzel: "NOP", name: "Jour Fixe / Regeltermin" },
  { id: "nop-mvv-schulung",    bereich: "mvv", kuerzel: "NOP", name: "Schulung / Weiterbildung" },
  { id: "nop-mvv-besprechung", bereich: "mvv", kuerzel: "NOP", name: "Besprechung / Gremium" },
  { id: "nop-mvv-fuehrung",    bereich: "mvv", kuerzel: "NOP", name: "Führung / Mitarbeitergespräch" },
  { id: "nop-mvv-verwaltung",  bereich: "mvv", kuerzel: "NOP", name: "Allgemeine Verwaltung" },

  // --- kreativLABOR42: Büro statt Auftrag --------------------------------
  { id: "sam-kl-akquise",      bereich: "kl", kuerzel: "AKQ", name: "Akquise" },
  { id: "sam-kl-buchhaltung",  bereich: "kl", kuerzel: "BÜRO", name: "Buchhaltung" },
  { id: "sam-kl-organisation", bereich: "kl", kuerzel: "BÜRO", name: "Büroorganisation" },
  { id: "sam-kl-weiterbildung",bereich: "kl", kuerzel: "WB", name: "Weiterbildung" },
];

export function alsProjekte() {
  return SAMMELPOSTEN.map((s) => ({
    ...s,
    quelle: "sammelposten",
    sammelposten: true,
    nr: null,
    aktiv: true,
    abrechenbarVorgabe: false,
  }));
}

export const istSammelposten = (id) => SAMMELPOSTEN.some((s) => s.id === id);
