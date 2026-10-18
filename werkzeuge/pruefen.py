#!/usr/bin/env python3
"""Datenschutz- und Qualitätsprüfung für den Baum von „Studium Autopilot EcoBA“.

Läuft lokal (vor jedem Release) und in GitHub Actions, nur mit der Python-Standardbibliothek.

    python werkzeuge/pruefen.py [BAUM] [--sperrliste DATEI] [--max-mb 2] [--ohne-node]

Geprüft wird jede Datei unter BAUM (Standard: aktueller Ordner), außer .git/ und node_modules/:

* Pfade: keine privaten Ordner, keine gerätelokalen Obsidian-Dateien, nur das Plugin „studium-autopilot“.
* Dateitypen: keine PDF-, Office-, Anki-, Archiv- oder Mediendateien; Bilder nur in docs/bilder/ (png, jpg, svg, webp);
  höchstens --max-mb je Datei.
* Markdown: keine Mermaid-Codeblöcke (die GitHub-App zeigt nur den Code; Diagramme als PNG unter docs/bilder/).
* Inhalte: persönliche Pfade, Server-Hinweise, IP-Adressen, E-Mail-Adressen (außer Funktionsadressen der Uni und
  GitHub-noreply), Telefonnummern, geteilte Lehrmaterial-Links, Zugangsdaten und Token, Sync-Konfiguration, der Name des
  Autors außerhalb der Autorenangaben und Namen aus einer optionalen Sperrliste (nur lokal).
* Vorlage leer: persönliche Felder der Module und Einstellungen leer, persönliche Ordner leer.
* Update-Liste: System/Daten/system-dateien.json (falls vorhanden) passt zu den Dateien (Klasse, Größe, SHA-256) und
  enthält jede Datei, die ein Update ersetzen darf (Regeln wie update.js, klasse_von unten).
* JavaScript: Syntax mit „node --check“ (wenn node da ist) und iOS-Regeln (kein Regex-Lookbehind, kein .at(), findLast,
  structuredClone, keine Node-Module; einzige Ausnahme: http/https/zlib in ilias-netz.js hinter Platform.isDesktopApp)
  für die Skripte des Vaults.

Ausgabe: eine lesbare Liste; Exit-Code 1 bei mindestens einem Fund, sonst 0.
"""
import argparse
import hashlib
import json
import os
import plistlib
import re
import shutil
import struct
import subprocess
import sys
import unicodedata

# ---------------------------------------------------------------------------------------------------------------------
# Regeln. Einige Muster sind absichtlich zerlegt geschrieben, damit diese Datei sich selbst nicht meldet.
# ---------------------------------------------------------------------------------------------------------------------

AUTOR_WORT = re.compile(r"\bPhili" + r"ps?\b")  # Vorname des Autors (auch Genitiv), nicht „Philipp“

INHALT_REGELN = [
    ("privater Benutzername", re.compile(r"cso" + r"ny", re.I)),
    ("Windows-Benutzerpfad", re.compile(r"\b[a-z]:(?:\\\\|\\|/)+users(?:\\\\|\\|/)", re.I)),
    ("Server-Pfad", re.compile(r"/home/(?:ubunt" + r"u|opc)\b")),
    ("Server-Hinweis", re.compile(r"\.ts\.net\b", re.I)),
    ("Server-Hinweis (allgemein)", re.compile(r"\bsslip\.io\b|\bnip\.io\b|orac" + r"lecloud|\bOrac" + r"le[- ]?(?:Server|Box|Cloud|VM)\b", re.I)),
    ("geteilter Drive-Link", re.compile(r"(?:drive|docs)\.google\.com/", re.I)),
    ("timms-Link", re.compile(r"\btimms\.uni-tuebingen\.de\b", re.I)),
    ("ILIAS-Download-Link", re.compile(r"secure" + r"dl", re.I)),
    ("GitHub-Token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}")),
    ("API-Schlüssel (sk-)", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("AWS-Schlüssel", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Google-API-Schlüssel", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Slack-Token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("privater Schlüssel", re.compile(r"-----BEGIN [A-Z ]*PRIV" + r"ATE KEY-----")),
    ("Zugangsdaten in URL", re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/:@\"'<>]+:[^\s/@\"'<>]+@[^\s/]", re.I)),
    ("Passwort mit Wert", re.compile(
        r"\b(?:pass(?:wort|word|wd)|pwd|kennwort)\s*[=:]\s*[\"'`„*]*(?!\s|$|[\"'`“*]?\s*$)[^\s\"'`“*,;)]{3,}", re.I)),
    # „Passwort … lautet/ist X“: X mit Ziffer oder hervorgehoben (**X**, `X`, „X“), damit „Das Passwort ist geheim“ nicht zählt
    ("Kurspasswort", re.compile(
        r"\b(?:kurs)?pass(?:wort|word)\b[^\n]{0,20}?\b(?:ist|lautet|heißt|is)\b\s*:?\s*"
        r"(?:[\"'`„*]+[^\s\"'`“*]{3,}|[^\s\"'`“*,.;)?!]*\d[^\s\"'`“*,.;)?!]*)", re.I)),
    ("Verweis auf privaten Ordner", re.compile(r"(?<![\w-])_priv" + r"at[/\\]")),
    ("LiveSync/CouchDB-Konfiguration", re.compile(
        r"couchDB_(?:URI|USER|PASSWORD|DBNAME)|setupliv" + r"esync|\bpassphrase\b\s*[\"']?\s*[=:]\s*[\"']?\S{3,}|:598" + r"4\b",
        re.I)),
]

