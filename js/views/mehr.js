// Mehr — Arbeitszeit, Feiertage, Kalender, Abgleich, Projekte, Sicherung.
import { el, hinweis } from "../core/dom.js";
import * as store from "../core/store.js";
import * as katalog from "../data/catalog.js";
import * as repo from "../data/repo.js";
import * as fmt from "../core/fmt.js";
import * as router from "../core/router.js";
import { BUNDESLAENDER } from "../core/feiertage.js";
import { kontoBereiche } from "../core/konten.js";
import { geschaeftsjahr } from "../core/geschaeftsjahr.js";
import * as microsoft from "../sync/microsoft.js";
import * as onedrive from "../sync/onedrive.js";
import * as outlook from "../sync/outlook.js";
import { abgleichen, letzterAbgleich } from "../sync/abgleich.js";
import * as kataloge from "../sync/kataloge.js";
import { sicherungErstellen, sicherungEinspielen, projekteAusText } from "../export/backup.js";
import { sheet, schliesse } from "../ui/sheet.js";

export function zeichneMehr(wurzel) {
  wurzel.append(
    el("div", { class: "kopfzeile" }, [el("h1", { text: "Mehr" })]),
    lebensbereichBlock(),
    allgemeinBlock(),
    feiertagsBlock(),
    kontoBlock(),
    katalogBlock(),
    projektBlock(),
    sicherungsBlock(),
    infoBlock()
  );
  migrationsHinweis(wurzel);
}

function block(titel, neben, kinder) {
  return el("div", { class: "karte block" }, [
    el("div", { class: "block-kopf" }, [
      el("div", {}, [
        el("h2", { text: titel }),
        neben ? el("p", { class: "block-neben", text: neben }) : null,
      ].filter(Boolean)),
    ]),
    ...kinder,
  ]);
}

function schalter(titel, unterzeile, an, beiAenderung) {
  const k = el("input", { type: "checkbox" });
  k.checked = !!an;
  k.addEventListener("change", () => beiAenderung(k.checked));
  return el("label", { class: "schalterzeile" }, [
    el("span", { class: "beschriftung" }, [titel, unterzeile ? el("small", { text: unterzeile }) : null].filter(Boolean)),
    el("span", { class: "haken" }, [k]),
  ]);
}

// ---- Lebensbereiche ------------------------------------------------------
// Geschäftsjahr, Sollstunden, Arbeitstage und Urlaub gelten je Bereich: bei der
// MVV läuft das Jahr vom 01.10. bis 30.09. und es gibt 30 Urlaubstage, in der
// Selbstständigkeit gilt beides nicht. Sie zusammenzufassen wäre falsch.

let offenerBereich = null;

