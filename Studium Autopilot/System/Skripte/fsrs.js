// Formeln und Standardparameter von FSRS-6 folgen ts-fsrs (https://github.com/open-spaced-repetition/ts-fsrs), MIT-Lizenz:
//   Copyright (c) 2026 Open Spaced Repetition
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or substantial portions of the Software. THE
//   SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
//   OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Planung der Karteikarten (karten.js): Gedächtnismodell FSRS-6 und Abläufe wie in Anki (Lernschritte, Neu-Lernen,
// vier Knöpfe, Streuung der Intervalle). Reine Rechnung ohne Obsidian, darum ohne Obsidian testbar (tests/fsrs.test.js).
// Formeln und Standardparameter nach ts-fsrs (MIT, siehe THIRD_PARTY_NOTICES.md), neu geschrieben. Lernschritte, Grenzen der
// Knöpfe (Schwer < Gut < Einfach) und Streuung verhalten sich wie in Anki; von Anki ist kein Code übernommen.
// Die Streuung ist reproduzierbar: Der Zufallswert hängt nur an Kartenschlüssel und Zahl der Wiederholungen. So ergibt
// dieselbe Lerngeschichte auf jedem Gerät denselben Stand (karten.js rechnet den Stand immer aus der Geschichte neu).
// Helfer: aufrufen mit ctx.user.fsrs(ctx). iOS-sicher: kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function () {
  // FSRS-6, 21 Parameter (Standardwerte von ts-fsrs 5, Stand Oktober 2026); w[20] ist der Zerfall der Vergessenskurve
  const W = Object.freeze([0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]);
  const S_MIN = 0.001, S_MAX = 36500;
  const MIN = 60e3;
  const ZUSTAND = Object.freeze({ NEU: 0, LERNEN: 1, WIEDERHOLEN: 2, NEU_LERNEN: 3 });
  // Streuung wie in Anki: ab 2,5 Tagen ± 1 Tag plus 15 % (bis 7 Tage), 10 % (bis 20 Tage), 5 % (darüber)
  const STREUUNG = [{ von: 2.5, bis: 7, anteil: 0.15 }, { von: 7, bis: 20, anteil: 0.1 }, { von: 20, bis: Infinity, anteil: 0.05 }];

  const runden = (x) => Math.round(x * 1e8) / 1e8;
  const klemmen = (x, a, b) => Math.min(Math.max(x, a), b);

  // ---------- FSRS-6 ----------
  const zerfall = (w) => {
    const decay = -w[20];
    return { decay, faktor: runden(Math.exp(Math.log(0.9) / decay) - 1) };
  };
  // Wahrscheinlichkeit, die Karte nach „tage“ Tagen noch zu wissen (Stabilität s = Tage bis 90 %)
  const abrufbarkeit = (w, tage, s) => {
    const z = zerfall(w);
    return runden(Math.pow(1 + (z.faktor * tage) / s, z.decay));
  };
  // Faktor, mit dem die Stabilität zum Intervall für die gewünschte Behaltensquote wird (0,9 → 1)
  const intervallFaktor = (w, ziel) => {
    const z = zerfall(w);
    return runden((Math.pow(ziel, 1 / z.decay) - 1) / z.faktor);
  };
  const startStabilitaet = (w, b) => Math.max(w[b - 1], 0.1);
  const startSchwierigkeit = (w, b) => runden(w[4] - Math.exp((b - 1) * w[5]) + 1);
  const naechsteSchwierigkeit = (w, d, b) => {
    const delta = -w[6] * (b - 3);
    const neu = d + runden((delta * (10 - d)) / 9);
    return klemmen(runden(w[7] * startSchwierigkeit(w, 4) + (1 - w[7]) * neu), 1, 10);
  };
  const stabilitaetGewusst = (w, d, s, r, b) => {
    const schwer = b === 2 ? w[15] : 1, einfach = b === 4 ? w[16] : 1;
    return runden(klemmen(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * schwer * einfach), S_MIN, S_MAX));
  };
  const stabilitaetVergessen = (w, d, s, r) =>
    runden(klemmen(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), S_MIN, S_MAX));
  // Wiederholung am selben Tag (Lernschritte): kurzfristige Stabilität, bei Schwer/Gut/Einfach nie kleiner
  const stabilitaetKurz = (w, s, b) => {
    const zuwachs = Math.pow(s, -w[19]) * Math.exp(w[17] * (b - 3 + w[18]));
    return runden(klemmen(s * (b >= 2 ? Math.max(zuwachs, 1) : zuwachs), S_MIN, S_MAX));
  };
  // Neuer Gedächtnisstand { d, s } nach Bewertung b; vorher null = neue Karte, tage = ganze Tage seit der letzten Wiederholung
  const gedaechtnis = (w, vorher, tage, b) => {
    if (!vorher || !(vorher.s > 0)) return { d: klemmen(startSchwierigkeit(w, b), 1, 10), s: startStabilitaet(w, b) };
    const d = klemmen(vorher.d, 1, 10), s = Math.max(vorher.s, S_MIN);
    let neuS;
    if (tage === 0) neuS = stabilitaetKurz(w, s, b);
    else {
      const r = abrufbarkeit(w, tage, s);
      if (b === 1) neuS = klemmen(runden(s / Math.exp(w[17] * w[18])), S_MIN, stabilitaetVergessen(w, d, s, r));
      else neuS = stabilitaetGewusst(w, d, s, r, b);
    }
    return { d: naechsteSchwierigkeit(w, d, b), s: neuS };
  };

  // ---------- Reproduzierbarer Zufall (FNV-1a + Mischung) ----------
  const zufall = (text) => {
    let h = 0x811c9dc5;
    const t = String(text);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Intervall (Tage, Kommazahl) → ganze Tage zwischen min und max, gestreut mit faktor ∈ [0, 1)
  const streuen = (iv, min, max, faktor, an) => {
    min = Math.min(min, max);
    iv = klemmen(iv, min, max);
    if (!an || iv < 2.5) return klemmen(Math.round(iv), min, max);
    let delta = 1;
    for (const r of STREUUNG) delta += r.anteil * Math.max(Math.min(iv, r.bis) - r.von, 0);
    const hi = klemmen(Math.round(iv + delta), min, max);
    const lo = Math.min(klemmen(Math.max(2, Math.round(iv - delta)), min, max), hi);
    return Math.min(hi, Math.floor(lo + faktor * (hi - lo + 1)));
  };

  // Lernschritte als Text („1m 10m“, „10m“, „1h“, „1d“) → Minuten; ungültige Teile fallen weg
  const schritteLesen = (text) => {
    const aus = [];
    for (const teil of String(text == null ? "" : text).split(/[\s;]+/)) {
      const m = teil.replace(/,$/, "").match(/^(\d+(?:[.,]\d+)?)\s*(s|m|min|h|d)?$/i);
      if (!m) continue;
      const n = Number(m[1].replace(",", "."));
      const e = (m[2] || "m").toLowerCase();
      const min = e === "s" ? n / 60 : e === "h" ? n * 60 : e === "d" ? n * 1440 : n;
      if (min > 0 && min <= 1440 * 30) aus.push(min);
    }
    return aus;
  };

  // Wartezeit „Schwer“ im Lernschritt i: im ersten Schritt die Mitte zwischen erstem und zweitem Schritt (nur ein Schritt:
  // das 1,5-Fache, höchstens einen Tag länger), sonst derselbe Schritt noch einmal
  const schwerMinuten = (schritte, i) => {
    if (!schritte.length) return null;
    const jetzt = schritte[i];
    if (i > 0) return jetzt;
    return schritte.length > 1 ? (schritte[0] + schritte[1]) / 2 : Math.min(jetzt * 1.5, jetzt + 1440);
  };

  // ---------- Planer ----------
  // o: { w (21 Zahlen), ziel (gewünschte Behaltensquote 0,7–0,99), schritte / neuSchritte (Minuten), maxIntervall (Tage),
  //      streuung (true), tag(ms) → Tagnummer (mit Tagesbeginn), tagBeginn(tagnummer) → ms }
  // Karte: { zustand, schritt, s, d, faellig (ms, Lernschritte), tagFaellig (Tagnummer, Wiederholung), letzte (ms),
  //          intervall (Tage), wdh, fehler }
  const planer = (o) => {
    o = o || {};
    const w = o.w && o.w.length === 21 ? o.w : W;
    const ziel = klemmen(Number(o.ziel) || 0.9, 0.7, 0.99);
    const mod = intervallFaktor(w, ziel);
    const schritte = o.schritte || [1, 10], neuSchritte = o.neuSchritte || [10];
    const maxIv = Math.max(1, Math.round(Number(o.maxIntervall) || 36500));
    const streuung = o.streuung !== false;
    const tag = o.tag, tagBeginn = o.tagBeginn;

    const leer = () => ({ zustand: ZUSTAND.NEU, schritt: 0, s: 0, d: 0, faellig: 0, tagFaellig: 0, letzte: 0, intervall: 0, wdh: 0, fehler: 0 });
    const roh = (s) => s * mod; // Intervall in Tagen (Kommazahl) für die gewünschte Behaltensquote

    // Alle vier Folgezustände auf einmal (gleicher Zufallswert, damit Vorschau und Bewertung übereinstimmen)
    const vorschau = (k, jetzt, schluessel) => {
      const heute = tag(jetzt);
      const tage = k.letzte ? Math.max(0, heute - tag(k.letzte)) : 0;
      const faktor = zufall(schluessel + ":" + k.wdh);
      const neuKarte = k.zustand === ZUSTAND.NEU || !(k.s > 0);
      const mem = [null];
      for (let b = 1; b <= 4; b++) mem.push(gedaechtnis(w, neuKarte ? null : { d: k.d, s: k.s }, tage, b));
      const basis = (b) => Object.assign({}, k, { d: mem[b].d, s: mem[b].s, letzte: jetzt, wdh: k.wdh + 1 });
      const lernen = (b, zustand, i, minuten) =>
        Object.assign(basis(b), { zustand, schritt: i, faellig: jetzt + Math.round(minuten * MIN), tagFaellig: 0 });
      const wiederholen = (b, tageIv) =>
        Object.assign(basis(b), { zustand: ZUSTAND.WIEDERHOLEN, schritt: 0, intervall: tageIv, tagFaellig: heute + tageIv, faellig: tagBeginn(heute + tageIv) });
      // Intervalle beim Abschluss: Gut ≥ 1 Tag, Einfach mindestens einen Tag mehr als Gut, Schwer nie länger als Gut
      const iv = (b, min) => streuen(roh(mem[b].s), min, maxIv, faktor, streuung);
      const aus = [null];

      if (k.zustand === ZUSTAND.WIEDERHOLEN) {
        const schwer = iv(2, 1), gut = iv(3, schwer + 1), einfach = iv(4, gut + 1);
        const nochmalIv = iv(1, 1);
        const fehler = k.fehler + 1;
        aus.push(neuSchritte.length ? Object.assign(lernen(1, ZUSTAND.NEU_LERNEN, 0, neuSchritte[0]), { intervall: nochmalIv, fehler })
          : Object.assign(wiederholen(1, nochmalIv), { fehler }));
        aus.push(wiederholen(2, schwer), wiederholen(3, gut), wiederholen(4, einfach));
        return aus;
      }
      // Neu, Lernen, Neu-Lernen: Lernschritte wie in Anki
      const nl = k.zustand === ZUSTAND.NEU_LERNEN;
      const st = nl ? neuSchritte : schritte;
      const zst = nl ? ZUSTAND.NEU_LERNEN : ZUSTAND.LERNEN;
      const i = k.zustand === ZUSTAND.NEU ? 0 : klemmen(k.schritt || 0, 0, Math.max(0, st.length - 1));
      const gutIv = iv(3, 1);
      aus.push(st.length ? lernen(1, zst, 0, st[0]) : wiederholen(1, iv(1, 1)));
      const sm = schwerMinuten(st, i);
      aus.push(sm != null ? lernen(2, zst, i, sm) : wiederholen(2, Math.min(iv(2, 1), gutIv)));
      aus.push(i + 1 < st.length ? lernen(3, zst, i + 1, st[i + 1]) : wiederholen(3, gutIv));
      aus.push(wiederholen(4, iv(4, gutIv + 1)));
      return aus;
    };

    const bewerten = (k, b, jetzt, schluessel) => vorschau(k, jetzt, schluessel)[b];

    // Wahrscheinlichkeit, die Karte heute zu wissen (nur mit Gedächtnisstand)
    const jetztAbrufbar = (k, jetzt) => (k.s > 0 && k.letzte ? abrufbarkeit(w, Math.max(0, tag(jetzt) - tag(k.letzte)), k.s) : null);

    return { leer, vorschau, bewerten, abrufbar: jetztAbrufbar, ziel, maxIntervall: maxIv, schritte, neuSchritte };
  };

  return { W, ZUSTAND, planer, gedaechtnis, abrufbarkeit, intervallFaktor, streuen, zufall, schritteLesen, schwerMinuten };
};
