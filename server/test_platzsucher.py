"""Tests für platzsucher.py (ohne Oracle: die OCI-Kommandozeile ist eine Attrappe). Start: python -m unittest discover -s server -p "test_*.py"."""
import json
import re
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import platzsucher as P

KONFIG = {
    "compartment": "ocid1.tenancy.oc1..aaaatest", "ads": ["Xyz:EU-FRANKFURT-1-AD-1", "Xyz:EU-FRANKFURT-1-AD-2", "Xyz:EU-FRANKFURT-1-AD-3"],
    "subnet": "ocid1.subnet.oc1.eu-frankfurt-1.aaaatest", "image": "ocid1.image.oc1.eu-frankfurt-1.aaaatest", "boot_gb": 150,
    "ssh_schluessel": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest studium-autopilot", "user_data": "I2Nsb3VkLWNvbmZpZw==",
    "thema": "ocid1.onstopic.oc1.eu-frankfurt-1.aaaatest",
}
KAPAZITAET = {"ok": False, "status": 500, "code": "InternalError", "nachricht": "Out of host capacity."}
DROSSEL = {"ok": False, "status": 429, "code": "TooManyRequests", "nachricht": "Too many requests for the user"}
GRENZE = {"ok": False, "status": 400, "code": "LimitExceeded", "nachricht": "The following service limits were exceeded: standard-a1-core-count"}
START = datetime(2026, 10, 18, 8, 0, tzinfo=timezone.utc)


class Attrappe:
    """OCI-Kommandozeile: launch antwortet nach Liste (je Aufruf ein Eintrag), list liefert vorhandene Instanzen."""

    def __init__(self, antworten=(), vorhanden=(), liste_fehler=None, beenden=None, abbilder=None, zeigen_fehler=0, groesser=(), start_fehler=0):
        self.antworten = list(antworten)
        # Antworten auf update --shape-config (Vergrößern), ohne Eintrag „ok“: „ok“ groß und läuft, „aus“ groß, startet aber nicht
        # wieder, „angenommen“ angenommen und nicht ausgeführt, sonst ein Fehler
        self.groesser = list(groesser)
        self.start_fehler = start_fehler  # so viele START scheitern
        self.zeigen_fehler = zeigen_fehler  # so viele Kennzeichen-Updates scheitern (fehlende Rechte im Anlauf)
        self.abbilder = abbilder
        self.vorhanden = list(vorhanden)
        self.liste_fehler = liste_fehler
        self.beenden = beenden
        self.aufrufe = []

    def __call__(self, args):
        self.aufrufe.append(args)
        if args[:3] == ["compute", "instance", "list"]:
            return self.liste_fehler or {"ok": True, "data": {"data": self.vorhanden}}
        if args[:3] == ["compute", "instance", "launch"]:
            a = self.antworten.pop(0) if self.antworten else KAPAZITAET
            if a == "ok":
                form = json.loads(self.wert(args, "--shape-config"))
                neu = {"id": "ocid1.instance.oc1.eu-frankfurt-1.neu", "freeform-tags": {"studium-autopilot": "server"}, "lifecycle-state": "RUNNING",
                       "shape-config": {"ocpus": float(form["ocpus"]), "memory-in-gbs": float(form["memoryInGBs"])}}
                self.vorhanden.append(neu)
                return {"ok": True, "data": {"data": dict(neu, **{"lifecycle-state": "PROVISIONING"})}}
            return a
        if args[:3] == ["compute", "image", "list"] and self.abbilder is not None:
            return {"ok": True, "data": {"data": self.abbilder}}
        if args[:3] == ["compute", "instance", "action"]:
            if self.start_fehler:
                self.start_fehler -= 1
                return KAPAZITAET
            i = next((x for x in self.vorhanden if x.get("id") == self.wert(args, "--instance-id")), {})
            i["lifecycle-state"] = "RUNNING"
        if args[:3] == ["compute", "instance", "terminate"] and self.beenden:
            return self.beenden
        if args[:3] in (["compute", "instance", "get"], ["compute", "instance", "update"]):
            i = next((x for x in self.vorhanden if x.get("id") == self.wert(args, "--instance-id")), None)
            if i is not None and args[2] == "update" and self.zeigen_fehler:
                self.zeigen_fehler -= 1
                i = None
            if i is None:
                return {"ok": False, "status": 404, "code": "NotAuthorizedOrNotFound", "nachricht": "Authorization failed"}
            if args[2] == "get":
                return {"ok": True, "data": {"data": i}}
            if "--shape-config" in args:
                a = self.groesser.pop(0) if self.groesser else "ok"
                if a not in ("ok", "aus", "angenommen"):
                    return a
                if a != "angenommen":
                    form = json.loads(self.wert(args, "--shape-config"))
                    i["shape-config"] = {"ocpus": float(form["ocpus"]), "memory-in-gbs": float(form["memoryInGBs"])}
                if a == "aus":
                    i["lifecycle-state"] = "STOPPED"
                return {"ok": True, "data": {"data": i}}
            i["freeform-tags"] = json.loads(self.wert(args, "--freeform-tags"))
        return {"ok": True, "data": None}

    def von(self, *praefix):
        return [a for a in self.aufrufe if a[:len(praefix)] == list(praefix)]

    @staticmethod
    def wert(args, name):
        return args[args.index(name) + 1]


