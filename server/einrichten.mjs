#!/usr/bin/env node
// Einrichtung des eigenen Servers in einem Oracle-Konto, Schritt für Schritt (server/README.md, „Einrichtung in der Cloud Shell“).
// Läuft in der Oracle Cloud Shell wie stand.mjs. Jeder Schritt prüft zuerst, ob er schon erledigt ist, und hält die
// Kostenregeln ein: nur Always Free, Reste aus stand.mjs, nichts Fremdes anfassen, alles Eigene mit Kennzeichen studium-autopilot.
//   node einrichten.mjs schutz --mail <adresse> [--ja]       Quota „nur-kostenlos“ und Budget „kostenwarnung“
//   node einrichten.mjs netz                                 eigenes Netz (Ports 22 und 443)
//   node einrichten.mjs server --schluessel <datei.pub>      der Server (A1, 2 OCPU, 12 GB); Exit 3 = gerade kein Platz, Oracle
//                                                            bremst, oder der Platzsucher sucht schon (dann kein eigener Versuch)
//   node einrichten.mjs platzsucher [--mail <adresse>] --schluessel <datei.pub> [--vorlage <platzsucher-helfer.yaml>]
//                                                            (platzsucher.py daneben kommt gepackt in die Vorlage)
//   node einrichten.mjs abschliessen                         Rechte des Platzsuchers weg, Boot-Volume auf den freien Rest, Quota fest
//   node einrichten.mjs platzsucher-beenden                  Helfer beenden, seine Rechte und das Mail-Thema entfernen
//   node einrichten.mjs adresse                              öffentliche IP, Adresse und SSH-Befehl des Servers
//   node einrichten.mjs schluessel-sichern                   ~/.ssh/studium_autopilot in den privaten Bucket des Kontos
//   node einrichten.mjs schluessel-holen                     fehlt er in der Cloud Shell: aus dem Bucket zurück
//   --paket <studium-server.tar.gz>                          server und platzsucher: der Server richtet sich damit beim ersten
//                                                            Start selbst vor (Standard: das Paket neben server/)
//   --oci <pfad>  --tenancy <ocid>  --json
// Exit: 0 erledigt, 1 Fehler oder Kostenregel verletzt, 2 Rückfrage nötig (--ja) bzw. falscher Aufruf, 3 kein Platz oder Oracle bremst.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auswerten, erheben, FREI, KENNZEICHEN, ociAufrufer, tenancyFinden, ZIEL } from "./stand.mjs";

export const NAMEN = { quota: "nur-kostenlos", budget: "kostenwarnung", gruppe: "studium-platzsucher", thema: "studium-autopilot" };
const A1 = "VM.Standard.A1.Flex";
const MICRO = "VM.Standard.E2.1.Micro";
// Private Bereiche des eigenen Netzes; als Zahlen geschrieben, weil werkzeuge/pruefen.py jede IP-Adresse meldet, auch private
const netzBereich = (a, b, c, d, laenge) => `${a}.${b}.${c}.${d}/${laenge}`;
const NETZ = { vcn: netzBereich(10, 0, 0, 0, 16), subnetz: netzBereich(10, 0, 0, 0, 24) };
const WEG = new Set(["TERMINATED", "TERMINATING", "DELETED", "DELETING"]);
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SSH = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) [A-Za-z0-9+/=]+( [^\n]{0,80})?$/;
const KAPAZITAET = /out of (host )?capacity/i;
// „Too many requests“: Oracle bremst die Anfragen des Kontos. Kein Fehler, nur später (platzsucher.py wartet dann länger).
const GEDROSSELT = /TooManyRequests|\(429\)/;

const liste = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.items) ? d.items : []);
const lebt = (x) => !WEG.has(x["lifecycle-state"]);
const gehoert = (x, wert) => (x["freeform-tags"] || {})[KENNZEICHEN] === wert;
const kennzeichen = (wert) => JSON.stringify({ [KENNZEICHEN]: wert });

// Quota-Richtlinie wie in server/README.md: alle Kerne null außer A1 bis zur freien Menge und 2 Micro; Blockspeicher höchstens
// speicherGb, keine Block-Volumes, höchstens 5 Backups. Läuft schon mehr (eigene bezahlte Ressourcen), bleibt deren Stand erlaubt.
export function quotaSaetze({ a1Ocpu = FREI.a1Ocpu, a1Gb = FREI.a1Gb, speicherGb = FREI.speicherGb } = {}) {
  return [
    "zero compute-core quotas in tenancy",
    `set compute-core quota standard-a1-core-count to ${a1Ocpu} in tenancy`,
    `set compute-core quota standard-a1-core-regional-count to ${a1Ocpu} in tenancy`,
    `set compute-memory quota standard-a1-memory-count to ${a1Gb} in tenancy`,
    `set compute-memory quota standard-a1-memory-regional-count to ${a1Gb} in tenancy`,
    `set compute-core quota standard-e2-micro-core-count to ${FREI.micro} in tenancy`,
    `set block-storage quota total-storage-gb to ${speicherGb} in tenancy`,
    "set block-storage quota volume-count to 0 in tenancy",
    `set block-storage quota backup-count to ${FREI.backups} in tenancy`,
  ];
}

// Mail-Regeln des Budgets: ab dem ersten Cent (1 % von 1 Euro) und bei einer Prognose über 1 Euro
const BUDGET_REGELN = [
  { typ: "ACTUAL", schwelle: 1, name: "ab-1-cent", text: "Oracle berechnet Geld. Ursache in der Konsole unter Billing > Cost Analysis suchen." },
  { typ: "FORECAST", schwelle: 100, name: "prognose-1-euro", text: "Oracle erwartet diesen Monat Kosten über 1 Euro." },
];

// Rechte des Platzsuchers: nur für die dynamische Gruppe mit genau dem Helfer. VOLUME_DELETE (sonst nur in „manage“), damit er
// sich nach dem Erfolg samt Boot-Volume beenden kann (DeleteBootVolume braucht es laut Oracles Rechtetabelle).
export const PLATZSUCHER_RECHTE = ["manage instance-family", "use volume-family", "use virtual-network-family", "use ons-topics",
  "manage volume-family in tenancy where request.permission = 'VOLUME_DELETE'"]
  .map((r) => `Allow dynamic-group ${NAMEN.gruppe} to ${r.includes(" in tenancy") ? r : r + " in tenancy"}`);

// Kleiner Helfer für die Schritte: Protokoll [{ was, status, text }] und Aufrufe, die bei Fehler werfen
function ablauf(oci) {
  const schritte = [];
  const merken = (was, status, text) => { schritte.push({ was, status, text }); return { was, status, text }; };
  const muss = async (was, args) => {
    const r = await oci(args);
    if (!r.ok) throw Object.assign(new Error(`${was}: ${r.fehler}`), { schritt: was });
    return r.data;
  };
  return { schritte, merken, muss };
}

