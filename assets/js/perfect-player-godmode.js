/* ============================================================
   Perfect Player — 专属特权（God Mode）
   ------------------------------------------------------------
   当角色名命中配置名单时，解锁一个特权面板，玩家可逐项勾选要开哪些作弊。
   所有特权默认关闭；名单与特权定义全部外置在 assets/data/god-mode.json。

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

  // 代码里真实存在的注入点。用于启动自检：配置里若出现未知 id，或某个
  // 已知 id 被误删，都会在控制台给出提示，避免"改了配置却静默失效"。
  var KNOWN_IDS = [
    'infinite_reroll', 'always_historical', 'no_team_swap', 'no_pos_penalty',
    'break_99', 'free_training', 'rich_points', 'no_train_cap',
    'infinite_legacy', 'legacy_no_max',
    'no_decline', 'no_retire', 'no_injury', 'free_contract',
    'lock_first_pick', 'all_offers', 'no_trade_waive', 'auto_win', 'hot_hand'
  ];

  // 不显示入口徽章的界面：主页与角色创建页（创建页只显示输入提示）
  var HIDE_BADGE_SCREENS = ['screen-menu', 'screen-character'];

  var cfg = null;      // 解析后的配置，null 表示不可用
  var ready = false;   // 加载流程是否已结束（成功或失败都置 true）
  var store = loadStore();
  var _elig = { name: null, value: false };
  var _syncQueued = false;

  /* ---------------- 配置加载 ---------------- */

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.enabled === false) return null; // 总开关：线上紧急关闭用
    var names = [];
    if (Array.isArray(raw.names)) {
      raw.names.forEach(function (n) { if (typeof n === 'string' && n) names.push(n); });
    }
    if (!names.length) return null;
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
    return {
      caseSensitive: raw.caseSensitive !== false,
      names: names,
      groups: groups,
      cheats: cheats
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
        .then(function () { ready = true; refreshUI(); });
    } catch (e) {
      cfg = null;
      ready = true;
    }
  }

  /* ---------------- 存储 ---------------- */

  function loadStore() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (o && typeof o === 'object' && o.cheats && typeof o.cheats === 'object') return o.cheats;
    } catch (e) {}
    return {};
  }

  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, cheats: store })); } catch (e) {}
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
      '#god-mode-badge{position:fixed;right:12px;bottom:calc(74px + env(safe-area-inset-bottom,0px));' +
      'z-index:280;display:none;align-items:center;gap:6px;padding:9px 15px;border-radius:999px;' +
      'border:2px solid var(--gold,#dfa62f);background:linear-gradient(135deg,#2a1c05,#5c3f0b);' +
      'color:#f7d488;font-family:var(--font-athletic),"Oswald","Noto Sans SC",sans-serif;' +
      'font-size:13px;letter-spacing:.5px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28)}' +
      '#god-mode-badge.show{display:inline-flex}' +
      '#god-mode-badge:active{transform:translateY(1px)}' +
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
      '.gm-hint{margin-top:6px;font-size:12px;color:var(--gold,#dfa62f);font-weight:600}';
    var el = document.createElement('style');
    el.id = 'god-mode-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function syncBadge() {
    var badge = document.getElementById(BADGE_ID);
    var visible = isEligible();
    if (visible) {
      var active = activeList();
      var screen = document.querySelector('.screen.active');
      if (screen && HIDE_BADGE_SCREENS.indexOf(screen.id) >= 0) visible = false;
      if (badge) badge.textContent = active.length ? ('⚡ 专属特权 · ' + active.length) : '⚡ 专属特权';
    }
    if (visible && !badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.id = BADGE_ID;
      badge.textContent = '⚡ 专属特权';
      badge.setAttribute('aria-label', '打开专属特权面板');
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
    var hit = matches(input.value);
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
          '<button type="button" id="gm-done" class="btn btn-primary btn-sm" style="flex:1">完成</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.team-picker-close').addEventListener('click', closePanel);
    overlay.querySelector('#gm-done').addEventListener('click', closePanel);
    overlay.querySelector('#gm-reset').addEventListener('click', reset);
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
    refresh: refreshUI
  };
})();
