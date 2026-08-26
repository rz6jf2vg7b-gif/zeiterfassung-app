// Stunden- und Urlaubskonto als Anzeigebaustein — je Lebensbereich getrennt.
// MVV und kreativLABOR42 haben verschiedene Geschäftsjahre, Sollstunden und
// Urlaubsansprüche; sie in einer Zahl zusammenzufassen wäre falsch.
import { el } from "../core/dom.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as fmt from "../core/fmt.js";
import { datumDeutsch } from "../core/fmt.js";
import { stundenkonto, urlaubskonto, kontoBereiche, bereichWerte } from "../core/konten.js";
import { abschlussStand, geschaeftsjahr } from "../core/geschaeftsjahr.js";
import { abwesenheitEintragen } from "./abwesenheit.js";
import { erfassen } from "./erfassen.js";

const DRINGLICHKEIT = {
  ruhig:      { titel: "Vollständig gebucht", ton: "" },
  offen:      { titel: "Noch offene Tage", ton: "" },
  dringend:   { titel: "Buchungsschluss rückt näher", ton: " warnung" },
  kritisch:   { titel: "Buchungsschluss in Kürze", ton: " warnung" },
  abgelaufen: { titel: "Buchungsschluss überschritten", ton: " warnung" },
};

export function bereicheMitKonto() {
  return kontoBereiche(store.zustand.einstellungen);
}

function daten(bereichId) {
  const z = store.zustand;
  const werte = bereichWerte(z.einstellungen, bereichId);
  const gj = geschaeftsjahr(null, werte.geschaeftsjahrStart || 1);
  return {
    werte, gj,
    stunden: stundenkonto(z.eintraege, z.einstellungen, bereichId),
    urlaub: urlaubskonto(z.eintraege, z.einstellungen, bereichId, gj),
    abschluss: abschlussStand(z.eintraege, z.einstellungen, bereichId),
  };
}

// ---- Einzeiler für "Heute" ----------------------------------------------

/** Zeigt den Saldo des ersten Bereichs mit Konto; gibt es mehrere,
 *  stehen sie nebeneinander. */
export function saldoZeile() {
  const bereiche = bereicheMitKonto();
  if (!bereiche.length) return null;

  return el("div", { class: "saldoleiste" }, bereiche.map((id) => {
    const { stunden, urlaub } = daten(id);
    const vorzeichen = stunden.saldo >= 0 ? "+" : "−";
    return el("button", {
      class: "saldozeile",
      onclick: () => import("../core/router.js").then((r) => {
        store.zustand.auswertung.ansicht = "konten";
        r.zeige("auswertung");
      }),
    }, [
      el("span", { class: "saldo-wert", text: `${vorzeichen}${fmt.dauer(Math.abs(stunden.saldo))}` }),
      el("span", { class: "saldo-text" }, [
        el("span", { class: "saldo-titel",
          text: `${katalog.bereichKurz(id)} · ${stunden.saldo >= 0 ? "Überstunden" : "Minusstunden"}` }),
        el("span", { class: "saldo-neben", text: [
          `Stand ${datumDeutsch(stunden.bis)}`,
          stunden.tageAbfeierbar > 0 ? `${stunden.tageAbfeierbar} ${stunden.tageAbfeierbar === 1 ? "Tag" : "Tage"} abfeierbar` : null,
          urlaub.gesamt ? `${urlaub.rest} Urlaubstage übrig` : null,
        ].filter(Boolean).join(" · ") }),
      ]),
    ]);
  }));
}

