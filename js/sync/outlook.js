// Outlook-Kalender über Graph. Der iOS-Kalender selbst ist für Web-Apps
// gesperrt — aber der Outlook-Kalender liegt auf dem iPhone in der Kalender-App,
// der Umweg führt also ans selbe Ziel.
//
// Zwei Richtungen:
//   lesen    — Termine eines Tages als Buchungsvorschlag
//   schreiben — Urlaub/Abwesenheit als Ganztagestermin
import { graph } from "./microsoft.js";
import { alsDatumString, ausDatumString } from "../core/time.js";

const ZEITZONE = "W. Europe Standard Time";

export async function kalenderListe() {
  const d = await graph("/me/calendars?$select=id,name,isDefaultCalendar,canEdit&$top=50");
  return (d?.value || []).map((k) => ({
    id: k.id, name: k.name, standard: !!k.isDefaultCalendar, schreibbar: !!k.canEdit,
  }));
}

function pfad(kalenderId, rest) {
  return kalenderId ? `/me/calendars/${kalenderId}${rest}` : `/me${rest}`;
}

/** Termine eines Tages. Ganztägige und abgesagte werden weggelassen —
 *  aus denen entsteht keine sinnvolle Buchung. */
export async function termineDesTages(datum, kalenderId = null) {
  const von = `${datum}T00:00:00`;
  const bis = `${datum}T23:59:59`;
  const url = pfad(kalenderId, `/calendarView?startDateTime=${von}&endDateTime=${bis}`)
    + "&$select=id,subject,start,end,isAllDay,isCancelled,showAs,location,categories&$orderby=start/dateTime&$top=50";
  const d = await graph(url, { kopf: { Prefer: `outlook.timezone="${ZEITZONE}"` } });

  return (d?.value || [])
    .filter((t) => !t.isAllDay && !t.isCancelled && t.showAs !== "free")
    .map((t) => {
      const von = t.start.dateTime.slice(11, 16);
      const bis = t.end.dateTime.slice(11, 16);
      return {
        kalenderId: t.id,
        titel: t.subject || "(ohne Betreff)",
        von, bis,
        minuten: spanne(von, bis),
        ort: t.location?.displayName || null,
        kategorien: t.categories || [],
      };
    })
    .filter((t) => t.minuten > 0);
}

function spanne(von, bis) {
  const [vh, vm] = von.split(":").map(Number);
  const [bh, bm] = bis.split(":").map(Number);
  let d = (bh * 60 + bm) - (vh * 60 + vm);
  if (d < 0) d += 24 * 60;
  return d;
}

/** Abwesenheit als Ganztagestermin schreiben. Ein Termin über den ganzen
 *  Zeitraum statt einer je Tag — so sieht es im Kalender aus wie Urlaub
 *  aussehen soll, als ein Block.
 *  Graph erwartet bei Ganztagesterminen ein Enddatum EINEN Tag nach dem
 *  letzten Urlaubstag; das ist die häufigste Fehlerquelle an dieser Stelle. */
export async function abwesenheitSchreiben({ titel, von, bis, kategorie, kalenderId = null }) {
  const endeExklusiv = ausDatumString(bis);
  endeExklusiv.setDate(endeExklusiv.getDate() + 1);

  const termin = {
    subject: titel,
    isAllDay: true,
    showAs: kategorie === "krank" ? "oof" : "oof",
    isReminderOn: false,
    start: { dateTime: `${von}T00:00:00.0000000`, timeZone: ZEITZONE },
    end: { dateTime: `${alsDatumString(endeExklusiv)}T00:00:00.0000000`, timeZone: ZEITZONE },
    body: { contentType: "text", content: "Eingetragen über die Stundenerfassung." },
  };

  const d = await graph(pfad(kalenderId, "/events"), { methode: "POST", koerper: termin });
  return d?.id || null;
}

export async function terminLoeschen(terminId, kalenderId = null) {
  if (!terminId) return;
  try {
    await graph(pfad(kalenderId, `/events/${terminId}`), { methode: "DELETE" });
  } catch {
    // Termin schon von Hand gelöscht — kein Grund, die Aktion abzubrechen
  }
}