// ---------- Schutz: Quota und Budget ----------
export async function schutz(oci, { tenancy, mail: angegeben, a, ja = false }) {
  const { schritte, merken, muss } = ablauf(oci);
  // Ohne --mail die Adresse des Budgets: Ist der Schutz schon ganz da, braucht ein weiterer Lauf (start.sh) keine Adresse
  const mail = angegeben || (a.schutz || {}).mail;
  if (!MAIL.test(String(mail || ""))) throw Object.assign(new Error("--mail <adresse> fehlt"), { exit: 2 });
  const t = ["--compartment-id", tenancy];
  let frage = false;
  if (a.schutz.quota) merken("quota", "da", `Quota „${NAMEN.quota}“ besteht.`);
  else {
    const bezahlt = a.befunde.filter((f) => f.art === "grenze").map((f) => f.text);
    if (bezahlt.length && !ja) {
      frage = true;
      merken("quota", "frage", `Im Konto läuft schon, was nicht kostenlos ist: ${bezahlt.join(" ")} Die Quota erlaubt das weiter, ` +
        "blockiert aber jede weitere bezahlte Ressource. Mit --ja anlegen.");
    } else {
      const saetze = quotaSaetze({ a1Ocpu: Math.max(FREI.a1Ocpu, a.belegt.ocpu), a1Gb: Math.max(FREI.a1Gb, a.belegt.gb),
        speicherGb: Math.max(FREI.speicherGb, a.belegt.speicherGb) });
      await muss("quota", ["limits", "quota", "create", ...t, "--name", NAMEN.quota, "--description", "Nur kostenlose Ressourcen (Studium Autopilot)",
        "--statements", JSON.stringify(saetze), "--freeform-tags", kennzeichen("schutz")]);
      merken("quota", "angelegt", `Quota „${NAMEN.quota}“ angelegt: nur kostenlose Formen, Blockspeicher höchstens ${Math.max(FREI.speicherGb, a.belegt.speicherGb)} GB.`);
    }
  }
  // Budget anlegen, wenn es fehlt; bei unserem (Kennzeichen schutz) fehlende Mail-Regeln ergänzen (auch nach einem Abbruch)
  let b = liste(await muss("budget", ["budgets", "budget", "budget", "list", ...t, "--all"])).find((x) => x["display-name"] === NAMEN.budget && lebt(x));
  let neu = false;
  if (!b) {
    b = await muss("budget", ["budgets", "budget", "budget", "create", ...t, "--amount", "1", "--reset-period", "MONTHLY",
      "--target-type", "COMPARTMENT", "--targets", JSON.stringify([tenancy]), "--display-name", NAMEN.budget,
      "--description", "Warnt ab dem ersten Cent (Studium Autopilot)", "--freeform-tags", kennzeichen("schutz")]);
    neu = true;
  }
  if (neu || gehoert(b, "schutz")) {
    const da = liste(await muss("budget", ["budgets", "budget", "alert-rule", "list", "--budget-id", b.id, "--all"])).filter(lebt).map((r) => r["display-name"]);
    const fehlend = BUDGET_REGELN.filter((r) => da.indexOf(r.name) < 0);
    for (const r of fehlend) {
      await muss("budget", ["budgets", "budget", "alert-rule", "create", "--budget-id", b.id, "--type", r.typ, "--threshold", String(r.schwelle),
        "--threshold-type", "PERCENTAGE", "--display-name", r.name, "--recipients", mail, "--message", r.text]);
    }
    merken("budget", neu ? "angelegt" : fehlend.length ? "ergaenzt" : "da", neu
      ? `Budget „${NAMEN.budget}“ angelegt: Mail an ${mail} ab dem ersten Cent und bei einer Prognose über 1 Euro.`
      : fehlend.length ? `Budget „${NAMEN.budget}“: fehlende Mail-Regeln ergänzt (an ${mail}).` : `Budget „${NAMEN.budget}“ besteht.`);
  } else merken("budget", a.schutz.budget ? "da" : "uebersprungen", `Ein Budget „${NAMEN.budget}“ besteht, stammt aber nicht von der Einrichtung; unverändert.`);
  return { schritte, exit: frage ? 2 : 0 };
}

// ---------- Netz ----------
const REGELN_EIN = [
  { protocol: "6", source: "0.0.0.0/0", isStateless: false, description: "SSH (nur mit Schlüssel)", tcpOptions: { destinationPortRange: { min: 22, max: 22 } } },
  { protocol: "6", source: "0.0.0.0/0", isStateless: false, description: "HTTPS (Caddy)", tcpOptions: { destinationPortRange: { min: 443, max: 443 } } },
  { protocol: "1", source: "0.0.0.0/0", isStateless: false, description: "Path MTU", icmpOptions: { type: 3, code: 4 } },
];
const REGELN_AUS = [{ protocol: "all", destination: "0.0.0.0/0", isStateless: false }];

export async function netz(oci, { tenancy }) {
  const { schritte, merken, muss } = ablauf(oci);
  const t = ["--compartment-id", tenancy];
  const eigenes = async (was, args) => liste(await muss(was, args)).find((x) => lebt(x) && gehoert(x, "netz")) || null;
  const fertig = ["--freeform-tags", kennzeichen("netz"), "--wait-for-state", "AVAILABLE"];
  let vcn = await eigenes("netz", ["network", "vcn", "list", ...t, "--all"]);
  if (vcn) merken("netz", "da", "Netz „studium-autopilot“ besteht.");
  else {
    vcn = await muss("netz", ["network", "vcn", "create", ...t, "--cidr-blocks", JSON.stringify([NETZ.vcn]), "--display-name", "studium-autopilot",
      "--dns-label", "studium", ...fertig]);
    merken("netz", "angelegt", `Netz „studium-autopilot“ angelegt (${NETZ.vcn}).`);
  }
  const v = ["--vcn-id", vcn.id];
  let gw = await eigenes("gateway", ["network", "internet-gateway", "list", ...t, ...v, "--all"]);
  if (!gw) {
    gw = await muss("gateway", ["network", "internet-gateway", "create", ...t, ...v, "--is-enabled", "true", "--display-name", "studium-autopilot", ...fertig]);
    merken("gateway", "angelegt", "Zugang ins Internet angelegt.");
  } else merken("gateway", "da", "Zugang ins Internet besteht.");
  const rt = await muss("route", ["network", "route-table", "get", "--rt-id", vcn["default-route-table-id"]]);
  if ((rt["route-rules"] || []).some((r) => r.destination === "0.0.0.0/0" && r["network-entity-id"] === gw.id)) merken("route", "da", "Route ins Internet besteht.");
  else {
    await muss("route", ["network", "route-table", "update", "--rt-id", rt.id, "--force",
      "--route-rules", JSON.stringify([{ destination: "0.0.0.0/0", destinationType: "CIDR_BLOCK", networkEntityId: gw.id }])]);
    merken("route", "angelegt", "Route ins Internet eingetragen.");
  }
  // Die Standardliste (nur Port 22) legt Oracle mit dem Netz an und gibt ihr dessen Kennzeichen mit; sie ist nicht unsere
  const standard = vcn["default-security-list-id"];
  let sl = liste(await muss("regeln", ["network", "security-list", "list", ...t, ...v, "--all"]))
    .find((x) => lebt(x) && gehoert(x, "netz") && x.id !== standard) || null;
  if (!sl) {
    sl = await muss("regeln", ["network", "security-list", "create", ...t, ...v, "--display-name", "studium-autopilot",
      "--ingress-security-rules", JSON.stringify(REGELN_EIN), "--egress-security-rules", JSON.stringify(REGELN_AUS), ...fertig]);
    merken("regeln", "angelegt", "Regeln angelegt: von außen nur Port 22 (SSH mit Schlüssel) und 443 (HTTPS).");
  } else merken("regeln", "da", "Regeln bestehen.");
  let sub = await eigenes("subnetz", ["network", "subnet", "list", ...t, ...v, "--all"]);
  if (!sub) {
    sub = await muss("subnetz", ["network", "subnet", "create", ...t, ...v, "--cidr-block", NETZ.subnetz, "--display-name", "studium-autopilot",
      "--dns-label", "server", "--route-table-id", rt.id, "--security-list-ids", JSON.stringify([sl.id]), "--prohibit-public-ip-on-vnic", "false", ...fertig]);
    merken("subnetz", "angelegt", `Teilnetz angelegt (${NETZ.subnetz}).`);
  } else if ((sub["security-list-ids"] || []).includes(sl.id)) merken("subnetz", "da", "Teilnetz besteht.");
  else {
    // Bis 0.5.3 hing das Teilnetz an der Standardliste: Port 443 war von außen zu
    await muss("subnetz", ["network", "subnet", "update", "--subnet-id", sub.id, "--security-list-ids", JSON.stringify([sl.id]), "--force",
      "--wait-for-state", "AVAILABLE"]);
    merken("subnetz", "repariert", "Teilnetz nutzt jetzt die eigenen Regeln: Port 443 (HTTPS) ist von außen erreichbar.");
  }
  return { schritte, exit: 0, subnetz: sub.id };
}

