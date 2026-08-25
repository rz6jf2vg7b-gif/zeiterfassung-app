// Auswertung — beantwortet die Fragen, die vor einer Rechnung oder einer
// Stundenmeldung anstehen: wie viel, worauf, in welchem Zeitraum.
// Die Lebensbereiche stehen immer getrennt oben, unabhängig vom Filter —
// kreativLABOR42 und MVV zusammenzuzählen ergibt keinen Sinn.
import { el, hinweis } from "../core/dom.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as fmt from "../core/fmt.js";
import { eintragsliste } from "../ui/eintragsliste.js";
import * as router from "../core/router.js";
import { exportiereXlsx } from "../export/xlsx.js";
import { exportierePdf } from "../export/pdf.js";
import { kontenBlock } from "../ui/konten.js";
import { geschaeftsjahr, voriges } from "../core/geschaeftsjahr.js";
import { kontoBereiche, bereichWerte, sollMinuten } from "../core/konten.js";
import { saeulen, anteilsbalken } from "../ui/diagramm.js";
import { heute, wochenstart, ausDatumString, alsDatumString, kalenderwoche } from "../core/time.js";

const ZEITRAEUME = [
  { id: "woche", label: "Woche" },
  { id: "monat", label: "Monat" },
  { id: "letzterMonat", label: "Vormonat" },
  { id: "gj", label: "Geschäftsjahr" },
  { id: "gjVor", label: "GJ davor" },
  { id: "jahr", label: "Kalenderjahr" },
  { id: "alles", label: "Alles" },
];

const einstellungenLesen = () => store.zustand.einstellungen;

export function zeitraumGrenzen(id) {
  const j = new Date();
  const heuteStr = heute();
  if (id === "woche") return { von: alsDatumString(wochenstart(j)), bis: heuteStr, titel: "Diese Woche" };
  if (id === "monat") {
    return { von: alsDatumString(new Date(j.getFullYear(), j.getMonth(), 1)), bis: heuteStr,
             titel: `${fmt.MONATE[j.getMonth()]} ${j.getFullYear()}` };
  }
  if (id === "letzterMonat") {
    const a = new Date(j.getFullYear(), j.getMonth() - 1, 1);
    const b = new Date(j.getFullYear(), j.getMonth(), 0);
    return { von: alsDatumString(a), bis: alsDatumString(b), titel: `${fmt.MONATE[a.getMonth()]} ${a.getFullYear()}` };
  }
  if (id === "gj" || id === "gjVor") {
    // Das Geschäftsjahr gilt je Lebensbereich. Ist einer gefiltert, zählt
    // seines; sonst das des ersten Bereichs, für den ein Konto geführt wird.
    const e = einstellungenLesen();
    const bezug = store.zustand.auswertung.bereich || kontoBereiche(e)[0] || "mvv";
    const startMonat = bereichWerte(e, bezug).geschaeftsjahrStart || 1;
    let gj = geschaeftsjahr(null, startMonat);
    if (id === "gjVor") gj = voriges(gj, startMonat);
    // Das laufende Geschaeftsjahr endet fuer die Auswertung heute, nicht am 30.09.
    const bis = gj.bis < heuteStr ? gj.bis : heuteStr;
    return { von: gj.von, bis, titel: `${startMonat === 1 ? "Jahr" : "Geschäftsjahr"} ${gj.label}${bezug ? " · " + katalog.bereichKurz(bezug) : ""}` };
  }
  if (id === "jahr") return { von: `${j.getFullYear()}-01-01`, bis: heuteStr, titel: `Kalenderjahr ${j.getFullYear()}` };
  return { von: "0000-01-01", bis: "9999-12-31", titel: "Gesamter Zeitraum" };
}

