# Architektur: Verbindungen und Uni-Login

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Verbindungen und Schloss

`verbindungen.js` hält eine Registry. Eine Verbindung ist `{ id, name, art ("link" | "anmeldung" | "konto" | "volltext" | "zentral" |
"server" | "vorlage"), satz, kurz?, erklaerung, schritte, status(), gesperrt(), sichtbar()?, schlossKnopf?, trennenText?,
pruefen(link)?, verbinden(link)?, aktualisieren(parameter)?, trennen()? }`. `sichtbar()` haben nur `konto`, `volltext` und `server`.

Texte für Nicht-Techniker (seit 15.10.2026): `satz` = ein Satz Nutzen (Schloss-Karte), `kurz` = höchstens ein Satz im Fenster,
`schritte` = kurze Schritte mit Verb vorn (`**fett**` = Bedienelement, genau wie in Alma/Obsidian benannt; `[Text](https://…)`
= Link, öffnet im Browser wie andere externe Links, `ctx.verbindungen.fett`/`textTeile`), `erklaerung` =
Hintergrund, nur eingeklappt unter „Mehr erfahren“ (`<details class="eba-modal-mehr">`). In Notizen gilt dasselbe Muster mit
`<details class="eba-mehr">` (z. B. `System/Einstellungen.md`). Regel seit 17.10.2026: Was nur eine Zeile oder einen
kurzen Absatz hätte, klappt nicht ein; es steht direkt da oder entfällt.

