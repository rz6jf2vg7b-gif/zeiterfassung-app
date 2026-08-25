// Eintragsliste — von Heute, Kalender, Projekten und Auswertung gemeinsam genutzt.
import { el } from "../core/dom.js";
import * as katalog from "../data/catalog.js";
import * as fmt from "../core/fmt.js";
import { erfassen, hinweisMitRueckgaengig } from "./erfassen.js";

export function eintragsliste(eintraege, { mitDatum = false, leerText = "Keine Einträge." } = {}) {
  if (!eintraege.length) {
    return el("div", { class: "leer" }, [el("p", { text: leerText })]);
  }
  return el("div", { class: "karten" }, eintraege.map((e) => eintragsZeile(e, mitDatum)));
}

function eintragsZeile(e, mitDatum) {
  if (e.art === "abwesenheit") return abwesenheitsZeile(e, mitDatum);

  const p = katalog.projekt(e.projektId);
  const zeitraum = e.von && e.bis
    ? `${e.von}–${e.bis}${e.pause ? ` −${e.pause}′` : ""}`
    : null;
  const meta = [
    mitDatum ? fmt.datumKurz(e.datum) : null,
    zeitraum,
    e.abrechenbar === false && !p?.sammelposten ? "nicht abrechenbar" : null,
    e.notiz,
  ].filter(Boolean).join(" · ");

  return el("div", { class: "karte eintrag", onclick: () => erfassen({ eintrag: e }) }, [
    el("span", { class: "eintrag-marke", text: p ? (p.kuerzel || p.nr || "—") : "?" }),
    el("div", { class: "eintrag-text" }, [
      el("div", { class: "eintrag-name", text: p ? p.name : katalog.fehlendesProjektText(e.projektId) }),
      meta ? el("div", { class: "eintrag-meta", text: meta }) : null,
    ]),
    el("div", { class: "eintrag-dauer" }, [
      el("span", { class: "dauer-wert", text: fmt.dauer(e.minuten) }),
      el("span", { class: "dauer-dezimal", text: fmt.dezimal(e.minuten) }),
    ]),
  ]);
}

/** Abwesenheit ist keine Projektstunde und wird deshalb nicht wie eine
 *  dargestellt — und sie öffnet nicht den Erfassungsdialog, sondern lässt
 *  sich nur löschen (Zeitraum ändern heißt: neu eintragen). */
function abwesenheitsZeile(e, mitDatum) {
  const meta = [mitDatum ? fmt.datumKurz(e.datum) : null, katalog.bereichKurz(e.bereich), e.notiz]
    .filter(Boolean).join(" · ");
  return el("div", { class: "karte eintrag" }, [
    el("span", { class: "eintrag-marke", text: fmt.kategorieZeichen(e.kategorie) }),
    el("div", { class: "eintrag-text" }, [
      el("div", { class: "eintrag-name", text: fmt.kategorieLabel(e.kategorie) }),
      meta ? el("div", { class: "eintrag-meta", text: meta }) : null,
    ]),
    el("div", { class: "eintrag-dauer" }, [
      el("span", { class: "dauer-wert", text: fmt.dauer(e.minuten) }),
      el("span", { class: "dauer-dezimal", text: "Soll" }),
    ]),
  ]);
}
