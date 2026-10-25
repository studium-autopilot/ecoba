# Architektur: Karteikarten, Lernplan, Literaturliste

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Karteikarten (seit 17.10.2026, `karten.js`, `fsrs.js`)

Ein eigener Lernmodus statt eines fremden Plugins (eine Installation, Design „Ruhig“, alle Geräte). Verhalten wie Anki, Planung
mit FSRS-6. Von Anki (AGPL) ist kein Code übernommen; Formeln und Standardparameter folgen ts-fsrs (MIT, `THIRD_PARTY_NOTICES.md`).

**In Entwicklung** (seit 24.10.2026): In der Übersicht ist die Zeile „Karteikarten“ abgeblendet und trägt rechts „in Entwicklung“
(`IN_ENTWICKLUNG` in `seitenleiste.js`). Die Seite selbst hat keinen Warnkasten wie der Lernplan.

**Kartennotizen:** Markdown unter `Karteikarten/` (beliebig tief). Stapel = Modul: `code` im Frontmatter, sonst der Code am Anfang
des Datei- oder Ordnernamens; ohne Code ist jede Notiz ein eigener Stapel. Mehrere Notizen je Modul sind Unterstapel (in der
Übersicht aufklappbar, einzeln lernbar). Dateiname nie gleich dem einer anderen Notiz, sonst wären Links wie `[[S100 …]]`
mehrdeutig: der Stapel eines Moduls heißt „S100 Karteikarten“, weitere „S100 Kapitel 2“, ein schon vergebener Name bekommt
„ (Karteikarten)“ (`stapelName`). Ältere Stapel mit dem Namen einer anderen Notiz benennt `namenPruefen` einmal beim Start um
(Modulname → „<Code> Karteikarten“, sonst Zusatz; `stapelUmbenennung`), nur auf dem Abrufer (`ctx.zentral.abruferHier`), mit
`fileManager.renameFile`; Lernstände hängen an der Kennung und bleiben. `parsen(text, pfad)` liest Blöcke, die durch Leerzeilen
getrennt sind:

| Form | Karten (Schlüssel) |
|---|---|
| `Frage :: Antwort` | eine (`<id>`); mehrere solche Zeilen direkt untereinander, auch als Liste, sind je eine Karte |
| `Frage ::: Antwort` | zwei (`<id>`, rückwärts `<id>-r`) |
| Frage, Zeile `?`, Antwort (`??` mit Rückseite) | über mehrere Zeilen, eine bzw. zwei |
| `… {{c1::Text::Hinweis}} …` | Lückentext, je Nummer eine (`<id>-c1`, `<id>-c2` …) |

Nicht gelesen werden Frontmatter, Code, `%% %%`, `<!-- -->`, Blöcke, die mit `>`, `|` oder `<` beginnen, und Trennlinien.
Überschriften setzen das Kapitel (Anzeige im Lernfenster). Trenner in Lücken, Inline-Code und `$…$` zählen nicht (`trenner`).

**Kennung:** Block-ID am Ende des Blocks (` ^k1a2b3c`; Obsidian blendet sie in der Leseansicht aus). Karten derselben Notiz sind
Geschwister (`nid`). Ohne ID gilt ein vorläufiger Schlüssel (`?` + Hash von Pfad und Text, zählt als neu). `kennungenSetzen` schreibt
fehlende IDs beim Start einer Lernrunde und ersetzt IDs, die in der Notiz doppelt sind oder schon einer anderen Notiz gehören (die
erste nach Pfad behält sie). Steht die ID einer Karte über mehrere Zeilen in einer früheren Zeile (Karte in der Notiz verlängert),
gilt sie weiter und rückt dabei ans Ende; vor der letzten Zeile zählt dafür nur die Form, die das Plugin vergibt (`^k` + 6 Zeichen),
damit Text wie „r ^2“ Text bleibt. Sonst schreibt `karten.js` in Kartennotizen nur bei **Neue Karte** (Block ans Ende, `karteText`) und
**Bearbeiten** im Lernfenster (`blockErsetzen`, nur wenn der Block noch unverändert ist).

