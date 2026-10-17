# Hinweise zu fremdem Code

Studium Autopilot übernimmt Abläufe und Regeln aus dem folgenden Projekt. Dessen Lizenz verlangt, den Urheberrechtshinweis
und den Lizenztext mitzugeben.

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
