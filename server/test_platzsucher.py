"""Tests für platzsucher.py (ohne Oracle: die OCI-Kommandozeile ist eine Attrappe). Start: python -m unittest discover -s server -p "test_*.py"."""
import json
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

    def __init__(self, antworten=(), vorhanden=(), liste_fehler=None, beenden=None, abbilder=None):
        self.antworten = list(antworten)
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
                return {"ok": True, "data": {"data": {"id": "ocid1.instance.oc1.eu-frankfurt-1.neu", "lifecycle-state": "PROVISIONING"}}}
            return a
        if args[:3] == ["compute", "image", "list"] and self.abbilder is not None:
            return {"ok": True, "data": {"data": self.abbilder}}
        if args[:3] == ["compute", "instance", "terminate"] and self.beenden:
            return self.beenden
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

    def test_neuestes_abbild_je_runde(self):
        neu = "ocid1.image.oc1.eu-frankfurt-1.aaaaneu"
        oci = Attrappe(["ok"], abbilder=[{"id": neu, "display-name": "Canonical-Ubuntu-24.04-aarch64-2026.10.01-0"}])
        P.runde(oci, KONFIG, {}, START)
        liste = oci.von("compute", "image", "list")[0]
        self.assertEqual([Attrappe.wert(liste, "--operating-system-version"), Attrappe.wert(liste, "--shape"), Attrappe.wert(liste, "--sort-order")],
                         ["24.04", "VM.Standard.A1.Flex", "DESC"])
        a = oci.von("compute", "instance", "launch")[0]
        self.assertEqual(json.loads(Attrappe.wert(a, "--source-details"))["imageId"], neu)
        for kaputt in ([], [{"id": "kein-ocid"}]):
            oci = Attrappe(["ok"], abbilder=kaputt)
            P.runde(oci, KONFIG, {}, START)
            a = oci.von("compute", "instance", "launch")[0]
            self.assertEqual(json.loads(Attrappe.wert(a, "--source-details"))["imageId"], KONFIG["image"], "sonst das aus der Konfiguration")

    def test_kein_platz_alle_bereiche_dann_weiter(self):
        oci = Attrappe([KAPAZITAET] * 3)
        stand = {}
        self.assertEqual(P.runde(oci, KONFIG, stand, START), ("weiter", "kein Platz"))
        ads = sorted(Attrappe.wert(a, "--availability-domain") for a in oci.von("compute", "instance", "launch"))
        self.assertEqual(ads, sorted(KONFIG["ads"]), "jeder Bereich einmal")
        self.assertEqual([stand["versuche"], stand["versuche_heute"], stand["letzter_fehler"]], [3, 3, "InternalError"])

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
        self.assertEqual(stand["versuche_heute"], 3, "neuer Tag, neue Versuche")


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
        self.assertEqual(len(pausen), 2)
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
        self.assertEqual(pausen, [600, 1200, 1800, 1800])

    def test_nach_14_tagen_eine_mail_dann_weiter(self):
        helfer = {"id": "helfer", "freeform-tags": {"studium-autopilot": "helfer"}, "lifecycle-state": "RUNNING"}
        oci = Attrappe([KAPAZITAET] * 9 + ["ok"], vorhanden=[helfer])
        P.suchen(oci, KONFIG, self.stand, schlafen=lambda s: None, jetzt=self.uhr(timedelta(days=5)))
        titel = [Attrappe.wert(m, "--title") for m in oci.von("ons", "message", "publish")]
        self.assertEqual(titel, ["Platzsucher sucht weiter", "Dein Server ist da"])
        self.assertTrue(json.loads(self.stand.read_text(encoding="utf-8"))["gemeldet_14"])



class HelferVorlage(unittest.TestCase):
    def test_cloud_init_des_helfers(self):
        t = (Path(__file__).parent / "platzsucher-helfer.yaml").read_text(encoding="utf-8")
        self.assertTrue(t.startswith("#cloud-config\n"))
        self.assertIn("content: KONFIG_JSON_BASE64", t)
        self.assertIn("ExecStart=/usr/bin/python3 /opt/studium-platzsucher/platzsucher.py --oci /opt/oci/bin/oci", t)
        self.assertRegex(t, r"oci-cli==\d+\.\d+\.\d+", "Version fest")
        self.assertIn("swapon /swapfile", t, "1 GB Arbeitsspeicher reicht pip nicht sicher")
        self.assertLess(t.index("/opt/oci/bin/oci --version ||"), t.index("systemctl enable --now studium-platzsucher.service"),
                        "Dienst nur mit lauffähiger Kommandozeile")
        self.assertIn("content: PLATZSUCHER_GZ_BASE64", t)
        self.assertIn("encoding: gz+b64", t, "platzsucher.py kommt gepackt mit")
        self.assertNotIn("api.github.com", t, "der Helfer lädt nichts nach")


if __name__ == "__main__":
    unittest.main()