function lebensbereichBlock() {
  const e = store.zustand.einstellungen;
  if (!offenerBereich) offenerBereich = kontoBereiche(e)[0] || "mvv";
  const b = e.bereiche?.[offenerBereich] || {};
  const gj = geschaeftsjahr(null, b.geschaeftsjahrStart || 1);

  const setze = async (schluessel, wert) => {
    await store.bereichEinstellungSetzen(offenerBereich, schluessel, wert);
    router.neuZeichnen();
  };

  const zahl = (wert, schluessel, { min = 0, max = 999, schritt = 1, komma = false }) => {
    const f = el("input", { type: "number", class: "feld", min: String(min), max: String(max),
      step: String(schritt), value: String(wert) });
    f.addEventListener("change", async () => {
      const w = komma ? parseFloat(f.value.replace(",", ".")) : parseInt(f.value, 10);
      if (Number.isNaN(w) || w < min || w > max) { f.value = String(wert); return hinweis(`Wert zwischen ${min} und ${max}.`, "warnung"); }
      await setze(schluessel, w);
      hinweis("Gespeichert.", "gut");
    });
    return f;
  };

  const start = el("input", { type: "date", class: "feld", value: b.saldoStart || "" });
  start.addEventListener("change", () => setze("saldoStart", start.value || null));

  const WOCHENTAGE = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [7, "So"]];
  const MONATE = [[1, "Januar"], [4, "April"], [7, "Juli"], [10, "Oktober"]];

  const felder = [
    el("div", { class: "feldblock" }, [
      el("span", { class: "feldname", text: "Geschäftsjahr beginnt am 1." }),
      el("div", { class: "segment" }, MONATE.map(([m, label]) =>
        el("button", {
          class: "segment-knopf" + ((b.geschaeftsjahrStart || 1) === m ? " aktiv" : ""),
          text: label, onclick: () => setze("geschaeftsjahrStart", m),
        })
      )),
      el("span", { class: "modus-hinweis", text: `Aktuell: ${gj.label} — ${fmt.datumDeutsch(gj.von)} bis ${fmt.datumDeutsch(gj.bis)}. Bis zum Ende müssen alle Stunden gebucht sein, sonst lassen sich die Projekte nicht abrechnen.` }),
    ]),
    el("label", { class: "feldzeile" }, [
      el("span", { class: "feldname", text: "Soll/Tag" }),
      zahl(b.sollStundenTag ?? 8, "sollStundenTag", { min: 1, max: 24, schritt: 0.5, komma: true }),
      el("span", { class: "block-neben", text: "Std" }),
    ]),
    el("div", { class: "feldblock" }, [
      el("span", { class: "feldname", text: "Arbeitstage" }),
      el("div", { class: "chipzeile" }, WOCHENTAGE.map(([nr, kurz]) =>
        el("button", {
          class: "chip" + ((b.arbeitstage || []).includes(nr) ? " aktiv" : ""),
          text: kurz,
          onclick: () => {
            const alt = b.arbeitstage || [];
            const neu = alt.includes(nr) ? alt.filter((x) => x !== nr) : [...alt, nr].sort();
            if (!neu.length) return hinweis("Mindestens ein Arbeitstag.", "warnung");
            setze("arbeitstage", neu);
          },
        })
      )),
    ]),
    el("label", { class: "feldzeile" }, [
      el("span", { class: "feldname", text: "Konto ab" }), start,
    ]),
    el("label", { class: "feldzeile" }, [
      el("span", { class: "feldname", text: "Anfang" }),
      zahl(b.saldoAnfang ?? 0, "saldoAnfang", { min: -999, max: 999, schritt: 0.25, komma: true }),
      el("span", { class: "block-neben", text: "Std" }),
    ]),
    el("p", { class: "block-hinweis", text: "Ohne Startdatum beginnt das Konto beim ersten Eintrag dieses Bereichs. Anfangsbestand = Überstunden, die zu diesem Stichtag schon bestanden und nicht in dieser App erfasst sind; Minuswerte sind erlaubt." }),
    el("label", { class: "feldzeile" }, [
      el("span", { class: "feldname", text: "Urlaub" }),
      zahl(b.urlaubstage ?? 0, "urlaubstage", { min: 0, max: 99 }),
      el("span", { class: "block-neben", text: "Tage/Jahr" }),
    ]),
    el("label", { class: "feldzeile" }, [
      el("span", { class: "feldname", text: "Übertrag" }),
      zahl(b.urlaubUebertrag ?? 0, "urlaubUebertrag", { min: 0, max: 99 }),
      el("span", { class: "block-neben", text: "Tage" }),
    ]),
  ];

  return block("Lebensbereiche", "Geschäftsjahr, Soll und Urlaub je Bereich getrennt", [
    el("div", { class: "segment gross" }, katalog.BEREICHE.map((bereich) =>
      el("button", {
        class: "segment-knopf" + (offenerBereich === bereich.id ? " aktiv" : ""),
        text: bereich.kurz,
        onclick: () => { offenerBereich = bereich.id; router.neuZeichnen(); },
      })
    )),
    schalter("Konto führen", "Stunden- und Urlaubskonto für diesen Bereich rechnen und anzeigen",
      b.kontoFuehren, (an) => setze("kontoFuehren", an)),
    ...(b.kontoFuehren ? felder : [
      el("p", { class: "block-text", text: "Für diesen Bereich wird kein Konto geführt. Buchungen sind trotzdem möglich und erscheinen in der Auswertung." }),
    ]),
  ]);
}