class Fehlertext(unittest.TestCase):
    def test_service_error_der_kommandozeile(self):
        text = 'ServiceError:\n{\n    "code": "NotAuthorizedOrNotFound",\n    "message": "Authorization failed or requested resource not found.",\n    "status": 404\n}\n'
        self.assertEqual(P.fehler_lesen(text), {"ok": False, "status": 404, "code": "NotAuthorizedOrNotFound", "nachricht": "Authorization failed or requested resource not found."})
        self.assertEqual(P.fehler_lesen("Traceback … kaputt")["code"], "Unbekannt")

    def test_einordnen(self):
        self.assertEqual(P.einordnen(KAPAZITAET), "kapazitaet")
        self.assertEqual(P.einordnen(DROSSEL), "drossel")
        self.assertEqual(P.einordnen(GRENZE), "halt")
        self.assertEqual(P.einordnen({"status": 404, "code": "NotAuthorizedOrNotFound", "nachricht": ""}), "rechte")
        self.assertEqual(P.einordnen({"status": 502, "code": "BadGateway", "nachricht": ""}), "unklar", "vielleicht angelegt")
        self.assertEqual(P.einordnen({"ok": False, "status": 0, "code": "Aufruf", "nachricht": "Timeout"}), "unklar")

    def test_aufrufer_mit_programm(self):
        with tempfile.TemporaryDirectory() as d:
            prog = Path(d) / "oci_attrappe.py"
            prog.write_text("import json, sys\n"
                            "if 'launch' in sys.argv:\n"
                            "    sys.stderr.write('ServiceError:\\n' + json.dumps({'status': 500, 'code': 'InternalError', 'message': 'Out of host capacity.'}))\n"
                            "    sys.exit(1)\n"
                            "print(json.dumps({'data': {'args': sys.argv[1:]}}))\n", encoding="utf-8")
            oci = P.oci_aufrufer([sys.executable, str(prog)])
            ok = oci(["iam", "region", "list"])
            self.assertTrue(ok["ok"])
            self.assertEqual(ok["data"]["data"]["args"], ["iam", "region", "list", "--output", "json", "--auth", "instance_principal"])
            voll = oci(["compute", "instance", "launch"])
            self.assertEqual([voll["code"], P.einordnen(voll)], ["InternalError", "kapazitaet"])
            self.assertEqual(P.oci_aufrufer([str(Path(d) / "fehlt")])(["x"])["code"], "Aufruf")


class Konfiguration(unittest.TestCase):
    def test_gueltig_und_ungueltig(self):
        self.assertEqual(P.konfig_pruefen(KONFIG), [])
        kaputt = dict(KONFIG, subnet="subnet-1", ads=[], boot_gb=250, ssh_schluessel="geheim", user_data="kein base64!")
        self.assertEqual(len(P.konfig_pruefen(kaputt)), 5)
        self.assertEqual(P.konfig_pruefen([]), ["Konfiguration ist kein Objekt"])


