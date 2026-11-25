// PaperLift shared workout page. Reads the workout from the #fragment only (browsers never send it to this site),
// decodes it here and draws it. No network requests, no analytics, no storage. Everything in the link is untrusted:
// it is length-checked, validated, and written with textContent only.
(function () {
  "use strict";
  var MAX_FRAGMENT = 4096, MAX_JSON = 256 * 1024, MAX_EXERCISES = 30, MAX_SETS = 20;
  function $(id) { return document.getElementById(id); }
  function fail() { $("error").hidden = false; $("totals").textContent = ""; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function num(x) { return (Math.round(x * 2) / 2).toLocaleString("en-US", { maximumFractionDigits: 1 }); }

  function fromB64url(s) {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("bad");
    var b = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    var bin = atob(b), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // "z" links: raw DEFLATE (what iOS writes), inflated in the browser, at most 256 KB.
  async function inflate(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    var reader = stream.getReader(), chunks = [], total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (total > MAX_JSON) throw new Error("too big");
      chunks.push(r.value);
    }
    var all = new Uint8Array(total), at = 0;
    chunks.forEach(function (c) { all.set(c, at); at += c.length; });
    return new TextDecoder().decode(all);
  }

  // The app's set summary (F7): consecutive sets at one weight grouped, "185 lb × 10, 8 · 195 lb × 8".
  function setsText(e, unit) {
    var s = e.s;
    var timed = e.l === "time" || e.l === "cardio";
    function amount(r) {
      if (!timed) return String(r);
      var m = Math.floor(r / 60), sec = r % 60;
      return m + ":" + (sec < 10 ? "0" : "") + sec;
    }
    var weighted = s.some(function (x) { return typeof x[0] === "number" && x[0] > 0; });
    if (!weighted) {
      var all = s.map(function (x) { return x[1]; });
      var same = all.every(function (r) { return r === all[0]; });
      if (same && !timed) return plural(s.length, "set", "sets") + " × " + plural(all[0], "rep", "reps");
      return plural(s.length, "set", "sets") + " · " + all.map(amount).join(", ") + (timed ? "" : " reps");
    }
    var groups = [];
    s.forEach(function (x) {
      var w = typeof x[0] === "number" ? x[0] : 0, last = groups[groups.length - 1];
      if (last && last.w === w) last.r.push(amount(x[1])); else groups.push({ w: w, r: [amount(x[1])] });
    });
    return groups.map(function (g) {
      return (g.w > 0 ? num(g.w) + " " + unit : "Bodyweight") + " × " + g.r.join(", ");
    }).join(" · ");
  }

  // The sender's theme ("t", the app's stored theme id). Only known ids are used; anything else stays Notebook.
  var THEMES = {
    notebook: ["#F7F4EC", "#15181E"], graphPaper: ["#F2F4F0", "#121718"], chalkboard: ["#1C2925", "#1C2925"],
    leather: ["#EFE4D2", "#1C130D"], kraft: ["#CFB185", "#2A2016"], oxblood: ["#F4E6E1", "#1D0D0D"],
    black: ["#F1ECE0", "#000000"], canvas: ["#E6DDC8", "#1A1915"]
  };
  function setTheme(t) {
    if (typeof t !== "string" || !Object.prototype.hasOwnProperty.call(THEMES, t)) return;
    document.documentElement.setAttribute("data-theme", t);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas[0]) metas[0].setAttribute("content", THEMES[t][0]);
    if (metas[1]) metas[1].setAttribute("content", THEMES[t][1]);
  }

  async function run() {
    var frag = location.hash.slice(1);
    if (!frag || frag.length > MAX_FRAGMENT) return fail();
    // A Universal Link tapped on a page of the same site stays in the browser, so this button uses the
    // app's own scheme with the same fragment.
    $("open").href = "paperlift://w/#" + frag;
    var json = frag[0] === "z" ? await inflate(fromB64url(frag.slice(1))) : new TextDecoder().decode(fromB64url(frag));
    if (json.length > MAX_JSON) return fail();
    var w = JSON.parse(json);
    if (!w || typeof w !== "object" || typeof w.n !== "string" || !Array.isArray(w.e) ||
        w.e.length === 0 || w.e.length > MAX_EXERCISES) return fail();
    setTheme(w.t);
    var unit = (w.v === 2 && w.u === "lb") ? "lb" : "kg";
    var sets = 0, list = $("list");
    w.e.forEach(function (e) {
      if (!e || typeof e.n !== "string" || !Array.isArray(e.s) || e.s.length === 0 || e.s.length > MAX_SETS) throw new Error("bad");
      e.s.forEach(function (x) { if (!Array.isArray(x) || typeof x[1] !== "number") throw new Error("bad"); });
      sets += e.s.length;
      var li = document.createElement("li"), a = document.createElement("div"), b = document.createElement("div");
      a.className = "ex"; a.textContent = e.n.slice(0, 60);
      b.className = "sets"; b.textContent = setsText(e, unit);
      li.appendChild(a); li.appendChild(b); list.appendChild(li);
    });
    var name = w.n.trim().slice(0, 60) || "Workout";
    $("name").textContent = name;
    document.title = name + " · PaperLift";
    $("totals").textContent = plural(w.e.length, "exercise", "exercises") + " · " + plural(sets, "set", "sets");
    if (typeof w.s === "string" && w.s.trim()) $("from").textContent = "From " + w.s.trim().slice(0, 30);
  }
  run().catch(fail);
})();
