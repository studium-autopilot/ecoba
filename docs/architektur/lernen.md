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
jede Woche gleich viel zu tun ist, und sagt je Modul, welches Kapitel bis Sonntag dran ist. Seit 31.10.2026 (Döbele und
Notencoach, Plan Abschnitt 31): Ziel nach der Zielnote, Zwischentests als Fristen, Wochen mit weniger Zeit, ein Schalter für
Vorlernen, hinterher nur mit Kapiteln, die die Vorlesung schon hatte, Klausurvorbereitung mit Altklausuren und Karteikarten, eine
Woche über alle Module, Zeilen auf Dashboard und Modulseite.

**Woher die Kapitel kommen.** Die Kapitelliste eines Moduls steht in den ersten Folien (Gliederung, Inhalte, Road Map), aber in
jeder Vorlesung anders (1.–7., I.–VI., E und I–VI, eine PDF für alle Teile). Baut ein Modul auf einem Lehrbuch auf und nennt jede
Vorlesung erst ihre Einheiten, sind die Kapitel die Einheiten des Lehrbuchs (Inhaltsverzeichnis), die noch nicht genannten nach der
Modulbeschreibung geschätzt (`vorlaeufig: true`); jede neue Vorlesung berichtigt die Liste. Lesen kann das nur eine KI, und die läuft
seit 19.10.2026 an einer Stelle: Der Uni-Abgleich des Autors pflegt die Listen und veröffentlicht sie als `kapitel.json`
([daten-v1.md](../daten-v1.md#kapiteljson)). Jedes Gerät holt sie, der Abrufer schreibt daraus die Notizen (`zentralNotiz`,
`zentralAuswahl`, `zentralAbgleichen`, Tests `tests/kapitel.test.js`); niemand braucht eine eigene KI. Neu geschrieben wird eine
Notiz nur, wenn sich die Liste ihres Moduls oder ihre Folien geändert haben: Jede Kapitelzeile zeigt auf die Folien-Notiz des
Kapitels (`zieleVon` über `folienZuordnen`, dieselbe Regel wie beim Gewicht: zuerst nach dem Titel, die Folien gehören zu dem
Kapitel, mit dem ihr Titel die meisten Wörter ab vier Buchstaben teilt, wenn das genau eines ist; dann nach der Nummer, Feld
`folien` bzw. Kapitelnummer, aber nie Folien, die nach dem Titel zu einem anderen Kapitel gehören. Grund: Der ILIAS-Abruf des
Plugins nummeriert nach den Dateien der Vorlesung, „EBWL_2_post.pdf“ wird „Folien 02“, ist aber noch Kapitel 1. Hat das Modul gar
keine nummerierten Folien, aber genau eine Folien-Unterlage ohne Nummer, etwa die eine PDF von S110, gilt sie für jedes Kapitel.
Trägt die Liste `folien` nur an manchen Kapiteln, etwa E101 mit Lehrbuch-Einheiten und Folien je Vorlesung, bekommen die übrigen
keine Folien nach der Nummer: „Folien 03“ ist dort die dritte Vorlesung, nicht Einheit 3),
darum gleicht der Abrufer auch ab, wenn neue Folien ankommen (2 s entprellt). Was angewendet ist, steht im Tresor wie die
Grabsteine im Quellen-Vertrag: `System/Daten/abruf.json`, Feld `lernplan` = `{ angewendet: Code → kurzHash des Eintrags, zeilen:
Code → Prüfsummen seiner (Unter-)Kapitelzeilen, ziele: Code → kurzHash der Folien-Links }` (`listeZeilen`; nur dieses Feld wird
geschrieben). So weiß jedes Gerät, das Abrufer wird, Bescheid, und eine
gelöschte Notiz entsteht erst mit einer geänderten Liste wieder. Jedes Gerät hebt eine Kopie auf (`eba-lernplan-angewendet`, wie
`eba-zentral-angewendet`): Fehlt das Feld (Datei eben neu angelegt, Sync noch nicht da), gilt sie; fehlt die Datei oder ist sie
unlesbar, schreibt der Abgleich nichts. Bis 24.10.2026 stand das gerätelokal (`eba-lernplan-zentral`, die ganze Liste je Code);
passt dieser Stand zur Liste, wird er übernommen und danach gelöscht, und seine Liste sagt, welche Zeilen der Notiz aus ihr stammen.
Beim Neuschreiben geht ein Häkchen mit dem Titel des Kapitels (ohne Groß-/Kleinschreibung und Satzzeichen; bei gleichem Titel
zuerst das mit gleicher Nummer), nicht mit der Nummer. Eine Aufgabe gehört der Liste nur, wenn sie zu einem Kapitel der neuen Liste
passt oder in der zuletzt geschriebenen stand (`zeilen`); so fallen gestrichene Kapitel weg, auch mit Wortnummer („Anhang …“),
während eigene Aufgaben bleiben, auch mit Nummer vorn („3 Altklausuren rechnen“). Ist die alte Liste unbekannt, bleibt im Zweifel
die Zeile. Es bleiben also eigene Zeilen und Aufgaben unter „## Kapitel“ (hinter ihrem Kapitel; die eines gestrichenen Kapitels am
Ende), eigene Eigenschaften (`seit`, `verstanden_bis`, `vorlernen`, Tags …) und „## Meine Notizen“. Bei gleicher Liste bleibt die
Notiz, wie sie ist.