class Runde(unittest.TestCase):
    def test_genau_die_freie_form_mit_kennzeichen(self):
        oci = Attrappe(["ok"])
        art, wert = P.runde(oci, KONFIG, {}, START)
        self.assertEqual(art, "erfolg")
        self.assertEqual(wert["id"], "ocid1.instance.oc1.eu-frankfurt-1.neu")
        a = oci.von("compute", "instance", "launch")[0]
        self.assertEqual(Attrappe.wert(a, "--shape"), "VM.Standard.A1.Flex")
        self.assertEqual(json.loads(Attrappe.wert(a, "--shape-config")), {"ocpus": 2, "memoryInGBs": 12})
        self.assertEqual(json.loads(Attrappe.wert(a, "--source-details")),
                         {"sourceType": "image", "imageId": KONFIG["image"], "bootVolumeSizeInGBs": 150, "bootVolumeVpusPerGB": 10})
        self.assertEqual(json.loads(Attrappe.wert(a, "--freeform-tags")), {"studium-autopilot": "server"})
        self.assertEqual(json.loads(Attrappe.wert(a, "--metadata"))["user_data"], KONFIG["user_data"])
        self.assertNotIn("--boot-volume-size-in-gbs", a, "Größe nur einmal (source-details)")
        self.assertEqual(json.loads(Attrappe.wert(a, "--instance-options")), {"areLegacyImdsEndpointsDisabled": True})
        self.assertIn("--no-retry", a, "sonst schickt die Kommandozeile bei „Out of host capacity“ bis zu acht Anfragen")
        self.assertFalse(P.klein(wert))

    def test_neuestes_abbild_einmal_am_tag(self):
        neu = "ocid1.image.oc1.eu-frankfurt-1.aaaaneu"
        oci = Attrappe(["ok"], abbilder=[{"id": neu, "display-name": "Canonical-Ubuntu-24.04-aarch64-2026.10.01-0"}])
        P.runde(oci, KONFIG, {}, START)
        liste = oci.von("compute", "image", "list")[0]
        self.assertEqual([Attrappe.wert(liste, "--operating-system-version"), Attrappe.wert(liste, "--shape"), Attrappe.wert(liste, "--sort-order")],
                         ["24.04", "VM.Standard.A1.Flex", "DESC"])
        a = oci.von("compute", "instance", "launch")[0]
        self.assertEqual(json.loads(Attrappe.wert(a, "--source-details"))["imageId"], neu)
        stand = {}
        oci = Attrappe([KAPAZITAET] * 12, abbilder=[{"id": neu}])
        P.runde(oci, KONFIG, stand, START)
        P.runde(oci, KONFIG, stand, START + timedelta(hours=1))
        self.assertEqual(len(oci.von("compute", "image", "list")), 1, "am selben Tag aus dem Stand")
        P.runde(oci, KONFIG, stand, START + timedelta(days=1))
        self.assertEqual(len(oci.von("compute", "image", "list")), 2)
        for kaputt in ([], [{"id": "kein-ocid"}]):
            oci = Attrappe(["ok"], abbilder=kaputt)
            P.runde(oci, KONFIG, {}, START)
            a = oci.von("compute", "instance", "launch")[0]
            self.assertEqual(json.loads(Attrappe.wert(a, "--source-details"))["imageId"], KONFIG["image"], "sonst das aus der Konfiguration")

    def test_kein_platz_alle_bereiche_erst_voll_dann_klein(self):
        oci = Attrappe([KAPAZITAET] * 6)
        stand = {}
        self.assertEqual(P.runde(oci, KONFIG, stand, START), ("weiter", "kein Platz"))
        launch = oci.von("compute", "instance", "launch")
        groessen = [json.loads(Attrappe.wert(a, "--shape-config")) for a in launch]
        self.assertEqual(groessen, [{"ocpus": 2, "memoryInGBs": 12}] * 3 + [{"ocpus": 1, "memoryInGBs": 6}] * 3)
        for teil in (launch[:3], launch[3:]):
            self.assertEqual(sorted(Attrappe.wert(a, "--availability-domain") for a in teil), sorted(KONFIG["ads"]), "jeder Bereich einmal je Größe")
        self.assertEqual([stand["versuche"], stand["versuche_heute"], stand["letzter_fehler"]], [6, 6, "InternalError"])

    def test_klein_wenn_fuer_voll_kein_platz(self):
        oci = Attrappe([KAPAZITAET] * 3 + ["ok"])
        art, wert = P.runde(oci, KONFIG, {}, START)
        self.assertEqual(art, "erfolg")
        self.assertTrue(P.klein(wert))
        self.assertEqual(len(oci.von("compute", "instance", "launch")), 4)

    def test_server_schon_da_nichts_doppelt(self):
        da = {"id": "ocid1.instance.oc1.eu-frankfurt-1.da", "freeform-tags": {"studium-autopilot": "server"}, "lifecycle-state": "RUNNING"}
        weg = {"id": "alt", "freeform-tags": {"studium-autopilot": "server"}, "lifecycle-state": "TERMINATED"}
        fremd = {"id": "fremd", "freeform-tags": {}, "lifecycle-state": "RUNNING"}
        oci = Attrappe(vorhanden=[weg, fremd, da])
        self.assertEqual(P.runde(oci, KONFIG, {}, START), ("erfolg", da))
        self.assertEqual(oci.von("compute", "instance", "launch"), [])

    def test_unklare_antwort_beendet_die_runde(self):
        unklar = {"ok": False, "status": 0, "code": "Aufruf", "nachricht": "Zeitüberschreitung"}
        oci = Attrappe([unklar, "ok"])
        art, grund = P.runde(oci, KONFIG, {}, START)
        self.assertEqual((art, grund.split(":")[0]), ("weiter", "unklar"))
        self.assertEqual(len(oci.von("compute", "instance", "launch")), 1, "kein zweiter Bereich in derselben Runde")
        self.assertEqual(oci.aufrufe[0][:3], ["compute", "instance", "list"], "zuerst nachsehen, ob es den Server gibt")

    def test_drossel_und_halt(self):
        self.assertEqual(P.runde(Attrappe([KAPAZITAET, DROSSEL]), KONFIG, {}, START)[0], "drossel")
        art, grund = P.runde(Attrappe([GRENZE]), KONFIG, {}, START)
        self.assertEqual(art, "halt")
        self.assertIn("LimitExceeded", grund)
        rechte = {"ok": False, "status": 404, "code": "NotAuthorizedOrNotFound", "nachricht": "Authorization failed"}
        self.assertEqual(P.runde(Attrappe(liste_fehler=rechte), KONFIG, {}, START)[0], "halt", "Abfrage ohne Rechte")
        self.assertEqual(P.runde(Attrappe(liste_fehler=rechte), KONFIG, {}, START, anlauf=True)[0], "weiter", "Rechte noch nicht verteilt")
        self.assertEqual(P.runde(Attrappe([rechte]), KONFIG, {}, START, anlauf=True)[0], "weiter")

    def test_tagesgrenze(self):
        oci = Attrappe()
        stand = {"tag": "2026-10-18", "versuche_heute": P.VERSUCHE_TAG}
        self.assertEqual(P.runde(oci, KONFIG, stand, START), ("weiter", "Tagesgrenze erreicht"))
        self.assertEqual(oci.von("compute", "instance", "launch"), [])
        P.runde(oci, KONFIG, stand, START + timedelta(days=1))
        self.assertEqual(stand["versuche_heute"], 6, "neuer Tag, neue Versuche")


