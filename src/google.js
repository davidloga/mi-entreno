/* Mi Entreno — conexión con Google (cada usuario con su propia cuenta).
   Permiso único: drive.file → la app solo ve la hoja que el usuario elige y los archivos que ella misma crea. */
(function (root) {
  'use strict';
  var CFG = root.APP_CONFIG || {};
  var SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
  var SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  var DRIVE = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var C = root.Core;

  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function appUrl() { return location.origin + location.pathname; }

  /* ---------- Autorización (flujo de redirección: funciona dentro de la app instalada en iPhone) ---------- */
  function captureToken() {
    if (!/access_token=/.test(location.hash)) return;
    var p = new URLSearchParams(location.hash.slice(1));
    var st = ls('oauth_state');
    if (st && p.get('state') !== st) { history.replaceState(null, '', appUrl()); return; }
    ls('tok', { t: p.get('access_token'), exp: Date.now() + (parseInt(p.get('expires_in'), 10) || 3600) * 1000 - 60000 });
    ls('oauth_state', null);
    history.replaceState(null, '', appUrl());
  }
  function token() { var t = ls('tok'); return t && t.exp > Date.now() ? t.t : null; }
  function signedInBefore() { return !!ls('email'); }
  function signIn(opts) {
    var st = Math.random().toString(36).slice(2);
    ls('oauth_state', st);
    var q = { client_id: CFG.CLIENT_ID, redirect_uri: appUrl(), response_type: 'token', scope: SCOPES, include_granted_scopes: 'true', state: st };
    var em = ls('email'); if (em) q.login_hint = em;
    if (opts && opts.prompt) q.prompt = opts.prompt;
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(q).toString();
    return new Promise(function () {});
  }
  function signOut() { ['tok', 'email', 'dataId', 'photoFolder', 'state_cache'].forEach(function (k) { ls(k, null); }); }
  function needAuthError() { var e = new Error('AUTH'); e.auth = true; return e; }

  function api(url, opt) {
    opt = opt || {};
    var t = token();
    if (!t) return Promise.reject(needAuthError());
    var h = { Authorization: 'Bearer ' + t };
    if (opt.json !== undefined) { h['Content-Type'] = 'application/json'; opt.body = JSON.stringify(opt.json); }
    return fetch(url, { method: opt.method || 'GET', headers: Object.assign(h, opt.headers || {}), body: opt.body }).then(function (r) {
      if (r.status === 401) { ls('tok', null); throw needAuthError(); }
      if (!r.ok) return r.text().then(function (txt) { var m = txt; try { m = JSON.parse(txt).error.message; } catch (e) {} var er = new Error(m || ('Error ' + r.status)); er.status = r.status; throw er; });
      return opt.raw ? r : r.status === 204 ? null : r.json();
    });
  }
  function q(s) { return encodeURIComponent(s); }

  /* ---------- Archivo de datos propio del usuario (medidas, sesiones, ajustes) ---------- */
  var dataId = null;
  function findOrCreate(kind, create) {
    var cached = ls(kind + 'Id'); if (cached) return Promise.resolve(cached);
    var query = "appProperties has { key='miEntreno' and value='" + kind + "' } and trashed=false";
    return api(DRIVE + '?q=' + q(query) + '&fields=files(id)&spaces=drive').then(function (r) {
      if (r.files && r.files.length) { ls(kind + 'Id', r.files[0].id); return r.files[0].id; }
      return create().then(function (id) { ls(kind + 'Id', id); return id; });
    });
  }
  function dataFile() {
    if (dataId) return Promise.resolve(dataId);
    return findOrCreate('data', function () {
      return api(DRIVE, { method: 'POST', json: { name: 'Mi Entreno · datos de la app', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { miEntreno: 'data' } } }).then(function (f) {
        return api(SHEETS + f.id, {}).then(function (ss) {
          var first = ss.sheets[0].properties.sheetId;
          return api(SHEETS + f.id + ':batchUpdate', { method: 'POST', json: { requests: [
            { updateSheetProperties: { properties: { sheetId: first, title: 'Medidas', gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } },
            { addSheet: { properties: { title: 'Sesiones', gridProperties: { frozenRowCount: 1 } } } },
            { addSheet: { properties: { title: 'Ajustes' } } }
          ] } });
        }).then(function () {
          return api(SHEETS + f.id + '/values:batchUpdate', { method: 'POST', json: { valueInputOption: 'RAW', data: [
            { range: 'Medidas!A1:J1', values: [['Fecha', 'Peso (kg)', 'Cintura (cm)', 'Cadera (cm)', 'Muslo (cm)', 'Brazo (cm)', 'Foto frente', 'Foto perfil', 'Foto espalda', 'Nota']] },
            { range: 'Sesiones!A1:G1', values: [['Fecha', 'Mesociclo', 'Día', 'Nombre del día', 'Semana', 'Cardio', 'Abdomen']] },
            { range: 'Ajustes!A1:B1', values: [['Clave', 'Valor']] }
          ] } });
        }).then(function () { return f.id; });
      });
    }).then(function (id) { dataId = id; return id; });
  }
  function photoFolder() {
    return findOrCreate('photos', function () {
      return api(DRIVE, { method: 'POST', json: { name: 'Mi Entreno · fotos de progreso', mimeType: 'application/vnd.google-apps.folder', appProperties: { miEntreno: 'photos' } } }).then(function (f) { return f.id; });
    });
  }
  function readSettings(id) {
    return api(SHEETS + id + '/values/' + q('Ajustes!A2:B50')).then(function (r) {
      var o = {}; (r.values || []).forEach(function (row) { if (row[0]) o[row[0]] = row[1] || ''; }); return o;
    });
  }
  function setSetting(k, v) {
    return dataFile().then(function (id) {
      return api(SHEETS + id + '/values/' + q('Ajustes!A2:B50')).then(function (r) {
        var rows = r.values || [], i = rows.findIndex(function (x) { return x[0] === k; });
        var rowN = i >= 0 ? i + 2 : rows.length + 2;
        return api(SHEETS + id + '/values/' + q('Ajustes!A' + rowN + ':B' + rowN) + '?valueInputOption=RAW', { method: 'PUT', json: { values: [[k, v || '']] } });
      });
    });
  }

  /* ---------- Lectura de la hoja del entrenador ---------- */
  function hex(c) {
    if (!c) return '#ffffff';
    var f = function (x) { return ('0' + Math.round((x || 0) * 255).toString(16)).slice(-2); };
    return '#' + f(c.red) + f(c.green) + f(c.blue);
  }
  function readTrainer(sid) {
    var fields = 'properties(title),sheets(properties(sheetId,title,index,hidden),data(rowData(values(formattedValue,effectiveFormat/backgroundColor))))';
    return api(SHEETS + sid + '?includeGridData=true&fields=' + q(fields)).then(function (ss) {
      var tabs = [];
      ss.sheets.forEach(function (sh) {
        var pr = sh.properties; if (pr.hidden) return;
        var rows = (sh.data && sh.data[0] && sh.data[0].rowData) || [];
        var grid = { title: pr.title, sheetId: pr.sheetId, index: pr.index, values: [], bg: [] };
        rows.slice(0, 120).forEach(function (rd) {
          var vs = (rd.values || []).slice(0, 14);
          grid.values.push(vs.map(function (c) { return c.formattedValue || ''; }));
          grid.bg.push(vs.map(function (c) { return hex(c.effectiveFormat && c.effectiveFormat.backgroundColor); }));
        });
        var t = C.parseTab(grid);
        if (t.days.length) tabs.push(t);
      });
      tabs.sort(function (a, b) { return a.index - b.index; });
      return { name: ss.properties.title, tabs: tabs };
    });
  }

  /* ---------- Medidas y sesiones ---------- */
  function readMeasures(id) {
    return api(SHEETS + id + '/values/' + q('Medidas!A2:J500')).then(function (r) {
      return (r.values || []).map(function (x, i) {
        var n = function (v) { return C.num(v); };
        return { row: i + 2, date: x[0] || '', peso: n(x[1]), cintura: n(x[2]), cadera: n(x[3]), muslo: n(x[4]), brazo: n(x[5]),
          photos: { frente: x[6] || '', perfil: x[7] || '', espalda: x[8] || '' }, note: x[9] || '' };
      }).filter(function (m) { return /^\d{4}-\d{2}-\d{2}$/.test(m.date); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    });
  }
  function readDone(id) {
    return api(SHEETS + id + '/values/' + q('Sesiones!A2:G2000')).then(function (r) {
      return (r.values || []).map(function (x) { return x[1] + '|' + x[2] + '|' + (Number(x[4]) - 1); });
    });
  }
  function uploadPhoto(dataUrl, name) {
    return photoFolder().then(function (folder) {
      var m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl), bin = atob(m[2]), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var fd = new FormData();
      fd.append('metadata', new Blob([JSON.stringify({ name: name, parents: [folder], appProperties: { miEntreno: 'photo' } })], { type: 'application/json' }));
      fd.append('file', new Blob([bytes], { type: m[1] }));
      return api(UPLOAD + '?uploadType=multipart&fields=id', { method: 'POST', body: fd }).then(function (f) { return f.id; });
    });
  }

  /* ---------- Selector de Google (elige tu hoja) ---------- */
  var pickerLoaded = null;
  function loadPicker() {
    if (pickerLoaded) return pickerLoaded;
    pickerLoaded = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://apis.google.com/js/api.js';
      s.onload = function () { root.gapi.load('picker', { callback: res, onerror: rej }); };
      s.onerror = function () { rej(new Error('No se ha podido cargar el selector de Google.')); };
      document.head.appendChild(s);
    });
    return pickerLoaded;
  }
  function pick() {
    var t = token(); if (!t) return Promise.reject(needAuthError());
    return loadPicker().then(function () {
      return new Promise(function (res, rej) {
        var P = root.google.picker;
        var view = new P.DocsView(P.ViewId.SPREADSHEETS).setMode(P.DocsViewMode.LIST).setIncludeFolders(false);
        var picker = new P.PickerBuilder().addView(view).setOAuthToken(t).setDeveloperKey(CFG.API_KEY).setAppId(CFG.APP_ID)
          .setLocale('es').setTitle('Elige tu hoja de entreno').enableFeature(P.Feature.NAV_HIDDEN)
          .setCallback(function (d) {
            if (d.action === P.Action.PICKED) res({ id: d.docs[0].id, name: d.docs[0].name });
            else if (d.action === P.Action.CANCEL) rej(new Error('CANCEL'));
          }).build();
        picker.setVisible(true);
      });
    });
  }

  /* ---------- API que usa la interfaz ---------- */
  var API = {
    signIn: signIn, signOut: signOut, token: token, signedInBefore: signedInBefore,
    whoami: function () {
      return api('https://openidconnect.googleapis.com/v1/userinfo').then(function (u) { ls('email', u.email); return u; });
    },
    getState: function () {
      return dataFile().then(function (id) {
        return Promise.all([readSettings(id), readMeasures(id), readDone(id)]).then(function (r) {
          var cfg = r[0], st = { goal: cfg.goal || '', nextRev: cfg.nextRev || '', measures: r[1], done: r[2], green: C.GREEN, sheetId: cfg.trainerSheet || '' };
          if (!cfg.trainerSheet) { st.needsSetup = true; st.tabs = []; return st; }
          return readTrainer(cfg.trainerSheet).then(function (t) { st.sheetName = t.name; st.tabs = t.tabs; return st; })
            .catch(function (e) { if (e.status === 404 || e.status === 403) { st.needsSetup = true; st.tabs = []; st.setupWhy = 'No tengo acceso a la hoja elegida. Vuelve a elegirla.'; return st; } throw e; });
        });
      });
    },
    pickSheet: function () {
      return pick().then(function (f) {
        return readTrainer(f.id).then(function (t) {
          if (!t.tabs.length) throw new Error('Esa hoja no tiene bloques "DÍA 1 - …" con una fila de EJERCICIOS. ¿Es la hoja de tu entrenador?');
          return setSetting('trainerSheet', f.id).then(function () { return { ok: true, name: f.name }; });
        });
      });
    },
    saveExercise: function (p) {
      var sid = (root.S && S.st && S.st.sheetId) || p.spreadsheetId;
      var color = function (h) { var m = /^#?(..)(..)(..)$/.exec(h || '#ffffff'); return { red: parseInt(m[1], 16) / 255, green: parseInt(m[2], 16) / 255, blue: parseInt(m[3], 16) / 255 }; };
      var cellv = { userEnteredValue: { stringValue: p.text || '' } }, fields = 'userEnteredValue';
      if (p.green) { cellv.userEnteredFormat = { backgroundColor: color(C.GREEN) }; fields += ',userEnteredFormat.backgroundColor'; }
      else if (p.wasGreen) { cellv.userEnteredFormat = { backgroundColor: color(p.baseBg || '#f8f8f8') }; fields += ',userEnteredFormat.backgroundColor'; }
      return api(SHEETS + sid + ':batchUpdate', { method: 'POST', json: { requests: [{ updateCells: {
        rows: [{ values: [cellv] }], fields: fields,
        range: { sheetId: p.gid, startRowIndex: p.row, endRowIndex: p.row + 1, startColumnIndex: p.col, endColumnIndex: p.col + 1 } } }] } }).then(function () { return { ok: true }; });
    },
    finishDay: function (p) {
      return dataFile().then(function (id) {
        var d = new Date(), ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        return api(SHEETS + id + '/values/' + q('Sesiones!A:G') + ':append?valueInputOption=RAW', { method: 'POST', json: { values: [[ds, p.tab, p.dayN, p.dayName, p.week + 1, p.cardio ? 'Sí' : 'No', p.abs ? 'Sí' : 'No']] } });
      }).then(function () { return { ok: true }; });
    },
    saveMeasure: function (m) {
      var poses = ['frente', 'perfil', 'espalda'], ph = m.photos || {};
      return dataFile().then(function (id) {
        return Promise.all(poses.map(function (p) { return ph[p] ? uploadPhoto(ph[p], m.date + '_' + p + '.jpg') : ''; })).then(function (ids) {
          var row = [m.date, m.peso, m.cintura, m.cadera, m.muslo, m.brazo].map(function (x) { return x == null ? '' : x; }).concat(ids).concat([m.note || '']);
          return api(SHEETS + id + '/values/' + q('Medidas!A:J') + ':append?valueInputOption=RAW', { method: 'POST', json: { values: [row] } });
        }).then(function () { return readMeasures(id); });
      });
    },
    setMeasurePhoto: function (row, pose, dataUrl, date) {
      var col = { frente: 'G', perfil: 'H', espalda: 'I' }[pose];
      return dataFile().then(function (id) {
        return uploadPhoto(dataUrl, date + '_' + pose + '.jpg').then(function (fid) {
          return api(SHEETS + id + '/values/' + q('Medidas!' + col + row) + '?valueInputOption=RAW', { method: 'PUT', json: { values: [[fid]] } });
        }).then(function () { return readMeasures(id); });
      });
    },
    getPhoto: function (fid) {
      return api(DRIVE + '/' + fid + '?alt=media', { raw: true }).then(function (r) { return r.blob(); }).then(function (b) { return URL.createObjectURL(b); });
    },
    setGoal: function (g) { return setSetting('goal', g).then(function () { return { ok: true }; }); },
    setNextRev: function (d) { return setSetting('nextRev', d).then(function () { return { ok: true }; }); }
  };
  captureToken();
  root.GAPI = API;
})(window);
