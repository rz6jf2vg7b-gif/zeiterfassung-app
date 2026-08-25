// Karte. untermStrich fuehrt keine Strassenadresse, nur Gemarkung/Kreis/Bundesland —
// das reicht fuer einen Pin auf Ortsebene. Wer genau navigieren will, traegt beim
// Projekt eine Adresse nach; die hat dann Vorrang.
import { el, hinweis } from "../core/dom.js";
import * as katalog from "../data/catalog.js";
import * as repo from "../data/repo.js";

export function navigationsZiel(p) {
  return p.adresse || p.geoHinweis || p.ort || null;
}
export const appleMaps = (ziel) => `https://maps.apple.com/?daddr=${encodeURIComponent(ziel)}`;
export const googleMaps = (ziel) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ziel)}`;

export function zeichneKarte(container, { beiProjekt }) {
  const mitOrt = katalog.alleProjekte().filter((p) => navigationsZiel(p));

  if (typeof L === "undefined") {
    container.appendChild(el("div", { class: "leer" }, [el("p", { text: "Kartenbibliothek nicht geladen." })]));
    return;
  }
  if (!mitOrt.length) {
    container.appendChild(el("div", { class: "leer" }, [
      el("p", { text: "Kein Projekt hat einen Ort." }),
      el("p", { class: "leer-hinweis", text: "Adresse beim Projekt eintragen — dann erscheint es hier." }),
    ]));
    return;
  }

  L.Icon.Default.imagePath = "vendor/images/";
  const leinwand = el("div", { class: "kartenflaeche", id: "kartenflaeche" });
  const stand = el("p", { class: "legende" });
  container.append(leinwand, stand);

  const karte = L.map(leinwand, { attributionControl: true }).setView([50.5, 9.0], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap", maxZoom: 18,
  }).addTo(karte);
  setTimeout(() => karte.invalidateSize(), 60);

  const punkte = [];
  const setzen = (p) => {
    if (p.lat == null || p.lng == null) return;
    const nadel = L.marker([p.lat, p.lng]).addTo(karte);
    const inhalt = el("div", {}, [
      el("strong", { text: p.name }),
      el("br"),
      el("span", { text: navigationsZiel(p) || "" }),
      el("br"),
      el("a", { href: "#", text: "Öffnen", onclick: (ev) => { ev.preventDefault(); beiProjekt(p); } }),
    ]);
    nadel.bindPopup(inhalt);
    punkte.push([p.lat, p.lng]);
  };

  mitOrt.forEach(setzen);
  if (punkte.length) karte.fitBounds(punkte, { padding: [30, 30] });

  const offen = mitOrt.filter((p) => p.lat == null || p.lng == null);
  if (!offen.length) {
    stand.textContent = `${mitOrt.length} Projekte auf der Karte.`;
    return;
  }
  stand.textContent = `${punkte.length} von ${mitOrt.length} verortet — Rest wird im Hintergrund gesucht …`;
  ortsSucheImHintergrund(offen, karte, punkte, setzen, stand);
}

/** Nominatim erlaubt rund eine Anfrage pro Sekunde. Die alte Fassung hielt die
 *  Karte waehrenddessen leer; hier laufen die Pins nach und nach ein, und jedes
 *  Ergebnis wird gespeichert, damit die Suche genau einmal stattfindet. */
async function ortsSucheImHintergrund(offen, karte, punkte, setzen, stand) {
  let fertig = 0;
  const gesamt = punkte.length + offen.length;
  for (const p of offen) {
    try {
      const ziel = navigationsZiel(p);
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(ziel)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const treffer = await res.json();
        if (treffer.length) {
          p.lat = parseFloat(treffer[0].lat);
          p.lng = parseFloat(treffer[0].lon);
          await repo.setzeExtra(p.id, { lat: p.lat, lng: p.lng });
          setzen(p);
          karte.fitBounds(punkte, { padding: [30, 30] });
        }
      }
    } catch {
      // offline oder gedrosselt — beim naechsten Aufruf erneut versuchen
    }
    fertig += 1;
    stand.textContent = `${punkte.length} von ${gesamt} verortet — noch ${offen.length - fertig} zu suchen …`;
    await new Promise((r) => setTimeout(r, 1100));
  }
  stand.textContent = punkte.length === gesamt
    ? `${punkte.length} Projekte auf der Karte.`
    : `${punkte.length} von ${gesamt} Projekten verortet. Der Rest hat keine auffindbare Adresse — beim Projekt eine genauere eintragen.`;
}
