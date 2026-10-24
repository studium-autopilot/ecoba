# Architektur: Quellen

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Quellen außerhalb des Plugins (`quellen_extern`, seit 0.4.5)

Was ein eigener Uni-Abgleich oder ein eigener Server schon in den Tresor bringt, holt das Plugin nicht noch einmal: nie zwei
Schreiber je Quelle. Eine Regel für alle Skripte in `eba.js`:

```
ctx.user.eba.quelleExtern(schluessel, existiert, einstellungen) → true | false
ctx.user.eba.quellenExtern(existiert, einstellungen) → [Schlüssel]      ctx.user.eba.QUELLEN (alle Schlüssel)
```

`existiert(pfad)` → ob die Datei im Tresor liegt, `einstellungen` = Frontmatter von `System/Einstellungen.md`. Jede Funktion
fragt bei **jedem** Lauf, nicht nur beim Start.

| Schlüssel | Quelle | Wirkung, wenn extern |
|---|---|---|
| `stundenplan` | zentraler Stundenplan, Alma-Stundenplan | `zentral.js` holt und wendet den zentralen Stundenplan nicht an; `alma.js` holt und schreibt nie (`aktualisieren`, `verbinden`, damit auch Befehle, Knöpfe und Verbindungen) und sagt nur „Dein Stundenplan kommt über deinen Uni-Abgleich.“ |
| `ilias-dateien` | Downloads aus ILIAS | `ilias.js` lädt nie Dateien, mit Zugang nur die Übungsgruppen (siehe [„ILIAS-Unterlagen“](unterlagen.md)) |
| `ilias-gruppen` | Übungsgruppen aus ILIAS | kein Gruppenabgleich; mit `ilias-dateien` zusammen gar kein ILIAS-Lauf |
| `ilias-kalender` | Abgaben aus dem ILIAS-Kalender | `ilias-kalender.js` holt und schreibt nie (Zeitplan, Knopf, Verbinden); die Zeile sagt nur „Deine Abgaben aus ILIAS kommen über deinen Uni-Abgleich.“ |
| `alma-konto`, `volltext` | Noten und Prüfungsanmeldungen aus Alma, Textfassungen der PDFs | die Funktion bleibt aus (für die kommenden Funktionen) |

Regel: Steht `quellen_extern` (Liste, `types.json`: multitext) in `System/Einstellungen.md`, entscheidet sie, auch leer;
Schreibweise egal, unbekannte Einträge zählen nicht, `quellen_extern:` ohne Wert gilt als nicht gesetzt. Ohne Liste gilt beim
eigenen Uni-Abgleich (`eigenerAbgleich`: `System/Skripte/abgleich.js` im Tresor oder `ilias_unterlagen: extern`) alles außer
`ilias-gruppen` als extern: Die Übungsgruppen prüft dort das Plugin selbst, der eigene Abgleich legt keine Gruppen-Notizen an.
Ohne eigenen Abgleich ist nichts extern. Fehler beim Lesen gelten als „nichts extern“ (wie bisher `eigenerAbgleich`).
`eigenerAbgleich` selbst entscheidet nur noch, ob es einen eigenen Abgleich gibt (z. B. „Bitte prüfen“ mit seinem Protokoll).

**Gemischte Fassungen (seit 0.4.6):** Der Sync liefert Skripte einzeln, und `eba.js` bis 0.4.4 kennt nur `eigenerAbgleich`. Fragte
ein neues Skript dann `eba.quelleExtern` direkt, hielte es jede Quelle für seine, während ein anderes Gerät sie für extern hält
(zwei Schreiber). Darum fragen alle Skripte über `Q.extern(eba, schluessel, existiert, einstellungen)` (`quellen.js`): mit
`eba.quelleExtern`, sonst dieselbe Regel dort (Liste, sonst eigener Abgleich ohne `ilias-gruppen`). Ohne Liste entscheidet jedes
Gerät gleich, auch eines mit 0.4.4 (`stundenplan` und `ilias-dateien` beim eigenen Abgleich extern, `ilias-gruppen` nie; die
Quellen seit 0.4.5 schreibt es gar nicht). Nur in der Hülle eines eigenen Uni-Abgleichs ohne `quellen.js` fragt `alma.js`
`eba.quelleExtern` direkt (dort liegt die passende `eba.js`). Tests: `tests/quellen-extern.test.js`, dazu die Fälle in `ilias.test.js`, `ilias-gruppen.test.js`, `stundenplan.test.js` und
`verbindungen.test.js`.

