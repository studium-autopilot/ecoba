#!/usr/bin/env python3
"""Platzsucher für den eigenen Server von Studium Autopilot (server/README.md, „Platzsucher“).

Oracle meldet beim Anlegen des kostenlosen Servers (VM.Standard.A1.Flex, 2 OCPU, 12 GB) oft „Out of host capacity“. Dieses
Skript läuft auf einem kleinen Helfer (VM.Standard.E2.1.Micro, ebenfalls Always Free) und versucht es immer wieder, bis Oracle
Platz hat. Es meldet sich mit der Identität der Instanz an (--auth instance_principal; die Rechte bekommt nur dieser Helfer über
eine dynamische Gruppe), schickt bei Erfolg eine Mail über Oracle Notifications und beendet danach den Helfer selbst. Den Helfer
erkennt es an seinem Kennzeichen studium-autopilot=helfer (setzt die Einrichtung beim Anlegen, wie stand.mjs).
Nur Standardbibliothek und die OCI-Kommandozeile.

Klein zuerst: Ist für 2 OCPU / 12 GB kein Platz, versucht er in derselben Runde 1 OCPU / 6 GB; das passt öfter auf einen fast
vollen Host. Ist der Server klein da, kommt die Mail „Dein Server ist da“ sofort, und der Helfer bleibt: Er vergrößert den
Server nachts (FENSTER, Uhrzeit UTC) auf 2 OCPU / 12 GB, sobald Oracle Platz hat. Oracle startet ihn dabei neu (wie bei den
nächtlichen Updates); Adresse und Daten bleiben. Danach beendet er sich wie sonst.

  python3 platzsucher.py            sucht, bis der Server da ist oder ein Mensch gebraucht wird
  python3 platzsucher.py --einmal   eine Runde (alle Verfügbarkeitsbereiche), Ergebnis als JSON

Konfiguration $PLATZSUCHER_KONFIG (Standard /etc/studium-platzsucher/konfig.json, schreibt die Einrichtung):
  { "compartment": OCID, "ads": [Namen der Verfügbarkeitsbereiche], "subnet": OCID,
    "image": OCID (Ubuntu 24.04, aarch64; nur Ersatz, jede Runde sucht das neueste), "boot_gb": 150, "ssh_schluessel": "ssh-rsa …", "user_data": base64 (cloud-init des Servers), "thema": OCID }
Stand $PLATZSUCHER_STAND (Standard /var/lib/studium-platzsucher/stand.json):
  { seit, versuche, tag, versuche_heute, letzter_fehler, abbild, abbild_tag, klein, klein_seit, angestossen, aus_gemeldet, erfolg, instanz,
    gemeldet_14 }

Kostenregeln: genau diese Form, nur die Größen aus GROESSEN (nie mehr als die freie Menge 2 OCPU / 12 GB); Boot-Volume
„Balanced“ (10 VPU) mit boot_gb (der Rest des freien Blockspeichers, solange der Helfer lebt); Kennzeichen
studium-autopilot=server. Vor jedem Versuch wird geprüft, ob es den Server schon gibt, damit nichts doppelt entsteht. Höchstens
VERSUCHE_TAG Versuche am Tag.
Anlegen und Vergrößern laufen mit --no-retry: Ohne wiederholt die Kommandozeile jede 5xx-Antwort, also auch „Out of host
capacity“, und 429 selbst (bis zu 8 Anfragen in etwa 90 Sekunden); dann zählte ein Versuch acht, und „Too many requests“ käme
hier nie an. Das Wiederholen ist Sache dieser Schleife.
Antworten von Oracle: „Out of host capacity“ → kleinere Größe bzw. nächster Verfügbarkeitsbereich, dann warten; „Too many requests“ → länger
warten; eine unklare Antwort (Zeitüberschreitung, 5xx, unlesbare Ausgabe: der Server könnte trotzdem entstanden sein) → Runde
beenden, die nächste prüft zuerst, ob es den Server schon gibt (nie ein zweiter); Grenze oder Quota überschritten, fehlende Rechte, falsche Konfiguration → anhalten und Mail (das braucht einen Menschen).
Fehlende Rechte erst nach ANLAUF_MIN Minuten: Die Einrichtung legt dynamische Gruppe und Richtlinie an, nachdem der Helfer
gestartet ist, und Oracle verteilt neue Rechte mit Verzögerung.
Nach 14 Tagen ohne Erfolg eine Mail mit dem Stand; gesucht wird weiter, bis jemand den Helfer beendet.
Den Stand schreibt er als Kennzeichen STAND_KENNZEICHEN an sich selbst (stündlich und bei einem Halt sofort; seine OCID aus
den Metadaten der Instanz), stand.mjs zeigt ihn. Bleibt das Kennzeichen aus, sucht er nicht (Installation oder Rechte).
"""
import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KONFIG = Path(os.environ.get("PLATZSUCHER_KONFIG", "/etc/studium-platzsucher/konfig.json"))
STAND = Path(os.environ.get("PLATZSUCHER_STAND", "/var/lib/studium-platzsucher/stand.json"))
FORM = "VM.Standard.A1.Flex"
GROESSEN = ((2, 12), (1, 6))     # (OCPU, GB): erst die ganze freie Menge, ohne Platz die Hälfte
VOLL = GROESSEN[0]
VPU = 10                         # „Balanced“, im Always Free enthalten
KENNZEICHEN = {"studium-autopilot": "server"}
NAME = "studium-autopilot-server"
VERSUCHE_TAG = 6000              # Runden mit 6 Anfragen (3 Bereiche) alle 1 bis 2 Minuten: bis gut 5.700 am Tag
PAUSE = (60, 120)                # Sekunden zwischen zwei Runden (zufällig)
FENSTER = (1, 5)                 # Stunden (UTC), in denen er einen kleinen Server vergrößert; Oracle startet ihn dabei neu
NEU_GENUG = timedelta(hours=3)   # so lange nach dem Anlegen nicht vergrößern (der Server bereitet sich selbst vor)
ANSTOSS = timedelta(hours=1)     # so lange startet er einen Server wieder, der nach dem Vergrößern aus blieb
WARTEN_HOECHSTENS = 3000         # Sekunden: auch vor der Nacht meldet er sich (STAND_ALLE, stand.mjs „still“ nach 3 Stunden)
PAUSE_GEDROSSELT = 1800          # höchstens so lange nach „Too many requests“
MELDUNG_NACH_TAGEN = 14
ANLAUF_MIN = 30                  # so lange gelten fehlende Rechte als „noch nicht verteilt“
STAND_KENNZEICHEN = "studium-autopilot-stand"   # Stand am eigenen Helfer (stand.mjs liest ihn)
STAND_ALLE = timedelta(hours=1)
# Metadaten der Instanz, nur IMDSv2 (die alten Endpunkte sind beim Helfer aus). Als Zahlen geschrieben, weil
# werkzeuge/pruefen.py jede IP-Adresse meldet (wie die Netzbereiche in einrichten.mjs).
IMDS = "http://{}.{}.{}.{}/opc/v2/instance/id".format(169, 254, 169, 254)
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


