#!/usr/bin/env python3
"""Platzsucher für den eigenen Server von Studium Autopilot (server/README.md, „Platzsucher“).

Oracle meldet beim Anlegen des kostenlosen Servers (VM.Standard.A1.Flex, 2 OCPU, 12 GB) oft „Out of host capacity“. Dieses
Skript läuft auf einem kleinen Helfer (VM.Standard.E2.1.Micro, ebenfalls Always Free) und versucht es immer wieder, bis Oracle
Platz hat. Es meldet sich mit der Identität der Instanz an (--auth instance_principal; die Rechte bekommt nur dieser Helfer über
eine dynamische Gruppe), schickt bei Erfolg eine Mail über Oracle Notifications und beendet danach den Helfer selbst. Den Helfer
erkennt es an seinem Kennzeichen studium-autopilot=helfer (setzt die Einrichtung beim Anlegen, wie stand.mjs).
Nur Standardbibliothek und die OCI-Kommandozeile.

  python3 platzsucher.py            sucht, bis der Server da ist oder ein Mensch gebraucht wird
  python3 platzsucher.py --einmal   eine Runde (alle Verfügbarkeitsbereiche), Ergebnis als JSON

Konfiguration $PLATZSUCHER_KONFIG (Standard /etc/studium-platzsucher/konfig.json, schreibt die Einrichtung):
  { "compartment": OCID, "ads": [Namen der Verfügbarkeitsbereiche], "subnet": OCID, "image": OCID (Ubuntu 24.04, aarch64),
    "boot_gb": 150, "ssh_schluessel": "ssh-ed25519 …", "user_data": base64 (cloud-init des Servers), "thema": OCID }
Stand $PLATZSUCHER_STAND (Standard /var/lib/studium-platzsucher/stand.json):
  { seit, versuche, tag, versuche_heute, letzter_fehler, erfolg, instanz, gemeldet_14 }

Kostenregeln: genau diese Form und Größe, nichts Kleineres; Boot-Volume „Balanced“ (10 VPU) mit boot_gb (der Rest des freien
Blockspeichers, solange der Helfer lebt); Kennzeichen studium-autopilot=server. Vor jedem Versuch wird geprüft, ob es den
Server schon gibt, damit nichts doppelt entsteht. Höchstens VERSUCHE_TAG Versuche am Tag.
Antworten von Oracle: „Out of host capacity“ → nächster Verfügbarkeitsbereich, dann warten; „Too many requests“ → länger
warten; eine unklare Antwort (Zeitüberschreitung, 5xx, unlesbare Ausgabe: der Server könnte trotzdem entstanden sein) → Runde
beenden, die nächste prüft zuerst, ob es den Server schon gibt (nie ein zweiter); Grenze oder Quota überschritten, fehlende Rechte, falsche Konfiguration → anhalten und Mail (das braucht einen Menschen).
Fehlende Rechte erst nach ANLAUF_MIN Minuten: Die Einrichtung legt dynamische Gruppe und Richtlinie an, nachdem der Helfer
gestartet ist, und Oracle verteilt neue Rechte mit Verzögerung.
Nach 14 Tagen ohne Erfolg eine Mail mit dem Stand; gesucht wird weiter, bis jemand den Helfer beendet.
"""
import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

KONFIG = Path(os.environ.get("PLATZSUCHER_KONFIG", "/etc/studium-platzsucher/konfig.json"))
STAND = Path(os.environ.get("PLATZSUCHER_STAND", "/var/lib/studium-platzsucher/stand.json"))
FORM = "VM.Standard.A1.Flex"
OCPUS, SPEICHER_GB = 2, 12
VPU = 10                         # „Balanced“, im Always Free enthalten
KENNZEICHEN = {"studium-autopilot": "server"}
NAME = "studium-autopilot-server"
VERSUCHE_TAG = 1500
PAUSE = (120, 300)               # Sekunden zwischen zwei Runden (zufällig)
PAUSE_GEDROSSELT = 1800          # höchstens so lange nach „Too many requests“
MELDUNG_NACH_TAGEN = 14
ANLAUF_MIN = 30                  # so lange gelten fehlende Rechte als „noch nicht verteilt“
RECHTE = ("NotAuthorizedOrNotFound", "NotAuthenticated", "NotAuthorized")
OCID = re.compile(r"^ocid1\.[a-z0-9]+\.[a-z0-9-]*\.[a-z0-9-]*\.[a-z0-9]+$")


