// Heute — die Ansicht, die morgens und abends offen ist.
// Timer oben, dann Tages- und Wochensumme, Terminvorschläge aus dem Kalender,
// und die Buchungen des Tages.
import { el, icon, hinweis } from "../core/dom.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as fmt from "../core/fmt.js";
import { heute, wochenstart, alsDatumString, laufzeitMinuten, kalenderwoche, jetztUhrzeit, dauerAlsMinuten } from "../core/time.js";
import { eintragsliste } from "../ui/eintragsliste.js";
import { erfassen } from "../ui/erfassen.js";
import { abwesenheitEintragen } from "../ui/abwesenheit.js";
import { sheet, schliesse } from "../ui/sheet.js";
import { projektpicker } from "../ui/projektpicker.js";
import { saldoZeile, abschlussHinweis } from "../ui/konten.js";
import { terminvorschlaege } from "../ui/terminvorschlaege.js";

let uhrTakt = null;

export function zeichneHeute(wurzel) {
  clearInterval(uhrTakt);
  const z = store.zustand;
  const heuteStr = heute();

  const heutige = z.eintraege
    .filter((e) => e.datum === heuteStr)
    .sort((a, b) => (b.angelegt || "").localeCompare(a.angelegt || ""));

  const wocheVon = alsDatumString(wochenstart(new Date()));
  const wocheMinuten = z.eintraege
    .filter((e) => e.datum >= wocheVon && e.datum <= heuteStr)
    .reduce((s, e) => s + e.minuten, 0);
  const summeHeute = heutige.reduce((s, e) => s + e.minuten, 0);

  const feiertag = store.feiertageDerZeitspanne(heuteStr, heuteStr).get(heuteStr);

  wurzel.append(
    el("div", { class: "kopfzeile" }, [
      el("h1", { text: "Heute" }),
      el("p", { class: "kopf-neben",
        text: fmt.datumLang(heuteStr) + (feiertag ? ` · ${feiertag.name}` : "") }),
    ]),
    timerKarte(z),
    el("div", { class: "kennzahlen" }, [
      kennzahl("Heute", fmt.dauer(summeHeute), `${fmt.dezimal(summeHeute)} Std`),
      kennzahl(`KW ${kalenderwoche(new Date())}`, fmt.dauer(wocheMinuten), `${fmt.dezimal(wocheMinuten)} Std`),
      kennzahl(heutige.length === 1 ? "Eintrag" : "Einträge", String(heutige.length), "heute"),
    ]),
    schnellzugriff(heuteStr)
  );

  const saldo = saldoZeile();
  if (saldo) wurzel.insertBefore(saldo, wurzel.lastChild);

  const warnung = abschlussHinweis();
  if (warnung) wurzel.appendChild(warnung);

  const vorschlagsbereich = el("div");
  wurzel.appendChild(vorschlagsbereich);
  terminvorschlaege(vorschlagsbereich, heuteStr);

  wurzel.append(
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: "Erfasst heute" }),
      el("button", { class: "text-knopf", text: "Nachtragen", onclick: () => erfassen({ datum: heuteStr }) }),
    ]),
    eintragsliste(heutige, { leerText: "Heute noch nichts erfasst." })
  );

  if (z.timer) uhrTakt = setInterval(() => aktualisiereUhr(wurzel), 1000);
}

function kennzahl(label, wert, neben) {
  return el("div", { class: "kennzahl" }, [
    el("span", { class: "kennzahl-wert", text: wert }),
    el("span", { class: "kennzahl-label", text: label }),
    el("span", { class: "kennzahl-neben", text: neben }),
  ]);
}

/** Zwei Griffe, die täglich gebraucht werden und sonst drei Ebenen tief lägen:
 *  NOP/Akquise ohne Projektsuche, und Urlaub eintragen. */
function schnellzugriff(datum) {
  const sammel = katalog.sammelposten();
  const zeile = el("div", { class: "chipzeile", style: { marginTop: "var(--a4)" } });
  zeile.appendChild(el("span", { class: "chip-label feldname", text: "Ohne Projekt" }));
  for (const s of sammel.slice(0, 4)) {
    zeile.appendChild(el("button", {
      class: "chip", text: s.name.split(" / ")[0],
      onclick: () => erfassen({ projektId: s.id, datum }),
    }));
  }
  zeile.appendChild(el("button", {
    class: "chip", text: "Urlaub …", onclick: () => abwesenheitEintragen({ datum }),
  }));
  return zeile;
}

