// PDF-Ausgabe: Daten aufbereiten, zeichnen lassen, ausgeben.
// Das Layout steht in nachweis_layout.js -- bewusst ohne App-Abhängigkeiten,
// damit es sich außerhalb der App erzeugen und ansehen lässt.
import { aufbereiten, dateibasis } from "./exportdaten.js";
import { zeichneNachweis } from "./nachweis_layout.js";
import { ausgeben, dateiname } from "./datei.js";
import { hinweis } from "../core/dom.js";

export async function exportierePdf(eintraege, { bereich, von, bis, mitEinzelnachweis = false }) {
  const jsPDFKlasse = window.jspdf?.jsPDF;
  if (!jsPDFKlasse) return hinweis("PDF-Bibliothek nicht geladen.", "warnung");
  if (!bereich) return hinweis("Bitte zuerst einen Lebensbereich wählen.", "warnung");

  const daten = aufbereiten(eintraege, { bereich, von, bis });
  if (!daten.eintraege.length) return hinweis("Nichts zu exportieren.", "warnung");

  const doc = new jsPDFKlasse({ unit: "mm", format: "a4" });
  if (!doc.autoTable) return hinweis("Tabellen-Erweiterung fehlt.", "warnung");

  zeichneNachweis(doc, daten, { mitEinzelnachweis });
  await ausgeben(doc.output("blob"), dateiname(dateibasis(bereich), { von, bis }, "pdf"));
}