// ---------- Server ----------
const bild = async (muss, tenancy, version, form) => {
  const d = liste(await muss("abbild", ["compute", "image", "list", "--compartment-id", tenancy, "--operating-system", "Canonical Ubuntu",
    "--operating-system-version", version, "--shape", form, "--sort-by", "TIMECREATED", "--sort-order", "DESC", "--all"]));
  if (!d.length) throw new Error(`abbild: kein Ubuntu ${version} für ${form}`);
  return d[0];
};
const eigenesSubnetz = async (muss, tenancy) => {
  const vcn = liste(await muss("netz", ["network", "vcn", "list", "--compartment-id", tenancy, "--all"])).find((x) => lebt(x) && gehoert(x, "netz"));
  const sub = vcn && liste(await muss("netz", ["network", "subnet", "list", "--compartment-id", tenancy, "--vcn-id", vcn.id, "--all"])).find((x) => lebt(x) && gehoert(x, "netz"));
  if (!sub) throw Object.assign(new Error("netz: zuerst „node einrichten.mjs netz“"), { exit: 2 });
  return sub.id;
};
// Anlegen in jedem Verfügbarkeitsbereich der Reihe nach; „Out of host capacity“ → nächster. → { instanz } | { kapazitaet: true }
// | { gedrosselt: true } (Oracle bremst: sofort aufhören, jeder weitere Bereich würde nur weiter gebremst)
// weiter: Fehler, bei denen der nächste Bereich dran ist (Standard: kein Platz; beim Helfer auch LimitExceeded, denn E2.1.Micro
// gibt es oft nur in einem Bereich). Jeder andere Fehler bricht ab, ohne einen weiteren Bereich zu versuchen.
const anlegenIrgendwo = async (oci, args, ads, weiter = KAPAZITAET) => {
  let letzter = "";
  for (const ad of ads) {
    const r = await oci([...args, "--availability-domain", ad]);
    if (r.ok) return { instanz: r.data, ad };
    if (GEDROSSELT.test(r.fehler || "")) return { gedrosselt: true };
    if (!weiter.test(r.fehler || "")) throw new Error("anlegen: " + r.fehler);
    letzter = r.fehler || "";
  }
  return KAPAZITAET.test(letzter) ? { kapazitaet: true } : { fehler: letzter };
};
// Server und Platzsucher nur mit Schutz (Quota und Budget mit Mail-Regeln): sonst hielte nichts eine zweite bezahlte Instanz auf
const schutzFehlt = (a) => (a.schutz.quota && a.schutz.budget ? null
  : Object.assign(new Error("Erst den Schutz vor Kosten einrichten: node server/einrichten.mjs schutz --mail <adresse>"), { exit: 2 }));
const schluesselPruefen = (s) => {
  const k = String(s || "").trim();
  if (!SSH.test(k)) throw Object.assign(new Error("--schluessel: öffentlicher SSH-Schlüssel (.pub) fehlt"), { exit: 2 });
  return k;
};
// Metadaten nur über IMDSv2 (CIS OCI 3.1): Die alten Endpunkte ohne Kopfzeile lassen sich über SSRF auslesen
const NUR_IMDS2 = ["--instance-options", JSON.stringify({ areLegacyImdsEndpointsDisabled: true })];
const quelle = (image, gb) => JSON.stringify({ sourceType: "image", imageId: image, bootVolumeSizeInGBs: gb, bootVolumeVpusPerGB: FREI.vpu });
// Selbst vorbereiten (server/README.md): Der Server lädt beim ersten Start das Paket dieser Version aus dem Release, prüft es
// gegen die SHA-256 des Pakets, das die Cloud Shell schon geprüft hat, und seine Signatur mit ssh-keygen -Y verify (Ubuntu 24.04:
// OpenSSH 9.6) gegen die Schlüssel in SIGNIERSCHLUESSEL, nie aus dem Download, und installiert alles ohne Adresse (installieren.sh
// --vorbereiten). Adresse und HTTPS setzt erst `fern.sh installieren` mit der IP aus dem Konto: Eine IP, die der Server selbst
// erfragt, könnte falsch sein. Keine Geheimnisse hier, die Startdaten liest jeder Prozess auf dem Server. Ohne gültiges Paket
// (etwa ein Testpaket ohne Release) keine Startdaten; dann installiert `fern.sh installieren` alles wie bisher.
export const PAKET_VERSION = /^\d+\.\d+\.\d+(-beta\.\d+)?$/;
// Wer Server-Pakete signieren darf: dieselben Schlüssel wie server/allowed_signers (tests/paket-pruefen.test.js vergleicht)
export const SIGNIERSCHLUESSEL = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBVvg98K+YQb1YhQFh5w2EE4QEs8QG7gN3jRK6G8pzjc"];
export function serverStart(paket) {
  const { version, summe } = paket || {};
  if (!PAKET_VERSION.test(String(version || "")) || !/^[0-9a-f]{64}$/.test(String(summe || ""))) return "";
  const url = `https://github.com/studium-autopilot/ecoba/releases/download/v${version}/studium-server.tar.gz`;
  return ["#cloud-config", "runcmd:", "  - - bash", "    - -c", "    - |",
    "      set -u",
    "      exec >>/var/log/studium-server-vorbereiten.log 2>&1",
    "      d=$(mktemp -d /root/studium-paket.XXXXXX)",
    `      for i in 1 2 3 4 5; do curl -fsSL -o "$d/paket.tar.gz" '${url}' && curl -fsSL -o "$d/paket.tar.gz.sig" '${url}.sig' && break; sleep 60; done`,
    `      echo '${summe}  '"$d/paket.tar.gz" | sha256sum -c - || exit 1`,
    ...SIGNIERSCHLUESSEL.map((s) => `      echo 'release@studium-autopilot namespaces="studium-server" ${s}' >>"$d/erlaubt"`),
    "      ssh-keygen -Y verify -f \"$d/erlaubt\" -I release@studium-autopilot -n studium-server -s \"$d/paket.tar.gz.sig\" <\"$d/paket.tar.gz\" || exit 1",
    "      tar -xzf \"$d/paket.tar.gz\" -C \"$d\" && bash \"$d/server/installieren.sh\" --vorbereiten", ""].join("\n");
}
export const serverMetadaten = (ssh, paket) => {
  const start = serverStart(paket);
  return start ? { ssh_authorized_keys: ssh, user_data: Buffer.from(start).toString("base64") } : { ssh_authorized_keys: ssh };
};