**Lernstände:** `System/Daten/Karteikarten/<Gerät>.jsonl` (Geräte-ID `eba-geraet` wie `zentral.js`). Erste Zeile `{ v: 1, geraet }`,
dann je Ereignis eine Zeile: Bewertung `{ k, t, b: 1–4, d }` (Antwortzeit in ms, höchstens 60 s) oder Aktion `{ k, t, a }` mit `aus`
(aussetzen), `an` (fortsetzen), `neu` (zurücksetzen), `zur` (bis morgen zurückstellen). Jedes Gerät hängt nur an seine eigene Datei
an (`vault.append`; eine Aktion für mehrere Karten ist ein Schreibvorgang). Rückgängig nimmt genau die Zeilen dieser Bewertung oder
Aktion heraus, auch wenn danach weitere kamen (`zuruecknehmen`, nach Inhalt `k|t|b|a`: `ereignisSchluessel`, `zeilenOhne`, in
`vault.process`). Die eigene Datei wird einmal gelesen und dann im
Speicher geführt; neu gelesen nur, wenn sie gelöscht oder von außen geändert wurde (Ereignisse während des eigenen Schreibens oder
mit dem danach gemerkten Stand `mtime|size` zählen nicht). Dateien anderer Geräte werden bei jeder Änderung neu gelesen. Kaputte Zeilen fallen weg (`zeileLesen`), doppelte Ereignisse
zählen einmal. `nachspielen` rechnet aus allen Ereignissen (nach Zeit) den Stand jeder Karte und das Protokoll für Tageslimits und
Statistik. Darum gibt es keine Sync-Konflikte, eine geänderte Behaltensquote gilt sofort für alle Karten, und die Geschichte reicht
später, um die Parameter zu optimieren. Nie im Release (`release.py`, `pruefen.py`, `.gitignore`); das Update fasst den Ordner nicht an.

**Planung (`fsrs.js`, Helfer):** FSRS-6 mit den 21 Standardparametern; ein Lerntag beginnt um `karten_tagesbeginn` (4 Uhr). Zustände
Neu, Lernen, Wiederholen, Neu-Lernen. Lernschritte (`1m 10m`) und Schritte nach einem Fehler (`10m`) wie in Anki: Nochmal → erster
Schritt, Schwer → Mitte der ersten beiden Schritte (sonst derselbe Schritt noch einmal), Gut → nächster Schritt oder Abschluss,
Einfach → Abschluss. Am selben Tag gilt die kurzfristige Stabilität, sonst die langfristige. Intervalle Schwer < Gut < Einfach,
Streuung wie Anki ab 2,5 Tagen, aber reproduzierbar (Zufall aus Kartenschlüssel und Zahl der Wiederholungen), damit jedes Gerät
denselben Stand rechnet. `vorschau` liefert alle vier Folgezustände für die Beschriftung der Knöpfe.

**Tagesplan und Lernrunde:** `tagesplan` zählt neue Karten je Modul bis `karten_neu_pro_tag` (20) und über alle Module bis
`karten_neu_gesamt` (20; seit 25.10.2026, vorher kamen bei fünf Modulen 100 neue Karten am Tag). Die Grenze über alle zählt jede
heute zum ersten Mal gelernte Karte, auch aus Stapeln außerhalb der Auswahl; neue Karten kommen abwechselnd aus den Modulen (erste
jedes Moduls, dann die zweite …). Wiederholungen bis `karten_wdh_pro_tag` (200) je Modul, Lernschritte ohne Grenze. Fälliges nach
Fälligkeit, dann zufällig je Tag; neue Karten in der Reihenfolge der Notiz oder zufällig (`karten_neu_reihenfolge`). Geschwister
(`karten_geschwister`): höchstens eine Karte je Notiz am Tag. Ausgesetzte und zurückgestellte Karten fehlen, ebenso alle Karten
eines pausierten Stapels (`pausiert: true` im Frontmatter der Kartennotiz, `k.pausiert`; ein Modul ist pausiert, wenn alle seine
Notizen es sind). `gesperrt` sind die neuen Karten, die nur ein Limit aufhält (Geschwister zählen einmal). „N neue Karten mehr“
(`mehrNeu`, gerätelokal `eba-karten-extra` für den Tag) gibt genau die nächsten höchstens 10 davon frei: je Modul so viele mehr, wie
von dort kommen, und ebenso viele über alle (`gesamt`); vorher gab **Alles lernen** 10 je Modul. `naechsteKarte`: fällige Lernschritte
zuerst, sonst neue und fällige gleichmäßig gemischt, sonst Lernschritte bis 20 Min. im Voraus (die Zahl „Lernen“ im Fenster zählt
dasselbe, `lernenJetzt`). Schwierige Karten (`karten_schwierig_ab`, beim 8. Fehler, dann bei jedem weiteren halben Schwellenwert)
werden nur markiert und weiter wiederholt; ausgesetzt wird nie von selbst (bis 25.10.2026 `karten_schwierig_aussetzen`, beim
Speichern der Optionen gelöscht; weil der Stand nachgespielt wird, sind so ausgesetzte Karten wieder da). Aktion `an` nimmt die
Markierung weg.

