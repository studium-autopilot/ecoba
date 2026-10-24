# Architektur: Postfach

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Postfach (seit 0.6.0, `postfach.js`, `postfach-html.js`)

Seite `Studium/Postfach.md` mit dem Codeblock `eba-postfach`: dein Uni-Posteingang aus dem Webmail der Uni (Horde IMP,
`webmail.uni-tuebingen.de`). Auf PC, iPhone und iPad derselbe Weg über https (`ilias-netz.js`, Dienst `mail`: nur dieser
Server); kein IMAP, weil iOS keine eigenen Verbindungen erlaubt und das Webmail die Mails schon als Text liefert.

- **Voraussetzung:** Uni-Login auf diesem Gerät, von ILIAS bestätigt und nicht abgelehnt (`ctx.ilias.uniZugang()`:
  `bestaetigt`, nicht `gesperrt`), dazu die Zustimmung je Gerät (`eba-postfach-an`, Knopf **Postfach anzeigen**). Sonst zeigt
  der Block eine Zeile wie unter Verbindungen (Mit Uni-Login verbinden, abgelehnt, wird geprüft, Postfach anzeigen).
  **Mit Uni-Login verbinden** öffnet gleich die Anmeldung (`verbinden` mit `auch=1`), auch wenn ILIAS über ein anderes Gerät
  verbunden ist; bis 0.6.6 kam dann das Fenster „Ein Gerät reicht, alles kommt über deinen Sync“, das für Mails nicht stimmt.
- **Anmeldung:** `/login.php` holen, Formular `#horde_login` nur als POST an `https://webmail.uni-tuebingen.de/login.php`;
  versteckte Felder bleiben, dazu `login_post=1`, `horde_user`, `horde_pass` (erst beim Absenden aus dem Schlüsselbund),
  `horde_select_view=mobile_nojs`, `new_lang=de_DE`. Angemeldet nur mit Abmelde-Link (`horde_logout_token`); die bekannte
  Ablehnung („… falsch eingegeben …“) schreibt den Marker `System/Daten/uni-zugang.json` mit Dienst `mail`, alles andere ist
  `unerwartet`. Höchstens eine Anmeldung je Abruf; eine abgelaufene Sitzung (Anmeldeseite statt Liste) einmal neu.
- **Lesen:** Liste aus der Ansicht basic (`/imp/basic.php?page=mailbox&mailbox=SU5CT1g&mpage=N`, 30 Mails je Seite, Zeilen
  `tr#row<buid>`, `flagUnseen`, ganzer Betreff im `title`; Zahl aller Mails und Seiten aus `#mailboxLabel` „Posteingang (145
  Nachrichten / Seite 1 von 5)“). Die Zahl ungelesener Mails nennt nur der Titel der Liste in der Ansicht minimal
  (`/imp/minimal.php?page=mailbox&mailbox=SU5CT1g`, „(145 ungelesen/145 insgesamt)“); diese Seite holt das Plugin mit Seite 1
  und sonst nur, solange die Zahl fehlt. Klappt das nicht, fehlt nur die Zahl, die Liste bleibt. Eine Mail kommt aus der
  Ansicht minimal (`/imp/minimal.php?mailbox=SU5CT1g&buid=N&page=message`, Kopf aus `<em>Betreff:</em>` …, Text aus
  `.mimePartData`). Die Adressen baut `postfach-html.js` aus Zahlen (`listeAdresse`, `zahlenAdresse`, `nachrichtAdresse`), nie
  aus Links der Seite: Diese tragen auch Löschen, Ordner leeren und Endgültig löschen. Eine Seite ohne erkennbare Liste ist
  `unsicher`, nie `leer`.
- **Wann:** beim Zeichnen, wenn die Liste fehlt oder älter als 5 Minuten ist (nach einem Fehler erst nach 5 Minuten wieder),
  und mit **Aktualisieren** (frühestens 15 s nach dem letzten Abruf). Nach 10 Minuten ohne Anfrage und beim Ausschalten bzw.
  Entladen meldet es sich ab. Kein Abruf im Hintergrund.
- **Datenschutz:** Mails nur im Speicher (`ctx.bleibend("zustand")`, überlebt den Hot-Reload, nicht den Neustart), nie im
  Tresor, in Hinweisen, Konsole oder Fehlern; Fehler nennen nur die Art (`zugang-falsch`, `netz`, `unerwartet`). Der Text
  einer Mail wird als Text gezeichnet, Adressen darin als Links; nie HTML aus der Mail. Der Zustand merkt sich den
  Benutzernamen der Anmeldung (`benutzer`); steht im Uni-Login ein anderer (geprüft bei jedem `status()` und gleich nach jeder
  Meldung von `ctx.ilias.beobachten`, auch ohne offene Seite) oder meldet ilias.js `zugang` ohne Benutzernamen (Trennen),
  meldet `kontoPruefen()` die alte Sitzung ab und vergisst Liste und Mails; ein Abruf, der dabei unterwegs ist, verwirft sein
  Ergebnis. Ist der Benutzername nur kurz leer (ilias.js lädt neu), bleibt alles.
- **Oberfläche:** oben „Posteingang“ mit der Zahl ungelesener Mails (nur wenn es welche gibt; beim Öffnen einer ungelesenen eins
  weniger), **Aktualisieren** und „Im Webmail
  öffnen“; die Mails als Zeilenliste, Tipp klappt eine auf; bei mehreren Seiten **Neuere** und **Ältere**; unten „Auf diesem
  Gerät ausschalten“. Stil: `eba-core.css` Abschnitt 67 (`.eba-pf-*`). Datum je Mail (`datumKurz`): heute die Uhrzeit, dieses
  Jahr Tag und Monat, sonst mit Jahr. Horde nennt bei Mails von heute nur die Uhrzeit; `liste(html, heute)` ergänzt beim Lesen
  das Datum („22.10.2026 08:40:00“), und an einem neuen Tag zeichnet der Block neu (alle 30 Minuten und beim Zurückkommen in
  die App, nur sichtbar, wie `kalender.js`).
- **Tests:** `tests/postfach-html.test.js` (erfundene Seiten nach dem echten Aufbau vom 22.10.2026 in `tests/daten/postfach/`),
  `tests/postfach.test.js` (Ablauf mit Webmail-Attrappe).
