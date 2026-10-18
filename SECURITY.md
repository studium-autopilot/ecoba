# Sicherheit

## Eine Lücke melden

Bitte **kein öffentliches Issue** für Sicherheitslücken. Melde sie privat über
[Security → Report a vulnerability](https://github.com/studium-autopilot/ecoba/security/advisories/new). Nur der Autor sieht
die Meldung. Du bekommst innerhalb von 7 Tagen eine Antwort. Nach der Behebung erscheint ein Sicherheitshinweis
(Security Advisory), auf Wunsch mit deinem Namen.

Bitte schick keine echten Zugangsdaten, Matrikelnummern oder Noten mit, auch nicht deine eigenen.

## Was dazugehört

- Das Plugin und die Skripte im Tresor (`Studium Autopilot/.obsidian/plugins/studium-autopilot/`, `System/Skripte/`).
- Das Update über den Knopf **Neue Version installieren** (Prüfsummen, Update-Liste, Sicherung).
- Die Prüfung der zentralen Daten im Plugin (alles, was eine manipulierte Datendatei in den Tresor schreiben oder ausführen
  könnte).
- Die Anmeldung bei ILIAS und der Umgang mit Zugangsdaten: Das Passwort darf nur im Schlüsselbund des Geräts liegen und nur
  an die Anmeldeseite der Uni gehen.

Nicht dazu gehören Obsidian selbst, Alma, ILIAS und andere Systeme der Universität. Lücken dort bitte an die jeweiligen
Betreiber melden.

## Unterstützte Versionen

Nur die neueste Version (siehe [Releases](https://github.com/studium-autopilot/ecoba/releases/latest)). Behebungen kommen
als neue Version über **Neue Version installieren**.

## Wie das Plugin geschützt ist

Ein Überblick steht in [docs/datenschutz.md](docs/datenschutz.md) und in [docs/architektur.md](docs/architektur.md)
(„Zentrale Daten“, „Update“).

---

**English:** Please report security issues privately via
[Report a vulnerability](https://github.com/studium-autopilot/ecoba/security/advisories/new), not as a public issue. Only the
latest release is supported. Expect a reply within 7 days.
