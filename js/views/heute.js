// Der Tag — die Ansicht, die morgens und abends offen ist.
// Timer oben, dann Tages- und Wochensumme, Terminvorschläge aus dem Kalender,
// und die Buchungen des Tages.
//
// Sie zeigt nicht zwingend heute: direkt unter der Überschrift stehen Pfeile,
// mit denen man durch die Tage geht. Nachgetragen wird selten am selben Abend,
// und der Kalender weiß auch für vorgestern noch, was war. Vorwärts geht es
// ebenso, um Bekanntes vorzubereiten.
// Der Tag steht im Modul und nicht im Zustand: er ist Anzeige, keine Buchung,
// und soll beim nächsten App-Start nicht wieder auf einem alten Datum stehen.
import { el, icon, hinweis } from "../core/dom.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as router from "../core/router.js";
import * as fmt from "../core/fmt.js";
import { heute, wochenstart, alsDatumString, ausDatumString, laufzeitMinuten, kalenderwoche, jetztUhrzeit, dauerAlsMinuten } from "../core/time.js";
import { eintragsliste } from "../ui/eintragsliste.js";
import { erfassen } from "../ui/erfassen.js";
import { abwesenheitEintragen } from "../ui/abwesenheit.js";
import { sheet, schliesse } from "../ui/sheet.js";
import { projektpicker } from "../ui/projektpicker.js";
import { saldoZeile, abschlussHinweis } from "../ui/konten.js";
import { terminvorschlaege } from "../ui/terminvorschlaege.js";

let uhrTakt = null;

// null bedeutet "heute" -- so stimmt die Ansicht auch dann noch, wenn die App
// über Mitternacht offen bleibt.
let angezeigterTag = null;

const gezeigterTag = () => angezeigterTag || heute();

/** Wird beim Tippen auf den Reiter "Heute" aufgerufen: zurück auf den
 *  heutigen Tag, egal wie weit geblättert wurde. */
export function zurueckAufHeute() {
  angezeigterTag = null;
}

function blaettern(tage) {
  const d = ausDatumString(gezeigterTag());
  d.setDate(d.getDate() + tage);
  const neu = alsDatumString(d);
  angezeigterTag = neu === heute() ? null : neu;
  router.neuZeichnen();
}

export function zeichneHeute(wurzel) {
  clearInterval(uhrTakt);
  const z = store.zustand;
  const heuteStr = heute();
  const tag = gezeigterTag();
  const istHeute = tag === heuteStr;

  const desTages = z.eintraege
    .filter((e) => e.datum === tag)
    .sort((a, b) => (a.von || "zz").localeCompare(b.von || "zz"));

  const wocheVon = alsDatumString(wochenstart(ausDatumString(tag)));
  const wocheBis = alsDatumString(new Date(ausDatumString(wocheVon).getTime() + 6 * 86400000));
  const wocheMinuten = z.eintraege
    .filter((e) => e.datum >= wocheVon && e.datum <= wocheBis)
    .reduce((s, e) => s + e.minuten, 0);
  const summeTag = desTages.reduce((s, e) => s + e.minuten, 0);

  const feiertag = store.feiertageDerZeitspanne(tag, tag).get(tag);

  wurzel.append(
    el("div", { class: "kopfzeile" }, [
      el("h1", { text: istHeute ? "Heute" : ausDatumString(tag).toLocaleDateString("de-DE", { weekday: "long" }) }),
      el("p", { class: "kopf-neben",
        text: fmt.datumLang(tag) + (feiertag ? ` · ${feiertag.name}` : "") }),
    ]),
    // Blättern direkt unter der Überschrift -- hier wird es gesucht.
    el("div", { class: "monatswechsel ohne-linie" }, [
      el("button", { class: "icon-knopf", "aria-label": "Vortag", onclick: () => blaettern(-1) }, [icon("pfeilLinks", 18)]),
      el("button", {
        class: "monatsname",
        text: istHeute ? "Heute" : "Zurück auf heute",
        onclick: () => { angezeigterTag = null; router.neuZeichnen(); },
      }),
      el("button", { class: "icon-knopf", "aria-label": "Folgetag", onclick: () => blaettern(1) }, [icon("pfeilRechts", 18)]),
    ])
  );

  // Ein Timer gilt immer dem Jetzt -- an einem anderen Tag waere er sinnlos.
  if (istHeute) wurzel.appendChild(timerKarte(z));

  wurzel.append(
    el("div", { class: "kennzahlen" }, [
      kennzahl(istHeute ? "Heute" : fmt.datumKurz(tag), fmt.dauer(summeTag), `${fmt.dezimal(summeTag)} Std`),
      kennzahl(`KW ${kalenderwoche(ausDatumString(tag))}`, fmt.dauer(wocheMinuten), `${fmt.dezimal(wocheMinuten)} Std`),
      kennzahl(desTages.length === 1 ? "Eintrag" : "Einträge", String(desTages.length), istHeute ? "heute" : "an dem Tag"),
    ]),
    schnellzugriff(tag)
  );

  const saldo = saldoZeile();
  if (saldo) wurzel.insertBefore(saldo, wurzel.lastChild);

  const warnung = abschlussHinweis();
  if (warnung) wurzel.appendChild(warnung);

  const vorschlagsbereich = el("div");
  wurzel.appendChild(vorschlagsbereich);
  terminvorschlaege(vorschlagsbereich, tag, { titel: istHeute ? "Aus dem Kalender" : "Termine an diesem Tag" });

  wurzel.append(
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: istHeute ? "Erfasst heute" : "Erfasst an diesem Tag" }),
      el("button", { class: "text-knopf", text: "Nachtragen", onclick: () => erfassen({ datum: tag }) }),
    ]),
    eintragsliste(desTages, { leerText: istHeute ? "Heute noch nichts erfasst." : "An diesem Tag ist nichts erfasst." })
  );

  if (istHeute && z.timer) uhrTakt = setInterval(() => aktualisiereUhr(wurzel), 1000);
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
