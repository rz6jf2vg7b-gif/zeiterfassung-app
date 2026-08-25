// Projekte — Suche und Karte in einer Ansicht. Die Karte war vorher ein eigener
// Tab und dauerhaft leer, weil die Adressen fehlten; hier steht sie direkt neben
// der Stelle, an der man Adressen pflegt.
import { el, icon, hinweis } from "../core/dom.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as repo from "../data/repo.js";
import * as fmt from "../core/fmt.js";
import * as router from "../core/router.js";
import { projektpicker } from "../ui/projektpicker.js";
import { sheet, schliesse } from "../ui/sheet.js";
import { erfassen } from "../ui/erfassen.js";
import { eintragsliste } from "../ui/eintragsliste.js";
import { zeichneKarte, navigationsZiel, appleMaps, googleMaps } from "../ui/karte.js";

let modus = "liste";

export function zeichneProjekte(wurzel) {
  const anzahl = katalog.alleProjekte().length;
  const mitOrt = katalog.alleProjekte().filter((p) => navigationsZiel(p)).length;

  wurzel.append(
    el("div", { class: "kopfzeile" }, [
      el("div", {}, [
        el("h1", { text: "Projekte" }),
        el("p", { class: "kopf-neben", text: `${anzahl} Projekte · ${mitOrt} mit Ort` }),
      ]),
    ]),
    el("div", { class: "segment" }, [["liste", "Liste"], ["karte", "Karte"]].map(([id, label]) =>
      el("button", {
        class: "segment-knopf" + (modus === id ? " aktiv" : ""),
        text: label,
        onclick: () => { modus = id; router.neuZeichnen(); },
      })
    ))
  );

  const bereich = el("div");
  wurzel.appendChild(bereich);
  if (modus === "karte") zeichneKarte(bereich, { beiProjekt: projektOeffnen });
  else projektpicker(bereich, { beiWahl: projektOeffnen, autofokus: false });
}

export function projektOeffnen(p) {
  const eintraege = store.zustand.eintraege
    .filter((e) => e.projektId === p.id)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  const summe = eintraege.reduce((s, e) => s + e.minuten, 0);
  const ziel = navigationsZiel(p);

  const adressFeld = el("input", {
    type: "text", class: "feld", placeholder: "Straße, PLZ, Ort",
    value: p.adresse || "",
  });
  adressFeld.addEventListener("change", async () => {
    const neu = adressFeld.value.trim() || null;
    if (neu === p.adresse) return;
    // Adresse geaendert -> alte Koordinaten verwerfen, sonst zeigt der Pin weiter auf den alten Ort
    await repo.setzeExtra(p.id, { adresse: neu, lat: null, lng: null });
    await store.projekteNachladen();
    hinweis("Adresse gespeichert.", "gut");
  });

  const koerper = el("div", {}, [
    el("div", { class: "projekt-kennzahlen" }, [
      el("div", { class: "kennzahl" }, [
        el("span", { class: "kennzahl-wert", text: fmt.dauer(summe) }),
        el("span", { class: "kennzahl-label", text: "In dieser App" }),
        el("span", { class: "kennzahl-neben", text: fmt.anzahl(eintraege.length, "Buchung", "Buchungen") }),
      ]),
      p.stundenUstrich ? el("div", { class: "kennzahl" }, [
        el("span", { class: "kennzahl-wert", text: String(p.stundenUstrich).replace(".", ",") }),
        el("span", { class: "kennzahl-label", text: "In untermStrich" }),
        el("span", { class: "kennzahl-neben", text: "Stunden gesamt" }),
      ]) : null,
    ].filter(Boolean)),

    el("div", { class: "datenzeilen" }, [
      p.nr ? datenzeile("Projektnummer", p.nr) : null,
      p.kuerzel ? datenzeile("Kürzel", p.kuerzel) : null,
      datenzeile("Bereich", katalog.bereichLabel(p.bereich)),
      p.ort ? datenzeile("Gemarkung", [p.ort, p.kreis, p.land].filter(Boolean).join(", ")) : null,
      datenzeile("Quelle", p.quelle === "ustrich" ? "untermStrich" : "in der App angelegt"),
    ].filter(Boolean)),

    el("label", { class: "feldblock" }, [
      el("span", { class: "feldname", text: "Adresse (für Karte und Navigation)" }),
      adressFeld,
      el("span", { class: "modus-hinweis", text: "untermStrich führt keine Straßenadresse — hier eintragen." }),
    ]),

    ziel ? el("div", { class: "knopfzeile zwei" }, [
      el("a", { class: "knopf flach", href: appleMaps(ziel), target: "_blank", rel: "noopener", text: "Apple Karten" }),
      el("a", { class: "knopf flach", href: googleMaps(ziel), target: "_blank", rel: "noopener", text: "Google Maps" }),
    ]) : null,

    el("div", { class: "abschnitt-titel" }, [el("h2", { text: `Buchungen (${eintraege.length})` })]),
    eintragsliste(eintraege.slice(0, 25), { mitDatum: true, leerText: "Auf dieses Projekt wurde noch nichts gebucht." }),
  ].filter(Boolean));

  sheet({
    titel: fmt.projektZeile(p),
    inhalt: koerper,
    aktionen: [
      el("button", { class: "knopf flach", text: "Timer starten", onclick: async () => {
        await store.timerStarten(p.id, p.bereich);
        schliesse();
        router.zeige("heute");
        hinweis(`Timer läuft auf ${fmt.projektKurz(p)}.`, "gut");
      } }),
      el("button", { class: "knopf haupt", text: "Zeit buchen", onclick: () => erfassen({ projektId: p.id }) }),
    ],
  });
}

function datenzeile(name, wert) {
  return el("div", { class: "datenzeile" }, [
    el("span", { class: "datenname", text: name }),
    el("span", { class: "datenwert", text: wert }),
  ]);
}