| id | Art | Gesperrt, solange … |
|---|---|---|
| `uni-login` | „Uni-Login“ (seit 0.4.8), Art `uni`: EINE Zeile unter Verbindungen statt `ilias`, `ilias-kalender`, `alma` und `alma-konto` (`uniZeile`): „Verbunden · Unterlagen, Abgaben und Stundenplan · aktualisiert vor 5 Min.“ (nur, was hier oder über ein anderes Gerät verbunden ist; das Problem einer Quelle mit ihrem Namen dahinter), Knopf **Aktualisieren** (alles, was hier verbunden ist), „Mehr erfahren“ öffnet `UniFenster` (je Quelle ihr Stand aus den Zeilen unten und ein Schalter „auf diesem Gerät“, „Link selbst einfügen“, „Kurse“, Noten & Anmeldungen nur, wenn sichtbar; **Trennen** trennt alles hier); nur über andere Geräte „Verbunden über ein anderes Gerät · …“; nichts verbunden: Satz vor der Eingabe und **Mit Uni-Login verbinden**; eigener Uni-Abgleich: nur der Satz, was von dort kommt. Die Zeilen der vier Quellen gibt es weiter (`zeile(id)`), nur im Fenster | nie (die Schlösser gelten je Quelle) |
| `alma` | Link (iCalendar), nutzt `alma.js` (`status`, `linkPruefen`, `verbinden(link, { nurBeiErfolg })`, `trennen`, `fehler`); im eigenen Uni-Abgleich nur der Satz „Dein Stundenplan kommt über deinen Uni-Abgleich.“ ohne Knopf (Aktion `verbinden` zeigt ihn als Hinweis); ist dort doch ein Link gespeichert, holt Alma trotzdem nichts, die Zeile sagt „Der Alma-Link auf diesem Gerät wird nicht genutzt.“ und bietet Trennen als Textlink | kein Link auf diesem Gerät **und** keine eigene Notiz in `Stundenplan/` **und** keine zentrale Stundenplan-Notiz **und** kein eigener Uni-Abgleich **und** kein anderes Gerät verbunden (seit 0.4.7) **und** Alma in der Einrichtung offen (übersprungen oder Einrichtung nicht fertig, `ctx.einrichtung.almaOffen()`; seit 0.3.0) |
| `ilias` | „ILIAS-Unterlagen“ (seit 0.4.0), Anmeldung mit Benutzername und Passwort über `ctx.ilias` (siehe [„ILIAS-Unterlagen“](unterlagen.md)); eigenes Fenster `IliasFenster`, seit 0.4.8 „Mit Uni-Login verbinden“ (`anmeldenTitel`): danach verbindet `uni-login.js` ILIAS-Kalender und Alma mit, ihre Zeilen stehen im Fenster, ist es zu, kommt ein Hinweis (siehe „Uni-Login“); Knopf Verbinden, verbunden Aktualisieren (lädt gerade ein anderes Gerät: Hier aktualisieren). Im eigenen Uni-Abgleich heißt sie „ILIAS“: nicht verbunden der Satz „Deine Unterlagen kommen über deinen Uni-Abgleich.“ und leise **Für Übungsgruppen verbinden** (öffnet gleich die Anmeldung, eigene Texte ohne Schritte, danach schließt das Fenster); verbunden Stand der Prüfung, Knopf **Aktualisieren**, Textlink **Trennen** | nicht verbunden **und** keine Begleitnotiz mit `ilias_id` unter `Unterlagen/` **und** kein anderes Gerät verbunden (seit 0.4.7) **und** ILIAS in der Einrichtung offen (`ctx.einrichtung.iliasOffen()`); nie im eigenen Uni-Abgleich oder ohne Anmeldebaustein |
| `alma-konto` | „Noten & Anmeldungen (Alma)“ (seit 0.4.5, Beta), Art `konto`: Zeile (`ctx.almaKonto.zeile()`) und Fenster (`fensterOeffnen()`) kommen aus `alma-konto.js`; ohne Beta, Zustimmung und Daten keine Zeile (`sichtbar()`). „ILIAS verbinden“ aus dieser Zeile öffnet das ILIAS-Fenster mit `fuer=alma`: danach sind alle neuen Kurse aus (`kurseAbrufen({ alleAus: true })`), kein erster Abruf | nie |
| `ilias-kalender` | „ILIAS-Kalender“ (seit 18.10.2026, `ilias-kalender.js`), Art `link` wie Alma: nicht verbunden Satz und **Verbinden** (Symbol aus, keine Pille, kein Schloss); verbunden Stand aus `standText` und die Zahl der kommenden offenen Abgaben („Aktualisiert vor 5 Min. 3 Abgaben stehen bei deinen Fristen.“), Knopf Aktualisieren bzw. Hier aktualisieren, „Mehr erfahren“ öffnet das Link-Fenster (Neuen Link eingeben, Trennen); von außen nur der Satz „Deine Abgaben aus ILIAS kommen über deinen Uni-Abgleich.“ (mit gespeichertem Link Textlink Trennen). Die Link-Fenster nehmen ihre Texte aus der Registry (`laedt`, `danach`, `neuerLink`, `externText`; Alma unverändert) | nie |
| `volltext` | „Suche in PDFs“ (seit 0.4.5, `volltext.js`; bis 24.10.2026 „Volltext der PDFs“): Text mit den Zahlen aus `ctx.volltext.status()` („58 PDFs durchsuchbar, 2 ohne Text.“), Knopf Aktualisieren (`nachholen`; liest gerade ein anderes Gerät: Hier aktualisieren, `hier=1`); aus: Einschalten öffnet das Fenster mit dem Schalter „Textfassungen anlegen“ (`setzen`, für alle Geräte); extern oder fremde Textfassungen: nur der Satz | nie |
| `zentral` | Zentrale Daten (`zentral.js`), Knopf Aktualisieren (aus: Einschalten); die Schalter Zentrale Daten und Fachschaft & Veranstaltungen stehen im Fenster „Mehr erfahren“ | nie (Standard an) |
| `claude` | „Claude“ (`claude.js`, seit 0.6.3): Zeile aus `ctx.claude.zeile()`, im Fenster unter Kurztext und Schritten `ctx.claude.fensterInhalt` (Feld für den Schlüssel und **Verbinden**; verbunden Verbrauch des Monats, Link zur Console, „Dieses Gerät trennen“). Seit 26.10.2026 nur für Fortgeschrittene, nie als empfohlener Weg (jede Zusammenfassung kostet extra, der eigene Server fasst über das Claude-Abo zusammen): die Zeile nur, wenn dieses Gerät verbunden ist; sonst führt nur der leise Link „Für Fortgeschrittene: ohne Server mit API-Schlüssel, …“ ganz unten im Fenster „Eigener Server“ (ohne Server) hierher (`wechselLink`). Nicht verbunden zeigt das Fenster zuerst die Kosten, den Link „Lieber einen eigenen Server einrichten“ und erst unter „Trotzdem mit API-Schlüssel verbinden“ (eingeklappt) Schritte und Feld | nie |
| `server` | „Eigener Server“ (`server.js`), Beschreibung „Fasst Unterlagen mit deinem Claude-Abo zusammen“ (seit 26.10.2026; der empfohlene Weg zum Zusammenfassen): ohne Server (keine Schlüssel hier, keine `server.json` per Sync) leise „Für Technische: …“ mit Mehr erfahren (Fenster: drei Schritte, Knopf Prompt kopieren, was es kostet und braucht); sonst Zeile aus `ctx.server.zeile()`, Knopf Aktualisieren (holt ein anderes Gerät gerade ab: Hier aktualisieren), Fenster mit Stand, Hinweisen und Trennen; ohne Verbindung auf diesem Gerät die Schritte zum Verbinden (Link vom Server) | nie |
| `vorlage` | „Updates“ (`update.js`; bis 24.10.2026 „Studium Autopilot“, das neben „Neue Version“ auf dem iPhone keinen Platz ließ): Version, Knopf Aktualisieren bzw. Neu laden, sonst Mehr erfahren; Schalter „Beta-Versionen“ im Fenster unter „Mehr erfahren“ | nie |

