// Diagramme — bewusst nur eine Form: der liegende Balken.
//
// Vorher standen hier ein Säulendiagramm (Verlauf je Tag) und ein
// Anteilsbalken über die Lebensbereiche. Beides ist am 28.08.2026 entfallen:
//
//   Das Säulendiagramm wurde mit preserveAspectRatio="none" gezeichnet, also
//   ungleichmäßig auf die Bildschirmbreite gezerrt -- Säulenbreiten und
//   Abstände verzerrten je nach Gerät. Die Beschriftung lag in einer eigenen
//   Zeile darunter und konnte gar nicht an der Säule sitzen.
//
//   Der Anteilsbalken verglich Lebensbereiche miteinander. Genau das soll die
//   Auswertung nicht: MVV-Stunden und kreativLABOR42-Stunden gehören getrennt.
//
// Der liegende Balken hat den Wert lesbar daneben, verzerrt nichts, und ist
// dieselbe Darstellung wie im PDF-Nachweis -- App und Papier zeigen dasselbe.
import { el } from "../core/dom.js";
import * as fmt from "../core/fmt.js";

/** @param daten [{ label, neben?, wert }] — wert in Minuten
 *  @param hoechstens  wie viele Zeilen; der Rest wird zusammengefasst */
export function liegendeBalken(daten, { hoechstens = 10, sollMinuten = null } = {}) {
  const sortiert = daten.slice().filter((d) => d.wert > 0).sort((a, b) => b.wert - a.wert);
  if (!sortiert.length) {
    return el("div", { class: "leer" }, [el("p", { text: "Nichts darzustellen." })]);
  }

  const sichtbar = sortiert.slice(0, hoechstens);
  const restWert = sortiert.slice(hoechstens).reduce((s, d) => s + d.wert, 0);
  const restZahl = sortiert.length - sichtbar.length;
  if (restWert) sichtbar.push({ label: `${restZahl} weitere`, wert: restWert, gedaempft: true });

  // Bezug ist der größte Balken, nicht die Summe: sonst sind bei vielen
  // Posten alle Balken kurz und der Vergleich untereinander geht verloren.
  const hoechst = Math.max(...sichtbar.map((d) => d.wert));

  const zeilen = sichtbar.map((d) => {
    const spur = el("div", { class: "balken-spur" });
    const fuellung = el("div", { class: "spur-fuellung" + (d.gedaempft ? " gedaempft" : "") });
    fuellung.style.width = `${Math.max(1.5, (d.wert / hoechst) * 100)}%`;
    spur.appendChild(fuellung);

    return el("div", { class: "balken-zeile" }, [
      el("div", { class: "balken-name" }, [
        el("span", { class: "balken-titel", text: d.label }),
        d.neben ? el("span", { class: "balken-neben", text: d.neben }) : null,
      ].filter(Boolean)),
      spur,
      el("span", { class: "balken-wert", text: fmt.dezimal(d.wert) }),
    ]);
  });

  return el("figure", { class: "balkenwerk" }, [
    ...zeilen,
    sollMinuten
      ? el("p", { class: "balken-fuss", text: `Soll im Zeitraum: ${fmt.dezimal(sollMinuten)} Std` })
      : null,
  ].filter(Boolean));
}