EMAIL = re.compile(r"(?<![\w.%+-])([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b")
IP = re.compile(r"(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w.]*\d)")
# Die Funktion „Eigener Server“ (server/) richtet für Studierende einen eigenen Server beim Anbieter der Freistufe ein
# und muss dessen Namen und die Adressdienste nennen (Entscheidung vom 18.10.2026). Nur dort und nur diese Regel;
# Tailnet-Namen, IP-Adressen, Pfade und Namen bleiben auch in server/ gesperrt.
REGEL_AUSNAHMEN = {"Server-Hinweis (allgemein)": ("server/",)}
IP_ERLAUBT = {"127.0.0.1", "0.0.0.0"}
TELEFON = [
    re.compile(r"(?<![\w+])(?:\+|00)[1-9]\d{0,2}[\s./-]?\(?0?\d{2,5}\)?[\s./-]?\d{2,}(?:[\s./-]?\d{2,})*"),
    re.compile(r"(?<![\w.:-])0\d{2,5}(?:\s|\s?/\s?)\d{2,}(?:[\s-]\d{1,6})?(?![\w.:])"),
    re.compile(r"\b(?:tel(?:efon)?|fon|mobil|handy)\b\.?\s*:?\s*\+?\d[\d\s/().-]{5,}\d", re.I),
]

VERBOTENE_ENDUNGEN = {
    ".pdf": "PDF", ".doc": "Office", ".docx": "Office", ".xls": "Office", ".xlsx": "Office", ".ppt": "Office",
    ".pptx": "Office", ".odt": "Office", ".ods": "Office", ".odp": "Office", ".rtf": "Office", ".pages": "Office",
    ".key": "Office", ".numbers": "Office", ".apkg": "Anki", ".colpkg": "Anki", ".anki2": "Anki",
    ".zip": "Archiv", ".tgz": "Archiv", ".gz": "Archiv", ".tar": "Archiv", ".7z": "Archiv", ".rar": "Archiv",
    ".mp3": "Audio", ".m4a": "Audio", ".wav": "Audio", ".mp4": "Video", ".mov": "Video", ".webm": "Video",
    ".sqlite": "Datenbank", ".db": "Datenbank", ".pem": "Schlüssel", ".p12": "Schlüssel", ".pfx": "Schlüssel",
    ".env": "Umgebungsdatei",
}
BILD_ENDUNGEN = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tif", ".tiff", ".heic", ".ico", ".avif"}
BILD_ERLAUBT = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
BILD_ORDNER = "docs/bilder/"

IGNORIERTE_ORDNER = {".git", "node_modules"}
MERMAID = re.compile(r"^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid(?![\w-])", re.I)  # Codeblock ```mermaid in Markdown
SVG_ZAHLEN = re.compile(r"""(\b(?:d|points|viewBox|transform)\s*=\s*)(?:"[^"]*"|'[^']*')""")  # Pfaddaten in .svg
HEX64 = re.compile(r"\b[0-9a-f]{64}\b")

# Persönliche Ordner der Vorlage (müssen leer sein, höchstens .gitkeep)
LEERE_ORDNER = ["Stundenplan", "Vorlesungen", "Übungsblätter", "Unterlagen", "Eingang", "Anhänge", "Schlüsselqualifikationen",
                "Karteikarten"]
MODUL_LEER = ["ergebnis", "versuch", "klausur", "semester_geplant"]
EINSTELLUNGEN_LEER = ["name", "zielnote", "studienbeginn"]

