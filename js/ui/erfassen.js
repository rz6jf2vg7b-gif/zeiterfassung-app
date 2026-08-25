// Erfassungs-Dialog. Drei Wege zum selben Ziel, weil kein einzelner alle
// Situationen abdeckt:
//   Schnell  — Kachel antippen, fertig. Zwei Tipper nach der Projektwahl.
//   Von–Bis  — "7:30 bis 12:00, 30 min Pause". Wie der Bautag tatsaechlich lief.
//   Dauer    — freie Eingabe, versteht "1:30", "1,5", "90", "1h30".
// Der Timer sitzt nicht hier, sondern auf der Heute-Ansicht: er laeuft mit,
// waehrend die App geschlossen ist.
import { el, icon, hinweis } from "../core/dom.js";
import { sheet, schliesse } from "./sheet.js";
import { projektpicker } from "./projektpicker.js";
import * as katalog from "../data/catalog.js";
import * as store from "../core/store.js";
import { dauerAlsMinuten, spanneAlsMinuten, jetztUhrzeit, heute, uhrzeitAlsMinuten, minutenAlsUhrzeit } from "../core/time.js";
import * as fmt from "../core/fmt.js";

const SCHNELL = [15, 30, 60, 90, 120, 240, 300, 480];
const PAUSEN = [0, 15, 30, 45, 60];

/** oeffnet den Dialog. vorgabe: { projektId, datum, eintrag } — alles optional.
 *  Ist `eintrag` gesetzt, wird bearbeitet statt neu angelegt. */