export async function server(oci, { tenancy, a, ads, schluessel, paket }) {
  const { schritte, merken, muss } = ablauf(oci);
  if (a.plan.status === "da") { merken("server", "da", a.plan.text); return { schritte, exit: 0 }; }
  // Der Platzsucher versucht es alle paar Minuten. Ein Versuch daneben bringt nichts, Oracle bremst dann nur beide (429).
  if (a.platzsucher) {
    merken("server", "platzsucher", "Der Platzsucher sucht schon nach Platz für den Server; kein zweiter Versuch daneben.");
    return { schritte, exit: 3 };
  }
  if (a.plan.status !== "passt") { merken("server", "fehler", a.plan.text); return { schritte, exit: 1 }; }
  if (schutzFehlt(a)) throw schutzFehlt(a);
  const ssh = schluesselPruefen(schluessel);
  const sub = await eigenesSubnetz(muss, tenancy);
  const image = await bild(muss, tenancy, "24.04", A1);
  const r = await anlegenIrgendwo(oci, ["compute", "instance", "launch", "--compartment-id", tenancy, "--shape", A1,
    "--shape-config", JSON.stringify({ ocpus: ZIEL.ocpu, memoryInGBs: ZIEL.gb }), "--source-details", quelle(image.id, a.plan.bootGb),
    "--subnet-id", sub, "--assign-public-ip", "true", "--display-name", "studium-autopilot-server",
    "--freeform-tags", kennzeichen("server"), "--metadata", JSON.stringify(serverMetadaten(ssh, paket)), ...NUR_IMDS2], ads);
  if (r.kapazitaet) {
    merken("server", "kein-platz", "Oracle hat gerade in keinem Verfügbarkeitsbereich Platz für den Server. Der Platzsucher kann es weiter versuchen.");
    return { schritte, exit: 3 };
  }
  if (r.gedrosselt) {
    merken("server", "gedrosselt", "Oracle bremst gerade (zu viele Anfragen). Der Platzsucher kann es mit Pausen weiter versuchen.");
    return { schritte, exit: 3 };
  }
  merken("server", "angelegt", `Server angelegt: A1 ${ZIEL.ocpu} OCPU / ${ZIEL.gb} GB, Boot-Volume ${a.plan.bootGb} GB, ${image["display-name"]}.`);
  return { schritte, exit: 0, instanz: r.instanz.id };
}

// ---------- Platzsucher ----------
// Oracle nimmt höchstens 32 000 Byte Metadaten je Instanz (user_data base64 und SSH-Schlüssel zusammen)
const METADATEN_MAX = 32000;
// Fassung des Helfers: Prüfsumme über cloud-init-Vorlage, platzsucher.py und die festen Teile seiner Konfiguration (Bereiche,
// SSH-Schlüssel: ein neuer Schlüssel in der Cloud Shell käme sonst nie auf den Server), als zweites Kennzeichen am Helfer. Nicht
// darin: das Boot-Volume (ändert sich, solange ein alter Helfer noch zählt) und das Abbild (sucht der Helfer jede Runde neu).
const FASSUNG = KENNZEICHEN + "-fassung";
export const helferFassung = (vorlage, skript, { ads = [], ssh = "" } = {}) => createHash("sha256").update(vorlage).update("\0").update(skript)
  .update("\0").update(JSON.stringify({ ads, ssh })).digest("hex").slice(0, 16);

