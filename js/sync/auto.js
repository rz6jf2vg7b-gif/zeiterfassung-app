// Automatischer Abgleich.
//
// Von Hand abzugleichen heißt, es zu vergessen — und dann steht auf dem iPad
// ein anderer Stand als auf dem iPhone. Deshalb läuft der Abgleich selbst:
//
//   beim Start                      damit man den Stand der anderen Geräte sieht
//   nach jeder Änderung (verzögert) damit nichts liegen bleibt
//   beim Zurückkehren zur App       das andere Gerät war vielleicht schneller
//   alle zehn Minuten im Betrieb    für den Fall, dass die App offen stehen bleibt
//
// Zwei Vorkehrungen: ein Riegel verhindert, dass sich zwei Durchläufe
// überholen, und ein Fehlschlag bleibt still — ein toter Funkmast darf die
// Erfassung nicht blockieren.
import * as store from "../core/store.js";
import * as microsoft from "./microsoft.js";
import { abgleichen } from "./abgleich.js";

const VERZOEGERUNG_NACH_AENDERUNG = 8000;
const MINDESTABSTAND = 90 * 1000;
const TAKT = 10 * 60 * 1000;

let laeuft = false;
let geplant = null;
let zuletzt = 0;
let fingerabdruck = null;
let takt = null;

function aktiv() {
  // Bei abgelaufener Anmeldung ruht der Abgleich: jeder Versuch liefe in
  // denselben Fehler und wuerde ihn alle zehn Minuten wiederholen.
  if (microsoft.anmeldungNoetig()) return false;
  return store.zustand.einstellungen.autoAbgleich !== false && microsoft.angemeldet();
}

/** Billiger Vergleichswert: Anzahl plus jüngster Änderungszeitpunkt.
 *  Reicht, um echte Datenänderungen von bloßem Neuzeichnen zu unterscheiden. */
function abdruck() {
  const e = store.zustand.eintraege;
  let neuestes = "";
  for (const x of e) if (x.geaendert > neuestes) neuestes = x.geaendert;
  return `${e.length}|${neuestes}`;
}

export async function jetztAbgleichen({ erzwingen = false } = {}) {
  if (!aktiv() || laeuft) return null;
  if (!erzwingen && Date.now() - zuletzt < MINDESTABSTAND) return null;

  laeuft = true;
  try {
    const e = await abgleichen();
    if (e.hereingekommen || e.aktualisiert) {
      const { hinweis } = await import("../core/dom.js");
      hinweis(`${e.hereingekommen + e.aktualisiert} Änderungen von anderen Geräten übernommen.`, "info");
    }
    return e;
  } catch (fehler) {
    console.warn("Abgleich fehlgeschlagen:", fehler);
    return null;
  } finally {
    // Erst hier -- der Abgleich schreibt selbst in den Zustand und wuerde
    // sonst ueber den Beobachter unten den naechsten Durchlauf anstossen.
    // Auch nach einem Fehlschlag gesetzt, damit ein toter Funkmast nicht bei
    // jedem Ansichtswechsel einen neuen Versuch ausloest.
    zuletzt = Date.now();
    fingerabdruck = abdruck();
    laeuft = false;
  }
}

function baldAbgleichen() {
  clearTimeout(geplant);
  geplant = setTimeout(() => jetztAbgleichen({ erzwingen: true }), VERZOEGERUNG_NACH_AENDERUNG);
}

export function starten() {
  fingerabdruck = abdruck();

  // Nach jeder echten Datenänderung -- verzögert, damit mehrere Buchungen
  // hintereinander einen einzigen Abgleich auslösen und nicht fünf.
  store.abonnieren(() => {
    if (!aktiv() || laeuft) return;   // eigene Schreibvorgaenge nicht als Aenderung werten
    const jetzt = abdruck();
    if (jetzt === fingerabdruck) return;
    fingerabdruck = jetzt;
    baldAbgleichen();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") jetztAbgleichen();
  });
  window.addEventListener("online", () => jetztAbgleichen({ erzwingen: true }));

  clearInterval(takt);
  takt = setInterval(() => {
    if (document.visibilityState === "visible") jetztAbgleichen();
  }, TAKT);

  jetztAbgleichen({ erzwingen: true });
}

export const laeuftGerade = () => laeuft;
export const letzterVersuch = () => zuletzt;
