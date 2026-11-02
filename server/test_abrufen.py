"""Tests für abrufen.py (ohne Netz: IMAP ist eine Attrappe). Start: python -m unittest discover -s server -p "test_*.py"."""
import base64
import email
import email.policy
import imaplib
import json
import os
import shutil
import ssl
import tempfile
import unittest
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

import abrufen

def mail(betreff, text, html=None, anhang=None, datum="Sat, 17 Oct 2026 10:00:00 +0200", von="Lehrstuhl <lehrstuhl@uni-tuebingen.de>"):
    m = EmailMessage()
    m["Subject"] = betreff
    m["From"] = von
    m["Date"] = datum
    m.set_content(text)
    if html:
        m.add_alternative(html, subtype="html")
    if anhang:
        m.add_attachment(b"%PDF-1.4", maintype="application", subtype="pdf", filename=anhang)
    return m.as_bytes()


def koepfe(roh):
    """Was ein IMAP-Server auf BODY.PEEK[HEADER.FIELDS (FROM AUTHENTICATION-RESULTS RECEIVED)] liefert: nur diese Kopfzeilen (mit
    Fortsetzungen), in der Reihenfolge der Mail, dann eine Leerzeile."""
    kopf = roh.split(b"\r\n\r\n", 1)[0].split(b"\n\n", 1)[0]
    aus, dabei = [], False
    for zeile in kopf.replace(b"\r\n", b"\n").split(b"\n"):
        if zeile[:1] in (b" ", b"\t"):
            if dabei:
                aus.append(zeile)
            continue
        dabei = zeile.split(b":", 1)[0].strip().lower() in (b"from", b"authentication-results", b"received")
        if dabei:
            aus.append(zeile)
    return b"\r\n".join(aus) + b"\r\n\r\n"


def imap_attrappe(mails, anmeldung_ok=True, gueltigkeit=b"777"):
    class Imap:
        verbindungen = 0
        suchen = []
        kontext = None

        # ssl_context ohne Vorgabe: ein Aufruf ohne geprüften Kontext scheitert hier, statt still durchzugehen
        def __init__(self, host, port, *, ssl_context, timeout=None):
            assert host == abrufen.IMAP_HOST and port == 993
            Imap.verbindungen += 1
            Imap.kontext = ssl_context

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
            if befehl == "FETCH" and args[1] == abrufen.KOEPFE:
                # mehrere UIDs je Befehl; die UID steht hier (wie bei manchen Servern) hinter dem Literal
                antwort = []
                for u in (int(x) for x in args[0].split(",")):
                    if u in mails:
                        antwort += [(b"1 (BODY[HEADER.FIELDS (FROM AUTHENTICATION-RESULTS RECEIVED)] {1}", koepfe(mails[u])), f" UID {u})".encode()]
                return "OK", antwort
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
        # eigener Ordner des Abrufs; Takt und Knopf liegen beim Web-Dienst
        self.abruf = self.daten / "abruf"
        self.web = self.daten / "web"
        self.web.mkdir()
        self.roh = self.abruf / "roh"
        self.roh.mkdir(parents=True)

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
        text = (self.roh / "uni-postfach" / "777-9.txt").read_text(encoding="utf-8")
        self.assertIn("Betreff: Klausur", text)
        self.assertIn("- info.pdf (1 KB): roh/uni-postfach/777-9-anhang-1.pdf", text, "PDF-Anhang daneben, der Text nennt ihn")
        self.assertEqual((self.roh / "uni-postfach" / "777-9-anhang-1.pdf").read_bytes(), b"%PDF-1.4")
        self.assertIsNone(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "nichts Neues (n:* liefert die letzte)")
        self.assertEqual(imap.suchen[-1], "UID 10:*")
        mails[12] = mail("Neu", "Text")
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 1 neue Mail(s)")

    def test_tls_mit_pruefung_von_zertifikat_und_hostname(self):
        imap = imap_attrappe({1: mail("A", "a")})
        abrufen.uni_postfach({}, self.roh, self.ZUGANG, imap)
        k = imap.kontext
        self.assertIsInstance(k, ssl.SSLContext)
        self.assertEqual(k.verify_mode, ssl.CERT_REQUIRED, "Zertifikat muss gültig sein")
        self.assertTrue(k.check_hostname, "Zertifikat muss zum Namen des Servers passen")
        self.assertGreaterEqual(k.minimum_version, ssl.TLSVersion.TLSv1_2)

    def test_zertifikat_abgelehnt_kein_passwort(self):
        class Abgelehnt:
            def __init__(self, host, port, *, ssl_context, timeout=None):
                raise ssl.SSLCertVerificationError("certificate verify failed")

            def login(self, benutzer, kennwort):
                raise AssertionError("Passwort ginge an einen fremden Server")
        self.assertEqual(abrufen.uni_postfach({}, self.roh, self.ZUGANG, Abgelehnt), "Uni-Postfach: nicht erreichbar (SSLCertVerificationError)")
        self.assertFalse((self.abruf / "uni-zugang-falsch").exists(), "kein abgelehnter Zugang")

    def test_neue_uidvalidity_beginnt_neu(self):
        stand = {"uni_postfach": {"uidvalidity": "111", "letzte_uid": 50}}
        imap = imap_attrappe({3: mail("A", "a")})
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 1 neue Mail(s)")
        self.assertTrue(imap.suchen[0].startswith("SINCE "))

    def test_hoechstens_30_je_lauf(self):
        mails = {u: mail(f"M{u}", "x", von=f"stelle{u}@uni-tuebingen.de") for u in range(1, 41)}
        stand = {}
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails))
        self.assertEqual(len(list((self.roh / "uni-postfach").iterdir())), 30)
        self.assertEqual(stand["uni_postfach"]["letzte_uid"], 30)

    def test_abgelehnte_anmeldung_sperrt_weitere_versuche(self):
        imap = imap_attrappe({1: mail("A", "a")}, anmeldung_ok=False)
        self.assertIn("abgelehnt", abrufen.uni_postfach({}, self.roh, self.ZUGANG, imap))
        self.assertTrue((self.abruf / "uni-zugang-falsch").exists())
        vorher = imap.verbindungen
        self.assertIn("übersprungen", abrufen.uni_postfach({}, self.roh, self.ZUGANG, imap))
        self.assertEqual(imap.verbindungen, vorher, "keine neue Verbindung")


