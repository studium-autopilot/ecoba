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
von dort kommen, und ebenso viele über alle (`gesamt`); vorher gab **Alles lernen** 10 je Modul. **Ganzen Stapel lernen**
(Menü ⋯) und „Alle N neuen Karten“ (Ende einer Runde, wenn mehr als 10 warten) geben alle frei (`mehrNeu(plan, extra,
Infinity)`, seit 01.11.2026, mit Lernstand anders als Üben); Geschwister kommen trotzdem erst am nächsten Tag. `naechsteKarte`: fällige Lernschritte
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
Stapeln; Zeile je Modul mit Neu · Lernen · Fällig und Kartenzahl, antippen = lernen, ⋯ = Menü mit Lernen, Ganzen Stapel lernen
(nur wenn ein Limit Karten aufhält), Üben …, Neue Karte, Karten anzeigen (filtert die Liste und scrollt hin), „Heute N neue
Karten mehr“ (nur wenn es mehr als 10 aufhält), Pausieren bzw.
Fortsetzen (`pausieren`, mit Rückgängig im Hinweis), Öffnen und zuletzt in Rot **Stapel löschen** (`loeschenEintraege`, seit
01.11.2026: die Notiz in den Papierkorb, mit Rückgängig; Lernstände hängen an den Kennungen und gelten wieder, wenn sie
zurückkommt; ein Modul mit Unterstapeln hat je Stapel „Löschen: Name“, nie alle auf einmal);
schmal (Container `eba-lk-u` ≤ 520 px) stehen die Zahlen mit Namen
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

**Warnkasten statt „In Entwicklung“** (seit 2.11.2026): Geprüft sind nur die zentralen Listen. Oben im Bereich warnt ein Kasten
(`.eba-lp-warnung`, Warnfarbe, fetter Satz und Erklärung), sobald ein Modul des laufenden Semesters keine hat (`ungeprueft`,
`warnungTeile`): Seine Kapitel kommen vom eigenen Server oder einer eigenen KI („Die Kapitel von B210 sind nicht geprüft.“, dazu
„Vergleich sie mit den Folien.“), oder es hat keinen Lernplan („W600 hat keinen Lernplan.“, der Plan rechnet ohne es). Es zählen
nur Module, die einen Plan brauchen: nicht bestanden oder anerkannt, kein Zusatzmodul, ECTS nicht 0 (Vorkurse wie das
Propädeutikum). Die Lernplan-Notiz eines solchen Moduls trägt denselben Kasten. Ohne Lernplan (Leerzustand) kein Kasten. In der
Übersicht trägt die Zeile „Lernplan“ ein paar Tage „neu“ (`NEU` in `seitenleiste.js`, siehe [bedien-bausteine.md](bedien-bausteine.md)).
Vom 19.10. bis 2.11.2026 stand der ganze Lernplan „In Entwicklung“: Warnkasten „Noch nicht fertig: Lern nicht danach.“, Inhalt
abgeblendet und grau, die Pille auch auf Dashboard, Modulseite und in der Übersicht.

**Lernplan-Notiz** `Lernplan/<Code> Lernplan.md` (Gerüst `System/Gerüste/Lernplan.md`; Name nie wie die Modulnotiz):

| Teil | Inhalt |
|---|---|
| Frontmatter | `typ: lernplan`, `code`, `quelle` (woher die Liste stammt), `stand`; optional `seit` (Plan beginnt in dieser Woche, z. B. bei spätem Einstieg), `verstanden_bis` (Ziel statt 70 %), `vorlaeufig: true` (Liste teils geschätzt; Stand zeigt „(Liste vorläufig)“), `vorlernen: false` (Schalter „Vor der Vorlesung lernen“ aus), `zeit_je_kapitel: true` (Schalter „Zeit je Kapitel“ an, seit 1.11.2026), `kapitel_zeit: ["3 mehr", "IV weniger"]` (deine Zeit je Kapitel; gilt nur, solange der Schalter an ist) |
| Block | ```` ```eba-lernplan modul ```` – seit 2.11.2026 das Modul wie aufgeklappt im Bereich, in einem Rahmen (`.eba-lp-notiz-modul`): oben seine Zeile (`modulKopf` mit `inNotiz`: ohne Kürzel, das der Titel der Notiz nennt, ohne Pfeil, der Name als Link zur Modulseite, links der Strich in seiner Farbe), darunter das Aufgeklappte ohne den Link zur Kapitelliste (vorher eine eigene Zeile mit „·“-Kette über einer zweiten Karte); die Liste unter „Kapitel“ ist dann in der Leseansicht ausgeblendet (Höhe 0, nicht `display: none`: sonst bliebe darunter alles leer) und steht nur beim Bearbeiten |
| `## Kapitel` | je Kapitel `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Folien (`[[X100 Folien 01 …]]`, bei einer PDF für alles `[[….pdf#page=30\|S. 30–52]]`) und die Seitenzahl (`23 S.`); bei einem frei zugänglichen Lehrbuch ein https-Link (`[online](https://…)`); seit 31.10.2026 aus den Listen `[[X100 Folien 01 …\|Folien]]` (ohne Folien im Tresor „Folien 1“, wenn die Nummer von der Kapitelnummer abweicht), `Vorlesung 19.10.2026` (erste Vorlesung zum Kapitel) und `Zwischentest 13.11.2026`, seit 1.11.2026 `in 9 von 12 Altklausuren`; eingerückte Aufgaben = Unterkapitel |