## Abrufer-Sperre (`sperre.js`, seit 0.4.5): ein Schreiber für alle Quellen

Was eine Quelle in den Tresor schreibt, schreibt nur ein Gerät. `sperre.js` ist der gemeinsame Lock dafür (Bibliothek, kein
Netz, keine Zeitgeber). Noten & Anmeldungen, ILIAS (`ilias-abruf.json`, Dateiname wie bisher), Alma-Stundenplan
(`alma-abruf.json`), Volltext (`volltext-abruf.json`, mit Computer-Vorrang) und der eigene Server (`server.js`,
`server-abruf.json`) nutzen ihn; die zentralen Daten ihre ältere Fassung mit denselben Regeln und Werten (nur für die
Übernahme).

```
ctx.user.sperre.erzeugen({ io: { lesen(pfad), schreiben(pfad, text) }, quelle | pfad, geraetId(), jetzt(), mobil,
                           uebernahme = 80 Min., puls = 50 Min., computerVorrang = false })
  → { pruefen() → { hier, anderes, darf, sperre }, nehmen({ erzwingen }) → bool, puls() → bool, freigeben() → bool, pfad }
ctx.user.sperre.pfadVon(quelle) → "System/Daten/<quelle>-abruf.json"     ctx.user.sperre.K → { UEBERNAHME, PULS, ORDNER }
```

- **Datei** (synchronisiert, in `.gitignore`, `release.py` und `pruefen.py`): `{ geraet, seit, zuletzt, mobil, frei? }`. Weitere
  Felder einer Quelle in derselben Datei (z. B. `angewendet` in `abruf.json` der zentralen Daten) bleiben beim Schreiben
  erhalten. Unlesbar = keine Sperre.
- **Regeln:** `hier` = dieses Gerät hält sie; `anderes` = ein anderes Gerät hält sie und war vor höchstens `uebernahme` aktiv
  (Stille-Grenze, danach darf jedes Gerät übernehmen); `darf = !anderes`. `nehmen` schreibt nur bei Wechsel, nach `frei`, bei
  anderer Geräteart oder wenn `zuletzt` älter als `puls` ist (nicht bei jedem Lauf). `nehmen({ erzwingen: true })` ist der Knopf
  „Hier aktualisieren“. `puls()` während langer Läufe; `false` heißt: ein anderes Gerät hat übernommen, nichts mehr
  schreiben. `freigeben()` setzt `frei: true` (Trennen, Ausschalten, Löschen), ein anderes Gerät übernimmt sofort;
  `freigeben({ erzwingen: true })` auch eine fremde Sperre, deren Halter laut Aufrufer schweigt (ILIAS: verwaiste
  Gruppen-Notizen), danach steht sie frei auf diesem Gerät. `computerVorrang` (Volltext): Ein Computer löst ein iPhone/iPad sofort
  ab, nie umgekehrt.
- **Weiche Sperre:** Über einen langsamen Sync können sich zwei Geräte kurz überschneiden. Darum schreibt jede Quelle nur, was
  aus denselben Eingaben gleich herauskommt.
- **Tests:** `tests/sperre.test.js` (auch: Vorgaben gleich `ilias.js`, damit die Werte nicht auseinanderlaufen).

## Quellen-Vertrag (`quellen.js`, seit 0.4.5): Pflicht für jede Quelle

Jede Quelle, die Daten in den Tresor bringt (zentrale Daten, ILIAS, Alma-Stundenplan, Noten & Anmeldungen, Volltext; künftig
ILIAS-Kalender und eigener Server), hält sich an dieselben sieben Regeln. Eine neue Quelle baut nichts davon selbst; was fehlt,
kommt in `quellen.js` (Bibliothek, `ctx.user.quellen`, startet nichts außer den Zeitgebern von `planen`). Tests:
`tests/quellen.test.js`.