**Listen des eigenen Servers** (seit 31.10.2026): Zentrale Listen gibt es nur für die Kurse des Autors. Für die übrigen Module des
laufenden Semesters liefert der eigene Server Listen derselben Form im Eingang (Feld `kapitel`, siehe [server.md](server.md));
`server.js` gibt sie auf dem Gerät, das den Eingang übernimmt, an `ctx.lernplan.serverListen`. Die prüft sie wie `kapitel.json`
(`ctx.zentral.kapitelPruefen`) und schreibt die Notizen mit `herkunft: server` nach denselben Regeln (`notizAbgleichen`), nur für
Module ohne zentrale Liste; ihr Stand steht im Feld `lernplan` der Sperr-Datei des Servers (`System/Daten/server-abruf.json`), so
schreibt jede Notiz genau ein Gerät. Kommt später eine zentrale Liste, übernimmt der Abrufer der zentralen Daten die Notiz
(`herkunft: zentral`, Häkchen und Eigenes bleiben, die Zeilen der Server-Liste fallen weg). Beide Läufe gehen nacheinander
(`einzeln`). Fehlen dem Server seine Listen (neu eingerichtet), schickt `server.js` sie aus den Notizen im Stand zurück: `listeLesen`
mit den Zeilen aus `serverStand()` nimmt nur, was aus der Liste stammt, eigene Aufgaben mit Nummer vorn bleiben im Tresor. Eine eigene KI darf weiter Notizen nach dem Gerüst schreiben, ohne `herkunft`; die überschreibt das Plugin nie. Gibt es
keine Notiz, fehlt der Lernplan in der Übersicht, und die Seite zeigt den Leerzustand „Noch kein Lernplan für deine Module.“

**In Entwicklung** (seit 19.10.2026): Bereich und Lernplan-Notizen zeigen oben einen Warnkasten (Pille „In Entwicklung“,
„Noch nicht fertig: Lern nicht danach.“ und ein Satz, was falsch sein kann), der Inhalt ist stark abgeblendet und grau, bleibt aber
bedienbar; in der Übersicht ist die Zeile „Lernplan“ abgeblendet und trägt rechts „in Entwicklung“, die Zeilen auf Dashboard und
Modulseite tragen die Pille „in Entwicklung“. Schalter: für Seite, Notizen, Dashboard und Modulseite `IN_ENTWICKLUNG` in
`lernplan.js` (CSS Abschnitt 61, `.is-entwicklung`), für die Zeile in der Übersicht die Liste `IN_ENTWICKLUNG` in `seitenleiste.js`
(Abschnitt 66).

**Lernplan-Notiz** `Lernplan/<Code> Lernplan.md` (Gerüst `System/Gerüste/Lernplan.md`; Name nie wie die Modulnotiz):

