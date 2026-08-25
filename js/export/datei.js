// Dateiausgabe. Auf dem iPhone ist ein normaler Download-Link im Heimbildschirm-
// Modus eine Sackgasse — die Datei landet nirgends, wo man sie wiederfindet.
// Deshalb zuerst das Teilen-Blatt (Mail, Dateien, AirDrop), Download nur als Rueckfall.
import { hinweis } from "../core/dom.js";

export async function ausgeben(blob, dateiname) {
  const datei = new File([blob], dateiname, { type: blob.type });

  if (navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: dateiname });
      return "geteilt";
    } catch (fehler) {
      if (fehler?.name === "AbortError") return "abgebrochen";
      // sonst weiter zum Download-Rueckfall
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  hinweis(`${dateiname} gespeichert.`, "gut");
  return "geladen";
}

export function dateiname(basis, { von, bis }, endung) {
  const teil = von && bis && von !== "0000-01-01" ? `_${von}_bis_${bis}` : "";
  return `${basis}${teil}.${endung}`;
}
