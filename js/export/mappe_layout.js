// Aufbau der Excel-Mappe — wie nachweis_layout.js ohne App-Abhängigkeiten,
// damit sich das Ergebnis außerhalb der App erzeugen und prüfen lässt.
//
// Geschrieben mit xlsx-js-style, seit 26.08.2026 anstelle der freien
// SheetJS-Fassung. Grund: Die verwirft Zellformate stillschweigend -- fett,
// Rahmen und Flächen kamen nie in der Datei an, der Code dafür lief ins Leere
// (nachgemessen). Der Ersatz hat dieselbe Schnittstelle, kann Formate und ist
// mit 415 KB kleiner als die 861 KB vorher.
//
// Was auch dort nicht geht: fixierte Kopfzeilen. Dafür steht der Autofilter.
//
// Grundsatz bleibt: keine verbundenen Zellen, echte Zahlen statt Text, eine
// Angabe je Zelle -- sonst ist die Mappe hübsch und zum Weiterrechnen unbrauchbar.

// Datumswerte müssen mit lokaler Mitternacht erzeugt werden (new Date(j, m-1, t)).
// Aus Date.UTC entsteht in deutscher Sommerzeit ein Wert mit 02:00 Uhr, und die
// Zelle zeigt dann Datum plus Uhrzeit.
const F_STUNDEN = "0.00";
const F_DATUM = "DD.MM.YYYY";
const F_GANZ = "0";

// Monochrom wie App und PDF: Tinte, Grau, Haarlinie.
const TINTE = "111111";
const GRAU = "7A7A7A";
const LINIE = "D6D6D6";
const HELL = "F4F4F4";

const S_TITEL = { font: { bold: true, sz: 16, color: { rgb: TINTE } } };
const S_LABEL = { font: { sz: 9, color: { rgb: GRAU } } };
const S_WERT = { font: { bold: true, sz: 11, color: { rgb: TINTE } } };
const S_ABSCHNITT = { font: { bold: true, sz: 9, color: { rgb: GRAU } } };
const S_KOPF = {
  font: { bold: true, sz: 9, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: TINTE } },
  alignment: { vertical: "center" },
};
const S_ZELLE = { border: { bottom: { style: "hair", color: { rgb: LINIE } } } };
const S_ZAHL = { ...S_ZELLE, alignment: { horizontal: "right" } };
const S_SUMME = {
  font: { bold: true, color: { rgb: TINTE } },
  fill: { fgColor: { rgb: HELL } },
  border: { top: { style: "thin", color: { rgb: TINTE } } },
};
const S_SUMME_ZAHL = { ...S_SUMME, alignment: { horizontal: "right" } };

/** @param XLSX  die SheetJS-Bibliothek
 *  @param daten { kopf, kennzahlen, projekte, eintraege, gesamtStunden }
 */
export function baueMappe(XLSX, daten, { mitEinzelnachweis = false } = {}) {
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, uebersicht(XLSX, daten), "Übersicht");
  // Die Tagesbuchungen sind Ballast, solange niemand danach fragt -- sie
  // kommen nur auf ausdrücklichen Wunsch mit. Ein Lebensbereich je Mappe.
  if (mitEinzelnachweis) {
    XLSX.utils.book_append_sheet(mappe, buchungen(XLSX, daten), "Buchungen");
  }
  return mappe;
}