`kapitelLesen` liest nur Aufgaben außerhalb von Frontmatter und Codeblöcken; Nummer = erstes Wort, wenn es eine Ziffer enthält und
die Form der Kapitellisten hat (`1.2`, `1a`, `E1`, `A.1`, `2.3b`; ein Punkt, Doppelpunkt oder `)` dahinter fällt weg), eine römische
Zahl oder ein einzelner Großbuchstabe ist. Abgehakt = verstanden, bei Unterkapiteln anteilig. Häkchen setzt nur die
Studentin oder der Student (in der Notiz oder mit einem Tipp im Bereich); die KI ergänzt Links und Seiten, wenn Folien dazukommen,
und lässt Häkchen stehen.

**Rechnen** (rein, getestet in `tests/lernplan.test.js`):
- *Gewicht* eines Kapitels (`gewichte`): Seiten aus der Zeile, sonst Feld `seiten` der verlinkten Notiz, sonst der Folien mit gleicher
  Nummer (`typ: unterlage`, `art: Folien`, `nummer`; Varianten „mit Anmerkungen“, „unbeschrieben“, „zum Video“ zählen nicht; von einer
  Kopie „… neue Fassung JJJJ-MM-TT“ die neueste, seit 0.6.9), sonst der Mittelwert der bekannten. Hat kein Kapitel des Moduls Seiten (Lehrbuch online), zählt die Zahl der Unterkapitel.
  Mal die *Zeit je Kapitel* (`zeitStufe`, `ZEIT_FAKTOR`, seit 1.11.2026), nur wenn der Schalter des Moduls an ist (`zeit_je_kapitel:
  true`; standardmäßig aus, sonst zählt jedes Kapitel nach seinen Seiten): „mehr“ 1,5, „normal“ 1, „weniger“ 0,5. Deine Wahl
  (`kapitel_zeit`) geht vor, sonst die Klausurrelevanz aus der Liste (`relevanzStufe`, „in 9 von 12 Altklausuren“, ausgezählt vom
  Uni-Abgleich): erst ab fünf Altklausuren (`ALT_MIN`), ab drei Vierteln mehr, bis zu einem Viertel weniger, sonst normal. *Da* = ein Link
  zeigt auf eine vorhandene Datei, ein https-Link steht in der Zeile oder Folien mit dieser Nummer existieren (in Notizen aus
  Kapitellisten nur nach dem Titel: Die Nummern hat der Abgleich mit der ganzen Liste schon verlinkt). *Erreicht* = die
  Vorlesung hatte das Kapitel (`Vorlesung …` in der Zeile, nicht nach heute); führt die Notiz bei keinem Kapitel einen Tag, gilt
  jedes als erreicht (wie vor dem 31.10.2026).
- *Klausur* (`klausurVon`): `ctx.modell.pruefungVon(code, { termin })` (die eine Regel des Datenmodells) im Haupt- und im
  Nachholtermin; es gilt deine Wahl (`imNachhol`: `klausurtermin: Nachholtermin` in der Modulnotiz). Ohne Prüfungstermin der Beginn
  der nächsten Prüfungsphase, im Nachholtermin der nächsten Nachholphase („geschätzt“, in der Wahl „ab 30.3.“), damit der Plan ein
  Ende hat. *Beginn*: Vorlesungsbeginn des Semesters, frühestens `seit`. Das Semester ist das laufende; wer im Nachholtermin
  schreibt, behält das Semester der Notiz bis 45 Tage nach dessen Ende (`planSemester`), sonst fiele der Plan kurz vor der
  Nachholklausur weg.
- *Wahl der Klausur* (`terminWahl`, `spaeterSemester`, seit 1.11.2026): je Modul Haupttermin, Nachholtermin oder verschoben (die
  Notiz ist „nicht mehr dran“, weil das Modul jetzt in einem anderen Semester liegt). Verschieben legt `semester_geplant` der
  Modulnotiz auf das nächste Semester der Semesterliste, in dem das Modul angeboten wird (`turnus` „WS“, „SS“ oder beides);
  zurück holt es ein Termin (`semester_geplant` leer, wenn der Musterplan es ohnehin ins Semester legt, sonst dieses Semester).
  `terminSchreiben` schreibt nur die Modulnotiz (wie die Modulseite), der Plan richtet sich beim neuen Zeichnen danach. Nichts zu
  wählen gibt es bei fertigen Modulen, Notizen anderer Semester und Notizen ohne Kapitel.
