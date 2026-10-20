"""Tests für abrufen.py (ohne Netz: IMAP ist eine Attrappe). Start: python -m unittest discover -s server -p "test_*.py"."""
import imaplib
import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

import abrufen

def mail(betreff, text, html=None, anhang=None, datum="Sat, 17 Oct 2026 10:00:00 +0200"):
    m = EmailMessage()
    m["Subject"] = betreff
    m["From"] = "Lehrstuhl <lehrstuhl@uni-tuebingen.de>"
    m["Date"] = datum
    m.set_content(text)
    if html:
        m.add_alternative(html, subtype="html")
    if anhang:
        m.add_attachment(b"%PDF-1.4", maintype="application", subtype="pdf", filename=anhang)
    return m.as_bytes()


def imap_attrappe(mails, anmeldung_ok=True, gueltigkeit=b"777"):
    class Imap:
        verbindungen = 0
        suchen = []

        def __init__(self, host, port, timeout=None):
            assert host == abrufen.IMAP_HOST and port == 993
            Imap.verbindungen += 1

        def login(self, benutzer, kennwort):
            if not anmeldung_ok:
                raise imaplib.IMAP4.error("[AUTHENTICATIONFAILED] LOGIN failed")

        def select(self, postfach, readonly=False):
            assert readonly, "nur lesend (EXAMINE)"
            return "OK", [str(len(mails)).encode()]

        def response(self, code):
            return code, [gueltigkeit]

        def uid(self, befehl, *args):
            if befehl == "SEARCH":
                Imap.suchen.append(args[1])
                kriterium = args[1]
                if kriterium.startswith("UID "):
                    start = int(kriterium[4:].split(":")[0])
                    treffer = [u for u in mails if u >= start] or [max(mails)]  # IMAP: n:* liefert mindestens die letzte
                else:
                    treffer = list(mails)
                return "OK", [" ".join(str(u) for u in sorted(treffer)).encode()]
            if befehl == "FETCH":
                assert args[1] == "(BODY.PEEK[])", "nie als gelesen markieren"
                uid = int(args[0])
                return "OK", [(f"1 (UID {uid} BODY[] {{1}}".encode(), mails[uid]), b")"]
            raise AssertionError(befehl)

        def logout(self):
            pass
    return Imap


class Grundlage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.daten = Path(self.tmp.name)
        abrufen.DATEN = self.daten
        self.roh = self.daten / "roh"
        self.roh.mkdir()

    def tearDown(self):
        self.tmp.cleanup()


class UniPostfach(Grundlage):
    ZUGANG = {"username": "probe01", "password": "x"}

    def test_erster_abruf_dann_nur_neue(self):
        mails = {5: mail("Tutorium", "Anmeldung ab Montag."), 9: mail("Klausur", "Raum folgt.", anhang="info.pdf")}
        stand = {}
        imap = imap_attrappe(mails)
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 2 neue Mail(s)")
        self.assertTrue(imap.suchen[0].startswith("SINCE "), "erster Abruf: letzte 14 Tage")
        self.assertEqual(stand["uni_postfach"], {"uidvalidity": "777", "letzte_uid": 9})
        text = (self.roh / "uni-postfach" / "9.txt").read_text(encoding="utf-8")
        self.assertIn("Betreff: Klausur", text)
        self.assertIn("Anhänge: info.pdf", text)
        self.assertIsNone(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "nichts Neues (n:* liefert die letzte)")
        self.assertEqual(imap.suchen[-1], "UID 10:*")
        mails[12] = mail("Neu", "Text")
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 1 neue Mail(s)")

    def test_neue_uidvalidity_beginnt_neu(self):
        stand = {"uni_postfach": {"uidvalidity": "111", "letzte_uid": 50}}
        imap = imap_attrappe({3: mail("A", "a")})
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 1 neue Mail(s)")
        self.assertTrue(imap.suchen[0].startswith("SINCE "))

    def test_hoechstens_30_je_lauf(self):
        mails = {u: mail(f"M{u}", "x") for u in range(1, 41)}
        stand = {}
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails))
        self.assertEqual(len(list((self.roh / "uni-postfach").iterdir())), 30)
        self.assertEqual(stand["uni_postfach"]["letzte_uid"], 30)

    def test_abgelehnte_anmeldung_sperrt_weitere_versuche(self):
        imap = imap_attrappe({1: mail("A", "a")}, anmeldung_ok=False)
        self.assertIn("abgelehnt", abrufen.uni_postfach({}, self.roh, self.ZUGANG, imap))
        self.assertTrue((self.daten / "uni-zugang-falsch").exists())
        vorher = imap.verbindungen
        self.assertIn("übersprungen", abrufen.uni_postfach({}, self.roh, self.ZUGANG, imap))
        self.assertEqual(imap.verbindungen, vorher, "keine neue Verbindung")


