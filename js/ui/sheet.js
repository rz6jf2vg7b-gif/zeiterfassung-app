// Bottom-Sheet: der Dialog, den iOS-Nutzer erwarten — von unten, mit Griff,
// per Wisch nach unten schliessbar.
import { el, icon } from "../core/dom.js";

let offen = null;

export function sheet({ titel, inhalt, aktionen = [], beimSchliessen = null }) {
  schliesse();

  const griff = el("div", { class: "sheet-griff" });
  const kopf = el("div", { class: "sheet-kopf" }, [
    el("h2", { text: titel }),
    el("button", {
      class: "icon-knopf", "aria-label": "Schliessen",
      onclick: () => schliesse(),
    }, [icon("plus", 20)]),
  ]);
  kopf.querySelector(".icon-knopf svg").style.transform = "rotate(45deg)";

  const koerper = el("div", { class: "sheet-koerper" }, [inhalt]);
  const fuss = aktionen.length ? el("div", { class: "sheet-fuss" }, aktionen) : null;
  const blatt = el("div", { class: "sheet-blatt", role: "dialog", "aria-modal": "true" },
    [griff, kopf, koerper, fuss].filter(Boolean));
  const schleier = el("div", { class: "sheet-schleier" }, [blatt]);

  // Klick auf den Schleier schliesst -- aber nur, wenn er wirklich daneben
  // ging. Wird das angeklickte Element noch waehrend der Ereignisverarbeitung
  // aus dem DOM genommen (im Tagesblatt zeichnet der Pfeil den Inhalt neu),
  // haengt der Browser das Ereignis an den naechsten noch vorhandenen
  // Vorfahren -- und das ist der Schleier. Das Blatt schloss sich dadurch beim
  // Blaettern selbst. Der Merker wird gesetzt, solange das Blatt im Pfad liegt.
  blatt.addEventListener("click", (ev) => { ev.__imBlatt = true; });
  schleier.addEventListener("click", (ev) => {
    if (!ev.__imBlatt && ev.target === schleier) schliesse();
  });

  // Wisch nach unten zum Schliessen — nur am Griff und am Kopf, damit
  // Scrollen im Koerper davon unberuehrt bleibt.
  let startY = null;
  const greifzone = el("div");
  for (const zone of [griff, kopf]) {
    zone.addEventListener("touchstart", (ev) => { startY = ev.touches[0].clientY; }, { passive: true });
    zone.addEventListener("touchmove", (ev) => {
      if (startY === null) return;
      const weg = ev.touches[0].clientY - startY;
      if (weg > 0) blatt.style.transform = `translateY(${weg}px)`;
    }, { passive: true });
    zone.addEventListener("touchend", (ev) => {
      const weg = (ev.changedTouches[0].clientY - (startY ?? 0));
      blatt.style.transform = "";
      if (weg > 90) schliesse();
      startY = null;
    });
  }

  document.body.appendChild(schleier);
  document.body.classList.add("sheet-offen");
  requestAnimationFrame(() => schleier.classList.add("sichtbar"));
  offen = { schleier, beimSchliessen };
  return { schliessen: schliesse, koerper, blatt };
}

export function schliesse() {
  if (!offen) return;
  const { schleier, beimSchliessen } = offen;
  offen = null;
  schleier.classList.remove("sichtbar");
  document.body.classList.remove("sheet-offen");
  setTimeout(() => schleier.remove(), 220);
  if (beimSchliessen) beimSchliessen();
}

export const istOffen = () => offen !== null;

document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") schliesse(); });