class Suchen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.stand = Path(self.tmp.name) / "stand.json"

    def tearDown(self):
        self.tmp.cleanup()

    def uhr(self, schritt):
        zeit = [START]

        def jetzt():
            zeit[0] += schritt
            return zeit[0]
        return jetzt

    def test_erfolg_meldet_und_beendet_nur_den_helfer(self):
        helfer = {"id": "ocid1.instance.oc1.eu-frankfurt-1.helfer", "freeform-tags": {"studium-autopilot": "helfer"}, "lifecycle-state": "RUNNING"}
        fremd = {"id": "fremd", "freeform-tags": {"anderes": "helfer"}, "lifecycle-state": "RUNNING"}
        oci = Attrappe([KAPAZITAET] * 6 + ["ok"], vorhanden=[helfer, fremd])
        pausen = []
        self.assertEqual(P.suchen(oci, KONFIG, self.stand, schlafen=pausen.append, jetzt=self.uhr(timedelta(minutes=3))), "erfolg")
        self.assertEqual(len(pausen), 1)
        self.assertTrue(all(P.PAUSE[0] <= s <= P.PAUSE[1] for s in pausen))
        mails = oci.von("ons", "message", "publish")
        self.assertEqual([Attrappe.wert(m, "--title") for m in mails], ["Dein Server ist da"])
        ende = oci.von("compute", "instance", "terminate")
        self.assertEqual([[Attrappe.wert(e, "--instance-id"), Attrappe.wert(e, "--preserve-boot-volume")] for e in ende], [["ocid1.instance.oc1.eu-frankfurt-1.helfer", "false"]])
        s = json.loads(self.stand.read_text(encoding="utf-8"))
        self.assertEqual([s["versuche"], s["instanz"]], [7, "ocid1.instance.oc1.eu-frankfurt-1.neu"])

    def test_helfer_beendet_sich_nicht_dann_mail(self):
        helfer = {"id": "ocid1.instance.oc1.eu-frankfurt-1.helfer", "freeform-tags": {"studium-autopilot": "helfer"}, "lifecycle-state": "RUNNING"}
        rechte = {"ok": False, "status": 404, "code": "NotAuthorizedOrNotFound", "nachricht": "Authorization failed"}
        for oci in (Attrappe(["ok"], vorhanden=[helfer], beenden=rechte), Attrappe(["ok"], vorhanden=[])):
            self.assertEqual(P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=1))), "erfolg")
            self.assertEqual([Attrappe.wert(m, "--title") for m in oci.von("ons", "message", "publish")],
                             ["Dein Server ist da", "Platzsucher-Helfer läuft noch"])
            self.assertTrue(json.loads(self.stand.read_text(encoding="utf-8"))["helfer_bleibt"])
            self.stand.unlink()

    def test_ohne_kommandozeile_kein_suchen(self):
        with tempfile.TemporaryDirectory() as d:
            k = Path(d) / "konfig.json"
            k.write_text(json.dumps(KONFIG), encoding="utf-8")
            alt = sys.argv, P.KONFIG
            try:
                sys.argv, P.KONFIG = ["platzsucher.py", "--oci", str(Path(d) / "fehlt" / "oci")], k
                self.assertEqual(P.main(), 3)
            finally:
                sys.argv, P.KONFIG = alt

    def test_halt_meldet_und_endet_ohne_beenden(self):
        oci = Attrappe([GRENZE])
        self.assertEqual(P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=1))), "halt")
        self.assertEqual([Attrappe.wert(m, "--title") for m in oci.von("ons", "message", "publish")], ["Platzsucher angehalten"])
        self.assertEqual(oci.von("compute", "instance", "terminate"), [], "Helfer bleibt, bis ein Mensch entscheidet")

    def test_rechte_erst_nach_dem_anlauf_ein_halt(self):
        rechte = {"ok": False, "status": 404, "code": "NotAuthorizedOrNotFound", "nachricht": "Authorization failed"}
        oci = Attrappe([rechte] * 30)
        self.assertEqual(P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=4))), "halt")
        self.assertEqual(len(oci.von("compute", "instance", "launch")), 8, "7 Runden im Anlauf (4 bis 28 Min.), Halt in der 8. (32 Min.)")

    def test_drossel_verdoppelt_die_pause_bis_zur_grenze(self):
        oci = Attrappe([DROSSEL] * 4 + ["ok"])
        pausen = []
        P.suchen(oci, KONFIG, self.stand, schlafen=pausen.append, jetzt=self.uhr(timedelta(minutes=1)))
        self.assertEqual(pausen, [240, 480, 960, 1800])

    def test_nach_14_tagen_eine_mail_dann_weiter(self):
        helfer = {"id": "helfer", "freeform-tags": {"studium-autopilot": "helfer"}, "lifecycle-state": "RUNNING"}
        oci = Attrappe([KAPAZITAET] * 18 + ["ok"], vorhanden=[helfer])
        P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(days=5)))
        titel = [Attrappe.wert(m, "--title") for m in oci.von("ons", "message", "publish")]
        self.assertEqual(titel, ["Platzsucher sucht weiter", "Dein Server ist da"])
        self.assertTrue(json.loads(self.stand.read_text(encoding="utf-8"))["gemeldet_14"])