**Üben** (`Uebungsfenster`, Unterklasse des Lernfensters): eine feste Auswahl ohne Tagesplan, etwa vor einer Prüfung. `auswahlVon`
wählt nach Modul, Notiz oder Kapitel und Art (`UEBEN_ARTEN`: alle, schon einmal mit Nochmal bewertet, schwierig), ohne ausgesetzte
Karten; die Kartenliste und die Zeile „schwierige Karten“ geben Schlüssel direkt mit. `uebungBauen` mischt mit einem Samen,
`uebungNehmen` legt „Nochmal“ nach 4 anderen Karten wieder ein (`WIEDER`), `uebungZurueck` nimmt den letzten Schritt zurück. Üben
schreibt nichts in die Lernstände: Wann eine Karte wieder dran ist, bleibt, wie es war (Anki: „Benutzerdefinierte Lernsitzung“ ohne
Neuplanung).

**Statistik und Verlauf** (seit 25.10.2026): `statistik` liefert außer Kacheln, Bestand und Prognose `verlauf`, die letzten 30
Lerntage (heute zuletzt) mit Bewertungen, davon neu und gewusst, und Antwortzeit. Das Diagramm „Gelernt in den letzten 30 Tagen“
hat dieselbe Form wie die Prognose (`tageBalken`). Bei „Alle Stapel“ und mehr als einem Modul steht darüber „Je Modul“ (`jeModul`,
`modulTabelle`): Karten, Anteil schon gelernter (Zustand nicht Neu), Behalten (Wiederholungen der letzten 30 Tage, die nicht
Nochmal waren) und Lernzeit der letzten 30 Tage, zuletzt gelernt; pausierte Module zählen mit, ihr Lernstand bleibt. Eine Zeile
antippen stellt die Auswahl auf dieses Modul. Schmal (Container `eba-lk` ≤ 600 px) stehen die Zahlen mit Namen unter dem Modulnamen.
Fenster **Verlauf** einer Karte (`VerlaufFenster`, `ctx.karten.verlauf`; im Menü je Karte der Liste und unter ⋯ im Lern- und
Übungsfenster): Ort und Frage, Stand (Status, Fällig, Intervall, wie oft bewertet, Fehler, Lernzeit) und jede Bewertung und Aktion,
die neueste oben. `kartenVerlauf` spielt nur die Ereignisse dieser Karte nach (`anwenden`, derselbe Schritt wie in `nachspielen`:
Der Stand einer Karte hängt nur an ihren eigenen Ereignissen) und gibt je Bewertung den Zustand vorher (Neu, Lernen, Wiederholung,
Erneut lernen) und den Stand danach (Intervall bzw. nächster Lernschritt, `intervallText`); `an` bei einer nur schwierigen Karte
heißt „Nicht mehr als schwierig markiert“. Geht das Fenster über dem Lernfenster zu, holt dieses den Fokus zurück (`fokusHalten`),
damit die Tasten weiter wirken. Schmal (Container `eba-lk-v` ≤ 440 px) zwei Zeilen je Bewertung.