```
Q = ctx.user.quellen
Q.statusForm(x) / Q.nachLauf(stand, { ok, fehler, warnungen }, jetztIso) / Q.vorText(iso, jetztMs)
Q.planen(ctx, { takt, zurueck, backoff, start, lauf, versucht? }) → { jetzt(grund), spaeter(ms), stand() }   Q.zeitplan(o) (rein)
Q.extern(eba, schluessel, existiert, einstellungen) → bool
Q.besitz(fm) → { quelle, id } | null      Q.idFeld(quelle)      Q.marke(quelle, id)
Q.meineNotizen(text) / Q.unberuehrt(fm, text) / Q.wegfall(fm, text) / Q.zuViel(weg, alle, min) / Q.kurzHash(x) /
  Q.geloescht(angewendet, id, hash) / Q.dubletten(gruppe) / Q.doppelGruppen(liste, idVon) / Q.meineMischen(text, weitere)
Q.melden(ctx, quelle, fn) / Q.meldungen(ctx) / Q.meldenNeu(ctx) / Q.beiMeldung(ctx, fn)
Q.papierkorb(app, datei, { lokal }) (der eine Papierkorb, siehe [„Bedien-Bausteine“](bedien-bausteine.md))
Q.verbindung({ hier, sperre, geraet, jetztMs, grenze }) → { art: hier | anderswo | nein, zuletzt }   Q.K.VERBUNDEN_GRENZE
```

1. **Status** in einer Form: `status()` liefert `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` (dazu Eigenes der
   Quelle). `geprueft` = letzter erfolgreicher Lauf, `fehler` = ein Satz für Nutzer:innen, der stehen bleibt (gerätelokal), bis
   ein Lauf klappt (`nachLauf`), `warnungen` = Sätze des letzten Laufs. Nie Noten, Kurs- oder Dateinamen, nie Passwörter. Die Zeile
   unter Verbindungen formatiert `verbindungen.js` an einer Stelle; Zeitwörter („gerade eben“, „vor 5 Min.“, „vor 3 Std.“) nur aus
   `vorText`. Wortwahl nach Entscheidung E1 des Konsistenz-Audits: Daten holt man mit **Aktualisieren**.
2. **Ein Zeitplan:** `planen(ctx, { takt, zurueck, backoff, start, lauf })` legt die Zeitgeber über die Helfer des aufrufenden
   Skripts an. Erster Lauf, wenn der metadataCache eingelesen ist, nach `start` (Vorgabe 20 s + Zufall bis 2 Min.), danach je
   Lauf neu geplant: Erfolg → `takt`; Fehler → `backoff[n − 1]` beim n-ten Fehler in Folge (der letzte Wert gilt weiter, keiner
   länger als `takt`); zurück in der App (`visibilitychange`) und letzter Versuch länger als `zurueck` her → in 5 s. `lauf`
   liefert `true` (geklappt), `false` (Fehler) oder `null` (nichts zu tun); eine Ausnahme zählt als Fehler. Nie zwei Läufe
   zugleich. Testschalter je Quelle (`plugin.test…Aus`) prüft `lauf` selbst. Ist das Fenster verborgen und gleicht LiveSync so
   lange nicht ab (seit 0.6.8, `ctx.user.livesync.hintergrundStill`, siehe [„LiveSync“](livesync.md)), läuft der Takt nicht: Was der Lauf
   schriebe, auch die Sperre, sähen die anderen Geräte nicht. Er schaut alle 10 Minuten wieder (`K.SYNC_WARTEN`) und läuft
   30 s, nachdem das Fenster wieder sichtbar ist (`K.SYNC_ZURUECK`), damit LiveSync erst den Stand der anderen holt. Knöpfe
   laufen immer.
3. **Ein Schreiber:** `sperre.js` (siehe „Abrufer-Sperre“). Ein Knopf, den du tippst, übernimmt (`nehmen({ erzwingen: true })`,
   in der Zeile „Hier aktualisieren“, wenn gerade ein anderes Gerät schreibt).
4. **Quellen außerhalb des Plugins:** `eba.quelleExtern(schluessel, …)` über `Q.extern(eba, …)` fragt die Abruf-Funktion selbst
   bei jedem Lauf, nicht nur die Oberfläche (Befehle, Knöpfe und Zeitplan laufen alle durch sie).