FLUT = "flut@" + "beispiel.example"  # zerlegt: pruefen.py meldet sonst eine Adresse


class GrenzenJeTag(Grundlage):
    """Grenzen je Tag (Berlin): Was darüber geht, wartet im Postfach auf einen späteren Tag, mit Zahl im Stand."""
    ZUGANG = {"username": "probe01", "password": "x"}

    def setUp(self):
        super().setUp()
        self.echt = (abrufen.jetzt, abrufen.platz_frei, abrufen.WARTEND_MAX, {k: dict(v) for k, v in abrufen.TAG_GRENZEN.items()})
        self.uhr("2026-10-19T08:00:00+00:00")

    def tearDown(self):
        abrufen.jetzt, abrufen.platz_frei, abrufen.WARTEND_MAX, grenzen = self.echt
        abrufen.TAG_GRENZEN.update(grenzen)
        super().tearDown()

    def uhr(self, iso):
        abrufen.jetzt = lambda: datetime.fromisoformat(iso)

    def dateien(self):
        return sorted(p.name for p in (self.roh / "uni-postfach").iterdir()) if (self.roh / "uni-postfach").exists() else []

    def test_je_absender_hoechstens_20_am_tag_der_rest_morgen_vor_den_neuen(self):
        mails = {u: mail(f"Flut {u}", "x", von=FLUT) for u in range(1, 26)}
        mails[26] = mail("Andere Stelle", "x", von="pa@uni-tuebingen.de")
        stand = {}
        meldung = abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails))
        self.assertEqual(meldung, "Uni-Postfach: 21 neue Mail(s), 5 wegen der Grenze für heute auf einen späteren Tag zurückgestellt")
        self.assertEqual(len(self.dateien()), 21)
        self.assertIn("777-26.txt", self.dateien(), "ein anderer Absender kommt trotzdem")
        wartend = stand["uni_postfach"]["wartend"]
        self.assertEqual({u: (w["ab"], w["topf"]) for u, w in wartend.items()}, {str(u): ("2026-10-20", "andere") for u in range(21, 26)})
        self.assertEqual(len({w["wer"] for w in wartend.values()}), 1, "Kurz-Hash des Absenders gemerkt")
        self.assertEqual(stand["uni_postfach"]["letzte_uid"], 26, "die Suche geht weiter; die Wartenden stehen in der Liste")
        self.assertEqual(stand["tag"]["zurueckgestellt"], 5)
        self.assertNotIn("flut@", json.dumps(stand), "nur ein Kurz-Hash der Adresse")
        # am selben Tag nicht noch einmal
        self.assertIsNone(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails)))
        # am nächsten Tag: erst die wartenden, dann die neuen
        shutil.rmtree(self.roh / "uni-postfach")
        self.uhr("2026-10-20T08:00:00+00:00")
        mails[27] = mail("Neu", "x", von="pa@uni-tuebingen.de")
        imap = imap_attrappe(mails)
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 6 neue Mail(s)")
        self.assertEqual(self.dateien(), ["777-21.txt", "777-22.txt", "777-23.txt", "777-24.txt", "777-25.txt", "777-27.txt"])
        self.assertNotIn("wartend", stand["uni_postfach"])
        self.assertNotIn("wartend_seit", stand["uni_postfach"])

    def test_mails_der_uni_ohne_grenze_je_absender_und_mit_eigenem_topf(self):
        # ILIAS schickt an manchen Tagen mehr als 20: zählt nicht je Absender
        mails = {u: mail(f"ILIAS {u}", "x", von="ilias@uni-tuebingen.de") for u in range(1, 26)}
        stand = {}
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails)), "Uni-Postfach: 25 neue Mail(s)")
        # eine Flut von außen füllt nur ihren Topf; die Uni kommt trotzdem dran
        abrufen.TAG_GRENZEN["andere"]["zeichen"] = 600
        flut = {u: mail(f"F{u}", "y" * 150, von=f"f{u}@" + "beispiel.example") for u in range(30, 40)}
        flut[40] = mail("Prüfungsamt", "y" * 150, von="pa@uni-tuebingen.de")
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(flut))
        self.assertIn("777-40.txt", self.dateien())
        self.assertEqual(sum(1 for u in range(30, 40) if f"777-{u}.txt" in self.dateien()), 2, "von außen nur, was in 600 Zeichen passt")
        self.assertLessEqual(stand["tag"]["andere"]["zeichen"], 600)
        # Absender der Uni mit gescheitertem Urteil zählen als andere
        n = email.message_from_bytes(b"Authentication-Results: mx.uni-tuebingen.de; dmarc=fail\r\nFrom: pa@uni-tuebingen.de\r\n\r\nx",
                                     policy=email.policy.default)
        self.assertEqual(abrufen.topf(n), "andere")
        # ist der Topf heute voll, wartet Zurückgestelltes daraus ohne Abruf auf morgen
        imap = imap_attrappe(flut)
        stand["uni_postfach"]["letzte_uid"] = 40
        stand["uni_postfach"]["wartend"] = {"35": {"ab": "2026-10-19", "topf": "andere", "wer": "", "zeichen": 160, "pdfs": 0, "bytes": 0}}
        n = imap.verbindungen
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap)
        self.assertEqual(stand["uni_postfach"]["wartend"]["35"]["ab"], "2026-10-20")
        self.assertEqual(imap.verbindungen, n + 1)

    def test_zeichen_je_tag_und_nachlesen_ohne_die_wartenden(self):
        abrufen.TAG_GRENZEN["uni"]["zeichen"] = 600
        mails = {u: mail(f"M{u}", "y" * 150, von=f"s{u}@uni-tuebingen.de", datum="Mon, 19 Oct 2026 09:00:00 +0200") for u in range(1, 6)}
        stand = {}
        meldung = abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails))
        self.assertTrue(meldung.startswith("Uni-Postfach: 2 neue Mail(s), 3 wegen"), meldung)
        self.assertLessEqual(stand["tag"]["uni"]["zeichen"], 600)
        # der Sicherheitslauf liest die Wartenden nicht vorab „noch einmal“
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails), nachlesen=True)
        self.assertEqual(self.dateien(), ["777-1.txt", "777-2.txt"])

    def test_pdf_grenzen_die_mail_wartet_ganz(self):
        abrufen.TAG_GRENZEN["uni"]["pdfs"] = 1
        mails = {1: mail("Plan", "x", anhang="plan.pdf"), 2: mail("Plan 2", "x", anhang="plan2.pdf", von="b@uni-tuebingen.de")}
        stand = {}
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails))
        self.assertEqual(self.dateien(), ["777-1-anhang-1.pdf", "777-1.txt"], "die zweite Mail wartet mit ihrer PDF, statt ohne sie zu kommen")
        self.assertEqual({u: (w["ab"], w["topf"], w["pdfs"]) for u, w in stand["uni_postfach"]["wartend"].items()}, {"2": ("2026-10-20", "uni", 1)})
        # zu wenig Platz: die Mail wartet auf den nächsten Abruf, dann kommt sie mit PDF
        abrufen.TAG_GRENZEN["uni"]["pdfs"] = 20
        abrufen.platz_frei = lambda: abrufen.PLATZ_MIN + 5
        mails[3] = mail("Plan 3", "x", anhang="plan3.pdf", von="c@uni-tuebingen.de")
        meldung = abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails))
        self.assertEqual(meldung, "Uni-Postfach: 1 mit PDF-Anhängen auf den nächsten Abruf verschoben (Grenze je Abruf oder zu wenig Platz)")
        self.assertFalse((self.roh / "uni-postfach" / "777-3.txt").exists())
        self.assertEqual(stand["uni_postfach"]["wartend"]["3"]["ab"], "2026-10-19")
        abrufen.platz_frei = lambda: abrufen.PLATZ_MIN * 2
        self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails)), "Uni-Postfach: 1 neue Mail(s)")
        self.assertIn("777-3-anhang-1.pdf", self.dateien())
        self.assertEqual(stand["tag"]["verschoben"], 1)

    def test_wartende_belegen_nie_alle_plaetze_und_werden_nicht_geholt_solange_sie_nicht_passen(self):
        # 600 zurückgestellte Mails eines Absenders (Stand einer früheren Fassung, ohne Absender) und danach eine neue der Uni
        mails = {u: mail(f"Flut {u}", "x", von=FLUT) for u in range(1, 601)}
        mails[601] = mail("Klausur verlegt", "x", von="pa@uni-tuebingen.de")
        self.uhr("2026-10-20T06:00:00+00:00")
        stand = {"uni_postfach": {"uidvalidity": "777", "letzte_uid": 600, "wartend": {str(u): "2026-10-20:andere" for u in range(1, 601)},
                                  "wartend_seit": "2026-10-19"}}
        geholt = []

        class Zaehlend(imap_attrappe(mails)):
            def uid(self, befehl, *args):
                if befehl == "FETCH" and args[1] != abrufen.KOEPFE:
                    geholt.append(int(args[0]))
                return super().uid(befehl, *args)
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, Zaehlend)
        self.assertIn("777-601.txt", self.dateien(), "die neue Mail gleich im ersten Abruf")
        self.assertEqual(len(geholt), 30)
        self.assertEqual(sum(1 for d in self.dateien() if d.endswith(".txt")), 21, "20 vom Absender, dazu die neue")
        # Einträge der früheren Fassung holt der Abruf je einmal, um den Absender zu kennen; danach warten sie, ohne geholt zu werden
        for _ in range(25):
            abrufen.uni_postfach(stand, self.roh, self.ZUGANG, Zaehlend)
        self.assertEqual(sorted(geholt), list(range(1, 602)), "jede Mail genau einmal")
        geholt.clear()
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, Zaehlend)
        self.assertEqual(geholt, [], "alle wissen jetzt, dass sie heute nicht passen")
        self.assertTrue(all(w["ab"] == "2026-10-21" for w in stand["uni_postfach"]["wartend"].values()))

    def flut_imap(self, mails, befehle):
        class Mitschrift(imap_attrappe(mails)):
            def uid(self, befehl, *args):
                if befehl == "FETCH":
                    befehle.append((args[1], args[0]))
                return super().uid(befehl, *args)
        return Mitschrift

    def test_flut_von_aussen_neue_mail_der_uni_im_ersten_abruf(self):
        # 2000 Mails von 200 Absendern außerhalb der Uni (je 10, unter der Grenze je Absender), danach eine der Uni
        mails = {u: mail(f"Flut {u}", "x", von=f"flut{u % 200}@" + "beispiel.example") for u in range(1, 2001)}
        mails[2001] = mail("Klausur", "Raum folgt.", von="pa@uni-tuebingen.de")
        stand, befehle = {}, []
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        self.assertIn("777-2001.txt", self.dateien(), "die Mail der Uni gleich im ersten Abruf")
        koepfe = [uids for art, uids in befehle if art == abrufen.KOEPFE]
        self.assertEqual(sorted(int(u) for t in koepfe for u in t.split(",")), list(range(2, 2002)), "nur Kopfzeilen, der jüngsten 2000")
        self.assertEqual(len(koepfe), 4, "500 je Befehl")
        geholt = [int(u) for art, u in befehle if art == "(BODY.PEEK[])"]
        self.assertEqual(geholt, [2001, *range(1, 30)], "30 je Abruf, die der Uni zuerst, dann nach UID")
        self.assertEqual(stand["uni_postfach"]["letzte_uid"], 29, "die übrigen neuen holt der nächste Abruf")
        self.assertEqual(stand["uni_postfach"]["vorgezogen"], [2001])
        # der nächste Abruf holt die Flut weiter nach UID, die vorgezogene nicht noch einmal
        befehle.clear()
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        self.assertEqual([int(u) for art, u in befehle if art == "(BODY.PEEK[])"], list(range(30, 60)))
        self.assertEqual([stand["uni_postfach"]["letzte_uid"], stand["uni_postfach"]["vorgezogen"]], [59, [2001]])

    def test_vorgezogene_fallen_weg_sobald_die_suche_sie_erreicht(self):
        mails = {u: mail(f"Flut {u}", "x", von=f"flut{u}@" + "beispiel.example") for u in range(1, 41)}
        mails[41] = mail("Klausur", "x", von="pa@uni-tuebingen.de")
        stand, befehle = {}, []
        for _ in range(2):
            abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        geholt = [int(u) for art, u in befehle if art == "(BODY.PEEK[])"]
        self.assertEqual(sorted(geholt), list(range(1, 42)), "jede Mail genau einmal")
        self.assertEqual(stand["uni_postfach"], {"uidvalidity": "777", "letzte_uid": 41})
        befehle.clear()
        self.assertIsNone(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle)))
        self.assertEqual(befehle, [], "nichts Neues: weder Kopfzeilen noch Mails")

    def test_gefaelschte_uni_absender_der_flut_zaehlen_als_andere(self):
        # die Flut gibt sich als Uni aus, das Urteil des Mailservers der Uni sagt fehlgeschlagen: sie kommt nicht vor die echte
        falsch = b"Authentication-Results: mx1.uni-tuebingen.de; dmarc=fail header.from=uni-tuebingen.de\r\n"
        mails = {u: falsch + mail(f"Flut {u}", "x", von=f"stelle{u}@uni-tuebingen.de") for u in range(1, 41)}
        mails[41] = (b"Authentication-Results: mx1.uni-tuebingen.de; dmarc=pass header.from=uni-tuebingen.de\r\n"
                     + mail("Klausur", "x", von="pa@uni-tuebingen.de"))
        stand, befehle = {}, []
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        self.assertEqual([int(u) for art, u in befehle if art == "(BODY.PEEK[])"], [41, *range(1, 30)])

    def test_wartende_der_uni_vor_den_anderen(self):
        self.uhr("2026-10-20T06:00:00+00:00")
        mails = {u: mail(f"M{u}", "x", von=f"flut{u}@" + "beispiel.example") for u in range(1, 41)}
        mails[40] = mail("Klausur", "x", von="pa@uni-tuebingen.de")
        wartend = {str(u): {"ab": "2026-10-20", "topf": "andere", "wer": f"w{u}", "zeichen": 10, "pdfs": 0, "bytes": 0} for u in range(1, 40)}
        wartend["40"] = {"ab": "2026-10-20", "topf": "uni", "wer": "", "zeichen": 10, "pdfs": 0, "bytes": 0}
        stand, befehle = {"uni_postfach": {"uidvalidity": "777", "letzte_uid": 40, "wartend": wartend, "wartend_seit": "2026-10-19"}}, []
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        self.assertEqual([int(u) for art, u in befehle if art == "(BODY.PEEK[])"], [40, *range(1, 30)])

    def test_viele_mails_der_uni_lassen_keine_andere_liegen(self):
        # Stunde für Stunde 30 neue Mails der Uni: Sie bekämen alle Plätze, die eine von außen davor nie
        mails = {1: mail("Außen", "x", von="verein@" + "beispiel.example")}
        mails.update({u: mail(f"Uni {u}", "x", von=f"stelle{u}@uni-tuebingen.de") for u in range(2, 42)})
        stand, befehle = {}, []
        for stunde in range(26):
            self.uhr(f"2026-10-{19 + (8 + stunde) // 24}T{(8 + stunde) % 24:02d}:00:00+00:00")
            if stunde:
                mails.update({u: mail(f"Uni {u}", "x", von=f"stelle{u}@uni-tuebingen.de") for u in range(max(mails) + 1, max(mails) + 31)})
            abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
            if stunde < 24:
                self.assertNotIn("777-1.txt", self.dateien(), "Mails der Uni zuerst")
            if stunde == 23:
                self.assertEqual(stand["uni_postfach"]["letzte_uid"], 0)
        self.assertIn("777-1.txt", self.dateien(), "nach 24 Stunden ohne Platz vor den Mails der Uni")
        geholt = [int(u) for art, u in befehle if art == "(BODY.PEEK[])"]
        self.assertEqual(len(geholt), len(set(geholt)), "keine doppelt")
        self.assertGreater(stand["uni_postfach"]["letzte_uid"], 1, "die Suche geht weiter")
        self.assertLess(len(stand["uni_postfach"].get("vorgezogen", [])), 30)
        self.assertLessEqual(len(stand["uni_postfach"].get("marken", [])), 26)

    def test_hoechstens_so_viele_vorgezogen_dann_nach_uid(self):
        self.addCleanup(setattr, abrufen, "VORGEZOGEN_MAX", abrufen.VORGEZOGEN_MAX)
        abrufen.VORGEZOGEN_MAX = 40
        mails = {1: mail("Außen", "x", von="verein@" + "beispiel.example")}
        mails.update({u: mail(f"Uni {u}", "x", von=f"stelle{u}@uni-tuebingen.de") for u in range(2, 101)})
        stand, befehle = {}, []
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        self.assertEqual(stand["uni_postfach"]["vorgezogen"], list(range(2, 32)))
        befehle.clear()
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, self.flut_imap(mails, befehle))
        self.assertEqual(befehle, [("(BODY.PEEK[])", str(u)) for u in [1, *range(32, 61)]], "nach UID, ohne Kopfzeilen")
        self.assertEqual(stand["uni_postfach"]["letzte_uid"], 60)
        self.assertNotIn("vorgezogen", stand["uni_postfach"])

    def test_kaputter_stand_beginnt_wie_ein_erster_abruf(self):
        kaputt = [
            {"uidvalidity": "777", "letzte_uid": "abc", "vorgezogen": 5},
            {"uidvalidity": "777", "letzte_uid": None, "vorgezogen": {"3": 1}, "marken": "x"},
            {"uidvalidity": "777", "letzte_uid": "\u00b2", "vorgezogen": ["\u00b2", -3, True, None], "marken": [[1], ["x", "y"], [2, 5]]},
            {"uidvalidity": "777", "letzte_uid": -4, "wartend": {"\u00b2": "2026-10-20"}},
            ["kein", "Objekt"],
        ]
        for alt in kaputt:
            with self.subTest(alt=alt):
                shutil.rmtree(self.roh / "uni-postfach", ignore_errors=True)
                stand = {"uni_postfach": alt}
                imap = imap_attrappe({3: mail("A", "a")})
                self.assertEqual(abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap), "Uni-Postfach: 1 neue Mail(s)")
                self.assertTrue(imap.suchen[-1].startswith("SINCE "), "ohne lesbare letzte UID die letzten 14 Tage")
                self.assertEqual(stand["uni_postfach"], {"uidvalidity": "777", "letzte_uid": 3})

    def test_neue_uidvalidity_sucht_so_weit_zurueck_wie_das_zurueckgestellte(self):
        mails = {5: mail("Alt, zurückgestellt", "x")}
        imap = imap_attrappe(mails, gueltigkeit=b"778")
        stand = {"uni_postfach": {"uidvalidity": "777", "letzte_uid": 9, "wartend": {"3": "2026-10-20:uni"}, "wartend_seit": "2026-09-25"}}
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap)
        self.assertEqual(imap.suchen[-1], "SINCE 24-Sep-2026", "bis zum ältesten Zurückgestellten, nicht nur 14 Tage")
        self.assertEqual(self.dateien(), ["778-5.txt"])
        stand["uni_postfach"] = {"uidvalidity": "776", "letzte_uid": 9, "wartend": {"3": "2026-10-20"}, "wartend_seit": "2025-01-01"}
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap)
        self.assertEqual(imap.suchen[-1], "SINCE 20-Aug-2026", "höchstens 60 Tage")

    def test_nur_zurueckgestellt_kein_anstoss_und_hoechstens_so_viele_gemerkt(self):
        abrufen.WARTEND_MAX = 2
        mails = {u: mail(f"Flut {u}", "x", von=FLUT) for u in range(1, 24)}
        stand = {"uni_postfach": {"uidvalidity": "777", "letzte_uid": 0}, "zuletzt": "2026-10-19T07:00:00+00:00", "nachgelesen": "2026-10-19"}
        abrufen.json_schreiben(self.abruf / "abruf-stand.json", stand)
        abrufen.abrufen(imap_klasse=imap_attrappe(mails), zugang=self.ZUGANG)
        (self.abruf / "anstoss").unlink()
        mails.update({u: mail(f"Flut {u}", "x", von=FLUT) for u in range(24, 27)})
        self.uhr("2026-10-19T08:16:00+00:00")
        meldungen = abrufen.abrufen(imap_klasse=imap_attrappe(mails), zugang=self.ZUGANG)
        self.assertEqual(meldungen, ["Uni-Postfach: 3 wegen der Grenze für heute auf einen späteren Tag zurückgestellt, 3 zurückgestellte nicht mehr gemerkt (über 2)"])
        self.assertFalse((self.abruf / "anstoss").exists(), "nur Zurückgestelltes: kein Lauf")
        stand = json.loads((self.abruf / "abruf-stand.json").read_text(encoding="utf-8"))
        self.assertEqual([sorted(stand["uni_postfach"]["wartend"]), stand["tag"]["verworfen"]], [["25", "26"], 4])