**Oberfläche:** Seite `Studium/Karteikarten.md` mit den Codeblöcken `eba-karten` (Übersicht: Kopfzeile „11 fällig · 12 neu ·
etwa 5 Min.“ mit **Alles lernen**, Dauer aus der eigenen mittleren Antwortzeit; darunter „N schwierige Karten“ mit **Üben** und
**Ansehen**; Tabelle „Heute dran“ nach Fälligkeit, Stapel ohne fällige Karten und pausierte Stapel je eingeklappt; Suche ab 6
Stapeln; Zeile je Modul mit Neu · Lernen · Fällig und Kartenzahl, antippen = lernen, ⋯ = Menü mit Lernen, Üben …, Neue Karte,
Karten anzeigen (filtert die Liste und scrollt hin), „Heute N neue Karten mehr“ (nur wenn ein Limit Karten aufhält), Pausieren bzw.
Fortsetzen (`pausieren`, mit Rückgängig im Hinweis) und Öffnen; schmal (Container `eba-lk-u` ≤ 520 px) stehen die Zahlen mit Namen
unter dem Modulnamen), den Knöpfen, `eba-karten statistik` (Auswahl eines Moduls, vier Kacheln, „Je Modul“, Gelerntes der letzten
30 Tage, Prognose für 30 Tage, Bestand mit Pausiert und Schwierig; siehe unten) und `eba-karten liste` (Suche, Stapel, Kapitel, Status mit Anzahl, Sortierung nach Notiz/Fälligkeit/Fehlern;
nach Stapel gruppiert, Status als Pille, 50 je Schritt und „Alle anzeigen“, Menü je Karte; darüber „Auswahl: N Karten“ mit **Üben**
und ⋯ für alle Treffer: aussetzen, fortsetzen, bis morgen zurückstellen, nicht mehr als schwierig markieren, als neu zurücksetzen
nach Rückfrage; `aktionFuer` setzt erst fehlende Kennungen, dann ein Schreibvorgang, Hinweis mit Rückgängig). Fenster **Üben**
(`UebenWahl`, Aktion `karten-ueben`): Stapel, Teil (ganzes Modul, eine Notiz, ein Kapitel), Karten, mit Anzahl. In jeder
Kartennotiz steht `eba-karten stapel` (Gerüst `System/Gerüste/Karteikarten.md`; Zahlen, **Lernen** bzw. bei pausiertem Stapel
**Fortsetzen**, **Üben**, **Neue Karte** und „So schreibst du Karten“, im leeren Stapel offen, weil der Kasten im Gerüst in der
Leseansicht nicht zu sehen ist), auf dem Dashboard `eba-karten heute` (nur sichtbar, wenn etwas fällig oder neu ist; sonst
`.eba-lk-aus`). **Lernoptionen** prüfen vor dem Speichern (`optionenPruefen`: ganze Zahlen in `GRENZEN`, jede Lernschritt-Angabe
eine Zeit bis 30 Tage, leer = Standard) und markieren das falsche Feld; **Standard** füllt die Werte wie in Anki ein, gespeichert
wird erst mit **Speichern**.
`artVon` liest das Argument, sonst Ort und Ersatztext des Blocks. In der Leseansicht einer Kartennotiz zeichnet ein Post-Processor
jede Karte als Zeile (`kartenZeilen`): Abschnitt per `getSectionInfo`, Karten daraus mit `parsen` (`abschnittKarten`; ein
Abschnitt mit anderem Text bleibt, wie Obsidian ihn zeichnet, der Rest einer Karte, die Obsidian in zwei Abschnitte teilt, wird
leer), Vorder- und Rückseite per `MarkdownRenderer`. Die Rückseite (bei Lücken die Lösung statt „[…]“, `zeilenSeiten`) erscheint
erst beim Antippen; **Antworten zeigen** im Stapel-Block setzt `.eba-lk-k-alle` an der Ansicht. Ohne Abschnitt (Lernfenster)
bleibt der Rückfall: Trenner als Pfeil, Lücken markiert. Das Lernfenster (Modal, auf dem iPhone ganzer Bildschirm) zeichnet die Karte mit `MarkdownRenderer` (Formeln,
Bilder, Links), darunter ein Fortschrittsbalken der Runde; ein Tippen auf die Frage zeigt die Antwort (nicht auf Links oder mit
markiertem Text), Knöpfe nehmen ein Tippen erst 400 ms nach dem Wechsel an (`SPERRE`, `getippt`), damit ein doppeltes Tippen keine
Bewertung auslöst. Tasten Leertaste/Enter, 1–4, Strg/⌘+Z, E, `-`, `@` (auch mit AltGr, das Windows als Strg+Alt meldet), beim
Bearbeiten Strg/⌘+Enter = Speichern. Esc und ein Tippen daneben schließen nichts, solange eine Änderung ungespeichert ist
(`canDismiss`, `onEscapeKey`; ohne Änderung führt Esc zurück zur Karte); dasselbe im Fenster **Neue Karte**. Bei einem pausierten
Stapel sagt das Fenster es und bietet **Fortsetzen**. Neu gezeichnet wird bei Änderungen in `Karteikarten/`, an
Lernständen anderer Geräte und an den Einstellungen, außerdem alle 5 Minuten (Lernschritte); die Kartenliste dabei nur, wenn ein
neuer Lerntag beginnt. Alle Blöcke, die zugleich neu zeichnen, warten auf denselben Neuaufbau (`indexLaden`, `logsLaden`); kam
während des Aufbaus eine Änderung, folgt danach noch einer. Bis 25.10.2026 bekam jeder Block außer dem ersten das alte
Verzeichnis, und die Seite zeigte nach einer Änderung bis zu 5 Minuten alte Zahlen. Ein offenes Lernfenster baut seine Runde bei denselben Änderungen, an einem neuen Lerntag und, solange es
„fertig“ zeigt, alle 5 Minuten neu (`auffrischen`, `sitzungAuffrischen`): Zähler und Verlauf bleiben, die gezeigte Karte bleibt,
solange es sie gibt und sie dran ist; Karten ohne Kennung kommen erst in der nächsten Runde, beim Bearbeiten wartet es. Bearbeiten
und „In der Notiz zeigen“ nehmen den Block aus dem jetzigen Stand der Notiz.
Beim Start wird nichts geschrieben außer der einmaligen Umbenennung oben. CSS: Abschnitt 52 in `eba-core.css`.

