// Excel-Ausgabe. Aufbau in mappe_layout.js, Zahlen aus exportdaten.js --
// PDF und Mappe zeigen dadurch garantiert dieselben Summen.
//
// Seit 28.08.2026 mit xlsx-js-style statt der freien SheetJS-Fassung: die
// verwarf Zellformate stillschweigend, fett und Rahmen kamen nie in der Datei
// an. Der Ersatz hat dieselbe Schnittstelle und ist zudem kleiner.
import { aufbereiten, dateibasis } from "./exportdaten.js";
import { baueMappe } from "./mappe_layout.js";
import { ausgeben, dateiname } from "./datei.js";
import { hinweis } from "../core/dom.js";

export async function exportiereXlsx(eintraege, { bereich, von, bis, mitEinzelnachweis = false }) {
  if (typeof XLSX === "undefined") return hinweis("Excel-Bibliothek nicht geladen.", "warnung");
  if (!bereich) return hinweis("Bitte zuerst einen Lebensbereich wählen.", "warnung");

  const daten = aufbereiten(eintraege, { bereich, von, bis });
  if (!daten.eintraege.length) return hinweis("Nichts zu exportieren.", "warnung");

  const mappe = baueMappe(XLSX, daten, { mitEinzelnachweis });
  const roh = XLSX.write(mappe, { bookType: "xlsx", type: "array", cellDates: true });
  const blob = new Blob([roh], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await ausgeben(blob, dateiname(dateibasis(bereich), { von, bis }, "xlsx"));
}
