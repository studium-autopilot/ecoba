// Privater Datenkanal zwischen dem eigenen Server und dem Plugin: AES-256-GCM über Web Crypto, damit das Plugin
// (Obsidian, auch iPhone/iPad) mit derselben API entschlüsselt. Ein Paket ist { schema, zweck, iv, daten } (base64url).
// Der Zweck („eingang“, „stand“, „unterlagen“, „pdf“) steckt als Zusatzdaten in der Verschlüsselung: Ein Paket für den einen Zweck lässt sich
// nicht als das andere ausgeben. Der Schlüssel (32 Byte) kennen nur Server und Plugin; er geht nie über den Kanal selbst.
import { webcrypto } from "node:crypto";

export const KANAL_SCHEMA = 1;
const ZWECKE = new Set(["eingang", "stand", "unterlagen", "pdf"]);
const kodieren = new TextEncoder();
const dekodieren = new TextDecoder();
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
const unb64 = (text) => Buffer.from(String(text || ""), "base64url");
const zusatz = (zweck) => kodieren.encode(`studium-autopilot/kanal/v${KANAL_SCHEMA}/${zweck}`);

export function neuerSchluessel() {
  return b64(webcrypto.getRandomValues(new Uint8Array(32)));
}

async function schluesselLaden(schluessel) {
  const roh = unb64(schluessel);
  if (roh.length !== 32) throw new Error("Schlüssel muss 32 Byte lang sein");
  return webcrypto.subtle.importKey("raw", roh, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function zweckPruefen(zweck) {
  if (!ZWECKE.has(zweck)) throw new Error(`Unbekannter Zweck: ${zweck}`);
}

export async function verschluesseln(schluessel, zweck, objekt) {
  zweckPruefen(zweck);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const klar = kodieren.encode(JSON.stringify(objekt));
  const geheim = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: zusatz(zweck) }, await schluesselLaden(schluessel), klar);
  return { schema: KANAL_SCHEMA, zweck, iv: b64(iv), daten: b64(geheim) };
}

// Wirft bei falschem Schlüssel, falschem Zweck, verändertem Inhalt oder unbekanntem Schema.
export async function entschluesseln(schluessel, zweck, paket) {
  return JSON.parse(dekodieren.decode(await entschluesselnRoh(schluessel, zweck, paket)));
}

// Wie entschluesseln, aber ohne JSON: die Bytes selbst (Zweck „pdf“: die PDF, wie sie im Tresor liegt). → Buffer
export async function entschluesselnRoh(schluessel, zweck, paket) {
  zweckPruefen(zweck);
  if (!paket || paket.schema !== KANAL_SCHEMA) throw new Error("Unbekanntes Schema des Pakets");
  if (paket.zweck !== zweck) throw new Error("Paket für einen anderen Zweck");
  const iv = unb64(paket.iv);
  if (iv.length !== 12) throw new Error("IV muss 12 Byte lang sein");
  return Buffer.from(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: zusatz(zweck) },
    await schluesselLaden(schluessel), unb64(paket.daten)));
}
