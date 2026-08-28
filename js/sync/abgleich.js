// Zusammenfuehren zweier Staende. Regel: pro Datensatz gewinnt der juengere
// Zeitstempel (Feld "geaendert"). Loeschungen sind Grabsteine und gewinnen
// dadurch genauso — ohne das kaeme ein auf dem iPhone geloeschter Eintrag
// vom iPad zurueck.
import * as db from "../data/db.js";
import * as repo from "../data/repo.js";
import * as onedrive from "./onedrive.js";
import * as kataloge from "./kataloge.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";

const FORMAT = 2;

function juengeres(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (a.geaendert || "") >= (b.geaendert || "") ? a : b;
}

function verschmelze(lokal, fern) {
  const nachId = new Map(lokal.map((x) => [x.id, x]));
  let neu = 0, aktualisiert = 0;
  for (const f of fern || []) {
    const l = nachId.get(f.id);
    if (!l) { nachId.set(f.id, f); neu += 1; continue; }
    const sieger = juengeres(l, f);
    if (sieger !== l) { nachId.set(f.id, sieger); aktualisiert += 1; }
  }
  return { liste: [...nachId.values()], neu, aktualisiert };
}

export async function abgleichen() {
  const fern = await onedrive.laden();

  const [eintraegeLokal, projekteLokal, extrasLokal] = await Promise.all([
    repo.eintraege({ mitGeloeschten: true }),
    db.alle(db.STORE_PROJEKTE),
    repo.alleExtras(),
  ]);

  const e = verschmelze(eintraegeLokal, fern?.eintraege);
  const p = verschmelze(projekteLokal, fern?.projekte);
  const x = verschmelze(extrasLokal, fern?.extras);

  await Promise.all([
    db.schreibeViele(db.STORE_EINTRAEGE, e.liste),
    db.schreibeViele(db.STORE_PROJEKTE, p.liste),
    db.schreibeViele(db.STORE_EXTRAS, x.liste),
  ]);

  // Das Kalender-Gedächtnis wandert mit. Es liegt in der Konfiguration, und
  // die wird sonst nicht abgeglichen -- gelernt hätte dann jedes Gerät für
  // sich, und auf dem iPad stünde bei denselben Terminen kein Vorschlag.
  // Zusammengeführt wird als Vereinigung: eine gelernte Zuordnung geht nie
  // verloren, bei gleichem Titel gilt die vom eigenen Gerät.
  const zuordnungLokal = await repo.konfig("kalenderZuordnung", {});
  const zuordnung = { ...(fern?.kalenderZuordnung || {}), ...zuordnungLokal };
  await repo.setzeKonfig("kalenderZuordnung", zuordnung);

  await onedrive.speichern({
    format: FORMAT,
    geschriebenAm: new Date().toISOString(),
    geraet: navigator.userAgent.slice(0, 80),
    eintraege: e.liste,
    projekte: p.liste,
    extras: x.liste,
    kalenderZuordnung: zuordnung,
  });

  // Projektlisten mitziehen. Sie liegen seit 25.08.2026 nicht mehr neben der
  // App, sondern in OneDrive — ohne diesen Schritt bliebe der Katalog leer.
  const listen = await kataloge.ausOneDrive();

  await repo.setzeKonfig("letzterAbgleich", new Date().toISOString());
  await katalog.laden();
  await store.starten();

  return {
    eintraege: e.liste.filter((y) => !y.geloescht).length,
    hereingekommen: e.neu + p.neu + x.neu,
    aktualisiert: e.aktualisiert + p.aktualisiert + x.aktualisiert,
    listen: listen.filter((l) => l.zustand === "neu" || l.zustand === "erneuert"),
  };
}

export const letzterAbgleich = () => repo.konfig("letzterAbgleich", null);
