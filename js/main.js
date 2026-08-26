// Start der App: Ansichten registrieren, Navigation verdrahten, loslegen.
import { el, icon, hinweis } from "./core/dom.js";
import * as router from "./core/router.js";
import * as store from "./core/store.js";
import * as microsoft from "./sync/microsoft.js";
import * as auto from "./sync/auto.js";
import { erfassen } from "./ui/erfassen.js";
import { zeichneHeute } from "./views/heute.js";
import { zeichneKalender } from "./views/kalender.js";
import { zeichneProjekte } from "./views/projekte.js";
import { zeichneAuswertung } from "./views/auswertung.js";
import { zeichneMehr } from "./views/mehr.js";

const ANSICHTEN = [
  { id: "heute", label: "Heute", icon: "heute", zeichnen: zeichneHeute },
  { id: "kalender", label: "Kalender", icon: "kalender", zeichnen: zeichneKalender },
  { id: "projekte", label: "Projekte", icon: "projekte", zeichnen: zeichneProjekte },
  { id: "auswertung", label: "Auswertung", icon: "auswertung", zeichnen: zeichneAuswertung },
  { id: "mehr", label: "Mehr", icon: "mehr", zeichnen: zeichneMehr },
];

const wurzel = document.getElementById("ansicht");
const navLeiste = document.getElementById("navigation");

for (const a of ANSICHTEN) router.registrieren(a.id, a.zeichnen);

// Navigation — der Erfassungsknopf sitzt in der Mitte, weil er der meistgenutzte ist.
const navKnoepfe = new Map();
ANSICHTEN.forEach((a, i) => {
  if (i === 2) {
    navLeiste.appendChild(el("button", {
      class: "nav-erfassen", "aria-label": "Zeit erfassen",
      onclick: () => erfassen({}),
    }, [icon("plus", 24), el("span", { class: "nur-breit", text: "Erfassen" })]));
  }
  const knopf = el("button", {
    class: "nav-knopf", dataset: { ansicht: a.id },
    onclick: () => router.zeige(a.id),
  }, [icon(a.icon, 22), el("span", { text: a.label })]);
  navKnoepfe.set(a.id, knopf);
  navLeiste.appendChild(knopf);
});

router.verdrahten(wurzel, (name) => {
  for (const [id, knopf] of navKnoepfe) knopf.classList.toggle("aktiv", id === name);
  wurzel.scrollTop = 0;
});

store.abonnieren(() => router.neuZeichnen());

async function start() {
  // Kommen wir gerade von der Microsoft-Anmeldung zurueck?
  const rueckkehr = await microsoft.rueckkehrPruefen();

  // Entra gibt Einzelseitenanwendungen ein Aktualisierungs-Token, das nach
  // genau 24 Stunden verfaellt und sich nicht verlaengern laesst. Kurz davor
  // wird es hier still erneuert -- eine Umleitung mit prompt=none, die bei
  // bestehender Microsoft-Sitzung sofort zurueckkommt. Vor dem ersten
  // Zeichnen, damit hoechstens ein Flackern sichtbar wird und keine
  // aufgebaute Ansicht wieder verschwindet.
  if (!rueckkehr && microsoft.erneuerungFaellig() && await microsoft.stillErneuern()) return;

  await store.starten();
  router.zeige(router.startAnsicht(), { verlauf: false });

  if (rueckkehr) {
    // Die stille Erneuerung laeuft taeglich -- sie darf sich nicht melden.
    if (rueckkehr.ok) { if (!rueckkehr.still) hinweis("Mit OneDrive verbunden.", "gut"); }
    else if (rueckkehr.still) {
      hinweis("Die Anmeldung bei Microsoft ist abgelaufen — unter „Mehr“ neu anmelden.", "warnung");
      router.zeige("mehr");
    } else {
      hinweis(rueckkehr.meldung, "warnung");
      router.zeige("mehr");
    }
  }

  // Ab hier gleicht die App selbsttaetig ab -- beim Start, nach Aenderungen,
  // beim Zurueckkehren und im Takt. Siehe sync/auto.js.
  auto.starten();
}

// Beim Zurueckkehren in die App: Timeruhr und Datum stimmen sonst nicht mehr.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") router.neuZeichnen();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

start();