function allgemeinBlock() {
  const e = store.zustand.einstellungen;
  return block("Allgemein", "Gilt für alle Bereiche", [
    schalter("Lücken markieren", "Vergangene Arbeitstage ohne Buchung werden im Kalender schraffiert",
      e.lueckenwarnung, (an) => store.einstellungSetzen("lueckenwarnung", an).then(() => router.neuZeichnen())),
    schalter("Neue Buchungen abrechenbar", "Vorbelegung; Sammelposten bleiben immer nicht abrechenbar",
      e.abrechenbarVorgabe, (an) => store.einstellungSetzen("abrechenbarVorgabe", an)),
    schalter("Automatisch abgleichen", "Beim Start, nach jeder Änderung und beim Zurückkehren zur App",
      e.autoAbgleich !== false, (an) => store.einstellungSetzen("autoAbgleich", an).then(() => router.neuZeichnen())),
  ]);
}

// ---- Feiertage ----------------------------------------------------------

function feiertagsBlock() {
  const e = store.zustand.einstellungen;
  const gewaehlt = e.bundeslaender || [];
  const anzahl = store.feiertageDerZeitspanne(
    `${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`).size;

  const liste = el("div", { class: "hakenliste" }, BUNDESLAENDER.map((l) => {
    const k = el("input", { type: "checkbox" });
    k.checked = gewaehlt.includes(l.id);
    k.addEventListener("change", async () => {
      const aktuell = store.zustand.einstellungen.bundeslaender || [];
      const neu = k.checked ? [...aktuell, l.id] : aktuell.filter((x) => x !== l.id);
      await store.einstellungSetzen("bundeslaender", neu);
      router.neuZeichnen();
    });
    return el("label", { class: "haken" }, [k, el("span", { text: l.id + " · " + kurzName(l.name) })]);
  }));

  return block("Feiertage", `${anzahl} Feiertage ${new Date().getFullYear()} aus ${gewaehlt.length} ${gewaehlt.length === 1 ? "Land" : "Ländern"}`, [
    el("p", { class: "block-text", text: "Angehakte Länder erscheinen im Kalender und zählen nicht als Lücke. Mehrere sind möglich — die Feiertage werden zusammengeführt." }),
    liste,
    el("p", { class: "block-hinweis", text: "Nicht enthalten: Mariä Himmelfahrt in Bayern und Fronleichnam in Teilen Sachsens und Thüringens — die gelten je Gemeinde, nicht je Land." }),
  ]);
}

const kurzName = (n) => n.replace("Baden-Württemberg", "Baden-Württ.")
  .replace("Mecklenburg-Vorpommern", "Meckl.-Vorp.")
  .replace("Nordrhein-Westfalen", "Nordrh.-Westf.")
  .replace("Schleswig-Holstein", "Schlesw.-Holst.")
  .replace("Rheinland-Pfalz", "Rheinl.-Pfalz")
  .replace("Sachsen-Anhalt", "Sachs.-Anhalt");

// ---- Microsoft-Konto: Abgleich und Kalender -----------------------------