/** Warnstreifen für „Heute" — erscheint nur, wenn wirklich etwas offen ist. */
export function abschlussHinweis() {
  for (const id of bereicheMitKonto()) {
    const a = daten(id).abschluss;
    if (!a.offen.length || a.restTage > 56) continue;
    const d = DRINGLICHKEIT[a.dringlichkeit];
    return el("button", {
      class: "karte block" + d.ton,
      onclick: () => import("../core/router.js").then((r) => {
        store.zustand.auswertung.ansicht = "konten";
        r.zeige("auswertung");
      }),
    }, [
      el("h2", { text: `${d.titel} — ${katalog.bereichLabel(id)}` }),
      el("p", { class: "block-text", text:
        `${a.offen.length} ${a.offen.length === 1 ? "Arbeitstag" : "Arbeitstage"} im `
        + `${a.kalenderjahr ? "Jahr" : "Geschäftsjahr"} ${a.label} `
        + `${a.offen.length === 1 ? "ist" : "sind"} noch nicht gebucht. `
        + (a.restTage >= 0
            ? `Bis zum Buchungsschluss am ${datumDeutsch(a.bis)} sind es noch ${a.restTage} Tage.`
            : `Der Buchungsschluss war am ${datumDeutsch(a.bis)}.`) }),
      // War bis 26.08.2026 ein span ohne Wirkung -- sah wie ein Knopf aus,
      // tat aber nichts. Fuehrt jetzt zur Liste der offenen Tage.
      el("button", { class: "text-knopf", text: "Offene Tage ansehen",
        onclick: async () => {
          const { offeneTageBlatt } = await import("./tagesblatt.js");
          offeneTageBlatt(a.offen);
        } }),
    ]);
  }
  return null;
}

// ---- Ausführliche Darstellung -------------------------------------------

export function kontenBlock() {
  const bereiche = bereicheMitKonto();
  const wurzel = el("div");

  if (!bereiche.length) {
    wurzel.appendChild(el("div", { class: "leer" }, [
      el("p", { text: "Für keinen Lebensbereich wird ein Konto geführt." }),
      el("p", { class: "leer-hinweis", text: "Unter Mehr → Lebensbereiche einschalten, für welchen Bereich Stunden- und Urlaubskonto gelten sollen." }),
    ]));
    return wurzel;
  }

  bereiche.forEach((id, i) => {
    if (i > 0) wurzel.appendChild(el("div", { class: "trennraum" }));
    wurzel.appendChild(bereichsBlock(id));
  });
  return wurzel;
}

