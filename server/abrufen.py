#!/usr/bin/env python3
"""Abruf ohne KI für den eigenen Server von Studium Autopilot (server/README.md): das Uni-Postfach.

Holt neue Mails, legt sie als Text nach abruf/roh/ und schreibt dann den Anstoß für den Claude-Lauf (abruf/anstoss, lauf.mjs). Nur
Standardbibliothek. Läuft als eigener Benutzer (studium-abruf) und schreibt nur in seinen Ordner abruf/; den Takt und den Knopf
(takt.json, knopf.json) liest es aus dem Ordner des Web-Dienstes (web/), nur als echte Datei, nie über einen Link. Termine aus dem ILIAS-Kalender holt das Plugin selbst, ohne KI; der Server gibt Claude nur, wofür es KI
braucht (Mails).

Kopf jeder Mail im Text: Betreff, Von, Datum, die Domain aus From und das Urteil der Kopfzeile Authentication-Results, die der
Mailserver der Uni beim Zustellen setzt (Authentifiziert: pass | fehlgeschlagen | unbekannt), je eine Zeile; ein Zeilenumbruch in einer Kopfzeile wird zum Leerzeichen.
lauf.mjs liest Domain und Urteil dort ab (Absender nicht bestätigt, Änderungen aus einer anderen Quelle).

Anhänge: Kalender (.ics) stehen als eine Zeile je Termin im Text. PDFs (Prüfungsplan, Übungsplan) legt das Skript unverändert
neben die Mail (roh/uni-postfach/<UIDVALIDITY>-<UID>-anhang-<n>.pdf, Grenzen unten), der Text nennt sie; Claude liest eine davon nur, wenn sie
nach Terminen aussieht (Skill termine.md). Gelesen wird die PDF erst im Claude-Lauf, nicht hier: Dieser Prozess hat den
Uni-Zugang, und ein PDF-Leser hätte mit einer präparierten Datei sonst Zugriff darauf. Andere Anhänge nur mit Namen.

  python3 abrufen.py      braucht den Uni-Zugang als systemd-Credential ($CREDENTIALS_DIRECTORY/uni-zugang, JSON oder
                          Zeilen username=/password=)

Nur lesen (EXAMINE, BODY.PEEK; nichts wird als gelesen markiert), nur neue Mails nach UID. Lehnt der Server die Anmeldung ab,
schreibt das Skript uni-zugang-falsch und versucht es nicht wieder, bis der Zugang neu gesetzt ist (Schutz vor Kontosperre).

Takt: Der Zeitgeber startet alle 15 Minuten; steht in Obsidian 30 oder 60 Minuten (web/takt.json vom Dienst), lässt das Skript die
Zwischenzeiten aus, außer du hast seitdem „Mails durchsuchen“ getippt (web/knopf.json). Täglicher Sicherheitslauf: beim ersten Start
ab 06:30 Uhr (Berlin) holt es die Uni-Mails der letzten 24 Stunden noch einmal und stößt einen Lauf an (Grund „taeglich“), auch
ohne neue Mail: So kommt nach, was liegen geblieben ist, und Claude sieht den Tag im Zusammenhang.
"""
import argparse
import email
import email.errors
import email.header
import email.policy
import email.utils
import hashlib
import html
import imaplib
import json
import os
import re
import shutil
import ssl
import stat
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DATEN = Path(os.environ.get("STUDIUM_SERVER_DATEN", "/var/lib/studium-server"))
IMAP_HOST = "mailserv.uni-tuebingen.de"
MAX_MAILS = 30           # je Lauf; der Rest kommt beim nächsten
MAX_TEXT = 60_000        # Zeichen je Mail
ERSTE_TAGE = 14          # beim ersten Abruf: Mails der letzten 14 Tage
TAKT_MINUTEN = (15, 30, 60)
SICHERHEIT = (6, 30)     # täglicher Sicherheitslauf ab 06:30 Uhr (Berlin)
NACHLESEN = timedelta(hours=24)
PDF_ANHANG_MAX = 10 * 1024 * 1024     # PDF-Anhang höchstens so groß, sonst nur sein Name
PDF_ANHAENGE_JE_MAIL = 3
PDF_ANHAENGE_JE_ABRUF = 40 * 1024 * 1024  # zusammen je Abruf (Platz auf dem Server, Claudes Kontext)
KALENDER_TERMINE = 40    # Termine aus einem Kalender-Anhang
KALENDER_ZEICHEN = 6_000  # Zeichen je Kalender-Anhang
ANHANG_NAME = 120        # Zeichen eines Anhangnamens im Text
# Grenzen je Tag (Berlin), gegen eine Flut von Mails: Was darüber geht, wartet im Postfach auf einen späteren Tag (wartend in
# abruf-stand.json, mit Zahl), statt verloren zu gehen; eine Mail mit PDF-Anhängen wartet ganz, nie ohne ihre PDFs. Zwei Töpfe
# (topf): Mails der Uni (From unter uni-tuebingen.de, Urteil nicht „fehlgeschlagen“) und alle anderen, damit eine Flut von außen
# die Mails der Uni nicht verdrängt. Ein gewöhnlicher Tag hat einige Dutzend Mails mit wenigen tausend Zeichen.
UNI = "uni-tuebingen.de"
TAG_GRENZEN = {
    # etwa 25 Mails mit der Höchstlänge von 60 000 Zeichen oder einige tausend gewöhnliche
    "uni": {"zeichen": 1_500_000, "pdfs": 40, "pdf_bytes": 300 * 1024 * 1024},
    "andere": {"zeichen": 400_000, "pdfs": 10, "pdf_bytes": 75 * 1024 * 1024},
}
TAG_JE_ABSENDER = 20     # Mails desselben Absenders außerhalb der Uni (Adresse aus From); ILIAS und Rundmails der Uni zählen nicht
PLATZ_MIN = 2 * 1024 ** 3  # freier Platz auf der Platte, unter dem keine PDF mehr gespeichert wird (die Mail wartet dann)
WARTEND_MAX = 2000       # so viele zurückgestellte Mails merkt sich der Abruf; was darüber geht, steht als verworfen im Stand
NEU_PLAETZE = 10         # so viele der MAX_MAILS je Abruf bleiben neuen Mails, auch wenn viele zurückgestellte warten
NEU_GUELTIG_TAGE = 60    # neue UIDVALIDITY: so weit höchstens zurück nach Zurückgestelltem suchen (wartend_seit)
# Vor dem Holen nur die Kopfzeilen, die den Topf bestimmen (topf), damit neue Mails der Uni vor den anderen drankommen; lesend
# (PEEK). Von den neuen höchstens KOEPFE_MAX (die jüngsten), je Befehl KOEPFE_JE_BEFEHL UIDs.
KOEPFE = "(BODY.PEEK[HEADER.FIELDS (FROM AUTHENTICATION-RESULTS RECEIVED)])"
KOEPFE_MAX = 2000
KOEPFE_JE_BEFEHL = 500
VORGEZOGEN_MAX = 2000    # so viele vorgezogene Mails über letzte_uid höchstens; sind es so viele, holt der Abruf wieder nach UID
ALT_NACH = timedelta(hours=24)  # neue Mails, die so lange keinen Platz bekamen, kommen vor den Mails der Uni (halbe Plätze)
MARKEN_MAX = 200