class Zugang(unittest.TestCase):
    def test_json_und_zeilen(self):
        self.assertEqual(abrufen.zugang_parsen('{"username": "a", "password": "b"}'), {"username": "a", "password": "b"})
        zeilen = "\n".join(["username=a", "=".join(["password", "b", "c"]), ""])
        self.assertEqual(abrufen.zugang_parsen(zeilen), {"username": "a", "password": "b=c"})
        self.assertIsNone(abrufen.zugang_parsen("username=a"))
        self.assertIsNone(abrufen.zugang_parsen("[]"))


class MailText(unittest.TestCase):
    def test_html_wird_text_und_betreff_dekodiert(self):
        m = EmailMessage()
        m["Subject"] = "=?utf-8?q?Pr=C3=BCfungsanmeldung?="
        m["From"] = "x@uni-tuebingen.de"
        m.set_content("<p>Frist: <b>07.12.</b></p><script>alert(1)</script>", subtype="html")
        t = abrufen.mail_text(m.as_bytes())
        self.assertIn("Betreff: Prüfungsanmeldung", t)
        self.assertIn("Frist: 07.12.", t)
        self.assertNotIn("alert", t)


class Ablauf(Grundlage):
    def test_anstoss_nur_bei_neuem(self):
        mails = {5: mail("Tutorium", "Anmeldung ab Montag.")}
        imap = imap_attrappe(mails)
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=UniPostfach.ZUGANG), ["Uni-Postfach: 1 neue Mail(s)"])
        anstoss = json.loads((self.daten / "anstoss").read_text())
        self.assertEqual([anstoss["grund"], anstoss["meldungen"]], ["quellen", ["Uni-Postfach: 1 neue Mail(s)"]])
        self.assertIn("Uni-Postfach: 1 neue Mail(s)", (self.roh / "INDEX.md").read_text(encoding="utf-8"))
        (self.daten / "anstoss").unlink()
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=UniPostfach.ZUGANG), [])
        self.assertFalse((self.daten / "anstoss").exists(), "nichts Neues, kein Anstoß")

    def test_ohne_zugang(self):
        self.assertEqual(abrufen.abrufen(zugang={}), ["Uni-Postfach: kein Uni-Zugang geladen"])
        self.assertFalse((self.daten / "anstoss").exists())


