// Kalender — zeigt je Tag die gebuchte Summe, Feiertage, Abwesenheit und Lücken.
// Auf einen Blick erkennbar, wo Stunden fehlen; genau dafür ist er da.
import { el, icon } from "../core/dom.js";
import * as store from "../core/store.js";
import * as fmt from "../core/fmt.js";
import { heute, tageImMonat, alsDatumString } from "../core/time.js";
import { abwesenheitEintragen } from "../ui/abwesenheit.js";
import { tagesblatt } from "../ui/tagesblatt.js";
import { kontoBereiche, bereichWerte } from "../core/konten.js";
import * as router from "../core/router.js";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function zeichneKalender(wurzel) {
  const z = store.zustand;
  const { jahr, monat } = z.kalender;
  const heuteStr = heute();
  const mm = String(monat + 1).padStart(2, "0");
  const praefix = `${jahr}-${mm}`;

  const feiertage = store.feiertageDesMonats(jahr, monat);

  const summeProTag = new Map();
  const abwesenheitProTag = new Map();
  for (const e of z.eintraege) {
    summeProTag.set(e.datum, (summeProTag.get(e.datum) || 0) + e.minuten);
    if (e.art === "abwesenheit") abwesenheitProTag.set(e.datum, e.kategorie);
  }

  const monatsEintraege = z.eintraege.filter((e) => e.datum.startsWith(praefix));
  const monatsMinuten = monatsEintraege.reduce((s, e) => s + e.minuten, 0);
  const gebuchtImMonat = [...summeProTag.entries()].filter(([d]) => d.startsWith(praefix));
  const maxTag = Math.max(1, ...gebuchtImMonat.map(([, m]) => m));

  const luecken = lueckenFinden(jahr, monat, z.eintraege, feiertage, heuteStr);

  wurzel.append(
    el("div", { class: "kopfzeile" }, [
      el("h1", { text: "Kalender" }),
      el("p", { class: "kopf-neben",
        text: `${fmt.dauer(monatsMinuten)} · ${fmt.dezimal(monatsMinuten)} Std im Monat` }),
    ]),
    el("div", { class: "monatswechsel" }, [
      el("button", { class: "icon-knopf", "aria-label": "Voriger Monat", onclick: () => blaettern(-1) }, [icon("pfeilLinks", 18)]),
      el("button", { class: "monatsname", text: `${fmt.MONATE[monat]} ${jahr}`, onclick: springeHeute }),
      el("button", { class: "icon-knopf", "aria-label": "Nächster Monat", onclick: () => blaettern(1) }, [icon("pfeilRechts", 18)]),
    ]),
    gitter(jahr, monat, heuteStr, summeProTag, abwesenheitProTag, feiertage, luecken, maxTag),
    legende(luecken.size),
    el("div", { class: "knopfzeile" }, [
      el("button", { class: "knopf flach", text: "Urlaub oder Abwesenheit eintragen",
        onclick: () => abwesenheitEintragen({}) }),
    ])
  );
}

/** Lücke = zurückliegender Arbeitstag ohne Buchung und ohne Abwesenheit —
 *  und zwar je Lebensbereich geprüft. Ein Tag, an dem nur kreativLABOR42
 *  gebucht ist, bleibt für die MVV eine Lücke; die Arbeitstage der Bereiche
 *  können sich zudem unterscheiden. Zukünftige Tage zählen nicht. */
function lueckenFinden(jahr, monat, eintraege, feiertage, heuteStr) {
  const luecken = new Set();
  if (!store.zustand.einstellungen.lueckenwarnung) return luecken;

  const bereiche = kontoBereiche(store.zustand.einstellungen);
  if (!bereiche.length) return luecken;

  const belegt = new Map();   // "bereich|datum" -> true
  for (const e of eintraege) belegt.set(`${e.bereich}|${e.datum}`, true);

  for (const bereich of bereiche) {
    const werte = bereichWerte(store.zustand.einstellungen, bereich);
    for (let tag = 1; tag <= tageImMonat(jahr, monat); tag++) {
      const d = new Date(jahr, monat, tag);
      const datum = alsDatumString(d);
      if (datum >= heuteStr) continue;
      const wt = d.getDay() === 0 ? 7 : d.getDay();
      if (!werte.arbeitstage.includes(wt)) continue;
      if (feiertage.has(datum)) continue;
      if (belegt.has(`${bereich}|${datum}`)) continue;
      luecken.add(datum);
    }
  }
  return luecken;
}