- **Über ein anderes Gerät verbunden** (seit 0.4.7, `ctx.verbindungen.imTresor(id)` → `{ art: hier | anderswo | nein, zuletzt }`, aus
  `Q.verbindung`): Bis 0.4.6 bot jedes Gerät ohne eigenen Link bzw. Zugang **Verbinden** an (Zeile, **Alma verbinden** auf
  Stundenplan), obwohl die Daten über ein anderes Gerät kamen; das sah nach „nicht verbunden“ aus. `sperrenLesen` liest die Sperren
  von Alma, ILIAS, ILIAS-Kalender und Noten & Anmeldungen (`System/Daten/<quelle>-abruf.json`) beim Start und nach jeder Änderung
  (Sync, eigener Lauf) und zeichnet geändert neu. Hält ein anderes Gerät eine davon (höchstens 7 Tage still), sagt die Zeile
  „Verbunden über ein anderes Gerät · aktualisiert vor 3 Std.“ (ILIAS im eigenen Uni-Abgleich mit dessen Satz dahinter, Noten &
  Anmeldungen statt „Braucht deinen Uni-Zugang“), Pille „verbunden“, Haken, rechts nur **Mehr erfahren**. Das Fenster
  (`AnderswoFenster`) zeigt den Stand und leise **Auch hier verbinden** (Aktion `verbinden` mit `auch=1`; aus Noten & Anmeldungen das
  ILIAS-Fenster mit `fuer=alma`). Kein Schloss, auf Unterlagen bleibt **Unterlagen aktualisieren**
  ausgeblendet. Länger still, frei oder von außen: wie bisher. Hat ILIAS dein Passwort abgelehnt, gilt ILIAS nie als anderswo
  verbunden. Nach Verbinden und Trennen auf diesem Gerät zeichnen alle Blöcke neu (`neuZeichnen`, auch nach Verbinden über
  den Befehl **Stundenplan aktualisieren** in `alma.js`). Tests: `tests/verbindungen.test.js`, `tests/quellen.test.js`.
- Symbole (seit 15.10.2026, iPad-Test): ruhige Lucide-Linien als inline-SVG in `currentColor` (`SYMBOLE`, `ctx.verbindungen.svg(name)`:
  schloss, haken, uhr, extern, warnung, pause, aus; seit 24.10.2026 je Sache schluessel, pdf-suche, uni, ki, server, update),
  keine Emojis; `setIcon` blieb auf dem iPad leer (so auch im Raster-Menü bis 0.4.6).
- Codeblock `eba-schloss <id>`: Solange gesperrt, eine Karte mit Schloss-Symbol, einem Satz und „Verbinden“. Steht der Block in einer Karte
  (Callout), blendet CSS (`:has`) den übrigen Inhalt aus, z. B. das Wochenraster auf Dashboard und Stundenplan. Sind
  Stundenplan-Notizen da (etwa per Sync), gibt es kein Schloss; die Übersicht sagt dann „Dein Stundenplan liegt vor (n
  Einträge).“ mit leisem Verbinden.