// ---- Timer ---------------------------------------------------------------

function timerKarte(z) {
  if (!z.timer) {
    return el("button", { class: "timer-karte start", onclick: timerProjektWaehlen }, [
      el("span", { class: "timer-icon" }, [icon("start", 14)]),
      el("span", { class: "timer-text" }, [
        el("span", { class: "timer-titel", text: "Timer starten" }),
        el("span", { class: "timer-neben", text: "Läuft weiter, auch wenn die App zu ist" }),
      ]),
    ]);
  }

  const p = katalog.projekt(z.timer.projektId);
  const seit = new Date(z.timer.startIso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return el("div", { class: "timer-karte laeuft" }, [
    el("span", { class: "timer-puls" }),
    el("div", { class: "timer-text" }, [
      el("span", { class: "timer-titel", text: p ? p.name : "Timer läuft" }),
      el("span", { class: "timer-neben", text: `seit ${seit} Uhr` }),
    ]),
    el("span", { class: "timer-uhr", id: "timer-uhr", text: uhrText(laufzeitMinuten(z.timer.startIso)) }),
    el("button", { class: "knopf stopp", onclick: () => timerStoppen(z.timer) }, [icon("stopp", 12), "Stopp"]),
  ]);
}

function uhrText(minuten) {
  return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")}`;
}

function aktualisiereUhr(wurzel) {
  const z = store.zustand;
  const feld = wurzel.querySelector("#timer-uhr");
  if (!feld || !z.timer) { clearInterval(uhrTakt); return; }
  feld.textContent = uhrText(laufzeitMinuten(z.timer.startIso));
}

function timerProjektWaehlen() {
  const koerper = el("div");
  sheet({ titel: "Timer starten für …", inhalt: koerper });
  projektpicker(koerper, {
    beiWahl: async (p) => {
      await store.timerStarten(p.id, p.bereich);
      schliesse();
      hinweis(`Timer läuft auf ${fmt.projektKurz(p)}.`, "gut");
    },
  });
}

/** Beim Stoppen wird die Laufzeit auf 5 Minuten gerundet vorgeschlagen und
 *  bleibt änderbar — eine Stoppuhr trifft nie genau das, was abgerechnet wird. */
function timerStoppen(timer) {
  const p = katalog.projekt(timer.projektId);
  const roh = laufzeitMinuten(timer.startIso);
  const startZeit = new Date(timer.startIso);

  const feld = el("input", { type: "text", class: "feld gross-eingabe", value: uhrText(Math.max(5, Math.round(roh / 5) * 5)) });
  const notiz = el("textarea", { class: "feld", rows: "2", placeholder: "Notiz (optional)" });

  sheet({
    titel: "Timer stoppen",
    inhalt: el("div", {}, [
      el("div", { class: "projektkopf statisch" }, [
        el("span", { class: "treffer-marke", text: p ? (p.kuerzel || p.nr || "—") : "?" }),
        el("span", { class: "treffer-text" }, [
          el("span", { class: "treffer-name", text: p ? p.name : "Projekt" }),
          el("span", { class: "treffer-meta", text: `gelaufen ${uhrText(roh)} h · gerundet auf 5 Minuten` }),
        ]),
      ]),
      el("label", { class: "feldblock" }, [el("span", { class: "feldname", text: "Zu buchende Dauer" }), feld]),
      el("label", { class: "feldblock" }, [el("span", { class: "feldname", text: "Notiz" }), notiz]),
    ]),
    aktionen: [
      el("button", { class: "knopf flach", text: "Verwerfen", onclick: async () => {
        await store.timerAbbrechen(); schliesse(); hinweis("Timer verworfen.", "info");
      } }),
      el("button", { class: "knopf haupt", text: "Buchen", onclick: async () => {
        const min = dauerAlsMinuten(feld.value);
        if (!min || min <= 0) return hinweis("Dauer nicht erkannt.", "warnung");
        await store.eintragAnlegen({
          projektId: timer.projektId, bereich: timer.bereich,
          datum: alsDatumString(startZeit), minuten: min,
          von: startZeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          bis: jetztUhrzeit(1), pause: 0,
          notiz: notiz.value, quelle: "timer",
          abrechenbar: p?.sammelposten ? false : store.zustand.einstellungen.abrechenbarVorgabe !== false,
        });
        await store.timerAbbrechen();
        schliesse();
        hinweis(`${fmt.dauer(min)} gebucht.`, "gut");
      } }),
    ],
  });
}
