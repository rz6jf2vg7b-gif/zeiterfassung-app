// IndexedDB — nur Oeffnen, Migration und die vier rohen Operationen.
// Fachlogik gehoert nach repo.js, damit ein spaeterer Wechsel der Ablage
// (native App, Server) genau diese Datei ersetzt und sonst nichts.

const NAME = "zeiterfassung";
const VERSION = 3;

export const STORE_EINTRAEGE = "eintraege";
export const STORE_PROJEKTE = "projekte";   // selbst angelegte Projekte (MVV, Eigene)
export const STORE_EXTRAS = "extras";       // Zusatzinfos zu Projekten (Adresse, Favorit)
export const STORE_KONFIG = "konfig";
export const STORE_KATALOGE = "kataloge";  // Projektlisten (untermStrich, MVV) — siehe unten

// v2 -> v3: Die Projektkataloge lagen bis dahin als data/projects.*.json im
// ausgelieferten Web-Ordner und waren damit oeffentlich abrufbar. Sie liegen
// jetzt hier in der Datenbank und kommen ausschliesslich aus Steffens OneDrive
// oder aus einer von Hand gewaehlten Datei. Nichts zu migrieren — der Store ist
// beim ersten Abgleich wieder gefuellt.

let dbPromise = null;

/** v1 -> v2: Die alte Fassung speicherte Eintraege mit englischen Feldnamen und
 *  die Projektliste als einen einzigen Klumpen unter meta.projectData. Beides
 *  wird hier uebernommen — die alten Projekt-IDs waren Slugs ("qgw"), die es im
 *  neuen ustrich-Katalog nicht gibt, deshalb werden sie als eigene Projekte
 *  angelegt. Kein Eintrag geht verloren, aber die Zuordnung sollte einmal
 *  durchgesehen werden (Hinweis erscheint in den Einstellungen). */
function migriereV1(db, tx) {
  if (!db.objectStoreNames.contains("entries")) return;

  const alteEintraege = tx.objectStore("entries");
  const alteMeta = db.objectStoreNames.contains("meta") ? tx.objectStore("meta") : null;
  const neuEintraege = tx.objectStore(STORE_EINTRAEGE);
  const neuProjekte = tx.objectStore(STORE_PROJEKTE);
  const neuKonfig = tx.objectStore(STORE_KONFIG);

  const bereichAlt = { kreativlabor42: "kl", mvv: "mvv" };
  const projektNamen = new Map();

  const metaReq = alteMeta ? alteMeta.get("projectData") : null;
  const uebernehmen = () => {
    alteEintraege.getAll().onsuccess = (ev) => {
      const alte = ev.target.result || [];
      for (const a of alte) {
        const jetzt = a.updatedAt || a.createdAt || new Date().toISOString();
        neuEintraege.put({
          id: a.id,
          projektId: `alt-${a.projectId}`,
          bereich: bereichAlt[a.lifeArea] || "kl",
          datum: a.date,
          minuten: a.durationMinutes || 0,
          von: null, bis: null, pause: 0,
          notiz: a.note || null,
          quelle: "migriert",
          angelegt: a.createdAt || jetzt,
          geaendert: jetzt,
          geloescht: null,
        });
      }
      if (alte.length) {
        neuKonfig.put({ key: "migrationV1", value: { anzahl: alte.length, am: new Date().toISOString(), geprueft: false } });
      }
    };
  };

  if (metaReq) {
    metaReq.onsuccess = (ev) => {
      const daten = ev.target.result?.value;
      for (const bereich of daten?.lifeAreas || []) {
        for (const p of bereich.projects || []) {
          projektNamen.set(p.id, p.label);
          neuProjekte.put({
            id: `alt-${p.id}`,
            quelle: "eigen",
            bereich: bereichAlt[bereich.id] || "kl",
            nr: p.code || null,
            name: p.label,
            kuerzel: p.code || null,
            aktiv: p.active !== false,
            angelegt: new Date().toISOString(),
            geaendert: new Date().toISOString(),
            geloescht: null,
          });
        }
      }
      uebernehmen();
    };
  } else {
    uebernehmen();
  }
}

export function oeffnen() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((ok, fehler) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;

      if (!db.objectStoreNames.contains(STORE_EINTRAEGE)) {
        const s = db.createObjectStore(STORE_EINTRAEGE, { keyPath: "id" });
        s.createIndex("datum", "datum");
        s.createIndex("projektId", "projektId");
      }
      if (!db.objectStoreNames.contains(STORE_PROJEKTE)) {
        db.createObjectStore(STORE_PROJEKTE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_EXTRAS)) {
        db.createObjectStore(STORE_EXTRAS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_KONFIG)) {
        db.createObjectStore(STORE_KONFIG, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_KATALOGE)) {
        db.createObjectStore(STORE_KATALOGE, { keyPath: "id" });
      }

      if (ev.oldVersion === 1) migriereV1(db, tx);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
    req.onblocked = () => fehler(new Error("Datenbank durch ein anderes Fenster blockiert — bitte andere Tabs schliessen."));
  });
  return dbPromise;
}

function fuehreAus(store, modus, arbeit) {
  return oeffnen().then((db) => new Promise((ok, fehler) => {
    const tx = db.transaction(store, modus);
    const req = arbeit(tx.objectStore(store));
    tx.onerror = () => fehler(tx.error);
    if (req) { req.onsuccess = () => ok(req.result); req.onerror = () => fehler(req.error); }
    else tx.oncomplete = () => ok();
  }));
}

export const alle = (store) => fuehreAus(store, "readonly", (s) => s.getAll());
export const holen = (store, id) => fuehreAus(store, "readonly", (s) => s.get(id));
export const schreiben = (store, wert) => fuehreAus(store, "readwrite", (s) => s.put(wert));
export const entfernen = (store, id) => fuehreAus(store, "readwrite", (s) => s.delete(id));

export function schreibeViele(store, werte) {
  return oeffnen().then((db) => new Promise((ok, fehler) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const w of werte) s.put(w);
    tx.oncomplete = () => ok(werte.length);
    tx.onerror = () => fehler(tx.error);
  }));
}