def jetzt_iso(jetzt=None):
    return (jetzt or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(timespec="seconds")


# ---------- OCI-Kommandozeile ----------
def oci_aufrufer(pfad="oci", auth="instance_principal"):
    """Startet `oci … --output json` (pfad: Programm oder Liste, z. B. für Tests); → {"ok": True, "data": …} oder
    {"ok": False, "status", "code", "nachricht"}. Wirft nie."""
    vorn = list(pfad) if isinstance(pfad, (list, tuple)) else [pfad]

    def oci(args):
        befehl = [*vorn, *args, "--output", "json"] + (["--auth", auth] if auth else [])
        try:
            r = subprocess.run(befehl, capture_output=True, text=True, timeout=180, check=False)
        except (OSError, subprocess.TimeoutExpired) as e:
            return {"ok": False, "status": 0, "code": "Aufruf", "nachricht": str(e)[:300]}
        if r.returncode == 0:
            try:
                return {"ok": True, "data": json.loads(r.stdout) if r.stdout.strip() else None}
            except ValueError:
                return {"ok": False, "status": 0, "code": "Ausgabe", "nachricht": "Ausgabe ist kein JSON"}
        return fehler_lesen(r.stderr)
    return oci


def fehler_lesen(text):
    """Fehlertext der OCI-Kommandozeile („ServiceError:“ + JSON) → {"ok": False, "status", "code", "nachricht"}."""
    i = text.find("{")
    if "ServiceError" in text and i >= 0:
        try:
            d = json.loads(text[i:text.rfind("}") + 1])
            return {"ok": False, "status": int(d.get("status") or 0), "code": str(d.get("code") or ""), "nachricht": str(d.get("message") or "")[:300]}
        except ValueError:
            pass
    return {"ok": False, "status": 0, "code": "Unbekannt", "nachricht": text.strip()[-300:]}


def einordnen(r):
    """Fehler eines Anlegeversuchs → kapazitaet | drossel | rechte | unklar | halt."""
    code, nachricht = r.get("code", ""), r.get("nachricht", "").lower()
    if "out of host capacity" in nachricht or "out of capacity" in nachricht:
        return "kapazitaet"
    if r.get("status") == 429 or code == "TooManyRequests":
        return "drossel"
    if code in RECHTE or r.get("status") == 401:
        return "rechte"
    if r.get("status", 0) >= 500 or code in ("Aufruf", "Ausgabe", "Unbekannt"):
        return "unklar"  # Netz, Zeitüberschreitung, Oracle selbst: vielleicht trotzdem angelegt
    return "halt"  # Grenze, Quota, Konfiguration: braucht einen Menschen


# ---------- Konfiguration und Stand ----------
def konfig_pruefen(k):
    """→ Liste der Fehler (leer = in Ordnung)."""
    fehler = []
    if not isinstance(k, dict):
        return ["Konfiguration ist kein Objekt"]
    for feld in ("compartment", "subnet", "image", "thema"):
        if not (isinstance(k.get(feld), str) and OCID.match(k[feld])):
            fehler.append(f"{feld} ist keine OCID")
    ads = k.get("ads")
    if not (isinstance(ads, list) and 1 <= len(ads) <= 3 and all(isinstance(a, str) and re.match(r"^[A-Za-z0-9:_-]{3,60}$", a) for a in ads)):
        fehler.append("ads: 1 bis 3 Namen")
    if not (isinstance(k.get("boot_gb"), int) and 50 <= k["boot_gb"] <= 200):
        fehler.append("boot_gb: 50 bis 200")
    if not (isinstance(k.get("ssh_schluessel"), str) and re.match(r"^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) [A-Za-z0-9+/=]+( .{0,80})?$", k["ssh_schluessel"])):
        fehler.append("ssh_schluessel fehlt")
    if not isinstance(k.get("user_data", ""), str) or not re.match(r"^[A-Za-z0-9+/=]*$", k.get("user_data", "")):
        fehler.append("user_data ist kein base64")
    return fehler


def lesen(datei, ersatz):
    try:
        return json.loads(Path(datei).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ersatz


def schreiben(datei, wert):
    Path(datei).parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(datei) + ".neu")
    tmp.write_text(json.dumps(wert, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(datei)


# ---------- Schritte ----------
def gekennzeichnet(oci, k, wert):
    """Instanzen im Compartment mit Kennzeichen studium-autopilot=wert, die nicht beendet sind. → Liste oder {"fehler": …}."""
    r = oci(["compute", "instance", "list", "--compartment-id", k["compartment"], "--all"])
    if not r["ok"]:
        return {"fehler": r}
    alle = r["data"].get("data", []) if isinstance(r["data"], dict) else []
    return [i for i in alle if (i.get("freeform-tags") or {}).get("studium-autopilot") == wert and i.get("lifecycle-state") not in ("TERMINATING", "TERMINATED")]


def server_vorhanden(oci, k):
    """Gibt es den Server (Kennzeichen) schon? → Instanz oder None. Bei Fehler der Abfrage: {"fehler": …}."""
    r = gekennzeichnet(oci, k, "server")
    return r if isinstance(r, dict) else (r[0] if r else None)


def anlegen(oci, k, ad):
    metadaten = {"ssh_authorized_keys": k["ssh_schluessel"]}
    if k.get("user_data"):
        metadaten["user_data"] = k["user_data"]
    return oci([
        "compute", "instance", "launch",
        "--availability-domain", ad, "--compartment-id", k["compartment"],
        "--shape", FORM, "--shape-config", json.dumps({"ocpus": OCPUS, "memoryInGBs": SPEICHER_GB}),
        "--source-details", json.dumps({"sourceType": "image", "imageId": k["image"], "bootVolumeSizeInGBs": k["boot_gb"], "bootVolumeVpusPerGB": VPU}),
        "--subnet-id", k["subnet"], "--assign-public-ip", "true",
        "--display-name", NAME, "--freeform-tags", json.dumps(KENNZEICHEN), "--metadata", json.dumps(metadaten),
    ])


def melden(oci, k, titel, text):
    r = oci(["ons", "message", "publish", "--topic-id", k["thema"], "--title", titel, "--body", text])
    return r["ok"]


def runde(oci, k, stand, jetzt=None, anlauf=False):
    """Eine Runde über alle Verfügbarkeitsbereiche. → ("erfolg", instanz) | ("weiter", grund) | ("drossel", grund) | ("halt", grund).
    anlauf: fehlende Rechte noch nicht als Halt werten (ANLAUF_MIN)."""
    def halt_oder_weiter(art):
        return "halt" if art == "halt" or (art == "rechte" and not anlauf) else "weiter"

    jetzt = jetzt or datetime.now(timezone.utc)
    tag = jetzt.astimezone(timezone.utc).date().isoformat()
    if stand.get("tag") != tag:
        stand["tag"], stand["versuche_heute"] = tag, 0
    vorhanden = server_vorhanden(oci, k)
    if isinstance(vorhanden, dict) and "fehler" in vorhanden:
        art = einordnen(vorhanden["fehler"])
        stand["letzter_fehler"] = vorhanden["fehler"].get("code", "")
        return (halt_oder_weiter(art), "Abfrage: " + vorhanden["fehler"].get("nachricht", ""))
    if vorhanden:
        return ("erfolg", vorhanden)
    ads = list(k["ads"])
    random.shuffle(ads)
    for ad in ads:
        if stand.get("versuche_heute", 0) >= VERSUCHE_TAG:
            return ("weiter", "Tagesgrenze erreicht")
        stand["versuche"] = stand.get("versuche", 0) + 1
        stand["versuche_heute"] = stand.get("versuche_heute", 0) + 1
        r = anlegen(oci, k, ad)
        if r["ok"]:
            return ("erfolg", (r["data"] or {}).get("data", {}))
        art = einordnen(r)
        stand["letzter_fehler"] = r.get("code", "")
        if art == "drossel":
            return ("drossel", r.get("nachricht", ""))
        if art == "unklar":
            return ("weiter", "unklar: " + r.get("nachricht", ""))
        if art in ("halt", "rechte"):
            return (halt_oder_weiter(art), f'{r.get("code", "")}: {r.get("nachricht", "")}')
    return ("weiter", "kein Platz")


def nach_erfolg(oci, k, stand, instanz):
    stand.update(erfolg=jetzt_iso(), instanz=str(instanz.get("id", "")))
    melden(oci, k, "Dein Server ist da",
           "Oracle hat deinen kostenlosen Server für Studium Autopilot angelegt. "
           "Öffne Claude und sag „Weiter mit der Einrichtung“, dann richtet Claude ihn ein.")
    # Helfer samt Boot-Volume beenden (nur Instanzen mit dem Kennzeichen des Platzsuchers)
    helfer = gekennzeichnet(oci, k, "helfer")
    for h in helfer if isinstance(helfer, list) else []:
        oci(["compute", "instance", "terminate", "--instance-id", h["id"], "--preserve-boot-volume", "false", "--force"])


def suchen(oci, k, stand_datei=STAND, schlafen=time.sleep, jetzt=lambda: datetime.now(timezone.utc)):
    """Sucht, bis der Server da ist (→ "erfolg") oder ein Mensch gebraucht wird (→ "halt")."""
    stand = lesen(stand_datei, {})
    stand.setdefault("seit", jetzt_iso(jetzt()))
    warte_drossel = PAUSE[1]
    while True:
        zeit = jetzt()
        anlauf = zeit - datetime.fromisoformat(stand["seit"]) < timedelta(minutes=ANLAUF_MIN)
        art, wert = runde(oci, k, stand, zeit, anlauf)
        if art == "erfolg":
            nach_erfolg(oci, k, stand, wert)
            schreiben(stand_datei, stand)
            return "erfolg"
        if art == "halt":
            stand["angehalten"] = wert[:300]
            schreiben(stand_datei, stand)
            melden(oci, k, "Platzsucher angehalten",
                   "Der Platzsucher für deinen Server von Studium Autopilot hat angehalten, weil Oracle ablehnt: " + wert[:300]
                   + " Öffne Claude und sag „Weiter mit der Einrichtung“.")
            return "halt"
        if not stand.get("gemeldet_14") and (zeit - datetime.fromisoformat(stand["seit"])).days >= MELDUNG_NACH_TAGEN:
            if melden(oci, k, "Platzsucher sucht weiter",
                      f'Seit {MELDUNG_NACH_TAGEN} Tagen hat Oracle in deiner Region keinen Platz frei ({stand.get("versuche", 0)} Versuche). '
                      "Der Platzsucher sucht weiter. Willst du aufhören, sag Claude „Platzsucher beenden“."):
                stand["gemeldet_14"] = True
        schreiben(stand_datei, stand)
        if art == "drossel":
            warte_drossel = min(warte_drossel * 2, PAUSE_GEDROSSELT)
            schlafen(warte_drossel)
        else:
            warte_drossel = PAUSE[1]
            schlafen(random.randint(*PAUSE))


def main():
    p = argparse.ArgumentParser(description="Platzsucher für den eigenen Server von Studium Autopilot")
    p.add_argument("--einmal", action="store_true", help="eine Runde, Ergebnis als JSON")
    p.add_argument("--oci", default="oci", help="Pfad der OCI-Kommandozeile")
    a = p.parse_args()
    k = lesen(KONFIG, None)
    fehler = konfig_pruefen(k)
    if fehler:
        print("Konfiguration ungültig: " + "; ".join(fehler), file=sys.stderr)
        return 2
    oci = oci_aufrufer(a.oci)
    if a.einmal:
        stand = lesen(STAND, {})
        art, wert = runde(oci, k, stand)
        schreiben(STAND, stand)
        print(json.dumps({"ergebnis": art, "wert": wert if isinstance(wert, str) else wert.get("id", "")}, ensure_ascii=False))
        return 0
    return 0 if suchen(oci, k) in ("erfolg", "halt") else 1


if __name__ == "__main__":
    sys.exit(main())