def neuestes_abbild(oci, k):
    """Neuestes Ubuntu 24.04 für FORM (wie bild in einrichten.mjs): Oracle zieht ältere Abbilder nach einigen Monaten zurück, und
    der Platzsucher sucht oft wochenlang. Bei Fehler oder ohne Treffer das aus der Konfiguration. → OCID"""
    r = oci(["compute", "image", "list", "--compartment-id", k["compartment"], "--operating-system", "Canonical Ubuntu",
             "--operating-system-version", "24.04", "--shape", FORM, "--sort-by", "TIMECREATED", "--sort-order", "DESC", "--limit", "1"])
    d = r["data"].get("data") if r["ok"] and isinstance(r["data"], dict) else None
    neu = d[0].get("id") if isinstance(d, list) and d and isinstance(d[0], dict) else None
    return neu if isinstance(neu, str) and OCID.match(neu) else k["image"]


def anlegen(oci, k, ad, abbild=None, groesse=VOLL):
    metadaten = {"ssh_authorized_keys": k["ssh_schluessel"]}
    if k.get("user_data"):
        metadaten["user_data"] = k["user_data"]
    return oci([
        "compute", "instance", "launch",
        "--availability-domain", ad, "--compartment-id", k["compartment"],
        "--shape", FORM, "--shape-config", json.dumps({"ocpus": groesse[0], "memoryInGBs": groesse[1]}),
        "--source-details", json.dumps({"sourceType": "image", "imageId": abbild or k["image"], "bootVolumeSizeInGBs": k["boot_gb"], "bootVolumeVpusPerGB": VPU}),
        "--subnet-id", k["subnet"], "--assign-public-ip", "true",
        "--display-name", NAME, "--freeform-tags", json.dumps(KENNZEICHEN), "--metadata", json.dumps(metadaten),
        "--instance-options", json.dumps({"areLegacyImdsEndpointsDisabled": True}), "--no-retry",
    ])


