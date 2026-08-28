// Termine aus dem Outlook-Kalender als Buchungsvorschlag.
// Für einen Bauleitertag ist das der größte Zeitgewinn: der Kalender weiß
// bereits, wann was war. Wird auf „Heute" und im Tagesblatt des Kalenders
// verwendet — nachtragen soll an jedem Datum möglich sein, nicht nur heute.
// Der Rückruf nachBuchung haelt das Tagesblatt offen, siehe ui/tagesblatt.js.
import { el, hinweis } from "../core/dom.js";
import * as store from "../core/store.js";
import * as fmt from "../core/fmt.js";
import { sheet, schliesse } from "./sheet.js";
import { projektpicker } from "./projektpicker.js";
import * as repo from "../data/repo.js";
import * as katalog from "../data/catalog.js";
import * as microsoft from "../sync/microsoft.js";
import * as outlook from "../sync/outlook.js";

// Einmal geholte Termine je Datum behalten — beim Blättern im Kalender
// würde sonst für jeden Tag erneut abgefragt.
const zwischenspeicher = new Map();

export function kalenderAktiv() {
  return store.zustand.einstellungen.kalenderLesen && microsoft.angemeldet();
}

export async function termineHolen(datum, { neuLaden = false } = {}) {
  if (!kalenderAktiv()) return [];
  if (!neuLaden && zwischenspeicher.has(datum)) return zwischenspeicher.get(datum);
  try {
    const termine = await outlook.termineDesTages(datum, store.zustand.einstellungen.kalenderId);
    zwischenspeicher.set(datum, termine);
    return termine;
  } catch {
    return [];   // offline oder Kalender nicht erreichbar — still übergehen
  }
}

export const speicherLeeren = () => zwischenspeicher.clear();

/** Hängt den Abschnitt an, sofern es unverbrauchte Termine gibt.
 *  Vorschläge, für die schon eine Buchung mit derselben Anfangszeit existiert,
 *  fallen weg — sonst bietet die App an, was längst gebucht ist. */
export async function terminvorschlaege(wurzel, datum, { titel = "Aus dem Kalender", neuLaden = false, nachBuchung = null } = {}) {
  if (!kalenderAktiv()) return;

  const termine = await termineHolen(datum, { neuLaden });
  if (!termine.length) return;

  const vorhandene = store.zustand.eintraege.filter((e) => e.datum === datum && e.von);
  const schonGebucht = new Set(vorhandene.map((e) => e.von));
  const offen = termine.filter((t) => !schonGebucht.has(t.von));
  if (!offen.length) return;

  wurzel.append(
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: titel }),
      el("button", { class: "text-knopf", text: "Neu laden", onclick: async () => {
        zwischenspeicher.delete(datum);
        if (nachBuchung) { nachBuchung(); return; }   // im Tagesblatt: dort neu zeichnen
        const r = await import("../core/router.js");
        r.neuZeichnen();
      } }),
    ]),
    el("div", { class: "karten" },
      // Gemerkte Zuordnungen vorab holen: im Aufbau der Zeile ginge nur ein
      // Versprechen, und die Zeile stuende dann ohne den Hinweis da.
      await Promise.all(offen.map(async (t) => {
        const gemerkt = katalog.projekt(await repo.kalenderProjektVorschlag(t.titel));
        return zeile(t, datum, nachBuchung, gemerkt);
      })))
  );
}

function zeile(termin, datum, nachBuchung, gemerkt) {
  return el("button", { class: "karte eintrag", onclick: () => buchen(termin, datum, nachBuchung, gemerkt) }, [
    el("span", { class: "eintrag-marke", text: termin.von }),
    el("div", { class: "eintrag-text" }, [
      el("div", { class: "eintrag-name", text: termin.titel }),
      el("div", { class: "eintrag-meta",
        text: gemerkt
          ? `→ ${fmt.projektKurz(gemerkt)}`
          : [`${termin.von}–${termin.bis}`, termin.ort].filter(Boolean).join(" · ") }),
    ]),
    el("div", { class: "eintrag-dauer" }, [
      el("span", { class: "dauer-wert", text: fmt.dauer(termin.minuten) }),
      el("span", { class: "dauer-dezimal", text: gemerkt ? "bestätigen" : "buchen" }),
    ]),
  ]);
}

function buchen(termin, datum, nachBuchung = null, gemerkt = null) {
  const koerper = el("div");
  sheet({ titel: "Termin buchen auf …", inhalt: koerper });

  koerper.appendChild(el("div", { class: "projektkopf statisch" }, [
    el("span", { class: "treffer-marke", text: termin.von }),
    el("span", { class: "treffer-text" }, [
      el("span", { class: "treffer-name", text: termin.titel }),
      el("span", { class: "treffer-meta",
        text: `${fmt.datumKurz(datum)} · ${termin.von}–${termin.bis} · ${fmt.dauer(termin.minuten)}` }),
    ]),
  ]));

  const eintragen = async (p) => {
    await store.eintragAnlegen({
      projektId: p.id, bereich: p.bereich, datum,
      minuten: termin.minuten, von: termin.von, bis: termin.bis, pause: 0,
      notiz: termin.titel, quelle: "kalender",
      abrechenbar: p.sammelposten ? false : store.zustand.einstellungen.abrechenbarVorgabe !== false,
      kalenderId: termin.kalenderId,
    });
    // Erst nach dem Buchen merken -- ein abgebrochener Dialog soll die
    // Zuordnung nicht verändern.
    await repo.kalenderProjektMerken(termin.titel, p.id);
    schliesse();
    hinweis(`${fmt.dauer(termin.minuten)} auf ${fmt.projektKurz(p)} gebucht.`, "gut");
    if (nachBuchung) nachBuchung();
  };

  // Bekannter Titel: das gemerkte Projekt steht oben, ein Tipper genügt.
  // Die Suche bleibt darunter -- ein Vorschlag darf nie ein Zwang sein.
  if (gemerkt) {
    koerper.appendChild(el("div", { class: "karte block" }, [
      el("p", { class: "block-neben", text: "Zuletzt gebucht auf" }),
      el("button", { class: "knopf haupt", text: fmt.projektKurz(gemerkt), onclick: () => eintragen(gemerkt) }),
      el("button", { class: "knopf flach", text: "Zuordnung vergessen", onclick: async (ev) => {
        await repo.kalenderZuordnungVergessen(termin.titel);
        ev.currentTarget.closest(".karte").remove();
        hinweis("Zuordnung entfernt.", "info");
      } }),
    ]));
  }

  const auswahl = el("div");
  koerper.appendChild(auswahl);
  projektpicker(auswahl, { beiWahl: eintragen });
}
