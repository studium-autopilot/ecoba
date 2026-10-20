# Kostenregeln (für jedes Konto, verbindlich)

Wer den Free Tier von Oracle nutzt, zahlt nie etwas. Die Schritte von `einrichten.mjs` setzen diese Regeln um; du hältst sie
zusätzlich bei allem ein, was du sagst oder in der Konsole zeigst.

1. **Nie Pay-As-You-Go.** Kein Upgrade anbieten, nie darauf klicken. Ist ein Konto schon Pay-As-You-Go, gelten alle Regeln
   trotzdem, und Schritt 3 (Schutz) ist Pflicht.
2. **Nur Always Free, nach der Rest-Rechnung von `stand.mjs`.** Angelegt wird nur, was ganz hineinpasst:
   - A1: zusammen mit vorhandenen A1-Instanzen höchstens 2 OCPU und 12 GB. Reicht der Rest nicht, anhalten und erklären.
   - E2.1.Micro: höchstens 2 im Konto (der Platzsucher braucht einen).
   - **Blockspeicher ist ein eigener Topf von 200 GB**, Boot-Volumes zählen mit. Ein Volume, das nicht ganz in den Rest passt,
     kostet ganz, nicht nur der Überhang. Das Boot-Volume des Servers ist darum so groß wie der Rest, solange der Platzsucher
     lebt 50 GB weniger. Nie ein zusätzliches Volume.
   - Leistung immer „Balanced“ (10 VPU), kein Auto-Tune. Höchstens 5 Backups, keine Backup-Richtlinie.
   - Alles nur in der Heimatregion; kein Load Balancer, keine Datenbank, kein Objektspeicher über 20 GB.
3. **Testzeitraum:** In den ersten 30 Tagen bietet die Konsole auch bezahlte Größen an. Nur Größen mit „Always Free-eligible“;
   alles andere verschwände nach 30 Tagen.
4. **Fremdes nicht anfassen.** Ressourcen ohne das Kennzeichen `studium-autopilot` werden nie geändert, gestoppt oder gelöscht.
5. **Schutz (Schritt 3):** Quota-Richtlinie „nur-kostenlos“ (keine bezahlten Formen, Blockspeicher begrenzt, keine weiteren
   Volumes, höchstens 5 Backups) und Budget „kostenwarnung“ (Mail ab dem ersten Cent und bei einer Prognose über 1 Euro).
   Läuft schon Bezahltes, die Quota erst nach Zustimmung.
6. **Platzsucher:** nur die feste Größe aus Schritt 4, Helfer und seine Rechte danach weg (`abschliessen` bzw.
   `platzsucher-beenden`).
7. **Leerlauf:** Der Server hält ein Viertel seines Arbeitsspeichers belegt, damit Oracle ihn nicht als ungenutzt anhält.
8. **Kostenprüfung am Ende** (Schritt 11) und auf Wunsch jederzeit („Prüf meine Oracle-Kosten“). Alles über 0 nennst du mit
   Ursache.

## Was du nie tust

- Eine Größe, ein Volume oder einen Dienst vorschlagen, der nicht in diesen Regeln steht.
- In der Konsole selbst auf „Create“ klicken, wenn `einrichten.mjs` den Schritt kann.
- Die Quota löschen oder lockern, damit etwas passt. Passt etwas nicht, erklärst du warum und hältst an.
