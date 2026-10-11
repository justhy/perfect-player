'use strict';
// 核对传承祭坛提示文案与真实数值的一致性。
// 关键：若 LP 产出 >= 全路线成本，玩家就能点满所有路线，"无法同时点满"就是错的。
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'perfect-player-enhancements.js'),
  'utf8'
);

const LP_BY_RARITY = { common: 1, rare: 2, epic: 4, legend: 8 };

const achievements = [...src.matchAll(
  /\{\s*id:\s*'[a-zA-Z_0-9]+'[\s\S]*?rarity:\s*'(\w+)',[\s\S]*?cat:/g
)].map(m => ({ rarity: m[1] }));

const perkBlocks = [...src.matchAll(/costs:\s*\[([0-9,\s]+)\]/g)].map(m =>
  m[1].split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n))
);

const total = achievements.reduce((s, a) => s + (LP_BY_RARITY[a.rarity] || 0), 0);
const tree = perkBlocks.flat().reduce((a, b) => a + b, 0);
const GAP = 3;

console.log('成就数        :', achievements.length);
console.log('LP 总产出     :', total);
console.log('全路线总成本  :', tree);
console.log('产出 - 成本   :', total - tree, '(负数=点不满，正数=能点满还有剩)');
console.log('');

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failed++; };

// 设计意图：拿满全部成就的 LP 仍不足以点满全路线，缺口恰好 LEGACY_COST_GAP。
ok(tree - total === GAP,
   `全路线成本(${tree}) - LP产出(${total}) = ${tree - total}，应为 ${GAP}（产出必须小于成本）`);
ok(total < tree, '文案前提成立：全部成就 LP 不足以点满全路线');

console.log('');
if (failed) {
  console.log('❌ 文案与数值矛盾 ' + failed + ' 项 —— "无法同时点满"是错的，需要提价');
  process.exit(1);
}
console.log('✅ 文案与数值一致');