def klein(instanz):
    """Hat der Server weniger als VOLL (OCPU aus shape-config)? Ohne Angabe: nein."""
    try:
        return float((instanz.get("shape-config") or {}).get("ocpus")) < VOLL[0]
    except (TypeError, ValueError):
        return False


def im_fenster(zeit):
    return FENSTER[0] <= zeit.astimezone(timezone.utc).hour < FENSTER[1]


def bis_zum_fenster(zeit):
    """Sekunden bis zum nächsten FENSTER, höchstens WARTEN_HOECHSTENS, mindestens PAUSE[0]."""
    z = zeit.astimezone(timezone.utc)
    beginn = z.replace(hour=FENSTER[0], minute=0, second=0, microsecond=0)
    if beginn <= z:
        beginn += timedelta(days=1)
    return int(max(PAUSE[0], min(WARTEN_HOECHSTENS, (beginn - z).total_seconds())))


def eigene_id(url=IMDS):
    """OCID dieses Helfers aus den Metadaten der Instanz. → OCID oder None"""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer Oracle"}), timeout=10) as r:
            text = r.read(300).decode("ascii", "replace").strip()
    except OSError:
        return None
    return text if OCID.match(text) else None


def stand_text(stand, art, grund, jetzt):
    """Wert des Kennzeichens: „zeit=…;versuche=…;art=…;grund=…“, höchstens 256 Zeichen (Grenze von Oracle)."""
    kopf = f"zeit={jetzt_iso(jetzt)};versuche={stand.get('versuche', 0)};art={art};grund="
    return kopf + re.sub(r"[;=\s]+", " ", str(grund)).strip()[:256 - len(kopf)]


def stand_zeigen(oci, instanz, wert):
    """Schreibt wert als STAND_KENNZEICHEN an den eigenen Helfer. Oracle ersetzt immer alle Kennzeichen; die anderen (Helfer,
    Fassung) kommen darum unverändert mit. Nur an eine Instanz mit dem Kennzeichen des Helfers. → True, wenn geschrieben"""
    r = oci(["compute", "instance", "get", "--instance-id", instanz])
    d = r["data"].get("data") if r["ok"] and isinstance(r["data"], dict) else None
    tags = dict(d.get("freeform-tags") or {}) if isinstance(d, dict) else {}
    if tags.get("studium-autopilot") != "helfer":
        return False
    tags[STAND_KENNZEICHEN] = wert
    return oci(["compute", "instance", "update", "--instance-id", instanz, "--freeform-tags", json.dumps(tags), "--force"])["ok"]


def melden(oci, k, titel, text):
    r = oci(["ons", "message", "publish", "--topic-id", k["thema"], "--title", titel, "--body", text])
    return r["ok"]


def neuer_tag(stand, jetzt):
    tag = jetzt.astimezone(timezone.utc).date().isoformat()
    if stand.get("tag") != tag:
        stand["tag"], stand["versuche_heute"] = tag, 0
    return tag


def versuch_zaehlen(stand):
    """→ False, wenn die Tagesgrenze erreicht ist; sonst zählt er den Versuch."""
    if stand.get("versuche_heute", 0) >= VERSUCHE_TAG:
        return False
    stand["versuche"] = stand.get("versuche", 0) + 1
    stand["versuche_heute"] = stand.get("versuche_heute", 0) + 1
    return True


