// Stundenkonto und Urlaubskonto — je Lebensbereich getrennt.
//
// Der fachliche Kern in einem Satz: Das Soll richtet sich nach den Arbeitstagen,
// das Ist nach dem Erfassten — und die Abwesenheitsarten verhalten sich dabei
// unterschiedlich:
//
//   Feiertag   ist gar kein Arbeitstag -> taucht im Soll nicht auf, Saldo neutral
//   Urlaub     wird mit den Soll-Stunden gutgeschrieben -> Saldo neutral
//   Krank      ebenso -> Saldo neutral
//   Gleitzeit  wird NICHT gutgeschrieben -> Saldo sinkt um die Soll-Stunden
//
// Die letzte Zeile ist der Zweck der Sache: Abfeiern heißt, das Überstundenkonto
// zu verbrauchen. Würde ein Gleitzeittag wie Urlaub gutgeschrieben, bliebe der
// Saldo stehen und man käme nie zum Abbau.
import { ausDatumString, alsDatumString, heute } from "./time.js";
import { feiertageImZeitraum } from "./feiertage.js";

export const GUTGESCHRIEBEN = ["urlaub", "krank", "sonstiges"];
export const ZEHREND = ["gleitzeit"];

export const wirdGutgeschrieben = (kategorie) => GUTGESCHRIEBEN.includes(kategorie);

/** Die für einen Bereich geltenden Werte, ergänzt um das, was übergreifend gilt
 *  (Feiertage hängen am Wohnort, nicht am Auftraggeber). */
export function bereichWerte(einstellungen, bereichId) {
  const b = einstellungen.bereiche?.[bereichId] || {};
  return {
    ...b,
    bundeslaender: einstellungen.bundeslaender || [],
    arbeitstage: b.arbeitstage || [1, 2, 3, 4, 5],
    sollStundenTag: b.sollStundenTag ?? 8,
  };
}

/** Bereiche, für die ein Konto geführt wird. */
export function kontoBereiche(einstellungen) {
  return Object.entries(einstellungen.bereiche || {})
    .filter(([, b]) => b.kontoFuehren)
    .map(([id]) => id);
}

/** Soll-Stunden (in Minuten) zwischen zwei Daten, Feiertage und arbeitsfreie
 *  Wochentage bereits abgezogen. */
export function sollMinuten(von, bis, werte) {
  if (!von || !bis || bis < von) return { tage: 0, minuten: 0 };
  const feiertage = feiertageImZeitraum(von, bis, werte.bundeslaender);
  let tage = 0;
  for (let d = ausDatumString(von); alsDatumString(d) <= bis; d.setDate(d.getDate() + 1)) {
    const datum = alsDatumString(d);
    const wt = d.getDay() === 0 ? 7 : d.getDay();
    if (werte.arbeitstage.includes(wt) && !feiertage.has(datum)) tage += 1;
  }
  return { tage, minuten: Math.round(tage * werte.sollStundenTag * 60) };
}

/** Beitrag eines Eintrags zum Ist. Gleitzeit zählt bewusst null. */
export function istBeitrag(eintrag) {
  if (eintrag.art !== "abwesenheit") return eintrag.minuten;
  return wirdGutgeschrieben(eintrag.kategorie) ? eintrag.minuten : 0;
}

/** Stand des Kontos: einschließlich gestern.
 *  Der laufende Tag bleibt außen vor — sonst zeigt das Konto jeden Morgen
 *  ein Minus in Höhe des Tagessolls, weil der Tag noch nicht gearbeitet ist. */
function gestern() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return alsDatumString(d);
}

function ersterTag(eintraege, bereich) {
  const passend = eintraege.filter((e) => e.bereich === bereich);
  if (!passend.length) return null;
  return passend.reduce((a, e) => (e.datum < a ? e.datum : a), passend[0].datum);
}

export function stundenkonto(eintraege, einstellungen, bereichId, bisDatum = null) {
  const werte = bereichWerte(einstellungen, bereichId);
  const bis = bisDatum || gestern();
  // Ohne gesetztes Startdatum beginnt das Konto beim ersten Eintrag dieses
  // Bereichs, nicht am Jahresanfang — sonst zählen Monate als Minusstunden,
  // in denen die App noch gar nicht benutzt wurde.
  const von = werte.saldoStart || ersterTag(eintraege, bereichId) || bis;
  const anfang = Math.round((werte.saldoAnfang || 0) * 60);

  if (von > bis) {
    return { von, bis, bereich: bereichId, sollTage: 0, soll: 0, ist: 0, anfang,
             saldo: anfang, abgefeiert: 0,
             tageAbfeierbar: werte.sollStundenTag ? Math.floor((anfang / 60) / werte.sollStundenTag) : 0 };
  }

  const soll = sollMinuten(von, bis, werte);
  const relevant = eintraege.filter((e) =>
    e.datum >= von && e.datum <= bis && e.bereich === bereichId);

  const ist = relevant.reduce((s, e) => s + istBeitrag(e), 0);
  const abgefeiert = relevant
    .filter((e) => e.art === "abwesenheit" && ZEHREND.includes(e.kategorie))
    .reduce((s, e) => s + Math.round(werte.sollStundenTag * 60), 0);

  const saldo = anfang + ist - soll.minuten;
  return {
    von, bis, bereich: bereichId,
    sollTage: soll.tage, soll: soll.minuten, ist, anfang, saldo, abgefeiert,
    tageAbfeierbar: werte.sollStundenTag ? Math.floor((saldo / 60) / werte.sollStundenTag) : 0,
  };
}

/** Urlaubskonto eines Bereichs. Der Bezugszeitraum ist das Geschäftsjahr des
 *  Bereichs — bei Kalenderjahr-Bereichen also das Kalenderjahr.
 *  Vergangene und noch geplante Tage werden getrennt ausgewiesen: vor der Frage
 *  "kann ich noch weg?" zählt der Rest nach Abzug beider. */
export function urlaubskonto(eintraege, einstellungen, bereichId, zeitraum) {
  const werte = bereichWerte(einstellungen, bereichId);
  const heuteStr = heute();
  const { von, bis, label } = zeitraum;

  const imZeitraum = (kategorie) => eintraege.filter((e) =>
    e.art === "abwesenheit" && e.kategorie === kategorie
    && e.bereich === bereichId && e.datum >= von && e.datum <= bis);

  const urlaubstage = imZeitraum("urlaub");
  const genommen = urlaubstage.filter((e) => e.datum <= heuteStr).length;
  const geplant = urlaubstage.filter((e) => e.datum > heuteStr).length;
  const anspruch = werte.urlaubstage ?? 0;
  const uebertrag = werte.urlaubUebertrag ?? 0;

  return {
    bereich: bereichId, label, von, bis,
    anspruch, uebertrag, gesamt: anspruch + uebertrag,
    genommen, geplant,
    rest: anspruch + uebertrag - genommen - geplant,
    krankheitstage: imZeitraum("krank").length,
    gleitzeittage: imZeitraum("gleitzeit").length,
  };
}