export function zeichneAuswertung(wurzel) {
  const z = store.zustand;
  const a = z.auswertung;
  const { von, bis, titel } = zeitraumGrenzen(a.zeitraum);

  const imZeitraum = z.eintraege.filter((e) => e.datum >= von && e.datum <= bis);
  const gefiltert = a.bereich ? imZeitraum.filter((e) => e.bereich === a.bereich) : imZeitraum;

  const buchungen = gefiltert.filter((e) => e.art !== "abwesenheit");
  const abwesend = gefiltert.filter((e) => e.art === "abwesenheit");
  const summe = buchungen.reduce((s, e) => s + e.minuten, 0);
  const abrechenbar = buchungen.filter((e) => e.abrechenbar !== false).reduce((s, e) => s + e.minuten, 0);

  wurzel.append(
    el("div", { class: "kopfzeile" }, [
      el("h1", { text: "Auswertung" }),
      el("p", { class: "kopf-neben", text: a.ansicht === "konten" ? "Stunden- und Urlaubskonto" : titel }),
    ]),
    el("div", { class: "segment gross" }, [["zeiten", "Zeiten"], ["konten", "Konten"]].map(([id, label]) =>
      el("button", {
        class: "segment-knopf" + ((a.ansicht || "zeiten") === id ? " aktiv" : ""),
        text: label,
        onclick: () => { a.ansicht = id; router.neuZeichnen(); },
      })
    ))
  );

  if ((a.ansicht || "zeiten") === "konten") {
    // Je Bereich ein Block, den Abschluss des Geschäftsjahres jeweils oben:
    // er ist terminlich das Dringendste.
    wurzel.appendChild(kontenBlock());
    return;
  }

  // append() macht aus einem Nullwert den sichtbaren Text "null" — und
  // bereichsDiagramm liefert genau dann null, wenn nur ein Bereich Stunden hat.
  const anhaengen = (...teile) => wurzel.append(...teile.filter(Boolean));

  anhaengen(
    el("div", { class: "segment" }, ZEITRAEUME.map((r) =>
      el("button", {
        class: "segment-knopf" + (a.zeitraum === r.id ? " aktiv" : ""),
        text: r.label,
        onclick: () => { a.zeitraum = r.id; router.neuZeichnen(); },
      })
    )),
    bereichsspalten(imZeitraum, a.bereich),
    summenblock(summe, abrechenbar, buchungen.length, abwesend),
    verlaufsDiagramm(buchungen, von, bis, a.bereich),
    a.bereich ? null : bereichsDiagramm(buchungen),
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: "Aufschlüsselung" }),
      el("button", { class: "text-knopf",
        text: a.bereich ? `Filter: ${katalog.bereichKurz(a.bereich)} ✕` : "Alle Bereiche",
        onclick: () => { a.bereich = null; router.neuZeichnen(); } }),
    ]),
    el("div", { class: "segment klein" }, [["projekt", "Projekt"], ["bereich", "Bereich"], ["monat", "Monat"], ["abrechenbar", "Abrechenbarkeit"]].map(([id, label]) =>
      el("button", {
        class: "segment-knopf" + (a.gruppierung === id ? " aktiv" : ""),
        text: label,
        onclick: () => { a.gruppierung = id; router.neuZeichnen(); },
      })
    )),
    gruppenListe(buchungen, a.gruppierung, summe),
    el("div", { class: "abschnitt-titel" }, [el("h2", { text: "Export" })]),
    el("div", { class: "knopfzeile zwei" }, [
      el("button", { class: "knopf", text: "Excel (.xlsx)", onclick: () => {
        if (!gefiltert.length) return hinweis("Nichts zu exportieren.", "warnung");
        exportiereXlsx(gefiltert, { titel, von, bis });
      } }),
      el("button", { class: "knopf flach", text: "PDF", onclick: () => {
        if (!buchungen.length) return hinweis("Nichts zu exportieren.", "warnung");
        exportierePdf(buchungen, { titel, von, bis });
      } }),
    ]),
    el("div", { class: "abschnitt-titel" }, [el("h2", { text: `Einzelbuchungen (${gefiltert.length})` })]),
    eintragsliste(
      gefiltert.slice().sort((x, y) => y.datum.localeCompare(x.datum)),
      { mitDatum: true, leerText: "Keine Einträge in diesem Zeitraum." }
    )
  );
}