export function erfassen(vorgabe = {}) {
  const bearbeiten = vorgabe.eintrag || null;
  let projekt = bearbeiten
    ? katalog.projekt(bearbeiten.projektId)
    : (vorgabe.projektId ? katalog.projekt(vorgabe.projektId) : null);

  const zustand = {
    datum: bearbeiten?.datum || vorgabe.datum || heute(),
    modus: bearbeiten ? (bearbeiten.von ? "spanne" : "dauer") : "schnell",
    von: bearbeiten?.von || null,
    bis: bearbeiten?.bis || null,
    pause: bearbeiten?.pause || 0,
    dauerText: bearbeiten && !bearbeiten.von ? fmt.dauer(bearbeiten.minuten).replace(" h", "") : "",
    notiz: bearbeiten?.notiz || "",
    // Sammelposten (NOP, Akquise) sind nie abrechenbar -- das ist ihr Zweck.
    abrechenbar: null,   // gleich unten aus Eintrag bzw. Projekt abgeleitet
  };

  /** Vorgabe fuer die Abrechenbarkeit. Muss an drei Stellen greifen:
   *  beim Bearbeiten, bei vorgewaehltem Projekt und nach der Projektwahl --
   *  sonst kaeme ein vorgewaehlter Sammelposten faelschlich als abrechenbar durch. */
  function abrechenbarVorbelegen() {
    if (bearbeiten) { zustand.abrechenbar = bearbeiten.abrechenbar !== false; return; }
    if (!projekt) { zustand.abrechenbar = null; return; }
    zustand.abrechenbar = projekt.sammelposten
      ? false
      : store.zustand.einstellungen.abrechenbarVorgabe !== false;
  }
  abrechenbarVorbelegen();

  const koerper = el("div");
  const dialog = sheet({
    titel: bearbeiten ? "Eintrag bearbeiten" : "Zeit erfassen",
    inhalt: koerper,
  });

  function zeichne() {
    koerper.replaceChildren();
    if (!projekt) {
      projektpicker(koerper, {
        bereich: null,
        beiWahl: (p) => { projekt = p; abrechenbarVorbelegen(); zeichne(); },
      });
      return;
    }
    zeichneFormular();
  }

  function zeichneFormular() {
    // Projektkopf — antippen wechselt das Projekt
    koerper.appendChild(el("button", {
      class: "projektkopf",
      onclick: () => { projekt = null; zeichne(); },
    }, [
      el("span", { class: "treffer-marke", text: projekt.kuerzel || projekt.nr || "—" }),
      el("span", { class: "treffer-text" }, [
        el("span", { class: "treffer-name", text: projekt.name }),
        el("span", { class: "treffer-meta", text: katalog.bereichLabel(projekt.bereich) + " · anderes Projekt wählen" }),
      ]),
      icon("pfeilRechts", 18),
    ]));

    // Datum
    const datumFeld = el("input", { type: "date", class: "feld", value: zustand.datum });
    datumFeld.addEventListener("change", () => { zustand.datum = datumFeld.value; aktualisiereVorschau(); });
    koerper.appendChild(el("label", { class: "feldzeile" }, [
      el("span", { class: "feldname", text: "Datum" }), datumFeld,
      el("button", { class: "mini-knopf", text: "Heute", onclick: () => { zustand.datum = heute(); datumFeld.value = zustand.datum; aktualisiereVorschau(); } }),
    ]));

    // Modus-Umschalter
    const modi = [["schnell", "Schnell"], ["spanne", "Von–Bis"], ["dauer", "Dauer"]];
    koerper.appendChild(el("div", { class: "segment gross" }, modi.map(([id, label]) =>
      el("button", {
        class: "segment-knopf" + (zustand.modus === id ? " aktiv" : ""),
        text: label,
        onclick: () => { zustand.modus = id; zeichneFormularNeu(); },
      })
    )));

    const bereich = el("div", { class: "modusbereich" });
    koerper.appendChild(bereich);
    if (zustand.modus === "schnell") zeichneSchnell(bereich);
    else if (zustand.modus === "spanne") zeichneSpanne(bereich);
    else zeichneDauer(bereich);

    // Abrechenbar — bei kreativLABOR42 trennt das Honorarleistung von Akquise,
    // bei MVV operative von nicht-operativen Stunden.
    koerper.appendChild(el("label", { class: "schalterzeile" }, [
      el("span", { class: "beschriftung" }, [
        "Abrechenbar",
        el("small", { text: projekt.sammelposten
          ? "Sammelposten zählen nicht als Projektstunde"
          : "Erscheint als eigene Spalte im Export" }),
      ]),
      (() => {
        const k = el("input", { type: "checkbox" });
        k.checked = zustand.abrechenbar !== false;
        k.addEventListener("change", () => { zustand.abrechenbar = k.checked; });
        return el("span", { class: "haken" }, [k]);
      })(),
    ]));

    // Notiz
    const notizFeld = el("textarea", { class: "feld", rows: "2", placeholder: "Notiz (optional) — was wurde gemacht?" });
    notizFeld.value = zustand.notiz;
    notizFeld.addEventListener("input", () => { zustand.notiz = notizFeld.value; });
    koerper.appendChild(el("label", { class: "feldblock" }, [
      el("span", { class: "feldname", text: "Notiz" }), notizFeld,
    ]));

    if (zustand.modus !== "schnell" || bearbeiten) {
      koerper.appendChild(vorschauZeile());
      koerper.appendChild(el("div", { class: "knopfzeile" }, [
        el("button", { class: "knopf haupt", text: bearbeiten ? "Änderung speichern" : "Eintragen", onclick: speichern }),
      ]));
    }
    if (bearbeiten) {
      koerper.appendChild(el("button", {
        class: "knopf gefahr flach", text: "Eintrag löschen",
        onclick: async () => {
          await store.eintragLoeschen(bearbeiten.id);
          schliesse();
          hinweisMitRueckgaengig(bearbeiten.id);
        },
      }));
    }
    aktualisiereVorschau();
  }

  function zeichneFormularNeu() { koerper.replaceChildren(); zeichneFormular(); }

  // ---- Modus: Schnell -----------------------------------------------------
  function zeichneSchnell(wurzel) {
    wurzel.appendChild(el("p", { class: "modus-hinweis", text: "Antippen trägt sofort ein." }));
    wurzel.appendChild(el("div", { class: "kachelgitter" }, SCHNELL.map((min) =>
      el("button", {
        class: "dauerkachel",
        onclick: () => speichernMit(min, { quelle: "schnell" }),
      }, [
        el("span", { class: "kachel-wert", text: fmt.dauer(min).replace(" h", "") }),
        el("span", { class: "kachel-dezimal", text: fmt.dezimal(min) + " h" }),
      ])
    )));
  }

  // ---- Modus: Von–Bis -----------------------------------------------------
  function zeichneSpanne(wurzel) {
    const vonFeld = zeitFeld("Von", zustand.von, (w) => { zustand.von = w; aktualisiereVorschau(); });
    const bisFeld = zeitFeld("Bis", zustand.bis, (w) => { zustand.bis = w; aktualisiereVorschau(); });
    wurzel.appendChild(el("div", { class: "zeitspanne" }, [vonFeld.knoten, bisFeld.knoten]));

    wurzel.appendChild(el("div", { class: "chipzeile" }, [
      el("span", { class: "chip-label", text: "Pause" }),
      ...PAUSEN.map((p) => el("button", {
        class: "chip" + (zustand.pause === p ? " aktiv" : ""),
        text: p === 0 ? "keine" : `${p} min`,
        onclick: (ev) => {
          zustand.pause = p;
          [...ev.target.parentElement.querySelectorAll(".chip")].forEach((c) => c.classList.remove("aktiv"));
          ev.target.classList.add("aktiv");
          aktualisiereVorschau();
        },
      })),
    ]));
  }

  function zeitFeld(label, wert, beiAenderung) {
    const feld = el("input", {
      type: "text", class: "feld zeit", inputmode: "numeric",
      placeholder: "--:--", value: wert || "",
    });
    const setze = (w) => { feld.value = w; beiAenderung(w); };
    feld.addEventListener("input", () => beiAenderung(feld.value));
    feld.addEventListener("blur", () => {
      const min = uhrzeitAlsMinuten(feld.value);
      if (min !== null) setze(minutenAlsUhrzeit(min));   // "730" -> "07:30"
    });
    const knoten = el("div", { class: "zeitfeld" }, [
      el("span", { class: "feldname", text: label }),
      feld,
      el("button", { class: "mini-knopf", text: "jetzt", onclick: () => setze(jetztUhrzeit()) }),
    ]);
    return { knoten, feld };
  }

  // ---- Modus: Dauer -------------------------------------------------------
  function zeichneDauer(wurzel) {
    const feld = el("input", {
      type: "text", class: "feld gross-eingabe", inputmode: "text",
      placeholder: "z. B. 1:30 · 1,5 · 90", value: zustand.dauerText,
    });
    feld.addEventListener("input", () => { zustand.dauerText = feld.value; aktualisiereVorschau(); });
    wurzel.appendChild(el("div", { class: "feldblock" }, [
      el("span", { class: "feldname", text: "Dauer" }), feld,
      el("span", { class: "modus-hinweis", text: "Versteht 1:30, 1,5, 90, 1h30 und 90min." }),
    ]));
    setTimeout(() => feld.focus(), 60);
  }

  // ---- Vorschau & Speichern ----------------------------------------------
  const vorschau = el("div", { class: "vorschau" });
  function vorschauZeile() { return vorschau; }

  function berechneMinuten() {
    if (zustand.modus === "spanne") return spanneAlsMinuten(zustand.von, zustand.bis, zustand.pause);
    if (zustand.modus === "dauer") return dauerAlsMinuten(zustand.dauerText);
    return null;
  }

  function aktualisiereVorschau() {
    const min = berechneMinuten();
    vorschau.replaceChildren();
    if (min === null || min <= 0) {
      vorschau.appendChild(el("span", { class: "vorschau-leer", text: "Noch keine gültige Dauer" }));
      return;
    }
    vorschau.appendChild(el("span", { class: "vorschau-wert", text: fmt.dauer(min) }));
    vorschau.appendChild(el("span", { class: "vorschau-neben", text: `${fmt.dezimal(min)} Std · ${fmt.datumKurz(zustand.datum)}` }));
  }

  async function speichern() {
    const min = berechneMinuten();
    if (!min || min <= 0) {
      hinweis(zustand.modus === "spanne" ? "Bitte Von- und Bis-Zeit prüfen." : "Dauer nicht erkannt — z. B. 1:30 oder 1,5.", "warnung");
      return;
    }
    await speichernMit(min, { quelle: zustand.modus });
  }

  async function speichernMit(minuten, { quelle }) {
    const daten = {
      projektId: projekt.id,
      bereich: projekt.bereich,
      datum: zustand.datum,
      minuten,
      von: quelle === "spanne" ? zustand.von : null,
      bis: quelle === "spanne" ? zustand.bis : null,
      pause: quelle === "spanne" ? zustand.pause : 0,
      notiz: zustand.notiz,
      abrechenbar: zustand.abrechenbar !== false,
      quelle,
    };
    if (bearbeiten) {
      Object.assign(bearbeiten, daten);
      await store.eintragAendern(bearbeiten);
      hinweis("Änderung gespeichert.", "gut");
    } else {
      await store.eintragAnlegen(daten);
      hinweis(`${fmt.dauer(minuten)} auf ${fmt.projektKurz(projekt)} gebucht.`, "gut");
    }
    schliesse();
  }

  zeichne();
  return dialog;
}

export function hinweisMitRueckgaengig(eintragId) {
  hinweis("Eintrag gelöscht.", "info");
  const box = document.getElementById("hinweis");
  if (!box) return;
  const knopf = el("button", { class: "hinweis-aktion", text: "Rückgängig", onclick: async () => {
    await store.eintragZurueckholen(eintragId);
    hinweis("Wiederhergestellt.", "gut");
  } });
  box.appendChild(knopf);
}
