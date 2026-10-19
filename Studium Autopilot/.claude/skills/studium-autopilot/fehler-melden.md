# Fehler an den Autor melden

Studium Autopilot sammelt Fehler, falsche Termine und Ideen als Issues im öffentlichen Repo `studium-autopilot/ecoba`. Sagt
die Person, dass etwas nicht geht („das ist kaputt“, „der Termin stimmt nicht“, „melde das“), oder merkst du beim Arbeiten,
dass Studium Autopilot sich anders verhält als beschrieben, bereitest du eine Meldung vor. Abschicken tut immer die Person
selbst mit ihrem GitHub-Konto: Issues sind öffentlich.

## 1. Gehört es dorthin?

- **Ja:** das Plugin und die Seiten von Studium Autopilot (Dashboard, `Studium/`, Modulseiten, Fenster, Knöpfe, Hinweise),
  zentrale Termine (`herkunft: zentral`), das Update, die Anleitung, ein eigener Server mit Claude.
- **Nein:** eigene Notizen der Person, Obsidian selbst, andere Plugins, Alma, ILIAS und andere Systeme der Uni. Sag das in
  einem Satz und, wohin es gehört (bei der Uni: an den Betreiber).
- **Sicherheitslücke** (ein Passwort landet, wo es nicht hingehört; eine Datendatei könnte Code ausführen oder Notizen
  überschreiben; das Update ließe sich unterschieben): **nie** öffentlich. Nur dieser Link, ohne Einzelheiten im Chat zu
  verbreiten: <https://github.com/studium-autopilot/ecoba/security/advisories/new>
- **Schon gemeldet?** Kannst du Webseiten lesen, such unter <https://github.com/studium-autopilot/ecoba/issues?q=is%3Aissue>
  nach zwei, drei Stichwörtern. Gibt es das Issue schon, nenne den Link statt eines neuen.

## 2. Was in die Meldung gehört

- Version: `version` in `.obsidian/plugins/studium-autopilot/manifest.json`.
- Seite oder Fenster, auf dem es passiert, und welches Gerät (frag, wenn du es nicht weißt).
- Was die Person getan hat, was passiert ist, was sie erwartet hat; bei einem Hinweis mit Code (z. B. „Code: …“) genau
  diesen Code. Kurz, sachlich, in ganzen Sätzen.

**Nie in die Meldung:** Namen, Matrikelnummer, Noten, Benutzernamen, Passwörter, Alma- oder Kalender-Links, Inhalte von Mails
oder eigenen Notizen, Titel privater Notizen, Pfade des Rechners. Keine Folien, Skripte, Lösungen oder Altklausuren, auch
nicht auszugsweise (urheberrechtlich geschützt). Beschreib den Fall allgemein („eine Vorlesungsnotiz in B110“). Ein
Bildschirmfoto hängt die Person selbst an; erinnere sie, persönliche Angaben abzudecken.

## 3. Welche Vorlage

| Vorlage | Wann | Felder für den Link |
|---|---|---|
| `fehler.yml` | etwas geht nicht oder sieht kaputt aus | `title` („Fehler: …“), `was`, `seite`, `version` |
| `termin.yml` | ein zentraler Termin ist falsch oder fehlt | `title` („Termin: …“), `titel`, `richtig`, `quelle` (offizieller Link) |
| `idee.yml` | ein Wunsch, kein Fehler | `title` („Idee: …“), `idee`, `warum` |

## 4. Zeigen, dann abschicken lassen

1. Zeig der Person die ganze Meldung (Titel und jedes Feld) und frag, ob sie so raus darf. Ändere, was sie möchte.
2. Bau den Link: `https://github.com/studium-autopilot/ecoba/issues/new?template=<Vorlage>&title=<…>&<Feld>=<…>`, jeden Wert
   URL-kodiert (Leerzeichen `%20`, Zeilenumbruch `%0A`), zusammen höchstens etwa 6000 Zeichen. Kein `labels=`: das setzt die
   Vorlage selbst, und ohne Rechte zeigt GitHub sonst eine Fehlerseite.
3. Gib ihr den Link: „Öffne ihn, melde dich bei GitHub an, wähle dein Gerät aus und tippe auf **Create**.“ Auswahlfelder
   (Gerät, Art des Termins) füllt sie dort selbst. Ohne GitHub-Konto: kostenlos unter <https://github.com/signup>.
4. Nur wenn die Person es ausdrücklich möchte und `gh` angemeldet ist, darfst du nach ihrem OK selbst senden:
   `gh issue create --repo studium-autopilot/ecoba --title "…" --body "…"` mit den Überschriften der Vorlage im Text
   (`### Was ist passiert?` …), ohne `--label`.

Je Problem eine Meldung. Nie ohne OK der Person senden, nie mehrere auf einmal, nie in einem anderen Repo.
