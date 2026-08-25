// Vollsicherung als JSON. Wichtig, weil Safari IndexedDB von Web-Apps nach
// laengerer Nichtnutzung loeschen darf (Intelligent Tracking Prevention) —
// ohne Sicherung waeren die Stunden dann weg. Der OneDrive-Abgleich deckt das
// im Alltag ab, diese Datei ist der Weg ohne Anmeldung.
import * as db from "../data/db.js";
import * as repo from "../data/repo.js";
import { ausgeben } from "./datei.js";
import { alsDatumString } from "../core/time.js";

export async function sicherungErstellen() {
  const [eintraege, projekte, extras, konfig] = await Promise.all([
    repo.eintraege({ mitGeloeschten: true }),
    db.alle(db.STORE_PROJEKTE),
    repo.alleExtras(),
    repo.alleKonfig(),
  ]);
  const daten = {
    format: 2,
    erstelltAm: new Date().toISOString(),
    eintraege, projekte, extras,
    konfig: konfig.filter((k) => k.key !== "timer"),
  };
  const blob = new Blob([JSON.stringify(daten, null, 1)], { type: "application/json" });
  await ausgeben(blob, `Stunden_Sicherung_${alsDatumString(new Date())}.json`);
  return eintraege.length;
}

/** Zurueckspielen fuegt hinzu und ueberschreibt nur, was aelter ist —
 *  eine Sicherung einzuspielen darf nie neuere Buchungen loeschen. */
export async function sicherungEinspielen(text) {
  const daten = JSON.parse(text);
  if (!daten || typeof daten !== "object" || !Array.isArray(daten.eintraege)) {
    throw new Error("Das ist keine Sicherungsdatei dieser App.");
  }

  const vorhanden = new Map((await repo.eintraege({ mitGeloeschten: true })).map((e) => [e.id, e]));
  const zuSchreiben = daten.eintraege.filter((e) => {
    const alt = vorhanden.get(e.id);
    return !alt || (e.geaendert || "") > (alt.geaendert || "");
  });

  await db.schreibeViele(db.STORE_EINTRAEGE, zuSchreiben);
  if (Array.isArray(daten.projekte)) await db.schreibeViele(db.STORE_PROJEKTE, daten.projekte);
  if (Array.isArray(daten.extras)) await db.schreibeViele(db.STORE_EXTRAS, daten.extras);

  return { gelesen: daten.eintraege.length, uebernommen: zuSchreiben.length };
}

/** MVV-Projekte aus eingefuegtem Text. Eine Zeile je Projekt, Trenner Tab,
 *  Semikolon oder Komma:  Nummer ; Kuerzel ; Name ; Ort
 *  Fehlt etwas, wird der Rest sinnvoll gedeutet — eine Spalte allein gilt als Name. */
export function projekteAusText(text, bereich = "mvv") {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  const ergebnis = [];
  for (const zeile of zeilen) {
    const felder = zeile.split(/\t|;|,(?=\s*\S)/).map((f) => f.trim()).filter((f) => f !== "");
    if (!felder.length) continue;
    if (/^(nummer|nr\.?|projekt|kürzel|kuerzel|name)$/i.test(felder[0]) && felder.length > 1) continue; // Kopfzeile

    let nr = null, kuerzel = null, name = null, adresse = null;
    if (felder.length === 1) {
      name = felder[0];
    } else if (felder.length === 2) {
      [nr, name] = felder;
    } else {
      [nr, kuerzel, name] = felder;
      adresse = felder[3] || null;
    }
    // Sieht das erste Feld nach einem Kuerzel statt einer Nummer aus?
    if (nr && !/\d/.test(nr) && nr.length <= 6 && !kuerzel) { kuerzel = nr; nr = null; }
    if (!name) continue;
    ergebnis.push(repo.neuesProjekt({ bereich, name, nr, kuerzel, adresse }));
  }
  return ergebnis;
}