- Codeblock `eba-verbindungen`: Übersicht in den Einstellungen, ohne Satz darüber. Seit 24.10.2026 je Verbindung eine kompakte
  Zeile wie in den Einstellungen von iPhone und iPad, auf allen Geräten gleich (`kompakt(v, st)`, CSS `.eba-ez` in eba-core.css
  43): Symbol der Sache (`v.symbol`), Name, rechts ein kurzer Stand und der Pfeil, darunter in wenigen Wörtern, was die Sache
  tut (`v.beschreibung`, z. B. „Fasst deine Unterlagen mit KI zusammen“; Uni-Login: was hier verbunden ist; Updates:
  „Version 0.6.7 installiert“). Das Symbol ist grün bei verbunden oder an, im Akzent, wenn etwas wartet, sonst gedämpft. Der
  Stand ist ein Wort und steht immer neben dem Namen (Name und Stand höchstens 24 Zeichen, Test; CSS kürzt sonst mit „…“):
  `st.kurz` (Updates: „Aktuell“, ohne Release-Angaben „Nicht geprüft“; Uni-Login im eigenen Uni-Abgleich: „Nicht nötig“,
  darunter, was von dort kommt), sonst die Pille in Worten („Verbunden“, „Aus“, „Neue Version“), sonst das Symbol: ein Haken
  heißt bei Schaltern (`SCHALTER`: Zentrale Daten, Suche in PDFs, auch von außen) „An“, sonst „Verbunden“; Schloss und extern
  „Aus“. Ein Problem (Warnsymbol) färbt Symbol und Stand, heißt immer „Fehler“ (auch statt „neu verbinden“) und steht statt
  der Beschreibung als Satz in der zweiten Zeile (`st.unter` oder der Satz der Zeile). In 0.6.7 gab es die zweite Zeile nur
  bei einem Problem, rechts standen „Über Uni-Abgleich“ und die nackte Version: Ohne Vorwissen war nicht klar, was eine Zeile
  tut und ob sie an ist. Am selben Tag rutschten „Nicht verbunden“ und „Neue Version“ noch in eine eigene Zeile unter den
  Namen; seitdem „Aus“ und der Name „Updates“. Die ganze Zeile ist ein Link: auf das Ziel
  des Knopfs, wenn er selbst ein Fenster öffnet (Verbinden, Einschalten, Mehr erfahren), sonst ins Fenster der Verbindung. Dort
  steht der Knopf der Zeile unten (`zeilenKnopf`: Aktualisieren, Hier aktualisieren, Neu laden, Nach Updates suchen, Neue
  Version installieren). Bis 0.6.6 standen Satz, Pille und Knopf in der Zeile; die Seite war auf dem iPhone fast doppelt so lang.
  Das Modell darunter (`statusZeile`) ist unverändert: Je Zeile
  höchstens **ein** Knopf (Verbinden, Aktualisieren, Hier aktualisieren, Einschalten, Neu laden oder Mehr erfahren; Wörter
  nach Entscheidung E1 in `WORT`); führt er nicht ins Fenster, steht „Mehr erfahren“ als Textlink im Status. Das Fenster enthält den Rest: bei Alma
  (verbunden) „Neuen Link eingeben“ und „Trennen“, bei den zentralen Daten die beiden Schalter (Obsidian-`Setting` mit
  Umschalter). Hätte das Fenster nur einen Knopf, steht er selbst als Textlink da (ILIAS nur für Übungsgruppen: „Trennen“).
  Inhalt je Zeile: `zeile(id)` (`statusZeile`) → `{ text | html, pille, symbol, ton, knopf, link }`. Seit 18.10.2026
  widersprechen sich Symbol und Pille nie: Pille nur, wo der Stand zählt („verbunden“, „nicht verbunden“ nur mit Schloss,
  wenn nichts da ist und Verbinden der Weg ist, „Anmeldung prüfen“ mit Warnung). Kommt etwas ohnehin (Stundenplan oder
  Unterlagen per Sync, zentraler Stundenplan, eigener Uni-Abgleich), steht ein Haken ohne Pille da und Verbinden ist leise.
  Fenster haben keinen Knopf, der nur schließt (dafür ist das ×), und höchstens einen Hauptknopf.
