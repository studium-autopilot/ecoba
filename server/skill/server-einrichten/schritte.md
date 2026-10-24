# Schritte der Einrichtung

Jeder Schritt beginnt mit der Prüfung „Schon erledigt, wenn …“. Ist er erledigt, sagst du das in einem Satz und gehst weiter.
Ist ein Schritt halb fertig (Server angelegt, Installation abgebrochen), gilt er als offen und wird wiederholt: Alle Befehle
sind wiederholbar und legen nichts doppelt an.

| # | Schritt | Schon erledigt, wenn … |
|---|---|---|
| 0 | Voraussetzungen und Art | – (immer, kurz) |
| 1 | Oracle-Konto | sich der Mensch bei Oracle anmelden kann |
| 2 | Bestand | – (läuft immer) |
| 3 | Schutz vor Kosten | `stand.mjs` meldet Quota „nur-kostenlos“ und Budget „kostenwarnung“ |
| 4 | Server anlegen | `stand.mjs` meldet „Server … ist schon angelegt“ |
| 5 | Paket installieren | `https://<Adresse>/v1/status` antwortet mit einer Version, mindestens der aus `server/VERSION` |
| 6 | Claude auf dem Server | Status: `claude` ist `angemeldet` |
| 7 | Gmail (freiwillig) | Status: `gmail` ist `ok`, oder der Mensch will kein Gmail |
| 8 | Uni-Mails | Status: `uni_zugang` ist `gespeichert` oder `weiterleitung` ist `ok` |
| 9 | Obsidian verbinden | Status: `plugin_abruf` liegt höchstens 30 Minuten zurück |
| 10 | Erster Lauf | Status: `letzter_lauf.ok` ist `true` |
| 11 | Kostenprüfung | – (läuft immer am Ende) |
| 12 | Abschluss | – |

Den Status liest du selbst (Webabruf, öffentlich, ohne persönliche Daten), der Mensch muss nichts kopieren. Die Adresse liefert
`node server/einrichten.mjs adresse`.

## 0. Voraussetzungen und Art

- Fragen: „Soll ich klicken (‚Claude klickt‘), oder klickst du selbst und ich sage an?“
- Nötig: Claude Pro oder Max (Claude läuft auf dem Server mit diesem Abo), Claude Desktop, Studium Autopilot in Obsidian
  eingerichtet. Bei „Claude klickt“ zusätzlich Computer Use und auf Windows Claude in Chrome. Fehlt etwas: sagen, wie man es
  einschaltet, und warten.
- Fenster nebeneinander anordnen (SKILL.md, „Bildschirm geteilt“).

## 1. Oracle-Konto

