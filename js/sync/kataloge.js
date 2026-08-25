// Projektkataloge aus Steffens OneDrive.
//
// Warum es dieses Modul gibt: bis zum 25.08.2026 lagen die Listen als
// data/projects.ustrich.json und data/projects.mvv.json im ausgelieferten
// Web-Ordner. Damit waren 612 MVV-Projekte samt Auftragsnummer, Auftraggeber
// und Projektleiter sowie 157 kreativLABOR42-Kundenprojekte ohne jede
// Anmeldung aus dem Netz abrufbar. Projektdaten gehoeren ausschliesslich auf
// das Geraet oder in Steffens OneDrive — deshalb dieser Weg.
//
// Die Dateien liegen neben den Buchungen:
//     OneDrive → Apps → Stundenerfassung → kataloge → projects.<id>.json
// Erzeugt werden sie am Mac von den Skripten in CoWork_OS/00_resources/scripts/.
import { graph } from "./microsoft.js";
import * as repo from "../data/repo.js";

const ORDNER = "/me/drive/root:/Apps/Stundenerfassung/kataloge";
const LISTEN = ["ustrich", "mvv"];

const pfad = (id) => `${ORDNER}/projects.${id}.json`;

/** Erst die Kopfdaten, dann erst der Inhalt. Der Abgleich laeuft alle zehn
 *  Minuten — die 220 KB beider Listen jedes Mal ueber Mobilfunk zu ziehen
 *  waere Verschwendung. Der eTag von OneDrive sagt, ob sich etwas geaendert hat. */
async function eineListe(id) {
  const kopf = await graph(`${pfad(id)}?$select=eTag,lastModifiedDateTime,size`);
  if (kopf?._nichtGefunden) return { id, zustand: "fehlt" };

  const vorhanden = await repo.katalogHolen(id);
  if (vorhanden?.etag && vorhanden.etag === kopf.eTag && vorhanden.projekte?.length) {
    return { id, zustand: "unveraendert", anzahl: vorhanden.anzahl };
  }

  const inhalt = await graph(`${pfad(id)}:/content`);
  if (inhalt?._nichtGefunden) return { id, zustand: "fehlt" };
  if (!Array.isArray(inhalt?.projekte)) return { id, zustand: "unbrauchbar" };

  await repo.katalogSchreiben(id, inhalt, { quelle: "onedrive", etag: kopf.eTag });
  return { id, zustand: vorhanden ? "erneuert" : "neu", anzahl: inhalt.projekte.length };
}

/** Holt beide Listen. Ein Fehler bei einer Liste darf den Abgleich der
 *  Buchungen nicht kippen — die sind das Wertvolle, der Katalog ist ersetzbar. */
export async function ausOneDrive() {
  const ergebnis = [];
  for (const id of LISTEN) {
    try {
      ergebnis.push(await eineListe(id));
    } catch (fehler) {
      ergebnis.push({ id, zustand: "fehler", meldung: fehler.message });
    }
  }
  return ergebnis;
}

/** Rueckfallweg ohne Anmeldung: eine der erzeugten JSON-Dateien von Hand
 *  waehlen. Gedacht fuer die Ersteinrichtung und fuer den Fall, dass
 *  OneDrive gerade nicht erreichbar ist. */
export async function ausDatei(text) {
  let inhalt;
  try {
    inhalt = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
  }
  if (!Array.isArray(inhalt?.projekte)) {
    throw new Error("Das ist keine Projektliste dieser App — es fehlt das Feld „projekte“.");
  }

  // "quelle" oben in der Datei beschreibt die Herkunft (Dateiname, API-URL),
  // nicht die Liste. Die Liste steht an jedem Projekt — "ustrich" oder "mvv".
  const id = inhalt.liste || inhalt.projekte[0]?.quelle;
  if (!LISTEN.includes(id)) {
    throw new Error("Unbekannte Liste — erwartet wird „ustrich“ oder „mvv“.");
  }

  await repo.katalogSchreiben(id, inhalt, { quelle: "datei", etag: null });
  return { id, anzahl: inhalt.projekte.length };
}

export async function entfernen(id) {
  await repo.katalogLoeschen(id);
}

export const ordnerAnzeige = () => "OneDrive → Apps → Stundenerfassung → kataloge";