function kontoBlock() {
  const e = store.zustand.einstellungen;
  const kinder = [];

  if (!microsoft.angemeldet()) {
    kinder.push(
      el("p", { class: "block-text", text: "Ohne Anmeldung liegen die Buchungen nur auf diesem Gerät. Safari darf den Speicher von Web-Apps nach längerer Nichtnutzung löschen." }),
      el("button", { class: "knopf haupt", text: "Mit Microsoft anmelden", onclick: () => microsoft.anmelden() }),
      el("p", { class: "block-hinweis", text: `Einmalig nötig: In Entra bei „CoWork_OS Claude“ unter Authentifizierung die Plattform „SPA“ mit ${microsoft.umleitungsZiel()} eintragen.` })
    );
    return block("Microsoft-Konto", "Abgleich und Kalender", kinder);
  }

  const stand = el("p", { class: "block-neben", text: "…" });
  letzterAbgleich().then((z) => {
    stand.textContent = z ? `Zuletzt abgeglichen: ${new Date(z).toLocaleString("de-DE")}` : "Noch nie abgeglichen.";
  });

  kinder.push(
    stand,
    el("p", { class: "block-text", text: onedrive.dateiPfadAnzeige() }),
    el("div", { class: "knopfzeile zwei" }, [
      el("button", { class: "knopf haupt", text: "Jetzt abgleichen", onclick: async (ev) => {
        const k = ev.currentTarget;
        k.disabled = true; k.textContent = "Gleicht ab …";
        try {
          const r = await abgleichen();
          hinweis(`${r.eintraege} Einträge · ${r.hereingekommen} neu vom anderen Gerät.`, "gut");
          router.neuZeichnen();
        } catch (f) {
          hinweis(f.message || "Abgleich fehlgeschlagen.", "warnung");
          k.disabled = false; k.textContent = "Jetzt abgleichen";
        }
      } }),
      el("button", { class: "knopf flach", text: "Abmelden", onclick: () => {
        microsoft.abmelden(); hinweis("Abgemeldet.", "info"); router.neuZeichnen();
      } }),
    ]),
    el("div", { class: "abschnitt-titel" }, [el("h2", { text: "Outlook-Kalender" })]),
    el("p", { class: "block-text", text: "Der iOS-Kalender selbst ist für Web-Apps gesperrt. Über Outlook geht beides — und der Outlook-Kalender liegt auf deinem iPhone in der Kalender-App." }),
    schalter("Termine als Vorschlag lesen", "Termine des Tages erscheinen unter „Heute“ und lassen sich mit einem Tipper buchen",
      e.kalenderLesen, async (an) => { await store.einstellungSetzen("kalenderLesen", an); router.neuZeichnen(); }),
    schalter("Abwesenheit in den Kalender schreiben", "Urlaub und Krankheit werden als Ganztagestermin eingetragen",
      e.kalenderSchreiben, async (an) => { await store.einstellungSetzen("kalenderSchreiben", an); router.neuZeichnen(); }),
  );

  if (e.kalenderLesen || e.kalenderSchreiben) {
    const wahl = el("button", { class: "knopf flach", text: "Kalender wählen …", onclick: kalenderWaehlen });
    kinder.push(
      el("p", { class: "block-hinweis", text: e.kalenderId ? "Ein bestimmter Kalender ist gewählt." : "Es wird der Standardkalender verwendet." }),
      wahl
    );
  }

  return block("Microsoft-Konto", microsoft.konto() || "angemeldet", kinder);
}

async function kalenderWaehlen() {
  const koerper = el("div", {}, [el("p", { class: "block-text", text: "Wird geladen …" })]);
  sheet({ titel: "Kalender wählen", inhalt: koerper });
  try {
    const kalender = await outlook.kalenderListe();
    koerper.replaceChildren(
      el("div", { class: "karten" }, [
        el("button", { class: "karte eintrag", onclick: () => waehle(null) }, [
          el("span", { class: "eintrag-marke", text: "STD" }),
          el("div", { class: "eintrag-text" }, [
            el("div", { class: "eintrag-name", text: "Standardkalender" }),
            el("div", { class: "eintrag-meta", text: "der Kalender, den Outlook vorgibt" }),
          ]),
        ]),
        ...kalender.map((k) => el("button", { class: "karte eintrag", onclick: () => waehle(k.id) }, [
          el("span", { class: "eintrag-marke", text: k.standard ? "STD" : "KAL" }),
          el("div", { class: "eintrag-text" }, [
            el("div", { class: "eintrag-name", text: k.name }),
            el("div", { class: "eintrag-meta", text: k.schreibbar ? "beschreibbar" : "nur lesbar" }),
          ]),
        ])),
      ])
    );
  } catch (f) {
    koerper.replaceChildren(el("p", { class: "block-text", text: "Kalender nicht abrufbar: " + f.message }));
  }

  async function waehle(id) {
    await store.einstellungSetzen("kalenderId", id);
    schliesse();
    router.neuZeichnen();
    hinweis("Kalender gewählt.", "gut");
  }
}

// ---- Projekte -----------------------------------------------------------

// ---- Projektlisten -------------------------------------------------------
// Bis zum 25.08.2026 wurden die Listen als data/projects.*.json mit der App
// ausgeliefert und waren damit oeffentlich lesbar — Auftragsnummern,
// Auftraggeber, Projektleiter, Kundennamen. Sie kommen jetzt ausschliesslich
// aus Steffens OneDrive oder aus einer von Hand gewaehlten Datei.

const KATALOG_TITEL = { ustrich: "untermStrich (kreativLABOR42)", mvv: "MVV Gruppenprojektliste TV.D.3" };

function katalogZeile(id, eintrag) {
  const titel = KATALOG_TITEL[id];
  if (!eintrag) {
    return el("p", { class: "block-text", text: `${titel}: nicht geladen` });
  }
  const woher = eintrag.quelle === "onedrive" ? "aus OneDrive" : "aus Datei";
  const stand = eintrag.am ? `Stand ${fmt.datumDeutsch(eintrag.am)}` : "ohne Standangabe";
  return el("p", { class: "block-text", text: `${titel}: ${eintrag.anzahl} Projekte, ${stand}, ${woher}` });
}