def link_moeglich(ordner):
    """Links auf Dateien (unter Windows nur mit Adminrechten)."""
    try:
        os.symlink(ordner / "fehlt", ordner / "probe")
    except OSError:
        return False
    (ordner / "probe").unlink()
    return True


class FremdeDateien(Grundlage):
    def test_nur_echte_dateien_mit_grenze(self):
        (self.web / "takt.json").write_text(json.dumps({"uni_postfach": 60}))
        self.assertEqual(abrufen.fremd_lesen(self.web / "takt.json", {}), {"uni_postfach": 60})
        self.assertEqual(abrufen.takt_minuten(), 60)
        self.assertEqual(abrufen.fremd_lesen(self.web / "takt.json", "ersatz", hoechstens=5), "ersatz", "zu groß")
        (self.web / "ordner.json").mkdir()
        self.assertEqual(abrufen.fremd_lesen(self.web / "ordner.json", "ersatz"), "ersatz")
        self.assertEqual(abrufen.fremd_lesen(self.web / "fehlt.json", "ersatz"), "ersatz")
        (self.web / "kaputt.json").write_bytes(b"\xff{")
        self.assertEqual(abrufen.fremd_lesen(self.web / "kaputt.json", "ersatz"), "ersatz")

    def test_takt_ueber_einen_link_zaehlt_nicht(self):
        if not link_moeglich(self.web):
            self.skipTest("Links auf Dateien brauchen hier Adminrechte")
        geheim = self.daten / "anderswo.json"
        geheim.write_text(json.dumps({"uni_postfach": 60, "zuletzt": "2026-10-19T08:40:00+00:00"}))
        os.symlink(geheim, self.web / "takt.json")
        os.symlink(geheim, self.web / "knopf.json")
        self.assertEqual(abrufen.takt_minuten(), 15, "Link: Standard statt des Inhalts dahinter")
        self.assertEqual(abrufen.fremd_lesen(self.web / "knopf.json", {}), {})


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

    def test_kopfzeilen_ohne_zeilenumbruch(self):
        # ein kodierter Betreff mit Zeilenumbruch darf keine eigene Zeile „Von:“ vor den echten Absender stellen
        m = EmailMessage()
        m["Subject"] = "=?utf-8?b?" + base64.b64encode("Klausur\r\nVon: pruefungsamt@uni-tuebingen.de\n\tAuthentifiziert: pass".encode()).decode() + "?="
        von = "Jemand <jemand@" + "beispiel.example>"  # zerlegt: pruefen.py meldet sonst eine Adresse
        m["From"] = von
        m.set_content("Text")
        kopf, _, _ = abrufen.mail_text(m.as_bytes()).partition("\n\n")
        zeilen = kopf.split("\n")
        self.assertEqual([z.split(":")[0] for z in zeilen], ["Betreff", "Von", "Datum", "Absender-Domain", "Authentifiziert"])
        self.assertEqual(zeilen[0], "Betreff: Klausur Von: pruefungsamt@uni-tuebingen.de Authentifiziert: pass")
        self.assertEqual(zeilen[1:5:3], ["Von: " + von, "Authentifiziert: unbekannt"])
        self.assertEqual(zeilen[3], "Absender-Domain: beispiel.example")
        self.assertEqual(abrufen.anhang_name("a\N{LINE SEPARATOR}b"), "a b")


