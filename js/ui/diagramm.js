// Diagramme als reine SVG-Zeichnung, monochrom.
// Kein Diagrammpaket: die zwei Formen, die hier gebraucht werden, sind mit
// Bordmitteln kürzer als jede Bibliothek — und nur so lassen sie sich in
// dieselbe Sprache aus Haarlinien und Graustufen bringen wie der Rest.
import { el } from "../core/dom.js";
import * as fmt from "../core/fmt.js";

const NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}) {
  const k = document.createElementNS(NS, tag);
  for (const [n, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) k.setAttribute(n, v);
  }
  return k;
}

/** Säulendiagramm: eine Säule je Eintrag, optional eine gestrichelte Soll-Linie.
 *  daten: [{ label, wert, betont? }]  — wert in Minuten. */
export function saeulen(daten, { sollMinuten = null, hoehe = 132, beschriftung = 6 } = {}) {
  if (!daten.length) return el("div", { class: "leer" }, [el("p", { text: "Nichts darzustellen." })]);

  const B = 320, H = hoehe;
  const randUnten = 18, randOben = 12;
  const flaeche = H - randUnten - randOben;
  const spalte = B / daten.length;
  const breite = Math.max(2, Math.min(spalte * 0.62, 22));

  const hoechst = Math.max(sollMinuten || 0, ...daten.map((d) => d.wert), 1);
  const y = (wert) => randOben + flaeche - (wert / hoechst) * flaeche;

  const bild = svg("svg", {
    viewBox: `0 0 ${B} ${H}`, class: "diagramm", preserveAspectRatio: "none",
    role: "img", "aria-label": "Säulendiagramm der erfassten Stunden",
  });

  // Grundlinie
  bild.appendChild(svg("line", { x1: 0, y1: randOben + flaeche, x2: B, y2: randOben + flaeche, class: "d-achse" }));

  if (sollMinuten) {
    bild.appendChild(svg("line", { x1: 0, y1: y(sollMinuten), x2: B, y2: y(sollMinuten), class: "d-soll" }));
  }

  daten.forEach((d, i) => {
    const x = i * spalte + (spalte - breite) / 2;
    const oben = y(d.wert);
    if (d.wert > 0) {
      bild.appendChild(svg("rect", {
        x, y: oben, width: breite, height: Math.max(1, randOben + flaeche - oben),
        class: "d-saeule" + (d.betont ? " betont" : ""),
      }));
    }
  });

  // Beschriftung ausdünnen, damit sie bei vielen Säulen lesbar bleibt
  const schritt = Math.max(1, Math.ceil(daten.length / beschriftung));
  const spuren = el("div", { class: "diagramm-spuren" });
  daten.forEach((d, i) => {
    spuren.appendChild(el("span", {
      class: "d-spur" + (i % schritt === 0 ? "" : " leer"),
      text: i % schritt === 0 ? d.label : "",
    }));
  });

  return el("figure", { class: "diagramm-rahmen" }, [
    el("div", { class: "diagramm-kopf" }, [
      el("span", { class: "d-hoechst", text: fmt.dezimal(hoechst, 1) + " Std" }),
      sollMinuten ? el("span", { class: "d-legende", text: `Soll ${fmt.dezimal(sollMinuten, 1)}` }) : null,
    ].filter(Boolean)),
    bild, spuren,
  ]);
}

/** Anteilsbalken: ein durchgehender Balken, die Abschnitte über Graustufen
 *  unterschieden. Ersetzt das Kuchendiagramm — Anteile lassen sich in einer
 *  Reihe genauer vergleichen als über Winkel. */
export function anteilsbalken(gruppen, { hoechstens = 6 } = {}) {
  const gesamt = gruppen.reduce((s, g) => s + g.wert, 0);
  if (!gesamt) return el("div", { class: "leer" }, [el("p", { text: "Nichts darzustellen." })]);

  const sortiert = gruppen.slice().sort((a, b) => b.wert - a.wert);
  const sichtbar = sortiert.slice(0, hoechstens);
  const rest = sortiert.slice(hoechstens).reduce((s, g) => s + g.wert, 0);
  if (rest) sichtbar.push({ label: "Übrige", wert: rest });

  const balken = el("div", { class: "anteilsbalken" });
  sichtbar.forEach((g, i) => {
    const teil = el("div", {
      class: "anteil",
      title: `${g.label}: ${fmt.dauer(g.wert)}`,
    });
    teil.style.width = `${(g.wert / gesamt) * 100}%`;
    // Von dunkel nach hell — die Reihenfolge trägt die Information
    teil.style.background = `color-mix(in srgb, var(--text) ${Math.max(8, 88 - i * 14)}%, var(--grund))`;
    balken.appendChild(teil);
  });

  const legende = el("div", { class: "anteil-legende" }, sichtbar.map((g, i) => {
    const punkt = el("span", { class: "anteil-punkt" });
    punkt.style.background = `color-mix(in srgb, var(--text) ${Math.max(8, 88 - i * 14)}%, var(--grund))`;
    return el("span", { class: "anteil-eintrag" }, [
      punkt,
      el("span", { class: "anteil-name", text: g.label }),
      el("span", { class: "anteil-wert", text: `${Math.round((g.wert / gesamt) * 100)} %` }),
    ]);
  }));

  return el("figure", { class: "diagramm-rahmen" }, [balken, legende]);
}