export async function platzsucher(oci, { tenancy, a, ads, schluessel, mail: angegeben, vorlage, skript, paket }) {
  const { schritte, merken, muss } = ablauf(oci);
  // ohne --mail die Adresse aus dem Schutz (Budget „kostenwarnung“): Die Einrichtung fragt nur einmal danach
  const mail = angegeben || (a.schutz || {}).mail;
  if (!MAIL.test(String(mail || ""))) throw Object.assign(new Error("--mail <adresse> fehlt (das Budget hat keine Mail-Adresse)"), { exit: 2 });
  if (a.plan.status === "da") { merken("platzsucher", "da", a.plan.text + " Kein Platzsucher nötig."); return { schritte, exit: 0 }; }
  if (schutzFehlt(a)) throw schutzFehlt(a);
  // die Zeilen in write_files (die Platzhalter stehen auch im Kopfkommentar)
  const PLATZ = "content: KONFIG_JSON_BASE64", PLATZ_SKRIPT = "content: PLATZSUCHER_GZ_BASE64";
  if (!vorlage || vorlage.indexOf(PLATZ) < 0 || vorlage.indexOf(PLATZ_SKRIPT) < 0) throw new Error("vorlage: platzsucher-helfer.yaml fehlt");
  if (!skript || skript.indexOf("#!/usr/bin/env python3") !== 0) throw new Error("skript: platzsucher.py fehlt");
  const ssh = schluesselPruefen(schluessel);
  const fassung = helferFassung(vorlage, skript, { ads, ssh });
  const t = ["--compartment-id", tenancy];
  // Nur Eigenes anfassen: Thema, Gruppe oder Richtlinie gleichen Namens ohne unser Kennzeichen → abbrechen
  const eigenesOder = async (was, abfrage, name) => {
    const x = liste(await muss(was, abfrage)).find((y) => y.name === name && lebt(y));
    if (x && !gehoert(x, "helfer")) throw new Error(`${was}: „${name}“ gibt es schon, aber nicht von der Einrichtung; nichts geändert`);
    return x || null;
  };
  // Mail-Abo anlegen, wenn es fehlt. Unbestätigt (PENDING) kommt keine Mail an, auch nicht „Dein Server ist da“.
  const aboSicherstellen = async (themaId) => {
    const meins = liste(await muss("abo", ["ons", "subscription", "list", ...t, "--topic-id", themaId, "--all"]))
      .find((x) => String(x.endpoint).toLowerCase() === mail.toLowerCase() && lebt(x));
    if (!meins) {
      await muss("abo", ["ons", "subscription", "create", ...t, "--topic-id", themaId, "--protocol", "EMAIL", "--subscription-endpoint", mail]);
      merken("abo", "angelegt", `Mail-Abo für ${mail} angelegt. Bitte den Link „Confirm subscription“ in der Mail von Oracle anklicken.`);
    } else if (meins["lifecycle-state"] === "PENDING") {
      merken("abo", "offen", `Mail-Abo für ${mail} noch nicht bestätigt: den Link „Confirm subscription“ in der Mail von Oracle anklicken (auch im Spam nachsehen). Vorher kommt keine Mail vom Platzsucher.`);
    } else merken("abo", "da", "Mail-Abo besteht.");
  };
  let helfer = liste(await muss("helfer", ["compute", "instance", "list", ...t, "--all"])).find((i) => lebt(i) && gehoert(i, "helfer"));
  // Helfer einer früheren Fassung ersetzen: cloud-init läuft nur beim ersten Start, ein Neustart brächte weder das neue Skript noch
  // eine damals gescheiterte Installation. Sein Boot-Volume zählt in a.plan noch mit; der neue sucht darum mit entsprechend
  // kleinerem Boot-Volume (nie über dem freien Topf, auch solange das alte noch gelöscht wird), „abschliessen“ vergrößert es.
  if (helfer && (helfer["freeform-tags"] || {})[FASSUNG] !== fassung) {
    if (a.plan.status !== "passt") { merken("helfer", "fehler", a.plan.text); return { schritte, exit: 1 }; }
    // Warten auf den Arbeitsauftrag (nicht die Instanz): Erst danach ist der Micro-Platz für den neuen Helfer frei
    const auftrag = await muss("helfer", ["compute", "instance", "terminate", "--instance-id", helfer.id, "--preserve-boot-volume", "false", "--force",
      "--wait-for-state", "SUCCEEDED", "--wait-for-state", "FAILED"]);
    if ((auftrag || {}).status === "FAILED") throw Object.assign(new Error("helfer: Oracle konnte den alten Helfer nicht beenden"), { schritt: "helfer" });
    merken("helfer", "ersetzt", "Helfer einer früheren Version beendet (oder mit einem anderen Schlüssel); ein neuer sucht mit diesem Stand weiter.");
    helfer = null;
  }
  if (helfer) {
    // Angehalten (in der Konsole oder von Oracle) sucht er nicht; Starten kostet nichts, er sucht dann mit seinem Stand weiter
    if (helfer["lifecycle-state"] === "STOPPED") {
      await muss("helfer", ["compute", "instance", "action", "--instance-id", helfer.id, "--action", "START"]);
      merken("helfer", "gestartet", "Der Helfer war angehalten und sucht jetzt wieder.");
    } else merken("helfer", "da", "Der Platzsucher läuft schon.");
    const thema = await eigenesOder("thema", ["ons", "topic", "list", ...t, "--name", NAMEN.thema, "--all"], NAMEN.thema);
    if (thema) await aboSicherstellen(thema["topic-id"]);
  } else {
    if (a.plan.status !== "passt") { merken("helfer", "fehler", a.plan.text); return { schritte, exit: 1 }; }
    const sub =await eigenesSubnetz(muss, tenancy);
    // Bescheid per Mail: Thema und Abo (die Mail von Oracle einmal bestätigen)
    let thema = await eigenesOder("thema", ["ons", "topic", "list", ...t, "--name", NAMEN.thema, "--all"], NAMEN.thema);
    if (!thema) {
      thema = await muss("thema", ["ons", "topic", "create", ...t, "--name", NAMEN.thema, "--description", "Bescheid vom Platzsucher (Studium Autopilot)",
        "--freeform-tags", kennzeichen("helfer")]);
      merken("thema", "angelegt", "Thema für den Bescheid per Mail angelegt.");
    } else merken("thema", "da", "Thema für den Bescheid besteht.");
    const themaId = thema["topic-id"];
    await aboSicherstellen(themaId);
    const serverBild = await bild(muss, tenancy, "24.04", A1);
    const helferBild = await bild(muss, tenancy, "24.04 Minimal", MICRO);
    const konfig = { compartment: tenancy, ads, subnet: sub, image: serverBild.id, boot_gb: a.plan.bootGb, ssh_schluessel: ssh, user_data: serverMetadaten(ssh, paket).user_data || "", thema: themaId };
    // platzsucher.py aus diesem Paket (in der Cloud Shell schon mit der Prüfsumme geprüft) statt eines Downloads auf dem Helfer
    const cloudInit = vorlage.replace(PLATZ, "content: " + Buffer.from(JSON.stringify(konfig)).toString("base64"))
      .replace(PLATZ_SKRIPT, "content: " + gzipSync(Buffer.from(skript, "utf8"), { level: 9 }).toString("base64"));
    const metadaten = { ssh_authorized_keys: ssh, user_data: Buffer.from(cloudInit).toString("base64") };
    if (JSON.stringify(metadaten).length > METADATEN_MAX) throw new Error(`Startdaten des Helfers zu groß (über ${METADATEN_MAX} Byte)`);
    const r = await anlegenIrgendwo(oci, ["compute", "instance", "launch", ...t, "--shape", MICRO, "--source-details", quelle(helferBild.id, ZIEL.helferBootGb),
      "--subnet-id", sub, "--assign-public-ip", "true", "--display-name", "studium-autopilot-platzsucher",
      "--freeform-tags", JSON.stringify({ [KENNZEICHEN]: "helfer", [FASSUNG]: fassung }),
      "--metadata", JSON.stringify(metadaten), ...NUR_IMDS2], ads, /out of (host )?capacity|LimitExceeded/i);
    if (r.kapazitaet) { merken("helfer", "kein-platz", "Auch für den kleinen Helfer ist gerade kein Platz. Später noch einmal versuchen."); return { schritte, exit: 3 }; }
    if (r.gedrosselt) { merken("helfer", "gedrosselt", "Oracle bremst gerade (zu viele Anfragen). Später noch einmal versuchen."); return { schritte, exit: 3 }; }
    if (r.fehler) { merken("helfer", "fehler", "Der Helfer ließ sich in keinem Bereich anlegen: " + r.fehler); return { schritte, exit: 1 }; }
    helfer = r.instanz;
    merken("helfer", "angelegt", `Helfer angelegt (${MICRO}, ${ZIEL.helferBootGb} GB). Er sucht für den Server mit ${a.plan.bootGb} GB Boot-Volume.`);
  }
  // Rechte nur für diesen Helfer, bei jedem Aufruf sichergestellt (nach dem Anlegen, weil die Regel seine OCID braucht; der
  // Platzsucher wartet 30 Minuten darauf). Fehlten sie bei einem schon laufenden Helfer, startet er neu und sucht weiter.
  const regel = `instance.id = '${helfer.id}'`;
  let geaendert = false;
  const gruppe = await eigenesOder("gruppe", ["iam", "dynamic-group", "list", ...t, "--name", NAMEN.gruppe, "--all"], NAMEN.gruppe);
  if (!gruppe) {
    await muss("gruppe", ["iam", "dynamic-group", "create", ...t, "--name", NAMEN.gruppe, "--description", "Nur der Platzsucher-Helfer von Studium Autopilot",
      "--matching-rule", regel, "--freeform-tags", kennzeichen("helfer")]);
    geaendert = true;
  } else if (gruppe["matching-rule"] !== regel) {
    await muss("gruppe", ["iam", "dynamic-group", "update", "--dynamic-group-id", gruppe.id, "--matching-rule", regel, "--force"]);
    geaendert = true;
  }
  const richtlinie = await eigenesOder("rechte", ["iam", "policy", "list", ...t, "--name", NAMEN.gruppe, "--all"], NAMEN.gruppe);
  if (!richtlinie) {
    await muss("rechte", ["iam", "policy", "create", ...t, "--name", NAMEN.gruppe, "--description", "Rechte des Platzsuchers (Studium Autopilot)",
      "--statements", JSON.stringify(PLATZSUCHER_RECHTE), "--freeform-tags", kennzeichen("helfer")]);
    geaendert = true;
  } else if (JSON.stringify(richtlinie.statements) !== JSON.stringify(PLATZSUCHER_RECHTE)) {
    // Richtlinie einer älteren Version: auf den aktuellen Stand bringen. Mit --statements verlangt die OCI-Kommandozeile auch
    // --version-date; leer schickt sie keins mit, das Datum bleibt also ungesetzt wie beim Anlegen.
    await muss("rechte", ["iam", "policy", "update", "--policy-id", richtlinie.id, "--statements", JSON.stringify(PLATZSUCHER_RECHTE),
      "--version-date", "", "--force"]);
    geaendert = true;
  }
  merken("rechte", geaendert ? "angelegt" : "da", geaendert ? "Rechte nur für den Helfer vergeben (dynamische Gruppe und Richtlinie)." : "Rechte des Helfers bestehen.");
  if (geaendert && schritte.some((s) => s.was === "helfer" && s.status === "da")) {
    await muss("helfer", ["compute", "instance", "action", "--instance-id", helfer.id, "--action", "SOFTRESET"]);
    merken("helfer", "neustart", "Helfer neu gestartet, damit er mit den Rechten weitersucht.");
  } else if (a.platzsucher && a.platzsucher.id === helfer.id && schritte.some((s) => s.was === "helfer" && s.status === "da")) {
    // Stand des laufenden Helfers (stand.mjs): angehalten oder ohne Meldung braucht er einen Menschen
    merken("stand", a.platzsucher.status, a.platzsucher.text);
    if (["angehalten", "still"].includes(a.platzsucher.status)) return { schritte, exit: 1, helfer: helfer.id };
  }
  return { schritte, exit: 0, helfer: helfer.id };
}