| Teil | Inhalt |
|---|---|
| Frontmatter | `typ: lernplan`, `code`, `quelle` (woher die Liste stammt), `stand`; optional `seit` (Plan beginnt in dieser Woche, z. B. bei spätem Einstieg), `verstanden_bis` (Ziel statt 70 %), `vorlaeufig: true` (Liste teils geschätzt; Stand zeigt „(Liste vorläufig)“), `vorlernen: false` (Schalter „Vor der Vorlesung lernen“ aus) |
| Block | ```` ```eba-lernplan modul ```` – eine Zeile mit Stand wie im Bereich |
| `## Kapitel` | je Kapitel `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Folien (`[[X100 Folien 01 …]]`, bei einer PDF für alles `[[….pdf#page=30\|S. 30–52]]`) und die Seitenzahl (`23 S.`); bei einem frei zugänglichen Lehrbuch ein https-Link (`[online](https://…)`); seit 31.10.2026 aus den Listen `[[X100 Folien 01 …\|Folien]]` (ohne Folien im Tresor „Folien 1“, wenn die Nummer von der Kapitelnummer abweicht), `Vorlesung 19.10.2026` (erste Vorlesung zum Kapitel) und `Zwischentest 13.11.2026`; eingerückte Aufgaben = Unterkapitel |

`kapitelLesen` liest nur Aufgaben außerhalb von Frontmatter und Codeblöcken; Nummer = erstes Wort, wenn es eine Ziffer enthält und
die Form der Kapitellisten hat (`1.2`, `1a`, `E1`, `A.1`, `2.3b`; ein Punkt, Doppelpunkt oder `)` dahinter fällt weg), eine römische
Zahl oder ein einzelner Großbuchstabe ist. Abgehakt = verstanden, bei Unterkapiteln anteilig. Häkchen setzt nur die
Studentin oder der Student (in der Notiz oder mit einem Tipp im Bereich); die KI ergänzt Links und Seiten, wenn Folien dazukommen,
und lässt Häkchen stehen.

**Rechnen** (rein, getestet in `tests/lernplan.test.js`):
- *Gewicht* eines Kapitels (`gewichte`): Seiten aus der Zeile, sonst Feld `seiten` der verlinkten Notiz, sonst der Folien mit gleicher
  Nummer (`typ: unterlage`, `art: Folien`, `nummer`; Varianten „mit Anmerkungen“, „unbeschrieben“, „zum Video“ zählen nicht; von einer
  Kopie „… neue Fassung JJJJ-MM-TT“ die neueste, seit 0.6.9), sonst der Mittelwert der bekannten. Hat kein Kapitel des Moduls Seiten (Lehrbuch online), zählt die Zahl der Unterkapitel. *Da* = ein Link
  zeigt auf eine vorhandene Datei, ein https-Link steht in der Zeile oder Folien mit dieser Nummer existieren (in Notizen aus
  Kapitellisten nur nach dem Titel: Die Nummern hat der Abgleich mit der ganzen Liste schon verlinkt). *Erreicht* = die
  Vorlesung hatte das Kapitel (`Vorlesung …` in der Zeile, nicht nach heute); führt die Notiz bei keinem Kapitel einen Tag, gilt
  jedes als erreicht (wie vor dem 31.10.2026).
- *Klausur*: `ctx.modell.pruefungVon(code)` (die eine Regel des Datenmodells); ohne Prüfungstermin der Beginn der nächsten
  Prüfungsphase („geschätzt“), damit der Plan ein Ende hat. *Beginn*: Vorlesungsbeginn des Semesters, frühestens `seit`.
- *Ziel* (`zielVon`): Sonntag der Woche, in der 70 % der Tage von Beginn bis Klausur vorbei sind, höchstens der Sonntag vor der
  Klausurwoche. Der Anteil folgt der Zielnote aus den Einstellungen (`anteilAusZielnote`, Döbele: Priorität der Noten): bis 1,5
  60 % (mehr Zeit für Altklausuren), bis 2,5 70 %, schlechter 80 %, ohne Zielnote 70 %; `verstanden_bis` geht vor.
