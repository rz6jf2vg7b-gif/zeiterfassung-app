// Excel-Export. Anders als in der alten Fassung:
//   - Dauer in Dezimalstunden (1,5) statt Minuten (90) — so rechnet die Abrechnung
//   - zusaetzlich echte Excel-Zeitwerte, damit sich in Excel weiterrechnen laesst
//   - Autofilter, eingefrorene Kopfzeile, Summenzeile
//   - zweites Blatt mit der Summe je Projekt (spart die Pivot-Tabelle)
import * as katalog from "../data/catalog.js";
import { alsDezimalstunden } from "../core/time.js";
import { datumDeutsch, kategorieLabel } from "../core/fmt.js";
import { ausgeben, dateiname } from "./datei.js";
import { hinweis } from "../core/dom.js";

export async function exportiereXlsx(eintraege, { titel, von, bis }) {
  if (typeof XLSX === "undefined") return hinweis("Excel-Bibliothek nicht geladen.", "warnung");

  const sortiert = eintraege.slice().sort((a, b) =>
    a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""));

  const zeilen = sortiert.map((e) => {
    const p = katalog.projekt(e.projektId);
    const abwesend = e.art === "abwesenheit";
    return {
      Datum: datumDeutsch(e.datum),
      Jahr: +e.datum.slice(0, 4),
      Monat: +e.datum.slice(5, 7),
      KW: kw(e.datum),
      Bereich: katalog.bereichLabel(e.bereich),
      Art: abwesend ? kategorieLabel(e.kategorie) : "Arbeitszeit",
      Projektnummer: abwesend ? "" : (p?.nr || ""),
      Kürzel: abwesend ? "" : (p?.kuerzel || ""),
      Projekt: abwesend ? kategorieLabel(e.kategorie) : (p?.name || "unbekannt"),
      // Bei MVV ist die Auftragsnummer die Zahl, auf die gebucht wird --
      // die interne Projektnummer hilft dort niemandem.
      Auftragsnummer: abwesend ? "" : (p?.auftrag || ""),
      Auftraggeber: abwesend ? "" : (p?.auftraggeber || ""),
      Ort: abwesend ? "" : (p?.ort || ""),
      Von: e.von || "",
      Bis: e.bis || "",
      "Pause (min)": e.pause || 0,
      Stunden: alsDezimalstunden(e.minuten),
      Minuten: e.minuten,
      Abrechenbar: abwesend ? "" : (e.abrechenbar === false ? "nein" : "ja"),
      Sammelposten: p?.sammelposten ? "ja" : "",
      Notiz: e.notiz || "",
      Erfassung: e.quelle || "",
    };
  });

  const gesamt = sortiert.reduce((s, e) => s + e.minuten, 0);
  const blatt = XLSX.utils.json_to_sheet(zeilen);
  const spalten = Object.keys(zeilen[0] || { Datum: "" });

  // Summenzeile
  const summenZeile = {};
  spalten.forEach((s) => (summenZeile[s] = ""));
  summenZeile.Projekt = "SUMME";
  summenZeile.Stunden = alsDezimalstunden(gesamt);
  summenZeile.Minuten = gesamt;
  XLSX.utils.sheet_add_json(blatt, [summenZeile], { origin: -1, skipHeader: true, header: spalten });

  blatt["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: zeilen.length, c: spalten.length - 1 } }) };
  blatt["!freeze"] = { xSplit: 0, ySplit: 1 };
  blatt["!cols"] = spalten.map((s) => ({ wch: breite(s) }));

  // Blatt 2: Summe je Projekt
  const proProjekt = new Map();
  for (const e of sortiert.filter((x) => x.art !== "abwesenheit")) {
    const p = katalog.projekt(e.projektId);
    const k = e.projektId;
    const g = proProjekt.get(k) || {
      Bereich: katalog.bereichLabel(e.bereich),
      Projektnummer: p?.nr || "", Kürzel: p?.kuerzel || "",
      Projekt: p?.name || "unbekannt", Buchungen: 0, Stunden: 0, Minuten: 0,
    };
    g.Buchungen += 1; g.Minuten += e.minuten;
    proProjekt.set(k, g);
  }
  const summenZeilen = [...proProjekt.values()]
    .map((g) => ({ ...g, Stunden: alsDezimalstunden(g.Minuten) }))
    .sort((a, b) => b.Minuten - a.Minuten);
  summenZeilen.push({ Bereich: "", Projektnummer: "", Kürzel: "", Projekt: "SUMME",
    Buchungen: sortiert.length, Stunden: alsDezimalstunden(gesamt), Minuten: gesamt });

  const blatt2 = XLSX.utils.json_to_sheet(summenZeilen);
  blatt2["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 42 }, { wch: 11 }, { wch: 10 }, { wch: 10 }];
  blatt2["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: summenZeilen.length, c: 6 } }) };

  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, "Buchungen");
  XLSX.utils.book_append_sheet(mappe, blatt2, "Summe je Projekt");

  const roh = XLSX.write(mappe, { bookType: "xlsx", type: "array" });
  const blob = new Blob([roh], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await ausgeben(blob, dateiname("Stunden", { von, bis }, "xlsx"));
}

function breite(spalte) {
  return { Projekt: 42, Notiz: 40, Bereich: 16, Ort: 18, Datum: 12 }[spalte] || 11;
}

function kw(datum) {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}