def eigen(*teile):
    """Pfad im eigenen Ordner (abruf/: roh/, abruf-stand.json, uni-zugang-falsch, anstoss)."""
    return DATEN.joinpath("abruf", *teile)


def vom_web(name):
    """Pfad einer Datei des Web-Dienstes (web/takt.json, web/knopf.json)."""
    return DATEN / "web" / name


def jetzt():
    return datetime.now(timezone.utc)


def json_lesen(pfad, ersatz):
    try:
        return json.loads(Path(pfad).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ersatz


def fremd_lesen(pfad, ersatz, hoechstens=64 * 1024):
    """JSON aus einer Datei, die ein anderer Benutzer schreibt (der Web-Dienst): nur eine echte Datei, nie über einen Link
    (O_NOFOLLOW; lstat davor und fstat danach, auch für Systeme ohne O_NOFOLLOW), höchstens hoechstens Bytes."""
    try:
        if not stat.S_ISREG(os.lstat(pfad).st_mode):
            return ersatz
        fd = os.open(pfad, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    except OSError:
        return ersatz
    with os.fdopen(fd, "rb") as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
            return ersatz
        daten = f.read(hoechstens + 1)
    if len(daten) > hoechstens:
        return ersatz
    try:
        return json.loads(daten.decode("utf-8"))
    except ValueError:
        return ersatz


def text_schreiben(pfad, text):
    """Fertig oder gar nicht: über eine Zwischendatei. Der Ordner entsteht bei Bedarf neu (der Claude-Lauf übernimmt roh/ als
    Ganzes, auch während eines Abrufs)."""
    pfad = Path(pfad)
    pfad.parent.mkdir(parents=True, exist_ok=True)
    neu = pfad.with_name(pfad.name + ".neu")
    neu.write_text(text, encoding="utf-8")
    neu.replace(pfad)


def json_schreiben(pfad, daten):
    text_schreiben(pfad, json.dumps(daten, ensure_ascii=False, indent=2))


def bytes_schreiben(pfad, daten):
    """Wie text_schreiben, für Bytes (PDF-Anhänge)."""
    pfad = Path(pfad)
    pfad.parent.mkdir(parents=True, exist_ok=True)
    neu = pfad.with_name(pfad.name + ".neu")
    neu.write_bytes(daten)
    neu.replace(pfad)


# ---------- Uni-Postfach ----------

ZEILENBRUCH = re.compile("[\x00-\x1f\x7f\x85\N{LINE SEPARATOR}\N{PARAGRAPH SEPARATOR}]+")


def kopf(nachricht, name):
    """Wert einer Kopfzeile als eine Zeile: Auch ein dekodierter Betreff (RFC 2047) bringt keinen Zeilenumbruch mit, sonst stünde
    darin eine eigene Zeile wie „Von: …“ vor dem echten Absender."""
    wert = nachricht.get(name, "")
    try:
        text = str(email.header.make_header(email.header.decode_header(str(wert))))
    except (ValueError, LookupError):
        text = str(wert)
    return ZEILENBRUCH.sub(" ", text).strip()


DOMAIN = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")
DATUM = re.compile(r"^\d{4}-\d{2}-\d{2}$")


NAME_OK = (email.errors.ObsoleteHeaderDefect, email.errors.UndecodableBytesDefect, email.errors.CharsetError)


def absender(nachricht):
    """Adresse (klein) und Domain aus From, wie die Mail sie angibt (nicht geprüft) → (adresse, domain); ohne gültige Adresse ("", "").
    Gelesen wie ein Mailserver: aus dem geparsten Kopf (addresses), nie aus dem dekodierten Text (ein kodiertes Wort
    „=?utf-8?q?prof=40uni-tuebingen=2Ede?=“ ist ein Name, keine Adresse). Genau eine Kopfzeile From mit genau einer Adresse,
    ohne Fehler beim Parsen, sonst keine Adresse. Kein Fehler sind veraltete Formen (ein Punkt im Namen) und ein Name mit rohen
    8-Bit-Zeichen oder unbekanntem Zeichensatz („Müller, Hans“ ohne Kodierung, wie manche Mailprogramme schicken): Die Adresse
    selbst muss dann aus druckbaren ASCII-Zeichen bestehen."""
    alle = nachricht.get_all("From") or []
    adressen = getattr(alle[0], "addresses", None) if len(alle) == 1 else None
    fehler = [d for d in getattr(alle[0], "defects", ()) if not isinstance(d, NAME_OK)] if adressen is not None else [True]
    if fehler or len(adressen) != 1:
        return ("", "")
    name, domain = adressen[0].username.strip().lower(), adressen[0].domain.strip().lower()
    if not (name.isascii() and name.isprintable() and domain.isascii()):
        return ("", "")
    return (f"{name}@{domain}", domain) if name and "@" not in name and DOMAIN.match(domain) else ("", "")


def in_domain(domain, basis):
    return bool(domain) and (domain == basis or domain.endswith("." + basis))


AUTHSERV = "uni-tuebingen.de"


def authentifiziert(nachricht, domain):
    """Urteil über den Absender aus der Kopfzeile Authentication-Results (RFC 8601), die der Mailserver der Uni beim Zustellen setzt:
    Sie zählt nur, wenn sie über jeder Kopfzeile Received steht (beim Zustellen hinzugefügt; eine Kopfzeile, die der Absender selbst
    mitschickt, steht immer unter den Received-Zeilen der Uni) und ihre Kennung (authserv-id) auf uni-tuebingen.de endet; von
    mehreren solchen die oberste. pass bei dmarc=pass mit header.from gleich der Domain aus From oder bei dkim=pass mit header.d gleich
    dieser Domain oder einer Subdomain davon; fehlgeschlagen auch bei dmarc=pass für eine andere Domain als die aus From; fehlgeschlagen bei dkim=fail oder dmarc=fail; sonst unbekannt (auch ohne passende Kopfzeile). Setzt der Mailserver der Uni
    sie nicht oder an anderer Stelle, ist jedes Urteil „unbekannt“; dann stuft nichts herab."""
    gueltig = None
    for name, wert in nachricht.items():
        if name.lower() == "received":
            break
        if name.lower() != "authentication-results":
            continue
        text = re.sub(r"\([^()]*\)", " ", ZEILENBRUCH.sub(" ", str(wert)).lower())
        kennung = (text.split(";")[0].split() or [""])[0].strip(".")
        if in_domain(kennung, AUTHSERV):
            gueltig = text
            break
    if gueltig is None:
        return "unbekannt"
    ergebnisse = []
    for teil in gueltig.split(";")[1:]:
        m = re.match(r"\s*([a-z0-9_-]+)\s*=\s*([a-z]+)", teil)
        if m:
            d = re.search(r"\bheader\.(?:d|from)\s*=\s*\"?([a-z0-9.-]+)", teil)
            ergebnisse.append((m.group(1), m.group(2), d.group(1).strip(".") if d else ""))
    # dmarc=pass nur für die Domain aus From, wie dieses Skript sie liest (header.from gleich). Nennt header.from eine andere Domain,
    # liest der Mailserver From anders als dieses Skript: Dann ist die Domain hier nicht geprüft, und die Mail gilt als nicht bestätigt
    if any(art == "dmarc" and wert == "pass" and d and d != domain for art, wert, d in ergebnisse):
        return "fehlgeschlagen"
    if any(art == "dmarc" and wert == "pass" and domain and d == domain for art, wert, d in ergebnisse):
        return "pass"
    if any(art == "dkim" and wert == "pass" and in_domain(d, domain) for art, wert, d in ergebnisse):
        return "pass"
    if any(art in ("dkim", "dmarc") and wert == "fail" for art, wert, _ in ergebnisse):
        return "fehlgeschlagen"
    return "unbekannt"


def html_zu_text(s):
    s = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s)


def anhang_name(name):
    """Name eines Anhangs für den Text: eine Zeile, ohne Steuerzeichen, gekürzt (kommt von außen)."""
    return ZEILENBRUCH.sub(" ", str(name)).strip()[:ANHANG_NAME] or "Anhang"


def kalender_text(daten):
    """Kalender-Anhang (.ics) → eine Zeile je Termin: Titel | Beginn | Ende | Ort. Beginn und Ende wie in der Datei, mit Zeitzone
    davor (TZID=…:20261105T101500) oder Z für UTC. Gefaltete Zeilen (RFC 5545) werden zusammengesetzt."""
    text = daten.decode("utf-8", errors="replace") if isinstance(daten, bytes) else str(daten)
    text = re.sub(r"\r?\n[ \t]", "", text)
    termine, akt = [], None
    for zeile in text.splitlines():
        zeile = zeile.strip()
        if zeile.upper() == "BEGIN:VEVENT":
            akt = {}
        elif zeile.upper() == "END:VEVENT":
            if akt and (akt.get("SUMMARY") or akt.get("DTSTART")):
                termine.append(akt)
            akt = None
        elif akt is not None and ":" in zeile:
            name, wert = zeile.split(":", 1)
            feld, _, parameter = name.partition(";")
            feld = feld.upper()
            if feld in ("SUMMARY", "DTSTART", "DTEND", "LOCATION") and feld not in akt:
                wert = wert.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").strip()
                if feld in ("DTSTART", "DTEND") and parameter:
                    wert = f"{parameter}:{wert}"
                akt[feld] = anhang_name(wert)
    zeilen = [" | ".join(t.get(f, "") for f in ("SUMMARY", "DTSTART", "DTEND", "LOCATION")) for t in termine[:KALENDER_TERMINE]]
    return "\n".join(zeilen)[:KALENDER_ZEICHEN]


def anhang_art(name, art, daten):
    """pdf | kalender | "" (alles andere: nur der Name)."""
    n = str(name).lower()
    if (art == "application/pdf" or n.endswith(".pdf")) and daten.startswith(b"%PDF-"):
        return "pdf"
    if art == "text/calendar" or n.endswith(".ics"):
        return "kalender"
    return ""


def mail_text(roh_bytes, pdf_ablegen=None):
    """Mail → kurzer Text (Betreff, Absender, Datum, Domain des Absenders und ob sie bestätigt ist, Text, Anhänge). Die Zeilen
    bis zur ersten Leerzeile kommen nur aus Kopfzeilen (je eine Zeile, kopf), darum liest lauf.mjs Domain und Urteil dort ab.
    Kalender-Anhänge stehen als Zeilen im Text. Einen PDF-Anhang gibt der Text an pdf_ablegen(Bytes) → Pfad im Lauf-Ordner oder
    None (zu groß, mehr als PDF_ANHAENGE_JE_MAIL); ohne pdf_ablegen und bei None steht nur sein Name da, wie bei allen anderen
    Anhängen. Die Grenzen des Tages prüft uni_postfach vorher (pdf_groessen): Eine Mail darüber wartet ganz."""
    n = email.message_from_bytes(roh_bytes, policy=email.policy.default)
    teile, namen, pdfs, kalender = [], [], [], []
    for teil in n.walk():
        if teil.is_multipart():
            continue
        name = teil.get_filename()
        art = teil.get_content_type()
        if name or teil.get_content_disposition() == "attachment":
            name = anhang_name(name or art)
            try:
                daten = teil.get_payload(decode=True) or b""
            except (LookupError, ValueError):
                daten = b""
            welche = anhang_art(name, art, daten)
            pfad = pdf_ablegen(daten) if welche == "pdf" and pdf_ablegen else None
            if pfad:
                pdfs.append(f"- {name} ({max(1, len(daten) // 1024)} KB): {pfad}")
            elif welche == "kalender" and len(kalender) < 3:
                kalender.append(f"Kalender {name}:\n" + (kalender_text(daten) or "(keine Termine)"))
            else:
                namen.append(name)
            continue
        if art not in ("text/plain", "text/html"):
            continue
        try:
            inhalt = teil.get_content()
        except (LookupError, ValueError):
            inhalt = (teil.get_payload(decode=True) or b"").decode("utf-8", errors="replace")
        teile.append((art, inhalt))
    text = next((t for a, t in teile if a == "text/plain"), "") or next((html_zu_text(t) for a, t in teile if a == "text/html"), "")
    text = re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()[:MAX_TEXT]
    domain = absender(n)[1]
    zeilen = [f"Betreff: {kopf(n, 'Subject')}", f"Von: {kopf(n, 'From')}", f"Datum: {kopf(n, 'Date')}",
              f"Absender-Domain: {domain or '–'}", f"Authentifiziert: {authentifiziert(n, domain)}"]
    if namen:
        zeilen.append("Anhänge: " + ", ".join(namen[:20]))
    ende = ""
    if pdfs:
        ende += "\n\nPDF-Anhänge (nur lesen, wenn sie nach Terminen aussehen):\n" + "\n".join(pdfs)
    if kalender:
        ende += "\n\nKalender-Anhänge (Titel | Beginn | Ende | Ort):\n" + "\n\n".join(kalender)
    return "\n".join(zeilen) + "\n\n" + text + ende + "\n"


def platz_frei():
    """Freier Platz im Ordner des Abrufs in Bytes (0, wenn er sich nicht bestimmen lässt: dann keine PDF)."""
    try:
        return shutil.disk_usage(eigen()).free
    except OSError:
        return 0


def pdf_ablage(ordner, stamm, rest):
    """Ablage für die PDF-Anhänge einer Mail: höchstens PDF_ANHAENGE_JE_MAIL, je bis PDF_ANHANG_MAX, zusammen bis rest["bytes"]
    (je Abruf); stamm: Name der Mail ohne .txt. → Funktion Bytes → Pfad im Lauf-Ordner (roh/uni-postfach/<stamm>-anhang-<n>.pdf) oder None."""
    nr = [0]

    def ablegen(daten):
        if nr[0] >= PDF_ANHAENGE_JE_MAIL or len(daten) > PDF_ANHANG_MAX or len(daten) > rest["bytes"]:
            return None
        nr[0] += 1
        name = f"{stamm}-anhang-{nr[0]}.pdf"
        bytes_schreiben(ordner / name, daten)
        rest["bytes"] -= len(daten)
        return f"roh/uni-postfach/{name}"
    return ablegen


def pdf_groessen(nachricht):
    """Größen der PDF-Anhänge, die mail_text mit pdf_ablage ablegen würde (die ersten PDF_ANHAENGE_JE_MAIL bis PDF_ANHANG_MAX)."""
    groessen = []
    for teil in nachricht.walk():
        name = teil.get_filename()
        if teil.is_multipart() or not (name or teil.get_content_disposition() == "attachment"):
            continue
        try:
            daten = teil.get_payload(decode=True) or b""
        except (LookupError, ValueError):
            daten = b""
        art = teil.get_content_type()
        if anhang_art(anhang_name(name or art), art, daten) == "pdf" and len(daten) <= PDF_ANHANG_MAX and len(groessen) < PDF_ANHAENGE_JE_MAIL:
            groessen.append(len(daten))
    return groessen

class AnmeldungAbgelehnt(Exception):
    pass


def tls_kontext():
    """TLS für das Uni-Postfach: Zertifikat und Hostname geprüft (CERT_REQUIRED, check_hostname, Zertifikate des Systems),
    mindestens TLS 1.2. Ohne eigenen Kontext nimmt imaplib.IMAP4_SSL ssl._create_stdlib_context, und das ist ein Kontext ohne
    jede Prüfung: Wer sich ins Netz dazwischen setzt, bekäme das Uni-Passwort."""
    kontext = ssl.create_default_context()
    kontext.minimum_version = max(kontext.minimum_version, ssl.TLSVersion.TLSv1_2)
    return kontext


def uid_gueltigkeit(imap):
    """UIDVALIDITY des ausgewählten Postfachs: aus der Antwort auf EXAMINE, sonst per STATUS."""
    _, daten = imap.response("UIDVALIDITY")
    wert = daten[0] if daten and daten[0] else None
    if not wert:
        _, st = imap.status("INBOX", "(UIDVALIDITY)")
        m = re.search(rb"UIDVALIDITY (\d+)", st[0] if st and isinstance(st[0], bytes) else b"")
        wert = m.group(1) if m else b"0"
    return wert.decode() if isinstance(wert, bytes) else str(wert)


def zeit_lesen(text):
    try:
        z = datetime.fromisoformat(str(text))
    except ValueError:
        return None
    return z if z.tzinfo else z.replace(tzinfo=timezone.utc)


def berlin(zeit):
    try:
        return zeit.astimezone(ZoneInfo("Europe/Berlin"))
    except ZoneInfoNotFoundError:
        # ohne Zeitzonendaten: MEZ/MESZ nach der EU-Regel (Sommerzeit vom letzten Sonntag im März bis zum letzten Sonntag im
        # Oktober, jeweils 01:00 UTC)
        u = zeit.astimezone(timezone.utc)

        def letzter_sonntag(monat):
            d = datetime(u.year, monat, 31, 1, tzinfo=timezone.utc)
            return d - timedelta(days=(d.weekday() + 1) % 7)
        sommer = letzter_sonntag(3) <= u < letzter_sonntag(10)
        return u.astimezone(timezone(timedelta(hours=2 if sommer else 1)))


def tageszaehler(stand, nun):
    """Zähler des Tages (Berlin) in stand["tag"]: je Topf (TAG_GRENZEN) zeichen, pdfs, pdf_bytes; absender (Kurz-Hash der Adresse →
    Zahl, nie die Adresse selbst, nur außerhalb der Uni), zurueckgestellt (auf einen späteren Tag), verschoben (auf den nächsten
    Abruf), verworfen; an einem neuen Tag von vorn (ebenso ein Stand einer früheren Fassung ohne Töpfe)."""
    heute = berlin(nun).date().isoformat()
    t = stand.get("tag")
    if not isinstance(t, dict) or t.get("datum") != heute or not all(isinstance(t.get(k), dict) for k in TAG_GRENZEN):
        t = {"datum": heute, **{k: {"zeichen": 0, "pdfs": 0, "pdf_bytes": 0} for k in TAG_GRENZEN}, "absender": {}, "zurueckgestellt": 0,
             "verschoben": 0, "verworfen": 0}
        stand["tag"] = t
    return t


def topf(nachricht):
    """Topf für die Grenzen des Tages: uni (From unter uni-tuebingen.de, Urteil nicht „fehlgeschlagen“) oder andere. Ohne Urteil der
    Uni (unbekannt) zählt die Domain, die die Mail angibt: Die Trennung ist nur so stark wie das Urteil."""
    domain = absender(nachricht)[1]
    return "uni" if in_domain(domain, UNI) and authentifiziert(nachricht, domain) != "fehlgeschlagen" else "andere"


def uid_zahl(w):
    """UID aus dem Stand: Zahl ab 0 (auch als Text aus Ziffern 0-9) → int, sonst None"""
    if isinstance(w, int) and not isinstance(w, bool):
        return w if w >= 0 else None
    return int(w) if isinstance(w, str) and w.isascii() and w.isdigit() else None


def wartend_lesen(alt):
    """Zurückgestellte Mails aus dem Stand → {UID: {ab, topf, wer, zeichen, pdfs, bytes}}. ab: ab diesem Tag (Berlin) wieder dran;
    topf und wer (Kurz-Hash des Absenders), zeichen, pdfs und bytes (ihre PDF-Anhänge): was beim Zurückstellen von ihr bekannt war,
    damit der Abruf sie nicht holt, solange sie ohnehin nicht passt (tag_voll). Ein Eintrag einer früheren Fassung („ab“ oder
    „ab:topf“) hat davon nichts und wird geholt."""
    w = alt.get("wartend")
    aus = {}
    for u, d in (w.items() if isinstance(w, dict) else []):
        if uid_zahl(u) is None:
            continue
        if isinstance(d, str):
            ab, _, t = d.partition(":")
            d = {"ab": ab, "topf": t}
        if not isinstance(d, dict) or not isinstance(d.get("ab"), str):
            continue
        aus[int(u)] = {"ab": d["ab"], "topf": d.get("topf") if d.get("topf") in TAG_GRENZEN else "", "wer": d["wer"] if isinstance(d.get("wer"), str) else "",
                       **{k: d[k] if isinstance(d.get(k), int) and d[k] >= 0 else 0 for k in ("zeichen", "pdfs", "bytes")}}
    return aus


def tag_voll(tag, w):
    """Überschritte die zurückgestellte Mail w eine Grenze des Tages, die für sie gilt (Zeichen, PDFs, MB ihres Topfs, je Absender
    außerhalb der Uni)? Nach dem, was beim Zurückstellen von ihr bekannt war; ohne Topf (frühere Fassung) nie."""
    t = w["topf"]
    if not t:
        return False
    g = TAG_GRENZEN[t]
    return (tag[t]["zeichen"] + w["zeichen"] > g["zeichen"] or (w["pdfs"] and (tag[t]["pdfs"] + w["pdfs"] > g["pdfs"]
            or tag[t]["pdf_bytes"] + w["bytes"] > g["pdf_bytes"])) or (t == "andere" and tag["absender"].get(w["wer"], 0) >= TAG_JE_ABSENDER))


def uni_zuerst(imap, uids):
    """Die neuen UIDs in der Reihenfolge, in der der Abruf sie holt: erst die, deren Kopfzeilen (KOEPFE) den Topf uni ergeben, dann
    alle anderen, beide nach UID. Liest nur die Kopfzeilen der jüngsten KOEPFE_MAX; was ohne Antwort bleibt, zählt als andere.
    Ob Authentication-Results über Received steht, sagt hier die Reihenfolge, in der der Server die Kopfzeilen liefert; das
    entscheidet nur, was zuerst drankommt. Beim Holen bestimmt der ganze Kopf den Topf noch einmal, für die Grenzen zählt nur der."""
    uni = set()
    koepfe = uids[-KOEPFE_MAX:]
    for i in range(0, len(koepfe), KOEPFE_JE_BEFEHL):
        teil = set(koepfe[i:i + KOEPFE_JE_BEFEHL])
        typ, d = imap.uid("FETCH", ",".join(str(u) for u in sorted(teil)), KOEPFE)
        if typ != "OK" or not d:
            continue
        for j, e in enumerate(d):
            if not isinstance(e, tuple) or len(e) < 2:
                continue
            # UID steht vor dem Literal oder (je nach Server) danach, im nächsten Teil der Antwort
            nach = d[j + 1] if j + 1 < len(d) and isinstance(d[j + 1], bytes) else b""
            m = re.search(rb"\bUID (\d+)", e[0] + b" " + nach)
            if m and int(m.group(1)) in teil and topf(email.message_from_bytes(e[1], policy=email.policy.default)) == "uni":
                uni.add(int(m.group(1)))
    return [u for u in uids if u in uni] + [u for u in uids if u not in uni]


def absender_schluessel(nachricht):
    adresse = absender(nachricht)[0] or kopf(nachricht, "From").lower()
    return hashlib.sha256(adresse.encode("utf-8", "replace")).hexdigest()[:12]


def takt_minuten():
    t = fremd_lesen(vom_web("takt.json"), {})
    m = t.get("uni_postfach") if isinstance(t, dict) else None
    return m if m in TAKT_MINUTEN else TAKT_MINUTEN[0]


def nachlesen_dran(stand, nun):
    """Sicherheitslauf: heute (Berlin) ab 06:30 noch nicht gelaufen. Nie beim ersten Abruf (der holt ohnehin 14 Tage)."""
    b = berlin(nun)
    return bool(stand.get("uni_postfach")) and (b.hour, b.minute) >= SICHERHEIT and stand.get("nachgelesen") != b.date().isoformat()


def takt_dran(stand, nun):
    """Uni-Postfach laut Takt dran? Mit 3 Minuten Spielraum (der Zeitgeber streut um eine Minute); ein Tipp auf „Mails durchsuchen“
    seit dem letzten Blick zählt immer."""
    takt = takt_minuten()
    zuletzt = zeit_lesen(stand.get("zuletzt", ""))
    if takt == TAKT_MINUTEN[0] or not zuletzt:
        return True
    k = fremd_lesen(vom_web("knopf.json"), {})
    knopf = zeit_lesen(k.get("zuletzt", "")) if isinstance(k, dict) else None
    if knopf and knopf > zuletzt:
        return True
    return nun - zuletzt >= timedelta(minutes=takt - 3)


def marken_lesen(alt):
    """Marken [UID, Zeit]: Zur Zeit lagen alle Mails bis zu dieser UID schon im Postfach (für ALT_NACH)"""
    aus = []
    for m in alt.get("marken", []) if isinstance(alt.get("marken"), list) else []:
        if isinstance(m, list) and len(m) == 2 and uid_zahl(m[0]) is not None and zeit_lesen(m[1]):
            aus.append((uid_zahl(m[0]), zeit_lesen(m[1])))
    return aus


def uni_postfach(stand, roh, zugang, imap_klasse=imaplib.IMAP4_SSL, nachlesen=False):
    """Neue Mails seit der letzten UID nach abruf/roh/uni-postfach/; beim Sicherheitslauf (nachlesen) dazu die der letzten 24 Stunden.
    Zurückgestellte Mails (wartend) kommen vor den neuen dran, aber NEU_PLAETZE der MAX_MAILS bleiben den neuen; eine, für die eine
    Grenze des Tages schon erreicht ist (tag_voll), gleich auf morgen, ohne sie zu holen. In beiden Gruppen die Mails der Uni zuerst
    (uni_zuerst): Eine Flut von außen schiebt eine neue Mail der Uni nicht nach hinten. Neue, die dabei keinen Platz bekommen, holt
    der nächste Abruf: letzte_uid bleibt unter der ersten davon, vorgezogen merkt die schon geholten darüber (höchstens
    VORGEZOGEN_MAX, dann wieder nach UID). Damit keine dabei liegen bleibt, kommen neue, die seit ALT_NACH keinen Platz bekamen
    (nach den marken), auf der Hälfte der Plätze vor denen der Uni.
    Grenzen je Tag (TAG_GRENZEN, TAG_JE_ABSENDER): Eine Mail darüber bleibt im Postfach und wartet auf morgen; passt nur ihre PDF
    nicht in den Rest dieses Abrufs oder liegt zu wenig Platz frei, auf den nächsten Abruf. Nur Neues zählt für die Meldung
    „Mail(s)“ (Anstoß). Neue UIDVALIDITY: Die gemerkten UIDs gelten nicht mehr; die Suche geht dann so weit zurück wie das älteste
    Zurückgestellte (wartend_seit, höchstens NEU_GUELTIG_TAGE), und was seitdem kam, kommt noch einmal (Doppel erkennt der Lauf).
    → Meldung oder None."""
    if eigen("uni-zugang-falsch").exists():
        return "Uni-Postfach: übersprungen, Zugang wurde abgelehnt (neu setzen in der Cloud Shell: bash ~/studium-autopilot/server/fern.sh uni-zugang setzen)"
    try:
        imap = imap_klasse(IMAP_HOST, 993, ssl_context=tls_kontext(), timeout=60)
    except (OSError, imaplib.IMAP4.error) as e:
        # auch ein Zertifikat, das nicht passt (ssl.SSLCertVerificationError ist ein OSError): dann geht kein Passwort raus
        return f"Uni-Postfach: nicht erreichbar ({type(e).__name__})"
    try:
        try:
            imap.login(zugang["username"], zugang["password"])
        except imaplib.IMAP4.error as e:
            raise AnmeldungAbgelehnt() from e
        typ, _ = imap.select("INBOX", readonly=True)
        if typ != "OK":
            return "Uni-Postfach: Posteingang nicht lesbar"
        gueltig = uid_gueltigkeit(imap)
        # Dateiname <UIDVALIDITY>-<UID>: eindeutig, auch wenn das Postfach seine UIDs neu vergibt (Fehlschläge und Quarantäne im Lauf
        # hängen am Namen)
        kennung = re.sub(r"\D", "", gueltig)[:20] or "0"
        alt = stand.get("uni_postfach") if isinstance(stand.get("uni_postfach"), dict) else {}
        gleich = alt.get("uidvalidity") == gueltig
        nun = jetzt()
        tag = tageszaehler(stand, nun)
        heute, morgen = tag["datum"], (berlin(nun).date() + timedelta(days=1)).isoformat()
        wartend = wartend_lesen(alt) if gleich else {}
        seit_wartend = alt.get("wartend_seit") if isinstance(alt.get("wartend_seit"), str) and DATUM.match(alt["wartend_seit"]) else ""
        # ein unlesbarer Stand beginnt wie ein erster Abruf (Doppel erkennt der Lauf)
        letzte = (uid_zahl(alt.get("letzte_uid")) or 0) if gleich else 0
        vorgezogen = {uid_zahl(u) for u in alt["vorgezogen"]} if gleich and isinstance(alt.get("vorgezogen"), list) else set()
        vorgezogen = {u for u in vorgezogen if u is not None and u > letzte}
        marken = marken_lesen(alt) if gleich else []
        if gleich and letzte:
            typ, daten = imap.uid("SEARCH", None, f"UID {letzte + 1}:*")
        else:
            tage = ERSTE_TAGE
            if alt.get("uidvalidity") and not gleich and seit_wartend:
                tage = min(NEU_GUELTIG_TAGE, max(ERSTE_TAGE, (berlin(nun).date() - datetime.fromisoformat(seit_wartend).date()).days + 1))
            seit = (nun - timedelta(days=tage)).strftime("%d-%b-%Y")
            typ, daten = imap.uid("SEARCH", None, f"SINCE {seit}")
        uids = sorted({int(u) for u in (daten[0] or b"").split()} if typ == "OK" and daten else set())
        uids = [u for u in uids if u > letzte and u not in wartend and u not in vorgezogen]
        vorrat = []
        for u in sorted(wartend):
            if wartend[u]["ab"] > heute:
                continue
            if tag_voll(tag, wartend[u]):
                wartend[u]["ab"] = morgen  # passt heute ohnehin nicht: morgen, ohne sie zu holen
                continue
            vorrat.append(u)
        vorrat.sort(key=lambda u: wartend[u]["topf"] != "uni")
        nochmal = []
        if nachlesen:
            # SINCE kennt nur Tage: gestern und heute, dann nach dem Datum der Mail die letzten 24 Stunden
            seit = (nun - NACHLESEN).strftime("%d-%b-%Y")
            typ, daten = imap.uid("SEARCH", None, f"SINCE {seit}")
            gesehen = set(uids) | set(wartend)
            nochmal = sorted({int(u) for u in (daten[0] or b"").split()} - gesehen if typ == "OK" and daten else set())[-MAX_MAILS:]
        vorrat_dran = vorrat[:MAX_MAILS - min(len(uids), NEU_PLAETZE)]
        plaetze = MAX_MAILS - len(vorrat_dran)
        if len(uids) <= plaetze or len(vorgezogen) + plaetze > VORGEZOGEN_MAX:
            # alle haben Platz (dann ist die Reihenfolge gleich), oder schon zu viele vorgezogen: nach UID
            reihe = uids
        else:
            alt_bis = max((u for u, z in marken if z <= nun - ALT_NACH), default=0)
            alte = [u for u in uids if u <= alt_bis][:plaetze // 2]
            reihe = alte + uni_zuerst(imap, [u for u in uids if u not in set(alte)])
        neu_dran = reihe[:plaetze]
        offen = set(uids) - set(neu_dran)
        # ohne offene ist alles über letzte_uid geholt, auch die schon vorgezogenen
        neu_letzte = min(offen) - 1 if offen else max(set(uids) | vorgezogen, default=letzte)
        ordner = roh / "uni-postfach"
        geholt = wieder = zurueck = verschoben = 0
        rest = {"bytes": PDF_ANHAENGE_JE_ABRUF}

        def warten(uid, ab, w):
            """→ 1, wenn die Mail damit neu (oder auf einen anderen Tag) wartet; gezählt wird je Tag einmal"""
            neu = wartend.get(uid, {}).get("ab") != ab
            wartend[uid] = {**w, "ab": ab}
            return 1 if neu else 0

        for uid in vorrat_dran + neu_dran:
            if uid in wartend and tag_voll(tag, wartend[uid]):
                # inzwischen voll (andere dieses Abrufs): morgen, ohne sie zu holen
                z = warten(uid, morgen, wartend[uid])
                tag["zurueckgestellt"] += z
                zurueck += z
                continue
            typ, d = imap.uid("FETCH", str(uid), "(BODY.PEEK[])")
            if typ != "OK" or not d or not isinstance(d[0], tuple):
                wartend.pop(uid, None)  # nicht mehr im Postfach
                continue
            n = email.message_from_bytes(d[0][1], policy=email.policy.default)
            t, wer = topf(n), absender_schluessel(n)
            pdfs = pdf_groessen(n)
            w = {"topf": t, "wer": wer if t == "andere" else "", "zeichen": len(mail_text(d[0][1])), "pdfs": len(pdfs), "bytes": sum(pdfs)}
            if tag_voll(tag, w):
                # Grenze des Tages: wartet ganz (mit ihren PDFs) auf morgen, im Postfach bleibt sie ohnehin
                z = warten(uid, morgen, w)
                tag["zurueckgestellt"] += z
                zurueck += z
                continue
            if pdfs and (sum(pdfs) > rest["bytes"] or platz_frei() - sum(pdfs) < PLATZ_MIN):
                # PDFs passen nicht mehr in diesen Abruf oder auf die Platte: die ganze Mail beim nächsten Abruf
                z = warten(uid, heute, w)
                tag["verschoben"] += z
                verschoben += z
                continue
            text = mail_text(d[0][1], pdf_ablage(ordner, f"{kennung}-{uid}", rest))
            text_schreiben(ordner / f"{kennung}-{uid}.txt", text)
            tag[t]["zeichen"] += len(text)
            tag[t]["pdfs"] += len(pdfs)
            tag[t]["pdf_bytes"] += sum(pdfs)
            if t == "andere":
                tag["absender"][wer] = tag["absender"].get(wer, 0) + 1
            wartend.pop(uid, None)
            geholt += 1
        # Nachlesen (Sicherheitslauf): diese Mails kamen schon einmal, samt ihren PDF-Anhängen; jetzt nur der Text, und nur, solange
        # die Grenze für Zeichen ihres Topfs es zulässt
        for uid in nochmal:
            typ, d = imap.uid("FETCH", str(uid), "(BODY.PEEK[])")
            if typ != "OK" or not d or not isinstance(d[0], tuple):
                continue
            n = email.message_from_bytes(d[0][1], policy=email.policy.default)
            try:
                datum = email.utils.parsedate_to_datetime(str(n.get("Date", "")))
            except (TypeError, ValueError):
                datum = None
            if datum and (datum if datum.tzinfo else datum.replace(tzinfo=timezone.utc)) < nun - NACHLESEN:
                continue
            text, t = mail_text(d[0][1]), topf(n)
            if tag[t]["zeichen"] + len(text) > TAG_GRENZEN[t]["zeichen"]:
                continue
            text_schreiben(ordner / f"{kennung}-{uid}.txt", text)
            tag[t]["zeichen"] += len(text)
            wieder += 1
        # höchstens WARTEND_MAX gemerkt; was darüber geht (die ältesten), zählt als verworfen
        zu_viele = sorted(wartend)[:max(0, len(wartend) - WARTEND_MAX)]
        for uid in zu_viele:
            del wartend[uid]
        tag["verworfen"] += len(zu_viele)
        stand["uni_postfach"] = {"uidvalidity": gueltig, "letzte_uid": neu_letzte}
        vorgezogen = sorted(u for u in vorgezogen | set(neu_dran) if u > neu_letzte)
        if vorgezogen:
            stand["uni_postfach"]["vorgezogen"] = vorgezogen
        if offen:
            # Marken nur, solange neue warten: die jüngste vor ALT_NACH und alle danach, dazu eine für jetzt
            hoechste = max(set(uids) | set(vorgezogen))
            vorher = [m for m in marken if m[1] <= nun - ALT_NACH][-1:]
            danach = [m for m in marken if m[1] > nun - ALT_NACH]
            if not (vorher + danach) or (vorher + danach)[-1][0] < hoechste:
                danach.append((hoechste, nun))
            marken = vorher + danach[-(MARKEN_MAX - 1):]
            stand["uni_postfach"]["marken"] = [[u, z.isoformat(timespec="seconds")] for u, z in marken]
        if wartend:
            stand["uni_postfach"]["wartend"] = {str(u): wartend[u] for u in sorted(wartend)}
            stand["uni_postfach"]["wartend_seit"] = min(seit_wartend or heute, heute)
        teile = ([f"{geholt} neue Mail(s)"] if geholt else []) + ([f"{wieder} Mail(s) der letzten 24 Stunden zum Nachlesen"] if wieder else [])
        teile += [f"{zurueck} wegen der Grenze für heute auf einen späteren Tag zurückgestellt"] if zurueck else []
        teile += [f"{verschoben} mit PDF-Anhängen auf den nächsten Abruf verschoben (Grenze je Abruf oder zu wenig Platz)"] if verschoben else []
        teile += [f"{len(zu_viele)} zurückgestellte nicht mehr gemerkt (über {WARTEND_MAX})"] if zu_viele else []
        return "Uni-Postfach: " + ", ".join(teile) if teile else None
    except AnmeldungAbgelehnt:
        eigen("uni-zugang-falsch").write_text(jetzt().isoformat() + "\n", encoding="utf-8")
        return "Uni-Postfach: Anmeldung abgelehnt, keine weiteren Versuche bis zum neuen Zugang"
    except (OSError, imaplib.IMAP4.error) as e:
        return f"Uni-Postfach: abgebrochen ({type(e).__name__})"
    finally:
        try:
            imap.logout()
        except (OSError, imaplib.IMAP4.error):
            pass

def zugang_parsen(text):
    """Uni-Zugang aus JSON (studium-server uni-zugang setzen) oder aus Zeilen username=…/password=…."""
    try:
        daten = json.loads(text)
    except ValueError:
        daten = dict(z.split("=", 1) for z in text.splitlines() if "=" in z)
    if not isinstance(daten, dict):
        return None
    daten = {k.strip(): str(v).strip() for k, v in daten.items()}
    return daten if daten.get("username") and daten.get("password") else None


def zugang_laden(name="uni-zugang"):
    ordner = os.environ.get("CREDENTIALS_DIRECTORY")
    if not ordner:
        return None
    try:
        return zugang_parsen((Path(ordner) / name).read_text(encoding="utf-8"))
    except OSError:
        return None


# ---------- Ablauf ----------

def abrufen(imap_klasse=imaplib.IMAP4_SSL, zugang=None):
    roh = eigen("roh")
    roh.mkdir(parents=True, exist_ok=True)
    stand_datei = eigen("abruf-stand.json")
    stand = json_lesen(stand_datei, {})
    nun = jetzt()
    nachlesen = nachlesen_dran(stand, nun)
    if not nachlesen and not takt_dran(stand, nun):
        return []
    z = zugang if zugang is not None else zugang_laden()
    meldungen = [m for m in [uni_postfach(stand, roh, z, imap_klasse, nachlesen) if z else "Uni-Postfach: kein Uni-Zugang geladen"] if m]
    stand["zuletzt"] = nun.isoformat()
    if z and not stand.get("nachgelesen"):
        stand["nachgelesen"] = berlin(nun).date().isoformat()  # erster Abruf: heute kein Sicherheitslauf mehr
    if nachlesen:
        stand["nachgelesen"] = berlin(nun).date().isoformat()
    json_schreiben(stand_datei, stand)
    neu = [m for m in meldungen if "Mail(s)" in m]
    if neu:
        index = roh / "INDEX.md"
        alt = index.read_text(encoding="utf-8") if index.exists() else "# Neu seit dem letzten Lauf\n"
        text_schreiben(index, alt + "".join(f"- {nun.strftime('%d.%m.%Y %H:%M')} UTC: {m}\n" for m in neu))
    if neu or (nachlesen and z):
        json_schreiben(eigen("anstoss"), {"zeit": nun.isoformat(), "grund": "taeglich" if nachlesen else "quellen", "meldungen": neu})
    return meldungen


def main(argv=None):
    argparse.ArgumentParser(description=__doc__.split("\n\n")[0]).parse_args(argv)
    for m in abrufen():
        print(m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
