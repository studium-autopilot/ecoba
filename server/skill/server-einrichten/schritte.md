# Schritte der Einrichtung

Alles im Oracle-Konto und auf dem Server erledigt **ein Befehl** in der Cloud Shell: `start.sh`. Er geht der Reihe nach durch
Bestand, Schutz vor Kosten, Netz, Schlüssel, Server (oder Platzsucher), Abschließen, Installieren, Claude auf dem Server,
Obsidian verbinden, ersten Lauf und Kostenprüfung, erkennt selbst, was schon erledigt ist, und hält nur an, wo ein Mensch oder
Warten dran ist. Weiter geht es immer mit demselben Befehl. Was erledigt ist, entscheidet `start.sh`, nie der Chatverlauf.

| # | Schritt | Wer |
|---|---|---|
| 0 | Voraussetzungen | du, kurz |
| 1 | Oracle-Konto | der Mensch, du erklärst |
| 2 | `start.sh` in der Cloud Shell | du tippst eine Zeile |
| 3 | Während `start.sh` läuft: Gmail und Uni-Mails | du und der Mensch, in einem zweiten Tab |
| 4 | Die letzte Zeile von `start.sh` | du, nach der Tabelle |
| 5 | Claude auf dem Server | `start.sh` fragt, der Mensch meldet sich an |
| 6 | Obsidian verbinden | `start.sh` zeigt den Link, der Mensch bestätigt |
| 7 | Abschluss | du |

## 0. Voraussetzungen

- Sag einmal: „Ich klicke für dich im Browser hier im Fenster. Anmelden, Kreditkarte, Zustimmungen und Passwörter machst du.
  Willst du lieber selbst klicken, sag ‚Ich mache selbst‘.“ Keine Frage nach der Art (SKILL.md, „Zwei Arten“).
- Nötig: Claude Pro oder Max (Claude läuft auf dem Server mit diesem Abo), dieser Chat in Claude Code mit eingebautem Browser
  (SKILL.md, „Zuerst: Läuft das hier in Claude Code?“), Studium Autopilot in Obsidian eingerichtet. Fehlt etwas: sagen, wie man
  es einschaltet, und warten.
- Den eingebauten Browser öffnen.

## 1. Oracle-Konto