/** Die Lebensbereiche nebeneinander — der Blick, der als erstes gebraucht wird.
 *  Antippen filtert die Aufschlüsselung darunter auf diesen Bereich. */
function bereichsspalten(eintraege, aktiverBereich) {
  const spalten = el("div", { class: "bereichsspalten" });
  spalten.style.gridTemplateColumns = `repeat(${katalog.BEREICHE.length}, 1fr)`;

  for (const b of katalog.BEREICHE) {
    const eigene = eintraege.filter((e) => e.bereich === b.id && e.art !== "abwesenheit");
    const minuten = eigene.reduce((s, e) => s + e.minuten, 0);
    const abw = eintraege.filter((e) => e.bereich === b.id && e.art === "abwesenheit").length;

    spalten.appendChild(el("button", {
      class: "bereichsspalte" + (minuten ? "" : " leer-bereich"),
      style: aktiverBereich === b.id ? { outline: "2px solid var(--linie-tinte)", outlineOffset: "-2px" } : {},
      onclick: () => {
        store.zustand.auswertung.bereich = aktiverBereich === b.id ? null : b.id;
        router.neuZeichnen();
      },
    }, [
      el("span", { class: "bereich-name", text: b.kurz }),
      el("span", { class: "bereich-wert", text: fmt.dezimal(minuten, 1) }),
      el("span", { class: "bereich-neben", text: abw ? `${fmt.dauer(minuten)} · ${abw} Abw.` : fmt.dauer(minuten) }),
    ]));
  }
  return spalten;
}

function summenblock(minuten, abrechenbarMinuten, anzahl, abwesend) {
  const nichtAbrechenbar = minuten - abrechenbarMinuten;
  const zeilen = [
    `${fmt.dezimal(minuten)} Stunden dezimal · ${fmt.anzahl(anzahl, "Buchung", "Buchungen")}`,
    nichtAbrechenbar > 0
      ? `davon abrechenbar ${fmt.dezimal(abrechenbarMinuten)} · nicht abrechenbar ${fmt.dezimal(nichtAbrechenbar)}`
      : null,
    abwesend.length ? `${fmt.anzahl(abwesend.length, "Tag", "Tage")} Abwesenheit (nicht in der Summe)` : null,
  ].filter(Boolean);

  return el("div", { class: "summenkarte" }, [
    el("span", { class: "summe-gross", text: fmt.dauer(minuten) }),
    ...zeilen.map((t) => el("span", { class: "summe-neben", text: t })),
  ]);
}

function gruppenListe(eintraege, art, gesamt) {
  const gruppen = new Map();
  for (const e of eintraege) {
    let schluessel, label;
    if (art === "projekt") {
      const p = katalog.projekt(e.projektId);
      schluessel = e.projektId || "ohne";
      label = p ? fmt.projektZeile(p) : katalog.fehlendesProjektText(e.projektId);
    } else if (art === "bereich") {
      schluessel = e.bereich;
      label = katalog.bereichLabel(e.bereich);
    } else if (art === "abrechenbar") {
      schluessel = e.abrechenbar === false ? "nein" : "ja";
      label = e.abrechenbar === false ? "Nicht abrechenbar" : "Abrechenbar";
    } else {
      schluessel = e.datum.slice(0, 7);
      const [j, m] = schluessel.split("-");
      label = `${fmt.MONATE[+m - 1]} ${j}`;
    }
    const g = gruppen.get(schluessel) || { label, minuten: 0, anzahl: 0 };
    g.minuten += e.minuten; g.anzahl += 1;
    gruppen.set(schluessel, g);
  }

  const sortiert = [...gruppen.values()].sort((a, b) =>
    art === "monat" ? a.label.localeCompare(b.label) : b.minuten - a.minuten);

  if (!sortiert.length) return el("div", { class: "leer" }, [el("p", { text: "Keine Daten im Zeitraum." })]);

  return el("div", { class: "karten" }, sortiert.map((g) => {
    const anteil = gesamt ? Math.round((g.minuten / gesamt) * 100) : 0;
    const balken = el("div", { class: "balken" }, [el("div", { class: "balken-fuellung" })]);
    balken.firstChild.style.width = `${Math.max(1, anteil)}%`;
    return el("div", { class: "karte gruppe" }, [
      el("div", { class: "gruppe-kopf" }, [
        el("span", { class: "gruppe-label", text: g.label }),
        el("span", { class: "gruppe-wert", text: fmt.dauer(g.minuten) }),
      ]),
      balken,
      el("div", { class: "gruppe-fuss",
        text: `${fmt.dezimal(g.minuten)} Std · ${anteil} % · ${fmt.anzahl(g.anzahl, "Buchung", "Buchungen")}` }),
    ]);
  }));
}


