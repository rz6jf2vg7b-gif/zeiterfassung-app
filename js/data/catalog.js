// Projektkatalog: führt vier Quellen zu einer durchsuchbaren Liste zusammen.
//   1. untermStrich   — kreativLABOR42, per Skript aus der ustrich-API erzeugt
//   2. MVV            — aus der Gruppenprojektliste TV.D.3
//   3. Sammelposten   — NOP und Akquise, fest eingebaut
//   4. Eigene         — in der App angelegt
//
// 1 und 2 lagen bis zum 25.08.2026 als data/projects.*.json neben der App und
// waren damit öffentlich abrufbar. Sie kommen jetzt aus der lokalen Datenbank,
// gefüllt aus Steffens OneDrive (sync/kataloge.js) oder aus einer gewählten
// Datei. Hier wird deshalb nichts mehr über das Netz geholt.
// Dazu Extras (Adresse, Koordinaten, Favorit), die daneben liegen, damit ein
// Katalog-Update sie nicht überschreibt.
import * as repo from "./repo.js";
import { alsProjekte as sammelpostenAlsProjekte } from "./sammelposten.js";

export const BEREICHE = [
  { id: "kl", label: "kreativLABOR42", kurz: "kL42" },
  { id: "mvv", label: "MVV Netze", kurz: "MVV" },
  { id: "privat", label: "Privat", kurz: "Privat" },
];

export const bereichLabel = (id) => BEREICHE.find((b) => b.id === id)?.label || id;
export const bereichKurz = (id) => BEREICHE.find((b) => b.id === id)?.kurz || id;

export const KATALOG_BEREICH = { ustrich: "kl", mvv: "mvv" };

let katalog = [];
let nachId = new Map();
let stand = { ustrich: null, mvv: null };

const alsStand = (k) => (k && k.projekte?.length
  ? { anzahl: k.anzahl, am: k.generiertAm, quelle: k.quelle, geladenAm: k.geladenAm }
  : null);

export async function laden() {
  const [us, mvv, eigene, extras] = await Promise.all([
    repo.katalogHolen("ustrich"),
    repo.katalogHolen("mvv"),
    repo.eigeneProjekte(),
    repo.alleExtras(),
  ]);

  stand = { ustrich: alsStand(us), mvv: alsStand(mvv) };

  const ausUstrich = (us?.projekte || []).map((p) => ({ ...p, bereich: "kl" }));
  const ausMvv = (mvv?.projekte || []).map((p) => ({ ...p, bereich: "mvv" }));
  const extraNachId = new Map(extras.map((e) => [e.id, e]));

  katalog = [...sammelpostenAlsProjekte(), ...ausUstrich, ...ausMvv, ...eigene].map((p) => {
    const x = extraNachId.get(p.id) || {};
    return {
      ...p,
      adresse: x.adresse ?? p.adresse ?? null,
      lat: x.lat ?? null,
      lng: x.lng ?? null,
      favorit: !!x.favorit,
      versteckt: !!x.versteckt,
      geoText: x.adresse || p.adresse || p.geoHinweis || p.ort || null,
      suchtext: [p.nr, p.kuerzel, p.name, p.ort, p.kreis, p.auftrag, p.auftraggeber]
        .filter(Boolean).join(" ").toLowerCase(),
    };
  });

  nachId = new Map(katalog.map((p) => [p.id, p]));
  return katalog;
}

export const alleProjekte = () => katalog;
export const projekt = (id) => nachId.get(id) || null;
export const projekteDesBereichs = (b) => katalog.filter((p) => p.bereich === b && !p.versteckt);
export const sammelposten = (b = null) => katalog.filter((p) => p.sammelposten && (!b || p.bereich === b));
export const katalogStand = () => stand;
/** Keine der beiden Listen da — die App zeigt dann nur Sammelposten und
 *  eigene Projekte. Traegt den Hinweis in "Mehr". */
export const katalogeFehlen = () => !stand.ustrich && !stand.mvv;

/** Wie eine Buchung zu beschriften ist, deren Projekt der Katalog nicht kennt.
 *  Der Unterschied ist wichtig: unmittelbar nach einem Update sind die Listen
 *  kurz leer, bis der Abgleich sie aus OneDrive geholt hat — das ist kein
 *  geloeschtes Projekt und darf nicht so aussehen. */
export function fehlendesProjektText(projektId) {
  if (!projektId) return "Ohne Projekt";
  return katalogeFehlen() ? "Projektliste noch nicht geladen" : "Projekt nicht mehr im Katalog";
}

/** Buchstabensuche: "UW3" filtert auf die UW3-Projekte, "26/1" auf den Jahrgang.
 *  Mehrere Wörter wirken als UND. Sortierung nach Treffergüte, damit das
 *  Gemeinte oben steht und nicht der zufällig erste Namenstreffer. */
export function suche(text, { bereich = null, nurAktive = false, ohneSammelposten = false, limit = 60 } = {}) {
  const worte = (text || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  let basis = katalog.filter((p) => !p.versteckt);
  if (bereich) basis = basis.filter((p) => p.bereich === bereich);
  if (nurAktive) basis = basis.filter((p) => p.aktiv);
  if (ohneSammelposten) basis = basis.filter((p) => !p.sammelposten);

  if (worte.length === 0) {
    return basis.slice()
      .sort((a, b) => (b.favorit - a.favorit) || (b.aktiv - a.aktiv)
        || (a.sammelposten === b.sammelposten ? 0 : a.sammelposten ? -1 : 1)
        || String(a.nr || "zzz").localeCompare(String(b.nr || "zzz")))
      .slice(0, limit);
  }

  const bewertet = [];
  for (const p of basis) {
    if (!worte.every((w) => p.suchtext.includes(w))) continue;
    bewertet.push({ p, punkte: guete(p, worte[0]) + (p.favorit ? 40 : 0) + (p.aktiv ? 15 : 0) });
  }
  bewertet.sort((a, b) => b.punkte - a.punkte || a.p.name.localeCompare(b.p.name));
  return bewertet.slice(0, limit).map((x) => x.p);
}

function guete(p, wort) {
  const k = (p.kuerzel || "").toLowerCase();
  const n = String(p.nr || "").toLowerCase();
  const name = p.name.toLowerCase();
  if (k === wort) return 100;
  if (n === wort) return 95;
  if (k.startsWith(wort)) return 80;
  if (n.startsWith(wort)) return 70;
  if (name.startsWith(wort)) return 60;
  if (name.includes(wort)) return 40;
  return 10;
}
