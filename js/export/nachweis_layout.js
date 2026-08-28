// Zeichenschicht des Stundennachweises — bewusst ohne jede App-Abhängigkeit.
//
// Warum getrennt: So lässt sich das Layout außerhalb der App erzeugen und
// ansehen, ohne Browser, IndexedDB und Katalog. Die Vorlage wurde genau so
// entwickelt. Herein kommen fertige Zeilen, heraus geht ein gezeichnetes PDF.
//
// Gestaltung wie die App: kein Akzentton, Hierarchie über Schriftgewicht,
// Grauwerte und Haarlinien. Die frühere Fassung setzte einen blauen Kopfbalken
// und blau gefüllte Tabellenköpfe — das stammte aus der Zeit vor der
// monochromen Oberfläche und sah neben ihr wie ein fremdes Dokument aus.

const TINTE = [17, 17, 17];
const GRAU = [122, 122, 122];
const LINIE = [214, 214, 214];
const FLAECHE = [244, 244, 244];

const RAND = 18;                 // mm
const SEITE = { breite: 210, hoehe: 297 };
const INNEN = SEITE.breite - 2 * RAND;

const zahl = (n, stellen = 2) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/** @param doc  jsPDF-Instanz
 *  @param daten { kopf, kennzahlen, projekte, eintraege }
 */
export function zeichneNachweis(doc, daten, { mitEinzelnachweis = false } = {}) {
  let y = kopfBereich(doc, daten.kopf);
  y = kennzahlenBereich(doc, daten.kennzahlen, y);
  y = balkenBereich(doc, daten.projekte, y);
  y = projekttabelle(doc, daten.projekte, y, daten);
  y = monatstabelle(doc, daten.monate, y);
  if (mitEinzelnachweis) einzelnachweis(doc, daten.eintraege, y);
  fusszeilenNachtragen(doc, daten.kopf);
}

// ---- Kopf ----------------------------------------------------------------

function kopfBereich(doc, kopf) {
  doc.setTextColor(...TINTE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Stundennachweis", RAND, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAU);
  doc.text(`${kopf.bereich} · ${kopf.zeitraum}`, RAND, 33);

  // Rechter Block: wer, wann. Rechtsbündig, damit die Kante steht.
  const rechts = SEITE.breite - RAND;
  doc.setFontSize(9);
  doc.setTextColor(...TINTE);
  doc.text(kopf.firma, rechts, 22, { align: "right" });
  doc.setTextColor(...GRAU);
  doc.text(kopf.person, rechts, 27, { align: "right" });
  doc.text(`erstellt ${kopf.erstelltAm}`, rechts, 32, { align: "right" });

  linie(doc, 39);
  return 39;
}

// ---- Kennzahlen ----------------------------------------------------------

function kennzahlenBereich(doc, werte, y) {
  const spalte = INNEN / werte.length;
  werte.forEach((k, i) => {
    const x = RAND + i * spalte;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...TINTE);
    doc.text(k.wert, x, y + 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAU);
    doc.text(k.label.toUpperCase(), x, y + 15);
  });
  linie(doc, y + 20);
  return y + 20;
}

// ---- Balken je Projekt ---------------------------------------------------

function balkenBereich(doc, projekte, y) {
  const zeigen = projekte.slice(0, 8);
  if (!zeigen.length) return y;

  überschrift(doc, "Verteilung", y + 9);
  let zeile = y + 14;

  const hoechst = Math.max(...zeigen.map((p) => p.stunden), 0.01);
  const beschriftung = 62;      // mm für den Namen
  const wertSpalte = 18;
  const balkenBreite = INNEN - beschriftung - wertSpalte - 4;

  for (const p of zeigen) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TINTE);
    const zeigeMarke = p.marke && !p.name.toLowerCase().startsWith(String(p.marke).toLowerCase());
    doc.text(kuerzen(doc, zeigeMarke ? `${p.marke}  ${p.name}` : p.name, beschriftung - 3), RAND, zeile + 3);

    // Führungsspur in Hellgrau, darauf der eigentliche Balken in Tinte --
    // so ist auch ein kurzer Balken als Anteil lesbar.
    const x = RAND + beschriftung;
    doc.setFillColor(...FLAECHE);
    doc.rect(x, zeile, balkenBreite, 3.4, "F");
    doc.setFillColor(...TINTE);
    doc.rect(x, zeile, Math.max(0.6, (p.stunden / hoechst) * balkenBreite), 3.4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(zahl(p.stunden), SEITE.breite - RAND, zeile + 3, { align: "right" });
    zeile += 7;
  }

  if (projekte.length > zeigen.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAU);
    const rest = projekte.length - zeigen.length;
    doc.text(`und ${rest} weitere${rest === 1 ? "s" : ""} Projekt${rest === 1 ? "" : "e"}`, RAND, zeile + 2);
    zeile += 5;
  }
  return zeile + 3;
}

// ---- Tabellen ------------------------------------------------------------

function projekttabelle(doc, projekte, y, daten) {
  const tabelle = doc.autoTable.bind(doc);
  überschrift(doc, "Summe je Projekt", y + 7);

  const koerper = projekte.map((p) => [p.nr, p.kuerzel, p.name, String(p.buchungen), zahl(p.stunden)]);
  koerper.push(["", "", "Summe", String(daten.kennzahlen[1].roh), zahl(daten.gesamtStunden)]);

  tabelle({
    startY: y + 10,
    margin: { left: RAND, right: RAND },
    head: [["Nr.", "Kürzel", "Projekt", "Buchungen", "Stunden"]],
    body: koerper,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.9, bottom: 1.9, left: 0, right: 0 }, textColor: TINTE },
    headStyles: { fontStyle: "bold", textColor: GRAU, fontSize: 7.5, lineWidth: { bottom: 0.25 }, lineColor: LINIE },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: LINIE },
    columnStyles: {
      0: { cellWidth: 18, overflow: "ellipsize" }, 1: { cellWidth: 18, overflow: "ellipsize" },
      3: { cellWidth: 22, halign: "right" }, 4: { cellWidth: 22, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (d) => {
      if (d.row.index === koerper.length - 1) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.lineWidth = { top: 0.4, bottom: 0 };
      }
    },
  });
  return doc.lastAutoTable.finalY;
}