// Rechte des Platzsuchers entfernen (nur unsere: Name und Kennzeichen)
async function rechteEntfernen(muss, merken, t) {
  for (const [was, abfrage, loeschen, text] of [
    ["rechte", ["iam", "policy", "list", ...t, "--name", NAMEN.gruppe, "--all"], ["iam", "policy", "delete", "--force", "--policy-id"], "Richtlinie des Platzsuchers entfernt."],
    ["gruppe", ["iam", "dynamic-group", "list", ...t, "--name", NAMEN.gruppe, "--all"], ["iam", "dynamic-group", "delete", "--force", "--dynamic-group-id"], "Dynamische Gruppe des Platzsuchers entfernt."],
  ]) {
    for (const x of liste(await muss(was, abfrage)).filter((y) => y.name === NAMEN.gruppe && gehoert(y, "helfer") && lebt(y))) {
      await muss(was, [...loeschen, x.id]);
      merken(was, "entfernt", text);
    }
  }
}

// ---------- Platzsucher beenden (auf Wunsch, z. B. nach der Mail nach 14 Tagen) ----------
export async function platzsucherBeenden(oci, { tenancy }) {
  const { schritte, merken, muss } = ablauf(oci);
  const t = ["--compartment-id", tenancy];
  const helfer = liste(await muss("helfer", ["compute", "instance", "list", ...t, "--all"])).filter((i) => lebt(i) && gehoert(i, "helfer"));
  for (const h of helfer) {
    await muss("helfer", ["compute", "instance", "terminate", "--instance-id", h.id, "--preserve-boot-volume", "false", "--force"]);
    merken("helfer", "beendet", `Helfer „${h["display-name"] || h.id}“ beendet, sein Boot-Volume wird gelöscht.`);
  }
  if (!helfer.length) merken("helfer", "da", "Es läuft kein Platzsucher.");
  await rechteEntfernen(muss, merken, t);
  for (const x of liste(await muss("thema", ["ons", "topic", "list", ...t, "--name", NAMEN.thema, "--all"])).filter((y) => y.name === NAMEN.thema && gehoert(y, "helfer"))) {
    await muss("thema", ["ons", "topic", "delete", "--topic-id", x["topic-id"], "--force"]);
    merken("thema", "entfernt", "Mail-Thema des Platzsuchers entfernt.");
  }
  return { schritte, exit: 0 };
}

// ---------- Abschließen ----------
export async function abschliessen(oci, { tenancy, a }) {
  const { schritte, merken, muss } = ablauf(oci);
  const t = ["--compartment-id", tenancy];
  const instanzen = liste(await muss("server", ["compute", "instance", "list", ...t, "--all"])).filter(lebt);
  const srv = instanzen.find((i) => gehoert(i, "server"));
  // Ein kleiner Server (platzsucher.py, „Klein zuerst“) wird fertig eingerichtet, während der Helfer ihn nachts vergrößert. Seine
  // Rechte und das Boot-Volume bleiben bis dahin: Solange der Helfer lebt, zählen seine 50 GB zum freien Topf.
  const klein = !!srv && Number((srv["shape-config"] || {}).ocpus) < ZIEL.ocpu;
  const helfer = instanzen.some((i) => gehoert(i, "helfer"));
  if (helfer && !klein) {
    merken("helfer", "laeuft", "Der Platzsucher-Helfer läuft noch; er beendet sich selbst, sobald der Server da ist. Danach noch einmal.");
    return { schritte, exit: 2 };
  }
  if (!srv) { merken("server", "fehler", "Kein Server mit Kennzeichen gefunden."); return { schritte, exit: 1 }; }
  if (helfer) {
    merken("helfer", "klein", "Der Server läuft vorerst mit 1 OCPU / 6 GB. Der Platzsucher-Helfer bringt ihn nachts auf " +
      `${ZIEL.ocpu} OCPU / ${ZIEL.gb} GB und beendet sich dann; den restlichen Speicher bekommt er mit dem nächsten Lauf danach.`);
  } else await rechteEntfernen(muss, merken, t);
  // Server aus Versionen bis 0.5.3 erlauben noch die alten Metadaten-Endpunkte; die Änderung braucht keinen Neustart
  if ((srv["instance-options"] || {})["are-legacy-imds-endpoints-disabled"]) merken("metadaten", "da", "Metadaten nur über IMDSv2.");
  else {
    await muss("metadaten", ["compute", "instance", "update", "--instance-id", srv.id, ...NUR_IMDS2, "--force"]);
    merken("metadaten", "angepasst", "Metadaten des Servers nur noch über IMDSv2.");
  }
  // Boot-Volume auf den ganzen freien Rest (Oracle zählt es danach ganz zum freien Topf)
  const anhang = liste(await muss("volume", ["compute", "boot-volume-attachment", "list", ...t, "--availability-domain", srv["availability-domain"],
    "--instance-id", srv.id, "--all"])).find((x) => x["lifecycle-state"] === "ATTACHED");
  let zuwachs = 0;
  if (anhang) {
    const bv = await muss("volume", ["bv", "boot-volume", "get", "--boot-volume-id", anhang["boot-volume-id"]]);
    const alt = Number(bv["size-in-gbs"]) || 0;
    zuwachs = Math.max(0, Math.floor(a.rest.speicherGb));
    if (zuwachs > 0) {
      // Erst nach dem Arbeitsauftrag ist das Volume groß; ein Neustart davor sähe beim Start noch die alte Größe
      await muss("volume", ["bv", "boot-volume", "update", "--boot-volume-id", bv.id, "--size-in-gbs", String(alt + zuwachs), "--force",
        "--wait-for-state", "AVAILABLE"]);
      merken("volume", "vergroessert", `Boot-Volume von ${alt} auf ${alt + zuwachs} GB vergrößert. start.sh startet den Server danach neu, damit Ubuntu das Dateisystem vergrößert.`);
    } else merken("volume", "da", `Boot-Volume hat ${alt} GB, der freie Blockspeicher ist ganz genutzt.`);
  }
  // Quota: Blockspeicher auf den Stand danach, damit nichts Neues mehr hinzukommt (nur unsere Quota)
  const q = liste(await muss("quota", ["limits", "quota", "list", ...t, "--name", NAMEN.quota, "--all"])).find((x) => x.name === NAMEN.quota && lebt(x));
  if (q && gehoert(q, "schutz")) {
    const voll = await muss("quota", ["limits", "quota", "get", "--quota-id", q.id]);
    const ziel = Math.ceil(a.belegt.speicherGb + zuwachs);
    const saetze = (voll.statements || []).map((s) => s.replace(/^(set block-storage quota total-storage-gb to )\d+( in tenancy)$/, `$1${ziel}$2`));
    if (JSON.stringify(saetze) !== JSON.stringify(voll.statements || [])) {
      await muss("quota", ["limits", "quota", "update", "--quota-id", q.id, "--statements", JSON.stringify(saetze), "--force"]);
      merken("quota", "angepasst", `Quota: Blockspeicher höchstens ${ziel} GB, also nichts Neues mehr.`);
    } else merken("quota", "da", "Quota passt.");
  } else merken("quota", "uebersprungen", q ? "Quota „nur-kostenlos“ stammt nicht von der Einrichtung; unverändert." : "Keine Quota „nur-kostenlos“; erst „schutz“.");
  return { schritte, exit: 0 };
}

