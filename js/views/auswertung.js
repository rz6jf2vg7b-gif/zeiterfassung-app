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
import { kontoBereiche, bereichWerte } from "../core/konten.js";
import { liegendeBalken } from "../ui/diagramm.js";
import { heute, wochenstart, alsDatumString } from "../core/time.js";

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

/** Welcher Lebensbereich zuerst? Der mit den meisten Buchungen im Zeitraum --
 *  das ist im Alltag fast immer der gemeinte. Ohne Buchungen der erste, für
 *  den ein Konto geführt wird. */
function vorgabeBereich(eintraege) {
  const zaehler = new Map();
  for (const e of eintraege) zaehler.set(e.bereich, (zaehler.get(e.bereich) || 0) + 1);
  const beste = [...zaehler.entries()].sort((x, y) => y[1] - x[1])[0];
  return beste ? beste[0] : (kontoBereiche(einstellungenLesen())[0] || "mvv");
}

export function zeichneAuswertung(wurzel) {
  const z = store.zustand;
  const a = z.auswertung;
  const { von, bis, titel } = zeitraumGrenzen(a.zeitraum);

  const imZeitraum = z.eintraege.filter((e) => e.datum >= von && e.datum <= bis);
  if (!a.bereich) a.bereich = vorgabeBereich(imZeitraum);
  const gefiltert = imZeitraum.filter((e) => e.bereich === a.bereich);

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

  // Ein Lebensbereich, nie gemischt. MVV-Stunden und kreativLABOR42-Stunden
  // in einer Summe zu zeigen führt in die Irre -- sie gehören verschiedenen
  // Auftraggebern und werden getrennt abgerechnet (Steffen, 26.08.2026).
  // Die Bereichsspalten sind zugleich die Umschaltung; "Alle" gibt es nicht mehr.
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
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: "Aufschlüsselung" }),
      el("span", { class: "abschnitt-neben", text: katalog.bereichLabel(a.bereich) }),
    ]),
    el("div", { class: "segment klein" }, [["projekt", "Projekt"], ["monat", "Monat"], ["abrechenbar", "Abrechenbarkeit"]].map(([id, label]) =>
      el("button", {
        class: "segment-knopf" + (a.gruppierung === id ? " aktiv" : ""),
        text: label,
        onclick: () => { a.gruppierung = id; router.neuZeichnen(); },
      })
    )),
    liegendeBalken(gruppen(buchungen, a.gruppierung), { hoechstens: a.gruppierung === "monat" ? 24 : 10 }),
    exportblock(buchungen, a, { von, bis, titel }),
    el("div", { class: "abschnitt-titel" }, [el("h2", { text: `Einzelbuchungen (${gefiltert.length})` })]),
    eintragsliste(
      gefiltert.slice().sort((x, y) => y.datum.localeCompare(x.datum)),
      { mitDatum: true, leerText: "Keine Einträge in diesem Zeitraum." }
    )
  );
}

/** Ausgabe je Lebensbereich, Standard ohne Tagesbuchungen. Der Einzelnachweis
 *  wird nur angehängt, wenn ausdrücklich gewünscht -- im Regelfall liest ihn
 *  niemand, er macht aus einer Seite drei. */
function exportblock(buchungen, a, zeitraum) {
  const schalter = el("input", { type: "checkbox" });
  schalter.checked = !!a.mitEinzelnachweis;
  schalter.addEventListener("change", () => { a.mitEinzelnachweis = schalter.checked; });

  const optionen = () => ({
    ...zeitraum,
    bereich: a.bereich,
    mitEinzelnachweis: schalter.checked,
  });

  return el("div", {}, [
    el("div", { class: "abschnitt-titel" }, [
      el("h2", { text: "Export" }),
      el("span", { class: "abschnitt-neben", text: katalog.bereichLabel(a.bereich) }),
    ]),
    el("label", { class: "schalterzeile" }, [
      el("span", { class: "beschriftung" }, [
        "Einzelnachweis anhängen",
        el("small", { text: "jede Tagesbuchung mit Zeit und Notiz" }),
      ]),
      el("span", { class: "haken" }, [schalter]),
    ]),
    el("div", { class: "knopfzeile zwei" }, [
      el("button", { class: "knopf", text: "Excel (.xlsx)", onclick: () => {
        if (!buchungen.length) return hinweis("Nichts zu exportieren.", "warnung");
        exportiereXlsx(buchungen, optionen());
      } }),
      el("button", { class: "knopf flach", text: "PDF", onclick: () => {
        if (!buchungen.length) return hinweis("Nichts zu exportieren.", "warnung");
        exportierePdf(buchungen, optionen());
      } }),
    ]),
  ]);
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
      // Immer setzen, nie abwaehlen -- ohne Bereich gibt es keine Auswertung.
      onclick: () => {
        store.zustand.auswertung.bereich = b.id;
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

/** Fasst die Buchungen zusammen und liefert Zeilen für die Balken.
 *  "Bereich" ist als Gruppierung entfallen -- es ist immer genau einer. */
function gruppen(eintraege, art) {
  const gefunden = new Map();
  for (const e of eintraege) {
    let schluessel, label, neben = null;
    if (art === "abrechenbar") {
      schluessel = e.abrechenbar === false ? "nein" : "ja";
      label = e.abrechenbar === false ? "Nicht abrechenbar" : "Abrechenbar";
    } else if (art === "monat") {
      schluessel = e.datum.slice(0, 7);
      const [j, m] = schluessel.split("-");
      label = `${fmt.MONATE[+m - 1]} ${j}`;
    } else {
      const p = katalog.projekt(e.projektId);
      schluessel = e.projektId || "ohne";
      label = p ? p.name : katalog.fehlendesProjektText(e.projektId);
      neben = p ? [p.nr, p.auftrag && `Auftrag ${p.auftrag}`].filter(Boolean).join(" · ") : null;
    }
    const g = gefunden.get(schluessel) || { label, neben, wert: 0, anzahl: 0 };
    g.wert += e.minuten; g.anzahl += 1;
    gefunden.set(schluessel, g);
  }

  const liste = [...gefunden.values()];
  // Monate chronologisch, alles andere nach Gewicht
  return art === "monat" ? liste.sort((x, y) => x.label.localeCompare(y.label)) : liste;
}


