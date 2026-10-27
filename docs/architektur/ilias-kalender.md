# Architektur: ILIAS-Kalender

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## ILIAS-Kalender (seit 18.10.2026, `ilias-kalender.js`)

Die Abgabetermine deiner Übungen aus ILIAS stehen als Fristen unter `Termine/` und damit in Agenda, Kalender, „Nächste Frist“
und auf der Modulseite, seit 24.10.2026 auch im Kopf des Übungsblatts mit derselben Nummer (`ctx.modell.uebungen`). Eine Quelle nach dem Quellen-Vertrag; ein eigener Server übernimmt Schlüsselregel und Lebenslauf, statt
eigene zu bauen.

- **Verbinden** wie Alma (Zeile „ILIAS-Kalender“ unter Verbindungen, Art `link`): In ILIAS 10 **Persönlicher Arbeitsraum** →
  **Kalender**, neben dem Monatsblatt **Abonnieren** (Fenster „Kalender abonnieren“), Link unter **iCal-URL** kopieren
  (Beschriftungen aus der Sprachdatei von ILIAS 10, `btn_ical`, `cal_ical_url`; nicht mit einem Konto im Browser geprüft). Auch
  „iCal-URL (Google Kalender)“ (`limited=1`, ohne Einträge, die älter als 30 Tage sind) geht. `linkPruefen`: https oder webcal,
  Host `ovidius.uni-tuebingen.de` ohne Port und Benutzer, Pfad `/calendar.php`, `client_id` und `token`. Der Link enthält einen
  geheimen Schlüssel: nur gerätelokal (`eba-ilias-ics`, dazu `eba-ilias-ics-status`, `eba-ilias-ics-seit`), nie in einer Datei,
  in Status, Fehlertexten, Hinweisen oder Konsole. Scheitert der erste Abruf, bleibt kein Link gespeichert. Seit 0.4.8 geht es
  mit dem Uni-Login ohne Kopieren (siehe [„Uni-Login“](verbindungen.md)); `linkWaehlen` nimmt dann „iCal-URL (Google Kalender)“.
- **Abruf** mit `requestUrl` (Bytes vor dem Dekodieren entfaltet, `bytesLesen` aus `alma.js`), gelesen mit `alma.js` (`lesen`
  behält seit 18.10.2026 die Parameter je Eigenschaft in `PARAM`, dazu exportiert `zeit`, `bytesLesen`, `klartext`).
- **Was übernommen wird:** nur Übungen (`URL` = `goto.php/exc/<ref>`, ältere Formen `goto.php?target=exc_<ref>`,
  `goto_<client>_exc_<ref>.html`) mit Zusatz „(Abgabetermin)“/„(Deadline)“ (Art `abgabe`) bzw. „(Feedback geben bis)“/„(Feedback
  Deadline)“ (`feedback`). Sitzungen (`sess`), Beginn und Ende von Kursen (`crs`, Titel mit Beitrittspasswort) und
  Anmeldefenster von Gruppen (`grp`, stehen zentral) werden nur gezählt (`zaehler`). Tests legt ILIAS nie in den Kalender, darum
  entsteht hieraus nie eine Prüfung. Persönliche Abgabetermine und Übungen in Ordnern fehlen im Abo (ILIAS).
- **Zeit:** nur `TZID=Europe/Berlin` und UTC („Z“); fremde Zonen, Zeiten ohne Zone und ganztägige Einträge fallen weg (fremde
  Zone: Warnung „… Stell in ILIAS die Zeitzone Berlin ein.“). Abgabe um 00:00 → am Vortag „bis 23:59 Uhr“ (seit 0.7.0 wie in
  den zentralen Daten; bis 0.6.14 „bis 24:00 Uhr“). Intern bleibt 24:00 (das Fachmodell kennt es als Ende des Tages), denn die
  Uhrzeit steckt in den Grabsteinen gelöschter Abgaben; nur die Notiz zeigt 23:59 (`uhrText`).
- **Schlüssel** `ilias_kalender_id` = `exc/<ref>/<abgabe|feedback>/<8 Zeichen SHA-256 des gesäuberten, kleingeschriebenen
  Aufgabentitels>`, nie die UID (ILIAS legt beim Ändern einer Aufgabe neue Einträge an). Gesäubert heißt: ohne Zusatz, ohne
  Kurspasswort (`ctx.ilias.ohneKennwort`), Leerraum einfach. Zwei Aufgaben mit gleichem Titel in einer Übung: nach Datum „#2“.
  Neuer Titel am selben Tag (gleiche Übung und Art) gilt als dieselbe Abgabe (Haken und Text bleiben); Titel und Datum zugleich
  geändert ergibt Wegfall und eine neue Notiz.
- **Notiz** über `ctx.zentral.notizText` mit `{ herkunft: "ilias-kalender", idFeld: "ilias_kalender_id", weg: "im
  ILIAS-Kalender" }` (zentrale Notizen bleiben Byte für Byte gleich, Test): `kategorie: Frist`, `status: offiziell`, `ort` „bis
  23:55 Uhr · ILIAS“, `quelle` = `https://ovidius.uni-tuebingen.de/goto.php/exc/<ref>` (nie der Abo-Link), `info` „Gilt der
  allgemeine Termin; einen persönlichen Termin zeigt nur ILIAS.“, Modul-Link über `ctx.modell.modul`. Titel nie aus ILIAS: nur
  Code, Art und Nummer 1–30 aus dem Aufgabentitel („B110 Abgabe 3“, „B110 Feedback 3“, ohne Code „Abgabe 3 in ILIAS“). Datei
  `Termine/JJJJ-MM-TT <Code> Abgabe in ILIAS.md` bzw. `… Feedback in ILIAS.md` (in `.gitignore`, `pruefen.py` meldet jede Notiz
  mit dieser Herkunft); neues Datum, ein neuer Code oder eine neue Art benennt um (Links ziehen mit; einen Namen, den du selbst
  vergeben hast, nur ein neues Datum). Code: `objekte[<ref>]` im Index der ILIAS-Unterlagen (wo
  `ilias.js` die Übung sah), sonst ein Code im Aufgabentitel, sonst keiner.
