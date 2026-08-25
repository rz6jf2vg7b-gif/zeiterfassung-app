// Ablage der Buchungen in OneDrive. Anmeldung siehe microsoft.js.
import { graph } from "./microsoft.js";

const DATEIPFAD = "/me/drive/root:/Apps/Stundenerfassung/stunden.json";

export async function laden() {
  const d = await graph(`${DATEIPFAD}:/content`);
  return d?._nichtGefunden ? null : d;    // 404 = erste Nutzung, Datei fehlt noch
}

export async function speichern(daten) {
  return graph(`${DATEIPFAD}:/content`, { methode: "PUT", koerper: daten });
}

export const dateiPfadAnzeige = () => "OneDrive → Apps → Stundenerfassung → stunden.json";