/** Summe je Monat. Für die Abrechnung die zweite Frage nach "welches Projekt":
 *  in welchem Monat sind die Stunden angefallen. */
function monatstabelle(doc, monate, y) {
  if (!monate?.length) return y;
  const tabelle = doc.autoTable.bind(doc);
  let start = y + 10;
  if (start > SEITE.hoehe - 55) { doc.addPage(); start = 26; }
  überschrift(doc, "Summe je Monat", start);

  const gesamt = monate.reduce((s, m) => s + m.stunden, 0);
  const koerper = monate.map((m) => [m.label, String(m.buchungen), zahl(m.stunden)]);
  koerper.push(["Summe", String(monate.reduce((s, m) => s + m.buchungen, 0)), zahl(gesamt)]);

  tabelle({
    startY: start + 3,
    margin: { left: RAND, right: RAND },
    head: [["Monat", "Buchungen", "Stunden"]],
    body: koerper,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.9, bottom: 1.9, left: 0, right: 0 }, textColor: TINTE },
    headStyles: { fontStyle: "bold", textColor: GRAU, fontSize: 7.5, lineWidth: { bottom: 0.25 }, lineColor: LINIE },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: LINIE },
    // Volle Satzbreite, damit die Tabelle mit der darueber buendig steht --
    // sonst endet sie mittendrin und wirkt wie abgeschnitten.
    columnStyles: {
      0: { cellWidth: INNEN - 44 },
      1: { cellWidth: 22, halign: "right" },
      2: { cellWidth: 22, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (d) => {
      if (d.row.index === koerper.length - 1) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.lineWidth = { top: 0.4, bottom: 0 };
      }
    },
  });
  return doc.lastAutoTable.finalY;
}

function einzelnachweis(doc, eintraege, y) {
  const tabelle = doc.autoTable.bind(doc);
  let start = y + 12;
  // Erst umbrechen, wenn nicht einmal mehr Ueberschrift und ein paar Zeilen
  // passen. Die vorige Grenze schob den Einzelnachweis auf eine neue Seite,
  // obwohl auf der ersten noch ein Drittel frei war.
  if (start > SEITE.hoehe - 48) { doc.addPage(); start = 26; }
  überschrift(doc, "Einzelnachweis", start);

  tabelle({
    startY: start + 3,
    margin: { left: RAND, right: RAND, top: 22 },
    head: [["Datum", "Zeit", "Projekt", "Notiz", "Stunden"]],
    // Das Datum steht nur in der ersten Zeile eines Tages. Wiederholung
    // erzeugt sonst eine Spalte aus lauter gleichem Text, die das Auge
    // durchstreichen muss, um die Tage zu finden.
    body: eintraege.map((e) => [e.datumAnzeige, e.zeit, e.projekt, e.notiz, zahl(e.stunden)]),
    theme: "plain",
    styles: { fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 0 }, textColor: TINTE },
    headStyles: { fontStyle: "bold", textColor: GRAU, fontSize: 7.5, lineWidth: { bottom: 0.25 }, lineColor: LINIE },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: LINIE },
    columnStyles: {
      0: { cellWidth: 20 }, 1: { cellWidth: 22, textColor: GRAU },
      // Der Projektname muss lesbar bleiben: mit blossem Kuerzel hiessen alle
      // fuenf NOP-Posten gleich "NOP" und waren im Nachweis nicht zu trennen.
      2: { cellWidth: 46, overflow: "ellipsize" }, 4: { cellWidth: 16, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (d) => {
      // Tagesbeginn bekommt eine kräftigere Trennlinie oben
      if (d.section === "body" && eintraege[d.row.index]?.tagesbeginn && d.row.index > 0) {
        d.cell.styles.lineWidth = { top: 0.25, bottom: 0.1 };
      }
    },
  });
}

// ---- Hilfen --------------------------------------------------------------

function überschrift(doc, text, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAU);
  doc.text(text.toUpperCase(), RAND, y);
}

function linie(doc, y) {
  doc.setDrawColor(...LINIE);
  doc.setLineWidth(0.25);
  doc.line(RAND, y, SEITE.breite - RAND, y);
}

function kuerzen(doc, text, mm) {
  let t = String(text || "");
  while (t.length > 4 && doc.getTextWidth(t) > mm) t = t.slice(0, -2);
  return t === String(text || "") ? t : t + "…";
}

/** Fusszeilen erst am Ende setzen -- vorher steht die Gesamtzahl der Seiten
 *  nicht fest, und "Seite 2 von 3" ist die Angabe, die zaehlt. */
function fusszeilenNachtragen(doc, kopf) {
  const seiten = doc.internal.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINIE);
    doc.setLineWidth(0.25);
    doc.line(RAND, SEITE.hoehe - 14, SEITE.breite - RAND, SEITE.hoehe - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAU);
    doc.text(`${kopf.firma} · ${kopf.bereich} · ${kopf.zeitraum}`, RAND, SEITE.hoehe - 10);
    doc.text(`Seite ${i} von ${seiten}`, SEITE.breite - RAND, SEITE.hoehe - 10, { align: "right" });
  }
}