// ---------- Adresse ----------
// schluessel: { "~/.ssh/<name>.pub": Inhalt } aus der Cloud Shell. Passt ~/.ssh/studium_autopilot nicht zum Server (ein früherer
// Versuch legte ihn mit einem anderen Schlüssel an), nennt der Schritt die passende Datei und wie sie an den festen Ort kommt.
const SCHLUESSEL = "~/.ssh/studium_autopilot.pub";
const kern = (s) => String(s || "").trim().split(/\s+/).slice(0, 2).join(" ");

export async function adresse(oci, { tenancy, schluessel }) {
  const { schritte, merken, muss } = ablauf(oci);
  const srv = liste(await muss("server", ["compute", "instance", "list", "--compartment-id", tenancy, "--all"])).find((i) => lebt(i) && gehoert(i, "server"));
  if (!srv) { merken("server", "fehler", "Kein Server mit Kennzeichen gefunden."); return { schritte, exit: 1 }; }
  const vnic = liste(await muss("adresse", ["compute", "instance", "list-vnics", "--instance-id", srv.id, "--all"])).find((x) => x["public-ip"]);
  if (!vnic) { merken("adresse", "fehler", `Server „${srv["display-name"]}“ (${srv["lifecycle-state"]}) hat noch keine öffentliche IP.`); return { schritte, exit: 1 }; }
  const ip = vnic["public-ip"];
  const wert = { ip, adresse: `https://${ip.replace(/\./g, "-")}.sslip.io`, ssh: `ssh -i ~/.ssh/studium_autopilot ubuntu@${ip}`, zustand: srv["lifecycle-state"] };
  merken("adresse", "da", `Server ${wert.zustand}: ${wert.adresse}`);
  if (!schluessel) return { schritte, exit: 0, ...wert };
  const meta = ((await muss("schluessel", ["compute", "instance", "get", "--instance-id", srv.id])) || {}).metadata || {};
  const erlaubt = String(meta.ssh_authorized_keys || "").split("\n").map(kern).filter(Boolean);
  const passend = Object.keys(schluessel).filter((p) => erlaubt.includes(kern(schluessel[p])));
  if (passend.includes(SCHLUESSEL)) { merken("schluessel", "da", "Der Schlüssel ~/.ssh/studium_autopilot passt zum Server."); return { schritte, exit: 0, ...wert }; }
  if (passend.length) {
    const p = passend[0];
    merken("schluessel", "anderer", `Der Server wurde mit ${p} angelegt. Einmal an den festen Ort kopieren, dann weiter: ` +
      `cp ${p.replace(/\.pub$/, "")} ~/.ssh/studium_autopilot && cp ${p} ${SCHLUESSEL}`);
    return { schritte, exit: 2, ...wert };
  }
  merken("schluessel", "fehlt", "Kein Schlüssel unter ~/.ssh passt zum Server.");
  return { schritte, exit: 1, ...wert };
}

// ---------- Schlüssel sichern ----------
// Den Schlüssel zum Server gibt es nur in der Cloud Shell, und Oracle löscht ihren Ordner nach sechs Monaten ohne Nutzung. Eine
// Kopie liegt darum im eigenen Konto: privater Bucket (Objektspeicher, ein paar KB der freien 20 GB), geschützt wie das Konto
// selbst (Anmeldung, Zwei-Faktor). Der Platzsucher hat keine Rechte auf Objektspeicher. Nur ein Bucket mit Kennzeichen
// „schluessel“ und ohne öffentlichen Zugriff; ein Schlüssel im Bucket wird nie überschrieben, einer in der Cloud Shell auch nicht.
// Der Schlüssel hat keine Passphrase (start.sh): Wer den Bucket lesen kann, ist root auf dem Server. Das darf nur, wer Rechte auf
// den Objektspeicher des Kontos hat, im Konto dieser Einrichtung allein der Administrator, und der kann den Server ohnehin
// übernehmen (server/README.md, „Schlüssel im Konto“).
export const BUCKET = "studium-autopilot-schluessel";
const OBJEKTE = ["studium_autopilot", "studium_autopilot.pub"];
const NICHT_DA = /NotFound|\(404\)/;

async function bucketFinden(oci, muss, tenancy, anlegen) {
  const ns = await muss("bucket", ["os", "ns", "get"]);
  if (typeof ns !== "string" || !/^[a-z0-9]{1,64}$/i.test(ns)) throw new Error("bucket: Namensraum des Objektspeichers unbekannt");
  const r = await oci(["os", "bucket", "get", "--namespace-name", ns, "--bucket-name", BUCKET]);
  if (!r.ok && !NICHT_DA.test(r.fehler || "")) throw Object.assign(new Error("bucket: " + r.fehler), { schritt: "bucket" });
  let bucket = r.ok ? r.data : null;
  let neu = false;
  if (!bucket && anlegen) {
    bucket = await muss("bucket", ["os", "bucket", "create", "--compartment-id", tenancy, "--namespace-name", ns, "--name", BUCKET,
      "--public-access-type", "NoPublicAccess", "--freeform-tags", kennzeichen("schluessel")]);
    neu = true;
  }
  if (bucket && !gehoert(bucket, "schluessel")) throw new Error(`bucket: „${BUCKET}“ gibt es schon, aber nicht von der Einrichtung; nichts geändert`);
  if (bucket && bucket["public-access-type"] !== "NoPublicAccess") throw new Error(`bucket: „${BUCKET}“ ist öffentlich lesbar; nichts übertragen`);
  return { ns, bucket, neu };
}
const objektDa = async (oci, ns, name) => {
  const r = await oci(["os", "object", "head", "--namespace-name", ns, "--bucket-name", BUCKET, "--name", name]);
  if (!r.ok && !NICHT_DA.test(r.fehler || "")) throw Object.assign(new Error("schluessel: " + r.fehler), { schritt: "schluessel" });
  return r.ok;
};
const holen = (muss, ns, name, datei) => muss("schluessel", ["os", "object", "get", "--namespace-name", ns, "--bucket-name", BUCKET, "--name", name, "--file", datei]);