- **Stand einer Quelle, eine Formatierung** (Quellen-Vertrag, seit 0.4.5): `standText(s)` macht aus der gemeinsamen Form
  `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` den Satz und das Symbol jeder Zeile: „Aktualisiert vor 5 Min.“ bzw.
  „Noch nicht aktualisiert.“ (Haken), Warnungen des letzten Laufs dahinter (Warnsymbol), ein Fehler als Satz der Quelle mit
  „Zuletzt aktualisiert …“ (Warnsymbol, bleibt bis zum nächsten Erfolg), „Ein anderes Gerät aktualisiert, alles kommt über deinen
  Sync.“ mit dem Knopf **Hier aktualisieren**, „Aktualisiert gerade …“ (Uhr). Zeitwörter aus `quellen.js` (`vorText`). So zeigen
  Alma-Stundenplan, ILIAS, Zentrale Daten, Volltext, Noten & Anmeldungen und der eigene Server (über `ctx.verbindungen.standText`) dieselben
  Wörter; Sonderfälle (nicht verbunden, abgelehnt, extern, Fortschritt) formuliert die Quelle selbst. Liefert eine Quelle ihre
  Zeile selbst (`zeile()`, Noten & Anmeldungen, eigener Server), baut `quelleZeile(z)` daraus das HTML.
- Verbinden-Fenster: vier Schritte (Link zu Alma, Link zum Stundenplan → „Daten für iCalendar (ics) exportieren“ → „Link
  kopieren“; Einrichtung ebenso). Die Links (`ctx.verbindungen.ALMA`) sind am 17.10.2026 mit Anmeldung geprüft; ohne Anmeldung
  führt der Stundenplan-Link zur Anmeldung und danach zur Startseite, darum zuerst Alma. Der Weg durchs Menü (Mein Studium →
  Stundenplan) steht unter „Mehr erfahren“, falls Alma die Adresse ändert. Eingabe mit Prüfung (https/webcal, Server alma.uni-tuebingen.de, nicht nur die Startseite), sofortiger Import, Ergebnis mit
  Anzahl. Scheitert der Abruf, bleibt kein Link gespeichert (vorheriger Zustand gilt wieder). Mit gespeichertem Uni-Login (seit
  0.4.8, Alma und ILIAS-Kalender) statt der Schritte ein Satz mit dem Benutzernamen und **Verbinden**: Studium Autopilot holt den
  Link selbst; scheitert das, zeigt das Fenster die Schritte zum Einfügen mit dem Grund darüber. Ohne Uni-Login auf diesem Gerät
  steht unter den Schritten leise „Ohne Kopieren: Mit Uni-Login verbinden“ (siehe „Uni-Login“).
- Gespeichert wird nur gerätelokal (`app.saveLocalStorage`): `eba-alma-ics`, `eba-alma-stand`, `eba-alma-seit`.
- Codeblock `eba-alma-knoepfe` (Seite Stundenplan, 0.3.0 bis 0.6.5): zeigte verbunden „Stundenplan aktualisieren“, sonst „Alma
  verbinden“ und einen Satz dazu. Seit 24.10.2026 steht er nicht mehr auf der Seite und zeichnet nichts, damit ältere, selbst
  geänderte Seiten keinen Codeblock zeigen: Alma holt stündlich, von Hand **Aktualisieren** in der Zeile Uni-Login bzw. der Befehl
  **Stundenplan aktualisieren**; „Alma brauchst du nur für Extras“ sagt die Zeile Alma, die Bitte um den Studienbeginn das
  Wochenraster.
- Codeblock `eba-ilias-knopf` (Seite Unterlagen, seit 0.4.0): steht leer in der Knopf-Karte und trägt die Klasse `eba-ilias-an`,
  solange ILIAS auf diesem Gerät verbunden ist. Dann zeigt CSS (Abschnitt 49, `:has`) den festen Knopf **Unterlagen aktualisieren**
  derselben Karte (Aktion `ilias-holen`), sonst ist er ausgeblendet. Darunter steht `eba-schloss ilias`.
