# Architektur: LiveSync

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## LiveSync (seit 0.6.8, `livesync.js`)

Für Tresore, die mit Self-hosted LiveSync abgleichen (eigener Server, `studium-server livesync`, siehe
`server/skill/server-einrichten/livesync.md`). Ohne eingeschaltetes Plugin `obsidian-livesync` tut die Datei nichts.

- **Wache auf iPhone und iPad.** iOS schließt im Hintergrund die lokale Datenbank (IndexedDB) von LiveSync. PouchDB vergisst die
  Verbindung nur bei `versionchange` oder `abort`, nie bei `close` (so noch in LiveSync 1.0.40); LiveSync gleicht danach nichts mehr
  ab, ohne Fehler zu zeigen, bis Obsidian neu startet. Die Erweiterung hört auf `visibilitychange` (nur mit `Platform.isMobile`) und
  prüft 5 s nach der Rückkehr (`K.RUHE`, entprellt) mit `info()` der lokalen Datenbank (Frist 10 s). Antwortet sie mit
  `InvalidStateError` oder „connection is closing“, wartet die Wache, bis LiveSync nichts mehr vom Server holt
  (`replicator.bounded…ActivityCount`) und die Warteschlangen (`fileProcessing.*`, `replication.*`, `conflict.*`) leer sind oder 5 s
  stillstehen (höchstens 60 s; sonst neuer Versuch nach 60 s). Dann `appLifecycle.onSuspending()`,
  `databaseEvents.initialiseDatabase(false, true, false, true)` und `control.applySettings()`: derselbe Weg, den LiveSync selbst beim
  Neuöffnen geht, ohne Neuaufbau und ohne Abgleich von Dateien. Ist die Datenbank danach nicht offen, lädt die Wache das Plugin neu
  (`disablePlugin`/`enablePlugin`). Höchstens alle 3 Minuten (`K.PAUSE`; der Zeitpunkt liegt in `ctx.bleibend` und übersteht
  Neuladen), eine zurückgestellte Uhr zählt nicht. Jeder Eingriff steht als „Studium Autopilot: …“ im Protokoll von LiveSync
  (`API.addLog`, Stufe Info) und in der Konsole.
- **Nur mit bekannten Teilen.** `dienste(app)` liefert `core.services` nur, wenn alle benutzten Funktionen da sind (geprüft in den
  Quellen von 1.0.32 bis 1.0.40); sonst greift nichts ein. Die Zähler werden nur gelesen, ein fehlender zählt als 0.
- **Computer mit verborgenem Fenster.** LiveSync pausiert am Computer, solange das Fenster verborgen (minimiert, anderer Desktop) ist,
  außer mit `keepReplicationActiveInBackground` bei laufendem Abgleich; auf iPhone und iPad gilt die Einstellung nicht.
  `hintergrundStill(app, document, mobil)` bildet diese Regel nach. `quellen.planen` ruft dann nicht von selbst ab (siehe
  [„Quellen-Vertrag“](quellen.md), Punkt 2): Was der Lauf schriebe, auch die Abrufer-Sperre, sähe kein anderes Gerät, und das Gerät hielte die
  Sperre, ohne dass sie ankommt. Die Sperre abzugeben hilft nicht, weil auch „frei“ nicht ankäme. Links für neue Geräte
  (`server/livesync.mjs`) setzen die Einstellung seit 0.6.8; ältere Computer schalten sie in LiveSync selbst ein (Anleitung in
  `livesync.md`, „Wenn etwas hakt“).
- **Nach einem Update** sagt die Meldung bei LiveSync, Obsidian noch eine Minute offen zu lassen (`b.livesync`, `aktiv(app)`): Die
  neuen Dateien müssen erst zum Server.
- Ausblenden der Statusanzeige von LiveSync bleibt LiveSync überlassen (eigene Einstellung dort): Für Studierende ist sie das einzige
  sichtbare Zeichen, wenn der Abgleich hakt.
- Tests: `tests/livesync.test.js` mit einem Nachbau der benutzten Dienste (offen, geschlossen, nicht bereit, Fehler, 3-Minuten-Grenze,
  laufender Abruf, stehende und wandernde Warteschlangen, Neuladen, Computer ohne Wache); `tests/quellen.test.js` für den Takt bei
  verborgenem Fenster; `tests/server.test.js` für die Einstellung im Link.