function katalogBlock() {
  const s = katalog.katalogStand();
  const fehlt = katalog.katalogeFehlen();

  const dateiFeld = el("input", { type: "file", accept: "application/json,.json", style: { display: "none" } });
  dateiFeld.addEventListener("change", async () => {
    const datei = dateiFeld.files?.[0];
    if (!datei) return;
    try {
      const r = await kataloge.ausDatei(await datei.text());
      await store.starten();
      router.neuZeichnen();
      hinweis(`${KATALOG_TITEL[r.id]}: ${r.anzahl} Projekte geladen.`, "gut");
    } catch (f) {
      hinweis(f.message || "Datei nicht lesbar.", "warnung");
    }
    dateiFeld.value = "";
  });

  const holen = async (ev) => {
    const knopf = ev.currentTarget;
    knopf.disabled = true;
    knopf.textContent = "Hole …";
    try {
      const listen = await kataloge.ausOneDrive();
      await store.starten();
      router.neuZeichnen();
      const geholt = listen.filter((l) => l.zustand === "neu" || l.zustand === "erneuert");
      const fehlend = listen.filter((l) => l.zustand === "fehlt");
      if (geholt.length) hinweis(`${geholt.map((l) => `${KATALOG_TITEL[l.id]}: ${l.anzahl}`).join(" · ")}`, "gut");
      else if (fehlend.length === listen.length) hinweis(`Keine Liste gefunden unter ${kataloge.ordnerAnzeige()}.`, "warnung");
      else hinweis("Beide Listen sind bereits auf dem neuesten Stand.", "gut");
    } catch (f) {
      hinweis(f.message || "OneDrive nicht erreichbar.", "warnung");
      knopf.disabled = false;
      knopf.textContent = "Aus OneDrive holen";
    }
  };

  const angemeldet = microsoft.angemeldet();

  return el("div", { class: "karte block" + (fehlt ? " warnung" : "") }, [
    el("div", { class: "block-kopf" }, [
      el("div", {}, [
        el("h2", { text: "Projektlisten" }),
        el("p", { class: "block-neben", text: fehlt ? "Keine Liste geladen" : kataloge.ordnerAnzeige() }),
      ]),
    ]),
    katalogZeile("ustrich", s.ustrich),
    katalogZeile("mvv", s.mvv),
    el("div", { class: "knopfzeile zwei" }, [
      el("button", { class: "knopf" + (fehlt ? " haupt" : ""), text: "Aus OneDrive holen",
        disabled: !angemeldet, onclick: holen }),
      el("button", { class: "knopf flach", text: "Aus Datei laden", onclick: () => dateiFeld.click() }),
    ]),
    el("p", { class: "block-hinweis", text: angemeldet
      ? "Die Listen liegen nur in deinem OneDrive und auf deinen Geräten. Der automatische Abgleich holt sie mit — dieser Knopf ist für den Fall, dass es sofort sein soll."
      : "Ohne Anmeldung bei Microsoft geht nur der Weg über eine Datei. Die Listen werden bewusst nicht mehr mit der App ausgeliefert." }),
    dateiFeld,
  ]);
}

function projektBlock() {
  const alle = katalog.alleProjekte();
  const eigene = alle.filter((p) => p.quelle === "eigen");
  const neben = [
    `${alle.length} insgesamt`,
    `${katalog.sammelposten().length} Sammelposten`,
    eigene.length ? `${eigene.length} eigene` : null,
  ].filter(Boolean).join(" · ");

  return block("Projekte", neben, [
    // Auf dem Telefon zeigt die untere Leiste vier Reiter, damit der
    // Erfassen-Knopf mittig sitzt. Projekte samt Karte ist deshalb von hier
    // aus erreichbar; auf dem iPad steht es zusaetzlich in der Seitenleiste.
    el("button", { class: "knopf haupt", text: "Projekte & Karte öffnen",
      onclick: () => router.zeige("projekte") }),
    el("p", { class: "block-text", text: "Hier legst du nur an, was in keiner der beiden Projektlisten steht." }),
    el("div", { class: "knopfzeile zwei" }, [
      el("button", { class: "knopf", text: "Projekt anlegen", onclick: projektAnlegenDialog }),
      el("button", { class: "knopf flach", text: "Liste einfügen", onclick: listeEinfuegenDialog }),
    ]),
    eigene.length ? el("button", { class: "knopf flach", style: { marginTop: "var(--a2)" },
      text: `Eigene verwalten (${eigene.length})`, onclick: () => eigeneVerwaltenDialog(eigene) }) : null,
  ].filter(Boolean));
}

