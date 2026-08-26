// Das Tagesblatt: ein einzelner Tag zum Nachtragen — mit Blättern.
//
// Warum blättern: Die Terminvorschläge aus dem Kalender sind der größte
// Zeitgewinn, aber ein Bauleitertag endet selten damit, dass abends alles
// gebucht ist. Nachgetragen wird ein paar Tage später, also muss man rückwärts
// durch die Tage gehen können. Vorwärts ebenso, um Bekanntes vorzubereiten.
//
// Zwei Dinge, die den Unterschied zwischen brauchbar und mühsam machen:
//   1. Nach dem Buchen bleibt das Blatt offen und zeigt denselben Tag erneut.
//      Sonst müsste man für jeden einzelnen Termin eines Tages neu öffnen.
//   2. Der Sprung "Heute" ist immer erreichbar, damit man sich nicht
//      zurückblättern muss.
import { el, icon } from "../core/dom.js";
import * as store from "../core/store.js";
import * as fmt from "../core/fmt.js";
import { heute, alsDatumString, ausDatumString } from "../core/time.js";
import { sheet } from "./sheet.js";
import { eintragsliste } from "./eintragsliste.js";
import { abwesenheitEintragen } from "./abwesenheit.js";
import { erfassen } from "./erfassen.js";
import { terminvorschlaege } from "./terminvorschlaege.js";

function verschoben(datum, tage) {
  const d = ausDatumString(datum);
  d.setDate(d.getDate() + tage);
  return alsDatumString(d);
}

/** Öffnet das Tagesblatt. Von hier aus wird geblättert, ohne es zu schließen. */
export function tagesblatt(datum) {
  const koerper = el("div");
  // Die Fussleiste wird einmal gebaut, der Tag darunter wechselt beim
  // Blaettern -- deshalb liest der Knopf den Tag zur Klickzeit ab.
  let aktuell = datum;
  const griff = sheet({
    titel: fmt.datumLang(datum),
    inhalt: koerper,
    aktionen: [
      el("button", { class: "knopf haupt", text: "Zeit eintragen",
        onclick: () => erfassen({ datum: aktuell }) }),
    ],
  });
  const ueberschrift = griff.blatt.querySelector(".sheet-kopf h2");

  const zeichne = (tag) => {
    aktuell = tag;
    koerper.replaceChildren();
    if (ueberschrift) ueberschrift.textContent = fmt.datumLang(tag);

    const heuteStr = heute();
    const feiertag = store.feiertageDerZeitspanne(tag, tag).get(tag);
    const eintraege = store.zustand.eintraege
      .filter((e) => e.datum === tag)
      .sort((a, b) => (a.von || "zz").localeCompare(b.von || "zz"));
    const summe = eintraege.reduce((s, e) => s + e.minuten, 0);

    koerper.append(
      el("div", { class: "monatswechsel" }, [
        el("button", { class: "icon-knopf", "aria-label": "Vortag",
          onclick: () => zeichne(verschoben(tag, -1)) }, [icon("pfeilLinks", 18)]),
        el("button", {
          class: "monatsname",
          text: tag === heuteStr ? "Heute" : fmt.datumKurz(tag),
          // Auf den Namen tippen springt zurück auf heute -- derselbe Griff
          // wie im Monatskalender.
          onclick: () => zeichne(heuteStr),
        }),
        el("button", { class: "icon-knopf", "aria-label": "Folgetag",
          onclick: () => zeichne(verschoben(tag, 1)) }, [icon("pfeilRechts", 18)]),
      ])
    );

    if (feiertag) {
      koerper.appendChild(el("div", { class: "datenzeile" }, [
        el("span", { class: "datenname", text: "Feiertag" }),
        el("span", { class: "datenwert", text: feiertag.name }),
      ]));
    }
    if (summe) {
      koerper.appendChild(el("div", { class: "tagessumme" }, [
        el("span", { class: "vorschau-wert", text: fmt.dauer(summe) }),
        el("span", { class: "vorschau-neben",
          text: `${fmt.dezimal(summe)} Std · ${fmt.anzahl(eintraege.length, "Eintrag", "Einträge")}` }),
      ]));
    }

    koerper.appendChild(eintragsliste(eintraege, { leerText: "An diesem Tag ist nichts erfasst." }));

    const vorschlaege = el("div");
    koerper.appendChild(vorschlaege);
    // Nach dem Buchen den Tag erneut aufschlagen: der gebuchte Termin
    // verschwindet aus der Liste, die uebrigen bleiben stehen.
    // Bewusst tagesblatt() und nicht zeichne(): das Buchungsblatt hat dieses
    // Blatt beim Oeffnen bereits geschlossen -- neu zeichnen wuerde in ein
    // Element schreiben, das nicht mehr im Dokument haengt.
    terminvorschlaege(vorschlaege, tag, {
      titel: "Termine an diesem Tag",
      nachBuchung: () => tagesblatt(tag),
    });

    koerper.appendChild(el("div", { class: "knopfzeile" }, [
      el("button", { class: "knopf flach", text: "Abwesenheit eintragen",
        onclick: () => abwesenheitEintragen({ datum: tag }) }),
    ]));
  };

  zeichne(datum);
  return griff;
}

/** Auswahlblatt für die Tage, an denen noch nichts gebucht ist.
 *  Vom Buchungsschluss-Hinweis aus -- dort war "Offene Tage ansehen" bisher
 *  nur Text ohne Wirkung. */
export function offeneTageBlatt(tage, { titel = "Nicht gebuchte Arbeitstage" } = {}) {
  const inhalt = el("div", { class: "karten" }, tage.map((tag) =>
    el("button", { class: "karte eintrag", onclick: () => tagesblatt(tag) }, [
      el("span", { class: "eintrag-marke", text: fmt.datumKurz(tag).slice(0, 2) }),
      el("div", { class: "eintrag-text" }, [
        el("div", { class: "eintrag-name", text: fmt.datumLang(tag) }),
        el("div", { class: "eintrag-meta", text: "nichts gebucht — zum Nachtragen tippen" }),
      ]),
    ])
  ));
  sheet({ titel: `${titel} (${tage.length})`, inhalt });
}