## Lernplan (seit 18.10.2026, `lernplan.js`)

Regel „70/100“: Nach 70 % der Zeit von Vorlesungsbeginn bis zur Klausur ist jedes Kapitel *verstanden* (nicht beherrscht); die
restliche Zeit gehört der Klausurvorbereitung (Übungen, Altklausuren auf Zeit, Karteikarten). Der Plan verteilt die Kapitel so, dass
jede Woche gleich viel zu tun ist, und sagt je Modul, welches Kapitel bis Sonntag dran ist.

**Woher die Kapitel kommen.** Die Kapitelliste eines Moduls steht in den ersten Folien (Gliederung, Inhalte, Road Map), aber in
jeder Vorlesung anders (1.–7., I.–VI., E und I–VI, eine PDF für alle Teile). Baut ein Modul auf einem Lehrbuch auf und nennt jede
Vorlesung erst ihre Einheiten, sind die Kapitel die Einheiten des Lehrbuchs (Inhaltsverzeichnis), die noch nicht genannten nach der
Modulbeschreibung geschätzt (`vorlaeufig: true`); jede neue Vorlesung berichtigt die Liste. Lesen kann das nur eine KI, und die läuft
seit 19.10.2026 an einer Stelle: Der Uni-Abgleich des Autors pflegt die Listen und veröffentlicht sie als `kapitel.json`
([daten-v1.md](../daten-v1.md#kapiteljson)). Jedes Gerät holt sie, der Abrufer schreibt daraus die Notizen (`zentralNotiz`,
`zentralAuswahl`, `zentralAbgleichen`, Tests `tests/kapitel.test.js`); niemand braucht eine eigene KI. Neu geschrieben wird eine
Notiz nur, wenn sich die Liste ihres Moduls geändert hat. Was angewendet ist, steht im Tresor wie die Grabsteine im Quellen-Vertrag:
`System/Daten/abruf.json`, Feld `lernplan` = `{ angewendet: Code → kurzHash des Eintrags, zeilen: Code → Prüfsummen seiner
(Unter-)Kapitelzeilen }` (`listeZeilen`; nur dieses Feld wird geschrieben). So weiß jedes Gerät, das Abrufer wird, Bescheid, und eine
gelöschte Notiz entsteht erst mit einer geänderten Liste wieder. Jedes Gerät hebt eine Kopie auf (`eba-lernplan-angewendet`, wie
`eba-zentral-angewendet`): Fehlt das Feld (Datei eben neu angelegt, Sync noch nicht da), gilt sie; fehlt die Datei oder ist sie
unlesbar, schreibt der Abgleich nichts. Bis 24.10.2026 stand das gerätelokal (`eba-lernplan-zentral`, die ganze Liste je Code);
passt dieser Stand zur Liste, wird er übernommen und danach gelöscht, und seine Liste sagt, welche Zeilen der Notiz aus ihr stammen.
Beim Neuschreiben geht ein Häkchen mit dem Titel des Kapitels (ohne Groß-/Kleinschreibung und Satzzeichen; bei gleichem Titel
zuerst das mit gleicher Nummer), nicht mit der Nummer. Eine Aufgabe gehört der Liste nur, wenn sie zu einem Kapitel der neuen Liste
passt oder in der zuletzt geschriebenen stand (`zeilen`); so fallen gestrichene Kapitel weg, auch mit Wortnummer („Anhang …“),
während eigene Aufgaben bleiben, auch mit Nummer vorn („3 Altklausuren rechnen“). Ist die alte Liste unbekannt, bleibt im Zweifel
die Zeile. Es bleiben also eigene Zeilen und Aufgaben unter „## Kapitel“ (hinter ihrem Kapitel; die eines gestrichenen Kapitels am
Ende), eigene Eigenschaften (`seit`, `verstanden_bis`, Tags …) und „## Meine Notizen“. Bei gleicher Liste bleibt die Notiz, wie
sie ist. Eine eigene KI (Claude auf dem
eigenen Server) darf weiter Notizen nach dem Gerüst schreiben, ohne `herkunft: zentral`; die überschreibt das Plugin nie. Gibt es
keine Notiz, fehlt der Lernplan in der Übersicht, und die Seite zeigt den Leerzustand „Noch kein Lernplan für deine Module.“