class StandAmHelfer(unittest.TestCase):
    HELFER = "ocid1.instance.oc1.eu-stockholm-1.helfer"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.stand = Path(self.tmp.name) / "stand.json"
        self.helfer = {"id": self.HELFER, "freeform-tags": {"studium-autopilot": "helfer", "studium-autopilot-fassung": "abc"}, "lifecycle-state": "RUNNING"}

    def tearDown(self):
        self.tmp.cleanup()

    uhr = Suchen.uhr

    def test_gleich_beim_start_dann_stuendlich_andere_kennzeichen_bleiben(self):
        oci = Attrappe([KAPAZITAET] * 24 + ["ok"], vorhanden=[self.helfer])
        P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=25)), ich=lambda: self.HELFER)
        # Runden nach 50, 75, 100 und 125 Minuten: Stand in der ersten und in der ersten nach einer Stunde, beim Erfolg keiner
        self.assertEqual(len(oci.von("compute", "instance", "update")), 2)
        tags = self.helfer["freeform-tags"]
        self.assertEqual([tags["studium-autopilot"], tags["studium-autopilot-fassung"]], ["helfer", "abc"])
        self.assertEqual(tags[P.STAND_KENNZEICHEN], "zeit=2026-10-18T10:05:00+00:00;versuche=24;art=weiter;grund=kein Platz")
        self.assertTrue(all("--force" in a for a in oci.von("compute", "instance", "update")), "ohne Rückfrage der Kommandozeile")

    def test_halt_sofort_vor_der_mail(self):
        oci = Attrappe([KAPAZITAET] * 3 + [GRENZE], vorhanden=[self.helfer])
        self.assertEqual(P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=1)), ich=lambda: self.HELFER), "halt")
        stand = self.helfer["freeform-tags"][P.STAND_KENNZEICHEN]
        self.assertRegex(stand, r"^zeit=[^;]+;versuche=4;art=halt;grund=LimitExceeded: The following service limits")
        zuletzt = oci.aufrufe.index(oci.von("compute", "instance", "update")[-1])
        self.assertLess(zuletzt, oci.aufrufe.index(oci.von("ons", "message", "publish")[0]))

    def test_ohne_rechte_wieder_in_der_naechsten_runde(self):
        oci = Attrappe([KAPAZITAET] * 12 + ["ok"], vorhanden=[self.helfer], zeigen_fehler=1)
        P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=1)), ich=lambda: self.HELFER)
        self.assertEqual(len(oci.von("compute", "instance", "update")), 2)
        self.assertIn("versuche=12;", self.helfer["freeform-tags"][P.STAND_KENNZEICHEN])

    def test_nur_am_eigenen_helfer(self):
        fremd = {"id": "ocid1.instance.oc1.eu-stockholm-1.fremd", "freeform-tags": {"anderes": "x"}, "lifecycle-state": "RUNNING"}
        for ich in (lambda: fremd["id"], lambda: None, None):
            oci = Attrappe(["ok"], vorhanden=[fremd])
            P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=1)), ich=ich)
            self.assertEqual(oci.von("compute", "instance", "update"), [])
            self.assertEqual(fremd["freeform-tags"], {"anderes": "x"})
            self.stand.unlink()

    def test_text_hoechstens_256_zeichen(self):
        t = P.stand_text({"versuche": 3}, "drossel", "Too many; requests=\n" + "x" * 400, START)
        self.assertEqual(len(t), 256)
        self.assertTrue(t.startswith("zeit=2026-10-18T08:00:00+00:00;versuche=3;art=drossel;grund=Too many requests x"))

    def test_eigene_id_aus_den_metadaten(self):
        import threading
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

        class Metadaten(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802 (Name von http.server)
                ok = self.path == "/opc/v2/instance/id" and self.headers.get("Authorization") == "Bearer Oracle"
                self.send_response(200 if ok else 401)
                self.end_headers()
                self.wfile.write(StandAmHelfer.HELFER.encode() if ok else b"")

            def log_message(self, *a):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Metadaten)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            basis = f"http://127.0.0.1:{server.server_address[1]}"
            self.assertEqual(P.eigene_id(basis + "/opc/v2/instance/id"), self.HELFER)
            self.assertIsNone(P.eigene_id(basis + "/opc/v1/instance/id"), "401: keine OCID")
        finally:
            server.shutdown()
            server.server_close()
        self.assertIsNone(P.eigene_id(basis + "/opc/v2/instance/id"), "nicht erreichbar")


