// Anmeldung bei Microsoft — gemeinsame Grundlage für OneDrive und Outlook.
// Bewusst ohne MSAL-Bibliothek: der Auth-Code-Flow mit PKCE ist hier rund
// 100 Zeilen, MSAL wären 200 KB bei jedem App-Start.
//
// EINMALIGE VORAUSSETZUNG in Entra (App "CoWork_OS Claude" → Authentifizierung):
// Plattform "Einzelseitenanwendung (SPA)" mit dieser Umleitungs-URI:
//     https://rz6jf2vg7b-gif.github.io/zeiterfassung-app/
// Ohne diesen Eintrag lehnt Microsoft die Anmeldung mit AADSTS9002326 ab.

const MANDANT = "a8270f4f-5927-47f9-9500-09f00736ffe8";
const KLIENT = "056553d5-0a4f-4801-a06c-99f40ebdeaa7";

// Genau die Berechtigungen, die der App bereits erteilt sind (siehe
// CoWork_OS/00_resources/scripts/m365_graph.py). Ein kleinerer Umfang wäre
// sauberer, würde aber eine neue Zustimmung auslösen.
const RECHTE = [
  "openid", "profile", "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Files.ReadWrite.All",
  "https://graph.microsoft.com/Calendars.ReadWrite",
].join(" ");

const S_VERIFIER = "ms_verifier";
const S_TOKEN = "ms_token";
const S_TOKEN_ALT = "od_token";     // Schlüssel der ersten Fassung

export const GRAPH = "https://graph.microsoft.com/v1.0";

const speicher = {
  lies: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  schreib: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  weg: (k) => localStorage.removeItem(k),
};

function gespeichert() {
  return speicher.lies(S_TOKEN) || speicher.lies(S_TOKEN_ALT);
}

export const umleitungsZiel = () =>
  location.origin + location.pathname.replace(/index\.html$/, "");

export const angemeldet = () => !!gespeichert()?.refresh;
export const konto = () => gespeichert()?.konto || null;

// ---- PKCE ---------------------------------------------------------------

function zufall(laenge = 64) {
  const roh = crypto.getRandomValues(new Uint8Array(laenge));
  return btoa(String.fromCharCode(...roh)).replace(/[+/=]/g, "").slice(0, laenge);
}

async function s256(text) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function anmelden() {
  const verifier = zufall();
  sessionStorage.setItem(S_VERIFIER, verifier);
  const p = new URLSearchParams({
    client_id: KLIENT,
    response_type: "code",
    redirect_uri: umleitungsZiel(),
    scope: RECHTE,
    code_challenge: await s256(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  location.assign(`https://login.microsoftonline.com/${MANDANT}/oauth2/v2.0/authorize?${p}`);
}

/** Beim App-Start aufrufen: holt den Code aus der URL, falls wir gerade
 *  von der Microsoft-Anmeldung zurückkommen. */
export async function rueckkehrPruefen() {
  const p = new URLSearchParams(location.search);
  const code = p.get("code");
  const fehler = p.get("error_description") || p.get("error");
  if (!code && !fehler) return null;

  history.replaceState({}, "", umleitungsZiel() + location.hash);
  if (fehler) return { ok: false, meldung: lesbarerFehler(fehler) };

  const verifier = sessionStorage.getItem(S_VERIFIER);
  sessionStorage.removeItem(S_VERIFIER);
  if (!verifier) return { ok: false, meldung: "Anmeldung abgelaufen — bitte erneut versuchen." };

  try {
    await tokenHolen({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: umleitungsZiel() });
    return { ok: true };
  } catch (e) {
    return { ok: false, meldung: lesbarerFehler(e.message) };
  }
}

function lesbarerFehler(text) {
  if (/AADSTS9002326|redirect_uri|cross-origin/i.test(text)) {
    return "Die App ist in Entra nicht als Einzelseitenanwendung (SPA) mit dieser Adresse eingetragen: "
      + umleitungsZiel();
  }
  if (/AADSTS65001|consent/i.test(text)) return "Eine Berechtigung wurde noch nicht erteilt.";
  return text;
}

async function tokenHolen(zusatz) {
  const res = await fetch(`https://login.microsoftonline.com/${MANDANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: KLIENT, scope: RECHTE, ...zusatz }),
  });
  const daten = await res.json();
  if (!res.ok) throw new Error(daten.error_description || daten.error || "Anmeldung fehlgeschlagen");

  const alt = gespeichert() || {};
  speicher.schreib(S_TOKEN, {
    refresh: daten.refresh_token || alt.refresh,
    access: daten.access_token,
    gueltigBis: Date.now() + (daten.expires_in - 120) * 1000,
    konto: kontoAusToken(daten.id_token) || alt.konto,
  });
  speicher.weg(S_TOKEN_ALT);
  return daten.access_token;
}

function kontoAusToken(idToken) {
  if (!idToken) return null;
  try {
    const nutzlast = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return nutzlast.preferred_username || nutzlast.email || null;
  } catch { return null; }
}

async function gueltigerToken() {
  const t = gespeichert();
  if (!t?.refresh) throw new Error("nicht angemeldet");
  if (t.access && Date.now() < t.gueltigBis) return t.access;
  return tokenHolen({ grant_type: "refresh_token", refresh_token: t.refresh });
}

export function abmelden() {
  speicher.weg(S_TOKEN);
  speicher.weg(S_TOKEN_ALT);
}

/** Ein Graph-Aufruf mit gültigem Token. Wirft mit lesbarem Text statt
 *  nacktem Statuscode — die Meldung landet direkt in der Oberfläche. */
export async function graph(pfad, { methode = "GET", koerper = null, kopf = {} } = {}) {
  const token = await gueltigerToken();
  const res = await fetch(pfad.startsWith("http") ? pfad : GRAPH + pfad, {
    method: methode,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(koerper ? { "Content-Type": "application/json" } : {}),
      ...kopf,
    },
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  if (res.status === 204) return null;
  if (res.status === 404) return { _nichtGefunden: true };
  const text = await res.text();
  const daten = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const meldung = daten?.error?.message || `Graph antwortete ${res.status}`;
    throw new Error(meldung);
  }
  return daten;
}
