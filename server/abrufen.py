#!/usr/bin/env python3
"""Abruf ohne KI für den eigenen Server von Studium Autopilot (server/README.md): das Uni-Postfach.

Holt neue Mails, legt sie als Text nach abruf/roh/ und schreibt dann den Anstoß für den Claude-Lauf (abruf/anstoss, lauf.mjs). Nur
Standardbibliothek. Läuft als eigener Benutzer (studium-abruf) und schreibt nur in seinen Ordner abruf/; den Takt und den Knopf
(takt.json, knopf.json) liest es aus dem Ordner des Web-Dienstes (web/), nur als echte Datei, nie über einen Link. Termine aus dem ILIAS-Kalender holt das Plugin selbst, ohne KI; der Server gibt Claude nur, wofür es KI
braucht (Mails).

Anhänge: Kalender (.ics) stehen als eine Zeile je Termin im Text. PDFs (Prüfungsplan, Übungsplan) legt das Skript unverändert
neben die Mail (roh/uni-postfach/<UID>-anhang-<n>.pdf, Grenzen unten), der Text nennt sie; Claude liest eine davon nur, wenn sie
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
import email.header
import email.policy
import email.utils
import html
import imaplib
import json
import os
import re
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

def kopf(nachricht, name):
    wert = nachricht.get(name, "")
    try:
        return str(email.header.make_header(email.header.decode_header(str(wert))))
    except (ValueError, LookupError):
        return str(wert)


def html_zu_text(s):
    s = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s)


def anhang_name(name):
    """Name eines Anhangs für den Text: eine Zeile, ohne Steuerzeichen, gekürzt (kommt von außen)."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(name)).strip()[:ANHANG_NAME] or "Anhang"


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
    """Mail → kurzer Text (Betreff, Absender, Datum, Text, Anhänge). Kalender-Anhänge stehen als Zeilen im Text. Einen
    PDF-Anhang gibt der Text an pdf_ablegen(Bytes) → Pfad im Lauf-Ordner oder None (zu groß, Grenze erreicht); ohne
    pdf_ablegen und bei None steht nur sein Name da, wie bei allen anderen Anhängen."""
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
    zeilen = [f"Betreff: {kopf(n, 'Subject')}", f"Von: {kopf(n, 'From')}", f"Datum: {kopf(n, 'Date')}"]
    if namen:
        zeilen.append("Anhänge: " + ", ".join(namen[:20]))
    ende = ""
    if pdfs:
        ende += "\n\nPDF-Anhänge (nur lesen, wenn sie nach Terminen aussehen):\n" + "\n".join(pdfs)
    if kalender:
        ende += "\n\nKalender-Anhänge (Titel | Beginn | Ende | Ort):\n" + "\n\n".join(kalender)
    return "\n".join(zeilen) + "\n\n" + text + ende + "\n"


def pdf_ablage(ordner, uid, rest):
    """Ablage für die PDF-Anhänge einer Mail: höchstens PDF_ANHAENGE_JE_MAIL, je bis PDF_ANHANG_MAX, zusammen bis rest["bytes"]
    (je Abruf). → Funktion Bytes → Pfad im Lauf-Ordner (roh/uni-postfach/…) oder None"""
    nr = [0]

    def ablegen(daten):
        if nr[0] >= PDF_ANHAENGE_JE_MAIL or len(daten) > PDF_ANHANG_MAX or len(daten) > rest["bytes"]:
            return None
        nr[0] += 1
        name = f"{uid}-anhang-{nr[0]}.pdf"
        bytes_schreiben(ordner / name, daten)
        rest["bytes"] -= len(daten)
        return f"roh/uni-postfach/{name}"
    return ablegen


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


def uni_postfach(stand, roh, zugang, imap_klasse=imaplib.IMAP4_SSL, nachlesen=False):
    """Neue Mails seit der letzten UID nach abruf/roh/uni-postfach/; beim Sicherheitslauf (nachlesen) dazu die der letzten 24 Stunden.
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
        alt = stand.get("uni_postfach", {})
        if alt.get("uidvalidity") == gueltig and alt.get("letzte_uid"):
            typ, daten = imap.uid("SEARCH", None, f"UID {int(alt['letzte_uid']) + 1}:*")
        else:
            seit = (jetzt() - timedelta(days=ERSTE_TAGE)).strftime("%d-%b-%Y")
            typ, daten = imap.uid("SEARCH", None, f"SINCE {seit}")
        uids = sorted({int(u) for u in (daten[0] or b"").split()} if typ == "OK" and daten else set())
        uids = [u for u in uids if u > int(alt.get("letzte_uid", 0) if alt.get("uidvalidity") == gueltig else 0)]
        nochmal = []
        if nachlesen:
            # SINCE kennt nur Tage: gestern und heute, dann nach dem Datum der Mail die letzten 24 Stunden
            seit = (jetzt() - NACHLESEN).strftime("%d-%b-%Y")
            typ, daten = imap.uid("SEARCH", None, f"SINCE {seit}")
            gesehen = set(uids)
            nochmal = sorted({int(u) for u in (daten[0] or b"").split()} - gesehen if typ == "OK" and daten else set())[-MAX_MAILS:]
        if not uids and not nochmal:
            stand["uni_postfach"] = {"uidvalidity": gueltig, "letzte_uid": alt.get("letzte_uid", 0) if alt.get("uidvalidity") == gueltig else 0}
            return None
        ordner = roh / "uni-postfach"
        geholt = wieder = 0
        rest = {"bytes": PDF_ANHAENGE_JE_ABRUF}
        for uid in uids[:MAX_MAILS]:
            typ, d = imap.uid("FETCH", str(uid), "(BODY.PEEK[])")
            if typ != "OK" or not d or not isinstance(d[0], tuple):
                continue
            text_schreiben(ordner / f"{uid}.txt", mail_text(d[0][1], pdf_ablage(ordner, uid, rest)))
            geholt += 1
        # Nachlesen (Sicherheitslauf): diese Mails kamen schon einmal, samt ihren PDF-Anhängen; jetzt nur der Text
        for uid in nochmal:
            typ, d = imap.uid("FETCH", str(uid), "(BODY.PEEK[])")
            if typ != "OK" or not d or not isinstance(d[0], tuple):
                continue
            n = email.message_from_bytes(d[0][1], policy=email.policy.default)
            try:
                datum = email.utils.parsedate_to_datetime(str(n.get("Date", "")))
            except (TypeError, ValueError):
                datum = None
            if datum and (datum if datum.tzinfo else datum.replace(tzinfo=timezone.utc)) < jetzt() - NACHLESEN:
                continue
            text_schreiben(ordner / f"{uid}.txt", mail_text(d[0][1]))
            wieder += 1
        stand["uni_postfach"] = {"uidvalidity": gueltig, "letzte_uid": max(uids[:MAX_MAILS]) if uids else alt.get("letzte_uid", 0)}
        teile = ([f"{geholt} neue Mail(s)"] if geholt else []) + ([f"{wieder} Mail(s) der letzten 24 Stunden zum Nachlesen"] if wieder else [])
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