def runde(oci, k, stand, jetzt=None, anlauf=False):
    """Eine Runde: erst VOLL in allen Verfügbarkeitsbereichen, dann die kleinere Größe.
    → ("erfolg", instanz) | ("weiter", grund) | ("drossel", grund) | ("halt", grund).
    anlauf: fehlende Rechte noch nicht als Halt werten (ANLAUF_MIN)."""
    def halt_oder_weiter(art):
        return "halt" if art == "halt" or (art == "rechte" and not anlauf) else "weiter"

    jetzt = jetzt or datetime.now(timezone.utc)
    tag = neuer_tag(stand, jetzt)
    vorhanden = server_vorhanden(oci, k)
    if isinstance(vorhanden, dict) and "fehler" in vorhanden:
        art = einordnen(vorhanden["fehler"])
        stand["letzter_fehler"] = vorhanden["fehler"].get("code", "")
        return (halt_oder_weiter(art), "Abfrage: " + vorhanden["fehler"].get("nachricht", ""))
    if vorhanden:
        return ("erfolg", vorhanden)
    ads = list(k["ads"])
    random.shuffle(ads)
    # Das neueste Abbild einmal am Tag: Jede Abfrage startet die Kommandozeile, auf dem Micro dauert das
    if stand.get("abbild_tag") != tag and stand.get("versuche_heute", 0) < VERSUCHE_TAG:
        stand["abbild"], stand["abbild_tag"] = neuestes_abbild(oci, k), tag
    abbild = stand.get("abbild") or k["image"]
    for groesse in GROESSEN:
        for ad in ads:
            if not versuch_zaehlen(stand):
                return ("weiter", "Tagesgrenze erreicht")
            r = anlegen(oci, k, ad, abbild, groesse)
            if r["ok"]:
                instanz = (r["data"] or {}).get("data") or {}
                instanz.setdefault("shape-config", {"ocpus": groesse[0], "memory-in-gbs": groesse[1]})
                return ("erfolg", instanz)
            art = einordnen(r)
            stand["letzter_fehler"] = r.get("code", "")
            if art == "drossel":
                return ("drossel", r.get("nachricht", ""))
            if art == "unklar":
                return ("weiter", "unklar: " + r.get("nachricht", ""))
            if art in ("halt", "rechte"):
                return (halt_oder_weiter(art), f'{r.get("code", "")}: {r.get("nachricht", "")}')
    return ("weiter", "kein Platz")


def vergroessern(oci, k, stand, jetzt=None, anlauf=False):
    """Der Server ist da, aber klein (stand["klein"]): nachts auf VOLL vergrößern.
    → ("erfolg", instanz) wenn groß | ("klein", grund) | ("drossel", grund) | ("halt", grund)."""
    jetzt = jetzt or datetime.now(timezone.utc)
    neuer_tag(stand, jetzt)
    r = oci(["compute", "instance", "get", "--instance-id", stand["klein"]])
    if not r["ok"]:
        art = einordnen(r)
        stand["letzter_fehler"] = r.get("code", "")
        if art == "halt" or (art == "rechte" and not anlauf):
            return ("halt", f'Server: {r.get("code", "")}: {r.get("nachricht", "")}')
        return ("drossel" if art == "drossel" else "klein", r.get("nachricht", ""))
    d = (r["data"] or {}).get("data") or {}
    zustand = d.get("lifecycle-state", "")
    if zustand in ("TERMINATING", "TERMINATED"):
        # Neu gestartet sucht der Helfer dann wieder (wie vor dem Server), statt jedes Mal hier anzuhalten
        for feld in ("klein", "klein_seit", "angestossen", "aus_gemeldet"):
            stand.pop(feld, None)
        return ("halt", "Der Server wurde beendet.")
    angestossen = stand.get("angestossen")
    seit_anstoss = jetzt - datetime.fromisoformat(angestossen) if angestossen else None
    if zustand == "STOPPED" and angestossen:
        # Nach einem Vergrößern (auch einem mit unklarer Antwort) nie aus lassen: Ein A1 kann auch beim Starten „Out of host
        # capacity“ bekommen. angestossen bleibt, bis er wieder läuft.
        if oci(["compute", "instance", "action", "--instance-id", stand["klein"], "--action", "START"])["ok"]:
            return ("klein", "Server nach dem Vergrößern wieder gestartet")
        if seit_anstoss >= ANSTOSS and not stand.get("aus_gemeldet"):
            stand["aus_gemeldet"] = melden(oci, k, "Dein Server ist aus",
                                           "Der Platzsucher hat deinen Server von Studium Autopilot nachts vergrößert, aber Oracle hat ihn "
                                           "danach nicht wieder gestartet. Der Platzsucher versucht es weiter. Du kannst ihn auch selbst "
                                           "starten: Oracle-Konsole, Compute, Instanzen, „studium-autopilot-server“, Start.")
        return ("klein", "Server ist aus, Starten scheiterte")
    if zustand != "RUNNING":
        return ("klein", f"Server ist {zustand}, kein Vergrößern")
    if not klein(d):
        return ("erfolg", d)
    # Nimmt Oracle das Vergrößern an und bringt es nicht zu Ende, läuft er weiter klein: höchstens ein Versuch je ANSTOSS, sonst
    # startete er die ganze Nacht alle paar Minuten neu
    if angestossen and seit_anstoss < ANSTOSS:
        return ("klein", "wartet auf das Ergebnis des letzten Versuchs")
    for feld in ("angestossen", "aus_gemeldet"):
        stand.pop(feld, None)
    if not im_fenster(jetzt):
        return ("klein", "wartet auf die Nacht")
    if jetzt - datetime.fromisoformat(stand.get("klein_seit") or jetzt_iso(jetzt)) < NEU_GENUG:
        return ("klein", "Server ist noch neu")
    if not versuch_zaehlen(stand):
        return ("klein", "Tagesgrenze erreicht")
    u = oci(["compute", "instance", "update", "--instance-id", stand["klein"], "--shape-config",
             json.dumps({"ocpus": VOLL[0], "memoryInGBs": VOLL[1]}), "--force", "--no-retry"])
    if u["ok"]:
        stand["angestossen"] = jetzt_iso(jetzt)
        return ("klein", "Vergrößern angestoßen")
    art = einordnen(u)
    stand["letzter_fehler"] = u.get("code", "")
    if art == "kapazitaet":
        return ("klein", "kein Platz zum Vergrößern")
    if art == "drossel":
        return ("drossel", u.get("nachricht", ""))
    if art == "halt" or (art == "rechte" and not anlauf):
        return ("halt", f'Vergrößern: {u.get("code", "")}: {u.get("nachricht", "")}')
    stand["angestossen"] = jetzt_iso(jetzt)  # unklar: Oracle könnte trotzdem vergrößern und neu starten
    return ("klein", "unklar: " + u.get("nachricht", ""))