function bereichsBlock(bereichId) {
  const { stunden, urlaub, abschluss, werte } = daten(bereichId);
  const vorzeichen = stunden.saldo >= 0 ? "+" : "−";
  const wurzel = el("div");
  const anhaengen = (...t) => wurzel.append(...t.filter(Boolean));

  // --- Abschluss des Geschäftsjahres ---
  anhaengen(
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: `${katalog.bereichLabel(bereichId)} — ${abschluss.kalenderjahr ? "Jahr" : "Geschäftsjahr"} ${abschluss.label}` }),
      el("span", { class: "block-neben", text: abschluss.vollstaendigesJahr
        ? `${datumDeutsch(abschluss.von)} – ${datumDeutsch(abschluss.bis)}`
        : `geprüft ab ${datumDeutsch(abschluss.pruefungAb)}` }),
    ]),
    el("div", { class: "kennzahlen" }, [
      kennzahl("Gebucht", fmt.dezimal(abschluss.minuten, 1), "Stunden"),
      kennzahl("Offen", String(abschluss.offen.length), abschluss.offen.length === 1 ? "Arbeitstag" : "Arbeitstage"),
      kennzahl(abschluss.restTage >= 0 ? "Bis Schluss" : "Überfällig",
               String(Math.abs(abschluss.restTage)), abschluss.restTage >= 0 ? "Tage" : "Tage her"),
    ])
  );

  if (abschluss.offen.length) {
    anhaengen(
      el("p", { class: "block-text nachdruck", text:
        `${abschluss.offen.length} ${abschluss.offen.length === 1 ? "Arbeitstag ist" : "Arbeitstage sind"} noch offen — `
        + `bis zum Buchungsschluss müssen sie gebucht oder als Abwesenheit erfasst sein.` }),
      el("div", { class: "chipzeile" }, [
        el("span", { class: "chip-label feldname", text: "Antippen zum Nachtragen" }),
        ...abschluss.offen.slice(-24).reverse().map((datum) =>
          el("button", { class: "chip", text: fmt.datumKurz(datum),
            onclick: () => erfassen({ datum, bereich: bereichId }) })),
      ]),
      abschluss.offen.length > 24
        ? el("p", { class: "block-hinweis", text: `Die 24 jüngsten sind gezeigt, insgesamt sind es ${abschluss.offen.length}.` })
        : null
    );
  } else {
    anhaengen(el("p", { class: "block-text",
      text: `Alle Arbeitstage seit dem ${datumDeutsch(abschluss.pruefungAb)} sind gebucht oder als Abwesenheit erfasst.` }));
  }

  // --- Stundenkonto ---
  anhaengen(
    el("div", { class: "abschnitt-titel" }, [el("h2", { text: "Stundenkonto" })]),
    el("div", { class: "summenkarte" }, [
      el("span", { class: "summe-gross", text: `${vorzeichen}${fmt.dauer(Math.abs(stunden.saldo))}` }),
      el("span", { class: "summe-neben", text: stunden.saldo >= 0
        ? `${fmt.dezimal(Math.abs(stunden.saldo))} Stunden Guthaben`
        : `${fmt.dezimal(Math.abs(stunden.saldo))} Stunden im Minus` }),
      stunden.tageAbfeierbar > 0
        ? el("span", { class: "summe-neben",
            text: `Reicht für ${stunden.tageAbfeierbar} ganze ${stunden.tageAbfeierbar === 1 ? "Tag" : "Tage"} bei ${werte.sollStundenTag} Std Soll` })
        : null,
    ].filter(Boolean)),
    el("div", { class: "datenzeilen" }, [
      datenzeile("Soll", `${fmt.dauer(stunden.soll)} · ${stunden.sollTage} Arbeitstage`),
      datenzeile("Ist", fmt.dauer(stunden.ist)),
      stunden.anfang ? datenzeile("Anfangsbestand", `${stunden.anfang >= 0 ? "+" : "−"}${fmt.dauer(Math.abs(stunden.anfang))}`) : null,
      stunden.abgefeiert ? datenzeile("Davon abgefeiert", fmt.dauer(stunden.abgefeiert)) : null,
      datenzeile("Stand", `${datumDeutsch(stunden.bis)} — heute zählt noch nicht mit`),
    ].filter(Boolean))
  );

  // --- Urlaubskonto ---
  if (urlaub.gesamt || urlaub.genommen || urlaub.geplant) {
    anhaengen(
      el("div", { class: "abschnitt-titel" }, [el("h2", { text: `Urlaub ${urlaub.label}` })]),
      el("div", { class: "kennzahlen" }, [
        kennzahl("Übrig", String(urlaub.rest), urlaub.rest === 1 ? "Tag" : "Tage"),
        kennzahl("Genommen", String(urlaub.genommen), "bis heute"),
        kennzahl("Geplant", String(urlaub.geplant), "eingetragen"),
      ]),
      el("div", { class: "datenzeilen" }, [
        datenzeile("Jahresanspruch", `${urlaub.anspruch} Tage`),
        urlaub.uebertrag ? datenzeile("Übertrag", `${urlaub.uebertrag} Tage`) : null,
        urlaub.krankheitstage ? datenzeile("Krankheitstage", String(urlaub.krankheitstage)) : null,
        urlaub.gleitzeittage ? datenzeile("Abgefeierte Tage", String(urlaub.gleitzeittage)) : null,
      ].filter(Boolean))
    );
  }

  anhaengen(el("div", { class: "knopfzeile zwei" }, [
    el("button", { class: "knopf", text: "Gleitzeit abfeiern",
      onclick: () => abwesenheitEintragen({ kategorie: "gleitzeit", bereich: bereichId }) }),
    el("button", { class: "knopf flach", text: "Urlaub eintragen",
      onclick: () => abwesenheitEintragen({ kategorie: "urlaub", bereich: bereichId }) }),
  ]));

  return wurzel;
}

function datenzeile(name, wert) {
  return el("div", { class: "datenzeile" }, [
    el("span", { class: "datenname", text: name }),
    el("span", { class: "datenwert", text: wert }),
  ]);
}

function kennzahl(label, wert, neben) {
  return el("div", { class: "kennzahl" }, [
    el("span", { class: "kennzahl-wert", text: wert }),
    el("span", { class: "kennzahl-label", text: label }),
    el("span", { class: "kennzahl-neben", text: neben }),
  ]);
}
