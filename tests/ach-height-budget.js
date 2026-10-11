'use strict';
// 成就殿堂固定高度预算核算：确认 10 个单列标签 + 最大分类卡片在 640px 内放得下。
// 沙箱内无浏览器，只能按 CSS 声明值推算；数字为近似值，用作回归基线。
// 数值全部从 CSS 里读，避免手抄常量与样式脱节。
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'perfect-player-enhancements.js'),
  'utf8'
);

// CSS 数组里的换行是字符串拼接，规整成单行再解析
const flat = src.replace(/'\s*\r?\n\s*'/g, '');

const num = (re) => {
  const m = flat.match(re);
  if (!m) throw new Error('CSS 取值失败: ' + re);
  return parseFloat(m[1]);
};

let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) failed++; };

// ── 读取实际声明值 ──
const panelH = num(/\.pp-ach-panel\{width:[^}]*height:min\((\d+)px/);
const headFs = num(/\.pp-ach-panel-title\{[^}]*font-size:(\d+)px/);
const closeSz = 32;
const barH = num(/\.pp-ach-progress-bar\{height:(\d+)px/);
const progPadB = num(/\.pp-ach-progress\{padding:0 18px (\d+)px/);
const txtFs = num(/\.pp-ach-progress-txt\{[^}]*font-size:(\d+)px/);

const tabsW = num(/\.pp-ach-tabs\{flex:0 0 (\d+)px/);
const tabsPadY = num(/\.pp-ach-tabs\{[^}]*padding:(\d+)px/);
const tabGap = num(/\.pp-ach-tabs\{[^}]*flex-direction:column;gap:(\d+)px/);
// padding 可能是 `7px 8px`（垂直 水平）或 `7px`（四边同）
const tabPadRaw = flat.match(/\.pp-ach-tab\{[^}]*padding:(\d+)px(?: (\d+)px)?/);
if (!tabPadRaw) throw new Error('CSS 取值失败: .pp-ach-tab padding');
const tabPadY = parseFloat(tabPadRaw[1]);
const tabPadX = parseFloat(tabPadRaw[2] || tabPadRaw[1]);
const tabFs = num(/\.pp-ach-tab-nm\{[^}]*font-size:(\d+(?:\.\d+)?)px/);
const icW = num(/\.pp-ach-tab-ic\{flex:0 0 auto;width:(\d+)px/);
const tabGapX = num(/\.pp-ach-tab\{[^}]*align-items:center;gap:(\d+)px/);
const ntFs = num(/\.pp-ach-tab-nt\{[^}]*font-size:(\d+(?:\.\d+)?)px/);

// ── 垂直预算 ──
const headH = 16 + 8 + Math.max(headFs * 1.3, closeSz);   // padding 上下 + 内容高
const progH = progPadB + barH + 6 + txtFs * 1.4;
const bodyH = panelH - headH - progH;
const tabItemH = tabFs * 1.35 + tabPadY * 2;
const tabsNeed = tabsPadY + 10 * tabItemH + 9 * tabGap + 8;  // + 底部 padding

// ── 横向预算 ──
const nameMaxChars = 4;   // 「个人荣誉」「生涯累计」等最长 4 个汉字
const nameAvail = tabsW - tabsPadY * 0 - icW - tabGapX - tabPadX * 2 - ntFs * 2.6;

console.log('成就殿堂高度/宽度预算（近似）');
console.log('  弹窗总高        %s px', panelH);
console.log('  头部占用        %s px', headH.toFixed(0));
console.log('  进度条占用      %s px', progH.toFixed(0));
console.log('  正文区可用      %s px', bodyH.toFixed(0));
console.log('  标签栏需要      %s px  (10 项 × %s + 9 × %s + 间距)',
  tabsNeed.toFixed(0), tabItemH.toFixed(0), tabGap);
console.log('  标签栏宽度      %s px', tabsW);
console.log('  名称区可用      %s px  (最长分类名 %d 汉字 ≈ %s px)',
  nameAvail.toFixed(0), nameMaxChars, (nameMaxChars * tabFs).toFixed(0));
console.log('');

ok(tabsNeed <= bodyH,
  `单列 10 个标签放得下（余量 ${(bodyH - tabsNeed).toFixed(0)}px）`);
ok(nameAvail >= nameMaxChars * tabFs + 6,
  `宽度容得下最长分类名并留 6px 余量（余量 ${(nameAvail - nameMaxChars * tabFs).toFixed(0)}px）`);
ok(tabFs >= 12, `标签名称字号 ${tabFs}px ≥ 12px（可读）`);

console.log('');
if (failed) { console.log('❌ 失败 ' + failed + ' 项'); process.exit(1); }
console.log('✅ 全部通过');