class TaktUndSicherheitslauf(Grundlage):
    ZUGANG = {"username": "probe01", "password": "x"}

    def setUp(self):
        super().setUp()
        self.echte_uhr = abrufen.jetzt

    def tearDown(self):
        abrufen.jetzt = self.echte_uhr
        super().tearDown()

    def uhr(self, iso):
        abrufen.jetzt = lambda: datetime.fromisoformat(iso)

    def lauf_uebernimmt(self):
        """wie lauf.mjs: Anstoß und roh/ sind danach weg"""
        (self.daten / "anstoss").unlink(missing_ok=True)
        shutil.rmtree(self.roh)

    def test_takt_60_laesst_zwischenzeiten_aus_knopf_zaehlt(self):
        (self.daten / "takt.json").write_text(json.dumps({"uni_postfach": 60, "gmail": 3}))
        imap = imap_attrappe({5: mail("Tutorium", "Anmeldung ab Montag.")})
        self.uhr("2026-10-19T08:00:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), ["Uni-Postfach: 1 neue Mail(s)"])
        n = imap.verbindungen
        self.uhr("2026-10-19T08:31:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertEqual(imap.verbindungen, n, "nach 31 Minuten noch nicht dran: keine Verbindung")
        (self.daten / "knopf.json").write_text(json.dumps({"zuletzt": "2026-10-19T08:40:00+00:00"}))
        self.uhr("2026-10-19T08:45:00+00:00")
        abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG)
        self.assertEqual(imap.verbindungen, n + 1, "„Mails durchsuchen“ seit dem letzten Blick: gleich nachsehen")
        self.uhr("2026-10-19T09:31:00+00:00")
        abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG)
        self.assertEqual(imap.verbindungen, n + 1, "Knopf zählt nur einmal")
        self.uhr("2026-10-19T09:43:00+00:00")
        abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG)
        self.assertEqual(imap.verbindungen, n + 2, "58 Minuten (Zeitgeber streut): dran")

    def test_sicherheitslauf_einmal_am_tag_ab_0630_berlin(self):
        mails = {5: mail("Alt", "Längst gelesen."), 6: mail("Gestern Abend", "Auch schon gelesen.", datum="Sun, 18 Oct 2026 20:00:00 +0200")}
        imap = imap_attrappe(mails)
        self.uhr("2026-10-18T19:00:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), ["Uni-Postfach: 2 neue Mail(s)"])
        self.assertEqual(json.loads((self.daten / "abruf-stand.json").read_text())["nachgelesen"], "2026-10-18", "erster Abruf: heute keiner mehr")
        self.lauf_uebernimmt()
        self.uhr("2026-10-19T04:15:00+00:00")  # 06:15 Uhr in Berlin (Sommerzeit)
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertFalse((self.daten / "anstoss").exists(), "vor 06:30 kein Sicherheitslauf")
        self.uhr("2026-10-19T04:31:00+00:00")  # 06:31 Uhr
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), ["Uni-Postfach: 1 Mail(s) der letzten 24 Stunden zum Nachlesen"])
        anstoss = json.loads((self.daten / "anstoss").read_text())
        self.assertEqual(anstoss["grund"], "taeglich")
        self.assertEqual(sorted(p.name for p in (self.roh / "uni-postfach").iterdir()), ["6.txt"], "nur die letzten 24 Stunden")
        self.assertIn("zum Nachlesen", (self.roh / "INDEX.md").read_text(encoding="utf-8"))
        self.lauf_uebernimmt()
        self.uhr("2026-10-19T04:46:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertFalse((self.daten / "anstoss").exists(), "einmal am Tag")
        # nächster Tag, keine Mail der letzten 24 Stunden: trotzdem ein Anstoß (Gmail, Liegengebliebenes)
        self.uhr("2026-10-20T05:00:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertEqual(json.loads((self.daten / "anstoss").read_text())["grund"], "taeglich")

    def test_berlin_ohne_zeitzonendaten(self):
        echt = abrufen.ZoneInfo

        def fehlt(name):
            raise abrufen.ZoneInfoNotFoundError(name)
        abrufen.ZoneInfo = fehlt
        try:
            sommer = abrufen.berlin(datetime(2026, 10, 19, 4, 31, tzinfo=timezone.utc))
            winter = abrufen.berlin(datetime(2026, 10, 25, 4, 31, tzinfo=timezone.utc))  # letzter Sonntag im Oktober
            self.assertEqual([(sommer.hour, sommer.minute), (winter.hour, winter.minute)], [(6, 31), (5, 31)])
        finally:
            abrufen.ZoneInfo = echt


if __name__ == "__main__":
    unittest.main()