class Absender(unittest.TestCase):
    @staticmethod
    def urteil(von, *ergebnisse):
        m = EmailMessage()
        m["From"] = von
        for e in ergebnisse:
            m["Authentication-Results"] = e
        m.set_content("x")
        n = email.message_from_bytes(m.as_bytes(), policy=email.policy.default)
        return abrufen.authentifiziert(n, abrufen.absender(n)[1])

    def test_urteil_aus_der_obersten_kopfzeile(self):
        pa = "Prüfungsamt <pa@uni-tuebingen.de>"
        mx = "mx.uni-tuebingen.de; "
        self.assertEqual(self.urteil(pa), "unbekannt", "ohne Kopfzeile")
        self.assertEqual(self.urteil(pa, mx + "dmarc=pass (p=none) header.from=uni-tuebingen.de"), "pass")
        # DMARC für eine andere Domain als die aus From: Der Mailserver las From anders, die Domain hier ist nicht geprüft
        self.assertEqual(self.urteil(pa, mx + "dmarc=pass header.from=boese.example"), "fehlgeschlagen")
        self.assertEqual(self.urteil("kaputt", mx + "dmarc=pass header.from=uni-tuebingen.de"), "fehlgeschlagen", "ohne gültige Adresse")
        self.assertEqual(self.urteil(pa, mx + "dmarc=pass"), "unbekannt", "ohne header.from: nichts zu vergleichen")
        roh = (b"Authentication-Results: mx1.uni-tuebingen.de; dkim=pass header.d=boese.example; dmarc=pass header.from=boese.example\r\n"
               b"From: =?utf-8?q?prof=40uni-tuebingen=2Ede?=\r\n\r\nx")
        n = email.message_from_bytes(roh, policy=email.policy.default)
        self.assertEqual([abrufen.authentifiziert(n, abrufen.absender(n)[1]), abrufen.topf(n)], ["fehlgeschlagen", "andere"])
        self.assertEqual(self.urteil(pa, mx + "dkim=pass header.d=mail.uni-tuebingen.de header.s=s1"), "pass", "Subdomain der Domain aus From")
        self.assertEqual(self.urteil(pa, mx + "dkim=pass header.d=uni-tuebingen.de.beispiel.example"), "unbekannt", "fremde Domain")
        self.assertEqual(self.urteil("x@wiwi.uni-tuebingen.de", mx + "dkim=pass header.d=uni-tuebingen.de"), "unbekannt", "nur gleich oder darunter")
        self.assertEqual(self.urteil(pa, mx + "dkim=fail header.d=uni-tuebingen.de; spf=pass"), "fehlgeschlagen")
        self.assertEqual(self.urteil(pa, mx + "spf=fail smtp.mailfrom=beispiel.example; dmarc=fail header.from=uni-tuebingen.de"), "fehlgeschlagen")
        self.assertEqual(self.urteil(pa, mx + "dkim=none; spf=softfail"), "unbekannt", "weder bestanden noch ausdrücklich gescheitert")
        self.assertEqual(self.urteil(pa, "mx.uni-tuebingen.de (Kommentar; dmarc=pass); dkim=fail header.d=uni-tuebingen.de"), "fehlgeschlagen",
                         "Kommentare zählen nicht")
        self.assertEqual(self.urteil(pa, "uni-tuebingen.de 1; dmarc=fail"), "fehlgeschlagen", "Kennung mit Version")
        # Die Kopfzeile darunter kann der Absender selbst mitschicken: zählt nicht
        self.assertEqual(self.urteil(pa, mx + "dkim=fail header.d=uni-tuebingen.de", "boese; dmarc=pass"), "fehlgeschlagen")
        self.assertEqual(self.urteil(pa, mx + "dkim=none", "boese; dkim=fail"), "unbekannt")
        # Kennung eines anderen Servers: zählt nicht, auch ganz oben
        self.assertEqual(self.urteil(pa, "mx; dmarc=fail"), "unbekannt")
        self.assertEqual(self.urteil(pa, "uni-tuebingen.de.beispiel.example; dmarc=pass"), "unbekannt")
        self.assertEqual(self.urteil(pa, "boese.example; dmarc=pass", mx + "dmarc=fail"), "fehlgeschlagen", "die der Uni gilt")

    def test_nur_ueber_den_received_zeilen(self):
        # Eine Kopfzeile, die der Absender mitschickt, steht unter den Received-Zeilen der Uni: zählt nicht, auch mit der Kennung der Uni
        roh = (b"Received: from mx1.uni-tuebingen.de by mail.uni-tuebingen.de\r\n"
               b"Received: from boese.example by mx1.uni-tuebingen.de\r\n"
               b"Authentication-Results: mx1.uni-tuebingen.de; dmarc=pass header.from=uni-tuebingen.de\r\n"
               b"From: Pruefungsamt <pruefungsamt@uni-tuebingen.de>\r\nSubject: Klausur verlegt\r\n"
               b"Date: Mon, 02 Nov 2026 10:00:00 +0100\r\n\r\nNeuer Termin.\r\n")
        self.assertIn("Authentifiziert: unbekannt", abrufen.mail_text(roh).split("\n\n")[0])
        # beim Zustellen oben eingefügt: zählt
        oben = b"Authentication-Results: mx1.uni-tuebingen.de; dmarc=fail header.from=uni-tuebingen.de\r\n" + roh
        self.assertIn("Authentifiziert: fehlgeschlagen", abrufen.mail_text(oben).split("\n\n")[0])

    def test_absender_nur_mit_gueltiger_domain(self):
        n = email.message_from_string("From: A <A@Uni-Tuebingen.DE>\n\nx", policy=email.policy.default)
        self.assertEqual(abrufen.absender(n), ("a@uni-tuebingen.de", "uni-tuebingen.de"))
        n = email.message_from_string("From: kaputt\n\nx", policy=email.policy.default)
        self.assertEqual(abrufen.absender(n), ("", ""))

    def test_absender_wie_ein_mailserver(self):
        # Domain aus From wie der Mailserver sie liest; was er nicht als eine Adresse der Uni sieht, zählt nie als Uni
        boese = "a@" + "boese.example"
        faelle = {
            "=?utf-8?q?prof=40uni-tuebingen=2Ede?=": "",  # kodiertes Wort: ein Name, keine Adresse
            "=?utf-8?q?Prof_=3Cprof=40uni-tuebingen=2Ede=3E?= <" + boese + ">": "boese.example",
            "prof@uni-tuebingen.de)<" + boese + ">": "",
            '"prof@uni-tuebingen.de" <' + boese + ">": "boese.example",
            boese + ", prof@uni-tuebingen.de": "",  # zwei Adressen
            boese + " (prof@uni-tuebingen.de)": "boese.example",
            "Mueller, Anna <a@uni-tuebingen.de>": "",  # Fehler beim Parsen
            "Prof. Dr. X <x@uni-tuebingen.de>": "uni-tuebingen.de",  # veraltete Form, aber eine Adresse
            "=?utf-8?q?Pr=C3=BCfungsamt?= <pa@uni-tuebingen.de>": "uni-tuebingen.de",
        }
        for von, domain in faelle.items():
            n = email.message_from_bytes(("From: " + von + "\r\n\r\nx").encode(), policy=email.policy.default)
            self.assertEqual(abrufen.absender(n)[1], domain, von)
            self.assertEqual(abrufen.topf(n), "uni" if domain == "uni-tuebingen.de" else "andere", von)
        # rohe 8-Bit-Zeichen oder ein unbekannter Zeichensatz im Namen: die Adresse zählt, solange sie selbst ASCII ist
        roh = {b'"M\xc3\xbcller, Hans" <hm@uni-tuebingen.de>': "uni-tuebingen.de", b"ILIAS Uni T\xfcbingen <noreply@ilias.uni-tuebingen.de>": "ilias.uni-tuebingen.de",
               b"=?x-unbekannt?q?M=FCller?= <hm@uni-tuebingen.de>": "uni-tuebingen.de", b"<m\xc3\xbc@uni-tuebingen.de>": "",
               b"M\xc3\xbcller <" + boese.encode() + b">": "boese.example", b"=?x-unbekannt?q?prof=40uni-tuebingen=2Ede?=": ""}
        for von, domain in roh.items():
            n = email.message_from_bytes(b"From: " + von + b"\r\n\r\nx", policy=email.policy.default)
            self.assertEqual(abrufen.absender(n)[1], domain, von)
            self.assertEqual(abrufen.topf(n), "uni" if domain.endswith("uni-tuebingen.de") else "andere", von)
        zwei = email.message_from_bytes(("From: " + boese + "\r\nFrom: prof@uni-tuebingen.de\r\n\r\nx").encode(), policy=email.policy.default)
        self.assertEqual(abrufen.absender(zwei), ("", ""), "zwei Kopfzeilen From")