**In Entwicklung** (seit 19.10.2026): Bereich und Lernplan-Notizen zeigen oben einen Warnkasten (Pille „In Entwicklung“,
„Noch nicht fertig: Lern nicht danach.“ und ein Satz, was falsch sein kann), der Inhalt ist stark abgeblendet und grau, bleibt aber
bedienbar; in der Übersicht ist die Zeile „Lernplan“ abgeblendet und trägt rechts „in Entwicklung“. Schalter: für Seite und
Notizen `IN_ENTWICKLUNG` in `lernplan.js` (CSS Abschnitt 61, `.is-entwicklung`), für die Zeile in der Übersicht die Liste
`IN_ENTWICKLUNG` in `seitenleiste.js` (Abschnitt 66).

**Lernplan-Notiz** `Lernplan/<Code> Lernplan.md` (Gerüst `System/Gerüste/Lernplan.md`; Name nie wie die Modulnotiz):

| Teil | Inhalt |
|---|---|
| Frontmatter | `typ: lernplan`, `code`, `quelle` (woher die Liste stammt), `stand`; optional `seit` (Plan beginnt in dieser Woche, z. B. bei spätem Einstieg), `verstanden_bis` (Ziel statt 70 %), `vorlaeufig: true` (Liste teils geschätzt; Stand zeigt „(Liste vorläufig)“) |
| Block | ```` ```eba-lernplan modul ```` – eine Zeile mit Stand wie im Bereich |
| `## Kapitel` | je Kapitel `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Folien (`[[X100 Folien 01 …]]`, bei einer PDF für alles `[[….pdf#page=30\|S. 30–52]]`) und die Seitenzahl (`23 S.`); bei einem frei zugänglichen Lehrbuch ein https-Link (`[online](https://…)`); eingerückte Aufgaben = Unterkapitel |

`kapitelLesen` liest nur Aufgaben außerhalb von Frontmatter und Codeblöcken; Nummer = erstes Wort, wenn es eine Ziffer enthält und
die Form der Kapitellisten hat (`1.2`, `1a`, `E1`, `A.1`, `2.3b`; ein Punkt, Doppelpunkt oder `)` dahinter fällt weg), eine römische
Zahl oder ein einzelner Großbuchstabe ist. Abgehakt = verstanden, bei Unterkapiteln anteilig. Häkchen setzt nur die
Studentin oder der Student (in der Notiz oder mit einem Tipp im Bereich); die KI ergänzt Links und Seiten, wenn Folien dazukommen,
und lässt Häkchen stehen.