function uebersicht(XLSX, daten) {
  const zeilen = [
    ["Stundennachweis"],
    [daten.kopf.bereich, daten.kopf.zeitraum],
    [daten.kopf.firma, daten.kopf.person],
    ["Erstellt", daten.kopf.erstelltAm],
    [],
    ...daten.kennzahlen.map((k) => [k.label, k.zahl ?? k.wert]),
    [],
    ["Summe je Projekt"],
    ["Nummer", "Kürzel", "Projekt", "Auftragsnummer", "Buchungen", "Stunden"],
    ...daten.projekte.map((p) => [p.nr, p.kuerzel, p.name, p.auftrag, p.buchungen, p.stunden]),
    ["", "", "Summe", "", daten.eintraege.length, daten.gesamtStunden],
    [],
    ["Summe je Monat"],
    ["Monat", "", "", "", "Buchungen", "Stunden"],
    ...daten.monate.map((m) => [m.label, "", "", "", m.buchungen, m.stunden]),
    ["Summe", "", "", "", daten.eintraege.length, daten.gesamtStunden],
  ];

  const blatt = XLSX.utils.aoa_to_sheet(zeilen);
  const zKennzahl = 5;
  const zProjektTitel = zKennzahl + daten.kennzahlen.length + 1;
  const zProjektKopf = zProjektTitel + 1;
  const zProjektErste = zProjektKopf + 1;
  const zProjektSumme = zProjektErste + daten.projekte.length;
  const zMonatTitel = zProjektSumme + 2;
  const zMonatKopf = zMonatTitel + 1;
  const zMonatErste = zMonatKopf + 1;
  const zMonatSumme = zMonatErste + daten.monate.length;

  stil(blatt, 0, 0, S_TITEL);
  stil(blatt, 0, 1, S_WERT);
  stil(blatt, 1, 1, S_LABEL);
  for (const c of [0, 1]) { stil(blatt, c, 2, S_LABEL); stil(blatt, c, 3, S_LABEL); }

  daten.kennzahlen.forEach((k, i) => {
    stil(blatt, 0, zKennzahl + i, S_LABEL);
    stil(blatt, 1, zKennzahl + i, S_WERT, k.nachkomma === 0 ? F_GANZ : F_STUNDEN);
  });

  for (const [titel, kopf, erste, summe, anzahl] of [
    [zProjektTitel, zProjektKopf, zProjektErste, zProjektSumme, daten.projekte.length],
    [zMonatTitel, zMonatKopf, zMonatErste, zMonatSumme, daten.monate.length],
  ]) {
    stil(blatt, 0, titel, S_ABSCHNITT);
    for (let c = 0; c < 6; c++) stil(blatt, c, kopf, S_KOPF);
    for (let r = erste; r < erste + anzahl; r++) {
      for (let c = 0; c < 4; c++) stil(blatt, c, r, S_ZELLE);
      stil(blatt, 4, r, S_ZAHL, F_GANZ);
      stil(blatt, 5, r, S_ZAHL, F_STUNDEN);
    }
    for (let c = 0; c < 4; c++) stil(blatt, c, summe, S_SUMME);
    stil(blatt, 4, summe, S_SUMME_ZAHL, F_GANZ);
    stil(blatt, 5, summe, S_SUMME_ZAHL, F_STUNDEN);
  }

  blatt["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 46 }, { wch: 16 }, { wch: 11 }, { wch: 10 }];
  blatt["!rows"] = [{ hpt: 22 }];
  return blatt;
}

function buchungen(XLSX, daten) {
  const kopf = ["Datum", "Wochentag", "KW", "Bereich", "Projektnummer", "Kürzel", "Projekt",
    "Auftragsnummer", "Auftraggeber", "Von", "Bis", "Pause (min)", "Stunden", "Abrechenbar",
    "Notiz", "Erfassung"];

  const zeilen = daten.eintraege.map((e) => [
    e.datumWert, e.wochentag, e.kw, e.bereich, e.nr, e.kuerzel, e.name,
    e.auftrag, e.auftraggeber, e.von, e.bis, e.pause, e.stunden, e.abrechenbar,
    e.notiz, e.quelle,
  ]);
  zeilen.push(["", "", "", "", "", "", "Summe", "", "", "", "", "", daten.gesamtStunden, "", "", ""]);

  const blatt = XLSX.utils.aoa_to_sheet([kopf, ...zeilen], { cellDates: true });
  const zSumme = zeilen.length;

  for (let c = 0; c < kopf.length; c++) stil(blatt, c, 0, S_KOPF);

  for (let r = 1; r < zSumme; r++) {
    for (let c = 0; c < kopf.length; c++) stil(blatt, c, r, S_ZELLE);
    stil(blatt, 0, r, S_ZELLE, F_DATUM);
    stil(blatt, 2, r, S_ZAHL, F_GANZ);
    stil(blatt, 11, r, S_ZAHL, F_GANZ);
    stil(blatt, 12, r, S_ZAHL, F_STUNDEN);
  }
  for (let c = 0; c < kopf.length; c++) stil(blatt, c, zSumme, S_SUMME);
  stil(blatt, 12, zSumme, S_SUMME_ZAHL, F_STUNDEN);

  blatt["!cols"] = [
    { wch: 12 }, { wch: 11 }, { wch: 5 }, { wch: 15 }, { wch: 13 }, { wch: 10 }, { wch: 40 },
    { wch: 15 }, { wch: 16 }, { wch: 7 }, { wch: 7 }, { wch: 11 }, { wch: 9 }, { wch: 12 },
    { wch: 46 }, { wch: 11 },
  ];
  blatt["!rows"] = [{ hpt: 20 }];
  // Filtern statt Fixieren -- fixierte Kopfzeilen schreibt auch diese
  // Bibliothek nicht.
  blatt["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: zSumme, c: kopf.length - 1 } }) };
  return blatt;
}

/** Setzt Stil und optional Zahlenformat auf eine Zelle. Leere Zellen legt
 *  aoa_to_sheet nicht an -- ohne diese Prüfung liefe jede Randspalte auf einen
 *  Fehler statt still zu bleiben. */
function stil(blatt, spalte, zeile, s, format = null) {
  const zelle = blatt[adresse(spalte, zeile)];
  if (!zelle) return;
  zelle.s = { ...(zelle.s || {}), ...s };
  if (format && (zelle.t === "n" || zelle.t === "d")) zelle.z = format;
}

function adresse(c, r) {
  let s = "", n = c;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s + (r + 1);
}