5. **Besitzmarke:** Eine erzeugte Notiz trägt `herkunft: <quelle>` und das Id-Feld der Quelle (`Q.idFeld`: neue Quellen
   `<quelle>_id`; ältere Namen bleiben gültig: `zentral_id`, `alma_schluessel`, `ilias_gruppe`, `gruppe_id`; ohne `herkunft`
   `abgleich_id` des eigenen Uni-Abgleichs und `volltext_von: plugin` der Textfassungen; der eigene Server `herkunft: claude` +
   `claude_id`). Eine Quelle schreibt, benennt um oder löscht nur Notizen mit ihrer Marke (Ausnahmen, die die Quelle dokumentiert:
   Übergabe nach id, Alma verknüpft eigene Stundenplan-Notizen). Das Feld `quelle` ist nur zum Lesen da, nie Besitz.
6. **Ein Lebenslauf erzeugter Notizen:** *Von dir gelöscht* → Grabstein: `angewendet` (id → `kurzHash` des Eintrags, in der
   synchronisierten Sperr-Datei der Quelle, nur der Schreiber schreibt) merkt, was als Notiz geschrieben wurde; fehlt die Notiz
   und ist der Eintrag unverändert, kommt sie nicht wieder (`geloescht`). *In der Quelle weg* → `wegfall`: unberührt (nicht
   erledigt, kein eigener Text) in den einen Papierkorb (`Q.papierkorb`, siehe [„Bedien-Bausteine“](bedien-bausteine.md)), sonst „(entfällt)“ mit `entfaellt: true`; fällt auf einmal mehr als die
   Hälfte weg, gilt keiner als weggefallen (`zuViel`). *Dein Text* steht unter `## Meine Notizen` (Stundenplan-Notizen vor 0.4.6:
   `## Notizen`; `meineNotizen` kennt beide) und bleibt bei jedem Schreiben. *Doppel* einer id (Sync-Verzug,
   Konfliktkopie) führt der Schreiber zusammen wie `termine-sync.py` des Uni-Abgleichs: Der kürzeste Dateiname bleibt,
   `erledigt: true` gewinnt, eigene Zeilen der anderen kommen dazu, die anderen in den Papierkorb (`dubletten`).
7. **Meldekanal „Bitte prüfen“:** Was nur du lösen kannst (Anmeldung abgelehnt, Warnungen eines Laufs, Stundenplan-Notiz fehlt in
   Alma), meldet die Quelle mit `Q.melden(ctx, quelle, fn)`, `fn()` → `[{ text: "**Titel** · Rest", pfad, anker? }]` ohne
   persönliche Werte; nach einem Lauf `Q.meldenNeu(ctx)`. `bitte-pruefen.js` zeigt alle Punkte auf dem Dashboard (Reihenfolge
   `K.REIHE`), ein Tipp öffnet `pfad`. Hinweise (Notice) nur nach deinem Tipp, nie vom Zeitplan.

**Verbunden in diesem Tresor (seit 0.4.7, `Q.verbindung`):** Link und Passwort einer Quelle liegen nur auf dem Gerät, das verbunden
ist; die Daten kommen über den Sync auf alle. Ob ein anderes Gerät verbunden ist, sagt die Sperre der Quelle: Ein anderes Gerät hält
sie, sie ist nicht frei, und es war vor höchstens `K.VERBUNDEN_GRENZE` (7 Tage) aktiv → `anderswo` mit `zuletzt`; sonst `nein` (nie
verbunden, getrennt, länger still). Nur für die Anzeige (siehe [„Verbindungen und Schloss“](verbindungen.md)); wer schreibt, regelt weiter die Sperre.

**Stand der Quellen (18.10.2026):**