NODE_MODULE = r"(?:node:)?(?:fs|path|child_process|os|crypto|http|https|net|zlib|electron)(?:/[\w/]+)?"
IOS_REGELN = [
    ("Regex-Lookbehind", re.compile(r"\(\?<[=!]")),
    ("findLast", re.compile(r"\.findLast(?:Index)?\s*\(")),
    ("structuredClone", re.compile(r"\bstructuredClone\s*\(")),
    ("Node-Modul", re.compile(r"\brequire\s*\(\s*[\"']" + NODE_MODULE + r"[\"']\s*\)")),
]
# Einzige Ausnahme von „Node-Modul“: ilias-netz.js lädt am PC Node-https (requestUrl verliert dort Kekse aus
# Weiterleitungen), nur die Module http, https, zlib und nur, wenn die Datei im Code (nicht nur im Kommentar)
# Platform.isDesktopApp prüft. iPhone/iPad nutzen dort requestUrl. Alle anderen Regeln gelten auch für diese Datei.
NODE_AUSNAHME_DATEI = "Studium Autopilot/System/Skripte/ilias-netz.js"
NODE_AUSNAHME_MODULE = {"http", "https", "zlib"}
NODE_AUSNAHME_WACHE = re.compile(r"\bPlatform\.isDesktopApp\b")
_NODE_NAME = re.compile(r"[\"'](?:node:)?([\w/]+)[\"']")
AT_AUFRUF = re.compile(r"(\b[A-Za-z_$][\w$]*|[\])])\s*\.\s*at\s*\(")
EIGENES_AT = re.compile(r"\b(?:const|let|var|function)\s+at\b|\bat\s*:|[{,]\s*at\s*[,}]|^\s*at\s*\([^)]*\)\s*\{", re.M)


class Fund:
    def __init__(self, pfad, zeile, regel, text):
        self.pfad, self.zeile, self.regel, self.text = pfad, zeile, regel, text

    def __str__(self):
        ort = f"{self.pfad}:{self.zeile}" if self.zeile else self.pfad
        return f"  {ort}  [{self.regel}]  {self.text}"