export async function schluesselSichern(oci, { tenancy, ordner = join(homedir(), ".ssh") }) {
  const { schritte, merken, muss } = ablauf(oci);
  if (!OBJEKTE.every((n) => existsSync(join(ordner, n)))) { merken("schluessel", "fehlt", "~/.ssh/studium_autopilot fehlt; nichts zu sichern."); return { schritte, exit: 1 }; }
  const { ns, neu } = await bucketFinden(oci, muss, tenancy, true);
  if (neu) merken("bucket", "angelegt", `Privater Bucket „${BUCKET}“ für die Kopie des Schlüssels angelegt.`);
  let abweichend = false;
  for (const name of OBJEKTE) {
    if (!(await objektDa(oci, ns, name))) {
      await muss("schluessel", ["os", "object", "put", "--namespace-name", ns, "--bucket-name", BUCKET, "--name", name, "--file", join(ordner, name), "--no-overwrite"]);
      continue;
    }
    const tmp = join(ordner, `.${name}.vergleich`);
    try {
      await holen(muss, ns, name, tmp);
      abweichend ||= !readFileSync(tmp).equals(readFileSync(join(ordner, name)));
    } finally {
      rmSync(tmp, { force: true });
    }
  }
  if (abweichend) {
    merken("schluessel", "abweichend", `Im Bucket „${BUCKET}“ liegt ein anderer Schlüssel als in der Cloud Shell; keiner wurde überschrieben.`);
    return { schritte, exit: 2 };
  }
  merken("schluessel", "gesichert", `Schlüssel im privaten Bucket „${BUCKET}“ gesichert.`);
  return { schritte, exit: 0 };
}

export async function schluesselHolen(oci, { tenancy, ordner = join(homedir(), ".ssh") }) {
  const { schritte, merken, muss } = ablauf(oci);
  if (OBJEKTE.some((n) => existsSync(join(ordner, n)))) { merken("schluessel", "da", "~/.ssh/studium_autopilot ist in der Cloud Shell."); return { schritte, exit: 0 }; }
  const { ns, bucket } = await bucketFinden(oci, muss, tenancy, false);
  const da = bucket ? await Promise.all(OBJEKTE.map((n) => objektDa(oci, ns, n))) : [];
  // Keine Kopie ist kein Fehler (neues Konto): Exit 0, die Einrichtung legt dann einen Schlüssel an
  if (!bucket || !da.every(Boolean)) { merken("schluessel", "keine-kopie", "Es gibt keine Kopie des Schlüssels im Konto."); return { schritte, exit: 0 }; }
  mkdirSync(ordner, { recursive: true, mode: 0o700 });
  for (const name of OBJEKTE) {
    const tmp = join(ordner, `.${name}.neu`);
    await holen(muss, ns, name, tmp);
    chmodSync(tmp, name.endsWith(".pub") ? 0o644 : 0o600);
    renameSync(tmp, join(ordner, name));
  }
  merken("schluessel", "geholt", "Schlüssel aus dem privaten Bucket nach ~/.ssh/studium_autopilot zurückgeholt.");
  return { schritte, exit: 0 };
}

// ---------- Aufruf ----------
// Version und SHA-256 des Pakets für die Startdaten des Servers (serverStart); ohne Datei keine
function paketVon(datei, version) {
  try { return { version: version.trim(), summe: createHash("sha256").update(readFileSync(datei)).digest("hex") }; } catch (e) { return null; }
}
const SCHRITTE = { schutz, netz, server, platzsucher, abschliessen, adresse, "platzsucher-beenden": platzsucherBeenden,
  "schluessel-sichern": schluesselSichern, "schluessel-holen": schluesselHolen };

async function main(argv) {
  const [befehl] = argv;
  const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  if (!SCHRITTE[befehl]) {
    console.error("Aufruf: node einrichten.mjs schutz|netz|server|platzsucher|abschliessen|adresse|platzsucher-beenden|schluessel-sichern|schluessel-holen" +
      " [--mail …] [--schluessel …] [--paket …] [--ja] [--json]");
    return 2;
  }
  const tenancy = tenancyFinden(wert("--tenancy"));
  if (!tenancy) { console.error("Kein Konto gefunden: in der Oracle Cloud Shell starten oder --tenancy <ocid> angeben."); return 2; }
  const oci = ociAufrufer(wert("--oci") || "oci");
  const lesen = (p) => { try { return readFileSync(p, "utf8"); } catch (e) { return ""; } };
  let ergebnis;
  try {
    const bestand = ["schutz", "server", "platzsucher", "abschliessen"].includes(befehl) ? await erheben(oci, { tenancy }) : null;
    if (bestand && bestand.fehler.length) throw new Error("Stand unvollständig: " + bestand.fehler.join("; "));
    const a = bestand ? auswerten(bestand, { helfer: befehl === "platzsucher" }) : null;
    const ads = bestand ? bestand.ads : [];
    const hier = dirname(fileURLToPath(import.meta.url));
    const ssh = join(homedir(), ".ssh");
    const alleSchluessel = () => {
      try {
        return Object.fromEntries(readdirSync(ssh).filter((n) => n.endsWith(".pub")).map((n) => ["~/.ssh/" + n, lesen(join(ssh, n))]));
      } catch (e) { return {}; }
    };
    ergebnis = await SCHRITTE[befehl](oci, {
      tenancy, a, ads, mail: wert("--mail"), ja: argv.includes("--ja"),
      schluessel: befehl === "adresse" ? alleSchluessel() : wert("--schluessel") ? lesen(wert("--schluessel")) : "",
      vorlage: lesen(wert("--vorlage") || join(hier, "platzsucher-helfer.yaml")),
      skript: befehl === "platzsucher" ? lesen(join(hier, "platzsucher.py")) : "",
      paket: ["server", "platzsucher"].includes(befehl) ? paketVon(wert("--paket") || join(hier, "..", "studium-server.tar.gz"), lesen(join(hier, "VERSION"))) : null,
    });
  } catch (e) {
    ergebnis = { schritte: [{ was: e.schritt || befehl, status: "fehler", text: e.message }], exit: e.exit || 1 };
  }
  if (argv.includes("--json")) console.log(JSON.stringify(ergebnis, null, 2));
  else for (const s of ergebnis.schritte) console.log(`[${s.status}] ${s.text}`);
  return ergebnis.exit;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