**Rechnen** (rein, getestet in `tests/lernplan.test.js`):
- *Gewicht* eines Kapitels (`gewichte`): Seiten aus der Zeile, sonst Feld `seiten` der verlinkten Notiz, sonst der Folien mit gleicher
  Nummer (`typ: unterlage`, `art: Folien`, `nummer`; Varianten „mit Anmerkungen“, „unbeschrieben“, „zum Video“ zählen nicht; von einer
  Kopie „… neue Fassung JJJJ-MM-TT“ die neueste, seit 0.6.9), sonst der Mittelwert der bekannten. Hat kein Kapitel des Moduls Seiten (Lehrbuch online), zählt die Zahl der Unterkapitel. *Da* = ein Link
  zeigt auf eine vorhandene Datei, ein https-Link steht in der Zeile oder Folien mit dieser Nummer existieren.
- *Klausur*: `ctx.modell.pruefungVon(code)` (die eine Regel des Datenmodells); ohne Prüfungstermin der Beginn der nächsten
  Prüfungsphase („geschätzt“), damit der Plan ein Ende hat. *Beginn*: Vorlesungsbeginn des Semesters, frühestens `seit`.
- *Ziel* (`zielVon`): Sonntag der Woche, in der 70 % der Tage von Beginn bis Klausur vorbei sind, höchstens der Sonntag vor der
  Klausurwoche.
- *Wochen* (`kapazitaet`): Anteil der Tage Montag bis Freitag ohne Pausen und freie Tage aus dem Datenmodell; eine Woche ganz in
  einer Pause zählt 30 %. `planen`: Bis Ende der Woche w ist der Anteil der Kapazität bis w am Gesamtgewicht fällig; jedes Kapitel
  bekommt den Sonntag der Woche, in der der Plan es erreicht.
- *Stand* (`stand`, Pille in der Statusfarbe ihrer Bedeutung, docs/design.md): im Plan (Normalfall, keine Pille), **n Kapitel
  voraus** und **alles verstanden** (`ok`), **n Kapitel hinterher** (`warn`: vor dieser Woche fällig, da und offen), **wartet auf
  Kapitel n** (`info`: alle überfälligen sind noch nicht hochgeladen, kein eigenes Versäumnis, wenn man nicht vorlernen kann), nach
  dem Ziel **n Kapitel offen** (`warn`) bzw. **Klausurvorbereitung** (`leer`), nach der Klausur **Klausur vorbei** (`leer`).
  **nicht mehr dran** (`leer`, `nichtMehrDran`): Modul bestanden oder anerkannt, `semester` der Notiz ist nicht das laufende, oder
  das Modul liegt jetzt in einem anderen Semester bzw. nicht mehr in deinem Plan; der Grund steht im Text, ohne Plan, ganz am Ende.
  Die Notiz bleibt (löschen nur von Hand).

