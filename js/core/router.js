// Ansichtswechsel inklusive Verlauf: Der Zurueck-Wisch auf dem iPhone soll
// zur vorigen Ansicht fuehren und nicht die PWA verlassen.
const ansichten = new Map();
let aktuell = null;
let wurzel = null;
let beimWechsel = () => {};

export function registrieren(name, zeichnen) {
  ansichten.set(name, zeichnen);
}

export function verdrahten(wurzelKnoten, aufWechsel) {
  wurzel = wurzelKnoten;
  beimWechsel = aufWechsel || (() => {});
  window.addEventListener("popstate", (ev) => {
    zeige(ev.state?.ansicht || "heute", { verlauf: false });
  });
}

export function zeige(name, { verlauf = true } = {}) {
  if (!ansichten.has(name)) name = "heute";
  const wechsel = name !== aktuell;
  aktuell = name;
  if (verlauf && wechsel) history.pushState({ ansicht: name }, "", `#${name}`);
  neuZeichnen();
  beimWechsel(name);
}

export function neuZeichnen() {
  if (!aktuell || !wurzel) return;
  const vorherigeHoehe = wurzel.scrollTop;
  wurzel.replaceChildren();
  ansichten.get(aktuell)(wurzel);
  if (!aktuell) return;
  wurzel.scrollTop = vorherigeHoehe;
}

export const aktuelleAnsicht = () => aktuell;
export const startAnsicht = () => (location.hash || "#heute").slice(1);