- Für andere Skripte: `ctx.verbindungen.gesperrt(id)`, `ctx.verbindungen.schlossKarte(el, id)`.

## Uni-Login (seit 0.4.8, `uni-login.js`)

Einmal Benutzername und Passwort der Uni, dann verbindet Studium Autopilot alles, was diesen Login braucht: ILIAS-Unterlagen,
den ILIAS-Kalender und den Alma-Stundenplan. Bis 0.4.7 musste man die Abo-Links von ILIAS-Kalender und Alma selbst kopieren
(je vier Schritte in ILIAS bzw. Alma), obwohl das Passwort für ILIAS schon gespeichert war.

- **Zustimmung** (Entscheidung vom 19.10.2026, Bedingung des Orchestrators): Wer seinen Uni-Login eingibt, stimmt zu, dass sich
  Studium Autopilot damit bei ILIAS **und** Alma anmeldet, aber nur, wenn das Fenster es vor der Eingabe sagt. Darum nennt im
  Fenster „Mit Uni-Login verbinden“ (`IliasFenster`) und in der Einrichtung (Bildschirm 5) ein Satz über den Feldern, was der
  Login holt („Mit deinem Uni-Login holt Studium Autopilot deine Unterlagen aus ILIAS, die Abgaben aus dem ILIAS-Kalender und
  deinen Alma-Stundenplan.“, Registry `kurz`; was von außen kommt, fehlt im Satz; aus Noten & Anmeldungen `kurzOhneKurse`), und
  die Datenschutz-Zeile, wo er sich anmeldet („Damit meldet sich Studium Autopilot bei ILIAS und Alma an. …“). Die Zustimmung gilt
  je Quelle und Gerät (gerätelokal `eba-uni-zustimmung`) und nur für das Passwort, das danach gespeichert ist (Zeitpunkt ≥
  `uniZugang().seit`): `zustimmen(uniQuellen)` nach der Anmeldung in diesen beiden Fenstern (genau die Quellen, die der Satz
  nannte, Registry `uniQuellen`; liest die Einrichtung eine ältere Registry ohne das Feld, für keine), `zustimmen([id])` beim Tipp auf **Verbinden** im
  Link-Fenster einer Quelle (der Satz dort sagt, bei wem es sich anmeldet) und in der Einrichtung mit schon gespeichertem Login
  (der Satz nennt, was fehlt und wo es sich anmeldet). Von selbst verbindet der Uni-Login nach der Anmeldung nur, was zugestimmt,
  hier nicht verbunden, nicht über ein anderes deiner Geräte verbunden (`ctx.verbindungen.imTresor`, wie Zeilen und Schloss) und
  nicht von außen ist (`offen()`; `moeglich()` ohne die Zustimmung). In einem Tresor mit eigenem Uni-Abgleich also nichts; dort
  meldet sich das Fenster nur für die Übungsgruppen bei ILIAS an und verbindet nichts weiter. Ein Login aus 0.4.7 oder früher hat
  keine Zustimmung: Dort passiert nichts von selbst, auch kein neuer Link im Hintergrund, bis zum Tipp auf **Verbinden**.
  **Noten & Anmeldungen** bleibt davon getrennt (Beta, eigenes **Einschalten**).
- **ILIAS-Kalender:** `ctx.ilias.kalenderLinks()` nimmt die Sitzung des letzten Laufs (sonst eine neue Anmeldung, wie ein Lauf
  nur mit Zugang und ohne Ablehnung), holt `ilias.php?baseClass=ilDashboardGUI&cmd=jumpToCalendar` und daraus das Fenster
  „Kalender abonnieren“ (`ilias-html.js` `aboFenster`: ajaxRenderUrl mit `cmdClass=ilcalendarsubscriptiongui&cmd=getModalForSubscription`;
  `aboLinks`: die Links aus `a href` und `input value`). ILIAS legt den Schlüssel nur beim ersten Öffnen an, danach bleibt
  derselbe. `ctx.iliasKalender.linkWaehlen` nimmt „iCal-URL (Google Kalender)“ (`limited=1`: ohne Termine, die älter als 30 Tage
  sind; für Abgaben reicht das Künftige, und der Kalender bleibt unter der Grenze von 1 MB), sonst „iCal-URL“. Lehnt ILIAS das
  Passwort dabei ab, gilt dasselbe wie nach einem Lauf (Stand gesperrt, Marker, Gruppen frei).