def nach_erfolg(oci, k, stand, instanz):
    vergroessert = bool(stand.get("klein"))
    stand.update(erfolg=jetzt_iso(), instanz=str(instanz.get("id", "")))
    if vergroessert:
        melden(oci, k, "Dein Server ist jetzt groß",
               "Der Platzsucher hat deinen Server von Studium Autopilot auf die volle kostenlose Größe gebracht (2 statt 1 Kern, "
               "12 statt 6 GB Arbeitsspeicher). Er hat sich dafür kurz neu gestartet. Wenn du Zeit hast, öffne Claude Desktop im Tab "
               "„Code“ und sag „Weiter mit der Einrichtung“: Dann bekommt er auch den restlichen kostenlosen Speicher.")
    else:
        melden(oci, k, "Dein Server ist da",
               "Oracle hat deinen kostenlosen Server für Studium Autopilot angelegt. "
               "Öffne Claude Desktop im Tab „Code“ (nicht im Chat) und sag „Weiter mit der Einrichtung“, dann richtet Claude ihn ein.")
    # Helfer samt Boot-Volume beenden (nur Instanzen mit dem Kennzeichen des Platzsuchers)
    # Klappt das nicht, belegt der Helfer weiter 50 GB des kostenlosen Speichers: Mail, damit ihn ein Mensch beendet.
    helfer = gekennzeichnet(oci, k, "helfer")
    beendet = isinstance(helfer, list) and bool(helfer) and all(
        oci(["compute", "instance", "terminate", "--instance-id", h["id"], "--preserve-boot-volume", "false", "--force"])["ok"] for h in helfer)
    if not beendet:
        stand["helfer_bleibt"] = True
        melden(oci, k, "Platzsucher-Helfer läuft noch",
               "Dein Server ist da, aber der Helfer des Platzsuchers konnte sich nicht selbst beenden. Sag Claude „Platzsucher "
               "beenden“ oder beende ihn in der Oracle-Konsole (Compute, Instanzen, Kennzeichen studium-autopilot=helfer) samt "
               "Boot-Volume; sonst belegt er 50 GB des kostenlosen Speichers.")


