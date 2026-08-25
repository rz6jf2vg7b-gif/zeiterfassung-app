// Geschäftsjahr und Buchungsschluss.
//
// Bei der MVV läuft das Geschäftsjahr vom 01.10. bis 30.09. Bis zu dessen Ende
// müssen alle Stunden gebucht sein, sonst lassen sich die Projekte nicht
// abrechnen. Das macht aus einer Auswertung eine Frist: entscheidend ist nicht,
// wie viel gebucht wurde, sondern ob noch ein Arbeitstag offen ist.
import { ausDatumString, alsDatumString, heute } from "./time.js";
import { feiertageImZeitraum } from "./feiertage.js";
import { bereichWerte } from "./konten.js";

/** Geschäftsjahr, in das ein Datum fällt.
 *  startMonat 10 = beginnt am 1. Oktober. 1 wäre das Kalenderjahr. */
export function geschaeftsjahr(datum = null, startMonat = 10) {
  const d = ausDatumString(datum || heute());
  const jahr = d.getMonth() + 1 >= startMonat ? d.getFullYear() : d.getFullYear() - 1;
  const von = `${jahr}-${String(startMonat).padStart(2, "0")}-01`;
  const ende = new Date(jahr + 1, startMonat - 1, 0);   // Tag vor dem nächsten Start
  const bis = alsDatumString(ende);
  return {
    von, bis,
    label: startMonat === 1 ? String(jahr) : `${jahr}/${String(jahr + 1).slice(2)}`,
    kalenderjahr: startMonat === 1,
  };
}

export function voriges(gj, startMonat = 10) {
  const jahr = +gj.von.slice(0, 4) - 1;
  return geschaeftsjahr(`${jahr}-${String(startMonat).padStart(2, "0")}-15`, startMonat);
}

/** Tage bis zum Buchungsschluss. Negativ, wenn er vorbei ist. */
export function tageBis(datum) {
  const ziel = ausDatumString(datum);
  const jetzt = ausDatumString(heute());
  return Math.round((ziel - jetzt) / 86400000);
}

/** Arbeitstage ohne jeden Eintrag im gewählten Bereich.
 *  Zukünftige Tage bleiben außen vor — die sind zu Recht leer.
 *  Ein Tag mit Abwesenheit (Urlaub, Krank, Gleitzeit) gilt als erledigt. */
export function offeneTage(eintraege, werte, { von, bis, bereich }) {
  const heuteStr = heute();
  const ende = bis < heuteStr ? bis : heuteStr;
  if (von > ende) return [];

  const feiertage = feiertageImZeitraum(von, ende, werte.bundeslaender);
  const belegt = new Set(
    eintraege
      .filter((e) => e.bereich === bereich && e.datum >= von && e.datum <= ende)
      .map((e) => e.datum)
  );

  const offen = [];
  for (let d = ausDatumString(von); alsDatumString(d) <= ende; d.setDate(d.getDate() + 1)) {
    const datum = alsDatumString(d);
    const wt = d.getDay() === 0 ? 7 : d.getDay();
    if (!werte.arbeitstage.includes(wt)) continue;
    if (feiertage.has(datum)) continue;
    if (belegt.has(datum)) continue;
    offen.push(datum);
  }
  return offen;
}

/** Stand des laufenden Geschäftsjahres eines Bereichs.
 *
 *  Die Prüfung auf offene Tage beginnt nicht am Jahresanfang, sondern
 *  frühestens an dem Tag, ab dem in dieser App überhaupt erfasst wird. Sonst
 *  meldet eine frische Installation das halbe Geschäftsjahr als "nicht
 *  gebucht" — obwohl die Stunden im Quellsystem längst stehen, nur nicht hier. */
export function abschlussStand(eintraege, einstellungen, bereichId) {
  const werte = bereichWerte(einstellungen, bereichId);
  const gj = geschaeftsjahr(null, werte.geschaeftsjahrStart || 1);

  const eigene = eintraege.filter((e) => e.bereich === bereichId);
  const erster = eigene.length
    ? eigene.reduce((a, e) => (e.datum < a ? e.datum : a), eigene[0].datum)
    : heute();
  const pruefungAb = [gj.von, werte.saldoStart, erster]
    .filter(Boolean).reduce((a, b) => (a > b ? a : b));

  const offen = offeneTage(eintraege, werte, { von: pruefungAb, bis: gj.bis, bereich: bereichId });
  const imJahr = eigene.filter((e) => e.datum >= gj.von && e.datum <= gj.bis);
  const gebucht = imJahr.filter((e) => e.art !== "abwesenheit");
  const restTage = tageBis(gj.bis);

  return {
    ...gj, bereich: bereichId, offen, pruefungAb,
    vollstaendigesJahr: pruefungAb === gj.von,
    kalenderjahr: (werte.geschaeftsjahrStart || 1) === 1,
    minuten: gebucht.reduce((s, e) => s + e.minuten, 0),
    buchungen: gebucht.length,
    abwesenheitstage: imJahr.filter((e) => e.art === "abwesenheit").length,
    restTage,
    // Ab acht Wochen vor Schluss wird es dringlich, ab zwei Wochen kritisch
    dringlichkeit: offen.length === 0 ? "ruhig"
      : restTage < 0 ? "abgelaufen"
      : restTage <= 14 ? "kritisch"
      : restTage <= 56 ? "dringend"
      : "offen",
  };
}
