# Lesefassung von Folien

Auf Zuruf („Mach mir eine Lesefassung von B110 Folien 03“, „Die Folien als Text, bitte“): Danach steht der Inhalt der Folien
als Markdown in der Begleitnotiz der PDF, gut lesbar auf iPhone und iPad; die PDF bleibt eingeklappt darüber. Keine eigene
Datei. Nur für die Folien, um die die Person bittet.

## Was gleich bleibt

Anders als bei „Das Wichtigste“ gilt hier: **wörtlich.**

- Text der Folien Wort für Wort, auch Tippfehler und Zeichensetzung. Nichts ergänzen, zusammenfassen oder umformulieren.
  Erlaubt ist nur die Form: Reihenfolge innerhalb einer Folie, Aufzählung ↔ Tabelle, direkt aufeinanderfolgende Folien mit
  gleichem Titel zusammenlegen, die Kapitelnummer im Folientitel weglassen, wenn sie nur das Kapitel wiederholt (unten).
- Hervorhebungen übernehmen: fett `**…**`, unterstrichen `<u>…</u>`. `==…==` nur, wo die Folie selbst etwas als prüfungs-
  oder klausurrelevant nennt.
- Formeln als LaTeX (`$…$`, abgesetzt `$$…$$`), Schreibweise genau wie auf der Folie.
- Links der Folie mit dem Text an dieser Stelle. Sprünge innerhalb der PDF (Navigation) weglassen.

## Woher

- Text aus der Textfassung `Unterlagen/_Volltext/<PDF-Name> (Volltext).md` (je Seite ein Kasten). Fehlt sie oder ist sie
  `gekuerzt`, liest du die PDF selbst (höchstens 20 Seiten je Aufruf).
- Formeln, Tabellen und Folien mit Grafik: zusätzlich die Seite ansehen und danach setzen.
- Lange Foliensätze kapitelweise: ein Kapitel fertig in die Notiz schreiben, dann das nächste. So geht bei einem Abbruch
  nichts verloren.

## Bilder

- Rastergrafiken unverändert aus der PDF holen, nie nachbauen oder abfotografieren. Vektorgrafiken (Diagramme ohne
  eingebettetes Bild) als Ausschnitt der Seite, PNG, etwa 200 dpi. Nachbauen (Tabelle, LaTeX) nur, wenn es klar besser lesbar
  ist und nichts verloren geht. Nur Dateien über etwa 1,5 MB verkleinern (längste Kante 1400 bis 2000 px), Inhalt gleich.
- Werkzeuge: Poppler (`pdfimages -all -p`, `pdftoppm -r 200 -x … -y … -W … -H …`) oder Python mit PyMuPDF. Fehlen sie, fragst
  du, ob du sie installieren darfst. Sonst steht statt des Bilds eine Zeile `Grafik: [[<PDF>#page=N|S. N]]`.
- Ablage: `Anhänge/<Code> Folien/<Code> Folie <NN> <Kurzbeschreibung>.<png|jpg>`.
- Einbinden im Bildkasten, ohne Breitenangabe. Die Bildunterschrift ist die Quellenzeile der Folie, wörtlich; hat die Folie
  keine, gibt es keine.

```markdown
> [!eba-bild]
> ![[B110 Folie 07 Kostenverlauf.png]]
> Quelle: Lehrbuch, Kapitel 3
```

Zwei Bilder einer Folie nebeneinander: beide Kästen in `> [!eba-raster|2]`.

## Aufbau der Begleitnotiz

Das Frontmatter bleibt, wie es ist; dazu kommt `cssclasses` mit `eba` und `eba-folien`. Von oben:

1. `# <Titel>` wie bisher. Modul, Art und Seiten zeigt das Plugin im Kopf.
2. `## Das Wichtigste`, `## Zu tun`, `## Offene Fragen` nach den Regeln in [schreiben.md](schreiben.md). Fehlt „Das
   Wichtigste“, schreibst du es mit. Hat der Foliensatz Formeln, steht direkt unter „Das Wichtigste“ die eingeklappte
   Formelsammlung (unten).
3. Der PDF-Kasten `> [!eba-pdf]- …` bleibt, wo er ist.
4. Darunter die Lesefassung:
   - `## <Kapitel>`: Kapitel bzw. Abschnitt mit seiner Nummer, wie auf der Trennfolie (`## 1.2 Ziele und Methoden`). Aus
     einer Trennfolie wird die Überschrift, keine eigene Folie. Jedes Kapitel ist ein eigenes `##`; Folien vor dem ersten
     Kapitel stehen unter `## Einstieg`.
   - `### <Folientitel wörtlich> [[<PDF>#page=N|S. N]]`, bei mehreren Seiten `S. 7–8`; der Seitenlink steht am Ende, ohne
     Zeichen davor. Ohne die Nummer, die nur das Kapitel wiederholt: Die Folie „1.2 Modelle in der BWL“ unter
     `## 1.2 Ziele und Methoden` wird `### Modelle in der BWL`, ebenso fällt „1.“ in den Folien von Kapitel 1 weg. Eine
     genauere Nummer bleibt (`### 1.2.3 Grenzen der Modelle` unter `## 1.2`).
   - Zusammengehöriges nebeneinander als Karten: `> [!eba-raster|2]` (oder `|3`), darin `> > [!eba-karte] Titel`. Beginnt
     ein Kartentitel mit einer Zahl, den Punkt maskieren: `1\. Ausgangspunkt`. Karten mit Bezug auf eine Folie tragen den
     Seitenlink im Titel.
   - Lange Listen kurzer Begriffe: eine Zeile, getrennt mit „ · “, oder als Liste in `> [!eba-karte|spalten]` (zwei Spalten).
   - Tabellen nur für echte Tabellen und Zuordnungen. Zitate als `>`-Block, die Quelle als `<small>` darunter.
   - Seitenlinks nur in `###`-Titeln und Kartentiteln, nie in `##`.

Das Plugin klappt die Kapitel beim ersten Öffnen zu, auf iPhone, iPad und PC; ein Tipp auf eine Kapitelzeile öffnet sie.
„Das Wichtigste“, „Zu tun“ und „Offene Fragen“ bleiben offen.

## Formelsammlung

Nur bei Folien mit Formeln. Je Kapitel eine eingeklappte Karte, darin je Formel: Name (der Begriff der Folie, sonst kurz und
sachlich), Seitenlink auf die Seite, auf der die Formel steht, darunter die Formel wörtlich aus der Lesefassung.

```markdown
> [!eba-formeln]- Formelsammlung
> > [!eba-karte]- Kosten und Erlöse
> > **Deckungsbeitrag** [[B110 Folien 03 Kosten.pdf#page=12|S. 12]]
> > $$DB = E - K_v$$
```

Aufnehmen: Definitionen und Rechenregeln, die man anwenden muss. Nicht: Zwischenschritte, Beispielzahlen, Doppeltes.
Lückenfolien füllst du nicht aus, du nennst sie der Person.

## Vor dem Abschluss

- Formeln mit dem Schreib-Werkzeug schreiben, nie über die Shell (`echo`, Heredoc): Dort gehen Backslashes verloren.
- Alle `[[…]]` zeigen auf vorhandene Dateien, alle Bilder liegen unter `Anhänge/`.
- Sag der Person, welche Seiten fehlen oder unsicher sind (Lückenfolien, unlesbare Grafiken, fehlende Werkzeuge).