- *Wochen* (`kapazitaet`): Anteil der Tage Montag bis Freitag ohne Pausen und freie Tage aus dem Datenmodell; eine Woche ganz in
  einer Pause zählt 30 %. Dazu deine Wochen mit weniger Zeit (`faktorenLesen`): `lernplan_wochen` in `System/Einstellungen.md`, je
  Woche „Montag Prozent“ (`["2026-11-16 50"]`), gesetzt mit dem Knopf rechts in einer Woche im Bereich (volle, ¾, halbe, ¼,
  keine Zeit; volle Zeit löscht den Eintrag); der Anteil nimmt die Woche mal (auch eine Pausenwoche).
- *Plan* (`planen`): Ein Zwischentest ist eine Frist (`frist` = Sonntag vor der Woche des Tests): Bis dahin sind sein Kapitel und
  alle davor verstanden. Vom erreichten Stand aus nimmt der Plan die Frist (oder das Ziel), die den höchsten Takt verlangt (Gewicht
  je Kapazität), verteilt bis dorthin gleichmäßig und macht von dort weiter; ohne Fristen ist bis Ende der Woche w der Anteil der
  Kapazität bis w am Gesamtgewicht fällig. Jedes Kapitel bekommt den Sonntag der Woche, in der der Plan es erreicht. Tragen alle
  Wochen keine Zeit, zählt jede gleich. Deine Angaben zur Zeit zählen nur ab ihrer eigenen Woche, in drei Läufen von `verteilen`:
  die Wochen vor dieser mit voller Zeit für alles, was noch kommt, dann diese Woche ebenso, dann der Rest mit deinen Angaben. So
  zieht eine spätere Woche mit weniger Zeit nichts in vergangene Wochen und nichts in diese, die schon läuft (bis 31.10.2026 nahm
  diese Woche einen Teil davon mit, auch wenn sie morgen endete); weniger Zeit in dieser Woche verteilt ihren Rest auf die Wochen
  danach.
- *Ohne Vorlernen* (`vorlernen: false`, `nachVorlesung`): Ein Kapitel ist frühestens am Sonntag der Woche nach seiner Vorlesung
  fällig; Kapitel ohne Vorlesung schätzt der Plan (der Rest nach Gewicht gleichmäßig bis zum Vorlesungsende, das laufende Kapitel
  zählt mit; rechts „bis ca. …“), ein übersprungenes Kapitel gilt mit dem nächsten als behandelt. Fällig ist das Spätere aus Plan und
  Vorlesung, höchstens der Sonntag vor der Klausurwoche; „verstanden bis“ rückt mit.
- *Stand* (`stand`, Pille in der Statusfarbe ihrer Bedeutung, docs/design.md): im Plan (Normalfall, keine Pille), **n Kapitel
  voraus** und **alles verstanden** (`ok`), **n Kapitel überfällig** (`warn`, Art `hinterher`: vor dieser Woche fällig, da,
  erreicht und offen; dasselbe Wort wie in den Kapitelzeilen, bis 31.10.2026 „hinterher“), **n Kapitel vorlernen** (`info`: fällig
  und da, aber die Vorlesung hatte sie noch nicht; seit 31.10.2026, vorher hieß auch das „hinterher“), **wartet auf Kapitel n** (`info`: die überfälligen sind noch nicht hochgeladen, ohne Vorlernen auch: noch ohne
  Vorlesung), nach dem Ziel **n Kapitel offen** (`warn`) bzw. **Klausurvorbereitung** (`leer`), nach der Klausur **Klausur vorbei**
  (`leer`).
  **nicht mehr dran** (`leer`, `nichtMehrDran`): Modul bestanden oder anerkannt, `semester` der Notiz ist nicht das laufende, oder
  das Modul liegt jetzt in einem anderen Semester bzw. nicht mehr in deinem Plan; der Grund steht im Text, ohne Plan, ganz am Ende.
  Die Notiz bleibt (löschen nur von Hand).
