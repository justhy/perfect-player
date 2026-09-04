/* ============================================================
   Perfect Player — 专属特权（God Mode）
   ------------------------------------------------------------
   通过隐藏入口输入口令解锁一个特权面板，玩家可逐项勾选要开哪些选项。
   所有特权默认关闭；口令摘要与特权定义全部外置在 assets/data/god-mode.json。

   解锁方式（两条隐藏通道，普通玩家看不到入口）：
     1) 主菜单 LOGO「BUILD-A-PLAYER」2 秒内连点 5 次
     2) 访问 URL 带 ?pp 或 #unlock
   配置里 unlock.hash 为空串时，两条入口全部禁用（线上应急开关）。
   角色名名单（cfg.names）仅作备用通道，默认为空。

   本脚本必须在游戏主内联脚本之前加载（nba-perfect-player.html:2307），
   这样内联脚本、hupu-extensions.js、enhancements.js 都能使用 window.PP_GOD。

   业务侧统一调用方式（防御式，配置未就绪时恒为 false）：
     window.PP_GOD && window.PP_GOD.isOn('infinite_reroll')
   ============================================================ */
(function () {
  'use strict';

  var CONFIG_URL = 'assets/data/god-mode.json';
  var STORE_KEY = 'pp_godmode_v1';
  var PANEL_ID = 'god-mode-modal';
  var BADGE_ID = 'god-mode-badge';
  var HINT_ID = 'character-god-hint';
  var DIALOG_ID = 'gm-unlock-modal';

  // 代码里真实存在的注入点。用于启动自检：配置里若出现未知 id，或某个
  // 已知 id 被误删，都会在控制台给出提示，避免"改了配置却静默失效"。
  var KNOWN_IDS = [
    'infinite_reroll', 'always_historical', 'no_team_swap', 'infinite_team_reroll', 'no_pos_penalty',
    'break_99', 'free_training', 'rich_points', 'no_train_cap',
    'infinite_legacy', 'legacy_no_max',
    'no_decline', 'no_retire', 'no_injury', 'free_contract',
    'lock_first_pick', 'all_offers', 'no_trade_waive', 'auto_win', 'hot_hand'
  ];

  // 不显示入口徽章的界面：主页与角色创建页（创建页只显示输入提示）
  var HIDE_BADGE_SCREENS = ['screen-menu', 'screen-character'];

  var cfg = null;      // 解析后的配置，null 表示不可用
  var ready = false;   // 加载流程是否已结束（成功或失败都置 true）
  var store = {};
  var _unlocked = false;
  var _elig = { name: null, value: false };
  var _syncQueued = false;
  loadStore(); // 依赖函数声明提升，填充 store 与 _unlocked

  /* ---------------- 配置加载 ---------------- */

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.enabled === false) return null; // 总开关：线上紧急关闭用
    var names = [];
    if (Array.isArray(raw.names)) {
      raw.names.forEach(function (n) { if (typeof n === 'string' && n) names.push(n); });
    }
    // 注意：names 允许为空——口令解锁是主通道，空名单不能再让整个配置失效。
    var groups = [];
    if (Array.isArray(raw.groups)) {
      raw.groups.forEach(function (g) {
        if (g && typeof g.id === 'string') {
          groups.push({
            id: g.id,
            name: typeof g.name === 'string' ? g.name : g.id,
            desc: typeof g.desc === 'string' ? g.desc : ''
          });
        }
      });
    }
    var cheats = [];
    if (Array.isArray(raw.cheats)) {
      raw.cheats.forEach(function (c) {
        if (!c || typeof c.id !== 'string' || !c.id) return;
        cheats.push({
          id: c.id,
          group: typeof c.group === 'string' ? c.group : 'build',
          name: typeof c.name === 'string' ? c.name : c.id,
          desc: typeof c.desc === 'string' ? c.desc : '',
          default: !!c.default
        });
      });
    }
    // 口令解锁配置：hash 为空串时 unlock 为 null，两条隐藏入口全部禁用（线上应急开关）
    var unlock = null;
    if (raw.unlock && typeof raw.unlock === 'object' &&
        typeof raw.unlock.hash === 'string' && raw.unlock.hash) {
      unlock = {
        salt: typeof raw.unlock.salt === 'string' ? raw.unlock.salt : '',
        hash: String(raw.unlock.hash).toLowerCase(),
        params: Array.isArray(raw.unlock.params) && raw.unlock.params.length
          ? raw.unlock.params.slice() : ['pp'],
        tapTarget: typeof raw.unlock.tapTarget === 'string' ? raw.unlock.tapTarget : '.nav-logo',
        tapCount: Math.max(2, raw.unlock.tapCount | 0 || 5),
        tapWindowMs: Math.max(500, raw.unlock.tapWindowMs | 0 || 2000),
        maxAttempts: raw.unlock.maxAttempts | 0 || 5,
        cooldownMs: raw.unlock.cooldownMs | 0 || 30000
      };
    }
    return {
      caseSensitive: raw.caseSensitive !== false,
      names: names,
      groups: groups,
      cheats: cheats,
      unlock: unlock
    };
  }

  function selfCheck() {
    if (!cfg) return;
    var configured = {};
    cfg.cheats.forEach(function (c) { configured[c.id] = true; });
    var unknown = cfg.cheats
      .map(function (c) { return c.id; })
      .filter(function (id) { return KNOWN_IDS.indexOf(id) < 0; });
    var missing = KNOWN_IDS.filter(function (id) { return !configured[id]; });
    if (unknown.length) {
      console.warn('[god-mode] 配置中存在未知的特权 id（对应注入点不存在，将静默无效）:', unknown.join(', '));
    }
    if (missing.length) {
      console.warn('[god-mode] 以下注入点在配置里缺失，面板不会显示它们:', missing.join(', '));
    }
  }

  function boot() {
    if (typeof fetch !== 'function') { ready = true; return; }
    try {
      fetch(CONFIG_URL, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          cfg = normalize(j);
          if (cfg) selfCheck();
        })
        .catch(function () { cfg = null; })
        .then(function () { ready = true; refreshUI(); afterReady(); });
    } catch (e) {
      cfg = null;
      ready = true;
    }
  }

  /* ---------------- 存储 ---------------- */

  function loadStore() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (o && typeof o === 'object') {
        // 兼容旧存档：早期版本只有 { version, cheats }，没有 unlocked 字段
        if (o.cheats && typeof o.cheats === 'object') store = o.cheats;
        _unlocked = o.unlocked === true;
      }
    } catch (e) {}
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        version: 1, cheats: store, unlocked: _unlocked
      }));
    } catch (e) {}
  }

  /* ---------------- 判定 ---------------- */

  function currentName() {
    try {
      var p = window.PERFECT_PLAYER_PROFILE;
      if (p && typeof p.name === 'string' && p.name) return p.name;
    } catch (e) {}
    return '';
  }

  function matches(nameStr) {
    if (!ready || !cfg) return false;
    var n = typeof nameStr === 'string' ? nameStr.trim() : '';
    if (!n) return false;
    var names = cfg.names;
    for (var i = 0; i < names.length; i++) {
      if (cfg.caseSensitive) {
        if (names[i] === n) return true;
      } else if (names[i].toLowerCase() === n.toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  // 结果按当前姓名缓存。break_99 等热路径会被高频调用，避免反复做字符串比对。
  function isEligible() {
    if (!ready || !cfg) return false;
    if (_unlocked) return true; // 口令解锁后与角色名无关，直接短路（不进姓名缓存）
    var n = currentName();
    if (_elig.name === n) return _elig.value;
    _elig = { name: n, value: matches(n) };
    return _elig.value;
  }

  function findCheat(id) {
    if (!cfg) return null;
    for (var i = 0; i < cfg.cheats.length; i++) {
      if (cfg.cheats[i].id === id) return cfg.cheats[i];
    }
    return null;
  }

  function isOn(id) {
    if (!isEligible()) return false;
    var v = store[id];
    if (typeof v === 'boolean') return v;
    var def = findCheat(id);
    return def ? !!def.default : false;
  }

  function activeList() {
    if (!cfg) return [];
    return cfg.cheats.filter(function (c) { return isOn(c.id); }).map(function (c) { return c.id; });
  }

  function toggle(id) {
    var next = !isOn(id);
    store[id] = next;
    saveStore();
    renderPanelBody();
    syncBadge();
    return next;
  }

  function reset() {
    if (cfg) cfg.cheats.forEach(function (c) { store[c.id] = false; });
    saveStore();
    renderPanelBody();
    syncBadge();
  }

  /* ---------------- UI：入口徽章 ---------------- */

  function injectStyles() {
    if (document.getElementById('god-mode-style')) return;
    var css =
      '#god-mode-badge{position:fixed;right:calc(70px + env(safe-area-inset-right,0px));' +
      'bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:8800;width:50px;height:50px;' +
      'border-radius:50%;border:none;cursor:pointer;display:none;align-items:center;justify-content:center;' +
      'background:linear-gradient(145deg,#ff8a5c,#ff6b35);color:#fff;font-size:22px;line-height:1;' +
      'box-shadow:0 6px 18px rgba(255,107,53,.42),inset 0 2px 4px rgba(255,255,255,.35);' +
      'transition:transform .15s ease}' +
      '#god-mode-badge.show{display:flex}' +
      '#god-mode-badge:active{transform:scale(.9)}' +
      '#god-mode-badge .gm-badge-ic{line-height:1;pointer-events:none}' +
      '#god-mode-badge .gm-badge-cnt{position:absolute;top:-3px;right:-3px;z-index:1;min-width:18px;height:18px;' +
      'padding:0 4px;box-sizing:border-box;border-radius:999px;background:#d63a3a;color:#fff;' +
      'font-size:11px;font-weight:700;line-height:18px;text-align:center;display:inline-block}' +
      '#god-mode-modal .gm-body{padding:14px;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '.gm-group-title{font-family:var(--font-athletic),"Oswald","Noto Sans SC",sans-serif;font-size:14px;' +
      'letter-spacing:.5px;color:var(--orange,#d85822);margin:16px 0 8px}' +
      '.gm-group-title:first-child{margin-top:0}' +
      '.gm-group-desc{font-size:12px;color:var(--text-muted,#8e8b84);margin:-4px 0 8px}' +
      '.gm-row{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;margin-bottom:8px;' +
      'border:1px solid var(--border,#ccb083);border-radius:10px;background:var(--bg-card,#fffaf0);cursor:pointer}' +
      '.gm-row.on{border-color:var(--gold,#dfa62f);background:var(--orange-bg,rgba(216,88,34,.075))}' +
      '.gm-switch{flex:0 0 38px;height:22px;border-radius:999px;background:#c9bfae;position:relative;' +
      'margin-top:2px;transition:background .18s}' +
      '.gm-row.on .gm-switch{background:var(--gold,#dfa62f)}' +
      '.gm-knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;' +
      'background:#fff;transition:transform .18s}' +
      '.gm-row.on .gm-knob{transform:translateX(16px)}' +
      '.gm-name{font-size:14px;font-weight:600;color:var(--text,#132238);line-height:1.4}' +
      '.gm-desc{font-size:12px;color:var(--text-dim,#5c6674);line-height:1.5;margin-top:3px}' +
      '.gm-hint{margin-top:6px;font-size:12px;color:var(--gold,#dfa62f);font-weight:600}' +
      '#gm-unlock-modal .gm-input{width:100%;height:44px;box-sizing:border-box;padding:0 12px;' +
      'border:2px solid var(--border,#ccb083);border-radius:10px;background:var(--bg-card,#fffaf0);' +
      'color:var(--text,#132238);font-size:16px;outline:none}' +
      '#gm-unlock-modal .gm-input:focus{border-color:var(--orange,#d85822)}' +
      '#gm-unlock-modal .gm-unlock-err{min-height:18px;margin-top:8px;font-size:12px;color:#e63946}' +
      '#gm-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));' +
      'transform:translateX(-50%);z-index:9500;padding:10px 18px;border-radius:999px;' +
      'background:rgba(19,34,56,.92);color:#fff;font-size:13px;letter-spacing:.5px;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.28);animation:gmToastIn .25s ease}';
    var el = document.createElement('style');
    el.id = 'god-mode-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function applyBadgeState(badge, n) {
    var cnt = badge.querySelector('.gm-badge-cnt');
    if (n > 0) {
      if (!cnt) { cnt = document.createElement('span'); cnt.className = 'gm-badge-cnt'; badge.appendChild(cnt); }
      cnt.textContent = n;
      badge.title = '专属特权 · ' + n + ' 项已开启';
      badge.setAttribute('aria-label', '专属特权 · ' + n + ' 项已开启');
    } else {
      if (cnt) cnt.remove();
      badge.title = '打开专属特权面板';
      badge.setAttribute('aria-label', '打开专属特权面板');
    }
  }

  function syncBadge() {
    var badge = document.getElementById(BADGE_ID);
    var visible = isEligible();
    if (visible) {
      var active = activeList();
      var screen = document.querySelector('.screen.active');
      if (screen && HIDE_BADGE_SCREENS.indexOf(screen.id) >= 0) visible = false;
      if (badge) applyBadgeState(badge, active.length);
    }
    if (visible && !badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.id = BADGE_ID;
      badge.innerHTML = '<span class="gm-badge-ic">⚡</span>';
      badge.setAttribute('aria-label', '打开专属特权面板');
      badge.title = '打开专属特权面板';
      badge.addEventListener('click', openPanel);
      document.body.appendChild(badge);
    }
    if (badge) badge.classList.toggle('show', visible);
  }

  /* ---------------- UI：输入即时提示 ---------------- */

  function syncHint() {
    var input = document.getElementById('character-name');
    if (!input) return;
    var hint = document.getElementById(HINT_ID);
    var hit = matches(input.value) || (ready && _unlocked);
    if (!hit) {
      if (hint) hint.textContent = '';
      return;
    }
    if (!hint) {
      hint = document.createElement('div');
      hint.id = HINT_ID;
      hint.className = 'gm-hint';
      var err = document.getElementById('character-error');
      if (err && err.parentNode) err.parentNode.insertBefore(hint, err.nextSibling);
      else if (input.parentNode) input.parentNode.appendChild(hint);
    }
    hint.textContent = '⚡ 专属特权已解锁，进入建球员阶段后可自定义选项';
  }

  /* ---------------- UI：特权面板 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderPanelBody() {
    var body = document.querySelector('#' + PANEL_ID + ' .gm-body');
    if (!body || !cfg) return;
    var html = '';
    cfg.groups.forEach(function (g) {
      var items = cfg.cheats.filter(function (c) { return c.group === g.id; });
      if (!items.length) return;
      html += '<div class="gm-group-title">' + esc(g.name) + '</div>';
      if (g.desc) html += '<div class="gm-group-desc">' + esc(g.desc) + '</div>';
      items.forEach(function (c) {
        var on = isOn(c.id);
        html += '<div class="gm-row' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' +
          ' tabindex="0" data-gm="' + esc(c.id) + '">' +
          '<div class="gm-switch"><div class="gm-knob"></div></div>' +
          '<div><div class="gm-name">' + esc(c.name) + '</div>' +
          '<div class="gm-desc">' + esc(c.desc) + '</div></div></div>';
      });
    });
    // 未归入任何已知分组的特权兜底展示，避免配置漏了 groups 就看不见
    var grouped = {};
    cfg.groups.forEach(function (g) { grouped[g.id] = true; });
    var orphan = cfg.cheats.filter(function (c) { return !grouped[c.group]; });
    if (orphan.length) {
      html += '<div class="gm-group-title">其他</div>';
      orphan.forEach(function (c) {
        var on = isOn(c.id);
        html += '<div class="gm-row' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' +
          ' tabindex="0" data-gm="' + esc(c.id) + '">' +
          '<div class="gm-switch"><div class="gm-knob"></div></div>' +
          '<div><div class="gm-name">' + esc(c.name) + '</div>' +
          '<div class="gm-desc">' + esc(c.desc) + '</div></div></div>';
      });
    }
    body.innerHTML = html;
  }

  function openPanel() {
    if (!cfg || !isEligible()) return;
    injectStyles();
    var old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.className = 'team-picker-overlay';
    overlay.id = PANEL_ID;
    overlay.innerHTML =
      '<div class="team-picker-modal">' +
        '<div class="team-picker-header"><span>⚡ 专属特权</span>' +
        '<button type="button" class="team-picker-close" aria-label="关闭">✕</button></div>' +
        '<div class="gm-body" style="max-height:62vh"></div>' +
        '<div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--border,#ccb083);flex-shrink:0">' +
          '<button type="button" id="gm-reset" class="btn btn-sm" style="flex:1">全部关闭</button>' +
          '<button type="button" id="gm-lock" class="btn btn-sm" style="flex:0 0 auto;' +
          'border:2px solid #e63946;color:#e63946;background:var(--bg-card,#fffaf0)">立即上锁</button>' +
          '<button type="button" id="gm-done" class="btn btn-primary btn-sm" style="flex:1">完成</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.team-picker-close').addEventListener('click', closePanel);
    overlay.querySelector('#gm-done').addEventListener('click', closePanel);
    overlay.querySelector('#gm-reset').addEventListener('click', reset);
    var lockBtn = overlay.querySelector('#gm-lock');
    if (lockBtn) lockBtn.addEventListener('click', lock);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePanel();
    });
    overlay.querySelector('.gm-body').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.gm-row') : null;
      if (row) toggle(row.getAttribute('data-gm'));
    });
    renderPanelBody();
  }

  function closePanel() {
    var el = document.getElementById(PANEL_ID);
    if (el) el.remove();
    syncBadge();
  }

  /* ---------------- 口令校验：SHA-256 ---------------- */
  /* 注意：crypto.subtle 仅在安全上下文（HTTPS / localhost）可用，
     站点若跑在 http:// 域名下它是 undefined，因此必须内置纯 JS 实现兜底。 */

  function utf8Bytes(s) {
    if (typeof TextEncoder === 'function') {
      try { return new TextEncoder().encode(s); } catch (e) {}
    }
    var out = [], i, c, cp;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        cp = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(++i) & 0x3ff));
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return new Uint8Array(out);
  }

  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function sha256Hex(msg) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var b = utf8Bytes(String(msg)), len = b.length, w = new Array(64), i, off;
    var pad = ((56 - ((len + 1) % 64)) + 64) % 64, total = len + 1 + pad + 8;
    var m = new Uint8Array(total);
    m.set(b); m[len] = 0x80;
    var dv = new DataView(m.buffer), bits = len * 8;
    dv.setUint32(total - 8, Math.floor(bits / 4294967296));
    dv.setUint32(total - 4, bits >>> 0);
    for (off = 0; off < total; off += 64) {
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        w[i] = (w[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3))
                + w[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) >>> 0;
      }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (v) { return ('0000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  // 统一返回 Promise<string>：优先 Web Crypto，不可用时降级到内置实现
  function digest(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest && typeof TextEncoder === 'function') {
      try {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
          .then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (n) {
              return ('0' + n.toString(16)).slice(-2);
            }).join('');
          })
          .catch(function () { return sha256Hex(str); });
      } catch (e) {}
    }
    return Promise.resolve(sha256Hex(str));
  }

  var _fails = 0, _coolUntil = 0;

  // 定长逐字符比较，避免短路提前返回造成的时间差
  function eqConst(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  function verify(pw) {
    if (!ready || !cfg || !cfg.unlock) return Promise.resolve(false);
    var u = cfg.unlock;
    if (_coolUntil && Date.now() < _coolUntil) return Promise.resolve(false);
    return digest(u.salt + String(pw == null ? '' : pw)).then(function (hex) {
      if (eqConst(hex, u.hash)) {
        _fails = 0; _coolUntil = 0;
        setUnlocked(true);
        return true;
      }
      if (++_fails >= u.maxAttempts) { _coolUntil = Date.now() + u.cooldownMs; _fails = 0; }
      return false;
    });
  }

  /* ---------------- 解锁状态 ---------------- */

  function setUnlocked(v) {
    _unlocked = !!v;
    saveStore();
    _elig = { name: null, value: false }; // 关键：清按姓名缓存，否则徽章不刷新
    if (!_unlocked) { closeUnlockDialog(); closePanel(); }
    refreshUI();
    if (_unlocked) {
      // 菜单页/角色页不显示徽章，给一次轻提示，避免"输了口令却毫无反应"
      var scr = document.querySelector('.screen.active');
      if (scr && HIDE_BADGE_SCREENS.indexOf(scr.id) >= 0) showToast('专属特权已启用');
    }
  }

  function lock() {
    // 已勾选项保留在 store 中：锁定期内 isOn() 因 isEligible() 为 false 恒返回 false，无效果泄漏
    setUnlocked(false);
  }

  function showToast(text) {
    var old = document.getElementById('gm-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'gm-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { if (el && el.parentNode) el.remove(); }, 2200);
  }

  /* ---------------- 隐藏入口（双通道） ---------------- */

  function afterReady() {
    var run = function () { bindSecretEntry(); checkUrlEntry(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  function bindSecretEntry() {
    var u = cfg && cfg.unlock;
    if (!u) return;
    var el = document.querySelector(u.tapTarget);
    if (!el) return;
    var taps = [];
    el.addEventListener('click', function () {
      if (_unlocked) { openPanel(); return; } // 菜单页徽章不可见，这是唯一入口
      var now = Date.now();
      taps = taps.filter(function (t) { return now - t < u.tapWindowMs; });
      taps.push(now);
      if (taps.length >= u.tapCount) { taps = []; openUnlockDialog(); }
    });
  }

  function checkUrlEntry() {
    var u = cfg && cfg.unlock;
    if (!u || _unlocked) return; // 已解锁时不再打扰（书签每次刷新都会命中）
    var toks = (location.search || '').replace(/^[?]/, '').split('&')
      .concat((location.hash || '').replace(/^#/, '').split('&'))
      .map(function (kv) { return kv.split('=')[0].toLowerCase(); });
    for (var i = 0; i < u.params.length; i++) {
      if (toks.indexOf(String(u.params[i]).toLowerCase()) >= 0) { openUnlockDialog(); return; }
    }
  }

  /* ---------------- 口令输入弹窗 ---------------- */

  function openUnlockDialog() {
    if (!cfg || !cfg.unlock) return;
    injectStyles();
    var old = document.getElementById(DIALOG_ID);
    if (old) old.remove(); // 防重复挂载

    var ov = document.createElement('div');
    ov.className = 'team-picker-overlay';
    ov.id = DIALOG_ID;
    ov.innerHTML =
      '<div class="team-picker-modal" style="max-width:340px">' +
        '<div class="team-picker-header"><span>验证身份</span>' +
        '<button type="button" class="team-picker-close" aria-label="关闭">✕</button></div>' +
        '<div style="padding:16px 14px">' +
          '<div style="font-size:13px;color:var(--text-dim,#5c6674);line-height:1.6;margin-bottom:10px">' +
            '请输入口令以启用自定义选项</div>' +
          '<input id="gm-unlock-input" class="gm-input" type="password" autocomplete="off" ' +
            'autocapitalize="off" spellcheck="false" placeholder="请输入口令">' +
          '<div id="gm-unlock-err" class="gm-unlock-err" role="alert"></div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
            '<button type="button" id="gm-unlock-cancel" class="btn btn-sm" style="flex:1">取消</button>' +
            '<button type="button" id="gm-unlock-ok" class="btn btn-primary btn-sm" style="flex:1">确认</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var input = ov.querySelector('#gm-unlock-input');
    var err = ov.querySelector('#gm-unlock-err');
    var ok = ov.querySelector('#gm-unlock-ok');

    function submit() {
      if (ok.disabled) return;
      var v = input.value;
      if (!v) { err.textContent = '请输入口令'; input.focus(); return; }
      ok.disabled = true; ok.textContent = '校验中…'; err.textContent = '';
      verify(v).then(function (pass) {
        if (pass) { closeUnlockDialog(); return; }
        var left = (_coolUntil - Date.now()) / 1000;
        err.textContent = left > 0
          ? '尝试次数过多，请 ' + Math.ceil(left) + ' 秒后再试'
          : '口令不正确，请重试';
        input.value = ''; input.focus();
        ok.disabled = false; ok.textContent = '确认';
      });
    }

    ok.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    ov.querySelector('#gm-unlock-cancel').addEventListener('click', closeUnlockDialog);
    ov.querySelector('.team-picker-close').addEventListener('click', closeUnlockDialog);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeUnlockDialog(); });
    document.addEventListener('keydown', onUnlockKey);
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
  }

  function onUnlockKey(e) { if (e.key === 'Escape') closeUnlockDialog(); }

  function closeUnlockDialog() {
    document.removeEventListener('keydown', onUnlockKey);
    var el = document.getElementById(DIALOG_ID);
    if (el) el.remove();
  }

  /* ---------------- 刷新与挂载 ---------------- */

  function refreshUI() {
    injectStyles();
    syncBadge();
    syncHint();
  }

  // 屏幕切换时刷新徽章可见性。showScreen 定义在本脚本之后，无法直接包裹，
  // 因此监听 class 变化并合并到下一帧，避免高频触发。
  function queueSync() {
    if (_syncQueued) return;
    _syncQueued = true;
    requestAnimationFrame(function () { _syncQueued = false; syncBadge(); });
  }

  function mount() {
    refreshUI();
    var input = document.getElementById('character-name');
    if (input) {
      // 用 addEventListener 而非 oninput：hupu-extensions.js 会设置 input.oninput，
      // 两者可共存，不会互相覆盖。
      input.addEventListener('input', syncHint);
    }
    if (window.MutationObserver) {
      new MutationObserver(queueSync).observe(document.documentElement, {
        subtree: true, attributes: true, attributeFilter: ['class']
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mount(); boot(); });
  } else {
    mount();
    boot();
  }

  /* ---------------- 对外 API ---------------- */

  window.PP_GOD = {
    isReady: function () { return ready; },
    hasConfig: function () { return !!cfg; },
    isEligible: isEligible,
    matches: matches,
    isOn: isOn,
    toggle: toggle,
    reset: reset,
    activeList: activeList,
    names: function () { return cfg ? cfg.names.slice() : []; },
    list: function () {
      if (!cfg) return [];
      return cfg.groups.map(function (g) {
        return {
          id: g.id, name: g.name, desc: g.desc,
          cheats: cfg.cheats.filter(function (c) { return c.group === g.id; })
        };
      });
    },
    openPanel: openPanel,
    closePanel: closePanel,
    refresh: refreshUI,
    isUnlocked: function () { return !!_unlocked; },
    unlock: function (pw) { return verify(pw); },      // Promise<boolean>
    lock: lock,
    openUnlockDialog: openUnlockDialog,
    closeUnlockDialog: closeUnlockDialog,
    sha256Hex: function (s) { return sha256Hex(String(s)); } // 供测试校验内置实现正确性
  };
})();