- **Alma-Stundenplan:** `ctx.almaKonto.stundenplanLink()` (ohne Beta und ohne **Einschalten**) meldet sich mit derselben Anmeldung
  wie Noten & Anmeldungen an (`mitAlma`: Drossel, nur `alma.uni-tuebingen.de`, Abmelden in jedem Ausgang), liest „Mein Studium →
  Stundenplan“ und meldet sich ab. Der Link steht dort schon im versteckten Fenster „Daten für iCalendar (ics) exportieren“
  (`alma-konto-html.js` `stundenplanLink`: `textarea …:ical:cal_add` und `data-page-permalink`; zwei verschiedene → keiner).
  Nichts wird angeklickt; „Sicherheitsmaßnahmen erneuern“ im selben Fenster erneuert den Schlüssel im Link und bleibt
  unberührt. Wie ein Lauf nur, wenn ILIAS das Passwort bestätigt hat (`uniZugang().bestaetigt`), nie nach einer Ablehnung; lehnt
  Alma eindeutig ab, schreibt das Gerät den Marker. Der Stand von Noten & Anmeldungen bleibt unberührt. Eine Alma-Sitzung zugleich:
  Auf iPhone und iPad teilen sich Sitzungen die Kekse, das Abmelden der einen beendete die andere; darum wartet der Link-Abruf auf
  einen laufenden Lauf von Noten & Anmeldungen und umgekehrt. Hat Alma gebremst (`pauseBis` nach 403/429 oder wiederholten
  Fehlern), meldet sich auch der Link-Abruf bis dahin nicht an (`art: "stopp"`).
- **Verbinden** danach wie mit einem eingefügten Link (`ctx.verbindungen.holen(id).verbinden(link)`): Nur wenn der erste Abruf
  klappt, bleibt der Link gespeichert (gerätelokal `eba-ilias-ics` bzw. `eba-alma-ics`, nie im Tresor).
- **Link gilt nicht mehr:** Zeigt ein Abruf auf den Link (ILIAS: 200 ohne Kalender, 401, 403, 404, 410; Alma: 200 ohne
  Stundenplan, 401, 404, 410, nicht 403, so bremst Alma), fragen `ilias-kalender.js` und `alma.js` `erneuern(id, alterLink)`. Mit
  Zustimmung für diese Quelle höchstens einmal am Tag je Quelle und Gerät (gerätelokal `eba-uni-erneuert`) holt das einen neuen
  Link; die Quelle speichert ihn und versucht es gleich noch einmal (`erneuert`). Derselbe Link zählt nicht als neu. Beim Verbinden
  mit einem eingegebenen Link nie (`erneuert: true`).
- **Oberfläche:** Link-Fenster (Alma, ILIAS-Kalender) mit gespeichertem Uni-Login: „Studium Autopilot meldet sich mit deinem
  Uni-Login **zxabc01** bei Alma (bzw. ILIAS) an und holt den Link selbst.“, **Verbinden** und leise „Link selbst einfügen“;
  scheitert es, die Schritte zum Einfügen mit dem Grund darüber (`vonHand`). Ohne Uni-Login auf diesem Gerät steht unter den
  Schritten leise „Ohne Kopieren: Mit Uni-Login verbinden“. Im Fenster „Mit Uni-Login verbinden“ stehen nach den Kursen Zeilen
  für Kalender und Alma („… wird verbunden …“, dann ✓ mit Ergebnis oder der Grund; `uniStandZeigen`); ist das Fenster schon zu,
  kommt ein Hinweis mit höchstens zwei Sätzen ohne Vorsatz (`hinweis`). Fehlersätze je Grund (abgelehnt, zweiter Faktor,
  Zustimmung, unklare Antwort, kein Link, keine Verbindung, gebremst, Login fehlt, alte Fassung; ILIAS: der Satz der Anmeldung mit
  Code, ohne Adressen). Wort: **Uni-Login** (Wortliste, nicht „Uni-Zugang“).