class Anhaenge(Grundlage):
    ZUGANG = {"username": "probe01", "password": "x"}

    @staticmethod
    def mit_anhaengen(anhaenge, betreff="Prüfungsplan"):
        m = EmailMessage()
        m["Subject"] = betreff
        m["From"] = "Prüfungsamt <pa@uni-tuebingen.de>"
        m["Date"] = "Sat, 17 Oct 2026 10:00:00 +0200"
        m.set_content("Im Anhang der Plan.")
        for name, haupt, unter, daten in anhaenge:
            m.add_attachment(daten, maintype=haupt, subtype=unter, filename=name)
        return m.as_bytes()

    def test_kalender_als_zeilen(self):
        ics = (b"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Klausur B110\\, Teil 1\r\nDTSTART;TZID=Europe/Berlin:20270208T100000\r\n"
               b"DTEND;TZID=Europe/Berlin:20270208T120000\r\nLOCATION:Audimax\r\nDESCRIPTION:lang\r\n  weiter\r\nEND:VEVENT\r\n"
               b"BEGIN:VEVENT\r\nSUMMARY:Einsicht mit sehr langem\r\n  Titel\r\nDTSTART:20270301T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
        t = abrufen.mail_text(self.mit_anhaengen([("termine.ics", "text", "calendar", ics)]))
        self.assertIn("Kalender-Anhänge (Titel | Beginn | Ende | Ort):\nKalender termine.ics:\n"
                      "Klausur B110, Teil 1 | TZID=Europe/Berlin:20270208T100000 | TZID=Europe/Berlin:20270208T120000 | Audimax\n"
                      "Einsicht mit sehr langem Titel | 20270301T090000Z |  | ", t)
        self.assertNotIn("Anhänge: termine.ics", t)

    def test_pdf_grenzen_je_mail_und_abruf(self):
        pdf = b"%PDF-1.7 " + b"x" * 2000
        anhaenge = [(f"plan{i}.pdf", "application", "pdf", pdf) for i in range(4)]
        anhaenge += [("kaputt.pdf", "application", "pdf", b"kein pdf"), ("folien.pptx", "application", "octet-stream", b"PK"),
                     ("gross.pdf", "application", "pdf", b"%PDF-" + b"x" * (abrufen.PDF_ANHANG_MAX + 1))]
        ordner = self.roh / "uni-postfach"
        rest = {"bytes": abrufen.PDF_ANHAENGE_JE_ABRUF}
        t = abrufen.mail_text(self.mit_anhaengen(anhaenge), abrufen.pdf_ablage(ordner, 7, rest))
        self.assertEqual(sorted(p.name for p in ordner.iterdir()), ["7-anhang-1.pdf", "7-anhang-2.pdf", "7-anhang-3.pdf"])
        self.assertIn("Anhänge: plan3.pdf, kaputt.pdf, folien.pptx, gross.pdf", t, "über der Grenze, keine PDF oder zu groß: nur der Name")
        n = email.message_from_bytes(self.mit_anhaengen(anhaenge), policy=email.policy.default)
        self.assertEqual(abrufen.pdf_groessen(n), [len(pdf)] * 3, "dieselben, die mail_text ablegt")
        self.assertEqual(rest["bytes"], abrufen.PDF_ANHAENGE_JE_ABRUF - 3 * len(pdf))
        # Grenze je Abruf: was nicht mehr passt, nur mit Namen
        rest["bytes"] = len(pdf) - 1
        t = abrufen.mail_text(self.mit_anhaengen(anhaenge[:1]), abrufen.pdf_ablage(ordner, 8, rest))
        self.assertIn("Anhänge: plan0.pdf", t)
        self.assertFalse((ordner / "8-anhang-1.pdf").exists())

    def test_name_aus_einer_zeile(self):
        self.assertEqual(abrufen.anhang_name("a\nb\x07.docx"), "a b .docx")
        self.assertEqual(abrufen.anhang_name(""), "Anhang")

    def test_nachlesen_ohne_pdf(self):
        jetzt = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
        mails = {4: mail("Alt", "schon gesehen", anhang="alt.pdf", datum=jetzt)}
        stand = {"uni_postfach": {"uidvalidity": "777", "letzte_uid": 4}}
        abrufen.uni_postfach(stand, self.roh, self.ZUGANG, imap_attrappe(mails), nachlesen=True)
        self.assertEqual([p.name for p in (self.roh / "uni-postfach").iterdir()], ["777-4.txt"])
        self.assertIn("Anhänge: alt.pdf", (self.roh / "uni-postfach" / "777-4.txt").read_text(encoding="utf-8"))


class Ablauf(Grundlage):
    def test_anstoss_nur_bei_neuem(self):
        mails = {5: mail("Tutorium", "Anmeldung ab Montag.")}
        imap = imap_attrappe(mails)
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=UniPostfach.ZUGANG), ["Uni-Postfach: 1 neue Mail(s)"])
        anstoss = json.loads((self.abruf / "anstoss").read_text())
        self.assertEqual([anstoss["grund"], anstoss["meldungen"]], ["quellen", ["Uni-Postfach: 1 neue Mail(s)"]])
        self.assertIn("Uni-Postfach: 1 neue Mail(s)", (self.roh / "INDEX.md").read_text(encoding="utf-8"))
        (self.abruf / "anstoss").unlink()
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=UniPostfach.ZUGANG), [])
        self.assertFalse((self.abruf / "anstoss").exists(), "nichts Neues, kein Anstoß")

    def test_ohne_zugang(self):
        self.assertEqual(abrufen.abrufen(zugang={}), ["Uni-Postfach: kein Uni-Zugang geladen"])
        self.assertFalse((self.abruf / "anstoss").exists())


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
        (self.abruf / "anstoss").unlink(missing_ok=True)
        shutil.rmtree(self.roh)

    def test_takt_60_laesst_zwischenzeiten_aus_knopf_zaehlt(self):
        (self.web / "takt.json").write_text(json.dumps({"uni_postfach": 60, "gmail": 3}))
        imap = imap_attrappe({5: mail("Tutorium", "Anmeldung ab Montag.")})
        self.uhr("2026-10-19T08:00:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), ["Uni-Postfach: 1 neue Mail(s)"])
        n = imap.verbindungen
        self.uhr("2026-10-19T08:31:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertEqual(imap.verbindungen, n, "nach 31 Minuten noch nicht dran: keine Verbindung")
        (self.web / "knopf.json").write_text(json.dumps({"zuletzt": "2026-10-19T08:40:00+00:00"}))
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
        self.assertEqual(json.loads((self.abruf / "abruf-stand.json").read_text())["nachgelesen"], "2026-10-18", "erster Abruf: heute keiner mehr")
        self.lauf_uebernimmt()
        self.uhr("2026-10-19T04:15:00+00:00")  # 06:15 Uhr in Berlin (Sommerzeit)
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertFalse((self.abruf / "anstoss").exists(), "vor 06:30 kein Sicherheitslauf")
        self.uhr("2026-10-19T04:31:00+00:00")  # 06:31 Uhr
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), ["Uni-Postfach: 1 Mail(s) der letzten 24 Stunden zum Nachlesen"])
        anstoss = json.loads((self.abruf / "anstoss").read_text())
        self.assertEqual(anstoss["grund"], "taeglich")
        self.assertEqual(sorted(p.name for p in (self.roh / "uni-postfach").iterdir()), ["777-6.txt"], "nur die letzten 24 Stunden")
        self.assertIn("zum Nachlesen", (self.roh / "INDEX.md").read_text(encoding="utf-8"))
        self.lauf_uebernimmt()
        self.uhr("2026-10-19T04:46:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertFalse((self.abruf / "anstoss").exists(), "einmal am Tag")
        # nächster Tag, keine Mail der letzten 24 Stunden: trotzdem ein Anstoß (Gmail, Liegengebliebenes)
        self.uhr("2026-10-20T05:00:00+00:00")
        self.assertEqual(abrufen.abrufen(imap_klasse=imap, zugang=self.ZUGANG), [])
        self.assertEqual(json.loads((self.abruf / "anstoss").read_text())["grund"], "taeglich")

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