def suchen(oci, k, stand_datei=STAND, schlafen=time.sleep, jetzt=lambda: datetime.now(timezone.utc), ich=None):
    """Sucht, bis der Server da ist (→ "erfolg") oder ein Mensch gebraucht wird (→ "halt"). Ist er klein da, vergrößert er ihn
    erst noch (vergroessern) und meldet sich solange mit art=klein.
    ich: liefert die OCID dieses Helfers (eigene_id); dann steht der Stand am Helfer, sonst nicht."""
    stand = lesen(stand_datei, {})
    stand.setdefault("seit", jetzt_iso(jetzt()))
    warte_drossel = PAUSE[1]
    instanz, gezeigt, zuletzt = None, None, None
    while True:
        zeit = jetzt()
        anlauf = zeit - datetime.fromisoformat(stand["seit"]) < timedelta(minutes=ANLAUF_MIN)
        if stand.get("klein"):
            art, wert = vergroessern(oci, k, stand, zeit, anlauf)
        else:
            art, wert = runde(oci, k, stand, zeit, anlauf)
            if art == "erfolg" and klein(wert):
                stand.update(klein=str(wert.get("id", "")), klein_seit=jetzt_iso(zeit))
                melden(oci, k, "Dein Server ist da",
                       "Oracle hat deinen kostenlosen Server für Studium Autopilot angelegt, vorerst in halber Größe (1 Kern, 6 GB "
                       "Arbeitsspeicher; das reicht für alles). Öffne Claude Desktop im Tab „Code“ (nicht im Chat) und sag „Weiter mit "
                       "der Einrichtung“, dann richtet Claude ihn ein. Der Platzsucher bringt ihn nachts auf die volle Größe, sobald "
                       "Oracle Platz hat; dabei startet er kurz neu. Dafür musst du nichts tun.")
                art, wert = "klein", "Server da (1 OCPU / 6 GB), wird nachts vergrößert"
        if art == "erfolg":
            nach_erfolg(oci, k, stand, wert)
            schreiben(stand_datei, stand)
            return "erfolg"
        # Scheitert das Schreiben (im Anlauf fehlen oft noch Rechte), versucht er es nach der nächsten Runde wieder
        if ich and (art in ("halt", "klein") and art != zuletzt or gezeigt is None or zeit - gezeigt >= STAND_ALLE):
            instanz = instanz or ich()
            if instanz and stand_zeigen(oci, instanz, stand_text(stand, art, wert, zeit)):
                gezeigt, zuletzt = zeit, art
        if art == "halt":
            stand["angehalten"] = wert[:300]
            schreiben(stand_datei, stand)
            melden(oci, k, "Platzsucher angehalten",
                   "Der Platzsucher für deinen Server von Studium Autopilot hat angehalten, weil Oracle ablehnt: " + wert[:300]
                   + " Öffne Claude Desktop im Tab „Code“ (nicht im Chat) und sag „Weiter mit der Einrichtung“.")
            return "halt"
        if not stand.get("klein") and not stand.get("gemeldet_14") and (zeit - datetime.fromisoformat(stand["seit"])).days >= MELDUNG_NACH_TAGEN:
            if melden(oci, k, "Platzsucher sucht weiter",
                      f'Seit {MELDUNG_NACH_TAGEN} Tagen hat Oracle in deiner Region keinen Platz frei ({stand.get("versuche", 0)} Versuche). '
                      "Der Platzsucher sucht weiter. Willst du aufhören, sag Claude „Platzsucher beenden“."):
                stand["gemeldet_14"] = True
        schreiben(stand_datei, stand)
        if art == "drossel":
            warte_drossel = min(warte_drossel * 2, PAUSE_GEDROSSELT)
            schlafen(warte_drossel)
        elif art == "klein" and not im_fenster(zeit):
            warte_drossel = PAUSE[1]
            schlafen(bis_zum_fenster(zeit))
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
    if not shutil.which(a.oci):
        print(f"OCI-Kommandozeile fehlt: {a.oci}", file=sys.stderr)
        return 3
    oci = oci_aufrufer(a.oci)
    if a.einmal:
        stand = lesen(STAND, {})
        art, wert = runde(oci, k, stand)
        schreiben(STAND, stand)
        print(json.dumps({"ergebnis": art, "wert": wert if isinstance(wert, str) else wert.get("id", "")}, ensure_ascii=False))
        return 0
    return 0 if suchen(oci, k, ich=eigene_id) in ("erfolg", "halt") else 1


if __name__ == "__main__":
    sys.exit(main())
