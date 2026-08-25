// Kleiner DOM-Helfer. Ersetzt das innerHTML-Gebastel der alten Fassung:
// dort wurden Projektnamen und Notizen ungefiltert in innerHTML-Strings
// interpoliert — ein Apostroph oder "<" im Projektnamen zerlegte die Ansicht.
// el() setzt Text immer ueber textContent, damit kann das nicht passieren.

export function el(tag, attrs = {}, kinder = []) {
  const knoten = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") knoten.className = v;
    else if (k === "text") knoten.textContent = v;
    else if (k === "html") knoten.innerHTML = v;          // nur fuer eigene Icons
    else if (k === "dataset") Object.assign(knoten.dataset, v);
    else if (k === "style") Object.assign(knoten.style, v);
    else if (k.startsWith("on") && typeof v === "function") {
      knoten.addEventListener(k.slice(2).toLowerCase(), v);
    } else knoten.setAttribute(k, v === true ? "" : v);
  }
  for (const kind of [].concat(kinder)) {
    if (kind === null || kind === undefined || kind === false) continue;
    knoten.appendChild(typeof kind === "string" ? document.createTextNode(kind) : kind);
  }
  return knoten;
}

export function leeren(knoten) {
  while (knoten.firstChild) knoten.removeChild(knoten.firstChild);
  return knoten;
}

/** SVG-Icon aus dem Sprite. Strichzeichnungen, damit sie in beiden Themes tragen. */
const ICONS = {
  heute: '<path d="M12 7v5l3.5 2"/><circle cx="12" cy="12" r="9"/>',
  kalender: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  projekte: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v6.6A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
  auswertung: '<path d="M4.5 19.5V13M10 19.5V6M15.5 19.5v-9M21 19.5V9.5"/>',
  mehr: '<circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6M12 7.8v.4"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  stopp: '<rect x="7.5" y="7.5" width="9" height="9" rx="2"/>',
  start: '<path d="M8.5 6.5 17.5 12l-9 5.5z"/>',
  pfeilLinks: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  pfeilRechts: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  suche: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  karte: '<path d="M12 21s7-6.9 7-11.4A7 7 0 0 0 5 9.6C5 14.1 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
  stift: '<path d="M4.5 19.5h4L19 9a2.5 2.5 0 0 0-3.5-3.5L5 16z"/>',
  muell: '<path d="M5.5 7.5h13M10 7.5V5.5h4v2M7 7.5l.8 12h8.4l.8-12"/>',
  wolke: '<path d="M7 18.5a4 4 0 0 1-.3-8A5.5 5.5 0 0 1 17.4 10a3.8 3.8 0 0 1-.4 8.5z"/>',
  haken: '<path d="m5.5 12.5 4.5 4.5 9-9.5"/>',
};

export function icon(name, groesse = 22) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", groesse);
  svg.setAttribute("height", groesse);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] || "";
  return svg;
}

/** Kurze Rueckmeldung am unteren Rand statt alert(). */
let tostTimer = null;
export function hinweis(text, art = "info") {
  let box = document.getElementById("hinweis");
  if (!box) {
    box = el("div", { id: "hinweis", class: "hinweis" });
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.className = `hinweis sichtbar ${art}`;
  clearTimeout(tostTimer);
  tostTimer = setTimeout(() => box.classList.remove("sichtbar"), 2600);
}
