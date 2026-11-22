/* Mi Entreno — núcleo: lectura de la hoja del entrenador y de las cargas.
   Probado contra la hoja real (10 mesociclos) con test/core.test.js */
(function (root) {
  'use strict';
  var DAY_RE = /^D[IÍ]A\s*(\d+)\s*[-–—:]\s*(.+)$/i;
  var GREEN = '#00ff00';

  function norm(s) {
    return String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function isGreen(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    if (!m) return false;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return g > 150 && g > r + 40 && g > b + 40;
  }
  function num(s) { if (s === '' || s == null) return null; var n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmtN(n) { if (n == null || isNaN(n)) return '–'; return (Math.round(n * 100) / 100).toString().replace('.', ','); }
  /* "8-12", "8 A 15", "6 a 10", "5" */
  function range(r) {
    var n = (String(r || '').match(/\d+/g) || []).map(Number);
    if (!n.length) return null;
    if (n.length > 2 || n[n.length - 1] > 60) return null; // fechas corruptas u otros
    return { lo: n[0], hi: n[n.length - 1] };
  }

  /* ---------- Lectura de una celda de carga ----------
     Formatos reales vistos: "60 kg - 10-9", "12,5kg - 9-9", "7 placas - 11-9", "35 kg por lado - 9-9",
     "20kg 8-8", "Sin lastre 9-9", "50- 11-10-10", "Panatta 15 kg - 8-8-7", "Barra libre: 12,5kg - 10-10",
     "20-12 / 20-10 / 20-9" (peso-reps por serie), "Fallo", "70 kg", "8 placas - 12-" */
  var UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|placas?|pinchos?)?\.?/i;
  function parseLoad(t) {
    var raw = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    var out = { raw: raw, weight: null, unit: 'kg', reps: [], prefix: '', suffix: '' };
    // Formato por serie: "20-12 / 20-10 / 20-9"
    var body = raw.replace(/^[^:\d]*:\s*/, '');
    if (body.indexOf('/') >= 0) {
      var groups = body.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
      var re = /^(\d+(?:[.,]\d+)?)\D*?-\s*(\d+)$/;
      if (groups.length >= 2 && groups.every(function (g) { return re.test(g); })) {
        out.weight = num(re.exec(groups[0])[1]);
        out.reps = groups.map(function (g) { return +re.exec(g)[2]; });
        out.perSet = true;
        return out;
      }
    }
    var notes = [];
    var s = raw.replace(/\s*\(([^)]*)\)\s*/g, function (_, n) { notes.push(n.trim()); return ' '; }).trim(), left = s, reps = '';
    var m = /^(.*?)(\s*-\s*|\s+|:\s*)((?:\d+\s*-\s*)*\d+)\s*-?\s*$/.exec(s);
    if (m) {
      var l = m[1].trim(), sep = m[2];
      if (/^\d+(?:[.,]\d+)?$/.test(l) && !/\s/.test(sep)) {
        // "8-8-7": solo repeticiones
        if (/^(\d+\s*-\s*)*\d+\s*-?$/.test(s)) { left = ''; reps = s; }
      } else { left = l; reps = m[3]; }
    } else if (/^(\d+\s*-\s*)+\d+$/.test(s)) { left = ''; reps = s; }
    out.reps = (reps.match(/\d+/g) || []).map(Number);
    left = left.replace(/[\s.\-:]+$/, '');
    var u = UNIT_RE.exec(left);
    if (u) {
      out.weight = num(u[1]);
      out.unit = u[2] ? (/^p[li]/i.test(u[2]) ? (/^pl/i.test(u[2]) ? 'placas' : 'pinchos') : 'kg') : 'kg';
      out.prefix = left.slice(0, u.index).replace(/[\s:]+$/, '').trim();
      out.suffix = left.slice(u.index + u[0].length).replace(/^[\s.\-]+/, '').trim();
    } else {
      out.suffix = left.trim();
    }
    if (notes.length) out.suffix = [out.suffix].concat(notes).filter(Boolean).join(' ');
    return out;
  }
  /* Superseries: en la hoja se escriben con " || " (también se han usado "//" e " y ") */
  function splitParts(t) {
    var s = String(t || '');
    var a = s.split(/\s*(?:\|\||\/\/)\s*/);
    if (a.length < 2) {
      var y = s.split(/\s+y\s+/i);
      if (y.length === 2 && /\d/.test(y[0]) && /\d/.test(y[1]) && parseLoad(y[0]).reps.length && parseLoad(y[1]).reps.length) a = y;
    }
    return a.map(function (x) { return x.trim(); });
  }
  function splitLoad(t, n) {
    var a = splitParts(t), out = [];
    for (var i = 0; i < n; i++) out.push(a[i] ? parseLoad(a[i]) : null);
    return out;
  }
  function partsOf(name) {
    var p = String(name).split(/\s+\+\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return p.length > 1 ? p : [String(name).trim()];
  }
  function partText(p) {
    var reps = p.sets.filter(function (r) { return r != null; });
    if (!reps.length && !p.note) return '';
    var w = p.w != null ? fmtN(p.w) + ' ' + (p.unit || 'kg') : '';
    var left = [p.prefix, w, p.note].filter(Boolean).join(' ');
    return reps.length ? (left ? left + ' - ' : '') + reps.join('-') : left;
  }
  function draftText(d) { var t = d.parts.map(partText); return t.every(function (x) { return !x; }) ? '' : t.join(' || '); }

  /* ---------- Lectura de una pestaña (rejilla de valores + fondos) ---------- */
  function parseTab(grid) {
    var v = grid.values || [], bg = grid.bg || [];
    var cell = function (r, c) { return (v[r] && v[r][c] != null) ? String(v[r][c]) : ''; };
    var out = { name: grid.title, sheetId: grid.sheetId, index: grid.index, days: [], cardio: '', abs: [] };
    var r, c, k;
    for (r = 0; r < v.length; r++) {
      var title = null;
      for (c = 0; c < 6; c++) { var mt = cell(r, c).trim().match(DAY_RE); if (mt) { title = { n: +mt[1], name: mt[2].trim() }; break; } }
      if (!title) continue;
      var h = -1;
      for (k = r; k <= r + 3 && k < v.length; k++) {
        for (c = 0; c < 13; c++) if (/^EJERCICIO/.test(norm(cell(k, c)))) { h = k; break; }
        if (h >= 0) break;
      }
      if (h < 0) continue;
      var hdr = []; for (c = 0; c < Math.max(13, (v[h] || []).length); c++) hdr.push(norm(cell(h, c)));
      var col = function (ps) { for (var i = 0; i < hdr.length; i++) for (var j = 0; j < ps.length; j++) if (hdr[i].indexOf(ps[j]) === 0) return i; return -1; };
      var cEx = col(['EJERCICIO']), cSer = col(['SERIE']), cRir = col(['RIR', 'RPE']), cRep = col(['REPE']), cTec = col(['TECNICA']);
      var rirLabel = cRir >= 0 ? (hdr[cRir].indexOf('RPE') === 0 ? 'RPE' : 'RIR') : 'RIR';
      var weeks = [];
      hdr.forEach(function (x, i) { var mw = x.match(/^DIA\s*(\d+)$/); if (mw && i > cEx) weeks.push({ n: +mw[1], col: i }); });
      var exercises = [];
      for (k = h + 1; k < v.length; k++) {
        var stop = false;
        for (c = 0; c < 6; c++) if (DAY_RE.test(cell(k, c).trim())) stop = true;
        for (c = 0; c < 13; c++) { var nn = norm(cell(k, c)); if (nn === 'CARDIO' || nn.indexOf('ABDOMEN') === 0) stop = true; }
        if (stop) break;
        var name = cell(k, cEx).trim();
        if (!name) continue;
        var baseBg = null;
        var loads = weeks.map(function (w) { var b = bg[k] && bg[k][w.col], g = isGreen(b); if (!g && !baseBg && b) baseBg = b; return { t: cell(k, w.col).replace(/\s+/g, ' ').trim(), g: g }; });
        exercises.push({
          row: k, name: name,
          series: cSer >= 0 ? String(parseInt(cell(k, cSer), 10) || '') : '',
          rir: cRir >= 0 ? cell(k, cRir).replace(/\.0$/, '') : '', rirLabel: rirLabel,
          reps: cRep >= 0 ? cell(k, cRep).replace(/\s+[aA]\s+/, '-') : '',
          tec: cTec >= 0 ? cell(k, cTec).trim() : '',
          baseBg: baseBg || '#f8f8f8', loads: loads
        });
      }
      out.days.push({ n: title.n, name: title.name, weeks: weeks, exercises: exercises });
      r = h;
    }
    for (r = 0; r < v.length; r++) for (c = 0; c < 13; c++) {
      var n2 = norm(cell(r, c));
      if (n2 === 'CARDIO' && !out.cardio) for (k = r + 1; k < Math.min(v.length, r + 6); k++) if (cell(k, c).trim()) { out.cardio = cell(k, c).replace(/\s+/g, ' ').trim(); break; }
      if (n2.indexOf('ABDOMEN') === 0 && !out.abs.length) for (k = r + 1; k < v.length && cell(k, c).trim(); k++) out.abs.push({ name: cell(k, c).trim(), dose: cell(k, c + 1).trim() });
    }
    return out;
  }

  /* Columna de hoja (0 → A) */
  function colA1(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  root.Core = { DAY_RE: DAY_RE, GREEN: GREEN, norm: norm, isGreen: isGreen, num: num, fmtN: fmtN, range: range, parseLoad: parseLoad,
    splitParts: splitParts, splitLoad: splitLoad, partsOf: partsOf, partText: partText, draftText: draftText, parseTab: parseTab, colA1: colA1 };
})(typeof window !== 'undefined' ? window : globalThis);