- Hat der Mensch schon ein Konto: anmelden lassen und weiter mit Schritt 2. Sonst: [signup.cloud.oracle.com](https://signup.cloud.oracle.com).
- Felder erklären, eintragen tut der Mensch: Name, Mail, Land. **Heimatregion: Germany Central (Frankfurt)**, für alle gleich;
  sie gilt für immer. Nicht nach freiem Platz wählen: Platz für den Server fehlt in jeder Region einmal, dafür gibt es den
  Platzsucher (Schritt 4). Hat jemand schon ein Konto mit einer anderen Heimatregion, bleibt es dabei; die Einrichtung läuft dort
  genauso.
- Kreditkarte: nur zur Prüfung, Oracle bucht ohne Upgrade nichts ab. Das Upgrade auf Pay-As-You-Go wird nie gemacht
  ([kosten.md](kosten.md), Regel 1).
- Zwei-Faktor einrichten lässt du den Menschen allein.

## 2. Bestand

Die **Cloud Shell** öffnen (Konsole oben rechts, Symbol **>_**). Dort ist die OCI-Kommandozeile schon angemeldet. Dann das
Server-Paket holen, nur mit passender Prüfsumme. Die erste Zeile mit `curl` nennt die Version dieser Anleitung (beim Release
eingesetzt); den Block genau so kopieren:

```bash
mkdir -p ~/studium-autopilot && cd ~/studium-autopilot
info=$(curl -fsSL https://api.github.com/repos/studium-autopilot/ecoba/releases/tags/v0.6.11)
url=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .browser_download_url' <<<"$info")
summe=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .digest // empty' <<<"$info")
curl -fsSL "$url" -o studium-server.tar.gz && echo "${summe#sha256:}  studium-server.tar.gz" | sha256sum -c - && rm -rf server && tar -xzf studium-server.tar.gz
node server/stand.mjs
```

Meldet `sha256sum` einen Fehler: nichts ausführen, neu laden, sonst anhalten. Das Ergebnis von `stand.mjs` erklärst du in zwei
Sätzen (Kontotyp, was frei ist, was von Studium Autopilot schon da ist). Bei „Ich klicke selbst“ kopiert der Mensch die
Ausgabe zurück. In jeder neuen Cloud-Shell-Sitzung zuerst `cd ~/studium-autopilot`.

Ab Schritt 5 geht alles auf dem Server über **`bash ~/studium-autopilot/server/fern.sh <befehl>`**: Es holt die Adresse selbst,
prüft den Schlüssel und ruft ssh auf; keine IP und kein ssh-Befehl von Hand, auch nicht in einer neuen Sitzung. Exit 4: Der
Server läuft nicht (Schritt 5, Zustand). Exit 5: Er antwortet nicht auf ssh; eine Minute warten, dann denselben Befehl noch
einmal, beim dritten Mal wie eine unbekannte Meldung. Exit 6: Der Server meldet sich mit einem anderen Schlüssel als beim
letzten Mal; den genannten Befehl `ssh-keygen -R <IP>` einmal ausführen, dann denselben Befehl noch einmal. Exit 2 oder 1 mit einer Zeile `[…]` von `adresse` und ohne Ausgabe vom
Server: Schritt 5. Sonst ist es der Exit des Befehls auf dem Server.

## 3. Schutz vor Kosten

```bash
node server/einrichten.mjs schutz --mail <Mail-Adresse>
```

Die Mail-Adresse fragst du ab (Warnungen von Oracle gehen dorthin). Exit 2 heißt: Im Konto läuft schon etwas, das nicht
kostenlos ist. Dann nennst du es, erklärst, dass die Quota weitere bezahlte Ressourcen blockiert, und fragst. Nur mit Zustimmung
noch einmal mit `--ja`.

## 4. Server anlegen

```bash
[ -f ~/.ssh/studium_autopilot ] || ssh-keygen -t rsa -b 4096 -N "" -C studium-autopilot -f ~/.ssh/studium_autopilot
node server/einrichten.mjs netz
node server/einrichten.mjs server --schluessel ~/.ssh/studium_autopilot.pub
```

- Der Schlüssel ist immer RSA mit 4096 Bit unter `~/.ssh/studium_autopilot`; alle späteren Schritte erwarten genau diese Datei.
  (Die Cloud Shell lehnt ed25519 ab.) Liegt dort schon ein Schlüssel, bleibt er.
- Exit 0: weiter mit Schritt 5. Meldet `netz` „[repariert] Teilnetz nutzt jetzt die eigenen Regeln“, war der Server bisher von
  außen nicht erreichbar (bis 0.5.3); ein laufender Server muss dafür nicht neu angelegt werden.
- Exit 1 mit „Neuer Server passt nicht“: Die freie Menge ist belegt (z. B. von einem eigenen Server). Erklären, nichts anlegen
  ([kosten.md](kosten.md), Regel 2).
- **Exit 3 (kein Platz):** Oracle hat in keinem Verfügbarkeitsbereich Platz. Das ist normal und kein Fehler des Kontos. Erklären
  und den **Platzsucher** einrichten, nicht zum Warten oder Wiederholen raten: Ein kleiner kostenloser Helfer versucht es weiter,
  alle paar Minuten, auch wenn der Rechner aus ist, und schickt eine Mail, sobald der Server da ist.

  ```bash
  node server/einrichten.mjs platzsucher --mail <Mail-Adresse> --schluessel ~/.ssh/studium_autopilot.pub
  ```

  Danach: „Bestätige die Mail von Oracle (‚Confirm subscription‘). Du kannst den Rechner jetzt ausmachen. Kommt die Mail ‚Dein
  Server ist da‘, sag mir ‚Weiter mit der Einrichtung‘.“

  Meldet `platzsucher` „[ersetzt] Helfer einer früheren Version beendet“, lief schon ein Platzsucher aus einer älteren Version;
  jetzt sucht ein neuer. Das dauert ein bis zwei Minuten länger und ist kein Fehler. Neu ist nur der Helfer; das Mail-Abo
  bleibt. Wurde die Mail von Oracle schon früher bestätigt, kommt keine neue.

## 5. Paket installieren

```bash
cd ~/studium-autopilot && node server/einrichten.mjs abschliessen && bash server/fern.sh installieren
```

Eine Zeile mit `&&`: Scheitert `abschliessen`, wird nicht installiert. Danach immer die ganze Zeile noch einmal; beides ist
wiederholbar.

- `abschliessen` entfernt die Rechte eines Platzsuchers, lässt die Metadaten des Servers nur über IMDSv2 zu, vergrößert das
  Boot-Volume auf den ganzen freien Rest und setzt die Quota so, dass nichts Neues mehr hinzukommt. Exit 2 mit „Der
  Platzsucher-Helfer läuft noch“: einige Minuten warten, dann die Zeile noch einmal. Meldet es „Boot-Volume … vergrößert“:
  nach dem Installieren einmal `bash ~/studium-autopilot/server/fern.sh neustart`, nach etwa einer Minute weiter (Ubuntu
  vergrößert das Dateisystem beim Start).
- `fern.sh` prüft vor dem Installieren Zustand und Schlüssel (mit `adresse`). Exit 4 „[warten] Der Server ist …“: bei
  `PROVISIONING` oder `STARTING` eine Minute warten, dann die Zeile noch einmal. Bei `STOPPED` in der Konsole unter **Compute
  → Instances** die Instanz „studium-autopilot-server“ öffnen und **Start** klicken (nur diese), nach etwa einer Minute
  weiter. Jeder andere Zustand oder ein Fehler beim Starten: wie eine unbekannte Meldung (SKILL.md, „Fehler ohne Vermutung“).
- Exit 2 mit „Der Server wurde mit … angelegt“: den genannten `cp`-Befehl einmal ausführen, dann die Zeile noch einmal. Exit 1
  mit „Kein Schlüssel … passt“: anhalten, Meldung an den Autor.
- Exit 5 „[fern] Der Server antwortet nicht auf ssh“: Ist der Server gerade erst angelegt, braucht er ein bis zwei Minuten.
  Warten, dann die Zeile noch einmal.
- Fertig ist der Schritt, wenn der Status eine Version meldet, mindestens die aus `server/VERSION`. Meldet ein eingerichteter
  Server eine ältere, kam seine tägliche neue Version nicht an (Obsidian sagt dann „installiert seit mehr als 3 Tagen keine neue
  Version mehr“): Die Zeile oben installiert das Paket dieser Anleitung, Schlüssel, Uni-Zugang und Verbindungen bleiben.

## 6. Claude auf dem Server

```bash
bash ~/studium-autopilot/server/fern.sh claude-anmelden
```

Claude Code zeigt einen Link. Bei „Claude klickt“ öffnest du ihn im Browser; anmelden und **Autorisieren** klickt der Mensch.
Den angezeigten Code kopierst du mit dem Kopier-Knopf auf der Seite und fügst ihn in die Cloud Shell ein, nie
abgetippt: Ein falsches Zeichen, und die Anmeldung scheitert (bei „Ich klicke selbst“ kopiert und fügt der Mensch). Gleich
nach dem Link einfügen, der Code gilt nur ein paar Minuten, nur einmal und nur für den Link desselben Befehls.

Nach jedem Versuch prüft der Befehl selbst den Zustand (`studium-server zustand`). Fertig, sobald dort `claude angemeldet`
steht. Sonst:

- `Login failed: Request failed with status code 400`: Der Code passte nicht zum Link (falsch eingefügt, zu alt oder schon
  benutzt). Den Anmeldebefehl oben noch einmal und nur seinen neuen Link und Code nehmen. Nach drei solchen Versuchen anhalten und
  melden (SKILL.md, „Fehler an den Autor melden“).
- Jede andere Meldung: wie eine unbekannte Meldung (SKILL.md, „Fehler ohne Vermutung“).

## 7. Gmail

- In claude.ai: **Einstellungen → Connectors → Gmail → Verbinden**. Die Google-Zustimmung gibt der Mensch.
- Erklären: Claude sucht und liest auf dem Server nur; Senden, Entwürfe, Labels und Löschen sind dort gesperrt.
- Fertig, wenn der Status nach dem ersten Lauf `gmail: ok` meldet (Schritt 10).
- **Ohne Gmail:** Wer kein Gmail hat oder nicht verbinden will, überspringt diesen Schritt. Uni-Mails gehen dann nur über das
  Uni-Postfach direkt (Schritt 8), und im Fenster „Eigener Server“ steht Gmail auf „nie“. Der Status meldet dann `gmail: aus`
  (sobald Obsidian den Takt geschickt hat); das ist so gewollt.

## 8. Uni-Mails

Zwei Wege. Empfiehl die Weiterleitung; das Uni-Postfach direkt nur, wenn der Mensch es nach dem Abwägen ausdrücklich will.
Ohne Gmail (Schritt 7 übersprungen) entfällt die Weiterleitung: Erkläre das Risiko des Uni-Postfachs direkt wie unten. Will der
Mensch es nicht, kommen keine Uni-Mails auf den Server, und dieser Schritt entfällt.

- **Weiterleitung an Gmail (empfohlen):** Auf dem Server liegt kein Uni-Passwort. Das Uni-Passwort gilt auch für ILIAS, Alma
  und Noten; wer root auf dem Server ist, könnte es sonst entschlüsseln. Nachteil: Uni-Mails kommen erst mit der nächsten
  Gmail-Suche an (7:30, 13:30, 19:30 Uhr, „Mails durchsuchen“), nicht alle 15 Minuten.
  [webmail.uni-tuebingen.de](https://webmail.uni-tuebingen.de/) → links **Webmail → Filter → Weiterleitung** →
  Gmail-Adresse eintragen, **„Kopien der Nachrichten in diesem Konto belassen?“ an lassen** → **Zur Regelliste zurückkehren**
  → Regel per Doppelklick aktivieren. Anmelden tut der Mensch.

- **Uni-Postfach direkt (freiwillig):** Der Server liest das Postfach der Uni nur lesend, alle 15 Minuten. Risiko: Das
  Uni-Passwort liegt verschlüsselt auf dem Server; wer dort root ist, könnte es lesen. Der Mensch tippt es selbst in eine
  verdeckte Eingabe. Bei „Claude klickt“ hältst du an und sagst: „Tipp jetzt dein Passwort, ich schaue nicht hin und tippe
  nichts.“

  ```bash
  bash ~/studium-autopilot/server/fern.sh uni-zugang setzen
  ```

## 9. Obsidian verbinden

```bash
bash ~/studium-autopilot/server/fern.sh verbinden
```

Der Server zeigt einen Einmal-Link (30 Minuten) und einen QR-Code. Am Rechner den Link öffnen: Obsidian fragt „Mit deinem Server
verbinden?“, **Verbinden** tippt der Mensch. Fürs Handy den QR-Code mit der Kamera scannen. Jedes Gerät braucht einen eigenen
Code. Unter **Einstellungen → Verbindungen** steht danach die Zeile „Eigener Server“.

## 10. Erster Lauf

```bash
bash ~/studium-autopilot/server/fern.sh jetzt
```

Der Lauf dauert einige Minuten. Danach `bash ~/studium-autopilot/server/fern.sh lauf` (Ergebnis) und in Obsidian die Zeile „Eigener Server“ („Aktualisiert …“).
Bei „Claude klickt“ schaust du selbst in Obsidian nach, sonst fragst du. Meldet der Status `claude-limit`: Das Abo-Limit ist
erreicht, der nächste Lauf versucht es von selbst.

## 11. Kostenprüfung

```bash
cd ~/studium-autopilot && node server/stand.mjs --kosten
```

Exit 0: alles kostenlos. Exit 1: jede Zeile unter „Befunde“ mit Ursache nennen und erklären, wie man sie behebt. Exit 2: die
Prüfung war unvollständig; den Grund nennen.

## 12. Abschluss

- Was wann läuft: Der Server prüft alle 15 Minuten die Quellen ohne KI; Claude läuft nur bei Neuem und durchsucht Gmail um
  7:30, 13:30 und 19:30 Uhr. Jeden Morgen ab 6:30 Uhr liest Claude die Uni-Mails des letzten Tages noch einmal und holt
  nach, was liegen geblieben ist. Obsidian holt alle 15 Minuten ab. Wie oft der Server nachsieht, stellst du im Fenster
  „Eigener Server“ ein (Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail dreimal, einmal oder nie am Tag).
- Wo der Stand steht: Obsidian → Einstellungen → Verbindungen → „Eigener Server“.
- Claude und dein Obsidian: In Claude Desktop unter **Code** den Ordner deines Tresors öffnen. Dort kennt Claude den Aufbau
  (Skill `.claude/skills/studium-autopilot/` im Tresor), findet Termine und Unterlagen, legt Notizen richtig an und bereitet
  eine Meldung an den Autor vor, wenn du sagst, dass etwas nicht geht.
- Abschalten: in Obsidian **Trennen**; auf dem Server `claude auth logout`; in claude.ai den Gmail-Connector trennen; in der
  Oracle-Konsole die Instanz „studium-autopilot-server“ beenden. Das Konto selbst kostet danach nichts.