class Vergroessern(unittest.TestCase):
    SERVER = "ocid1.instance.oc1.eu-frankfurt-1.neu"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.stand = Path(self.tmp.name) / "stand.json"
        self.helfer = {"id": "ocid1.instance.oc1.eu-frankfurt-1.helfer", "freeform-tags": {"studium-autopilot": "helfer"}, "lifecycle-state": "RUNNING"}

    def tearDown(self):
        self.tmp.cleanup()

    uhr = Suchen.uhr

    def server(self, ocpus=1.0, zustand="RUNNING"):
        return {"id": self.SERVER, "freeform-tags": {"studium-autopilot": "server"}, "lifecycle-state": zustand,
                "shape-config": {"ocpus": ocpus, "memory-in-gbs": ocpus * 6}}

    def test_klein_da_mail_sofort_nachts_gross_dann_beendet(self):
        # START 08:00 UTC, je Runde eine Stunde: klein um 10:00, Vergrößern erst ab 01:00 UTC (zuerst kein Platz, dann ja)
        oci = Attrappe([KAPAZITAET] * 3 + ["ok"], vorhanden=[self.helfer], groesser=[KAPAZITAET, "ok"])
        pausen = []
        self.assertEqual(P.suchen(oci, KONFIG, self.stand, schlafen=pausen.append, jetzt=self.uhr(timedelta(hours=1))), "erfolg")
        titel = [Attrappe.wert(m, "--title") for m in oci.von("ons", "message", "publish")]
        self.assertEqual(titel, ["Dein Server ist da", "Dein Server ist jetzt groß"])
        self.assertIn("halber Größe", Attrappe.wert(oci.von("ons", "message", "publish")[0], "--body"))
        groesser = [a for a in oci.von("compute", "instance", "update") if "--shape-config" in a]
        self.assertEqual(len(groesser), 2)
        self.assertTrue(all("--no-retry" in a and Attrappe.wert(a, "--instance-id") == self.SERVER for a in groesser))
        self.assertEqual(json.loads(Attrappe.wert(groesser[0], "--shape-config")), {"ocpus": 2, "memoryInGBs": 12})
        self.assertEqual(oci.vorhanden[-1]["shape-config"]["ocpus"], 2.0)
        self.assertEqual(len(oci.von("compute", "instance", "launch")), 4, "kein zweiter Server")
        self.assertEqual([Attrappe.wert(e, "--instance-id") for e in oci.von("compute", "instance", "terminate")], [self.helfer["id"]])
        self.assertEqual(pausen[0], P.WARTEN_HOECHSTENS, "tagsüber nur Warten bis zur Nacht")
        s = json.loads(self.stand.read_text(encoding="utf-8"))
        self.assertEqual([s["klein"], s["instanz"]], [self.SERVER, self.SERVER])

    def test_nicht_tagsueber_nicht_neu_nicht_aus(self):
        nacht = datetime(2026, 10, 19, 2, 0, tzinfo=timezone.utc)
        stand = {"klein": self.SERVER, "klein_seit": P.jetzt_iso(nacht - timedelta(hours=10))}
        oci = Attrappe(vorhanden=[self.server()])
        self.assertEqual(P.vergroessern(oci, KONFIG, dict(stand), nacht.replace(hour=12)), ("klein", "wartet auf die Nacht"))
        self.assertEqual(P.vergroessern(oci, KONFIG, dict(stand, klein_seit=P.jetzt_iso(nacht - timedelta(hours=1))), nacht),
                         ("klein", "Server ist noch neu"))
        aus = Attrappe(vorhanden=[self.server(zustand="STOPPED")])
        self.assertEqual(P.vergroessern(aus, KONFIG, dict(stand), nacht), ("klein", "Server ist STOPPED, kein Vergrößern"))
        self.assertEqual(aus.von("compute", "instance", "action"), [], "angehalten von jemandem: aus lassen")
        self.assertEqual([a for a in oci.von("compute", "instance", "update") + aus.von("compute", "instance", "update")], [])

    def test_nach_dem_anstoss_aus_dann_wieder_an(self):
        nacht = datetime(2026, 10, 19, 2, 0, tzinfo=timezone.utc)
        oci = Attrappe(vorhanden=[self.server(zustand="STOPPED")])
        stand = {"klein": self.SERVER, "klein_seit": "2026-10-18T10:00:00+00:00", "angestossen": P.jetzt_iso(nacht - timedelta(minutes=10))}
        self.assertEqual(P.vergroessern(oci, KONFIG, stand, nacht), ("klein", "Server nach dem Vergrößern wieder gestartet"))
        self.assertEqual([Attrappe.wert(a, "--action") for a in oci.von("compute", "instance", "action")], ["START"])

    def test_halt_bei_grenze_oder_beendetem_server(self):
        nacht = datetime(2026, 10, 19, 2, 0, tzinfo=timezone.utc)
        stand = {"klein": self.SERVER, "klein_seit": "2026-10-18T10:00:00+00:00"}
        art, grund = P.vergroessern(Attrappe(vorhanden=[self.server()], groesser=[GRENZE]), KONFIG, dict(stand), nacht)
        self.assertEqual(art, "halt")
        self.assertIn("LimitExceeded", grund)
        beendet = dict(stand, angestossen="2026-10-19T01:50:00+00:00")
        self.assertEqual(P.vergroessern(Attrappe(vorhanden=[self.server(zustand="TERMINATED")]), KONFIG, beendet, nacht)[0], "halt")
        self.assertFalse({"klein", "klein_seit", "angestossen"} & beendet.keys(), "vergessen: neu gestartet sucht der Helfer wieder, statt jedes Mal anzuhalten")
        self.assertEqual(P.vergroessern(Attrappe(vorhanden=[self.server()], groesser=[DROSSEL]), KONFIG, dict(stand), nacht)[0], "drossel")

    def lauf(self, oci, stand, *minuten):
        """vergroessern ab 02:00 UTC nach jeweils so vielen Minuten → Liste der Ergebnisse"""
        nacht = datetime(2026, 10, 19, 2, 0, tzinfo=timezone.utc)
        return [P.vergroessern(oci, KONFIG, stand, nacht + timedelta(minutes=m)) for m in minuten]

    def test_gross_aber_aus_ist_kein_erfolg_er_startet_ihn(self):
        oci = Attrappe(vorhanden=[self.server()], groesser=["aus"])
        stand = {"klein": self.SERVER, "klein_seit": "2026-10-18T10:00:00+00:00"}
        r = self.lauf(oci, stand, 0, 2, 4)
        self.assertEqual([a for a, _ in r], ["klein", "klein", "erfolg"])
        self.assertEqual(r[1][1], "Server nach dem Vergrößern wieder gestartet")
        self.assertEqual([Attrappe.wert(a, "--action") for a in oci.von("compute", "instance", "action")], ["START"])

    def test_start_scheitert_er_versucht_weiter_und_mailt_einmal(self):
        oci = Attrappe(vorhanden=[self.server()], groesser=["aus"], start_fehler=4)
        stand = {"klein": self.SERVER, "klein_seit": "2026-10-18T10:00:00+00:00"}
        r = self.lauf(oci, stand, 0, 2, 30, 61, 65, 70)
        self.assertEqual([g for _, g in r[1:5]], ["Server ist aus, Starten scheiterte"] * 4)
        self.assertEqual([Attrappe.wert(m, "--title") for m in oci.von("ons", "message", "publish")], ["Dein Server ist aus"], "nach einer Stunde, einmal")
        self.assertEqual(r[5][1], "Server nach dem Vergrößern wieder gestartet")
        self.assertEqual(len(oci.von("compute", "instance", "action")), 5, "jede Runde ein Start, bis er läuft")

    def test_angenommen_aber_nicht_ausgefuehrt_hoechstens_einmal_je_stunde(self):
        oci = Attrappe(vorhanden=[self.server()], groesser=["angenommen", "ok"])
        stand = {"klein": self.SERVER, "klein_seit": "2026-10-18T10:00:00+00:00"}
        r = self.lauf(oci, stand, 0, 2, 30, 59, 61, 63)
        self.assertEqual([g for _, g in r[1:4]], ["wartet auf das Ergebnis des letzten Versuchs"] * 3, "kein Neustart alle paar Minuten")
        self.assertEqual(r[4][1], "Vergrößern angestoßen")
        self.assertEqual(r[5][0], "erfolg")
        self.assertEqual(len([a for a in oci.von("compute", "instance", "update") if "--shape-config" in a]), 2)

    def test_unklare_antwort_zaehlt_als_anstoss(self):
        unklar = {"ok": False, "status": 0, "code": "Aufruf", "nachricht": "Zeitüberschreitung"}
        server = self.server()
        oci = Attrappe(vorhanden=[server], groesser=[unklar])
        stand = {"klein": self.SERVER, "klein_seit": "2026-10-18T10:00:00+00:00"}
        self.assertEqual(self.lauf(oci, stand, 0)[0], ("klein", "unklar: Zeitüberschreitung"))
        server.update({"lifecycle-state": "STOPPED", "shape-config": {"ocpus": 2.0, "memory-in-gbs": 12.0}})  # Oracle hat es doch getan
        self.assertEqual(self.lauf(oci, stand, 3)[0], ("klein", "Server nach dem Vergrößern wieder gestartet"))
        self.assertEqual(self.lauf(oci, stand, 5)[0][0], "erfolg")

    def test_stand_zeigt_klein_sofort(self):
        # erste Runde ohne Platz (Stand gezeigt), zweite zehn Minuten später klein: zeigt gleich, nicht erst nach einer Stunde
        oci = Attrappe([KAPAZITAET] * 9 + ["ok"], vorhanden=[self.helfer], groesser=["ok"])
        P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(minutes=10)), ich=lambda: self.helfer["id"])
        werte = [json.loads(Attrappe.wert(a, "--freeform-tags"))[P.STAND_KENNZEICHEN] for a in oci.von("compute", "instance", "update")
                 if "--freeform-tags" in a]
        self.assertRegex(werte[1], r"art=klein;grund=Server da \(1 OCPU / 6 GB\), wird nachts vergrößert$", "gleich nach dem Anlegen")

    def test_fenster(self):
        tag = datetime(2026, 10, 18, 0, 59, tzinfo=timezone.utc)
        self.assertEqual([P.im_fenster(tag), P.im_fenster(tag.replace(hour=1)), P.im_fenster(tag.replace(hour=4, minute=59)),
                          P.im_fenster(tag.replace(hour=5, minute=0))], [False, True, True, False])
        self.assertEqual(P.bis_zum_fenster(tag), P.PAUSE[0], "nie kürzer als eine Pause")
        self.assertEqual(P.bis_zum_fenster(tag.replace(hour=0, minute=10)), 50 * 60)
        self.assertEqual(P.bis_zum_fenster(tag.replace(hour=12)), P.WARTEN_HOECHSTENS)