- **Absicherung beim Tipp:** `linkHolen` fragt jedes Mal neu, ob es geht (Login bereit, nicht von außen; per Sync kann ein eigener
  Uni-Abgleich ankommen, während ein Fenster offen ist; dann zeigt das Link-Fenster nur den Satz und bietet kein Einfügen an).
  `bereit()` prüft neben dem Marker auch den Stand von ILIAS (`gesperrt`), falls der Marker nach einer Ablehnung nicht geschrieben
  werden konnte; der Grund heißt dann wie bei ILIAS (abgelehnt, zweiter Faktor, Zustimmung), nicht „Login fehlt“.
- **Trennen** bleibt je Quelle: ILIAS trennen löscht den Uni-Login; Kalender und Stundenplan behalten ihre Links.
- **Schnittstelle** (Bibliothek, `ctx.user["uni-login"](ctx)`; beim Laden passiert nichts): `bereit()`, `kannSelbst(id)`,
  `zugestimmt(id)`, `zustimmen(ids?)`, `moeglich()`, `offen()`, `linkHolen(id)`, `verbinden(id)` → `{ ok, text }` | `{ ok: false, art,
  fehler }`, `alleVerbinden({ schritt })`, `erneuern(id, alt)`, `zeile(id, ergebnis)`, `hinweis(ergebnisse)`, `QUELLEN`, `NAME`.
  Gleichzeitige Aufrufe für dieselbe Quelle teilen einen Abruf.
- **Geprüft vor dem Release** (adversariale Prüfung am 19.10.2026, nach dem Zusammenführen nachgeholt): Behoben wurden die
  Anmeldung bei Alma im Hintergrund mit einem Login aus 0.4.7 (jetzt Zustimmung je Quelle), die Schritt-Zählung der Einrichtung
  (`einrichtung_fassung`), gleichzeitige Alma-Sitzungen, die Anmeldung trotz Bremse (403, `pauseBis`), der fehlende Weg zum
  Einfügen, Fehlersätze, der Hinweis, zwei Namen für Alma und die Absicherung beim Tipp; eine Kontrollrunde fand danach drei kleine
  Folgefehler (Zustimmung für Ungenanntes, Schloss eines Tresors aus 0.3.x nach erneutem Start, Grund bei Sperre), auch behoben.
  Die Prüfung vor dem Release 0.4.8 fand noch zwei Lücken, behoben: Die Einrichtung stimmte auch nach dem Satz einer älteren
  Registry zu (Skripte kommen per Sync einzeln), und eine Quelle ohne lesbaren Stand galt als „nicht von außen“.
  Bewusst offen: Zwei gleichzeitige
  Anmeldungen bei ILIAS, wenn der Kalender-Link genau dann erneuert wird, während ein ILIAS-Lauf ohne gemerkte Sitzung anfängt
  (höchstens einmal am Tag, beide Anmeldungen gelten).
- **Geprüft** am 19.10.2026 an echten Seiten (ein Konto, nur lesend): Beide Links standen nach der Anmeldung in der Seite bzw.
  im nachgeladenen Fenster und waren gleich den gespeicherten; das Lesen hat keinen neuen Link erzeugt.
- **Tests:** `tests/uni-login.test.js` (Reihenfolge, nur mit bestätigtem Login, Zustimmung je Quelle und Passwort, übersprungen,
  Fehler je Quelle, Hinweis, einmal am Tag, Absicherung, geteilter Abruf), `tests/verbindungen.test.js` (Sätze vor der Eingabe),
  `tests/einrichtung.test.js` (Schritt-Zählung, Schloss), `tests/ilias-html.test.js` (`aboFenster`, `aboLinks`), `tests/alma-konto-html.test.js` (`stundenplanLink`),
  `tests/alma-konto.test.js` (Ablauf am PC und wie auf iOS, Passwort nur im POST, Ablehnung, kein Link), `tests/ilias.test.js`
  (Kalender-Abo über die Sitzung der Prüfung, Ablehnung), `tests/ilias-kalender.test.js` und `tests/alma.test.js` (neuer Link).