function blaettern(richtung) {
  const k = store.zustand.kalender;
  let m = k.monat + richtung, j = k.jahr;
  if (m < 0) { m = 11; j -= 1; }
  if (m > 11) { m = 0; j += 1; }
  store.zustand.kalender = { jahr: j, monat: m };
  router.neuZeichnen();
}

function springeHeute() {
  const d = new Date();
  store.zustand.kalender = { jahr: d.getFullYear(), monat: d.getMonth() };
  router.neuZeichnen();
}

function gitter(jahr, monat, heuteStr, summeProTag, abwesenheit, feiertage, luecken, maxTag) {
  const g = el("div", { class: "kalendergitter" });
  WOCHENTAGE.forEach((w) => g.appendChild(el("div", { class: "kalender-wochentag", text: w })));

  const ersterWochentag = (new Date(jahr, monat, 1).getDay() + 6) % 7;
  for (let i = 0; i < ersterWochentag; i++) g.appendChild(el("div", { class: "kalendertag leer" }));

  for (let tag = 1; tag <= tageImMonat(jahr, monat); tag++) {
    const d = new Date(jahr, monat, tag);
    const datum = alsDatumString(d);
    const minuten = summeProTag.get(datum) || 0;
    const feiertag = feiertage.get(datum);
    const abw = abwesenheit.get(datum);
    const wochenende = [5, 6].includes((d.getDay() + 6) % 7);

    const klassen = ["kalendertag"];
    if (datum === heuteStr) klassen.push("heute");
    if (minuten) klassen.push("gebucht");
    if (wochenende) klassen.push("wochenende");
    if (datum > heuteStr) klassen.push("zukunft");
    if (feiertag) klassen.push("feiertag");
    if (abw) klassen.push("abwesend");
    if (luecken.has(datum)) klassen.push("luecke");

    const zeichen = feiertag ? "F" : (abw ? fmt.kategorieZeichen(abw) : null);

    const zelle = el("button", {
      class: klassen.join(" "),
      title: feiertag ? feiertag.name : (abw ? fmt.kategorieLabel(abw) : ""),
      onclick: () => tagesblatt(datum),
    }, [
      zeichen ? el("span", { class: "tag-zeichen", text: zeichen }) : null,
      el("span", { class: "tag-zahl", text: String(tag) }),
      minuten
        ? el("span", { class: "tag-summe", text: fmt.dezimal(minuten, 1) })
        : el("span", { class: "tag-summe leer-summe", text: "·" }),
    ]);
    if (minuten) zelle.style.setProperty("--fuellung", `${Math.round((minuten / maxTag) * 100)}%`);
    g.appendChild(zelle);
  }

  // Letzte Woche auffuellen, sonst bricht das Raster am Monatsende ab
  const belegt = ersterWochentag + tageImMonat(jahr, monat);
  for (let i = belegt % 7; i && i < 7; i++) g.appendChild(el("div", { class: "kalendertag leer" }));
  return g;
}

function legende(anzahlLuecken) {
  const teile = [
    "Zahl unter dem Datum = gebuchte Stunden (dezimal).",
    "F = Feiertag · U = Urlaub · K = Krank.",
  ];
  if (anzahlLuecken) {
    teile.push(`Schraffiert = Arbeitstag ohne Buchung (${anzahlLuecken} in diesem Monat).`);
  }
  return el("p", { class: "legende", text: teile.join(" ") });
}