class HelferVorlage(unittest.TestCase):
    def test_cloud_init_des_helfers(self):
        t = (Path(__file__).parent / "platzsucher-helfer.yaml").read_text(encoding="utf-8")
        self.assertTrue(t.startswith("#cloud-config\n"))
        self.assertIn("content: KONFIG_JSON_BASE64", t)
        self.assertIn("ExecStart=/usr/bin/python3 /opt/studium-platzsucher/platzsucher.py --oci /opt/oci/bin/oci", t)
        # Jedes Paket fest: genau eine Version und die SHA-256 genau eines Wheels; pip installiert nur diese Liste, ohne
        # Abhängigkeiten nachzuladen und ohne Quellpakete (deren setup.py liefe auf dem Helfer mit seinen Rechten)
        liste = re.search(r"^  - path: /opt/studium-platzsucher/oci-pakete\.txt\n(?:    \S.*\n)*?    content: \|\n((?:      .*\n)+)", t, re.M)
        self.assertIsNotNone(liste, "Paketliste in write_files")
        zeilen = [z.strip() for z in liste.group(1).splitlines()]
        for z in zeilen:
            self.assertRegex(z, r"^[a-z0-9-]+==[0-9][0-9A-Za-z.+!-]* --hash=sha256:[0-9a-f]{64}$")
        namen = [z.split("==")[0] for z in zeilen]
        self.assertEqual(namen, sorted(set(namen)), "jedes Paket einmal, sortiert")
        self.assertIn("oci-cli", namen)
        self.assertGreater(len(namen), 20, "auch die Abhängigkeiten der Abhängigkeiten")
        aufrufe = re.findall(r"pip install [^\n]*", t)
        self.assertEqual(aufrufe, ["pip install --quiet --require-hashes --no-deps --only-binary=:all: -r /opt/studium-platzsucher/oci-pakete.txt \\"])
        self.assertIn("swapon /swapfile", t, "1 GB Arbeitsspeicher reicht pip nicht sicher")
        self.assertLess(t.index("/opt/oci/bin/oci --version ||"), t.index("systemctl enable --now studium-platzsucher.service"),
                        "Dienst nur mit lauffähiger Kommandozeile")
        self.assertIn("content: PLATZSUCHER_GZ_BASE64", t)
        self.assertIn("encoding: gz+b64", t, "platzsucher.py kommt gepackt mit")
        self.assertNotIn("api.github.com", t, "der Helfer lädt nichts nach")


if __name__ == "__main__":
    unittest.main()
