/* Forte · CMS – Medical Claims · Digital Ribbon Cutting
   Host screen, participant screens and link sheet.
   Real-time state lives in Firebase Realtime Database:

   ceremonies/<session>/control      { run, rehearsal, k }   (host only, key-protected)
   ceremonies/<session>/activations/<run>/<participant>  { at }   (create-once)
   ceremonies/<session>/cut/<run>    { at }   (create-once, only when all 5 exist)
   ceremonies/<session>/presence/<participant>/<conn>     (who has their page open)

   Every reset creates a new <run>, so old activations never count again.
   The ceremony sequence is scheduled from the server timestamp in cut/<run>,
   so it runs exactly once and a refreshed host resumes at the right point. */
(function () {
  'use strict';

  var C = window.FORTE_CONFIG || {};
  var B = window.ForteBackend;
  var T = C.text || {};
  var Q = new URLSearchParams(location.search);
  var SESSION = String(Q.get('session') || C.defaultSession || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  var MODE = String(Q.get('mode') || '').toLowerCase();
  var THEME = String(Q.get('theme') || C.theme || 'light').toLowerCase().replace(/[^a-z]/g, '');
  var PID = String(Q.get('participant') || '').toLowerCase();
  var PEOPLE = C.participants || [];
  var IDS = PEOPLE.map(function (p) { return p.id; });
  var TOTAL = IDS.length;
  var BASE = 'ceremonies/' + SESSION;

  // Ceremony timeline, in ms after the 5th confirmation reaches the server.
  // The countdown runs 10 → 1 (one number per second), then the ribbon cuts.
  var COUNT_FROM = 10;
  var REDIRECT_DELAY = 1500; // ms the participant sees READY before moving to the host screen
  // Where the scissors cut: the dash in "Forte – Live with confidence". The phrase itself is
  // centred on the ribbon (x = 960), which puts its dash left of centre.
  var CUT_X = 826;
  var TL = { count: 1000, cut: 1000 + COUNT_FROM * 1000 };
  TL.close = TL.cut + 650; TL.split = TL.cut + 950; TL.sys = TL.cut + 2300; TL.live = TL.cut + 4800;
  // Optional "system reveal": the CMS screenshot rises out of the cut ribbon,
  // then dissolves into the final LIVE screen (config.js › systemScreenshotUrl).
  var SYS = !!C.systemScreenshotUrl;
  if (SYS) TL.live = TL.cut + 8300;

  var root = document.getElementById('root');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function nameOf(id) { for (var i = 0; i < PEOPLE.length; i++) if (PEOPLE[i].id === id) return PEOPLE[i].name; return id; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  // ---------- Logo area (see config.js › logoUrl) ----------
  function logoHTML(cls) {
    var box = '<span class="logo-box" aria-label="Forte"><span>Forte</span></span>';
    if (C.logoUrl) {
      return '<div class="logo-area ' + (cls || '') + '" data-logo-area>' +
        '<img class="logo-img" src="' + esc(C.logoUrl) + '" alt="Forte" onerror="this.parentNode.innerHTML=this.parentNode.getAttribute(\'data-fallback\')">' +
        '</div>';
    }
    return '<div class="logo-area ' + (cls || '') + '" data-logo-area>' + box + '</div>';
  }
  function fixLogoFallbacks() {
    $all('[data-logo-area]').forEach(function (el) {
      el.setAttribute('data-fallback', '<span class="logo-box" aria-label="Forte"><span>Forte</span></span>');
    });
  }

  // ---------- Setup guard ----------
  function configMissing() {
    if (!B) return 'backend.js did not load.';
    if (B.kind === 'mock') return null;
    var f = C.firebase || {};
    if (!f.apiKey || /PASTE/.test(f.apiKey + f.databaseURL + f.projectId)) return 'Firebase is not configured yet. Open config.js and paste your Firebase web-app settings.';
    if (!f.databaseURL) return 'config.js › firebase.databaseURL is missing.';
    return null;
  }
  function setupScreen(msg) {
    root.innerHTML = '<div class="p-page"><div class="p-card setup">' + logoHTML() +
      '<div class="p-eyebrow">Ceremony setup</div><h2>Almost ready</h2><p>' + esc(msg) +
      '</p><p class="muted">See README.md › Step 2.</p></div></div>';
  }

  // ---------- Shared ceremony state ----------
  function watchCeremony(onChange) {
    var st = { loaded: false, run: null, rehearsal: false, acts: {}, cut: null, connected: false, presence: {} };
    var subA = null, subC = null, runLoaded = false, rehLoaded = false;
    function emit() { st.loaded = runLoaded && rehLoaded; onChange(st); }
    B.onConnected(function (c) { st.connected = c; emit(); });
    B.on(BASE + '/control/rehearsal', function (v) { st.rehearsal = v === true; rehLoaded = true; emit(); }, function () { rehLoaded = true; emit(); });
    B.on(BASE + '/presence', function (v) { st.presence = v || {}; emit(); }, function () {});
    B.on(BASE + '/control/run', function (run) {
      runLoaded = true;
      if (run === st.run) { emit(); return; }
      if (subA) subA(); if (subC) subC();
      subA = subC = null;
      st.run = run || null; st.acts = {}; st.cut = null;
      if (run) {
        subA = B.on(BASE + '/activations/' + run, function (v) {
          if (st.run !== run) return;
          st.acts = v || {}; emit();
        });
        subC = B.on(BASE + '/cut/' + run, function (v) {
          if (st.run !== run) return;
          st.cut = v && typeof v.at === 'number' ? v : null; emit();
        });
      }
      emit();
    }, function () { runLoaded = true; emit(); });
    return st;
  }
  function readyCount(st) {
    var n = 0;
    IDS.forEach(function (id) { if (st.acts && st.acts[id]) n++; });
    return n;
  }
  // Any client may propose the cut; the database accepts it only once per run
  // and only when all five activations exist.
  // While our own proposal is in flight we ignore the locally-echoed value and
  // only start the ceremony from the server-confirmed record.
  var cutTried = {}, cutPending = {};
  function proposeCut(st, rerender) {
    if (!st.run || st.cut || cutTried[st.run] || readyCount(st) !== TOTAL) return;
    var run = st.run;
    cutTried[run] = true; cutPending[run] = true;
    function done() { cutPending[run] = false; if (rerender) rerender(); }
    B.set(BASE + '/cut/' + run, { at: B.TS }).then(done, done); // rejected = someone else already wrote it
  }
  function countNums() {
    var a = [];
    for (var i = 0; i < COUNT_FROM; i++) a.push([String(COUNT_FROM - i), TL.count + i * 1000]);
    return a;
  }
  function cutConfirmed(st) { return !!(st.cut && !cutPending[st.run]); }

  // =====================================================================
  // HOST
  // =====================================================================
  function host() {
    document.title = 'HOST · ' + (T.system || 'CMS') + ' Go-Live';
    document.body.className = 'is-host theme-' + THEME;
    var hostKey = Q.get('key') || ss('forte-host-key:' + SESSION) || '';
    if (Q.get('key')) ss('forte-host-key:' + SESSION, Q.get('key'));

    var cards = PEOPLE.map(function (p, i) {
      return '<div class="pcard" data-id="' + esc(p.id) + '">' +
        '<i class="pres" title="Participant page open"></i>' +
        '<div class="pnum">' + pad2(i + 1) + '</div>' +
        '<div class="pname">' + esc(p.name) + '</div>' +
        '<div class="pill"><span class="pill-w">WAITING</span><span class="pill-r">READY <b>✓</b></span></div>' +
        '</div>';
    }).join('');
    var segs = IDS.map(function () { return '<span></span>'; }).join('');

    root.innerHTML =
      '<div class="stage-wrap"><div class="stage" id="stage">' +
        '<div class="bg-dots"></div><div class="bg-glow"></div><div class="bg-lines"></div>' +
        '<header class="h-top">' + logoHTML('host-logo') +
          '<div class="h-right"><span class="rehearsal-badge">REHEARSAL</span>' +
          '<span class="company">' + esc(C.companyName || '') + '</span></div>' +
        '</header>' +
        '<div class="notice" id="notice"></div>' +
        '<section class="h-title">' +
          '<h1>' + esc(T.title) + '</h1>' +
          '<div class="date-row"><span class="rule"></span><span>' + esc(T.date) + '</span><span class="rule"></span></div>' +
          '<p class="subtitle">' + esc(T.subtitle) + '</p>' +
        '</section>' +
        tunnelSVG() + ribbonSVG() + scissorsSVG() +
        '<section class="status">' +
          '<div class="count"><b id="cnt">0</b><span> / ' + TOTAL + ' READY</span></div>' +
          '<div class="segments" id="segs">' + segs + '</div>' +
        '</section>' +
        '<section class="people">' + cards + '</section>' +
        '<footer class="h-foot">Representatives: press <kbd>SHIFT</kbd> + <kbd>V</kbd> on your personal ceremony page</footer>' +
        '<div class="countdown" id="cd"><div class="cd-msg">ALL ' + TOTAL + ' REPRESENTATIVES CONFIRMED</div><div class="cd-num" id="cdnum"></div></div>' +
        sysHTML() + liveHTML() +
        '<canvas class="fx" id="fx" width="1920" height="1080"></canvas>' +
      '</div></div>' +
      (!hostKey ? '' : '<div class="host-controls" id="hc">' +
        '<span class="hc-info" id="hcinfo">Connecting…</span>' +
        '<button type="button" id="btnReh" class="hc-btn">Rehearsal mode</button>' +
        '<button type="button" id="btnFs" class="hc-btn">Full screen</button>' +
        '<button type="button" id="btnReset" class="hc-btn hc-danger">Reset ceremony</button>' +
      '</div>') + modalHTML();
    fixLogoFallbacks();

    var stage = $('#stage');
    function fit() {
      var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      stage.style.setProperty('--s', s);
    }
    fit(); window.addEventListener('resize', fit);

    // discreet controls: visible on mouse move, fade after 3 s
    var idleT;
    function wake() { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(function () { if (!modalOpen) document.body.classList.add('idle'); }, 3000); }
    ['mousemove', 'mousedown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, wake, { passive: true }); });
    wake();

    var fx = FX($('#fx'));
    var st = null, seqRun = null, timers = [], initTried = false;
    st = watchCeremony(render);

    function render() {
      if (!st) return;
      var n = readyCount(st);
      stage.classList.toggle('rehearsal', !!st.rehearsal);
      $('#cnt').textContent = String(n);
      $all('#segs span').forEach(function (s, i) { s.classList.toggle('on', i < n); });
      stage.classList.toggle('all-ready', n === TOTAL);
      $all('.pcard').forEach(function (c) {
        var id = c.getAttribute('data-id');
        var was = c.classList.contains('ready');
        var is = !!(st.acts && st.acts[id]);
        c.classList.toggle('ready', is);
        if (is && !was && st.loaded) { c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); }
        c.classList.toggle('online', !!(st.presence[id] && Object.keys(st.presence[id]).length));
      });
      // notices
      var note = '';
      if (!st.connected && st.loaded) note = 'Reconnecting to the ceremony server…';
      else if (!st.loaded) note = 'Connecting to the ceremony server…';
      else if (!st.run) note = hostKey ? 'Opening the ceremony…' : 'Waiting for the ceremony to open…';
      var ne = $('#notice'); ne.textContent = note; ne.classList.toggle('show', !!note);

      var open = IDS.filter(function (id) { return st.presence[id] && Object.keys(st.presence[id]).length; });
      var missing = IDS.filter(function (id) { return open.indexOf(id) < 0; }).map(nameOf);
      if (hostKey) {
      $('#hcinfo').innerHTML = (st.connected ? '<i class="dot ok"></i>Live sync' : '<i class="dot bad"></i>Offline') +
        ' · Pages open ' + open.length + '/' + TOTAL + (missing.length && missing.length < TOTAL ? ' <span class="miss">(waiting: ' + esc(missing.join(', ')) + ')</span>' : '') +
        ' · ' + (st.rehearsal ? 'REHEARSAL' : 'LIVE CEREMONY') + ' · ' + esc(SESSION);
      $('#btnReh').textContent = st.rehearsal ? 'Rehearsal: ON' : 'Rehearsal: OFF';
      $('#btnReh').classList.toggle('on', !!st.rehearsal);
      }

      // first-time open of the session (host key required)
      if (st.loaded && st.connected && !st.run && hostKey && !initTried) {
        initTried = true;
        newRun(true).catch(function (e) { toast(e.code === 'PERMISSION_DENIED' ? 'Host key rejected. Check the key in the URL and in database.rules.json.' : 'Could not open ceremony: ' + e.message); initTried = false; });
      }
      // run changed (reset) while a sequence was showing: restore everything
      if (seqRun && seqRun !== st.run) cancelSequence();
      proposeCut(st, render);
      if (cutConfirmed(st) && seqRun !== st.run) startSequence(st.run, st.cut.at);
    }

    function newRun(rehearsal) {
      var run = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      return B.set(BASE + '/control', { run: run, rehearsal: !!rehearsal, k: hostKey + ':' + run });
    }
    function needKey() {
      if (hostKey) return Promise.resolve(true);
      return dialog('Host key required', 'Enter the host key for this ceremony.', 'Continue', true).then(function (v) {
        if (!v) return false; hostKey = String(v).trim(); ss('forte-host-key:' + SESSION, hostKey); return true;
      });
    }
    function hostWrite(rehearsal) {
      return needKey().then(function (ok) {
        if (!ok) return;
        return newRun(rehearsal).then(function () { toast(rehearsal ? 'Ceremony reset · Rehearsal mode' : 'Ceremony reset · LIVE mode'); })
          .catch(function (e) { toast(e.code === 'PERMISSION_DENIED' ? 'Host key rejected.' : 'Reset failed: ' + e.message); if (e.code === 'PERMISSION_DENIED') { hostKey = ''; ss('forte-host-key:' + SESSION, ''); } });
      });
    }
    if (hostKey) {
    $('#btnReset').onclick = function () {
      dialog('Reset the ribbon-cutting ceremony?', 'All five participants will return to WAITING and the ribbon will be restored.', 'Reset ceremony').then(function (ok) { if (ok) hostWrite(st.rehearsal); });
    };
    $('#btnReh').onclick = function () {
      var to = !st.rehearsal;
      dialog(to ? 'Switch to REHEARSAL mode?' : 'Switch to the LIVE ceremony?',
        (to ? 'A REHEARSAL indicator will be shown. ' : 'The REHEARSAL indicator will be removed. ') + 'The ceremony is reset and all five participants return to WAITING.',
        to ? 'Start rehearsal' : 'Go to live ceremony').then(function (ok) { if (ok) hostWrite(to); });
    };
    $('#btnFs').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {});
    };
    document.addEventListener('fullscreenchange', function () { $('#btnFs').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; setTimeout(fit, 50); });
    }

    // ---------- the one-time ceremony sequence ----------
    function at(ms, fn) { timers.push(setTimeout(fn, Math.max(0, ms))); }
    function showNum(n) {
      var el = $('#cdnum'); el.textContent = n;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    function startSequence(run, cutAt) {
      seqRun = run;
      timers.forEach(clearTimeout); timers = [];
      var el = B.serverNow() - cutAt;
      var s = stage.classList;
      s.add('locked');
      if (el >= TL.live) {                 // host refreshed after the cut → final screen
        s.add('seq-split', 'seq-live', 'instant');
        fx.rain(true);
        return;
      }
      if (el >= TL.cut) {                  // refreshed during the cut → ribbon already cut
        s.add('seq-split', 'instant');
        at(80, function () { s.remove('instant'); });
        if (SYS && el >= TL.sys) s.add('seq-sys');
        else if (SYS) at(TL.sys - el, function () { s.add('seq-sys'); });
        at(TL.live - el, function () { s.add('seq-live'); fx.confetti(90); fx.rain(true); });
        return;
      }
      s.add('seq-lock');
      countNums().forEach(function (x, i) {
        at(x[1] - el, function () { if (i === 0) s.add('seq-count'); showNum(x[0]); });
      });
      at(TL.cut - el, function () { s.add('seq-cut'); });
      at(TL.close - el, function () { s.add('seq-close'); });
      at(TL.split - el, function () { s.add('seq-split'); fx.sparks(CUT_X, 534); fx.confetti(170); });
      if (SYS) at(TL.sys - el, function () { s.add('seq-sys'); fx.confetti(60); });
      at(TL.live - el, function () { s.add('seq-live'); fx.rain(true); });
    }
    function cancelSequence() {
      timers.forEach(clearTimeout); timers = [];
      seqRun = null;
      stage.classList.add('instant');
      ['locked', 'seq-lock', 'seq-count', 'seq-cut', 'seq-close', 'seq-split', 'seq-sys', 'seq-live'].forEach(function (c) { stage.classList.remove(c); });
      $('#cdnum').textContent = '';
      fx.clear();
      setTimeout(function () { stage.classList.remove('instant'); }, 80);
    }
  }

  // Receding gold posts behind the ribbon, shrinking toward a central vanishing point.
  // One gold stanchion, drawn around x = 0 with its base on y = 262. Used at full size for the
  // ribbon posts and scaled down for the receding ones. ids: gradient / knob-gradient / blur filter.
  function poleSVG(gp, gk, blur) {
    function ring(y) {
      return '<rect x="-11" y="' + y + '" width="22" height="9" rx="4.5" fill="url(#' + gp + ')"/>' +
        '<rect x="-11" y="' + (y + 7) + '" width="22" height="2" rx="1" fill="#3E2E12" opacity=".45"/>';
    }
    return '<ellipse cx="9" cy="266" rx="40" ry="7" fill="#00304A" opacity=".30" filter="url(#' + blur + ')"/>' +
      '<ellipse cx="0" cy="264" rx="31" ry="6.5" fill="url(#' + gp + ')"/>' +
      '<path d="M-26 262 Q-20 241 -7 233 L7 233 Q20 241 26 262 Q0 268 -26 262 Z" fill="url(#' + gp + ')"/>' +
      '<ellipse cx="0" cy="233" rx="7" ry="2.4" fill="#FFF3CF" opacity=".55"/>' +
      '<rect x="-7" y="76" width="14" height="158" fill="url(#' + gp + ')"/>' +
      '<rect x="-3.5" y="80" width="2.4" height="146" rx="1.2" fill="#fff" opacity=".5"/>' +
      ring(92) + ring(176) + ring(226) +
      '<rect x="-5" y="70" width="10" height="10" fill="url(#' + gp + ')"/>' +
      '<circle cx="0" cy="60" r="17" fill="url(#' + gk + ')"/>' +
      '<ellipse cx="-6" cy="53" rx="5.5" ry="3.6" fill="#fff" opacity=".85"/>';
  }

  function tunnelSVG() {
    var VX = 960, HY = 0, HALF = 810, N = 9;
    function kOf(i) { return 1 / (1 + 0.4 * i); }
    function X(side, k) { return VX + side * HALF * k; }
    function Y(y1, k) { return HY + (y1 - HY) * k; }
    function f(n) { return Math.round(n * 10) / 10; }
    var defs =
      '<linearGradient id="tpost" x1="0" x2="1"><stop offset="0" stop-color="#5A4420"/><stop offset=".12" stop-color="#A88B47"/><stop offset=".30" stop-color="#F3E2A8"/><stop offset=".42" stop-color="#FFF6D6"/><stop offset=".56" stop-color="#E0C275"/><stop offset=".80" stop-color="#A88B47"/><stop offset="1" stop-color="#57401E"/></linearGradient>' +
      '<radialGradient id="tknob" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFFBEA"/><stop offset=".25" stop-color="#F1DA92"/><stop offset=".6" stop-color="#C6A254"/><stop offset="1" stop-color="#5C4420"/></radialGradient>' +
      '<filter id="tblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>';
    function post(side, k) {
      var x = X(side, k), base = Y(262, k), top = Y(70, k);
      return '<ellipse cx="' + f(x + side * -2 * k) + '" cy="' + f(base + 2 * k) + '" rx="' + f(28 * k) + '" ry="' + f(6 * k) + '" fill="#000" opacity=".45" filter="url(#tblur)"/>' +
        '<ellipse cx="' + f(x) + '" cy="' + f(base) + '" rx="' + f(28 * k) + '" ry="' + f(6 * k) + '" fill="url(#tpost)" opacity=".9"/>' +
        '<rect x="' + f(x - 7 * k) + '" y="' + f(top) + '" width="' + f(14 * k) + '" height="' + f(base - top) + '" rx="' + f(4 * k) + '" fill="url(#tpost)"/>' +
        '<circle cx="' + f(x) + '" cy="' + f(Y(62, k)) + '" r="' + f(16 * k) + '" fill="url(#tknob)"/>';
    }
    var out = '';
    for (var i = N; i >= 1; i--) {
      var k = kOf(i);
      out += '<g opacity="' + f(0.3 + 0.7 * Math.pow(k, 1.2)) + '">';
      [-1, 1].forEach(function (side) { out += post(side, k); });
      out += '</g>';
    }
    return '<svg class="tunnel" viewBox="0 0 1920 280" width="1920" height="280" aria-hidden="true"><defs>' + defs + '</defs>' + out + '</svg>';
  }

  function f1(n) { return Math.round(n); }
  function ribbonSVG() {
    // Ribbon between two posts; one intact piece until the cut, then two halves.
    var grad =
      '<linearGradient id="satin" x1="0" y1="84" x2="0" y2="168" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#8E0029"/><stop offset=".16" stop-color="#D1003D"/>' +
        '<stop offset=".40" stop-color="#FF4F7E"/><stop offset=".55" stop-color="#EB0045"/>' +
        '<stop offset=".82" stop-color="#C2003A"/><stop offset="1" stop-color="#7A0023"/></linearGradient>' +
      '<linearGradient id="post" x1="0" x2="1"><stop offset="0" stop-color="#5A4420"/><stop offset=".12" stop-color="#A88B47"/><stop offset=".30" stop-color="#F3E2A8"/><stop offset=".42" stop-color="#FFF6D6"/><stop offset=".56" stop-color="#E0C275"/><stop offset=".80" stop-color="#A88B47"/><stop offset="1" stop-color="#57401E"/></linearGradient>' +
      '<radialGradient id="knob" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFFBEA"/><stop offset=".25" stop-color="#F1DA92"/><stop offset=".6" stop-color="#C6A254"/><stop offset="1" stop-color="#5C4420"/></radialGradient>' +
      '<filter id="pblur" x="-30%" y="-150%" width="160%" height="400%"><feGaussianBlur stdDeviation="6"/></filter>' +
      '<filter id="rshadow" x="-5%" y="-40%" width="110%" height="200%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#000" flood-opacity=".45"/></filter>';
    var sheen = 'fill="none" stroke="#FFFFFF" stroke-opacity=".28" stroke-width="1.6"';
    var edge = 'fill="none" stroke="#5A0019" stroke-opacity=".6" stroke-width="1.2"';
    function post(x) {
      return '<g class="post" transform="translate(' + x + ' 0)">' + poleSVG('post', 'knob', 'pblur') + '</g>';
    }
    // Wording on the ribbon: "Forte – Live with confidence", with the dash at the cut point (x = 960).
    // Each half draws the whole line clipped to its own side, so the dash is cut in two.
    var tstyle = 'font-family="Poppins, Arial, sans-serif" font-size="32" font-weight="600" letter-spacing="1.5" fill="#fff" stroke="#5A0019" stroke-opacity=".35" stroke-width=".6"';
    function words(clip) {
      return '<g' + (clip ? ' clip-path="url(#' + clip + ')"' : '') + '>' +
        '<text x="' + (CUT_X - 24) + '" y="144" text-anchor="end" ' + tstyle.replace('font-weight="600"', 'font-weight="700"') + '>Forte</text>' +
        '<text x="' + CUT_X + '" y="144" text-anchor="middle" ' + tstyle + '>–</text>' +
        '<text x="' + (CUT_X + 24) + '" y="144" text-anchor="start" ' + tstyle + '>Live with confidence</text></g>';
    }
    var full =
      '<g class="rb-full" filter="url(#rshadow)">' +
        '<path d="M150 84 Q960 120 1770 84 L1770 148 Q960 184 150 148 Z" fill="url(#satin)"/>' +
        '<path d="M150 90 Q960 126 1770 90" ' + sheen + '/><path d="M150 142 Q960 178 1770 142" ' + edge + '/>' +
        words() +
      '</g>';
    var cl = CUT_X - 8, cr = CUT_X + 8;   // the cut's slanted edge: bottom / top
    var left =
      '<g class="rb-left" filter="url(#rshadow)">' +
        '<path d="M150 84 Q' + f1((150 + cr) / 2) + ' 102 ' + cr + ' 102 L' + cl + ' 166 Q' + f1((150 + cl) / 2) + ' 166 150 148 Z" fill="url(#satin)"/>' +
        '<path d="M150 90 Q' + f1((150 + cr) / 2) + ' 108 ' + (cr - 2) + ' 108" ' + sheen + '/><path d="M150 142 Q' + f1((150 + cl) / 2) + ' 160 ' + (cl + 2) + ' 160" ' + edge + '/>' +
        words('clipL') +
      '</g>';
    var right =
      '<g class="rb-right" filter="url(#rshadow)">' +
        '<path d="M' + cr + ' 102 Q' + f1((cr + 1770) / 2) + ' 102 1770 84 L1770 148 Q' + f1((cl + 1770) / 2) + ' 166 ' + cl + ' 166 Z" fill="url(#satin)"/>' +
        '<path d="M' + (cr - 2) + ' 108 Q' + f1((cr + 1770) / 2) + ' 108 1770 90" ' + sheen + '/><path d="M' + (cl + 2) + ' 160 Q' + f1((cl + 1770) / 2) + ' 160 1770 142" ' + edge + '/>' +
        words('clipR') +
      '</g>';
    var knots =
      '<g class="knots"><rect x="132" y="78" width="36" height="76" rx="10" fill="url(#satin)"/><rect x="1752" y="78" width="36" height="76" rx="10" fill="url(#satin)"/></g>';
    return '<svg class="ribbon" viewBox="0 0 1920 280" width="1920" height="280" aria-label="Ceremonial ribbon">' +
      '<defs>' + grad + '<clipPath id="clipL"><rect x="0" y="0" width="' + CUT_X + '" height="280"/></clipPath><clipPath id="clipR"><rect x="' + CUT_X + '" y="0" width="1920" height="280"/></clipPath></defs>' + post(150) + post(1770) + full + left + right + knots + '</svg>';
  }

  function scissorsSVG() {
    var blade =
      '<path d="M-8 -4 C 6 -10 13 12 10 52 L 3 232 Q 0 242 -3 232 L -11 24 Z" fill="url(#steel)" stroke="#6F757D" stroke-width="1"/>' +
      '<path d="M-2 10 L 1 226" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1.4"/>' +
      '<path d="M4 -6 C 16 -40 30 -80 34 -104" fill="none" stroke="url(#gold)" stroke-width="13" stroke-linecap="round"/>' +
      '<ellipse cx="44" cy="-140" rx="28" ry="38" fill="none" stroke="url(#gold)" stroke-width="11"/>';
    return '<svg class="scissors" style="left:' + (CUT_X - 160) + 'px" viewBox="0 0 320 460" width="320" height="460" aria-hidden="true">' +
      '<defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#8C939B"/><stop offset=".45" stop-color="#F4F6F8"/><stop offset=".7" stop-color="#C3C8CE"/><stop offset="1" stop-color="#7B8189"/></linearGradient>' +
      '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1DC9E"/><stop offset=".5" stop-color="#C39A45"/><stop offset="1" stop-color="#8A6A2A"/></linearGradient></defs>' +
      '<g class="bl bl-a"><g transform="translate(160 200)">' + blade + '</g></g>' +
      '<g class="bl bl-b"><g transform="translate(160 200) scale(-1,1)">' + blade + '</g></g>' +
      '<circle cx="160" cy="200" r="10" fill="url(#gold)"/><circle cx="160" cy="200" r="4" fill="#F4F6F8"/></svg>';
  }

  function sysHTML() {
    if (!SYS) return '';
    return '<section class="sysreveal" aria-hidden="true"><div class="sys-backdrop"></div>' +
      '<div class="sys-win"><div class="sys-bar"><i></i><i></i><i></i>' +
        '<span class="sys-title">' + esc(C.systemScreenshotLabel || T.system) + '</span><em class="sys-live">LIVE</em></div>' +
        '<div class="sys-shot"><img src="' + esc(C.systemScreenshotUrl) + '" alt="" onerror="document.getElementById(\'stage\').classList.add(\'no-sys\')"><span class="sys-shine"></span></div>' +
      '</div></section>';
  }
  function liveHTML() {
    return '<section class="live" id="live">' +
      '<div class="bg-dots"></div><div class="bg-glow"></div>' +
      '<div class="live-logo">' + logoHTML('live-logo-in') + '</div>' +
      '<svg class="check" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">' +
        '<circle class="ck-ring" cx="100" cy="100" r="86" fill="none" stroke="#EB0045" stroke-width="7"/>' +
        '<circle class="ck-halo" cx="100" cy="100" r="86" fill="none" stroke="#D6B56A" stroke-width="1.5"/>' +
        '<path class="ck-mark" d="M60 104 L88 131 L143 73" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div class="live-sys">' + esc(T.system) + '</div>' +
      '<div class="live-now">IS NOW LIVE</div>' +
      '<div class="date-row live-date"><span class="rule"></span><span>' + esc(T.date) + '</span><span class="rule"></span></div>' +
      '<p class="live-l1">' + esc(T.liveLine1) + '</p>' +
      '<p class="live-l2">' + esc(T.liveLine2) + '</p>' +
      '<div class="live-motto">' + esc(T.liveMotto) + '</div>' +
      '<div class="live-co">' + esc(C.companyName || '') + '</div>' +
    '</section>';
  }

  // ---------- modal + toast ----------
  var modalOpen = false;
  function modalHTML() {
    return '<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle"><div class="mbox">' +
      '<h3 id="mTitle"></h3><p id="mText"></p><input id="mInput" type="password" autocomplete="off" aria-label="Host key">' +
      '<div class="mbtns"><button type="button" id="mCancel" class="m-cancel">Cancel</button><button type="button" id="mOk" class="m-ok">OK</button></div>' +
      '</div></div><div class="toast" id="toast"></div>';
  }
  function dialog(title, text, okLabel, withInput) {
    return new Promise(function (resolve) {
      var m = $('#modal'); modalOpen = true; document.body.classList.remove('idle');
      $('#mTitle').textContent = title; $('#mText').textContent = text; $('#mOk').textContent = okLabel || 'OK';
      var inp = $('#mInput'); inp.value = ''; inp.style.display = withInput ? 'block' : 'none';
      m.classList.add('show');
      setTimeout(function () { (withInput ? inp : $('#mCancel')).focus(); }, 30);
      function done(v) { m.classList.remove('show'); modalOpen = false; $('#mOk').onclick = $('#mCancel').onclick = null; document.removeEventListener('keydown', onKey, true); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') done(false); if (e.key === 'Enter' && withInput) done(inp.value); }
      document.addEventListener('keydown', onKey, true);
      $('#mOk').onclick = function () { done(withInput ? inp.value : true); };
      $('#mCancel').onclick = function () { done(false); };
    });
  }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  // ---------- sparks + confetti (single canvas, restrained palette) ----------
  function FX(canvas) {
    var ctx = canvas.getContext('2d'), parts = [], raf = null, rainOn = false, lastRain = 0;
    var COLORS = ['#EB0045', '#FFFFFF', '#D6B56A', '#C9CDD3', '#B3003A', '#F2E3B8'];
    function loop() {
      ctx.clearRect(0, 0, 1920, 1080);
      var now = performance.now();
      if (rainOn && now - lastRain > 110) { lastRain = now; drop(now); }
      parts = parts.filter(function (p) { return now - p.t0 < p.life; });
      parts.forEach(function (p) {
        var age = (now - p.t0) / p.life;
        p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        var a = age > 0.75 ? (1 - age) / 0.25 : 1;
        ctx.save(); ctx.globalAlpha = Math.max(0, a) * p.alpha;
        if (p.kind === 'spark') {
          ctx.strokeStyle = p.c; ctx.lineWidth = 2.2; ctx.shadowColor = p.c; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3.2, p.y - p.vy * 3.2); ctx.stroke();
        } else if (p.kind === 'star') {
          ctx.translate(p.x + Math.sin(now / 700 + p.ph) * 18, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
          ctx.beginPath();
          for (var k = 0; k < 10; k++) {
            var rr = k % 2 ? p.w * 0.22 : p.w * 0.55, aa = k * Math.PI / 5 - Math.PI / 2;
            ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.translate(p.x + Math.sin(now / 420 + p.ph) * 14, p.y); ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(now / 260 + p.ph)); ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      });
      raf = (parts.length || rainOn) ? requestAnimationFrame(loop) : null;
      if (!raf) ctx.clearRect(0, 0, 1920, 1080);
    }
    // one gentle falling piece (star or confetti) for the endless final-screen rain
    function drop(t0) {
      var star = Math.random() < 0.35;
      parts.push({ kind: star ? 'star' : 'c', x: Math.random() * 1920, y: -30, vx: (Math.random() - 0.5) * 0.8, vy: 1.4 + Math.random() * 1.8,
        g: 0.004, drag: 0.999, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (star ? 0.03 : 0.08),
        w: star ? 14 + Math.random() * 14 : 7 + Math.random() * 8, h: 4 + Math.random() * 5,
        c: star ? (Math.random() < 0.6 ? '#F2E3B8' : '#D6B56A') : COLORS[(Math.random() * COLORS.length) | 0],
        life: 9500, t0: t0, ph: Math.random() * 6.28, alpha: star ? 0.9 : 0.95 });
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    return {
      sparks: function (x, y) {
        var t0 = performance.now();
        for (var i = 0; i < 34; i++) {
          var ang = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 9;
          parts.push({ kind: 'spark', x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0.12, drag: 0.94, rot: 0, vr: 0,
            c: i % 3 ? '#F2DDA0' : '#FFFFFF', life: 650 + Math.random() * 450, t0: t0, alpha: 1 });
        }
        kick();
      },
      confetti: function (n) {
        var t0 = performance.now();
        for (var i = 0; i < n; i++) {
          parts.push({ kind: 'c', x: Math.random() * 1920, y: -40 - Math.random() * 700, vx: (Math.random() - 0.5) * 1.2, vy: 2.2 + Math.random() * 2.4,
            g: 0.012, drag: 0.996, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.08, w: 7 + Math.random() * 8, h: 4 + Math.random() * 5,
            c: COLORS[i % COLORS.length], life: 5200 + Math.random() * 2200, t0: t0 + 0, ph: Math.random() * 6.28, alpha: 0.95 });
        }
        kick();
      },
      rain: function (on) { rainOn = !!on; if (on) kick(); },
      clear: function () { rainOn = false; parts = []; ctx.clearRect(0, 0, 1920, 1080); }
    };
  }

  // =====================================================================
  // PARTICIPANT
  // =====================================================================
  function participant() {
    document.body.className = 'is-participant theme-' + THEME;
    var name = nameOf(PID);
    document.title = name + ' · Ribbon cutting';
    root.innerHTML =
      '<div class="p-page" id="ppage"><div class="p-card" id="pcard">' +
        '<div class="p-head">' + logoHTML() + '<span class="rehearsal-badge">REHEARSAL</span></div>' +
        '<div class="p-eyebrow">CMS – MEDICAL CLAIMS GO-LIVE</div>' +
        '<div class="p-name">' + esc(name) + '</div>' +
        '<div class="p-body" id="pbody">' +
          '<div class="v-wait">' +
            '<div class="p-press">PRESS</div>' +
            '<div class="keys"><kbd class="k-shift" id="kShift">SHIFT</kbd><span class="plus">+</span><kbd class="k-v" id="kV">V</kbd></div>' +
            '<div class="p-to">TO CUT THE RIBBON</div>' +
          '</div>' +
          '<div class="v-ready">' +
            '<svg class="p-check" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#1E9E62" stroke-width="6"/><path d="M36 62 L53 78 L86 44" fill="none" stroke="#1E9E62" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<div class="p-ready">READY ✓</div>' +
            '<p>Your ribbon-cutting signal has been received.</p><p class="muted" id="pwaitmsg">Waiting for the other participants...</p>' +
          '</div>' +
          '<div class="v-seq"><div class="p-seqmsg" id="pseqmsg">All participants are ready</div><div class="p-seqnum" id="pseqnum"></div></div>' +
          '<div class="v-live">' +
            '<svg class="p-check red" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#EB0045" stroke-width="6"/><path d="M36 62 L53 78 L86 44" fill="none" stroke="#EB0045" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<div class="p-livet">' + esc(T.system) + '<br>IS NOW LIVE</div><p>Thank you for cutting the ribbon.</p>' +
          '</div>' +
          '<div class="v-closed"><div class="p-press small">The ceremony is not open yet</div><p class="muted">Please keep this page open. It will update automatically.</p></div>' +
        '</div>' +
        '<div class="p-status" id="pstatus">STATUS: <b>WAITING</b></div>' +
        '<div class="p-foot"><span id="pconn"><i class="dot"></i>Connecting…</span><span>Session ' + esc(SESSION) + '</span></div>' +
      '</div>' +
      '<div class="focus-hint" id="fhint">Click anywhere on this page so it can detect your keyboard</div>' +
      '<div class="p-msg" id="pmsg"></div></div>';
    fixLogoFallbacks();

    var connId = 'c' + Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, '') + 'x';
    B.presence(BASE + '/presence/' + PID + '/' + connId);

    var sending = null, sendingAt = 0;   // run id a write is in flight for
    var view = '';
    var seqFor = null, seqTimers = [];
    var st = null;
    st = watchCeremony(render);

    var redirectT = null;
    function goHost() { location.replace(location.pathname + '?session=' + encodeURIComponent(SESSION) + '&mode=host'); }
    function setView(v, statusHTML) {
      if (view !== v) { view = v; $('#pcard').setAttribute('data-view', v); }
      $('#pstatus').innerHTML = statusHTML;
    }
    function render() {
      if (!st) return;
      $('#pconn').innerHTML = st.connected ? '<i class="dot ok"></i>Connected' : '<i class="dot bad"></i>Reconnecting…';
      $('#ppage').classList.toggle('rehearsal', !!st.rehearsal);
      if (!st.loaded) return setView('closed', 'STATUS: <b>CONNECTING</b>');
      if (!st.run) return setView('closed', 'STATUS: <b>NOT OPEN</b>');
      if (seqFor && seqFor !== st.run) { seqTimers.forEach(clearTimeout); seqTimers = []; seqFor = null; }
      proposeCut(st, render);
      if (cutConfirmed(st)) {
        // the countdown belongs on the host screen: keep showing READY while our own
        // redirect is pending, otherwise (refresh, late open) go there straight away
        if (sending === st.run || redirectT) return setView('ready', 'STATUS: <b class="ok">READY ✓</b>');
        return goHost();
      }
      if (sending === st.run) return setView('wait', 'STATUS: <b>SENDING…</b>');
      if (st.acts[PID]) return setView('ready', 'STATUS: <b class="ok">READY ✓</b>');
      setView('wait', 'STATUS: <b>WAITING</b>');
    }
    function runSeq(cutAt) {
      seqFor = st.run;
      var el = B.serverNow() - cutAt;
      function atT(ms, fn) { seqTimers.push(setTimeout(fn, Math.max(0, ms - el))); }
      if (el >= TL.split) { setView('live', 'STATUS: <b class="ok">RIBBON CUT ✓</b>'); return; }
      setView('seq', 'STATUS: <b class="ok">' + TOTAL + ' / ' + TOTAL + ' READY</b>');
      $('#pseqmsg').textContent = 'All participants are ready'; $('#pseqnum').textContent = '';
      countNums().concat([['CUT!', TL.cut]]).forEach(function (x) {
        atT(x[1], function () { var n = $('#pseqnum'); n.textContent = x[0]; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); });
      });
      atT(TL.split + 600, function () { setView('live', 'STATUS: <b class="ok">RIBBON CUT ✓</b>'); });
    }

    function activate() {
      if (!st.loaded || !st.run || st.cut || st.acts[PID]) return;
      // a write is already in flight; allow a manual retry only if it is taking unusually long
      if (sending && Date.now() - sendingAt < 6000) return;
      var run = st.run;
      sending = run; sendingAt = Date.now(); render();
      B.set(BASE + '/activations/' + run + '/' + PID, { at: B.TS }).then(function () {
        if (!redirectT) redirectT = setTimeout(goHost, REDIRECT_DELAY);
        sending = null; render();
        // hand over to the shared host screen, where this participant now shows READY
        flash('Success! Redirecting you to the host screen…', true);
        // (after a short pause so the participant sees their READY status first)
      }).catch(function (e) {
        sending = null;
        if (!st.acts[PID]) flash(e.code === 'PERMISSION_DENIED' ? 'Signal not accepted — the ceremony was reset or is closed. Please wait for the MC.' : 'Could not send. Check your connection and press SHIFT + V again.');
        render();
      });
    }
    var msgT;
    function flash(m, ok) { var el = $('#pmsg'); el.textContent = m; el.classList.toggle('ok', !!ok); el.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(function () { el.classList.remove('show'); }, 6000); }

    // ----- exact SHIFT + V detection -----
    // Activates only while Shift and V are held together (either order),
    // with no Ctrl / Alt / Windows / Cmd key. Shift alone, V alone or any
    // other key never activates. Auto-repeat is ignored.
    var held = { shift: false, v: false };
    function isV(e) { return e.code === 'KeyV' || (e.key && e.key.length === 1 && e.key.toLowerCase() === 'v'); }
    function isShift(e) { return e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight'; }
    function paintKeys() { $('#kShift').classList.toggle('down', held.shift); $('#kV').classList.toggle('down', held.v); }
    document.addEventListener('keydown', function (e) {
      var fresh = !e.repeat;
      if (isShift(e)) held.shift = true;
      else if (isV(e)) { held.v = true; held.shift = e.shiftKey; e.preventDefault(); }
      else return;
      paintKeys();
      if (fresh && held.shift && held.v && !e.ctrlKey && !e.altKey && !e.metaKey) activate();
    }, true);
    document.addEventListener('keyup', function (e) {
      if (isShift(e)) held.shift = false;
      if (isV(e)) held.v = false;
      paintKeys();
    }, true);
    function releaseAll() { held.shift = held.v = false; paintKeys(); }
    window.addEventListener('blur', releaseAll);

    // Remind the participant to click into the page if it lost keyboard focus.
    function focusCheck() { $('#fhint').classList.toggle('show', !document.hasFocus() && (view === 'wait')); }
    window.addEventListener('focus', focusCheck); window.addEventListener('blur', focusCheck);
    setInterval(focusCheck, 700);
  }

  // =====================================================================
  // LINK SHEET  (index.html with no participant / host mode)
  // =====================================================================
  function links() {
    document.body.className = 'is-links';
    var base = location.origin + location.pathname;
    var key = Q.get('key') || '';
    function row(label, url, note) {
      return '<tr><th>' + esc(label) + '</th><td><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>' + (note ? '<div class="muted">' + note + '</div>' : '') + '</td>' +
        '<td><button type="button" class="copy" data-u="' + esc(url) + '">Copy</button></td></tr>';
    }
    var hostUrl = base + '?session=' + SESSION + '&mode=host' + (key ? '&key=' + encodeURIComponent(key) : '&key=YOUR-HOST-KEY');
    var rows = row('HOST SCREEN', hostUrl, 'Keep private. Share this screen in Microsoft Teams.') +
      PEOPLE.map(function (p) { return row(p.name, base + '?session=' + SESSION + '&participant=' + p.id); }).join('');
    root.innerHTML = '<div class="links-page"><div class="links-card">' + logoHTML() +
      '<div class="p-eyebrow">CMS – MEDICAL CLAIMS GO-LIVE · CEREMONY LINKS</div>' +
      '<h2>Digital ribbon cutting — ' + esc(T.date) + '</h2>' +
      '<p class="muted">Send each representative only their own link. Session: <b>' + esc(SESSION) + '</b></p>' +
      '<table class="links">' + rows + '</table></div></div>';
    fixLogoFallbacks();
    $all('.copy').forEach(function (b) {
      b.onclick = function () {
        var u = b.getAttribute('data-u');
        (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); }, function () { prompt('Copy this link:', u); });
      };
    });
  }

  // ---------- boot ----------
  var miss = configMissing();
  if (miss && !(MODE === 'links' || (!PID && MODE !== 'host'))) { setupScreen(miss); return; }
  if (MODE === 'host' || PID) {
    try { B.init(C.firebase); } catch (e) { setupScreen('Firebase could not start: ' + e.message); return; }
  }
  if (MODE === 'host') host();
  else if (PID) {
    if (IDS.indexOf(PID) < 0) setupScreen('Unknown participant "' + PID + '". Please use the personal link you were sent.');
    else participant();
  } else links();
})();
