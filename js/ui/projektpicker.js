// Projektsuche — der Kern des ursprünglichen Wunsches:
// "ich tippe UW, dann filtert es nur die UW-Projekte, Buchstabe für Buchstabe".
import { el, icon, hinweis } from "../core/dom.js";
import * as katalog from "../data/catalog.js";
import * as store from "../core/store.js";
import { zustand } from "../core/store.js";
import * as repo from "../data/repo.js";

export function projektpicker(container, { bereich = null, beiWahl, autofokus = true }) {
  const feld = el("input", {
    type: "search", class: "suchfeld", inputmode: "search",
    placeholder: "Kürzel, Nummer oder Name …",
    autocapitalize: "characters", autocomplete: "off", autocorrect: "off", spellcheck: "false",
  });

  const bereichsleiste = el("div", { class: "segment" },
    [{ id: null, kurz: "Alle" }, ...katalog.BEREICHE].map((b) =>
      el("button", {
        class: "segment-knopf" + (b.id === bereich ? " aktiv" : ""),
        text: b.kurz,
        onclick: (ev) => {
          bereich = b.id;
          [...ev.target.parentElement.children].forEach((k) => k.classList.remove("aktiv"));
          ev.target.classList.add("aktiv");
          zeichneListe();
        },
      })
    )
  );

  const liste = el("div", { class: "trefferliste" });

  function zeichneListe() {
    liste.replaceChildren();
    const text = feld.value.trim();

    if (!text) {
      // Ohne Sucheingabe zuerst das, was ohne Tippen erreichbar sein soll:
      // zuletzt gebucht, dann die Sammelposten (NOP, Akquise).
      const zuletzt = zustand.zuletzt
        .map((id) => katalog.projekt(id))
        .filter((p) => p && (!bereich || p.bereich === bereich));
      if (zuletzt.length) {
        abschnitt("Zuletzt gebucht", zuletzt);
      }
      const sammel = katalog.sammelposten(bereich);
      if (sammel.length) {
        abschnitt(bereich === "mvv" ? "NOP — ohne Projekt" : "Ohne Projekt", sammel);
      }
      abschnitt("Alle Projekte", katalog.suche("", { bereich, ohneSammelposten: true }));
      return;
    }

    const treffer = katalog.suche(text, { bereich });
    if (!treffer.length) {
      liste.appendChild(nichtsGefunden(text));
      return;
    }
    treffer.forEach((p) => liste.appendChild(zeile(p)));
  }

  /** Sackgasse vermeiden: Nicht jedes Projekt steht in untermStrich oder der
   *  MVV-Liste -- ein Angebot etwa hat noch keine Auftragsnummer und taucht
   *  dort gar nicht auf. Statt auf "Mehr → Projekte" zu verweisen, wird es
   *  hier angelegt und die Buchung laeuft sofort weiter. */
  function nichtsGefunden(text) {
    const anlegen = async (id) => {
      const neu = repo.neuesProjekt({ bereich: id, name: text });
      await repo.speichereProjekt(neu);
      await store.projekteNachladen();
      const angelegt = katalog.projekt(neu.id);
      hinweis(`„${text}“ angelegt.`, "gut");
      beiWahl(angelegt || { ...neu, sammelposten: false });
    };

    const ziele = bereich ? [katalog.BEREICHE.find((b) => b.id === bereich)] : katalog.BEREICHE;
    return el("div", { class: "leer" }, [
      el("p", { text: `Kein Projekt zu „${text}“.` }),
      el("p", { class: "leer-hinweis", text: ziele.length === 1
        ? "Als eigenes Projekt anlegen und direkt darauf buchen:"
        : "Als eigenes Projekt anlegen — in welchem Bereich?" }),
      el("div", { class: "knopfzeile" }, ziele.map((b) =>
        el("button", { class: "knopf" + (ziele.length === 1 ? " haupt" : ""),
          text: ziele.length === 1 ? "Anlegen und buchen" : b.kurz,
          onclick: () => anlegen(b.id) })
      )),
    ]);
  }

  function abschnitt(titel, projekte) {
    if (!projekte.length) return;
    liste.appendChild(el("div", { class: "listen-titel", text: titel }));
    projekte.forEach((p) => liste.appendChild(zeile(p)));
  }

  function zeile(p) {
    const meta = p.sammelposten
      ? katalog.bereichLabel(p.bereich) + " · keine Projektstunde"
      : [katalog.bereichKurz(p.bereich), p.ort || p.auftraggeber, p.auftrag ? "Auftrag " + p.auftrag : null]
          .filter(Boolean).join(" · ");
    return el("button", { class: "treffer", onclick: () => beiWahl(p) }, [
      el("span", { class: "treffer-marke", text: p.kuerzel || p.nr || "—" }),
      el("span", { class: "treffer-text" }, [
        el("span", { class: "treffer-name", text: p.name }),
        el("span", { class: "treffer-meta", text: meta }),
      ]),
      p.aktiv && !p.sammelposten ? el("span", { class: "punkt-aktiv", title: "laufend" }) : null,
    ]);
  }

  feld.addEventListener("input", zeichneListe);
  container.append(
    el("div", { class: "suchzeile" }, [icon("suche", 16), feld]),
    bereichsleiste, liste
  );
  zeichneListe();
  if (autofokus) setTimeout(() => feld.focus(), 120);
  return { fokus: () => feld.focus() };
}
