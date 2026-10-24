# Architektur: Einrichtung

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Einrichtung (seit 0.3.0)

`einrichtung.js` ersetzt die Personalisieren-Karte. Ein Obsidian-Modal (`eba-modal eba-modal-einrichtung`) mit sieben
Bildschirmen (seit 0.4.8; bis 0.4.7 acht, je einer für Alma und ILIAS): 1 Willkommen (ein Satz, **Los geht’s** / *Später*), 2 Studienbeginn (Semester-Auswahl aus
`ctx.modell.semesterAuswahl()`, vorausgewählt das aktuelle Semester; Hinweis „Heute bist du im n. Fachsemester.“),
3 Variante (vier Optionen aus dem Feld-Register, „Noch offen“ = `offen` vorausgewählt), 4 Über dich (Name, Zielnote; Prüfung
`ctx.personalisieren.zielnotePruefen`), 5 Dein Uni-Login (seit 0.4.8, freiwillig, siehe [„Uni-Login“](verbindungen.md): ein Satz, Benutzername,
Passwort, Datenschutz-Zeile; **Verbinden** prüft den Zugang, liest die Kursliste, startet den ersten Abruf im Hintergrund und
verbindet ILIAS-Kalender und Alma mit, Fortschritt in der Meldung; danach je Zeile ✓ oder der Grund. Schon auf diesem Gerät
gespeichert: ein Satz und, wenn Kalender oder Alma fehlen, **Verbinden** ohne Passwort. Im eigenen Uni-Abgleich, mit zu altem
Obsidian oder ohne Anmeldebaustein nur ein Satz und **Weiter**), 6 Darstellung (seit 17.10.2026: derselbe Umschalter
Hell · Dunkel · Automatisch, `ctx.darstellung.schalter`, seit 18.10.2026 darunter dieselben Design-Kacheln wie in Einstellungen &
Hilfe, `designWahl`; Antippen schaltet sofort um, nur **Weiter**, siehe
[Darstellung](darstellung.md#darstellung-hell-dunkel-automatisch-und-design)), 7 Fertig (Zusammenfassung mit Hell, Dunkel oder Automatisch, ohne
das Design, das keinen Namen hat, dazu Stundenplan, Unterlagen und Abgaben; „Später nachholen“ mit Knopf zum Bildschirm). Ab
Bildschirm 2 „Schritt n von 6“ und Punkte; Zurück jederzeit, Überspringen auf 2–5.

Regeln: je Bildschirm ein Satz und eine Hauptaktion, keine Fachwörter; kein Autofokus (sonst springt auf dem iPhone die Tastatur
auf); Tippflächen ≥ 44 px, Eingaben 16 px; auf dem iPhone bildschirmfüllend (`eba-core.css` Abschnitt 45). Esc, × und
„Später“ schließen ohne zu schreiben. Eingaben ohne Weiter bleiben im Speicher (`ctx.bleibend("entwurf")`).

**Zustand** in `System/Einstellungen.md` (synchronisiert, gilt für alle Geräte):

| Feld | Werte |
|---|---|
| `einrichtung` | `offen` (oder leer) · `laeuft` · `fertig` |
| `einrichtung_schritt` | Bildschirm 1–7, an dem es beim nächsten Start weitergeht |
| `einrichtung_fassung` | `2` (seit 0.4.8, bei jedem Speichern): Zählung mit sieben Bildschirmen. Fehlt das Feld, stammt der Schritt aus 0.4.7 oder früher (5 Alma, 6 ILIAS, 7 Darstellung, 8 Fertig; Fertig war bis 0.3.x 6, in 0.4.0–0.4.4 7), und `zustand()` rechnet um: ab 6 eins weniger (6 ILIAS und 5 Alma → 5 Uni-Login). Startet ein Tresor aus 0.3.x die Einrichtung erneut, gilt der Uni-Login als übersprungen (`uni`), damit das ILIAS-Schloss nach dem Speichern bleibt |
| `einrichtung_uebersprungen` | Liste aus `studienbeginn`, `variante`, `angaben`, `uni`; `alma` und `ilias` stammen aus Einrichtungen bis 0.4.7 und gelten weiter (erledigt der Uni-Login den Bildschirm, fallen sie weg) |

Geschrieben wird nur nach einem Tipp auf **Los geht’s**, **Weiter** oder **Überspringen**: Antworten des Bildschirms und Stand
zusammen in einem `processFrontMatter` (Studienbeginn als festes Datum, nicht leer, damit er nicht mit dem Semester wandert).
Der Schritt zu Fertig (Bildschirm 7) setzt `fertig`. Die Darstellung steht nicht hier, sondern nur auf dem Gerät. Ein Tipp auf die fertige Zeile „Einrichtung“ (Aktion `einrichtung`, `ab=2`) beginnt bei 2, vorausgefüllt, ohne Zurück zum
Willkommen; der Status bleibt `fertig`.

**Automatisch** (`start()`, nur beim App-Start): wenn der metadataCache eingelesen ist (`initialized`, sonst `resolved`) und das
Dashboard steht, höchstens einmal je App-Sitzung (`sessionStorage`, damit ein Neuladen des Plugins, z. B. nach einem Update,
sie nicht erneut öffnet). Gezeigt wird, wenn `einrichtung` ≠ `fertig` und (`laeuft` oder der Tresor ist nicht eingerichtet:
kein Name, kein Studienbeginn, keine Notiz in `Stundenplan/`). Ein Tresor aus 0.2.0 mit Angaben sieht sie also nicht, und es
wird nichts geschrieben. Weitere Geräte: Der Stand kommt per Sync; trifft `fertig` oder ein Name ein, während dort nur das
Willkommen offen ist, schließt es sich von selbst.

**Schloss:** `ctx.einrichtung.almaOffen()` = `einrichtung` ≠ `fertig` oder `uni` (bis 0.4.7 `alma`) übersprungen. Das Alma-Schloss
(`eba-schloss alma`, Wochenraster auf Dashboard und Stundenplan) erscheint nur, wenn das gilt **und** kein Stundenplan da ist
**und** dieses Gerät nicht verbunden ist. `iliasOffen()` gilt ebenso für `uni` bzw. `ilias`, dazu bei `fertig` mit
`einrichtung_schritt` ≤ 6 ohne `einrichtung_fassung`: Die Einrichtung wurde vor 0.4.0 abgeschlossen. So ein Tresor sieht die Einrichtung nach dem Update
nicht noch einmal, sondern das Schloss `eba-schloss ilias` auf der Seite Unterlagen.

Für Tests: `ctx.einrichtung = { zustand(), eingerichtet(), sollZeigen(), almaOffen(), iliasOffen(), oeffnen({ ab }), automatisch({ immer }),
sitzungMerken(an), fenster }`; das Fenster hat `schritt`, `felder`, `weiter()`, `ueberspringen()`, `zurueck()`, `gehe(n)`
(ohne zu schreiben).
