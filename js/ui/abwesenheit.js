// Urlaub, Krankheit und sonstige Abwesenheit über einen Zeitraum eintragen.
// Es entsteht je Arbeitstag ein Eintrag mit den Soll-Stunden — dadurch stimmt
// die Monatssumme, und die Lückenwarnung schlägt an Urlaubstagen nicht an.
// Wochenenden und Feiertage werden übersprungen.
import { el, hinweis } from "../core/dom.js";
import { sheet, schliesse } from "./sheet.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as repo from "../data/repo.js";
import * as fmt from "../core/fmt.js";
import { heute } from "../core/time.js";
import { bereichWerte, wirdGutgeschrieben } from "../core/konten.js";
import * as microsoft from "../sync/microsoft.js";
import * as outlook from "../sync/outlook.js";

const ARTEN = [
  { id: "urlaub", label: "Urlaub" },
  { id: "krank", label: "Krank" },
  { id: "gleitzeit", label: "Gleitzeit" },
  { id: "sonstiges", label: "Sonstiges" },
];

export function abwesenheitEintragen(vorgabe = {}) {
  const w = {
    kategorie: vorgabe.kategorie || "urlaub",
    von: vorgabe.datum || heute(),
    bis: vorgabe.datum || heute(),
    bereich: vorgabe.bereich || "mvv",
    notiz: "",
  };

  const koerper = el("div");
  sheet({ titel: "Abwesenheit eintragen", inhalt: koerper, aktionen: [
    el("button", { class: "knopf haupt", text: "Eintragen", onclick: () => speichern() }),
  ]});

  const vorschau = el("div", { class: "vorschau" });

  function zeichne() {
    koerper.replaceChildren();

    koerper.appendChild(el("div", { class: "segment gross" }, ARTEN.map((a) =>
      el("button", {
        class: "segment-knopf" + (w.kategorie === a.id ? " aktiv" : ""),
        text: a.label,
        onclick: () => { w.kategorie = a.id; zeichne(); },
      })
    )));

    const vonFeld = el("input", { type: "date", class: "feld", value: w.von });
    const bisFeld = el("input", { type: "date", class: "feld", value: w.bis });
    vonFeld.addEventListener("change", () => {
      w.von = vonFeld.value;
      if (w.bis < w.von) { w.bis = w.von; bisFeld.value = w.bis; }
      aktualisiere();
    });
    bisFeld.addEventListener("change", () => { w.bis = bisFeld.value; aktualisiere(); });

    koerper.append(
      el("label", { class: "feldzeile" }, [el("span", { class: "feldname", text: "Von" }), vonFeld]),
      el("label", { class: "feldzeile" }, [el("span", { class: "feldname", text: "Bis" }), bisFeld]),
      el("div", { class: "feldblock" }, [
        el("span", { class: "feldname", text: "Bereich" }),
        el("div", { class: "segment" }, katalog.BEREICHE.map((b) =>
          el("button", {
            class: "segment-knopf" + (w.bereich === b.id ? " aktiv" : ""),
            text: b.kurz,
            onclick: (ev) => {
              w.bereich = b.id;
              [...ev.target.parentElement.children].forEach((k) => k.classList.remove("aktiv"));
              ev.target.classList.add("aktiv");
              aktualisiere();
            },
          })
        )),
      ])
    );

    const notiz = el("input", { type: "text", class: "feld", placeholder: "Notiz (optional)", value: w.notiz });
    notiz.addEventListener("input", () => { w.notiz = notiz.value; });
    koerper.appendChild(el("label", { class: "feldblock" }, [
      el("span", { class: "feldname", text: "Notiz" }), notiz,
    ]));

    koerper.appendChild(vorschau);
    aktualisiere();
  }

  /** Vorschau zählt die tatsächlichen Tage: ohne Wochenende, ohne Feiertage.
   *  Genau die Zahl, die auch der Urlaubsantrag ausweist. */
  function aktualisiere() {
    const tage = store.arbeitstageZaehlen(w.von, w.bis, w.bereich);
    const werte = bereichWerte(store.zustand.einstellungen, w.bereich);
    const zehrt = !wirdGutgeschrieben(w.kategorie);
    const stunden = zehrt ? 0 : tage * werte.sollStundenTag;
    vorschau.replaceChildren(
      el("span", { class: "vorschau-wert", text: `${tage} ${tage === 1 ? "Tag" : "Tage"}` }),
      el("span", { class: "vorschau-neben",
        text: !tage ? "Kein Arbeitstag im gewählten Zeitraum"
          : zehrt
            ? `Zehrt ${fmt.dezimal(tage * werte.sollStundenTag * 60)} Std vom Stundenkonto · Wochenenden und Feiertage übersprungen`
            : `${fmt.dezimal(stunden * 60)} Std werden gutgeschrieben · Wochenenden und Feiertage übersprungen` })
    );
  }

  async function speichern() {
    if (!w.von || !w.bis || w.bis < w.von) return hinweis("Zeitraum prüfen.", "warnung");
    const angelegt = await store.abwesenheitAnlegen(w);
    if (!angelegt.length) return hinweis("Kein Arbeitstag im Zeitraum.", "warnung");

    schliesse();
    hinweis(`${angelegt.length} Tage ${fmt.kategorieLabel(w.kategorie)} eingetragen.`, "gut");

    // In den Outlook-Kalender schreiben, wenn eingeschaltet. Schlägt das fehl,
    // bleibt die Abwesenheit trotzdem erfasst -- der Kalender ist Beiwerk.
    const e = store.zustand.einstellungen;
    if (e.kalenderSchreiben && microsoft.angemeldet()) {
      try {
        const titel = w.notiz ? `${fmt.kategorieLabel(w.kategorie)} — ${w.notiz}` : fmt.kategorieLabel(w.kategorie);
        await outlook.abwesenheitSchreiben({ titel, von: w.von, bis: w.bis, kategorie: w.kategorie, kalenderId: e.kalenderId });
        hinweis("Auch im Kalender eingetragen.", "gut");
      } catch (f) {
        hinweis("Erfasst — Kalendereintrag fehlgeschlagen: " + f.message, "warnung");
      }
    }
  }

  zeichne();
}