| Quelle | Zeitplan (`Q.planen`) | Sperre (`sperre.js`) | Status | Besitzmarke | Lebenslauf | „Bitte prüfen“ |
|---|---|---|---|---|---|---|
| Zentrale Daten (`zentral.js`) | 20 s + 0–2 Min., alle 15 Min., zurück > 10 Min. | `abruf.json` (Datei wie bisher; Übernahme und Puls über `sperre.js`, `angewendet` daneben) | gemeinsame Form, `geprueft` = letzter Erfolg | `herkunft: zentral` + `zentral_id` | Grabstein, Wegfall, Massenschutz, Doppel | – (Warnungen in der Zeile) |
| ILIAS-Unterlagen und Übungsgruppen (`ilias.js`) | 20 s + 0–2 Min., stündlich, zurück > 60 Min.; Auftrag für deine Läufe | `ilias-abruf.json` (wie bisher) | gemeinsame Form | Begleitnotizen `ilias_id`; Gruppen `herkunft: ilias-gruppe` + `ilias_gruppe` | Dateien: gelöscht bleibt gelöscht; Gruppen: Grabstein `notiz`, Wegfall nach zwei Läufen | abgelehnte Anmeldung, Warnungen |
| Alma-Stundenplan (`alma.js`) | 30 s + 0–2 Min., stündlich, Backoff 5/15/30 Min., zurück > 60 Min. | `alma-abruf.json` (neu, mit `angewendet`) | gemeinsame Form, Fehler bleibt | `herkunft: alma` + `alma_schluessel` | Grabstein, Wegfall, Doppel, eigene Notizen nie löschen | eigene Notiz fehlt in Alma |
| Noten & Anmeldungen (`alma-konto.js`, Beta) | Blick 60–180 s, alle 30 Min., zurück > 60 Min. (fällig nach 12 bzw. 3 Std.) | `alma-konto-abruf.json` | gemeinsame Form | keine Notizen (Modulfeld nach Tipp) | Grabstein `alma-konto-aus.json` fürs Löschen | Vorschläge, fehlende Anmeldung, abgelehnt |
| Volltext der PDFs (`volltext.js`) | nach 5 Min. Ruhe, alle 30 Min., zurück > 30 Min., Stapel | `volltext-abruf.json` mit Computer-Vorrang | gemeinsame Form | `volltext_von: plugin` (+ `quelle`) | Notiz ohne PDF nur, wenn die PDF wirklich weg ist (Zeuge, 3 Läufe, 2 Std.): Papierkorb oder „(PDF fehlt)“, Massenschutz, Doppel | – |
| ILIAS-Kalender (`ilias-kalender.js`, seit 18.10.2026) | 20 s + 0–100 s, alle 2 Std., Backoff 15/30/60 Min., zurück > 2 Std. | `ilias-kalender-abruf.json` (mit `angewendet`) | gemeinsame Form, Fehler bleibt | `herkunft: ilias-kalender` + `ilias_kalender_id` | Grabstein, Wegfall nur künftiger Abgaben, Massenschutz, Doppel, keine Doppel mit anderen Fristen | Link gilt nicht mehr, Warnungen |
| Eigener Server (`server.js`) | 30 s + 0–2 Min., alle 15 Min., Backoff 2/5 Min., zurück > 10 Min. | `server-abruf.json` (mit `angewendet`) | gemeinsame Form, Fehler bleibt | `herkunft: claude` + `claude_id` | Grabstein, Doppel einer id, unberührte Notiz weicht einem späteren zentralen Termin, Absage als „(entfällt)“ | Gerät neu verbinden, Claude neu verbinden, Uni-Passwort nicht angenommen |

**Was eine neue Quelle nutzt (so gebaut: der ILIAS-Kalender, `ilias-kalender.js`, siehe [„ILIAS-Kalender“](ilias-kalender.md)):** `Q.planen` für alle automatischen Läufe;
`ctx.user.sperre.erzeugen({ quelle: "ilias-kalender", … })` mit Grabsteinen `angewendet` in derselben Datei
(`ilias-kalender-abruf.json`; `.gitignore`, `release.py`, `pruefen.py` und `spiegel.py` kennen das Muster schon); bei jedem Lauf
`eba.quelleExtern("ilias-kalender", …)`; `status()` in der gemeinsamen Form mit `Q.nachLauf` für den gerätelokalen Stand; Zeile
über `standText`/`quelleZeile` in `verbindungen.js` (Knopf „Aktualisieren“, bei einem anderen Gerät „Hier aktualisieren“);
Notizen mit `Q.marke("ilias-kalender", id)` (`herkunft: ilias-kalender` + `ilias_kalender_id`), Wegfall über `Q.wegfall`,
`Q.zuViel`, Doppel über `Q.dubletten`, eigener Text unter `## Meine Notizen`; Punkte, die nur du lösen kannst (Link abgelaufen),
mit `Q.melden(ctx, "ilias-kalender", …)`. Übernimmt ein eigener Server später eine dieser Quellen (z. B. den
ILIAS-Kalender), steht sie in `quellen_extern`; seine Termine aus Mails schreibt `server.js` mit `herkunft: claude` +
`claude_id` (siehe [„Eigener Server mit Claude“](server.md)).