- Hat der Mensch schon ein Konto: anmelden lassen und weiter mit Schritt 2. Sonst: [signup.cloud.oracle.com](https://signup.cloud.oracle.com).
- Felder erklären, eintragen tut der Mensch: Name, Mail, Land. **Heimatregion: Germany Central (Frankfurt)**, für alle gleich;
  sie gilt für immer. Nicht nach freiem Platz wählen: Platz für den Server fehlt in jeder Region einmal, dafür gibt es den
  Platzsucher. Hat jemand schon ein Konto mit einer anderen Heimatregion, bleibt es dabei; die Einrichtung läuft dort genauso.
- Kreditkarte: nur zur Prüfung, Oracle bucht ohne Upgrade nichts ab. Das Upgrade auf Pay-As-You-Go wird nie gemacht
  ([kosten.md](kosten.md), Regel 1).
- Zwei-Faktor einrichten lässt du den Menschen allein.

## 2. `start.sh` in der Cloud Shell

Beim ersten Mal fragst du nach der Mail-Adresse, so: „An welche Mail-Adresse soll Oracle dir schreiben? Dorthin kommt eine
Warnung, falls je etwas Geld kosten würde, und später die Nachricht, dass dein Server fertig ist. Am besten die Adresse, die du
jeden Tag liest.“ Das ist die einzige Frage nach einer Mail-Adresse; danach steht sie im Konto.

Dann die **Cloud Shell** öffnen (Konsole oben rechts, Symbol **>_**; dort ist die OCI-Kommandozeile schon angemeldet) und genau
diese Zeile eingeben. Sie lädt `start.sh` aus dem Tag dieser Anleitung (beim Release eingesetzt) und startet es:

```bash
mkdir -p ~/studium-autopilot && curl -fsSLo ~/studium-autopilot/start.sh https://raw.githubusercontent.com/studium-autopilot/ecoba/v0.7.7/server/start.sh && bash ~/studium-autopilot/start.sh --mail <Mail-Adresse>
```

Jedes weitere Mal („Weiter mit der Einrichtung“, auch in einer neuen Cloud-Shell-Sitzung oder Tage später) dieselbe Zeile ohne
`--mail <Mail-Adresse>`.

`start.sh` lädt das Server-Paket dieser Version und prüft es gegen die Prüfsumme im Release; nur dann geht es weiter. Vor jedem
Teil steht eine Zeile `== …`; die Zeilen `[status] text` darunter erklärst du in einem Satz, wenn sie etwas Neues sagen. Das
dauert beim ersten Mal einige Minuten (beim Installieren bis zu zehn). Nutze die Zeit für Schritt 3.

## 3. Während `start.sh` läuft: Gmail und Uni-Mails

Beides braucht den Server nicht und läuft in einem zweiten Tab des eingebauten Browsers, während die Cloud Shell arbeitet.

**Gmail (freiwillig).** Frag: „Nutzt du Gmail? Dann kann Claude dort auch nach Terminen suchen.“
- Ja: in claude.ai **Einstellungen → Connectors → Gmail → Verbinden**. Die Google-Zustimmung gibt der Mensch. Erklären: Claude
  sucht und liest auf dem Server nur; Senden, Entwürfe, Labels und Löschen sind dort gesperrt. Es sieht Absender, Betreff und
  die ersten Zeilen neuer Mails (nicht deine eigenen) und öffnet nur die, die zum Studium gehören.
- Nein: weiter. Im Fenster „Eigener Server“ steht Gmail dann auf „nie“, der Status meldet `gmail: aus` (sobald Obsidian den
  Takt geschickt hat); das ist so gewollt.

**Uni-Mails.** Zwei Wege. Empfiehl die Weiterleitung; das Uni-Postfach direkt nur, wenn der Mensch es nach dem Abwägen
ausdrücklich will. Ohne Gmail entfällt die Weiterleitung: Erkläre das Risiko des Uni-Postfachs direkt wie unten. Will der
Mensch es nicht, kommen keine Uni-Mails auf den Server.

- **Weiterleitung an Gmail (empfohlen, nur mit Gmail):** Auf dem Server liegt kein Uni-Passwort. Das Uni-Passwort gilt auch für
  ILIAS, Alma und Noten; wer root auf dem Server ist, könnte es sonst entschlüsseln. Nachteil: Uni-Mails kommen erst mit der
  nächsten Gmail-Suche an (7:30, 13:30, 19:30 Uhr, „Mails durchsuchen“), nicht alle 15 Minuten.
  [webmail.uni-tuebingen.de](https://webmail.uni-tuebingen.de/) → links **Webmail → Filter → Weiterleitung** →
  Gmail-Adresse eintragen, **„Kopien der Nachrichten in diesem Konto belassen?“ an lassen** → **Zur Regelliste zurückkehren**
  → Regel per Doppelklick aktivieren. Anmelden tut der Mensch.
- **Uni-Postfach direkt (freiwillig):** Der Server liest das Postfach der Uni nur lesend, alle 15 Minuten. Risiko: Das
  Uni-Passwort liegt verschlüsselt auf dem Server; wer dort root ist, könnte es lesen. Erst, wenn der Server installiert ist
  (nach Schritt 5). Der Mensch tippt es selbst in eine verdeckte Eingabe; `start.sh` fasst es nie an. Du tippst den Befehl,
  dann hältst du an und sagst: „Tipp jetzt dein Passwort, ich schaue nicht hin und tippe nichts.“ Kein Bildschirmfoto und kein
  Lesen der Seite, bis der Mensch „fertig“ sagt.

  ```bash
  bash ~/studium-autopilot/server/fern.sh uni-zugang setzen
  ```

Ob Gmail und Weiterleitung ankommen, zeigt erst der Status nach dem ersten Lauf (`gmail: ok`, `weiterleitung: ok`); du liest ihn
in Schritt 7 nach, nicht nach Gefühl.

**Abbrechen:** Will der Mensch aufhören, sagst du, was zurückzunehmen ist: die Weiterleitung in Webmail ausschalten (Regel per
Doppelklick deaktivieren), den Gmail-Connector in claude.ai trennen, „Platzsucher beenden“ (SKILL.md) und einen schon
angelegten Server in der Konsole unter **Compute → Instances** („studium-autopilot-server“) beenden. Schutz, Budget und der
Bucket mit dem Schlüssel kosten nichts und dürfen bleiben.

## 4. Die letzte Zeile von `start.sh`

`start.sh` endet immer mit genau einer dieser Zeilen. Was davor steht, erklärst du in einem oder zwei Sätzen; dann tust du, was
hier steht, und nur das.

| Letzte Zeile | Was du tust |
|---|---|
| `[fertig]` | Schritt 7. |
| `[halt:start:mail]`, `[halt:schutz:mail]`, `[halt:platzsucher:mail]` | Die Mail-Adresse fehlt oder ist falsch geschrieben: fragen wie in Schritt 2, dann die Zeile mit `--mail <Mail-Adresse>`. |
| `[halt:start:laeuft-schon]` | `start.sh` läuft schon in einem anderen Tab der Cloud Shell. Dort warten. |
| `[halt:paket:netz]` | Eine Minute warten, dann dieselbe Zeile. Beim dritten Mal wie eine unbekannte Meldung. |
| `[halt:paket:pruefsumme]` | Das Paket passt nicht zur Prüfsumme im Release; nichts davon wurde ausgeführt. Einmal dieselbe Zeile, sonst anhalten und melden (SKILL.md, „Fehler an den Autor melden“). |
| `[halt:stand:unvollstaendig]` | Eine Abfrage im Konto ging nicht (Zeile „Nicht geprüft: …“). Ein ganz neues Konto braucht oft einige Minuten: fünf Minuten warten, dann dieselbe Zeile; sonst wie eine unbekannte Meldung. |
| `[halt:schutz:frage]` | Im Konto läuft schon etwas, das nicht kostenlos ist. Nennen, erklären, dass ab jetzt nichts Bezahltes mehr dazukommen kann, was schon läuft aber bleibt, und fragen. Nur mit Zustimmung: `cd ~/studium-autopilot && node server/einrichten.mjs schutz --ja` (beim ersten Mal mit `--mail <Mail-Adresse>`), dann dieselbe Zeile wie in Schritt 2. |
| `[halt:schluessel:abweichend]` | Im Konto liegt ein anderer Schlüssel als in der Cloud Shell. Nichts löschen, nichts kopieren; anhalten und melden. |
| `[halt:server:passt-nicht]` | Die freie Menge ist belegt (z. B. von einem eigenen Server). Erklären, nichts anlegen ([kosten.md](kosten.md), Regel 2). |
| `[halt:platzsucher:sucht]` | Oracle hat gerade keinen Platz; der Platzsucher sucht (siehe unten). |
| `[halt:platzsucher:kein-platz]` | Auch für den kleinen Helfer ist gerade kein Platz, oder Oracle bremst: „Sag mir in einer Stunde noch einmal ‚Weiter mit der Einrichtung‘.“ Nicht selbst wiederholen. |
| `[halt:platzsucher:angehalten]` | Der Helfer sucht nicht. Die Zeile `[angehalten]` bzw. `[still]` wörtlich zeigen, melden und anhalten. |
| `[halt:abschliessen:helfer-laeuft]` | Der Platzsucher räumt nach zehn Minuten noch auf: in einer halben Stunde dieselbe Zeile. |
| `[halt:server:gestoppt]` | In der Konsole unter **Compute → Instances** die Instanz „studium-autopilot-server“ öffnen und **Start** klicken (nur diese), nach einer Minute dieselbe Zeile. |
| `[halt:installieren:warten]`, `[halt:neustart:warten]`, `[halt:status:nicht-erreichbar]` | Der Server antwortet noch nicht (gerade angelegt, startet neu, holt sein Zertifikat). Fünf Minuten warten, dann dieselbe Zeile; beim dritten Mal melden. |
| `[halt:installieren:hostschluessel]` | Der Server meldet sich mit einem anderen Schlüssel als beim letzten Mal. Das ist nur in Ordnung, wenn er neu angelegt wurde. Frag den Menschen, ob er den Server gelöscht oder neu angelegt hat. Nur wenn ja: den genannten Befehl `ssh-keygen -R <IP>` einmal, dann dieselbe Zeile. Sonst nichts tun, anhalten und melden: Jemand anderes könnte sich als Server ausgeben. |
| `[halt:installieren:schluessel-kopieren]` | Der Server wurde mit einer anderen Schlüsseldatei angelegt (Zeile `[anderer]`). Die Zeile zeigen und erklären; nur wenn der Mensch zustimmt, den genannten `cp`-Befehl einmal, dann dieselbe Zeile. |
| `[halt:installieren:schluessel-fehlt]` | Kein Schlüssel passt, und im Konto liegt keine Kopie. Anhalten und melden; den Server neu anzulegen ist der letzte Ausweg. |
| `[halt:claude:anmelden]` | Die Anmeldung von Claude auf dem Server ist nicht durch (Schritt 5). |
| `[halt:verbinden:link]` | Schritt 6. |
| `[halt:lauf:laeuft]` | Der erste Lauf dauert länger: in zehn Minuten dieselbe Zeile. |
| `[halt:lauf:fehler]` | Die Ausgabe darüber zeigt das Protokoll. Steht dort `claude-limit`: Das Abo-Limit ist erreicht, der nächste Lauf versucht es von selbst. Sonst melden. |
| `[halt:kosten:befund]` | Jede Zeile unter „Befunde“ mit Ursache nennen und erklären, wie man sie behebt. |
| `[halt:kosten:unvollstaendig]` | Die Kostenprüfung war unvollständig; den Grund nennen. |
| `[halt:…:fehler]` | Wie eine unbekannte Meldung (SKILL.md, „Fehler ohne Vermutung“): die Zeilen `[fehler] …` darüber wörtlich zeigen, melden, anhalten. |

**Platzsucher** (`[halt:platzsucher:sucht]`). Sag es so, ohne Frage: „Oracle hat gerade keinen Platz für deinen Server. Das ist
normal und dauert meist Stunden bis wenige Tage. Ein kleiner kostenloser Helfer, der Platzsucher, versucht es für dich weiter,
auch wenn dein Rechner aus ist, und schreibt dir eine Mail, sobald dein Server da ist.“ Dazu, je nach den Zeilen darüber:
- `[angelegt]` oder `[offen]` beim Mail-Abo: „Bestätige die Mail von Oracle (‚Confirm subscription‘), schau auch im Spam
  nach.“ Ohne Bestätigung kommt keine Mail vom Platzsucher.
- `[ersetzt] Helfer einer früheren Version beendet`: Ein neuer Helfer sucht weiter; das dauert ein bis zwei Minuten länger und
  ist kein Fehler. Das Mail-Abo bleibt; wurde die Mail früher schon bestätigt, kommt keine neue.
- `[gestartet]`: Der Helfer war angehalten und sucht jetzt wieder. `[aus]`: Er hält gerade an; in einer Minute dieselbe Zeile.
- `[sucht]` oder `[startet]`: der Stand des Helfers (seit wann, wie viele Versuche, letzte Antwort von Oracle).

Ist Schritt 3 erledigt: „Du kannst den Rechner jetzt ausmachen. Kommt die Mail ‚Dein Server ist da‘, öffne Claude Desktop im
Tab ‚Code‘ und sag ‚Weiter mit der Einrichtung‘.“ Der Server richtet sich nach dem Anlegen schon selbst vor; danach ist nur
noch wenig zu tun.

## 5. Claude auf dem Server

Ist Claude auf dem Server noch nicht angemeldet, zeigt `start.sh` die Zeile `[mensch:claude-anmelden]` und darunter einen Link.
Bei „Claude klickt“ öffnest du ihn in einem neuen Tab des eingebauten Browsers; anmelden und **Autorisieren** klickt der Mensch.
Den angezeigten Code liest du von der Seite und fügst ihn in die Cloud Shell ein (bei „Ich klicke selbst“ kopiert und fügt der
Mensch). Gleich nach dem Link einfügen: Der Code gilt nur ein paar Minuten, nur einmal und nur für den Link desselben Befehls.

Danach geht `start.sh` von selbst weiter. Endet es mit `[halt:claude:anmelden]`:
- `Login failed: Request failed with status code 400`: Der Code passte nicht zum Link (falsch eingefügt, zu alt oder schon
  benutzt). Dieselbe Zeile wie in Schritt 2; sie zeigt einen neuen Link. Nach drei solchen Versuchen anhalten und melden.
- Jede andere Meldung: wie eine unbekannte Meldung.

## 6. Obsidian verbinden

`start.sh` zeigt die Adresse des Servers (`[da] Server RUNNING: https://…`), einen Link `obsidian://…` mit einem Einmal-Code (30
Minuten) und einen QR-Code, und endet mit `[halt:verbinden:link]`.

**Dieser Computer:** Den Link öffnest du über die Kommandozeile dieses Computers, nicht im eingebauten Browser, und nur, wenn er
genau so aussieht (sonst nichts ausführen und melden):

```
^obsidian://studium-autopilot\?aktion=server-verbinden&adresse=https%3A%2F%2F[0-9]{1,3}(-[0-9]{1,3}){3}\.sslip\.io&code=[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$
```

und die IP darin (Bindestriche statt Punkten) dieselbe ist wie in der Zeile `[da] Server RUNNING: …`. Dann, mit dem Link in
einfachen Anführungszeichen:
- Windows: in PowerShell `Start-Process -FilePath '<Link>'` (aus Git Bash: `powershell.exe -NoProfile -Command "Start-Process -FilePath '<Link>'"`).
  Nie `cmd /c start` oder `start` aus Git Bash: Das `&` im Link teilt dort den Befehl.
- Mac: `open '<Link>'`.

Obsidian fragt „Mit deinem Server verbinden?“; **Verbinden** tippt der Mensch.

**Weitere Geräte** (Handy, Tablet): auf dem schon verbundenen Gerät im Fenster „Eigener Server“ **Weiteres Gerät verbinden**,
dann den Code auf dem neuen Gerät unter **Mit Code verbinden** eintippen. Oder den QR-Code aus der Cloud Shell mit der Kamera
scannen. Jedes Gerät braucht einen eigenen Code.

Danach dieselbe Zeile wie in Schritt 2: `start.sh` stößt den ersten Lauf an (einige Minuten), wartet darauf und prüft am Ende
die Kosten.

## 7. Abschluss

- Status lesen (Webabruf, öffentlich, ohne persönliche Daten; Adresse aus der Zeile `[da] Server RUNNING: …`):
  `https://<Adresse>/v1/status`. Hat der Mensch Gmail verbunden, aber `gmail` steht nicht auf `ok`, oder die Weiterleitung
  eingerichtet, aber `weiterleitung` steht nicht auf `ok`: sagen, dass es mit der nächsten Gmail-Suche kommt, und beim nächsten
  „Weiter mit der Einrichtung“ noch einmal nachsehen.
- Was wann läuft: Der Server prüft alle 15 Minuten die Quellen ohne KI; Claude läuft nur bei Neuem und durchsucht Gmail um
  7:30, 13:30 und 19:30 Uhr. Jeden Morgen ab 6:30 Uhr liest Claude die Uni-Mails des letzten Tages noch einmal und holt
  nach, was liegen geblieben ist. Obsidian holt alle 15 Minuten ab. Wie oft der Server nachsieht, stellst du im Fenster
  „Eigener Server“ ein (Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail dreimal, einmal oder nie am Tag).
- Wo der Stand steht: Obsidian → Einstellungen → Verbindungen → „Eigener Server“.
- Claude und dein Obsidian: In Claude Desktop unter **Code** den Ordner deines Tresors öffnen. Dort kennt Claude den Aufbau
  (Skill `.claude/skills/studium-autopilot/` im Tresor), findet Termine und Unterlagen, legt Notizen richtig an und bereitet
  eine Meldung an den Autor vor, wenn du sagst, dass etwas nicht geht.
- Den Schlüssel zum Server gibt es zweimal: in der Cloud Shell und als Kopie im privaten Bucket „studium-autopilot-schluessel“
  deines Kontos. Oracle löscht die Cloud Shell nach sechs Monaten ohne Nutzung; `start.sh` holt ihn dann aus dem Bucket zurück.
- Ein Gerät verloren: auf dem Server neue Schlüssel erzeugen (`bash ~/studium-autopilot/server/fern.sh schluessel-erneuern`),
  danach jedes Gerät neu verbinden.
- Abschalten: in Obsidian **Trennen**; auf dem Server `claude auth logout`; in claude.ai den Gmail-Connector trennen; in der
  Oracle-Konsole die Instanz „studium-autopilot-server“ beenden. Das Konto selbst kostet danach nichts.