- *Ziel* (`zielVon`): Sonntag der Woche, in der 70 % der Tage von Beginn bis Klausur vorbei sind, höchstens der Sonntag vor der
  Klausurwoche. Den Anteil wählst du im Lernplan (`anteilWahl`, seit 1.11.2026): 60 % (mehr Zeit für Altklausuren), 70 % oder
  80 %, gespeichert als `lernplan_anteil: 60` in `System/Einstellungen.md`. Ohne Wahl folgt er der Zielnote aus den Einstellungen
  (`anteilAusZielnote`, Döbele: Priorität der Noten): bis 1,5 60 %, bis 2,5 70 %, schlechter 80 %, ohne Zielnote 70 %;
  `verstanden_bis` geht vor.
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
  Last, steht neben ihrem Namen die Pille „viel zu tun“. Je Modul eine Bahn: Beginn, *Stand* (wo der Plan bei deinem Fortschritt ist: die Woche, in der
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
- *Anteil der Zeit* (`ANTEILE`, `anteilWahl`, `zielBei`, `zielVorschau`, `zielTeile`): 60, 70 oder 80 % (am 1.11.2026 kurz als
  Zielnote mit zehn Noten in drei Stufen; die Rückmeldung: lieber gleich den Anteil). `zielBei` ist „verstanden bis“ eines Moduls
  bei einem Anteil; lernt es erst nach der Vorlesung und hält die das Ziel schon später, nicht früher. `zielVorschau` nimmt davon das früheste und
  späteste über die Module ohne eigenes `verstanden_bis` und die Wochen danach bis zur Klausur, `zielTeile` macht den Satz daraus
  („bis So 27.12., danach 6 Wochen Klausurvorbereitung.“; mehrere Module als Spannen ohne Wochentag, die Werte fett).

**Oberfläche:** Bereich `Studium/Lernplan.md` mit ```` ```eba-lernplan ````, seit 3.11.2026 ganz oben **Heute** (beim ersten Mal davor
der **Einstieg**, beide unten beschrieben), seit 1.11.2026 dann **dein Stand**, der
**Semesterplan** mit dem Anteil der Zeit und die **Module** als Zeilen (am 1.11.2026 zuerst der Semesterplan ohne Modulfarben über
Modulzeilen; die Rückmeldung: zu schlicht, nicht motivierend, und dass die Zielnote den Plan verschiebt, muss man sehen und ändern
können; vom 31.10. bis 1.11.2026 „Diese Woche“ als Liste und „Wochen“ als Zeilen mit „Alle Wochen“, das Ziel als Satz unter den
Modulen). **Farben:** Jedes Modul trägt seine Farbe aus dem Stundenplan (`ctx.woche.modulFarben` aus `woche.js`, dieselbe
Zuordnung wie im Wochenraster; Module ohne Stundenplan bekommen die nächsten Farben nach Kürzel, `modulFarben`) in Bahn, Säule,
Kapitelzeile und Modulzeile, das Kürzel steht immer daneben; Texte bleiben in Text- und Grautönen (Skill dataviz, docs/design.md
Grundsatz 7). Dein Stand über alles (Ring, Balken) im Akzent, dunkel `--eba-accent-text`; getönt (offen) hell 45 % (bis 2.11.2026 30 %: offene
Bahnen hatten zur Karte kaum 1,5 : 1), dunkel 50 % der Farbe (bis 1.11.2026 38 %: die Bahnen von B110 und B180 hatten kaum 1,8 : 1).
**Dein Stand** (`heldZeichnen`; seit 2.11.2026 ohne Kasten als Einleitung über dem Semesterplan, vorher eine Karte: zwei gleich
starke Kästen oben ließen offen, wo die Seite beginnt): links ein Ring (`ringZeichnen`, SVG): verstanden ab 12 Uhr im Uhrzeigersinn, dahinter bis
zum Plan der Rückstand schraffiert in Warnfarbe wie in Bahnen und Säulen (SVG-Muster je Ring; bis 2.11.2026 voll, bei 0 % las er
sich wie Fortschritt), ein Strich, wo der Plan heute steht (kaum über den Ring hinaus), in der Mitte „38 %“ und „verstanden“; alles verstanden:
grün. Daneben `heldText` in der Schrift der Überschriften, darunter „Nächste Klausur“ mit Farbpunkt, „B180 in 90 Tagen“ und
Datum (bis 2.11.2026 breit rechts hinter einer Linie, mit „Diese Woche“, das der Kopf der Woche schon sagt; dazwischen klaffte ein
Drittel der Breite). Zahl und Einheit stehen mit festem Leerzeichen („98 Tagen“, „3–4 Wochen“), so bricht keine allein um.
Der **Semesterplan** (`planZeichnen`) ist eine Karte. Im Kopf „Semesterplan“ und der Satz **Alles verstanden nach [60 %] [70 %]
[80 %] der Zeit** (`zielZeichnen`; drei Knöpfe auf einer Spur, der gewählte im Akzent wie der Segmentschalter in docs/design.md, Tippfläche 44 px; auf dem iPhone „Alles verstanden
nach“ in einer Zeile, die Knöpfe und „der Zeit“ in der nächsten). Darunter, was das heißt (`zielTeile`, „Alles verstanden zwischen
17.1. und 28.2., danach 3–4 Wochen Klausurvorbereitung.“; bis 2.11.2026 „Bis 17.1.–28.2.“, ohne zu sagen, was; kommt der Anteil noch aus
der Zielnote, mit „Nach deiner Zielnote 1,3:“ davor). Zeigen oder Fokus auf einen anderen Anteil (Pfeiltasten wandern) zeigt, was er
hieße: „Mit 80 %: alles verstanden bis …“ und gestrichelt, wie lange das Verstehen jedes Moduls dann dauerte (`zielBei`), der Balken tritt zurück. Ein
Tipp schreibt `lernplan_anteil` in `System/Einstellungen.md` (`anteilSchreiben`); der Bereich zeichnet sich danach neu, und die
Bahnen gleiten von ihrer alten Lage in die neue.
Darunter das Bild aus `planBild`. Je Woche eine Säule, gestapelt je Modul in seiner Farbe (2 px Fuge zwischen Modulen; verstanden
voll, offen getönt, überfällig schraffiert in Warnfarbe wie in Bahn und Ring; die gewählte mit 1 px Rahmen im Akzent, bis 2.11.2026
1,5 px in Textfarbe, der lauteste Strich des Bilds), je Modul eine Bahn mit Farbpunkt und Kürzel davor (nach Klausurdatum): dicker Balken =
Kapitel verstehen (offen getönt mit 1 px Kontur in der Farbe, seit 2.11.2026; gefüllt bis zum Stand, dahinter bis heute schraffiert in Warnfarbe), Strich in der Farbe des Moduls = alles verstanden (bis 2.11.2026 dunkel wie die
Striche „Plan heute“ in Ring und Karte),
dünne Linie in der Farbe = Klausurvorbereitung, Raute = Klausur (in `--eba-bad` wie Prüfungen überall), Ring = Zwischentest
(Marken mit 2 px Ring in der Kartenfläche). Zeigt man auf eine Bahn, treten die anderen Bahnen und ihre Teile der Säulen zurück. Dahinter Pausen, diese Woche, die
gewählte Woche und die Linie „heute“ mit ihrer Pille oben (bis 2.11.2026 in der Achse, wo sie den Monat daneben verdrängte, auf dem
iPhone zwei); darunter die Achse mit den Monaten (gemessen in px; ein Monat am rechten Rand steht links von seinem Strich und entfällt, wenn er dort an den Monat davor
stieße) und die Legende in derselben Form wie die Marken, neutral grau, nur mit dem, was vorkommt (Pausen mit
Namen). So sieht man die Regel 70/100 an jedem Modul: Der dicke Balken endet beim Strich, die Linie läuft bis zur Klausur. Form nach
dem Skill dataviz (Balken ≤ 24 px, 2 px Fuge, Ringe in der Kartenfläche statt Rahmen, Text nie in Datenfarbe).
Schmal (iPhone, Container unter 520 px) statt der Säulen die **Wochenleiste** (`leisteZeichnen`, `leisteFenster`) über der gewählten
Woche: sieben Wochen um die gewählte (am Rand bündig) als Knöpfe mit dem Montag und der Säule der Woche, diese Woche im Akzent,
vorlesungsfreie getönt, eine mit Klausur mit roter Raute; ein Tipp oder ← → wählt, das Fenster wandert mit. Die sieben Wochen der
Leiste stehen als getöntes Band in den Bahnen darüber, oben und unten ein Strich in der Farbe des Rahmens der gewählten Woche,
in der Legende „Wochen unten“ (`.eba-lp-plan-fenster`, `--lp-fenster`, seit 2.11.2026: Bahnen und Leiste waren zwei Zeitskalen
ohne Verbindung; ein grauer Balken je Woche statt der Farben der Module las sich leer und wurde verworfen; zuerst nur getönt mit
Strichen an den Seiten, kaum 1,13 : 1 und wie Monatslinien). Die Säulen waren dort 8 px
breit, lasen sich wie ein Strichcode und waren kaum zu treffen; bewusst keine Leiste zum Wischen, denn waagerechtes Wischen ist in
Obsidian von überall auf der Fläche eine Geste (Seitenleisten, hier zurück; [„Öffnen und Navigieren“](bedien-bausteine.md)). Welche von beiden
gilt, entscheidet CSS. Schmal steht auch die Legende hinter ⓘ neben „Semesterplan“ (`.zeigt-legende` an der Karte; offen gleich unter dem Kopf statt unter
dem Bild, wo sie am unteren Rand aufging; ⓘ bleibt getönt, solange sie offen ist). Im Kopf der Woche steht schmal nur „0 von 3“ ohne
Balken. Mit beidem und
den Modulen zu ist die Seite auf dem iPhone bei Schrift 20 etwa 1800 px hoch (vor dem 1.11.2026 etwa 3300).
Unter dem Bild die **gewählte Woche** (`wocheZeichnen`; Tipp auf eine Säule, ‹ › mit 44 px Tippfläche oder Pfeiltasten; gemerkt
bis morgen, sonst diese Woche): „Diese Woche“, „Nächste Woche“, „Letzte Woche“ oder das Datum (trägt sie viel mehr als der
Schnitt, die Pille „viel zu tun“, breit rechts vor dem Stand, schmal unter dem Namen; bis 2.11.2026 „viel“ in Warnfarbe allein in einer Zeile, dann kurz
zwischen Namen und ›, wo sie den Pfeil springen ließ), rechts wie viel der in ihr fälligen
Kapitel verstanden sind (Balken und „2 von 5“, bis 2.11.2026 „2/5“, leicht zu verwechseln mit „0/13“ hinter einem Titel; ist alles verstanden und nichts überfällig, ein Haken und „geschafft“ in Grün; künftige
Wochen nur „5 Kapitel“) und die Zeit der Woche mit Menü (nicht für vergangene; ein offenes Menü schließt beim neuen Zeichnen, auch nach einer neuen
Fassung des Skripts, sonst stand es losgelöst über der Seite; volle Zeit als leise Uhr mit Pfeil, Tippfläche 44 px,
weniger als Wahlpille im Akzent, „halbe Zeit“; docs/design.md: derselbe Wert in jeder Woche gehört nicht in eine Pille). Darunter
Klausurvorbereitung, Pausen mit Namen und Klausuren nach Datum (fett) als Stücke, die nicht mitten umbrechen (`stuecke`; der Punkt
hängt am Stück davor, so steht keiner am Zeilenanfang); dann die Kapitel der Woche als Zeilen zum
Abhaken, mit Farbpunkt und Kürzel davor (schmal, unter 520 px Breite der Woche bzw. der Liste, mit der Nummer vor der Fälligkeit
unter dem Titel, „B110 1“, der Titel hat so die ganze Breite; bis 2.11.2026 nur am iPhone, in der Spalte der Module am iPad quer
standen Fristen dreierlei; die Zahl der Unterkapitel bricht mit dem letzten Wort des Titels um, nie allein): In dieser Woche erst die in ihr fälligen offenen Kapitel über alle Module, dann unter „Von früher“ die noch
offenen früherer Wochen (der Kopf zählt nur diese Woche; bis 1.11.2026 gemischt, „0/2“ über acht Zeilen). Schmal (iPhone) ist
„Von früher“ eine Zeile zum Aufklappen mit der Zahl („6 Kapitel · 4 überfällig“, nur der überfällige Teil in Warnfarbe), zu, bis man sie aufklappt
(gerätelokal, `ctx.bleibend`); breit ist sie immer offen, mit der Zahl und ohne Pfeil. Daneben (`bisText`) „bis
So 1.11.“ oder in Warnfarbe „überfällig seit So 18.10.“ (da und von der Vorlesung erreicht), „noch nicht da“, bis Sonntag „vor der
Vorlesung“ und der Zwischentest; war ein Kapitel früher fällig, ist aber nicht überfällig (noch nicht da, die Vorlesung hatte es noch
nicht), steht kein Datum, das vorbei ist, nur der Grund („vor der Vorlesung“, mit `vorlernen: false` „nach der Vorlesung“); heute hier
Abgehaktes bleibt durchgestrichen bis morgen stehen (gerätelokal, zum Zurücknehmen); in der Klausurvorbereitung je Modul „2
Altklausuren auf Zeit, zuerst …“ (Link). In jeder anderen Woche die Kapitel, die in ihr fällig sind, verstandene durchgestrichen.
Ohne Kapitel „Nichts fällig.“, alles schon verstanden „Alles für diese Woche verstanden.“. Ein eben abgehaktes Kapitel leuchtet grün
auf und sein Kästchen springt (`abgehakt.zuletzt`; nach dem neuen Zeichnen läuft das mit negativer Verzögerung weiter). Ein Tipp auf
eine Bahn klappt das Modul unter „Module“ auf und rollt dorthin (`modulZeigen`). Beim ersten Zeichnen je Start wachsen Säulen und
Bahnen einmal; danach gleiten Bahnen und Ring vom letzten Stand zum neuen (`vorher`, gerätelokal: nach einem Häkchen, einem anderen
Anteil, einem anderen Termin), nicht bei reduzierter Bewegung.
**Module** (`modulZeileZeichnen`, seit 2.11.2026): je Modul eine Zeile in einem gemeinsamen Rahmen (Zeilenliste nach
docs/design.md; vom 1.11. an Karten im Raster mit großen Namen in der Schrift der Überschriften: fünf gleiche Kästen waren lauter als
die Woche, die Entscheidung war nach dem Design-Review offen), sortiert nach Klausur, Vorbereitung und Vorbei ans Ende, „nicht mehr
dran“ ganz ans Ende (leiser). Links das Kürzel mit Farbpunkt, daneben der Name (600) und die Pille bei einem Zustand, darunter ein
kleiner Balken (neutrale Spur, gefüllt in der Farbe des Moduls, Strich, wo der Plan heute steht) und der Stand kurz („2 von 7
Kapiteln“; ohne Plan wie `standTeile`); rechts gedämpft der gewählte Termin mit den Tagen bis dahin (`terminKurz`: „Haupttermin
Mo 8.2. · in 98 Tagen“, „verschoben“; bis 2.11.2026 abends stand „Klausur in 98 Tagen“ links im Stand) und der Pfeil, der sich
offen dreht. Offen fehlt der Termin rechts, den sagt die Wahl oben im Aufgeklappten (vorher stand das Datum dreimal da). Schmal
(Container `eba-lp-liste` unter 520 px) steht der Name über die ganze Breite, darunter das Kürzel als Text mit Farbpunkt wie in
den Kapitelzeilen und der Termin, dann Balken und Stand, dahinter der Zustand in seiner Farbe („0 von 15 Kapiteln · 2 Kapitel
überfällig“, statt der Pille neben dem Namen); offen steht das Kürzel vor dem Balken (bis 2.11.2026 abends stand das Kürzel in
einer eigenen Spalte, unter ihm blieben 80 px leer, und lange Namen brachen in drei Zeilen; danach kurz als getönte Pille unter der
des Zustands, die wie ein zweiter Zustand aussah, und offen allein in einer Zeile); auf Touch-Geräten ist jede Zeile mindestens
44 px hoch. Oben im Rahmen steht „Module“ als Kopf wie „Semesterplan“ in seiner Karte (vorher ein Label darüber), rechts, wie viele
Klausuren wann („Klausuren: 4 im Haupttermin, 1 im Nachholtermin, 1 verschoben“, `wahlText`). Ein Tipp klappt das Modul direkt unter seiner Zeile auf (`modulInhalt`, gerätelokal über
den Hot-Reload, `ctx.bleibend`; Zeile und Aufgeklapptes tragen links einen Strich in seiner Farbe). Immer nur eins ist offen
(`offenSetzen`, seit 1.11.2026); steht das Aufgeklappte im unteren Viertel des Fensters oder darunter, rückt es nach oben.
Aufgeklappt:
Ganz oben **Klausur**: wann du sie schreibst (`wahlZeichnen`, `.eba-lp-termin`; seit 2.11.2026 abends wieder oben, vorher kurz als
erste Zeile von „Für die Klausur“ unter allen Kapiteln, wo man sie nicht fand; davor auf jeder Karte, wo zehn umrandete Knöpfe und
fünf Links das Lauteste der Seite waren): zwei Knöpfe Haupttermin und Nachholtermin mit Tag (der gewählte im Akzent; bis 1.11.2026
voll; Tippfläche 44 px; auf dem iPhone über die ganze Breite) und leise „Ins WS 2027/28 verschieben“; bei einem verschobenen Modul
ist keiner der Knöpfe gewählt, einer holt es zurück, und statt „Ins … verschieben“ steht im Akzent „Zurück ins WS 2026/27“ (in
den Haupttermin); gleich nach dem Verschieben sagt ein Hinweis „S110 liegt jetzt im WS 2027/28.“ mit **Rückgängig** (seit 2.11.2026:
Wer sich vertippt hatte, sah nicht, dass die Knöpfe ohne Wahl es zurückholen). Dann die Kapitel, darunter **Üben** (`vorbereitungZeichnen`; bis 2.11.2026
„Für die Klausur“, zu nah an „Klausur“ darüber): Altklausuren, Übungsblätter, Karteikarten (siehe unten). „Klausur“ und „Üben“ sind
Labels im selben Stil; der Hinweis unter den Altklausuren beginnt in der Spalte ihres Werts, „ab Mo 28.12.“ und der Name der
nächsten Klausur brechen nicht in sich um.
**Zwei Spalten** (seit 2.11.2026, `.eba-lp-raster`): Ab 1100 px Breite (iPad quer) steht die gewählte Woche links in einer eigenen
Karte unter dem Semesterplan und rechts daneben die Module (440 px, ihre Zeilen schmal; der Container `eba-lp-liste` entscheidet das
nach der Breite der Liste), beide oben bündig. Ist rechts ein Modul offen, bleibt die Woche beim Scrollen oben stehen, wenn sie ganz
ins Fenster passt (`haftenPruefen`, `is-passt`, auch nach dem Drehen; sonst blieb links eine Fläche von 725 × 860 px leer). Schmaler
stehen beide über die volle Breite, die Woche bündig an der Karte darüber wie vorher in ihr. Über die volle Breite standen Fristen am iPad quer bis
1170 px vom Titel; eine Grenze von 760 px (kurz am 2.11.) ließ rechts ein Drittel der Seite leer.
**Lernplan einstellen** (`EinstellFenster`, `einstellungenZeichnen`, seit 2.11.2026; vorher im aufgeklappten Modul, „Anpassen“
legte die Wahl unter jedes Kapitel, am iPhone etwa 3700 px): ein Fenster hinter dem Regler (Symbol mit Schiebereglern; bis 2.11.2026 abends ein Zahnrad wie das für Einstellungen & Hilfe) rechts neben dem Titel des Lernplans
(`kopfRegler`, setzt es in den Seitenkopf `.eba-kopf` derselben Leseansicht, bei jedem Zeichnen wieder; rechts schwebend wie der
Platzhalter für Obsidians Knopf Lesen/Bearbeiten, links neben ihm auf seiner Höhe, auf gesperrten Seiten ohne den Knopf bündig am
Rand; bis 2.11.2026 abends eine Flexbox, die den Platzhalter aus dem Fluss nahm: am iPhone stand er unter dem Titel). In
einer Lernplan-Notiz zeigt es nur ihr Modul; „Fertig“ bleibt unten stehen. Je Modul mit Plan ein Band mit Kürzel und Name
(Gruppenkopf), dann die Einstellungen als Zeilen mit einem **Schalter** rechts (`umschalter`, docs/design.md „Schalter“; seit 2.11.2026,
vorher das Kästchen der Kapitel, eingeschaltet sah eine Einstellung aus wie ein verstandenes Kapitel): **Vor der Vorlesung
lernen** (`schalterZeichnen`), dann **Zeit je Kapitel** (`zeitZeile`, `zeitSatz`; standardmäßig aus,
an schreibt nur die Zeile `zeit_je_kapitel: true`, `zeitAnSetzen`). Aus sagt der Satz darunter, was das Einschalten brächte („Alle
Kapitel zählen nach ihren Seiten. Eingeschaltet nach 11 Altklausuren mehr Zeit für 1, 2 und 7, weniger für 3.“); `kapitel_zeit`
bleibt dabei in der Notiz und gilt wieder, sobald man ihn einschaltet. An sagt er, woher die Zeit kommt („Nach 12 Altklausuren: mehr
Zeit für 4 und 7, weniger für 1. Von dir geändert: 3.“ bzw. „Nach den Seiten der Kapitel.“). Eingeschaltet folgt ein Satz
(„„Mehr“ ist anderthalbmal so viel Zeit, „Weniger“ halb so viel.“) und je Kapitel eine Zeile (`kapitelWahl`): Nummer, Titel,
darunter die Herkunft („in 11 von 12 Altklausuren“), rechts (iPhone darunter) der Segmentschalter Weniger, Normal, Mehr
(`zeitWahlZeichnen`, `.eba-ds`); ein Tipp schreibt nur die Zeile `kapitel_zeit` (`zeitSetzen`), und was dem Vorschlag aus den
Altklausuren entspricht, steht nicht darin, so gilt ein neuer Vorschlag später wieder. Jede Änderung schreibt sofort; das Fenster
zeichnet sich neu, sobald Obsidian die Notiz neu gelesen hat, die Seite dahinter ebenso. Seit 3.11.2026 folgt das Fenster, solange es
offen ist, jeder Änderung an den Dateien eines Lernplans (`relevant`, wie die Seite: metadataCache „changed“, `delete`, `rename`,
entprellt 400 ms), auch über den Sync. Es zeichnet in ein neues Element und tauscht es erst danach ein; nur der neueste Lauf kommt
ins Fenster (`lauf`). Vorher zeichnete es nach der eigenen Änderung genau einmal neu (`nachAenderung`, höchstens 1,5 s): Erwischte
das einen Zwischenstand, fehlten auf einem iPad nach „Vor der Vorlesung lernen“ aus die Module, bis die App neu startete. Im
aufgeklappten Modul steht hinter der Frist „mehr Zeit“ bzw. „weniger Zeit“, wenn ein Kapitel nicht normal zählt. Auf dem iPhone
beginnen „Üben“ und der Verweis am linken Rand, nicht in der Spalte der Titel (sie ließ dort nur ein Drittel der Breite).
Kästchen wie bei den To-dos (`.eba-td-haken`, ganze Zeilenhöhe als Tippfläche, auf iPhone und iPad 44 px, auf dem iPhone auf Höhe
der ersten Zeile; halb verstanden = unbestimmt und „1 von 3“ hinter dem Titel (bis 2.11.2026 „1/3“, als einzige Zahl der Seite ohne „von“); Titel mit Link leise unterstrichen), Nummer, Titel (Tipp
öffnet die Folien bzw. das Lehrbuch), daneben `bisText` (auf dem iPhone unter dem Titel), darunter in der Spalte der Titel **Üben**
(Altklausuren „3 von 11 bearbeitet · diese Woche 2 auf Zeit · als Nächstes …“, vor dem Ziel „auf Zeit ab …“, der Satz zur
neuesten für den Vortag: „Die neueste, …, bleibt für den Tag vor der Klausur.“; Übungsblätter; Karteikarten „12 heute dran ·
Lernen“) und der Link auf die Notiz. Der Schalter **Vor der Vorlesung lernen** (unter „Lernplan einstellen“) schreibt
`vorlernen: false` bzw. löscht es (`vorlernenSetzen`: nur diese Zeile, `processFrontMatter` schriebe das ganze Frontmatter neu und
nähme den Anführungszeichen um `semester` und `quelle`); aus sagt er, wenn das Ziel dadurch später liegt. Die Lernplan-Notiz zeigt
seit 2.11.2026 das Modul wie aufgeklappt (Tabelle oben, „Block“); `standTeile` („2 von 7 Kapiteln · diese Woche Kapitel 3 ·
verstanden bis So 3.1. · Klausur Sa 6.2.“, jeder Teil mit festen Leerzeichen; in der Klausurvorbereitung „seit Mo 26.10.“, wenn die
Pille „Klausurvorbereitung“ schon sagt; sonst nur, was diese Woche fällig wird, Überfälliges sagt die Pille, oder das nächste
Kapitel mit Datum) stehen auf der Modulseite und in den Bahnen. Abhaken schreibt genau diese Zeile (`- [ ]` ↔ `- [x]`), nur wenn ihr Text noch stimmt, sonst ein Hinweis (wie
`todos.js`).
**Heute** (`heuteZeichnen`, seit 3.11.2026; Rückmeldung: Der Lernplan sah gut aus, sagte beim ersten Öffnen aber nicht, was jetzt
zu lernen ist): eine Karte ganz oben, vor dem Stand. Im Kopf „Heute“ mit Datum, rechts was erledigt ist („40 Min. von 2¼ Std.“, vorher
„etwa 2¼ Std.“) und die Lernzeit als Pille, die „Lernplan einstellen“ öffnet; darunter die freie Zeit zwischen den Kursen
(`luecken`: Stundenplan über `ctx.modell.findetStatt`, 8 bis 20 Uhr, Lücken ab einer Stunde). Die Einträge: Kapitel, offene To-dos aus
den Unterlagen der Module mit Plan (`ctx.todos.lesen`, nur mit Frist) und eine Zeile Karteikarten (`ctx.karten.heuteJeModul`, eine halbe
Minute je Karte, Tipp öffnet das Lernfenster). Reihenfolge (`kandidatenVon`, Rang): überfällige Kapitel, To-dos bis morgen (auch bis zu
einer Woche überfällige), Kapitel dieser Woche eines Moduls mit Kurs heute oder morgen, die übrigen Kapitel dieser Woche, To-dos der
nächsten vier Tage, Kapitel der nächsten Woche (nur über „Mehr für heute“, dann „Vorarbeiten“). Kapitel, die noch nicht da sind, fehlen.
`heuteFuellen` nimmt der Reihe nach, bis die Lernzeit voll ist (eines immer, wenn Zeit da ist); ein Kapitel, das weit darüber ginge (über
eine Stunde und mehr als eine Viertelstunde über der restlichen Zeit), kommt nur mit einem Teil, mindestens einer halben Stunde
(„heute ein Teil von 3¼ Std.“). Die Zeit eines Kapitels (`minutenVon`): 2 Minuten je Seite, ohne Seiten 20 je Unterkapitel, sonst 45,
mindestens 15, mal die Zeit je Kapitel, wenn sie an ist; halb Verstandenes zählt nur den Rest. Ein To-do zählt 30 Minuten. Die Auswahl
merkt sich jedes Gerät für den Tag (localStorage `eba-lp-heute`: `ids`, `snap` = wie ein Eintrag aussah, `teil`, `budget`), damit
die Liste den Tag über gleich bleibt und Erledigtes durchgestrichen stehen bleibt; ein To-do, das nicht mehr offen ist, gilt als
erledigt. Ändert sich die Lernzeit, bleibt Erledigtes und der Rest wird neu gefüllt. Abhaken schreibt wie in der Woche (Kapitel:
`schreiben`; To-do: `ctx.todos.abhaken`, zurück mit `ctx.todos.zuruecknehmen`). Unter jedem Titel Kürzel und Kapitel, „überfällig
seit …“ in Warnfarbe, die Seiten und „heute 14:15 Vorlesung“ bzw. „morgen Übung“; rechts die Zeit. Leer: „Für heute ist nichts offen.“
bzw. „Heute hast du keine Lernzeit eingestellt.“ (dann „Trotzdem etwas lernen“), alles erledigt: „Für heute geschafft.“
**Lernzeit am Tag** (`tageszeitZeichnen`, oben im Fenster „Lernplan einstellen“, nur im Bereich): je Wochentag eine Auswahl von frei bis
5 Std., gespeichert als `lernplan_tageszeit: [120, 120, 120, 120, 120, 60, 0]` (Minuten, Montag zuerst) in `System/Einstellungen.md`;
ohne Angabe gilt genau diese Vorgabe (`TAG_VORGABE`).
**Einstieg** (`einstiegZeichnen`, seit 3.11.2026): Solange `lernplan_einstieg` in den Einstellungen fehlt, kein Kapitel eines Moduls mit
Plan abgehakt ist und der Plan schon überfällige Kapitel zeigt, steht über „Heute“ „Wo stehst du?“ mit einem Satz, warum es nach Rückstand
aussieht, einem Satz zur Regel und zwei Knöpfen: **Ab heute planen** setzt `seit` (Montag dieser Woche) in jeder Lernplan-Notiz, deren
Plan früher beginnt (nur diese Zeile, `zeileSetzen`), **Ich habe schon gelernt** klappt das erste Modul mit überfälligen Kapiteln auf.
Beide schreiben `lernplan_einstieg` (Datum), danach erscheint der Kasten nicht wieder.
**Noch nicht hochgeladen** (seit 3.11.2026): In „Diese Woche“ stehen Kapitel, die noch nicht da sind, nicht mehr als Zeilen zum Abhaken,
sondern leise in einer Zeile unter den übrigen („Noch nicht hochgeladen: S110 Kapitel E, I und II“, `.eba-lp-k-kommt`); der Kopf der Woche
zählt sie weiter mit.
**Dashboard** (```` ```eba-lernplan woche ````, unter den Karteikarten): eine Zeile wie die der Karteikarten, bis zu drei Kapitel mit
Namen („Lernplan · B110 Kapitel 2 · S100 Kapitel 1“), mehr als Zahl („8 Kapitel, davon 4 überfällig“), dazu „2 Altklausuren
S100“, jedes als Stück, „Lernplan“ und Text fließen in einer Zeile (Leerzeichen statt Rand, ein Umbruch beginnt bündig; der Punkt
hängt neben seinem Stück und zählt nicht zu dessen Breite), mit
**Öffnen**; nichts dran oder keine Notiz: samt Hülle unsichtbar.
**Modulseite** (`modulZeile`, aus `modul.js` unter „Als Nächstes“): Abschnitt „Lernplan“, Pille und Stand wie im Bereich ohne die
Klausur (die Seite nennt die Prüfung schon) und Pfeil
(15 px wie die Zeilen von „Als Nächstes“; wird es eng, rutscht der Stand unter die Pille), Tipp öffnet die Lernplan-Notiz; ohne
Notiz nichts.
Neu gezeichnet bei Änderungen in `Lernplan/`, `Unterlagen/`, `Termine/`, `Module/`, `System/Einstellungen.md`, am Datenmodell und an
einem neuen Tag. CSS: Abschnitt 61 in `eba-core.css`. Notizen schreibt `lernplan.js` nur im Abgleich mit den Kapitellisten, und den
macht nur der Abrufer: 45 s nach dem Start, bei neuen Listen, bei neuen Folien und an einem neuen Tag (neues Semester, geänderter
Plan); die Listen des eigenen Servers schreibt `serverListen` beim Übernehmen des Eingangs. Für die Claude-App liest
`kapitelStand()` den Stand jedes Lernplans, der noch dran ist (je Kapitel Nummer, Titel, verstanden und der Montag der Woche, in der
der Plan es vorsieht); `server.js` schickt ihn nur, solange die Claude-App an ist ([connector.md](connector.md#plugin)).

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
