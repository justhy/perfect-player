'use strict';
// 「王朝」成就判定单测：同一支球队连续夺冠的最长段。
// 这里直接复刻 collectDynastyRun 的算法跑数据用例，避免只能靠肉眼看游戏验证。
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'perfect-player-enhancements.js'),
  'utf8'
);

let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ✔ ' : '  ✘ ') + msg);
  if (!cond) failed++;
};

console.log('王朝连冠判定单测\n');

// 把源码里的 collectDynastyRun 抠出来，喂一个假的 classifyAward。
// 源码里 classifyAward 对 act:'champion' 直接返回 'champion'，单测里保持同样语义。
const fnMatch = src.match(/function collectDynastyRun\(s\) \{[\s\S]*?\r?\n {2}\}/);
if (!fnMatch) {
  console.log('❌ 未能从源码提取 collectDynastyRun');
  process.exit(1);
}
const body = fnMatch[0]
  .replace(/^function collectDynastyRun/, 'function collectDynastyRun')
  .replace(/PP_FX\.collectDynastyRun = collectDynastyRun;/, '');

const classifyAward = (a) => (a && a.act === 'champion' ? 'champion' : '');

const collectDynastyRun = new Function(
  'classifyAward',
  body + '\nreturn collectDynastyRun;'
)(classifyAward);

// 构造一个最小 STATE：某赛季是否夺冠由 awards 里的 act:'champion' 决定
const champ = () => ({ act: 'champion', label: '🏆 总冠军', isUser: true });
const mkSeason = (seasonNum, team, won) => ({
  seasonNum, team, awards: won ? [champ()] : [], playoffResult: won ? '总决赛·总冠军' : '未晋级'
});

console.log('— 基础用例 —');
let r = collectDynastyRun({ career: { seasons: [mkSeason(1, 'LAL', true)] } });
ok(r.run === 1 && r.team === 'LAL', '单冠 run=1');

r = collectDynastyRun({ career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'LAL', true)] } });
ok(r.run === 2 && r.team === 'LAL', '同队两连冠 run=2');

r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'LAL', true), mkSeason(3, 'LAL', true)] }
});
ok(r.run === 3 && r.team === 'LAL', '同队三连冠 run=3');

r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'LAL', true), mkSeason(3, 'LAL', true), mkSeason(4, 'LAL', true)] }
});
ok(r.run === 4 && r.team === 'LAL', '同队四连冠 run=4（legend 门槛）');

console.log('\n— 关键反例：中间断掉必须重新计数 —');
r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'BOS', true), mkSeason(3, 'LAL', true)] }
});
ok(r.run === 1, '换队夺冠打断连冠（两队各 1 冠，run=1 而非 2）');

r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'BOS', false), mkSeason(3, 'LAL', true)]
  }
});
ok(r.run === 1, '中间赛季未夺冠（换队失冠）也打断连冠');

r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(3, 'LAL', true), mkSeason(4, 'LAL', true)]
  }
});
ok(r.run === 2, '赛季号不连续（缺赛季2）不算连冠，最长段=2');

console.log('\n— 当前赛季（未归档）—');
r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'LAL', true)], seasonCount: 2 },
  season: { isChampion: true, awards: [champ()] },
  careerTeam: 'LAL'
});
ok(r.run === 3, '未归档的当前赛季夺冠可续上连冠（第3季）');

// 关键回归：赛季已归档但还没开新赛季，_careerSaved 为真。此时 seasonCount 已自增，
// 若再按 seasonCount+1 补一次当前赛季，就会凭空多一冠、把两连冠算成三连冠。
r = collectDynastyRun({
  _careerSaved: true,
  career: { seasons: [mkSeason(1, 'LAL', true), mkSeason(2, 'LAL', true)], seasonCount: 2 },
  season: { isChampion: true, awards: [champ()] },
  careerTeam: 'LAL'
});
ok(r.run === 2, '_careerSaved 时不重复计当前赛季（防两连冠被算成三连冠）');

r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true)], seasonCount: 1 },
  season: { isChampion: false, awards: [] },
  careerTeam: 'LAL'
});
ok(r.run === 1, '当前赛季未夺冠不改变结果');

console.log('\n— 边界 —');
ok(collectDynastyRun({ career: { seasons: [] } }).run === 0, '空生涯 run=0');
ok(collectDynastyRun({ career: {} }).run === 0, '无 career 字段不抛异常');
ok(collectDynastyRun(null).run === 0, '传入 null 不抛异常');
ok(collectDynastyRun({ career: { seasons: [null, undefined] } }).run === 0, '空赛季记录被跳过');
r = collectDynastyRun({
  career: { seasons: [mkSeason(1, 'LAL', true)], seasonCount: 1 },
  season: { isChampion: true, awards: [] },
  careerTeam: ''
});
ok(r.run === 1, '当前赛季缺 team 时不虚增连冠（回落到已归档结果）');

console.log('\n— 成就定义与接入 —');
ok(/id:\s*'dynasty_2'/.test(src), '定义了 dynasty_2');
ok(/id:\s*'dynasty_3'/.test(src), '定义了 dynasty_3');
ok(/id:\s*'dynasty_4'/.test(src), '定义了 dynasty_4');
ok(/if \(dynasty\.run >= 2\) unlockWithFactEvidence\('dynasty_2'/.test(src), 'dynasty_2 由 run>=2 解锁');
ok(/if \(dynasty\.run >= 3\) unlockWithFactEvidence\('dynasty_3'/.test(src), 'dynasty_3 由 run>=3 解锁');
ok(/if \(dynasty\.run >= 4\) unlockWithFactEvidence\('dynasty_4'/.test(src), 'dynasty_4 由 run>=4 解锁');
ok(/run: best, team: bestTeam/.test(src), '返回最长段与对应球队');
[2, 3, 4].forEach(n => {
  ok(new RegExp("id:\\s*'dynasty_" + n + "'[^\\n]*cat:\\s*'team'").test(src),
    'dynasty_' + n + ' 归入球队战绩分类');
});

console.log('');
if (failed) { console.log('❌ 失败 ' + failed + ' 项'); process.exit(1); }
console.log('✅ 全部通过');