- *Klausurvorbereitung* (`vorbereitungVon`, `altklausurPlan`): Altklausuren des Moduls (`art: Altklausur`, bearbeitet =
  `status: bearbeitet`, von alt nach neu nach dem Titel, `altersSchluessel`), Übungsblätter dieses Semesters (bearbeitet oder
  erledigt), heute fällige Karteikarten (`ctx.karten.heuteJeModul`). Nach dem Ziel verteilt der Plan die offenen Altklausuren auf die
  Wochen bis zur Klausur (je Woche aufgerundet), die neueste offene bleibt für den Tag vor der Klausur (Notencoach: eine ungesehene
  unter Echtbedingungen).
- *Bild des Semesters* (`planBild`, für den Semesterplan): Zeitachse von Montag der ersten Planwoche bis Sonntag der Woche der
  letzten Klausur, alle Lagen als Anteil 0–1. Je Woche ihre *Last* (Döbele: Fächer nach ECTS): je Kapitel, das in ihr fällig ist,
  sein Anteil am Modul mal dessen ECTS, geteilt in verstanden, offen und überfällig (vor dieser Woche fällig, da und erreicht),
  insgesamt und je Modul (`module[j]` mit seiner Farbe); trägt eine Woche mehr als das Anderthalbfache des Schnitts der Wochen mit
  Last, zeigt sie die Pille „viel“. Je Modul eine Bahn: Beginn, *Stand* (wo der Plan bei deinem Fortschritt ist: die Woche, in der
  `soll` die verstandenen Gewichte erreicht, innerhalb der Woche gleichmäßig), überfällig vom Stand bis heute (nur wenn der Stand
  des Moduls „überfällig“ sagt oder nach dem Ziel noch Kapitel offen sind), Ziel (Ende seines Sonntags), Klausur, Zwischentests.
  Dazu Monatsanfänge, Pausen und heute. Bis 1.11.2026 `wochenLast` (nur offene Kapitel, nur für die Pille).
- *Dein Stand* (`heldDaten`, für den Kopf des Bereichs): über alle laufenden Module nach ECTS gewichtet, wie viel verstanden ist
  (`ist`) und wo der Plan heute steht (`soll`; `sollHeute`: innerhalb einer Woche gleichmäßig), dazu der *Rückstand* (überfällige
  Kapitel wie in `bisText`), der *Vorsprung* (verstanden, aber erst nach diesem Sonntag fällig), diese Woche (bis Sonntag fällig,
  davon verstanden), wie du *aufholst* (bis zwei Kapitel: diese Woche; mehr: verteilt auf diese und die zwei nächsten Wochen, je
  Woche aufgerundet), die nächste Klausur und ob alles verstanden ist. `heldText` macht daraus Überschrift und Satz: „5 Kapitel im
  Rückstand“ mit „Mit 2 Kapiteln mehr pro Woche bist du bis So 15.11. wieder im Plan.“ (bis zwei: „Hol sie bis … nach“), „1 Kapitel
  Vorsprung“, „Du liegst im Plan.“ mit dem Rest dieser Woche, „Alles verstanden.“
- *Zielnote* (`NOTEN`, `stufeVon`, `zielBei`, `zielVorschau`, `zielTeile`): zehn Noten von 1,0 bis 4,0 in drei Stufen wie
  `anteilAusZielnote` (sehr gut bis 1,5, gut bis 2,5, bestanden). `zielBei` ist „verstanden bis“ eines Moduls bei einem Anteil;
  lernt es erst nach der Vorlesung und hält die das Ziel schon später, nicht früher. `zielVorschau` nimmt davon das früheste und
  späteste über die Module ohne eigenes `verstanden_bis` und die Wochen danach bis zur Klausur, `zielTeile` macht den Satz daraus
  („Alles verstanden nach 60 % der Zeit, bis So 27.12., danach 6 Wochen Klausurvorbereitung.“; mehrere Module als Spannen ohne
  Wochentag, die Werte fett).

