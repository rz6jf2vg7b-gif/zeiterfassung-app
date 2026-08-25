// PDF-Export — Stundennachweis zum Weitergeben. In der alten Fassung war das
// ausdruecklich "Platzhalter-Layout": nackte Tabelle ohne Kopf, ohne Summen,
// Dauer in Minuten. Jetzt: Briefkopf, Zeitraum, Summe je Projekt, Einzelnachweis,
// Seitenzahlen. Hausfarbe #32A1F3.
import * as katalog from "../data/catalog.js";
import { alsDezimalstunden } from "../core/time.js";
import { dauer, dezimal, datumDeutsch, projektZeile } from "../core/fmt.js";
import { ausgeben, dateiname } from "./datei.js";
import { hinweis } from "../core/dom.js";

const MARKE = [50, 161, 243];   // #32A1F3
const GRAU = [110, 120, 132];

export async function exportierePdf(eintraege, { titel, von, bis }) {
  const jsPDFKlasse = window.jspdf?.jsPDF;
  if (!jsPDFKlasse) return hinweis("PDF-Bibliothek nicht geladen.", "warnung");

  const doc = new jsPDFKlasse({ unit: "mm", format: "a4" });
  const breite = doc.internal.pageSize.getWidth();
  const sortiert = eintraege.slice().sort((a, b) =>
    a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""));
  const gesamt = sortiert.reduce((s, e) => s + e.minuten, 0);

  // --- Kopf ---
  doc.setFillColor(...MARKE);
  doc.rect(0, 0, breite, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(25, 28, 33);
  doc.text("Stundennachweis", 15, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAU);
  doc.text(titel, 15, 27);
  doc.text(`erstellt am ${new Date().toLocaleDateString("de-DE")}`, breite - 15, 27, { align: "right" });
  doc.setFontSize(12);
  doc.setTextColor(25, 28, 33);
  doc.setFont("helvetica", "bold");
  doc.text(`Gesamt: ${dauer(gesamt)}  (${dezimal(gesamt)} Std)`, 15, 36);

  const tabelle = doc.autoTable ? doc.autoTable.bind(doc) : window.jspdf?.autoTable?.bind(null, doc);
  if (!tabelle) return hinweis("Tabellen-Erweiterung fehlt.", "warnung");

  // --- Summe je Projekt ---
  const proProjekt = new Map();
  for (const e of sortiert) {
    const g = proProjekt.get(e.projektId) || { minuten: 0, anzahl: 0 };
    g.minuten += e.minuten; g.anzahl += 1;
    proProjekt.set(e.projektId, g);
  }
  const summenKoerper = [...proProjekt.entries()]
    .sort((a, b) => b[1].minuten - a[1].minuten)
    .map(([id, g]) => {
      const p = katalog.projekt(id);
      return [p?.nr || "", p?.kuerzel || "", p?.name || "unbekannt", String(g.anzahl), dezimal(g.minuten)];
    });
  summenKoerper.push(["", "", "Summe", String(sortiert.length), dezimal(gesamt)]);

  tabelle({
    startY: 42,
    head: [["Nr.", "Kürzel", "Projekt", "Buchungen", "Std"]],
    body: summenKoerper,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [226, 230, 236], textColor: [30, 34, 40] },
    headStyles: { fillColor: MARKE, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 20 }, 3: { cellWidth: 24, halign: "right" }, 4: { cellWidth: 20, halign: "right" } },
    didParseCell: (d) => {
      if (d.row.index === summenKoerper.length - 1) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [240, 244, 249];
      }
    },
  });

  // --- Einzelnachweis ---
  const nachSumme = doc.lastAutoTable?.finalY || 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(25, 28, 33);
  doc.text("Einzelnachweis", 15, nachSumme + 11);

  tabelle({
    startY: nachSumme + 15,
    head: [["Datum", "Projekt", "Zeit", "Std", "Notiz"]],
    body: sortiert.map((e) => {
      const p = katalog.projekt(e.projektId);
      const zeit = e.von && e.bis ? `${e.von}–${e.bis}` : "";
      return [datumDeutsch(e.datum), p ? (p.kuerzel || p.nr || p.name) : "?", zeit, dezimal(e.minuten), e.notiz || ""];
    }),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [30, 34, 40] },
    headStyles: { fillColor: [240, 244, 249], textColor: [40, 46, 54], fontStyle: "bold", lineColor: [214, 220, 228], lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 26 }, 2: { cellWidth: 24 }, 3: { cellWidth: 15, halign: "right" } },
    didDrawPage: () => {
      const seite = doc.internal.getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAU);
      doc.text("kreativLABOR42 · Steffen Schober", 15, doc.internal.pageSize.getHeight() - 8);
      doc.text(`Seite ${seite}`, breite - 15, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    },
  });

  await ausgeben(doc.output("blob"), dateiname("Stundennachweis", { von, bis }, "pdf"));
}