// ---- Grafik --------------------------------------------------------------

/** Säulendiagramm über den Zeitraum. Die Zusammenfassung richtet sich nach der
 *  Länge: bis sechs Wochen je Tag, bis ein halbes Jahr je Kalenderwoche,
 *  darüber je Monat — sonst stehen entweder drei Säulen oder dreihundert. */
function verlaufsDiagramm(eintraege, von, bis, bereich) {
  if (!eintraege.length) return null;

  const ersterTag = eintraege.reduce((a, e) => (e.datum < a ? e.datum : a), eintraege[0].datum);
  const start = von === "0000-01-01" ? ersterTag : von;
  const tage = Math.round((ausDatumString(bis) - ausDatumString(start)) / 86400000) + 1;
  const art = tage <= 45 ? "tag" : tage <= 200 ? "woche" : "monat";

  const koerbe = new Map();
  const beschriften = (datum) => {
    const d = ausDatumString(datum);
    if (art === "tag") return { schluessel: datum, label: String(d.getDate()) };
    if (art === "woche") {
      const kw = kalenderwoche(d);
      return { schluessel: `${datum.slice(0, 4)}-W${String(kw).padStart(2, "0")}`, label: String(kw) };
    }
    return { schluessel: datum.slice(0, 7), label: fmt.MONATE[d.getMonth()].slice(0, 3) };
  };

  // Auch leere Abschnitte zeigen -- eine Lücke ist eine Aussage
  if (art === "tag") {
    for (let d = ausDatumString(start); alsDatumString(d) <= bis; d.setDate(d.getDate() + 1)) {
      const { schluessel, label } = beschriften(alsDatumString(d));
      koerbe.set(schluessel, { label, wert: 0, datum: alsDatumString(d) });
    }
  }
  for (const e of eintraege) {
    const { schluessel, label } = beschriften(e.datum);
    const k = koerbe.get(schluessel) || { label, wert: 0, datum: e.datum };
    k.wert += e.minuten;
    koerbe.set(schluessel, k);
  }

  const daten = [...koerbe.values()].sort((a, b) => a.datum.localeCompare(b.datum));

  // Soll-Linie nur bei Tagesansicht und nur, wenn ein Bereich gefiltert ist —
  // sonst vergleicht man Stunden mehrerer Bereiche mit einem Tagessoll.
  let soll = null;
  if (art === "tag" && bereich) {
    const werte = bereichWerte(store.zustand.einstellungen, bereich);
    soll = Math.round(werte.sollStundenTag * 60);
  }

  return el("div", {}, [
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: art === "tag" ? "Verlauf je Tag" : art === "woche" ? "Verlauf je Kalenderwoche" : "Verlauf je Monat" }),
    ]),
    saeulen(daten, { sollMinuten: soll }),
  ]);
}

/** Anteil der Lebensbereiche als ein Balken. */
function bereichsDiagramm(eintraege) {
  const proBereich = new Map();
  for (const e of eintraege) {
    proBereich.set(e.bereich, (proBereich.get(e.bereich) || 0) + e.minuten);
  }
  if (proBereich.size < 2) return null;
  const gruppen = [...proBereich.entries()].map(([id, wert]) => ({ label: katalog.bereichLabel(id), wert }));
  return el("div", {}, [
    el("div", { class: "abschnitt-titel" }, [el("h2", { text: "Anteil der Bereiche" })]),
    anteilsbalken(gruppen),
  ]);
}
