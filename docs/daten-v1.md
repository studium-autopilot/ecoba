# Datenformat v1: Zentrale Daten

Stand: 18.10.2026 (`gruppen.json` und `angebote.json` veröffentlicht seit 17.10.2026, `veranstaltungen.json` seit 18.10.2026). Vertrag zwischen dem Export (Seite des Autors, `export-daten.py`) und dem Plugin (Nutzerseite,
`System/Skripte/zentral.js`). Was hier nicht erlaubt ist, verwirft das Plugin. Zielgruppe: wer den Export baut oder das Plugin
ändert.

Adresse: `https://studium-autopilot.github.io/ecoba-daten/v1/` (GitHub Pages, öffentliches Repo `studium-autopilot/ecoba-daten`,
Ordner `v1/`). Das Plugin holt **nur Daten (JSON), nie Code**. `v1` ist die Schema-Version im Pfad: Ältere Plugins lesen weiter
`v1/`, wenn es einmal `v2/` gibt.

## Dateien

| Datei | Pflicht | Höchstgröße | Inhalt |
|---|---|---|---|
| `manifest.json` | ja | 16 KB | Zeitstempel, Prüfsummen, Plugin-Version, Hinweis, Notbremse |
| `termine.json` | nein | 1 000 000 Byte | Termine, Fristen, Veranstaltungen (max. 2000 Einträge) |
| `semester.json` | nein | 256 KB | Semesterdaten, entspricht `System/Daten/Semester.md` |
| `gruppen.json` | nein | 512 KB | Übungs- und Tutoriengruppen (max. 1000 Einträge), seit 17.10.2026, siehe [unten](#gruppenjson) |
| `veranstaltungen.json` | nein | 1 500 000 Byte | Zentraler Stundenplan: Termin-Serien aller Veranstaltungen der Module (max. 3000 Einträge), Vertrag seit 17.10.2026, veröffentlicht seit 18.10.2026, siehe [unten](#veranstaltungenjson) |
| `angebote.json` | nein | 512 KB | Angebote der Uni: Vorträge, UB-Kurse, Hochschulsport, Welcome Center (max. 1000 Einträge), seit 17.10.2026, siehe [unten](#angebotejson) |
| `musterplan.json` | nein | – | reserviert (entspricht `System/Daten/Musterplan.md`); Plugin 0.1 liest ihn noch nicht |
| `module.json` | nein | – | reserviert für Korrekturen am Modulkatalog; Plugin 0.1 liest ihn noch nicht |

Alle Dateien: UTF-8 ohne BOM, gültiges JSON. Die Formatierung (Einrückung) ist frei, die Prüfsumme gilt für die Bytes, wie
sie ausgeliefert werden.

## manifest.json

```json
{
 "schema": 1,
 "erstellt": "2026-10-15T07:53:49Z",
 "dateien": {
  "termine.json": { "sha256": "27f55ab3…717c", "groesse": 51790 },
  "semester.json": { "sha256": "f0a0a397…fb5f", "groesse": 9641 }
 },
 "plugin_aktuell": "0.2.0",
 "release": {
  "version": "0.2.0",
  "url_basis": "https://raw.githubusercontent.com/studium-autopilot/ecoba/v0.2.0/",
  "sha256": "5c432130…1ed2",
  "notiz": "Neu: Update mit einem Tipp."
 },
 "hinweis": "",
 "pause": false
}
```

| Feld | Regel |
|---|---|
| `schema` | genau `1`, sonst Fehler (nichts übernommen) |
| `erstellt` | ISO-Zeit (`JJJJ-MM-TT` oder mit Uhrzeit und Zone), 2020–2040 |
| `dateien` | je bekannter Datei `sha256` (64 Zeichen hex, klein) über die ausgelieferten Bytes und `groesse` (Bytes, ganze Zahl). Unbekannte Namen werden ignoriert. Fehlt eine Datei hier, bleibt auf den Geräten ihr letzter Stand. |
| `plugin_aktuell` | optional, `X.Y.Z`. Ist sie größer als die installierte Version und fehlt ein passendes `release`, zeigt die Übersicht „Neue Version verfügbar“ mit Link auf `https://github.com/studium-autopilot/ecoba/releases` (Plugin 0.1: immer). |
| `release` | optional, seit Plugin 0.2.0 (ältere ignorieren es). Neueste **fertige** Version für den Knopf „Aktualisieren“, siehe [Update-Angaben](#update-angaben-release-und-beta). Ungültig → wird ignoriert, das Manifest gilt trotzdem. |
| `beta` | optional, seit Plugin 0.2.0. Neueste **Beta** (gleiches Schema), nur für Tresore mit Kanal „Beta“. |
| `hinweis` | optional, reiner Text ≤ 200 Zeichen (gesäubert wie `info`), erscheint in der Übersicht „Verbindungen“ |
| `pause` | optional. `true` = **Notbremse**: Kein Gerät übernimmt etwas, Anzeige „Pausiert“. Rücknahme: `false` (oder Git-Revert). |

Das Plugin holt zuerst nur das Manifest. Eine Datei lädt es nur, wenn ihre Prüfsumme sich gegenüber dem letzten übernommenen
Stand dieses Geräts geändert hat (oder beim Knopf **Aktualisieren**). Stimmt Größe oder SHA-256 nicht, wird **in diesem Lauf
nichts** übernommen (auch nicht die anderen Dateien); der nächste Lauf versucht es wieder. Das fängt auch einen kurzzeitig
gemischten Stand im CDN ab.

### Update-Angaben (`release` und `beta`)

Beide Felder haben dasselbe Schema. Das Plugin (`update.js`) lädt danach **nur nach einem Tipp auf „Aktualisieren“** die Dateien
der neuen Version aus dem Haupt-Repo; die zentralen Daten selbst bleiben reine Daten.

| Feld | Regel |
|---|---|
| `version` | `release`: `X.Y.Z`; `beta`: `X.Y.Z-beta.N`. Vergleich wie SemVer: `0.3.0-beta.2` < `0.3.0` < `0.3.1-beta.1`. |
| `url_basis` | genau `https://raw.githubusercontent.com/studium-autopilot/ecoba/v<version>/` (Tag im Haupt-Repo), sonst wird das Feld ignoriert |
| `sha256` | SHA-256 (64 Zeichen hex, klein) von `Studium Autopilot/System/Daten/system-dateien.json` dieser Version, wie `werkzeuge/release.py` sie druckt |
| `notiz` | optional, reiner Text ≤ 200 Zeichen (gesäubert wie `hinweis`): was neu ist, erscheint neben „Neue Version … verfügbar“ |

Angeboten wird: Kanal „stabil“ (Standard) → `release`; Kanal „beta“ (`update_kanal: beta` in `System/Einstellungen.md`) → die
höhere von `beta` und `release`. Nur wenn sie neuer ist als die installierte Version (`System/Daten/installiert.json`), nie
zurück. Beim Tipp holt das Plugin das Manifest frisch.

**Reihenfolge beim Veröffentlichen:** `release` bzw. `beta` erst setzen, wenn der Tag gepusht und das GitHub-Release (bei einer
Beta: Vorab-Release) mit `Studium-Autopilot.zip` veröffentlicht ist – sonst bekommt jemand eine Version angeboten, deren Dateien
es noch nicht gibt (das Update scheitert dann ohne Schaden mit „Keine Verbindung“). `plugin_aktuell` gleichzeitig mit `release`
setzen.

**system-dateien.json** (im Release-Baum, Pfad oben): `{ "schema": 1, "version", "ordner": "Studium Autopilot", "erstellt",
"dateien": [{ "pfad", "klasse", "groesse", "sha256", "koerper"?, "ohne_haken"? }] }`. `klasse` ist `system`, `einstellung`,
`seite` oder `modul` (Regeln: `klasseVon` in `update.js` = `klasse_von` in `werkzeuge/pruefen.py`); `koerper` = SHA-256 des
Textes nach dem Frontmatter (Module), `ohne_haken` = SHA-256 der Seite mit allen `- [x]` als `- [ ]` (Seiten mit Aufgaben).
Eine Liste mit einem einzigen unzulässigen Eintrag lehnt das Plugin ganz ab.

## termine.json

```json
{
 "schema": 1,
 "termine": [
  {
   "id": "2027-02-08-klausur-s100-mathe",
   "titel": "Klausur S100 Mathe",
   "datum": "2027-02-08",
   "bis": "",
   "uhrzeit": "",
   "ort": "12:00–13:30 · Raum folgt",
   "kategorie": "Prüfung",
   "status": "offiziell",
   "code": "S100",
   "quelle_url": "",
   "quelle_text": "Prüfungsamt: Prüfungstermine Pflicht- und Profilbildungsmodule WS 2026/27 Haupttermin (PDF, Stand 09.10.2026)",
   "info": "",
   "geprueft": "2026-10-14"
  }
 ]
}
```

| Feld | Pflicht | Regel |
|---|---|---|
| `id` | ja | `^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$`, stabil (siehe id-Regel), eindeutig. Doppelte id: der erste Eintrag gilt, jeder weitere wird verworfen. |
| `titel` | ja | 1–120 Zeichen, eine Zeile. **Abgelehnt** (Eintrag verworfen) bei HTML (`<b>`, `<script` …), spitzen, eckigen oder geschweiften Klammern, senkrechtem Strich, Backslash, Backticks, `<%`/`%>`, `obsidian://`, `javascript:`, Zeilenumbruch. Wird Dateiname und Überschrift. |
| `datum` | ja | `JJJJ-MM-TT`, echtes Kalenderdatum, 2020-01-01 bis 2040-12-31 |
| `bis` | nein | leer oder Datum ≥ `datum`, höchstens 400 Tage danach (gleich `datum` = eintägig) |
| `uhrzeit` | nein | leer, `HH:MM` oder `HH:MM–HH:MM` (auch `-`). Das Plugin schreibt sie vor den Ort („12:00–13:30 · Raum folgt“), weil Agenda und Kalender die Zeit im Ort suchen. Steht die Zeit schon im `ort`, bleibt `uhrzeit` leer. |
| `ort` | nein | ≤ 120 Zeichen nach dem Säubern |
| `kategorie` | ja | genau eine aus der Freigabeliste unten |
| `status` | ja | `offiziell` oder `geschätzt` (geschätzt = noch nicht veröffentlicht; die Notiz zeigt dann einen Hinweis) |
| `code` | nein | leer oder Modulcode `^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$` (wie `eba.js`), z. B. `B110`, `SQ888`, `E371A` |
| `bereich` | nein | seit 15.10.2026. Fehlt oder ein Wert aus der Freigabeliste „Bereiche“ unten. Ein **unbekannter Wert wird ignoriert** (der Eintrag bleibt, ohne Bereich). Der Export schreibt das Feld nur, wenn es gesetzt ist. |
| `quelle_url` | nein | leer oder `https://` auf einer erlaubten Domain (siehe unten), ≤ 500 Zeichen, ohne Leerzeichen, Anführungszeichen, `<>`, Backslash, Benutzer, Port |
| `quelle_text` | nein | ≤ 200 Zeichen, reiner Text. Für Quellen ohne öffentliche Adresse (Rundmail an alle, PDF, Folie). Wird nur gezeigt, wenn `quelle_url` leer ist. |
| `info` | nein | ≤ 200 Zeichen, reiner Text **für alle** (nie der Notiztext aus dem Tresor des Autors) |
| `geprueft` | nein | ISO-Datum oder -Zeit der letzten Prüfung durch den Abgleich; die Notiz zeigt „geprüft am TT.MM.JJJJ“ |

**Säubern** (für `ort`, `info`, `quelle_text`, `hinweis`, Namen in `semester.json`): HTML-Tags, `<% … %>`, `obsidian://…`,
`javascript:`, `[[`/`]]`, Backticks, Steuer- und unsichtbare Richtungszeichen werden entfernt, Leerraum zusammengefasst. Ist der
Text danach zu lang, wird der **Eintrag verworfen** (nicht gekürzt). Im Notiztext werden Markdown-Zeichen zusätzlich maskiert.

Ungültige Einträge werden **einzeln** verworfen; der Rest wird übernommen. Ein verworfener Eintrag mit gültiger id gilt nicht als
„entfallen“ (seine Notiz bleibt unverändert).

**Unbekannte Felder werden ignoriert, nicht abgelehnt** – in `manifest.json`, in jedem Eintrag von `termine.json` und in
`semester.json` (geprüft 15.10.2026: `manifestPruefen`, `termineNormal` und `semesterPruefen` in `zentral.js` übernehmen nur die
bekannten Felder). Darum dürfen in `v1` neue **optionale** Felder dazukommen, ohne dass ältere Plugins Einträge verwerfen; sie
sehen das neue Feld einfach nicht. Ein neuer Wert in einer Freigabeliste mit Pflichtfeld (z. B. eine neue Kategorie) würde dagegen
den Eintrag verwerfen – so etwas gehört nach `v2/`.

### Freigabeliste Bereiche (`bereich`)

| Wert | Bedeutung | Wirkung im Plugin |
|---|---|---|
| `schluesselqualifikation` | Termin zu den Schlüsselqualifikationen (SQ100: TCP-Kurse, Sprachkurse …). **Freiwillig, keine Pflicht.** | gilt für alle wie ein Termin ohne `code`; Notiz bekommt `bereich: schluesselqualifikation` und den Tag `schlüsselqualifikation`; ruhige Pille „Schlüsselqualifikation · freiwillig“ im Notizkopf, in der Agenda und in der Kalender-Tagesliste, im Dashboard (Fristen/Termine) „Frist · freiwillig“ |

Export: Termine, deren Code mit `SQ1` beginnt (SQ100), gehen **ohne** `code` und mit diesem Bereich; der Titel bleibt
unverändert (kein Zusatz). `SQ888` (Mathematisches Propädeutikum, Mathe-Vorkurs) ist kein SQ-Kurs und behält seinen Code.
Erweitern nur mit Eintrag in dieser Tabelle **und** in `BEREICHE` in `zentral.js` und `export-daten.py`.

### Freigabeliste Kategorien

Genau die im Tresor verwendeten: `Semester`, `Vorlesungsfrei`, `Prüfung`, `Frist`, `Einführung`, `Lehre`, `Fachschaft`,
`Veranstaltung`. `Fachschaft` und `Veranstaltung` blendet der Schalter „Fachschaft & Veranstaltungen“ aus.

### Freigabeliste Domains (`quelle_url`, `quellen` in semester.json)

| Domain (inkl. Subdomains) | Warum |
|---|---|
| `uni-tuebingen.de` | Uni-Seiten, Prüfungsamt, Fachbereich; Subdomains `alma.` (Vorlesungsverzeichnis) und `ovidius.` (ILIAS) |
| `ffwtuebingen.de` | Fachschaft Wirtschaftswissenschaft (`www.ffwtuebingen.de`) |

Erweitern nur mit Begründung in dieser Tabelle **und** in `DOMAINS` in `zentral.js` (beide gleich halten). Nur `https`.

## id-Regel (Export und Migration erzeugen dieselben ids)

1. **Hat die Termin-Notiz ein Feld `zentral_id`, gilt es.** Einmal vergeben, ändert sich die id nie – auch nicht, wenn Datum
   oder Titel sich ändern (das Plugin benennt die Notiz dann um).
2. Sonst wird sie **einmal** aus dem Dateinamen der Notiz im Tresor des Autors abgeleitet (ohne `.md`, Form `JJJJ-MM-TT Titel`):
   1. klein schreiben;
   2. `ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`;
   3. Unicode NFKD, dann Zeichen U+0300–U+036F entfernen (Akzente);
   4. jede Folge von Zeichen außer `a–z`, `0–9` → `-`; `-` am Anfang/Ende weg;
   5. höchstens 80 Zeichen (danach abschneiden, `-` am Ende weg).
3. Ergibt das eine id, die es schon gibt (anderer Termin), hängt der Export `-2`, `-3` … an.
4. Eine id wird nie für einen anderen Termin wiederverwendet.

Prüfwerte:

| Dateiname | id |
|---|---|
| `2026-10-08 Kneipentour 😍 und Semester Opening` | `2026-10-08-kneipentour-und-semester-opening` |
| `2027-01-29 Klausurphase Haupttermin WS 2026-27` | `2027-01-29-klausurphase-haupttermin-ws-2026-27` |
| `2026-10-06 Neu an der Uni – wie geht’s nun weiter` | `2026-10-06-neu-an-der-uni-wie-geht-s-nun-weiter` |
| `2026-10-05 Alma-Einführung für neue Studierende` | `2026-10-05-alma-einfuehrung-fuer-neue-studierende` |
| `2026-11-02 Tutorien starten – B110 BWL` | `2026-11-02-tutorien-starten-b110-bwl` |

Python (gleich wie `idAusName` in `zentral.js`):

```python
import re, unicodedata
def zentral_id(dateiname: str) -> str:
    s = re.sub(r"\.md$", "", dateiname, flags=re.I).lower()
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub("[̀-ͯ]", "", unicodedata.normalize("NFKD", s))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80].rstrip("-") if len(s) > 80 else s
```

**Damit die id fest bleibt**, muss der Export sie sich merken, sobald er sie das erste Mal veröffentlicht. Empfehlung: Der Export
schreibt `zentral_id` in die Termin-Notiz im Tresor des Autors (braucht dessen Okay). Alternative ohne Eingriff:
eine Zuordnungsdatei im Export (`Pfad → id`, bei Umbenennung über Titel + Kategorie + Code nachgeführt).
Die 109 Termin-Notizen der Vorlage tragen bereits `zentral_id` nach Regel 2 (Migration 15.10.2026), aus den heutigen
Dateinamen – der Export erzeugt also für sie dieselben ids.

## semester.json

Gleiche Felder wie das Frontmatter von `System/Daten/Semester.md` (siehe `docs/architektur.md`, „Zentrale Daten“):

```json
{
 "schema": 1,
 "stand": "2026-10-14",
 "quellen": { "semestertermine": "https://uni-tuebingen.de/…" },
 "semester": [ { "name": "WS 2026/27", "beginn": "2026-10-01", "ende": "2027-03-31", "vorlesung_beginn": "2026-10-12", "vorlesung_ende": "2027-02-06", "status": "offiziell" } ],
 "pausen": [ { "name": "Weihnachtspause", "von": "2026-12-23", "bis": "2027-01-06", "status": "offiziell" } ],
 "freie_tage": [ { "name": "Fronleichnam", "datum": "2027-05-27", "status": "offiziell" } ],
 "pruefungsphasen": [ { "art": "Haupttermin", "semester": "WS 2026/27", "von": "2027-01-29", "bis": "2027-02-13", "status": "offiziell", "hinweis": "…" } ],
 "rueckmeldung": [ { "fuer": "SS 2027", "von": "2027-01-15", "bis": "2027-02-15", "status": "offiziell" } ]
}
```

Regeln: Semesternamen `WS JJJJ/JJ` oder `SS JJJJ`; alle Daten wie oben (2020–2040, `ende > beginn`, `bis ≥ von`); `status`
`offiziell`/`geschätzt`; `hinweis` optional ≤ 200 Zeichen; `name`/`art` ≤ 60 Zeichen; je Liste höchstens 100 Einträge;
`quellen` höchstens 10, Schlüssel `[a-z_]{1,30}`, Werte wie `quelle_url`. Ungültige Listeneinträge werden einzeln verworfen;
ohne ein einziges gültiges Semester wird die Datei abgelehnt. Das Plugin schreibt `Semester.md` nur, wenn der Inhalt sich
unterscheidet (Vergleich der Felder, nicht der Formatierung); den Text unter dem Frontmatter lässt es stehen. `modell.js` leitet
daraus wie bisher Semesterliste, Pausen und Prüfungsphasen in `System/Einstellungen.md` ab.

## gruppen.json

Seit 17.10.2026 (Plan Abschnitt 20). Optional: Fehlt die Datei im Manifest, bleibt auf jedem Gerät der letzte Stand. Plugins vor
dieser Fassung kennen den Namen nicht und ignorieren ihn.

```json
{
 "schema": 1,
 "stand": "2026-10-17",
 "gruppen": [
  {
   "id": "ws-2026-27-x100-uebung-1",
   "code": "X100",
   "art": "Übung",
   "gruppe": "1",
   "tag": "Di",
   "von": "08:00",
   "bis": "10:00",
   "ct": true,
   "raum": "Hörsaal 1 (Beispielbau)",
   "anmeldung": "Über den ILIAS-Kurs X100, ab Mo 19.10., 12:00; nur eine Gruppe.",
   "quelle_url": "https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=…&periodId=…",
   "semester": "WS 2026/27",
   "zeitraum": { "von": "2026-10-20", "bis": "2027-02-02" },
   "geprueft": "2026-10-17"
  }
 ]
}
```

| Feld | Pflicht | Regel |
|---|---|---|
| `schema` | ja | genau `1`; sonst, ohne Liste `gruppen` oder mit mehr als 1000 Einträgen wird die **ganze Datei** abgelehnt |
| `stand` | nein | Datum `JJJJ-MM-TT` der letzten Pflege; das Plugin zeigt es im Fuß an |
| `id` | ja | wie bei Terminen (`^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$`), eindeutig; doppelte: der erste Eintrag gilt. Empfohlen: `<semester>-<code>-<art>-<gruppe>` klein, z. B. `ws-2026-27-x100-uebung-1` |
| `code` | ja | Modulcode wie bei Terminen |
| `art` | ja | `Übung` oder `Tutorium` |
| `gruppe` | nein | Nummer oder Name, wie die Quelle ihn nennt, ≤ 20 Zeichen, reiner Text (abgelehnt wie `titel`: HTML, Klammern, senkrechter Strich …); leer = ohne Nummer. ILIAS kann dieselbe Gruppe anders zählen (ILIAS „Gruppe 4“ = Liste Gr. 5); das Plugin ordnet darum nie über die Nummer zu |
| `tag` | ja | `Mo`, `Di`, `Mi`, `Do` oder `Fr` |
| `von`, `bis` | ja | `HH:MM`, `bis` nach `von`. Zeiten wie in der Quelle (Alma: volle Stunden). |
| `ct` | nein | `true` = c.t. (beginnt 15 Min. später, endet 15 Min. früher); alles andere gilt als nicht gesetzt. Das Plugin zeigt „8–10 c.t.“. |
| `raum` | nein | ≤ 120 Zeichen nach dem Säubern; mehrere Räume mit „ / “ getrennt |
| `leitung` | nein | ≤ 120 Zeichen. **Einziges Feld mit Personennamen**, und nur, wenn die Uni den Namen selbst öffentlich nennt (siehe unten). |
| `anmeldung` | nein | ≤ 200 Zeichen, reiner Text für alle: wo und ab wann man sich anmeldet |
| `quelle_url` | ja | wie bei Terminen (`https`, erlaubte Domain) |
| `semester` | ja | `WS JJJJ/JJ` oder `SS JJJJ` |
| `zeitraum` | nein | `{ "von", "bis" }`, Daten wie bei Terminen, `bis ≥ von`, höchstens 400 Tage: erster und letzter Termin der Gruppe |
| `geprueft` | nein | ISO-Datum oder -Zeit der letzten Prüfung |

Gesäubert wie `info` (siehe oben); ungültige Einträge werden **einzeln** verworfen, unbekannte Felder ignoriert. Jedes Gerät
holt die Datei selbst (auch wenn ein anderes Gerät die Termine schreibt), prüft sie wie die anderen Dateien gegen das Manifest
und speichert nur die gültigen Einträge gerätelokal (`eba-zentral-gruppen`). Stimmen Prüfsumme oder Schema nicht, bleiben die
Gruppen beim letzten Stand (Warnung im Bericht); Termine und Semesterdaten werden trotzdem übernommen, wie beim Export
(Pflicht 6). Eine Notiz in `Stundenplan/` entsteht nur für **deine** Gruppe, nie für die ganze Liste: aus deiner
ILIAS-Mitgliedschaft (`herkunft: ilias-gruppe`, zugeordnet über Code, Tag und Zeit, nie über die Nummer) oder aus deiner Wahl
„Meine“ (`herkunft: gruppe-gewaehlt`); Felder aus diesem Eintrag, der Name aus ILIAS (siehe `docs/architektur.md`, „Deine
Übungs- oder Tutoriengruppe“). Anzeige: Codeblock `eba-gruppen` (`System/Skripte/gruppen.js`), gefiltert wie die Termine mit
`code` und auf das aktuelle und das nächste Semester; mit Argument `alle` (```` ```eba-gruppen alle ```` ) ohne Filter.
Gruppen, die im eigenen Stundenplan stehen (gleicher Code, Semester, Wochentag, Beginn höchstens 15 Min. daneben, bei Notizen
zu deiner Gruppe über `gruppe_id`), sind markiert; ein eigener „Stand“ wird nicht gespeichert.

**Namen (Plan Abschnitt 20):** `leitung` nur, wenn die Universität den Namen selbst öffentlich nennt (Alma-Vorlesungsverzeichnis
ohne Anmeldung, Seite des Lehrstuhls), mit `quelle_url` auf genau diese Seite. Nie aus Fotos, Folien, Mails oder ILIAS, nie die
eigene Gruppe des Autors. Wer nicht genannt werden möchte, meldet das per Issue im Haupt-Repo; der Export entfernt den Namen dann
über eine Sperrliste.

## angebote.json

Seit 17.10.2026 (Plan 27.1 Punkt 6). Optional. Offene Angebote der Uni für alle: Vorträge (Studium Generale, Vortragsreihen der
Fakultät), Kurse der Universitätsbibliothek, Hochschulsport und Welcome Center. Nur Fakten und nur etwa die nächsten acht Wochen;
keine Beschreibungen, keine Namen von Personen. Plugins vor dieser Fassung kennen den Namen nicht und ignorieren ihn.

```json
{
 "schema": 1,
 "stand": "2026-10-17",
 "angebote": [
  {
   "id": "2026-10-19-studium-generale-beispielvortrag",
   "kategorie": "vortrag",
   "reihe": "Studium Generale",
   "titel": "Beispielvortrag über Beispiele",
   "datum": "2026-10-19",
   "von": "18:15",
   "bis": "19:45",
   "ort": "Hörsaal 9 (Beispielbau)",
   "online": true,
   "url": "https://uni-tuebingen.de/…",
   "anmeldung": { "ab": "2026-10-12", "bis": "2026-10-18T23:59" }
  }
 ]
}
```

| Feld | Pflicht | Regel |
|---|---|---|
| `schema` | ja | genau `1`; sonst, ohne Liste `angebote` oder mit mehr als 1000 Einträgen wird die **ganze Datei** abgelehnt |
| `stand` | nein | Datum `JJJJ-MM-TT` (oder ISO-Zeit) der letzten Pflege; das Plugin zeigt es im Fuß an |
| `id` | ja | wie bei Terminen (`^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$`), eindeutig, stabil; doppelte: der erste Eintrag gilt. Der Export vergibt `<kategorie>-<Nummer>` (Nummer des Eintrags im Veranstaltungskalender der Uni) bzw. `<kategorie>-<Prüfsumme aus Titel, Datum, Uhrzeit und Link>`; Reihen ausblenden hängt nicht an der `id` |
| `kategorie` | ja | genau ein Wert aus der Freigabeliste unten |
| `reihe` | ja | 1–80 Zeichen, reiner Text (abgelehnt wie `titel`), z. B. „Studium Generale“. Bei `vortrag` wählen Nutzer:innen je Reihe, ob sie sie sehen: „Studium Generale“ und „Wirtschafts- und Sozialwissenschaftliche Fakultät“ (auch „WiSo“) erkennt die App am Namen, jede andere Reihe ist zunächst aus. Den Namen darum nicht ohne Grund ändern |
| `titel` | ja | wie bei Terminen: 1–120 Zeichen, eine Zeile, abgelehnt bei HTML, spitzen, eckigen oder geschweiften Klammern, senkrechtem Strich, Backslash, Backticks, `<%`/`%>`, `obsidian://`, `javascript:` |
| `datum` | ja | `JJJJ-MM-TT` wie bei Terminen; beim Hochschulsport der erste Kurstermin. Ist nur der Buchungsbeginn bekannt, ist `datum` der Buchungstag (Uhrzeit in `von`) und `anmeldung` fehlt, damit die App den Tag nicht doppelt zeigt |
| `von` | nein | `HH:MM` |
| `bis` | nein | `HH:MM`, nur zusammen mit `von` und nach `von` |
| `ort` | nein | ≤ 120 Zeichen nach dem Säubern |
| `online` | nein | `true` = (auch) online; alles andere gilt als nicht gesetzt |
| `url` | ja | `https` auf `uni-tuebingen.de` oder einer Subdomain (z. B. `hochschulsport.`, `ub.`), sonst wie `quelle_url`. Strenger als die Domain-Liste der Termine: keine anderen Domains |
| `anmeldung` | nein | `{ "ab", "bis" }`, beide optional: `JJJJ-MM-TT` oder `JJJJ-MM-TTTHH:MM` (Ortszeit, ohne Zone), `bis` nicht vor `ab`. Kein Objekt oder ungültig → Eintrag verworfen; `{}` = keine Angabe. Beim Hochschulsport ist `ab` der Buchungsbeginn |

### Freigabeliste Kategorien der Angebote (`kategorie`)

| Wert | Chip in der App | Inhalt |
|---|---|---|
| `vortrag` | Vorträge | Studium Generale, Vortragsreihen der Fakultät |
| `ub` | UB-Kurse | Kurse und Führungen der Universitätsbibliothek |
| `sport` | Hochschulsport | Kurse; `anmeldung.ab` erscheint als eigene Zeile „ab 17:00 · Buchungsstart“ am Tag der Buchung |
| `welcome` | Welcome Center | Veranstaltungen des Welcome Centers; laut Uni vor allem für internationale Promovierende und Postdocs (darum steht das in `reihe`) |

Erweitern nur mit Eintrag in dieser Tabelle **und** in `ANGEBOT_KATEGORIEN` (`zentral.js`) und `ARTEN` (`angebote.js`). Ältere
Plugins verwerfen Einträge mit einem neuen Wert einzeln; sie fehlen dort nur.

Gesäubert wie `info`; ungültige Einträge werden **einzeln** verworfen, unbekannte Felder ignoriert. Das Plugin schreibt aus
`angebote.json` **keine Notizen**: Jedes Gerät holt die Datei selbst (auch wenn ein anderes Gerät die Termine schreibt), prüft sie
gegen das Manifest und speichert nur die gültigen Einträge gerätelokal (`eba-zentral-angebote`). Stimmen Prüfsumme oder Schema
nicht, bleibt der letzte Stand (Warnung im Bericht); Termine, Semesterdaten und Gruppen laufen weiter. **Fehlt `angebote.json`
in einem gültigen Manifest** (ohne `pause`), gelten die Angebote als zurückgezogen: Jedes Gerät löscht seinen Stand. Anzeige:
Codeblock `eba-angebote` (`System/Skripte/angebote.js`): beim ersten Mal eine Auswahl (Kategorien, Vortragsreihen), danach Chips
je gewählter Kategorie mit Anzahl, nach Tagen die nächsten 14 Tage, der Rest unter „Mehr anzeigen“. Vergangenes (Tage vor heute, heutige Angebote nach `bis`) blendet das Plugin
selbst aus.

## veranstaltungen.json

Vertrag seit 17.10.2026, **im Manifest seit 18.10.2026** (Schalter `veranstaltungen.veroeffentlichen` im Export). Optional
wie `gruppen.json`: Fehlt sie im Manifest, bleibt auf jedem Gerät der letzte Stand; Plugins vor 0.4.2 kennen den Namen nicht und
ignorieren ihn.

**Herkunft:** das öffentliche Vorlesungsverzeichnis in Alma, ohne Anmeldung gelesen, höchstens einmal am Tag, nacheinander mit
mindestens einer Sekunde Abstand und dem User-Agent `StudiumAutopilot-Abgleich/1.0 (+https://github.com/studium-autopilot/ecoba)`.
Gelesen werden nur die Detailseiten der Veranstaltungen zu den Modulen im Modulkatalog, für das laufende und das nächste Semester.
Bei Fehlern oder einer Überlastungsantwort ruht der Abruf bis zum nächsten Tag. Übernommen werden nur Fakten: Titel, Art,
Parallelgruppe, Rhythmus, Wochentag, Zeit, Zeitraum, Ausfalltermine, Raum und Raum- oder Zeitänderungen je Datum. **Keine
Namen und kein Freitext:** Verantwortliche, Durchführende, Vertretungen, Bemerkungen und Teilnehmerzahlen werden nie gespeichert.

```json
{
 "schema": 1,
 "stand": "2026-10-17",
 "veranstaltungen": [
  {
   "id": "ws-2026-27-x100-vorlesung-1-mi-1000",
   "code": "X100",
   "art": "Vorlesung",
   "titel": "Einführung in die Beispielökonomik",
   "gruppe": "1",
   "tag": "Mi",
   "von": "10:00",
   "bis": "12:00",
   "ct": true,
   "rhythmus": "wöchentlich",
   "zeitraum": { "von": "2026-10-14", "bis": "2027-02-03" },
   "raum": "Hörsaal 1 (Beispielbau)",
   "ausfall": ["2026-12-23", "2026-12-30"],
   "aenderungen": [
    { "datum": "2026-11-11", "raum": "Hörsaal 2 (Beispielbau)" },
    { "datum": "2026-11-18", "von": "14:00", "bis": "16:00" }
   ],
   "semester": "WS 2026/27",
   "quelle_url": "https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=…&periodId=…"
  }
 ]
}
```

Ein Eintrag ist eine **Termin-Serie** (eine Zeile der Alma-Terminliste), nicht ein einzelnes Datum.

| Feld | Pflicht | Regel |
|---|---|---|
| `schema` | ja | genau `1`; sonst, ohne Liste `veranstaltungen` oder mit mehr als 3000 Einträgen wird die **ganze Datei** abgelehnt |
| `stand` | ja | Datum `JJJJ-MM-TT` der letzten inhaltlichen Änderung (nicht des letzten Abrufs; ohne Änderung bleibt die Datei byte-gleich) |
| `id` | ja | wie bei Terminen (`^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$`), eindeutig; doppelte: der erste Eintrag gilt. Aufbau siehe [id-Regel](#id-regel-für-veranstaltungen) |
| `code` | ja | Modulcode wie bei Terminen |
| `art` | ja | `Vorlesung`, `Übung`, `Tutorium`, `Seminar`, `Kolloquium`, `Praktikum`, `Kurs` oder `Sonstige`. Übungsgruppen heißen `Tutorium`, wenn der Kurs sie so nennt (Alma sagt meist „Übung“). Ein unbekannter Wert gilt im Plugin als `Sonstige` (der Eintrag bleibt). |
| `titel` | ja | 1–120 Zeichen, Regeln wie `titel` bei Terminen; der offizielle Titel aus Alma, sonst `<code> <art>` |
| `gruppe` | nein | Nummer der Parallelgruppe in Alma, ≤ 20 Zeichen, reiner Text; bei Vorlesungen meist `1`. Nicht dieselbe Nummer wie in ILIAS. |
| `tag` | ja | `Mo` bis `So`; immer der Wochentag von `zeitraum.von` (sonst wird der Eintrag verworfen) |
| `von`, `bis` | ja | `HH:MM`, `bis` nach `von`, wie in Alma (meist volle Stunden) |
| `ct` | nein | `true` = c.t. (beginnt 15 Min. später, endet 15 Min. früher), wie in `gruppen.json` |
| `rhythmus` | ja | `wöchentlich`, `14-täglich` (alle zwei Wochen ab `zeitraum.von`) oder `Einzeltermin` (`zeitraum.von` = `zeitraum.bis`). Blockveranstaltungen, tägliche und 3- oder 4-wöchentliche Serien schreibt der Export als Einzeltermine aus. Unbekannter Wert: Eintrag verworfen. |
| `zeitraum` | ja | `{ "von", "bis" }`: erster und letzter Termin der Serie; Daten wie bei Terminen, `bis ≥ von`, höchstens 400 Tage; höchstens 31 Tage vor Beginn oder nach Ende des Semesters (WS 01.10.–31.03., SS 01.04.–30.09.) |
| `raum` | nein | ≤ 120 Zeichen nach dem Säubern; mehrere Räume mit „ / “ getrennt, eine zu lange Liste als „<erster Raum> und N weitere Räume“; leer = noch kein Raum. Nennt Alma für eine Serie mehrere Räume und findet die Mehrheit der Termine in einem davon statt, steht dieser hier und die übrigen Daten stehen in `aenderungen`. |
| `ausfall` | nein | aufsteigende Liste verschiedener Daten (höchstens 100) innerhalb von `zeitraum`, an denen die Serie entfällt |
| `aenderungen` | nein | Liste (höchstens 100) von `{ "datum", "raum"?, "von"?, "bis"?, "zusatz"? }`, nur heute und künftig: an diesem Datum anderer Raum und/oder andere Zeit (`von` und `bis` nur zusammen, Regeln wie oben). `zusatz: true` = zusätzlicher Termin außerhalb des Rhythmus (mit Zeit und Raum). Datum höchstens 31 Tage außerhalb von `zeitraum`. Ein Ausfall steht in `ausfall`, nie hier. Unbekannte Schlüssel werden ignoriert. |
| `semester` | ja | `WS JJJJ/JJ` oder `SS JJJJ` |
| `quelle_url` | ja | die Alma-Detailseite der Veranstaltung, Regeln wie `quelle_url` bei Terminen |

Gesäubert wie `info` (siehe oben); ungültige Einträge werden **einzeln** verworfen, unbekannte Felder ignoriert. Die Datei
enthält das laufende und das nächste Semester; Serien, deren Ende mehr als 30 Tage zurückliegt, fallen weg.

### id-Regel für Veranstaltungen

`<semester>-<code>-<art>-<gruppe>-<termin>`, alles klein: Semester wie bei Gruppen (`ws-2026-27`), `art` ohne Umlaute
(`vorlesung`, `uebung`, `tutorium`, `seminar`, `kolloquium`, `praktikum`, `kurs`, `sonstige`), `termin` = Wochentag und Beginn
(`mi-1000`) bei regelmäßigen Serien, Datum und Beginn (`20261107-0900`) bei Einzelterminen. Haben zwei Alma-Veranstaltungen
eines Moduls dieselbe Art, bekommt die zweite ihre Alma-Nummer (`unitId`) nach der Art; gleiche ids sonst `-2`, `-3` ….
Die id bleibt, solange Wochentag und Beginn (bei Einzelterminen Datum und Beginn) bleiben: Raum, Ausfälle und Änderungen ändern
sie nie. Verlegt Alma eine Serie auf einen anderen Tag oder Beginn, ist das eine neue id (die alte fällt weg).

### Was das Plugin daraus machen soll (Entscheidungen 17.10.2026)

- **Filter:** nur das aktuelle Fachsemester (Pflichtmodule laut Musterplan der Variante) und alles mit `gewaehlt`,
  `semester_geplant` oder Status „läuft“/„angemeldet“; bestandene Module nicht. Variante „noch offen“: nur Module, die alle
  Varianten gemeinsam haben. Nur Einträge mit `semester` = aktuelles Semester.
- **Übungen und Tutorien:** Die eigene Gruppe ist eine persönliche Wahl und kommt nie zentral. Zuordnung über Code, Wochentag
  und Beginn (c.t. wie in `alma.js`), bei gleichem Zeitfenster über den Raum, nie über die Nummer. Gruppen, die man nicht
  besucht, werden keine Notizen.
- **Notizen:** eine Notiz je id (je Serie, nicht je Datum) in `Stundenplan/` mit `herkunft: zentral` und `zentral_id`; nur der
  Abrufer schreibt (wie bei Terminen), nicht jedes Gerät.
- **Alma gewinnt:** Steht dieselbe Veranstaltung im eigenen Alma-Kalender (gleicher Code, Art, Wochentag, Beginn), ersetzt die
  Alma-Notiz die zentrale; fehlt sie dort, bleibt die zentrale.
- **„Besuche ich nicht“** je id: bleibt auf den Geräten des Nutzers, auch wenn sich der Eintrag später ändert.
- **Ausfälle und Raumänderungen** nur im Wochenraster und in der Notiz, keine eigenen `Lehre`-Termine.
- **Wegfall** wie bei Terminen, mit Schutz: Fehlen auf einmal mehr als die Hälfte der zentralen Veranstaltungen, gilt keine als
  entfallen.

## Was das Plugin daraus macht (Kurzfassung)

- **Abruf:** beim Start (20 s + Zufallsversatz 0–2 Min.), dann alle 15 Min. (ohne Änderung nur das Manifest), beim Zurückkehren in die App (letzter Versuch über 10 Min. her), plus Knopf „Jetzt aktualisieren“. Ohne Netz bleibt
  der letzte Stand; es wird nichts geschrieben.
- **Nur ein Gerät schreibt:** `System/Daten/abruf.json` (`geraet`, `seit`, `zuletzt`, `mobil`, `angewendet`). Ein anderes Gerät
  übernimmt erst, wenn `zuletzt` älter als 80 Min. ist; der Abrufer erneuert die Datei höchstens alle 50 Min., bei Läufen alle
  15 Min. also etwa stündlich. Der Knopf **Aktualisieren** übernimmt sofort, außer der Abrufer hat vor weniger als 2 Min.
  abgerufen. Wer übernimmt, schreibt `abruf.json` vor den Notizen; jeder Lauf liest sie direkt vor dem Schreiben neu und schreibt
  nichts, wenn inzwischen ein anderes Gerät übernommen hat.
- **Notizen:** `Termine/JJJJ-MM-TT Titel.md` mit `herkunft: zentral` und `zentral_id`. Felder aus den Daten werden aktualisiert;
  `erledigt`, alles unter `## Meine Notizen`, eigene Felder und Tags nie. Notizen ohne `herkunft: zentral` nie, außer bei der
  Übergabe nach id (nächster Punkt).
- **Übergabe nach id (eigener Uni-Abgleich, seit 0.4.4):** Ein Abgleich, der zusätzlich eigene Termin-Notizen schreibt (z. B.
  persönliche oder zurückgehaltene Termine), kennzeichnet sie mit `abgleich_id` (= id nach der id-Regel) und ohne `herkunft`.
  Jede id gehört genau einer Notiz: Steht sie in `termine.json`, schreibt das Plugin die Notiz, sonst der Abgleich. Findet das
  Plugin für einen Termin keine Notiz mit `herkunft: zentral`, aber eine mit `abgleich_id` = id, übernimmt es genau diese
  (wird zentral, `abgleich_id` fällt weg; `erledigt`, „Meine Notizen“, eigene Felder bleiben), statt eine zweite anzulegen
  oder die id als „von dir gelöscht“ zu werten. Fällt eine id aus `termine.json`, übernimmt der Abgleich die Notiz des
  Plugins an Ort und Stelle als `abgleich_id`-Notiz, gleich nach dem Export (bevor das Plugin den Wegfall sieht). Zuordnung
  nur über die id, nie über den Dateinamen.
- **Filter:** Termine ohne `code` oder mit `bereich` für alle; mit `code` nur, wenn das Modul im eigenen Plan ist (gewählt,
  selbst geplant, läuft, angemeldet) oder laut Musterplan der gewählten Variante im aktuellen oder nächsten Fachsemester liegt.
- **Wegfall:** Fehlt eine id, wird die Notiz „(entfällt)“ (`entfaellt: true`), oder – wenn unberührt (nicht erledigt, „Meine
  Notizen“ leer) – in den Papierkorb gelegt. Nicht angefasst werden Termine, deren Ende mehr als 30 Tage zurückliegt.
  **Schutz:** Fehlen auf einmal mehr als die Hälfte (und mehr als 10) der zentralen Termine, behandelt das Plugin keinen als
  entfallen.
- **Stundenplan** (`veranstaltungen.json`, Plugin seit 17.10.2026): nur der Abrufer; eine Notiz je id in `Stundenplan/`
  für das aktuelle Fachsemester, ohne Parallelgruppen und ohne „Besuche ich nicht“ (`stundenplan_ausgeblendet` in den
  Einstellungen). Eine eigene Notiz (Alma oder von Hand) mit gleichem Code, Art, Wochentag und Beginn (±15 Min., c.t.) gewinnt.
  `ausfall` und `aenderungen` landen im Wochenraster. Wegfall mit Schutz (mehr als die Hälfte und mehr als 2 laufende Serien).
  Einzelheiten: `docs/architektur.md`, „Datenkanal“ → „Zentraler Stundenplan“.

## Pflichten des Exports (Seite des Autors, `export-daten.py` im Uni-Abgleich)

1. Nur Einträge nach Freigabeliste (Kategorie, öffentliche Quelle oder Rundmail an alle, nichts mit `persoenlich: true`,
   Persönliches nur mit `teilen: true`); nur die Felder oben; **nie** den Notiztext. `semester.json` kommt aus dem Frontmatter
   von `System/Daten/Semester.md` im Tresor des Autors; fehlt die Datei, fehlt `semester.json` (Geräte behalten ihren Stand).
2. Vor dem Veröffentlichen dieselben Prüfungen wie das Plugin (Schema, Grenzen, Domains), dazu Scan auf persönliche Daten und
   eine Höchstzahl an Änderungen je Lauf. Ein **Scan-Treffer hält nur diesen Eintrag zurück** (wie das KI-Urteil
   „persönlich“; eine schon veröffentlichte Fassung bleibt) und steht im Protokoll unter „Termine nicht an alle geteilt“.
   **Nichts** veröffentlicht wird bei: Änderungsgrenze überschritten, Schema- oder Prüfsummenfehler, `Semester.md` ohne gültiges
   Semester, Ausfall der KI-Prüfung; Hinweis ins Protokoll.
3. ids nach der id-Regel vergeben und merken.
4. Termine erst entfernen, wenn ihr Ende mindestens 30 Tage zurückliegt – oder wenn sie wirklich entfallen.
5. Prüfsummen über die geschriebenen Bytes; Manifest, Dateien und `plugin_aktuell` in einem Commit. `release`/`beta` kommen
   aus der Konfiguration des Exports und werden unverändert übernommen (nach derselben Prüfung wie im Plugin).
6. `gruppen.json` (seit 17.10.2026): aus der Gruppen-Masterliste des Abgleichs; dieselben Prüfungen wie das Plugin, dazu Scan auf
   persönliche Angaben in allen Feldern; Personennamen nur in `leitung`, und nur, wenn der Name auf der Seite unter `quelle_url`
   steht (Abruf ohne Anmeldung) und die Seite nicht ILIAS ist; Namen auf der Sperrliste fallen weg. Ein Fehler hält nur
   `gruppen.json` an (der zuletzt veröffentlichte Stand bleibt), nie die Termine.
7. `angebote.json` (seit 17.10.2026): nur von öffentlichen Seiten der Uni (Abruf ohne Anmeldung), nur die Felder oben, keine
   Beschreibungen und keine Personennamen; dieselben Prüfungen wie das Plugin und der Scan auf persönliche Angaben in allen Feldern.
   Nur etwa die nächsten acht Wochen; Vergangenes fällt beim nächsten Lauf weg. Ein Fehler hält nur `angebote.json` an, nie die
   Termine: Die zuletzt veröffentlichte Datei bleibt **im Manifest** (fehlt sie dort, löschen die Geräte ihre Angebote).
8. `veranstaltungen.json` (Vertrag seit 17.10.2026): aus dem täglichen Abruf des Vorlesungsverzeichnisses; dieselben Prüfungen
   wie das Plugin, Scan auf persönliche Angaben in jedem Feld (ein Treffer hält nur diesen Eintrag zurück; eine saubere, schon
   veröffentlichte Fassung bleibt). Eigene Änderungsgrenze (neu oder geändert, entfernt) und Schutz gegen Massenwegfall (mehr als
   die Hälfte und mehr als 20 Einträge); ist der letzte Abruf älter als drei Tage, bleibt der Stand. Eine leere oder fehlende
   Alma-Seite gilt erst beim zweiten Abruf hintereinander als „entfällt“. Ein Fehler hält nur `veranstaltungen.json` an, nie
   Termine, Semesterdaten, Gruppen oder Angebote. Vor der ersten Veröffentlichung eine Woche Trockenlauf mit privater Vorschau.
9. Schema erweitern: neue **optionale** Felder sind in `v1` erlaubt (das Plugin ignoriert Unbekanntes). Alles, was alte Plugins
   falsch verstehen würden, kommt nach `v2/`.

Testquelle mit allen Fällen: lokal beim Autor (nicht im Repo). Öffentliche Tests: `tests/` (siehe `docs/tests.md`).