def kuerzen(s, n=110):
    s = s.strip().replace("\t", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def maskieren(regel, s):
    """Zugangsdaten nie vollständig ausgeben."""
    if regel in ("GitHub-Token", "API-Schlüssel (sk-)", "AWS-Schlüssel", "Google-API-Schlüssel", "Slack-Token",
                 "Passwort mit Wert", "Kurspasswort", "Zugangsdaten in URL", "LiveSync/CouchDB-Konfiguration"):
        return s[:6] + "…(" + str(len(s)) + " Zeichen)"
    return s


# ---------------------------------------------------------------------------------------------------------------------
# Sperrliste
# ---------------------------------------------------------------------------------------------------------------------

def sperrliste_laden(pfad):
    if not pfad:
        return []
    begriffe = []
    with open(pfad, encoding="utf-8") as f:
        for z in f:
            z = z.strip()
            if z and not z.startswith("#"):
                begriffe.append(z)
    return [(b, re.compile(r"(?<![\w])" + re.escape(b).replace(r"\ ", r"\s+") + r"(?![\w])", re.I)) for b in begriffe]


# ---------------------------------------------------------------------------------------------------------------------
# Inhalte
# ---------------------------------------------------------------------------------------------------------------------

AUTOR_ABSCHNITT = re.compile(r"(?i)^#{1,6}\s*(autor(?:in|en)?|author|maintainer|über mich|about|kontakt|impressum)\b")


def autor_erlaubt(rel, zeile, abschnitt=""):
    """„Philip“ nur als Autorenangabe: manifest.json (author), LICENSE*, Copyright-Zeilen, Zeilen, die ihn ausdrücklich
    als Autor nennen, und der Abschnitt „Autor“ einer README."""
    name = rel.rsplit("/", 1)[-1]
    if re.search(r"(?i)\b(autor(?:in|en)?|author|maintainer)\b", zeile):
        return True
    if name.upper().startswith("README") and AUTOR_ABSCHNITT.match(abschnitt):
        return True
    if name.upper().startswith("LICENSE") or name.upper().startswith("LICENCE"):
        return True
    if name == "manifest.json" and re.search(r"\"author\"\s*:", zeile):
        return True
    if re.search(r"(?i)copyright|\(c\)|©", zeile):
        return True
    if name.upper().startswith("README") and re.search(
            r"(?i)\b(autor(?:in)?|author|maintainer|betreut von|entwickelt von|gebaut von|erstellt von|made by|built by|by)\b", zeile):
        return True
    if rel == "CITATION.cff":
        return True
    return False


def email_erlaubt(lokal, domain):
    d = domain.lower()
    if d == "users.noreply.github.com":
        return True
    if d == "uni-tuebingen.de" or d.endswith(".uni-tuebingen.de"):
        # Funktionsadressen (pruefungsamt@…); vorname.nachname@… und Studierenden-Adressen sind persönlich
        return "student" not in d and "." not in lokal
    return False


def ip_pruefen(m):
    teile = [int(x) for x in m.groups()]
    if any(t > 255 for t in teile):
        return False
    return m.group(0) not in IP_ERLAUBT


def text_pruefen(rel, text, sperre, funde):
    ohne_ip = rel.lower().endswith((".css", ".svg"))  # Pfaddaten/Zahlenreihen, keine Adressen
    abschnitt = ""  # letzte Markdown-Überschrift (für den Autorenabschnitt der README)
    md = rel.lower().endswith(".md")
    for nr, zeile in enumerate(text.splitlines(), 1):
        if md and zeile.startswith("#"):
            abschnitt = zeile
        if md and MERMAID.match(zeile):
            funde.append(Fund(rel, nr, "Mermaid-Diagramm (GitHub-App zeigt nur den Code; Bild unter docs/bilder/)", kuerzen(zeile)))
        if len(zeile) > 20000:
            zeile = zeile[:20000]
        for regel, rx in INHALT_REGELN:
            if rel.startswith(REGEL_AUSNAHMEN.get(regel, ())):
                continue
            for m in rx.finditer(zeile):
                funde.append(Fund(rel, nr, regel, maskieren(regel, kuerzen(m.group(0)))))
        for m in EMAIL.finditer(zeile):
            if not email_erlaubt(m.group(1), m.group(2)):
                funde.append(Fund(rel, nr, "E-Mail-Adresse", m.group(0)))
        for m in IP.finditer(zeile) if not ohne_ip and "data:image" not in zeile else ():
            if ip_pruefen(m):
                funde.append(Fund(rel, nr, "IP-Adresse", m.group(0)))
        belegt = []  # Spannen schon gemeldeter Nummern (mehrere Muster, eine Meldung)
        for rx in TELEFON:
            for m in rx.finditer(zeile):
                ziffern = re.sub(r"\D", "", m.group(0))
                if not 7 <= len(ziffern) <= 15 or re.fullmatch(r"(19|20)\d{6}", ziffern):
                    continue
                if any(m.start() < b and a < m.end() for a, b in belegt):
                    continue
                belegt.append((m.start(), m.end()))
                funde.append(Fund(rel, nr, "Telefonnummer?", kuerzen(m.group(0))))
        if AUTOR_WORT.search(zeile) and not autor_erlaubt(rel, zeile, abschnitt):
            funde.append(Fund(rel, nr, "Autorname außerhalb der Autorenangabe", kuerzen(zeile)))
        for begriff, rx in sperre:
            if rx.search(zeile):
                funde.append(Fund(rel, nr, "Sperrliste", f"„{begriff}“"))


# ---------------------------------------------------------------------------------------------------------------------
# JavaScript: Kommentare entfernen (Strings, Template-Literale und Regex-Literale bleiben), iOS-Regeln
# ---------------------------------------------------------------------------------------------------------------------

_REGEX_DAVOR = set("(,=:[!&|?{};+-*%<>~^")
_REGEX_WOERTER = {"return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await",
                  "instanceof"}


def js_ohne_kommentare(code):
    """Ersetzt Kommentare durch Leerzeichen (Zeilenumbrüche bleiben, damit Zeilennummern stimmen)."""
    aus = []
    i, n = 0, len(code)
    stapel = []          # offene Template-Literale: Klammertiefe beim Eintritt in ${
    tiefe = 0
    letztes = ""         # letztes bedeutsames Zeichen/Wort im Code (für Regex-Erkennung)

    def regex_moeglich():
        if not letztes:
            return True
        if letztes in _REGEX_WOERTER:
            return True
        return letztes[-1] in _REGEX_DAVOR

    def template(i):
        # ab dem Zeichen nach ` bis zum schließenden ` oder ${
        while i < n:
            c = code[i]
            if c == "\\":
                aus.append(code[i:i + 2]); i += 2; continue
            if c == "`":
                aus.append(c); return i + 1, False
            if c == "$" and i + 1 < n and code[i + 1] == "{":
                aus.append("${"); return i + 2, True
            aus.append(c); i += 1
        return i, False

    while i < n:
        c = code[i]
        if c == "/" and i + 1 < n and code[i + 1] == "/":
            j = code.find("\n", i)
            j = n if j < 0 else j
            aus.append(" " * (j - i)); i = j; continue
        if c == "/" and i + 1 < n and code[i + 1] == "*":
            j = code.find("*/", i + 2)
            j = n if j < 0 else j + 2
            aus.append(re.sub(r"[^\n]", " ", code[i:j])); i = j; continue
        if c in "\"'":
            j = i + 1
            while j < n and code[j] != c and code[j] != "\n":
                j += 2 if code[j] == "\\" else 1
            aus.append(code[i:j + 1]); i = j + 1; letztes = "a"; continue
        if c == "`":
            aus.append(c)
            i, offen = template(i + 1)
            if offen:
                stapel.append(tiefe); tiefe += 1; letztes = "{"
            else:
                letztes = "a"
            continue
        if c == "/" and regex_moeglich():
            j, klasse = i + 1, False
            while j < n and code[j] != "\n":
                if code[j] == "\\":
                    j += 2; continue
                if code[j] == "[":
                    klasse = True
                elif code[j] == "]":
                    klasse = False
                elif code[j] == "/" and not klasse:
                    break
                j += 1
            j += 1
            while j < n and (code[j].isalpha()):
                j += 1
            aus.append(code[i:j]); i = j; letztes = "a"; continue
        if c == "{":
            tiefe += 1
        elif c == "}":
            tiefe -= 1
            if stapel and tiefe == stapel[-1]:
                stapel.pop()
                aus.append(c)
                i, offen = template(i + 1)
                if offen:
                    stapel.append(tiefe); tiefe += 1; letztes = "{"
                else:
                    letztes = "a"
                continue
        if c.isalnum() or c in "_$":
            j = i
            while j < n and (code[j].isalnum() or code[j] in "_$"):
                j += 1
            wort = code[i:j]
            aus.append(wort); i = j
            letztes = wort if wort in _REGEX_WOERTER else "a"
            continue
        if not c.isspace():
            letztes = c
        aus.append(c); i += 1
    return "".join(aus)


def node_ausnahme(rel, ohne_kommentare, zeile):
    """True, wenn jede Node-Modul-Fundstelle der Zeile durch die Ausnahme für ilias-netz.js gedeckt ist."""
    if rel != NODE_AUSNAHME_DATEI or not NODE_AUSNAHME_WACHE.search(ohne_kommentare):
        return False
    rx = dict(IOS_REGELN)["Node-Modul"]
    return all(_NODE_NAME.search(m.group(0)).group(1) in NODE_AUSNAHME_MODULE for m in rx.finditer(zeile))


def ios_pruefen(rel, code, funde):
    ohne = js_ohne_kommentare(code)
    eigenes_at = bool(EIGENES_AT.search(ohne))
    for nr, zeile in enumerate(ohne.splitlines(), 1):
        for regel, rx in IOS_REGELN:
            if regel == "Node-Modul" and node_ausnahme(rel, ohne, zeile):
                continue
            if rx.search(zeile):
                funde.append(Fund(rel, nr, "iOS: " + regel, kuerzen(zeile)))
        for m in AT_AUFRUF.finditer(zeile):
            # Eigene Methode at() (z. B. Bahn-Objekt in verlauf.js) ist erlaubt, Array/String.prototype.at nicht
            if eigenes_at and re.fullmatch(r"[A-Za-z_$][\w$]*", m.group(1)):
                continue
            funde.append(Fund(rel, nr, "iOS: .at()", kuerzen(zeile)))


def node_pruefen(dateien, wurzel, funde, hinweise, ohne_node):
    node = None if ohne_node else shutil.which("node")
    if not node:
        hinweise.append("node nicht gefunden: Syntaxprüfung (node --check) übersprungen, läuft in GitHub Actions.")
        return
    for rel in dateien:
        r = subprocess.run([node, "--check", os.path.join(wurzel, rel)], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if r.returncode != 0:
            meldung = (r.stderr or r.stdout).strip().splitlines()
            zeile = 0
            if meldung:
                m = re.search(r":(\d+)$", meldung[0])
                zeile = int(m.group(1)) if m else 0
            text = next((z for z in meldung if "Error" in z), meldung[-1] if meldung else "Syntaxfehler")
            funde.append(Fund(rel, zeile, "JS-Syntax", kuerzen(text)))


# ---------------------------------------------------------------------------------------------------------------------
# Vorlage leer (persönliche Felder und Ordner)
# ---------------------------------------------------------------------------------------------------------------------

def frontmatter(text):
    m = re.match(r"^---\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", text, re.S)
    felder = {}
    if not m:
        return felder
    for z in m.group(1).splitlines():
        km = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", z)
        if km:
            felder[km.group(1)] = km.group(2).strip()
    return felder


def leer(wert):
    return wert in ("", '""', "''", "null", "~", "[]")


def vorlage_pruefen(wurzel, alle, funde):
    vaults = sorted({r[: -len(".obsidian/plugins/studium-autopilot/manifest.json")] for r in alle
                     if r.endswith(".obsidian/plugins/studium-autopilot/manifest.json")})
    for v in vaults:
        for ordner in LEERE_ORDNER:
            for r in alle:
                if r.startswith(v + ordner + "/") and not r.endswith("/.gitkeep"):
                    funde.append(Fund(r, 0, "Vorlage: persönlicher Ordner nicht leer", ordner + "/"))
        for r in alle:
            if not r.endswith(".md"):
                continue
            innen = r[len(v):]
            if not (innen.startswith("Module/") or innen.startswith("Termine/") or innen == "System/Einstellungen.md"):
                continue
            with open(os.path.join(wurzel, r), encoding="utf-8", errors="replace") as f:
                fm = frontmatter(f.read())
            if innen.startswith("Module/") and fm.get("typ") == "modul":
                if fm.get("status", "").strip("\"'") not in ("", "offen"):
                    funde.append(Fund(r, 0, "Vorlage: persönliches Feld gesetzt", "status: " + fm["status"]))
                for k in MODUL_LEER:
                    if k in fm and not leer(fm[k]):
                        funde.append(Fund(r, 0, "Vorlage: persönliches Feld gesetzt", f"{k}: {kuerzen(fm[k], 40)}"))
                if fm.get("gewaehlt", "false") not in ("false", ""):
                    funde.append(Fund(r, 0, "Vorlage: persönliches Feld gesetzt", "gewaehlt: " + fm["gewaehlt"]))
            elif innen.startswith("Termine/"):
                if fm.get("herkunft", "").strip("\"'") != "zentral":
                    funde.append(Fund(r, 0, "Vorlage: eigener Termin", "Termin ohne „herkunft: zentral“"))
            elif innen == "System/Einstellungen.md":
                for k in EINSTELLUNGEN_LEER:
                    if k in fm and not leer(fm[k]):
                        funde.append(Fund(r, 0, "Vorlage: persönliches Feld gesetzt", f"{k}: {kuerzen(fm[k], 40)}"))
    return vaults


# ---------------------------------------------------------------------------------------------------------------------
# Update-Liste (system-dateien.json): Dateiklassen wie System/Skripte/update.js (klasseVon) – beide gleich halten!
# ---------------------------------------------------------------------------------------------------------------------

LISTE = "System/Daten/system-dateien.json"
KERN = ".obsidian/plugins/studium-autopilot/"
KERN_DATEIEN = ("main.js", "manifest.json", "styles.css")
EINSTELLUNG = (".obsidian/app.json", ".obsidian/bookmarks.json", ".obsidian/community-plugins.json",
               ".obsidian/core-plugins.json", ".obsidian/hotkeys.json", ".obsidian/types.json")
_PFAD_VERBOTEN = re.compile(r'[\x00-\x1f\x7f\\:*?"<>|]')
_FM = re.compile(r"^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|\Z))")
_HAKEN = re.compile(r"^([ \t>]*[-*+] \[)[xX](\])", re.M)
_AUFGABE = re.compile(r"^[ \t>]*[-*+] \[[ xX]\]", re.M)


def pfad_ok(p):
    if not p or len(p) > 300 or _PFAD_VERBOTEN.search(p) or p.startswith("/"):
        return False
    return all(t and t not in (".", "..", ".trash") and not t.endswith((" ", ".")) for t in p.split("/"))


def klasse_von(pfad):
    """Pfad im Vault → "system" | "einstellung" | "seite" | "modul" | "" (nie im Update)."""
    p = unicodedata.normalize("NFC", pfad)
    if not pfad_ok(p):
        return ""
    if p.startswith(KERN):
        return "system" if p[len(KERN):] in KERN_DATEIEN else ""
    if re.fullmatch(r"System/Skripte/[^/]+\.js", p) or re.fullmatch(r"System/Gerüste/[^/]+\.md", p):
        return "system"
    if re.fullmatch(r"\.obsidian/snippets/eba-[^/]+\.css", p):
        return "system"
    if p in EINSTELLUNG:
        return "einstellung"
    if p in ("Dashboard.md", "System/Daten/Musterplan.md") or re.fullmatch(r"Studium/[^/]+\.md", p):
        return "seite"
    if re.fullmatch(r"Module/.+\.md", p, re.S):
        return "modul"
    return ""


def _sha(b):
    return hashlib.sha256(b).hexdigest()


def listen_eintrag(rel, daten):
    """Eintrag der Update-Liste für eine Datei (rel im Vault, daten = Bytes)."""
    k = klasse_von(rel)
    e = {"pfad": unicodedata.normalize("NFC", rel), "klasse": k, "groesse": len(daten), "sha256": _sha(daten)}
    if k == "modul":
        text = daten.decode("utf-8")
        m = _FM.match(text)
        e["koerper"] = _sha((text[m.end():] if m else text).encode("utf-8"))
    elif k == "seite":
        text = daten.decode("utf-8")
        if _AUFGABE.search(text):
            e["ohne_haken"] = _sha(_HAKEN.sub(r"\1 \2", text).encode("utf-8"))
    return e


def liste_pruefen(wurzel, alle, vault, funde):
    """vault = Präfix des Vaults im Baum (z. B. "Studium Autopilot/")."""
    rel_liste = vault + LISTE
    if rel_liste not in alle:
        return
    try:
        with open(os.path.join(wurzel, rel_liste), encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError) as e:
        funde.append(Fund(rel_liste, 0, "Update-Liste unlesbar", kuerzen(str(e))))
        return
    gelistet = set()
    for e in d.get("dateien", []):
        innen = str(e.get("pfad", ""))
        if not e.get("klasse") or klasse_von(innen) != e.get("klasse"):
            funde.append(Fund(rel_liste, 0, "Update-Liste: Klasse falsch", f"{innen}: {e.get('klasse')}"))
            continue
        pfad = os.path.join(wurzel, *(vault + innen).split("/"))
        if not os.path.isfile(pfad):
            funde.append(Fund(rel_liste, 0, "Update-Liste: Datei fehlt", innen))
            continue
        with open(pfad, "rb") as f:
            soll = listen_eintrag(innen, f.read())
        if {k: e.get(k) for k in soll} != soll or set(e) - set(soll):
            funde.append(Fund(rel_liste, 0, "Update-Liste: Prüfsumme/Größe falsch", innen))
        gelistet.add(unicodedata.normalize("NFC", innen))
    for r in alle:
        if r.startswith(vault):
            innen = unicodedata.normalize("NFC", r[len(vault):])
            if klasse_von(innen) and innen not in gelistet:
                funde.append(Fund(rel_liste, 0, "Update-Liste: Datei fehlt in der Liste", innen))
    try:
        with open(os.path.join(wurzel, vault + KERN + "manifest.json"), encoding="utf-8") as f:
            v = json.load(f)["version"]
        if d.get("version") != v:
            funde.append(Fund(rel_liste, 0, "Update-Liste: Version passt nicht zum Plugin", f"{d.get('version')} ≠ {v}"))
    except (OSError, ValueError, KeyError):
        pass


# ---------------------------------------------------------------------------------------------------------------------
# Pfade und Dateitypen
# ---------------------------------------------------------------------------------------------------------------------

def pfad_pruefen(rel, groesse, max_bytes, funde):
    teile = rel.split("/")
    name = teile[-1]
    endung = os.path.splitext(name)[1].lower()
    if "_privat" in teile:
        funde.append(Fund(rel, 0, "privater Ordner", "_privat"))
    if ".trash" in teile:
        funde.append(Fund(rel, 0, "Papierkorb", ".trash/"))
    if ".obsidian" in teile:
        if re.fullmatch(r"workspace.*\.json", name) or name == "workspaces.json":
            funde.append(Fund(rel, 0, "gerätelokale Obsidian-Datei", name))
        if "plugins" in teile:
            k = teile.index("plugins")
            if len(teile) > k + 1 and teile[k + 1] != "studium-autopilot":
                funde.append(Fund(rel, 0, "fremdes Plugin", teile[k + 1]))
            if name == "data.json":
                funde.append(Fund(rel, 0, "Plugin-Einstellungen (gerätelokal)", name))
    if rel.endswith("System/Daten/abruf.json"):
        funde.append(Fund(rel, 0, "gerätelokale Datei", "abruf.json"))
    if rel.endswith("System/Daten/installiert.json"):
        funde.append(Fund(rel, 0, "vaultlokale Datei (Update-Stand)", "installiert.json"))
    if rel.endswith("System/Daten/ilias.json"):
        funde.append(Fund(rel, 0, "vaultlokale Datei (ILIAS-Index)", "ilias.json"))
    if rel.endswith("System/Daten/ilias-abruf.json"):
        funde.append(Fund(rel, 0, "gerätelokale Datei", "ilias-abruf.json"))
    if "/System/Daten/Karteikarten/" in "/" + rel:
        funde.append(Fund(rel, 0, "persönliche Lernstände (Karteikarten)", name))
    if name in (".DS_Store", "Thumbs.db", "desktop.ini") or name.startswith("~$"):
        funde.append(Fund(rel, 0, "Systemdatei", name))
    if endung in VERBOTENE_ENDUNGEN:
        funde.append(Fund(rel, 0, "Dateityp nicht erlaubt", VERBOTENE_ENDUNGEN[endung]))
    if endung in BILD_ENDUNGEN and not (rel.startswith(BILD_ORDNER) and endung in BILD_ERLAUBT):
        funde.append(Fund(rel, 0, "Bild außerhalb von docs/bilder/", endung))
    if groesse > max_bytes:
        funde.append(Fund(rel, 0, "Datei zu groß", f"{groesse / 1048576:.1f} MB > {max_bytes / 1048576:.1f} MB"))


def kurzbefehl_signiert(rel, roh):
    """Ein von Apple signierter iOS-Kurzbefehl (docs/kurzbefehl/*.shortcut) ist binär, aber erlaubt: AEA-Archiv, dessen
    Signatur nur Apples Zertifikatskette trägt (Modus „jeder“, ohne Kontaktdaten des Signierenden)."""
    if not (rel.startswith("docs/kurzbefehl/") and rel.endswith(".shortcut") and roh[:4] == b"AEA1"):
        return False
    try:
        laenge = struct.unpack("<I", roh[8:12])[0]
        kontext = plistlib.loads(roh[12:12 + laenge])
    except Exception:
        return False
    kette = kontext.get("SigningCertificateChain") if isinstance(kontext, dict) else None
    return set(kontext) == {"SigningCertificateChain"} and bool(kette) and all(
        isinstance(z, bytes) and b"Apple Certification Authority" in z for z in kette)


def dateien_sammeln(wurzel):
    alle = []
    for ordner, unter, namen in os.walk(wurzel):
        unter[:] = sorted(u for u in unter if u not in IGNORIERTE_ORDNER)
        for name in sorted(namen):
            rel = os.path.relpath(os.path.join(ordner, name), wurzel).replace(os.sep, "/")
            alle.append(rel)
    return alle


def ist_vault_js(rel):
    return bool(re.search(r"(^|/)System/Skripte/[^/]+\.js$", rel) or re.search(r"(^|/)\.obsidian/plugins/[^/]+/main\.js$", rel))


def pruefen(wurzel, sperre, max_bytes, ohne_node=False):
    funde, hinweise = [], []
    alle = dateien_sammeln(wurzel)
    js = []
    for rel in alle:
        pfad = os.path.join(wurzel, rel)
        groesse = os.path.getsize(pfad)
        pfad_pruefen(rel, groesse, max_bytes, funde)
        endung = os.path.splitext(rel)[1].lower()
        if endung in BILD_ENDUNGEN and endung != ".svg":
            continue
        if groesse > max_bytes:
            continue
        with open(pfad, "rb") as f:
            roh = f.read()
        if b"\x00" in roh:
            if endung not in BILD_ENDUNGEN and not kurzbefehl_signiert(rel, roh):
                funde.append(Fund(rel, 0, "Binärdatei", "unbekannter Inhalt"))
            continue
        text = roh.decode("utf-8", errors="replace")
        # SHA-256-Werte (z. B. in system-dateien.json) sind keine Telefonnummern o. ä.
        geprueft = HEX64.sub("#" * 64, text)
        if endung == ".svg":
            # Zahlenreihen in Pfaddaten (d, points, viewBox, transform) sind keine Telefonnummern o. Ä.
            geprueft = SVG_ZAHLEN.sub(lambda m: m.group(1) + '""', geprueft)
        text_pruefen(rel, geprueft, sperre, funde)
        if endung == ".json":
            try:
                json.loads(text)
            except ValueError as e:
                funde.append(Fund(rel, getattr(e, "lineno", 0), "JSON ungültig", kuerzen(str(e))))
        if endung in (".js", ".mjs", ".cjs"):
            js.append(rel)
            if ist_vault_js(rel):
                ios_pruefen(rel, text, funde)
    vaults = vorlage_pruefen(wurzel, alle, funde)
    for v in vaults:
        liste_pruefen(wurzel, alle, v, funde)
    node_pruefen(js, wurzel, funde, hinweise, ohne_node)
    return alle, funde, hinweise, vaults, js


def main(argv=None):
    ap = argparse.ArgumentParser(description="Datenschutz- und Qualitätsprüfung eines Baums (Exit 1 bei Fund).")
    ap.add_argument("baum", nargs="?", default=".", help="zu prüfender Ordner (Standard: .)")
    ap.add_argument("--sperrliste", help="Datei mit gesperrten Begriffen (eine Zeile je Begriff; nur lokal)")
    ap.add_argument("--max-mb", type=float, default=2.0, help="Größengrenze je Datei in MB (Standard 2)")
    ap.add_argument("--ohne-node", action="store_true", help="node --check auslassen")
    a = ap.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    wurzel = os.path.abspath(a.baum)
    if not os.path.isdir(wurzel):
        print(f"Ordner nicht gefunden: {wurzel}")
        return 2
    sperre = sperrliste_laden(a.sperrliste)
    alle, funde, hinweise, vaults, js = pruefen(wurzel, sperre, int(a.max_mb * 1048576), a.ohne_node)

    print(f"Prüfung: {len(alle)} Dateien, {len(js)} JavaScript-Dateien, Vault: {', '.join(v.rstrip('/') or '.' for v in vaults) or '–'}"
          + (f", Sperrliste: {len(sperre)} Begriffe" if a.sperrliste else ", ohne Sperrliste (nur allgemeine Muster)"))
    for h in hinweise:
        print("Hinweis: " + h)
    if not funde:
        print("Ergebnis: keine Funde.")
        return 0
    print(f"Ergebnis: {len(funde)} Fund(e)")
    nach_datei = {}
    for f in funde:
        nach_datei.setdefault(f.pfad, []).append(f)
    for pfad in sorted(nach_datei):
        print(pfad)
        for f in sorted(nach_datei[pfad], key=lambda x: x.zeile):
            print(str(f).replace("  " + pfad, "   ", 1))
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for f in funde[:50]:
            text = f"{f.regel}: {f.text}".replace("%", "%25").replace("\r", "").replace("\n", " ")
            print(f"::error file={f.pfad},line={f.zeile or 1}::{text}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