**Oberfläche:** Bereich `Studium/Lernplan.md` mit ```` ```eba-lernplan ````, seit 1.11.2026 von oben **dein Stand**, der
**Semesterplan** mit der Zielnote und die **Module** als Karten (am 1.11.2026 zuerst der Semesterplan ohne Modulfarben über
Modulzeilen; die Rückmeldung: zu schlicht, nicht motivierend, und dass die Zielnote den Plan verschiebt, muss man sehen und ändern
können; vom 31.10. bis 1.11.2026 „Diese Woche“ als Liste und „Wochen“ als Zeilen mit „Alle Wochen“, das Ziel als Satz unter den
Modulen). **Farben:** Jedes Modul trägt seine Farbe aus dem Stundenplan (`ctx.woche.modulFarben` aus `woche.js`, dieselbe
Zuordnung wie im Wochenraster; Module ohne Stundenplan bekommen die nächsten Farben nach Kürzel, `modulFarben`) in Bahn, Säule,
Kapitelzeile und Karte, das Kürzel steht immer daneben; Texte bleiben in Text- und Grautönen (Skill dataviz, docs/design.md
Grundsatz 7). Dein Stand über alles (Ring, Balken, gewählte Note) im Akzent, dunkel `--eba-accent-text`.
**Dein Stand** (`heldZeichnen`, Karte): links ein Ring (`ringZeichnen`, SVG): verstanden ab 12 Uhr im Uhrzeigersinn, dahinter bis
zum Plan der Rückstand in Warnfarbe, ein Strich, wo der Plan heute steht, in der Mitte „38 %“ und „verstanden“; alles verstanden:
grün. Daneben `heldText` in der Schrift der Überschriften, darunter (breit: rechts hinter einer Linie) „Diese Woche“ als Balken mit
„3 von 8 Kapiteln“ und „Nächste Klausur“ mit Farbpunkt, „B180 in 90 Tagen“ und Datum.
Der **Semesterplan** (`planZeichnen`) ist eine Karte. Im Kopf „Semesterplan“ und die **Zielnote** (`zielZeichnen`): zehn Knöpfe in
drei Gruppen mit dem Namen der Stufe darunter (die gewählte Note voll, ihre Stufe getönt; auf dem iPhone über die ganze Breite,
jede Gruppe so breit wie ihre Noten, Tippfläche 44 px). Darunter der Satz aus `zielTeile` (ohne Zielnote mit „Ohne Zielnote wie
für „gut“:“). Zeigen oder Fokus auf eine andere Note (Pfeiltasten wandern) zeigt, was sie hieße: „Mit 2,3: …“ bzw. „Mit 1,7 bleibt
der Plan gleich.“, die Stufe getönt und gestrichelt, wie lange das Verstehen jedes Moduls dann dauerte (`zielBei`), der Balken tritt
zurück. Ein Tipp schreibt `zielnote` in `System/Einstellungen.md` (`zielnoteSchreiben`, dasselbe Feld wie „Personalisieren“); der
Bereich zeichnet sich danach neu, und die Bahnen gleiten von ihrer alten Lage in die neue.
Darunter das Bild aus `planBild`. Je Woche eine Säule, gestapelt je Modul in seiner Farbe (2 px Fuge zwischen Modulen; verstanden
voll, offen getönt, überfällig in Warnfarbe), je Modul eine Bahn mit Farbpunkt und Kürzel davor (nach Klausurdatum): dicker Balken =
Kapitel verstehen (offen getönt, gefüllt bis zum Stand, dahinter bis heute schraffiert in Warnfarbe), Strich = alles verstanden,
dünne Linie in der Farbe = Klausurvorbereitung, Raute = Klausur, Ring = Zwischentest (Marken in Textfarbe mit 2 px Ring in der
Kartenfläche). Zeigt man auf eine Bahn, treten die anderen Bahnen und ihre Teile der Säulen zurück. Dahinter Pausen, diese Woche, die
gewählte Woche und die Linie „heute“; darunter die Achse mit Monaten und „heute“ als Pille (ein Monat, dem dafür der Platz fehlt,
entfällt; gemessen in px) und die Legende in derselben Form wie die Marken, neutral grau, nur mit dem, was vorkommt (Pausen mit
Namen). So sieht man die Regel 70/100 an jedem Modul: Der dicke Balken endet beim Strich, die Linie läuft bis zur Klausur. Form nach
dem Skill dataviz (Balken ≤ 24 px, 2 px Fuge, Ringe in der Kartenfläche statt Rahmen, Text nie in Datenfarbe).
Unter dem Bild die **gewählte Woche** (`wocheZeichnen`; Tipp auf eine Säule, ‹ › mit 44 px Tippfläche oder Pfeiltasten; gemerkt
bis morgen, sonst diese Woche): „Diese Woche“, „Nächste Woche“, „Letzte Woche“ oder das Datum, rechts wie viel der in ihr fälligen
Kapitel verstanden sind (Balken und „2/5“; ist alles verstanden und nichts überfällig, ein Haken und „geschafft“ in Grün; künftige
Wochen nur „5 Kapitel“) und die Zeit der Woche mit Menü (nicht für vergangene; volle Zeit als leise Uhr mit Pfeil, Tippfläche 44 px,
weniger als Wahlpille im Akzent, „halbe Zeit“; docs/design.md: derselbe Wert in jeder Woche gehört nicht in eine Pille). Darunter
Klausurvorbereitung, Pausen mit Namen und Klausuren nach Datum (fett) als Stücke, die nicht mitten umbrechen (`stuecke`; der Punkt
hängt am Stück davor, so steht keiner am Zeilenanfang), Pille „viel“ im letzten Stück; dann die Kapitel der Woche als Zeilen zum
Abhaken, mit Farbpunkt und Kürzel davor (auf dem iPhone vor der Fälligkeit unter dem Titel, der so die ganze Breite hat): In dieser
Woche alle offenen Kapitel bis Sonntag über alle Module, daneben (`bisText`) „bis So 1.11.“ oder in Warnfarbe „überfällig seit So
18.10.“ (da und von der Vorlesung erreicht), „noch nicht da“, bis Sonntag „vor der Vorlesung“ und der Zwischentest; heute hier
Abgehaktes bleibt durchgestrichen bis morgen stehen (gerätelokal, zum Zurücknehmen); in der Klausurvorbereitung je Modul „2
Altklausuren auf Zeit, zuerst …“ (Link). In jeder anderen Woche die Kapitel, die in ihr fällig sind, verstandene durchgestrichen.
Ohne Kapitel „Nichts fällig.“, alles schon verstanden „Alles für diese Woche verstanden.“. Ein eben abgehaktes Kapitel leuchtet grün
auf und sein Kästchen springt (`abgehakt.zuletzt`; nach dem neuen Zeichnen läuft das mit negativer Verzögerung weiter). Ein Tipp auf
eine Bahn klappt das Modul unter „Module“ auf und rollt dorthin (`modulZeigen`). Beim ersten Zeichnen je Start wachsen Säulen und
Bahnen einmal; danach gleiten Bahnen und Ring vom letzten Stand zum neuen (`vorher`, gerätelokal: nach einem Häkchen, einer anderen
Zielnote), nicht bei reduzierter Bewegung.
**Module** (`karteZeichnen`): je Modul eine Karte im Raster, das sich nach der Breite füllt (iPhone eine Spalte), sortiert nach
Klausur, Vorbereitung und Vorbei ans Ende, „nicht mehr dran“ ganz ans Ende (leiser). Oben das Kürzel mit Farbpunkt, die Pille bei
einem Zustand und ein Pfeil, darunter der Name in der Schrift der Überschriften; dann „Weiter mit“ und das nächste offene Kapitel
(Nummer, Titel mit Link auf die Folien bzw. das Lehrbuch, darunter `bisText`; alles verstanden: „Als Nächstes“ und die nächste
Altklausur), der Stand kurz („2 von 7 Kapiteln · Klausur in 97 Tagen“; ohne Plan wie `standTeile`) und am unteren Rand ein Balken in
der Farbe des Moduls mit dem Strich, wo der Plan heute steht. Ein Tipp klappt darunter über die ganze Breite das Modul auf
(`modulInhalt`, gerätelokal über den Hot-Reload, `ctx.bleibend`; oben ein Rand in seiner Farbe; die übrigen Karten rücken nach):
Kästchen wie bei den To-dos (`.eba-td-haken`, ganze Zeilenhöhe als Tippfläche, auf iPhone und iPad 44 px, auf dem iPhone auf Höhe
der ersten Zeile; halb verstanden = unbestimmt und „1/3“ hinter dem Titel; Titel mit Link leise unterstrichen), Nummer, Titel (Tipp
öffnet die Folien bzw. das Lehrbuch), daneben `bisText` (auf dem iPhone unter dem Titel), darunter in der Spalte der Titel **Für die
Klausur** (Altklausuren „3 von 11 bearbeitet · diese Woche 2 auf Zeit · als Nächstes …“, vor dem Ziel „auf Zeit ab …“, der Satz zur
neuesten für den Vortag: „Die neueste, …, bleibt für den Tag vor der Klausur.“; Übungsblätter; Karteikarten „12 heute dran ·
Lernen“), der Schalter **Vor der Vorlesung lernen** (Kästchen der To-dos, schreibt `vorlernen: false` bzw. löscht es, Kästchen auf
dem iPhone auf Höhe der ersten Zeile, `vorlernenSetzen`: nur diese Zeile, `processFrontMatter` schriebe das ganze Frontmatter neu
und nähme den Anführungszeichen um `semester` und `quelle`; aus sagt er, wenn das Ziel dadurch später liegt) und der Link auf die
Notiz. In der Lernplan-Notiz steht nur die Zeile (`zeile`): Modul, Pille und `standTeile` („2 von 7 Kapiteln · diese Woche Kapitel 3
· verstanden bis So 3.1. · Klausur Sa 6.2.“, jeder Teil mit festen Leerzeichen; in der Klausurvorbereitung „seit Mo 26.10.“, wenn
die Pille „Klausurvorbereitung“ schon sagt; sonst nur, was diese Woche fällig wird, Überfälliges sagt die Pille, oder das nächste
Kapitel mit Datum). Abhaken schreibt genau diese Zeile (`- [ ]` ↔ `- [x]`), nur wenn ihr Text noch stimmt, sonst ein Hinweis (wie
`todos.js`).
**Dashboard** (```` ```eba-lernplan woche ````, unter den Karteikarten): eine Zeile wie die der Karteikarten, bis zu drei Kapitel mit
Namen („Lernplan · B110 Kapitel 2 · S100 Kapitel 1“), mehr als Zahl („8 Kapitel, davon 4 überfällig“), dazu „2 Altklausuren
S100“, jedes als Stück, „Lernplan“ und Text fließen in einer Zeile (Leerzeichen statt Rand, ein Umbruch beginnt bündig; der Punkt
hängt neben seinem Stück und zählt nicht zu dessen Breite), mit
**Öffnen**; nichts dran oder keine Notiz: samt Hülle unsichtbar.
**Modulseite** (`modulZeile`, aus `modul.js` unter „Als Nächstes“): Abschnitt „Lernplan“ mit Pille, Stand wie im Bereich ohne die
Klausur (die Seite nennt die Prüfung schon) und Pfeil
(15 px wie die Zeilen von „Als Nächstes“; wird es eng, rutscht der Stand unter die Pille), Tipp öffnet die Lernplan-Notiz; ohne
Notiz nichts.
Neu gezeichnet bei Änderungen in `Lernplan/`, `Unterlagen/`, `Termine/`, `Module/`, `System/Einstellungen.md`, am Datenmodell und an
einem neuen Tag. CSS: Abschnitt 61 in `eba-core.css`. Notizen schreibt `lernplan.js` nur im Abgleich mit den Kapitellisten, und den
macht nur der Abrufer: 45 s nach dem Start, bei neuen Listen, bei neuen Folien und an einem neuen Tag (neues Semester, geänderter
Plan); die Listen des eigenen Servers schreibt `serverListen` beim Übernehmen des Eingangs.

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