function bereichsWahl(zustand) {
  return el("div", { class: "feldblock" }, [
    el("span", { class: "feldname", text: "Bereich" }),
    el("div", { class: "segment" }, katalog.BEREICHE.map((b) =>
      el("button", {
        class: "segment-knopf" + (b.id === zustand.wert ? " aktiv" : ""),
        text: b.kurz,
        onclick: (ev) => {
          zustand.wert = b.id;
          [...ev.target.parentElement.children].forEach((k) => k.classList.remove("aktiv"));
          ev.target.classList.add("aktiv");
          zustand.beiWechsel?.();
        },
      })
    )),
  ]);
}

function projektAnlegenDialog() {
  const bereich = { wert: "mvv" };
  const name = el("input", { type: "text", class: "feld", placeholder: "Bezeichnung" });
  const nr = el("input", { type: "text", class: "feld", placeholder: "Nummer (optional)" });
  const kuerzel = el("input", { type: "text", class: "feld", placeholder: "Kürzel", autocapitalize: "characters" });
  const adresse = el("input", { type: "text", class: "feld", placeholder: "Adresse (optional)" });
  const sammel = el("input", { type: "checkbox" });

  sheet({
    titel: "Projekt anlegen",
    inhalt: el("div", {}, [
      bereichsWahl(bereich),
      feldblock("Name", name), feldblock("Nummer", nr), feldblock("Kürzel", kuerzel), feldblock("Adresse", adresse),
      el("label", { class: "schalterzeile" }, [
        el("span", { class: "beschriftung" }, ["Sammelposten", el("small", { text: "Tätigkeit ohne Projekt, nie abrechenbar" })]),
        el("span", { class: "haken" }, [sammel]),
      ]),
    ]),
    aktionen: [el("button", { class: "knopf haupt", text: "Anlegen", onclick: async () => {
      if (!name.value.trim()) return hinweis("Bitte einen Namen eingeben.", "warnung");
      await repo.speichereProjekt(repo.neuesProjekt({
        bereich: bereich.wert, name: name.value,
        nr: nr.value.trim() || null, kuerzel: kuerzel.value.trim() || null,
        adresse: adresse.value.trim() || null, sammelposten: sammel.checked,
      }));
      await store.projekteNachladen();
      schliesse(); router.neuZeichnen();
      hinweis("Projekt angelegt.", "gut");
    } })],
  });
}

function listeEinfuegenDialog() {
  const bereich = { wert: "mvv" };
  const feld = el("textarea", { class: "feld", rows: "9", spellcheck: "false",
    placeholder: "26/247;UW9;UW9 Trafofundament;Mannheim\n26/248;;Dachsanierung Halle 3" });
  const vorschau = el("p", { class: "block-hinweis", text: "Noch nichts eingefügt." });
  const pruefe = () => {
    const n = projekteAusText(feld.value, bereich.wert).length;
    vorschau.textContent = n ? `${n} ${n === 1 ? "Projekt" : "Projekte"} erkannt.` : "Noch nichts erkannt.";
  };
  bereich.beiWechsel = pruefe;
  feld.addEventListener("input", pruefe);

  sheet({
    titel: "Projektliste einfügen",
    inhalt: el("div", {}, [
      el("p", { class: "block-text", text: "Aus Excel kopieren und einfügen. Eine Zeile je Projekt, getrennt durch Tab, Semikolon oder Komma: Nummer, Kürzel, Name, Adresse. Fehlende Spalten sind in Ordnung." }),
      bereichsWahl(bereich), feld, vorschau,
    ]),
    aktionen: [el("button", { class: "knopf haupt", text: "Übernehmen", onclick: async () => {
      const neue = projekteAusText(feld.value, bereich.wert);
      if (!neue.length) return hinweis("Keine Projekte erkannt.", "warnung");
      await repo.speichereProjekte(neue);
      await store.projekteNachladen();
      schliesse(); router.neuZeichnen();
      hinweis(`${neue.length} Projekte übernommen.`, "gut");
    } })],
  });
}

