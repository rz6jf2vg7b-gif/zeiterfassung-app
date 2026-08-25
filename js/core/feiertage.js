// Gesetzliche Feiertage in Deutschland, nach Bundesland.
// Berechnet statt nachgeschlagen: eine Tabelle müsste jedes Jahr gepflegt
// werden und wäre irgendwann still veraltet.

export const BUNDESLAENDER = [
  { id: "BW", name: "Baden-Württemberg" },
  { id: "BY", name: "Bayern" },
  { id: "BE", name: "Berlin" },
  { id: "BB", name: "Brandenburg" },
  { id: "HB", name: "Bremen" },
  { id: "HH", name: "Hamburg" },
  { id: "HE", name: "Hessen" },
  { id: "MV", name: "Mecklenburg-Vorpommern" },
  { id: "NI", name: "Niedersachsen" },
  { id: "NW", name: "Nordrhein-Westfalen" },
  { id: "RP", name: "Rheinland-Pfalz" },
  { id: "SL", name: "Saarland" },
  { id: "SN", name: "Sachsen" },
  { id: "ST", name: "Sachsen-Anhalt" },
  { id: "SH", name: "Schleswig-Holstein" },
  { id: "TH", name: "Thüringen" },
];

const ALLE = BUNDESLAENDER.map((l) => l.id);

/** Ostersonntag nach der Gaußschen Osterformel in der Fassung von Meeus.
 *  Alle beweglichen Feiertage hängen daran. */
function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = März, 4 = April
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag);
}

function verschoben(datum, tage) {
  const d = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate() + tage);
  return d;
}

function schluessel(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Buß- und Bettag: Mittwoch vor dem 23. November. Nur noch in Sachsen gesetzlich. */
function bussUndBettag(jahr) {
  const d = new Date(jahr, 10, 22);              // 22.11.
  while (d.getDay() !== 3) d.setDate(d.getDate() - 1);
  return d;
}

/** Alle Feiertage eines Jahres als Map "JJJJ-MM-TT" -> { name, laender }.
 *  Regionale Sonderfälle (Fronleichnam in Teilen Sachsens/Thüringens,
 *  Mariä Himmelfahrt nur in katholischen Gemeinden Bayerns) sind bewusst
 *  nicht abgebildet — sie hängen an der Gemeinde, nicht am Land. */
export function feiertageDesJahres(jahr) {
  const ostern = ostersonntag(jahr);
  const eintraege = [
    [new Date(jahr, 0, 1), "Neujahr", ALLE],
    [new Date(jahr, 0, 6), "Heilige Drei Könige", ["BW", "BY", "ST"]],
    [new Date(jahr, 2, 8), "Internationaler Frauentag", ["BE", "MV"]],
    [verschoben(ostern, -2), "Karfreitag", ALLE],
    [verschoben(ostern, 0), "Ostersonntag", ["BB"]],
    [verschoben(ostern, 1), "Ostermontag", ALLE],
    [new Date(jahr, 4, 1), "Tag der Arbeit", ALLE],
    [verschoben(ostern, 39), "Christi Himmelfahrt", ALLE],
    [verschoben(ostern, 49), "Pfingstsonntag", ["BB"]],
    [verschoben(ostern, 50), "Pfingstmontag", ALLE],
    [verschoben(ostern, 60), "Fronleichnam", ["BW", "BY", "HE", "NW", "RP", "SL"]],
    [new Date(jahr, 7, 15), "Mariä Himmelfahrt", ["SL"]],
    [new Date(jahr, 8, 20), "Weltkindertag", ["TH"]],
    [new Date(jahr, 9, 3), "Tag der Deutschen Einheit", ALLE],
    [new Date(jahr, 9, 31), "Reformationstag", ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"]],
    [new Date(jahr, 10, 1), "Allerheiligen", ["BW", "BY", "NW", "RP", "SL"]],
    [bussUndBettag(jahr), "Buß- und Bettag", ["SN"]],
    [new Date(jahr, 11, 25), "1. Weihnachtstag", ALLE],
    [new Date(jahr, 11, 26), "2. Weihnachtstag", ALLE],
  ];

  const karte = new Map();
  for (const [datum, name, laender] of eintraege) {
    karte.set(schluessel(datum), { name, laender });
  }
  return karte;
}

const zwischenspeicher = new Map();

/** Feiertage eines Jahres, gefiltert auf die gewählten Länder.
 *  Rückgabe: Map "JJJJ-MM-TT" -> { name, laender }. */
export function feiertage(jahr, gewaehlteLaender = []) {
  if (!gewaehlteLaender.length) return new Map();
  const cacheSchluessel = `${jahr}|${[...gewaehlteLaender].sort().join(",")}`;
  if (zwischenspeicher.has(cacheSchluessel)) return zwischenspeicher.get(cacheSchluessel);

  const gefiltert = new Map();
  for (const [tag, eintrag] of feiertageDesJahres(jahr)) {
    if (eintrag.laender.some((l) => gewaehlteLaender.includes(l))) {
      gefiltert.set(tag, eintrag);
    }
  }
  zwischenspeicher.set(cacheSchluessel, gefiltert);
  return gefiltert;
}

/** Feiertage über einen Datumsbereich, auch über Jahresgrenzen hinweg. */
export function feiertageImZeitraum(vonDatum, bisDatum, laender) {
  const vonJahr = +vonDatum.slice(0, 4);
  const bisJahr = +bisDatum.slice(0, 4);
  const zusammen = new Map();
  for (let j = vonJahr; j <= bisJahr; j++) {
    for (const [tag, e] of feiertage(j, laender)) {
      if (tag >= vonDatum && tag <= bisDatum) zusammen.set(tag, e);
    }
  }
  return zusammen;
}

export const landName = (id) => BUNDESLAENDER.find((l) => l.id === id)?.name || id;
