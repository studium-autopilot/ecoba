# Hinweise zu fremdem Code

Studium Autopilot übernimmt Abläufe, Regeln, Symbole und Code aus den folgenden Projekten. Deren Lizenz verlangt, den
Urheberrechtshinweis und den Lizenztext mitzugeben.

## PFERD

- Projekt: [PFERD](https://github.com/Garmelon/PFERD), ein Werkzeug zum Herunterladen von Kursdateien aus ILIAS
- Lizenz: MIT (Text unten)
- Verwendet in:
  - `Studium Autopilot/System/Skripte/ilias-html.js`: Selektoren und Regeln zum Lesen der ILIAS-Seiten (nach
    `crawl/ilias/kit_ilias_html.py`, Version 3.9.4), neu geschrieben in JavaScript und an die Seiten der Uni Tübingen
    angepasst.
  - `Studium Autopilot/System/Skripte/ilias-anmeldung.js`: Ablauf der Anmeldung über Shibboleth (nach
    `crawl/ilias/shibboleth_login.py`).

```text
Copyright 2019-2024 Garmelon, I-Al-Istannen, danstooamerican, pavelzw,
                    TheChristophe, Scriptim, thelukasprobst, Toorero,
                    Mr-Pine, p-fruck, PinieP, Florian Raith

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## ts-fsrs

- Projekt: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), das Planungsverfahren FSRS in TypeScript
- Lizenz: MIT (Text unten)
- Verwendet in:
  - `Studium Autopilot/System/Skripte/fsrs.js`: Formeln von FSRS-6 (Vergessenskurve, Stabilität, Schwierigkeit) und die
    21 Standardparameter (nach `packages/fsrs/src/algorithm.ts` und `constant.ts`), neu geschrieben in JavaScript.
- Lernschritte, Knöpfe, Tageslimits und Streuung der Intervalle verhalten sich wie in [Anki](https://apps.ankiweb.net);
  von Anki ist kein Code übernommen.

```text
MIT License

Copyright (c) 2026 Open Spaced Repetition

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lucide

- Projekt: [Lucide](https://lucide.dev), eine Sammlung von Symbolen (Linienzeichnungen im 24er-Raster)
- Lizenz: ISC (Text unten); Teile gehen auf Feather (MIT) zurück, siehe Urheberrechtshinweis
- Verwendet in:
  - `Studium Autopilot/System/Skripte/` (`einrichtung.js`, `kalender.js`, `personalisieren.js`, `postfach.js`, `rundgang.js`,
    `seitenleiste.js`, `verbindungen.js`): einzelne SVG-Pfade der Symbole, als eigenes SVG eingebettet, weil `setIcon` auf dem
    iPad leer blieb.
  - Die Symbole der Hinweisboxen in `Studium Autopilot/.obsidian/snippets/eba-core.css` sind nur Namen von Symbolen, die Obsidian
    selbst mitbringt; von Lucide ist dort nichts kopiert.

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## noble-ed25519

- Projekt: [noble-ed25519](https://github.com/paulmillr/noble-ed25519), Ed25519 in JavaScript ohne Abhängigkeiten
- Version: 3.2.0 (npm `@noble/ed25519@3.2.0`, integrity
  `sha512-criDgRlnUA09hchYrTy/JUWPIEap5rZxQe6wDWzRx51oWWpDRcUpuNzlgPxDJaOK6AsW9c0wKcj3rKRv6t+bPQ==`)
- Lizenz: MIT (Text unten)
- Verwendet in:
  - `Studium Autopilot/.obsidian/plugins/studium-autopilot/main.js` (`ED25519`): nur der Weg zum Prüfen einer Signatur
    (`verifyAsync` mit `zip215: false`), Formeln unverändert übernommen. Er prüft die Signatur der Update-Liste auf Geräten,
    deren Web Crypto kein Ed25519 kann (iOS bis 16). Signieren und Schlüssel erzeugen sind nicht übernommen.

```text
The MIT License (MIT)

Copyright (c) 2019 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Vorbilder (kein Code übernommen)

Für Noten & Anmeldungen aus Alma (`alma-konto-html.js`) stammen die Regeln aus echten Seiten von Alma; wie gefüllte Tabellen von
HISinOne aussehen (Tabellenklassen, Endungen der Element-ids, Kurzformen der Status), ist aus der Beschreibung bzw. dem Verhalten
dieser Projekte übernommen, nicht ihr Code:

- tue-api-wrapper (Tue-StudyOS, Apache-2.0)
- hisinone-mcp (MIT)
- myhda-notify (MIT)