function eigeneVerwaltenDialog(eigene) {
  sheet({ titel: "Eigene Projekte", inhalt: el("div", { class: "karten" }, eigene.map((p) =>
    el("div", { class: "karte eintrag" }, [
      el("span", { class: "eintrag-marke", text: p.kuerzel || p.nr || "—" }),
      el("div", { class: "eintrag-text" }, [
        el("div", { class: "eintrag-name", text: p.name }),
        el("div", { class: "eintrag-meta", text: katalog.bereichLabel(p.bereich) }),
      ]),
      el("button", { class: "knopf gefahr", style: { width: "auto" }, text: "Entfernen", onclick: async (ev) => {
        const gebucht = store.zustand.eintraege.some((e) => e.projektId === p.id);
        if (gebucht && !confirm(`Auf „${p.name}“ sind Stunden gebucht. Trotzdem entfernen? Die Buchungen bleiben erhalten.`)) return;
        await repo.loescheProjekt(p.id);
        await store.projekteNachladen();
        ev.currentTarget.closest(".karte").remove();
        hinweis("Entfernt.", "info");
      } }),
    ])
  ))});
}

// ---- Sicherung ----------------------------------------------------------

function sicherungsBlock() {
  const dateiFeld = el("input", { type: "file", accept: "application/json,.json", style: { display: "none" } });
  dateiFeld.addEventListener("change", async () => {
    const datei = dateiFeld.files?.[0];
    if (!datei) return;
    try {
      const r = await sicherungEinspielen(await datei.text());
      await store.starten();
      router.neuZeichnen();
      hinweis(`${r.uebernommen} von ${r.gelesen} Einträgen übernommen.`, "gut");
    } catch (f) {
      hinweis(f.message || "Datei nicht lesbar.", "warnung");
    }
    dateiFeld.value = "";
  });

  return block("Sicherung", "Alle Einträge als Datei", [
    el("div", { class: "knopfzeile zwei" }, [
      el("button", { class: "knopf flach", text: "Erstellen", onclick: async () => {
        const n = await sicherungErstellen();
        hinweis(`${n} Einträge gesichert.`, "gut");
      } }),
      el("button", { class: "knopf flach", text: "Einspielen", onclick: () => dateiFeld.click() }),
    ]),
    dateiFeld,
  ]);
}

function infoBlock() {
  const s = katalog.katalogStand();
  const zeilen = [
    s.ustrich ? `untermStrich: ${s.ustrich.anzahl} Projekte, Stand ${fmt.datumDeutsch(s.ustrich.am)}` : "untermStrich-Katalog nicht geladen",
    s.mvv ? `MVV TV.D.3: ${s.mvv.anzahl} Projekte, Stand ${fmt.datumDeutsch(s.mvv.am)}` : "MVV-Katalog nicht geladen",
  ];
  return block("Über", "Stundenerfassung · kreativLABOR42 · Version 3.0", [
    ...zeilen.map((t) => el("p", { class: "block-neben", text: t })),
    el("p", { class: "block-hinweis", text: "Listen am Mac erneuern: zeiterfassung_projekte.py (untermStrich) und zeiterfassung_mvv.py (MVV) in CoWork_OS/00_resources/scripts. Sie schreiben direkt nach OneDrive — nicht ins Repo, damit die Projektdaten nicht öffentlich werden." }),
  ]);
}

async function migrationsHinweis(wurzel) {
  const m = await repo.konfig("migrationV1", null);
  if (!m || m.geprueft) return;
  wurzel.insertBefore(el("div", { class: "karte block warnung" }, [
    el("h2", { text: "Aus der alten Fassung übernommen" }),
    el("p", { class: "block-text", text: `${m.anzahl} Buchungen wurden übernommen. Die alten Projekte hießen anders als die aus untermStrich — bitte einmal prüfen.` }),
    el("button", { class: "knopf flach", text: "Verstanden", onclick: async () => {
      await repo.setzeKonfig("migrationV1", { ...m, geprueft: true });
      router.neuZeichnen();
    } }),
  ]), wurzel.children[1]);
}

function feldblock(name, feld) {
  return el("label", { class: "feldblock" }, [el("span", { class: "feldname", text: name }), feld]);
}