**Oberfläche:** Bereich `Studium/Lernplan.md` mit ```` ```eba-lernplan ````: je Modul eine Zeile der Zeilenliste ohne Symbol (Titel,
Pille nur bei einem Zustand, „2 von 7 Kapiteln · diese Woche Kapitel 3 · verstanden bis So 3.1. · Klausur Sa 6.2.“), sortiert nach
Klausur, Vorbereitung und Vorbei ans Ende, „nicht mehr dran“ ganz ans Ende. Tipp klappt die Kapitel auf (gerätelokal über den Hot-Reload, `ctx.bleibend`): Kästchen
wie bei den To-dos (`.eba-td-haken`, ganze Zeilenhöhe als Tippfläche, auf iPhone und iPad 44 px; halb verstanden = unbestimmt und
„1/3“ hinter dem Titel), Nummer, Titel (Tipp öffnet die Folien bzw. das Lehrbuch), rechts „bis So 25.10.“ bzw. „· noch nicht da“,
darunter der Link auf die Notiz. Abhaken schreibt genau diese Zeile (`- [ ]` ↔ `- [x]`), nur wenn ihr Text noch stimmt, sonst ein Hinweis (wie `todos.js`).
Neu gezeichnet bei Änderungen in `Lernplan/`, `Unterlagen/`, `Termine/`, `Module/`, am Datenmodell und an einem neuen Tag. CSS:
Abschnitt 61 in `eba-core.css`. Notizen schreibt `lernplan.js` nur im Abgleich mit den Kapitellisten, und den macht nur der
Abrufer: 45 s nach dem Start, bei neuen Listen und an einem neuen Tag (neues Semester, geänderter Plan).

**Persönlich:** Lernplan-Notizen nennen die Kapitel deiner Kurse. `Lernplan/` ist in der Vorlage leer (`pruefen.py`, `LEERE_ORDNER`)
und kommt nie in den Datenkanal.

## Literaturliste (seit 24.10.2026, `literatur.js`)

Welche Bücher eine Vorlesung nennt und was zu welchem Kapitel zu lesen ist, steht in ihren ersten Folien, in jeder anders. Wie
die Kapitellisten liest das eine KI an einer Stelle: Der Uni-Abgleich des Autors pflegt je Modul eine Liste und veröffentlicht sie
als `literatur.json` ([daten-v1.md](../daten-v1.md#literaturjson); Prüfen: `literaturPruefen` in `zentral.js`, gerätelokal
`eba-zentral-literatur`). Nur Fakten: Angabe, Rolle, Links auf Verlag und UB-Katalog, Stellen je Kapitel, Nummer und Seite der Folien.

Der Abrufer schreibt daraus `Unterlagen/<Code> <Modultitel>/Literatur/<Code> Literatur 00 Literaturliste.md` (`typ: unterlage`,
`art: Literatur`, `nummer: 0`, `herkunft: zentral`, `literatur_id` = Code klein), für dieselben Module wie die Lernplan-Notizen
(`auswahl`). Den Ordner benennt er wie `unterlagen.js` (vorhandener Ordner „<Code> …“, sonst Code und gekürzter Modultitel). Der Text:
„## Das Wichtigste“ (Hinweis, Werke mit `abschnitt: haupt` als Zeile „**Rolle:** Angabe. · Verlag ↗ · UB-Katalog ↗“), „## Lesen
je Kapitel“ (bzw. `kopf`; eine Spalte je Werk mit `spalte`), „## Weitere Literatur“, „## Meine Notizen“. Verweise auf Unterlagen
zeigen auf das PDF mit Seite, sonst die Begleitnotiz, sonst stehen sie als Text da (`zieleVon`); kommen Folien dazu, schreibt der
Abgleich die Notiz neu. Der Katalog-Link entsteht aus `katalog` (Eintrag) bzw. `suche` (Suche); die Seiten des Katalogs liest der
Abgleich nie.

Was geschrieben ist, steht wie beim Lernplan in `System/Daten/abruf.json`, Feld `literatur` = `{ angewendet: Code → kurzHash der
Liste, ziele: Code → kurzHash der Ziele }`, dazu eine Kopie je Gerät (`eba-literatur-angewendet`). Eine gelöschte Notiz entsteht erst
mit einer geänderten Liste wieder; liegt am Pfad eine andere Datei, bleibt sie. Bei jeder neuen Liste bleiben `status`, `datum`,
`tags`, eigene Eigenschaften und „## Meine Notizen“ (`notizText`, `LISTE_FELDER`). Eine Notiz mit `literatur_id` ohne `herkunft`
übernimmt der Abgleich an ihrem Ort: So schrieb der Uni-Abgleich des Autors bis zu dieser Fassung in seinen eigenen Tresor, und er
hört damit auf, sobald die Liste veröffentlicht und diese Fassung in seinem Tresor installiert ist (ein Schreiber je Notiz).
Notizen mit anderer `herkunft` fasst er nie an. Läufe: 45 s nach dem Start, bei neuen Listen (`ctx.literaturAnzeige`), bei neuen
Unterlagen des Moduls (5 s entprellt) und an einem neuen Tag. Für Module ohne Liste entsteht keine Notiz. Tests:
`tests/literatur.test.js`.
