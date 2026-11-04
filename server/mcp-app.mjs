// MCP-App (Erweiterung io.modelcontextprotocol/ui, Fassung 2026-01-26): ueberblick verweist auf eine Wochenansicht, die Claude im
// Chat zeichnet (claude.ai auf iPad, iPhone und im Browser, 02.11.2026). Am Werkzeug selbst wie bei github-mcp-server, nicht als
// zweites Werkzeug mit denselben Daten: eins weniger in jeder Unterhaltung, und Claude muss nicht wählen. Nur mit app: true an einem
// Lauscher. Die Ansicht ist eine feste Seite ohne fremde Adressen; Daten kommen nur über postMessage vom Gastgeber und landen nur
// als Text im DOM (nie als HTML).
import { heuteBerlin } from "./mcp-ergebnis.mjs";

export const APP_URI = "ui://studium-autopilot/woche.html";
export const APP_MIME = "text/html;profile=mcp-app";
export const APP_WERKZEUG = "ueberblick";

const ANSICHT = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--grund:var(--color-background-primary,#fff);--text:var(--color-text-primary,#1d1d1f);
--leise:var(--color-text-secondary,#6e6e73);--linie:var(--color-border-primary,rgba(127,127,127,.25));--akzent:#1d5fbf}
:root.dunkel{--grund:var(--color-background-primary,#1c1c1e);--text:var(--color-text-primary,#f2f2f7);--leise:var(--color-text-secondary,#a1a1a6);--akzent:#6ea8ff}
body{margin:0;padding:12px 14px;font:15px/1.4 var(--font-sans,-apple-system,system-ui,sans-serif);background:var(--grund);color:var(--text)}
h1{font-size:15px;font-weight:600;margin:0 0 8px;color:var(--leise)}
.tag{display:grid;grid-template-columns:5.2em 1fr;gap:0 10px;padding:7px 0;border-top:1px solid var(--linie)}
.tag.heute .name{color:var(--akzent);font-weight:600}.name{color:var(--leise);font-variant-numeric:tabular-nums}
.eintrag{display:grid;grid-template-columns:6.6em 1fr;gap:0 8px}.zeit{color:var(--leise);font-variant-numeric:tabular-nums}
.ort{color:var(--leise)}.aus .titel{text-decoration:line-through}.hinweis{color:var(--leise);font-size:13px}
.leer{color:var(--leise)}.stand{color:var(--leise);font-size:12px;margin-top:8px}
</style></head><body><h1 id="kopf">Woche</h1><div id="woche"><p class="leer">Lädt …</p></div><p class="stand" id="stand"></p>
<script>
(function () {
  "use strict";
  var offen = {}, naechste = 0;
  function senden(nachricht) { window.parent.postMessage(nachricht, "*"); }
  function anfrage(method, params) {
    var id = ++naechste;
    return new Promise(function (ok, falsch) { offen[id] = { ok: ok, falsch: falsch }; senden({ jsonrpc: "2.0", id: id, method: method, params: params }); });
  }
  function el(art, klasse, text) { var e = document.createElement(art); if (klasse) e.className = klasse; if (text != null) e.textContent = String(text); return e; }
  function thema(k) {
    if (!k) return;
    if (k.theme) document.documentElement.classList.toggle("dunkel", k.theme === "dark");
    var v = k.styles && k.styles.variables;
    if (v && typeof v === "object") Object.keys(v).forEach(function (n) { if (/^--[a-z0-9-]+$/.test(n) && typeof v[n] === "string") document.documentElement.style.setProperty(n, v[n]); });
  }
  function groesse() { senden({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } }); }
  function zeile(zeit, titel, ort, klasse, hinweis) {
    var z = el("div", "eintrag" + (klasse ? " " + klasse : ""));
    z.appendChild(el("span", "zeit", zeit || ""));
    var r = el("span"); r.appendChild(el("span", "titel", titel || ""));
    if (ort) { r.appendChild(document.createTextNode(" · ")); r.appendChild(el("span", "ort", ort)); }
    if (hinweis) { r.appendChild(el("br")); r.appendChild(el("span", "hinweis", hinweis)); }
    z.appendChild(r);
    return z;
  }
  // Die Ansicht zeichnet nur, was der Server vorbereitet hat (ansicht: Tage mit sortierten Einträgen), damit die Regeln testbar sind
  function zeichnen(d) {
    var woche = document.getElementById("woche"), a = d && d.ansicht;
    woche.textContent = "";
    if (!a || !Array.isArray(a.tage)) { woche.appendChild(el("p", "leer", "Keine Daten.")); return groesse(); }
    document.getElementById("kopf").textContent = String(a.titel || "Woche");
    a.tage.forEach(function (t) {
      var tag = el("div", "tag" + (t.heute ? " heute" : ""));
      tag.appendChild(el("div", "name", t.name));
      var inhalt = el("div");
      (Array.isArray(t.eintraege) ? t.eintraege : []).forEach(function (e) { inhalt.appendChild(zeile(e.zeit, e.titel, e.ort, e.aus ? "aus" : "", e.hinweis)); });
      if (!inhalt.childNodes.length) inhalt.appendChild(el("span", "leer", "nichts"));
      tag.appendChild(inhalt);
      woche.appendChild(tag);
    });
    document.getElementById("stand").textContent = String(a.stand || "");
    groesse();
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && !m.method && offen[m.id]) { var p = offen[m.id]; delete offen[m.id]; if (m.error) p.falsch(m.error); else p.ok(m.result); return; }
    if (m.method === "ui/notifications/tool-result") {
      try { zeichnen(m.params && m.params.structuredContent); } catch (f) { document.getElementById("woche").textContent = "Ansicht: " + f; groesse(); }
    }
    else if (m.method === "ui/notifications/host-context-changed") thema(m.params);
    else if (m.id != null && (m.method === "ui/resource-teardown" || m.method === "ping")) senden({ jsonrpc: "2.0", id: m.id, result: {} });
    else if (m.id != null && m.method) senden({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "unbekannt" } });
  });
  if (window.ResizeObserver) new ResizeObserver(groesse).observe(document.body);
  anfrage("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "studium-autopilot-woche", version: "1" },
    clientInfo: { name: "studium-autopilot-woche", version: "1" }, appCapabilities: {} })
    .then(function (r) { thema(r && r.hostContext); senden({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }); groesse(); },
      function () { groesse(); });
})();
</script></body></html>
`;

const kurz = (d) => {
  const t = String(d || "").split("-");
  return t.length === 3 ? `${t[2]}.${t[1]}.` : String(d || "");
};
const listeVon = (x) => (Array.isArray(x) ? x : x && Array.isArray(x.eintraege) ? x.eintraege : []);
// Sortierschlüssel einer Zeitangabe: ohne Uhrzeit (ganztägig, Frist) zuerst, dann nach Beginn („ab 20:15“ wie 20:15), To-dos zuletzt
function minuten(zeit) {
  const m = /^(?:ab\s*)?(\d{1,2}):(\d{2})/.exec(String(zeit || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

// Aus dem Ergebnis von ueberblick die Tage, wie die Ansicht sie zeigt: je Tag Lehre, Termine, Fristenden und To-dos in einer Liste,
// nach Uhrzeit sortiert; heute (Europe/Berlin) markiert.
export function ansichtVon(daten, heute) {
  const termine = listeVon(daten.termine), todos = listeVon(daten.todos);
  const tage = (Array.isArray(daten.tage) ? daten.tage : []).map((t) => {
    const eintraege = [];
    for (const l of listeVon(t.lehre)) {
      const zeit = [l.beginn, l.ende].filter(Boolean).join("–");
      eintraege.push({ zeit, titel: l.titel, ort: l.raum, aus: !!l.faellt_aus, hinweis: l.faellt_aus ? "fällt aus" : l.hinweis || "", schluessel: minuten(zeit) });
    }
    for (const e of termine) {
      if (e.datum === t.datum) {
        const hinweis = e.kategorie === "Frist" && e.bis && e.bis !== e.datum ? `bis ${kurz(e.bis)}` : "";
        eintraege.push({ zeit: e.uhrzeit || "", titel: e.titel, ort: e.ort, aus: false, hinweis, schluessel: minuten(e.uhrzeit) });
      } else if (e.bis === t.datum && e.kategorie === "Frist") {
        eintraege.push({ zeit: "Frist", titel: e.titel, ort: e.ort, aus: false, hinweis: "endet heute", schluessel: -1 });
      }
    }
    for (const e of todos) if (e.frist === t.datum) eintraege.push({ zeit: "To-do", titel: e.text || e.titel, ort: "", aus: false, hinweis: "", schluessel: 24 * 60 });
    eintraege.sort((a, b) => a.schluessel - b.schluessel);
    return { name: `${String(t.tag || "").slice(0, 2)} ${kurz(t.datum)}`, heute: t.datum === heute,
      eintraege: eintraege.map((e) => ({ zeit: e.zeit, titel: e.titel, ort: e.ort, aus: e.aus, hinweis: e.hinweis })) };
  });
  const z = daten.zeitraum || {}, st = daten.stand || {};
  const stand = st.abgeglichen ? `Abgeglichen ${st.abgeglichen}` : st.letzte_aenderung ? `Letzte Änderung ${st.letzte_aenderung}` : "";
  return { titel: `Woche ${kurz(z.von)}–${kurz(z.bis)}`, tage, stand };
}

// Verweis für ueberblick (meta), die Ressource und die Daten für die Ansicht
export function app({ jetzt = () => new Date() } = {}) {
  return {
    meta: { ui: { resourceUri: APP_URI }, "ui/resourceUri": APP_URI },
    ressourcen: () => [{ uri: APP_URI, name: "Wochenansicht", description: "Ansicht für ueberblick", mimeType: APP_MIME }],
    // Inhalt einer Ressource oder null
    lesen(uri) {
      if (uri !== APP_URI) return null;
      return [{ uri: APP_URI, mimeType: APP_MIME, text: ANSICHT, _meta: { ui: { prefersBorder: true } } }];
    },
    // structuredContent zu einem Ergebnis von ueberblick (aufrufen in mcp-werkzeuge.mjs): nur, was die Ansicht zeichnet; Claude
    // bekommt die Daten als Text. Bei einem Fehler nichts.
    strukturiert: (r) => (r && !r.fehler && r.daten ? { ansicht: ansichtVon(r.daten, heuteBerlin(jetzt())) } : null),
  };
}