- **Keine Doppel:** Gibt es am selben Tag (auch dem Tag in ILIAS vor der 24:00-Regel) mit demselben Code schon eine Frist zu
  einer Abgabe (Titel mit Abgabe, Blatt, Hausaufgabe, Assignment, Deadline, Einreichung, Feedback; zentral, eigener
  Uni-Abgleich oder von Hand; `ctx.modell.termine()`) oder eine Übungsblatt-Notiz (bis 0.6.7) mit Fälligkeit (`ctx.modell.abgaben()`), entsteht keine
  Notiz; eine unberührte wandert in den Papierkorb, ohne Grabstein (verschwindet die andere, kommt sie wieder), eine mit deinem
  Text bleibt. Ohne Code gibt es keinen Vergleich.
- **Lebenslauf:** Grabsteine `angewendet` (Schlüssel → `kurzHash` aus Datum, Uhrzeit, Art) in der Sperr-Datei: Von dir
  gelöscht kommt erst wieder, wenn sich einer dieser Werte ändert, nicht wegen des Codes (der kommt oft erst mit dem ersten
  Durchsuchen der Unterlagen dazu); ältere Grabsteine mit Code gelten weiter; ist der Code gerade
  unbekannt (nach neuem Verbinden), gilt jeder Grabstein und bleibt unverändert, bis der Code wieder da ist. Keine neue Notiz für Abgaben, die schon vorbei sind. In ILIAS
  weg: nur künftige Abgaben (ILIAS lässt Älteres weg), unberührt → Papierkorb, sonst „(entfällt)“ mit Kasten „Dieser Termin steht
  nicht mehr im ILIAS-Kalender“; kommt sie zurück, ist sie wieder normal. Nichts entfernt (Warnung), wenn der Kalender
  unvollständig ankam (kein `END:VCALENDAR` oder ab 900 KB; ILIAS bricht bei 1 MB ab), keine Abgabe kam, obwohl mindestens 3
  künftige bekannt sind, oder mehr als die Hälfte (und mehr als 2) fehlen. Doppel einer id: `Q.dubletten`. Ein abgelaufener
  Link ändert nichts.
- **Ein Schreiber:** `sperre.js`, Quelle `ilias-kalender` (`System/Daten/ilias-kalender-abruf.json`). Der Zeitplan (`Q.planen`:
  20 s + 0–100 s nach dem Einlesen, alle 2 Std., nach Fehlern 15, 30, 60 Min., zurück in der App nach über 2 Std.) läuft nur mit
  Link auf diesem Gerät, fragt bei jedem Lauf `eba.quelleExtern("ilias-kalender")` und wartet, solange ein anderes Gerät schreibt;
  jeder Knopf übernimmt. Trennen gibt die Sperre frei.
- **Status** in der gemeinsamen Form (`zustand`: extern, nicht-verbunden, laeuft, fehler, anderes-geraet, an), dazu `abgaben`
  (kommende offene) und `linkFehler`. Fehler: 401, 403, 404, 410 oder eine Antwort ohne Kalender → „ILIAS kennt diesen Link nicht
  mehr. Bitte den Link in ILIAS neu kopieren.“ und ein Punkt unter [„Bitte prüfen“](seiten.md) (nur auf dem Gerät mit Link; mit Uni-Login
  „Unter Verbindungen **Neuen Link eingeben** tippen, den Rest macht Studium Autopilot.“, nachdem `erneuern` höchstens einmal am
  Tag einen neuen Link versucht hat, siehe [„Uni-Login“](verbindungen.md)); sonst „ILIAS
  antwortet nicht (Fehler n)“ bzw. „Keine Verbindung zu ILIAS“. Warnungen des letzten Laufs stehen in der Zeile und unter [„Bitte
  prüfen“](seiten.md). Hinweise (Notice) nur nach deinem Tipp.
- **Für andere Skripte:** `ctx.iliasKalender = { status(), linkPruefen(link), linkWaehlen(links), verbinden(link, { nurBeiErfolg }), aktualisieren(o),
  trennen(), fehler(), hinweise(), K }` und die reinen Teile (`artAus`, `zielAus`, `zeitpunktAus`, `nummerAus`, `eintraegeAus`,
  `schonDa`, `titelVon`, `dateiNameVon`, `eintragVon`). Testeinstiege: `plugin.testIliasKalenderAus = true` (kein automatischer
  Lauf), `plugin.testKalenderAbruf = async ({ url }) => ({ status, text })` (kein Netz).
- **Tests:** `tests/ilias-kalender.test.js` (erfundene Kalender: Form wie echt → keine Notiz, Code aus dem Index, nie Titel oder
  Passwort, Schlüssel bei neuer UID, neuer Titel, „#2“, Grabstein, 00:00, Zeitzonen, Wegfall, Schutz, Doppel, Link nie sichtbar,
  Sperre, extern, zentrale Notizen gleich); `tests/ilias.test.js` (`objekte`), `tests/verbindungen.test.js` (Zeile),
  `tests/fachmodell.test.js` (24:00).
