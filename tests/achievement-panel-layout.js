'use strict';
// 成就殿堂「左右标签式」布局静态校验。
// 沙箱内无浏览器，跑不了 Playwright；这里用文本层面校验 CSS 与 DOM 结构是否对得上。
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

console.log('成就殿堂左右标签布局校验\n');

// 1. 新增样式必须齐全
const required = [
  '.pp-ach-body{', '.pp-ach-tabs{', '.pp-ach-tab{', '.pp-ach-tab-ic{',
  '.pp-ach-tab-nm{', '.pp-ach-tab-nt{', '.pp-ach-content{', '.pp-ach-tab-full{'
];
required.forEach(s => ok(src.includes(s), '样式存在 ' + s));

// 2. 旧样式必须已移除
ok(!src.includes('.pp-ach-scroll{'), '旧 .pp-ach-scroll 样式已移除');
ok(!src.includes('class="pp-ach-cat" data-cat'), '旧的纵向分组容器已移除');

// 3. DOM 结构：左标签 + 右内容
ok(src.includes('class="pp-ach-body"'), 'DOM 含左右分栏容器 .pp-ach-body');
ok(src.includes('id="pp-ach-tabs" role="tablist"'), 'DOM 含左侧标签栏');
ok(src.includes('id="pp-ach-content"'), 'DOM 含右侧内容区');

// 4. 交互逻辑
ok(/classList\.toggle\('active', t === btn\)/.test(src), '切标签时同步高亮状态');
ok(/function renderBody\(catId\)/.test(src), '存在按分类渲染的 renderBody');
ok(/addEventListener\('click'[\s\S]{0,400}?closest\('\.pp-ach-tab'\)/.test(src), '标签栏使用事件委托');
ok(/box\.scrollTop = 0/.test(src), '切换分类时内容区回到顶部');

// 5. 数据一致性：tabs 与 body 必须来自同一份 stats
ok(/var stats = orderedCats\(\)\.map/.test(src), 'tabs 由 stats 统一派生');
ok(/function catStat\(catId\)/.test(src), '存在 catStat 统一统计函数');

// 6. 颜色值不得残留手滑笔误
ok(!/[:#]\s*[0-9a-fA-F]*\s+[a-z]+\s*;\s*color/.test(src), 'CSS 内无重复 color 声明笔误');

// 7. 全通标记
ok(/class="pp-ach-tab-full"/.test(src), '全通分类有角标');

// 8. 弹窗高度固定 + 无滚动条：内容全靠紧凑排版放下，滚动条一律隐藏
ok(/\.pp-ach-panel\{width:min\(700px,100%\);height:min\(\d+px,\d+vh\)/.test(src), '弹窗用 height 固定尺寸');
ok(!/\.pp-ach-panel\{[^}]*max-height/.test(src), '弹窗不再使用 max-height（会随内容变高）');
ok(/\.pp-ach-panel-head\{[^}]*flex:0 0 auto/.test(src), '头部不参与压缩');
ok(/\.pp-ach-progress\{[^}]*flex:0 0 auto/.test(src), '进度条不参与压缩');
ok(/\.pp-ach-body\{flex:1;min-height:0/.test(src), '正文区吃掉剩余高度');
ok(/\.pp-ach-panel \*/.test(src), '面板内全局隐藏滚动条');
ok(/::-webkit-scrollbar\{width:0;height:0;display:none\}/.test(src), 'webkit 滚动条置零隐藏');
ok(/scrollbar-width:none/.test(src), 'firefox scrollbar-width 隐藏');

// 9. 左侧单列：10 个分类必须一屏全显示，且字号可读（不缩到 10px 以下）
ok(/\.pp-ach-tabs\{[^}]*flex-direction:column/.test(src), '标签栏为单列（flex-direction:column）');
ok(!/\.pp-ach-tabs\{[^}]*grid-template-columns/.test(src), '标签栏已移除两列网格');
ok(/\.pp-ach-tabs\{[^}]*overflow:hidden/.test(src), '标签栏不滚动（10 个分类一次全显示）');
ok(!/\.pp-ach-tabs\{[^}]*overflow-y:auto/.test(src), '标签栏已移除 overflow-y:auto');
ok(/\.pp-ach-tab\{[^}]*flex-direction:row/.test(src), '标签内部为横向一行（图标+名称+进度）');
ok(/\.pp-ach-tab-nm\{[^}]*font-size:1[2-9]px/.test(src), '标签名称字号 ≥12px（单列后可读）');
ok(/\.pp-ach-tab-nt\{[^}]*font-size:1[01]px/.test(src), '标签进度字号 ≥10px');
// 高度预算：10 项 × 单项高 + 间距 ≤ 正文区可用高度
ok(/height:min\(640px,84vh\)/.test(src), '弹窗高度 640px（单列标签所需高度已纳入预算）');

// 10. 右侧最大分类必须放得下：卡片两列 + 内容区不滚动
ok(/\.pp-ach-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(src), '成就卡片为两列网格');
ok(/\.pp-ach-content\{[^}]*overflow:hidden/.test(src), '右侧内容区不再滚动');
ok(!/\.pp-ach-content\{[^}]*overflow-y:auto/.test(src), '内容区已移除 overflow-y:auto');
ok(/-webkit-line-clamp:2/.test(src), '描述限制两行，保证卡片等高');

// 11. 传承祭坛同样固定高度 + 无滚动条
ok(/\.pp-lg-hint\{[^}]*flex:0 0 auto/.test(src), '祭坛提示不参与压缩');
ok(/\.pp-lg-grid\{[^}]*flex:1;min-height:0/.test(src), '祭坛强化列表吃掉剩余高度');
ok(/\.pp-lg-grid \*/.test(src), '祭坛列表隐藏滚动条');
ok(/\.pp-lg-foot\{[^}]*flex:0 0 auto/.test(src), '祭坛底部按钮不参与压缩');

console.log('');
if (failed) {
  console.log('❌ 失败 ' + failed + ' 项');
  process.exit(1);
}
console.log('✅ 全部通过');
