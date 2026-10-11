# -*- coding: utf-8 -*-
"""审计成就系统：定义完整性 / 解锁路径覆盖 / LP 平衡 / 分类分组。"""
import io, re, os, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PP = os.path.join(ROOT, 'assets', 'js', 'perfect-player-enhancements.js')
HTML = os.path.join(ROOT, 'nba-perfect-player.html')

src = io.open(PP, 'rb').read().decode('utf-8')
html = io.open(HTML, 'rb').read().decode('utf-8-sig')

# ── 定义解析 ──
defs = []
for m in re.finditer(
    r"\{\s*id:\s*'([a-zA-Z_0-9]+)'\s*,\s*icon:\s*'([^']*)'\s*,\s*name:\s*'([^']*)'\s*,"
    r"\s*desc:\s*'([^']*)'\s*,\s*rarity:\s*'(\w+)'\s*,\s*cat:\s*'(\w+)'\s*\}", src):
    defs.append(dict(id=m.group(1), icon=m.group(2), name=m.group(3),
                     desc=m.group(4), rarity=m.group(5), cat=m.group(6)))

# ── 解锁路径（含 PP_FX.unlock / unlockWithFactEvidence / 变量传入 / 元成就门槛表）──
calls = set(re.findall(r"(?:PP_FX\.)?unlock(?:WithFactEvidence)?\(\s*'([a-zA-Z_0-9]+)'", src))
# unlockWithFactEvidence('mip',...) / unlockWithFactEvidence('all_defense',...) 是字面量，已覆盖；
# 成就 id 也可能通过变量传入，如 unlockWithFactEvidence(dId, ...)（数据王六个）。
data_champ_ids = {'scoring_champ', 'reb_champ', 'ast_champ', 'stl_champ', 'blk_champ', 'three_champ'}
if re.search(r"unlockWithFactEvidence\(\s*dId\b", src):
    calls |= data_champ_ids
meta_ids = re.findall(r"\{\s*id:\s*'([a-zA-Z_0-9]+)'\s*,\s*at:\s*(\d+)\s*\}", src)
calls.update(mid for mid, _ in meta_ids)

LP = {'common': 1, 'rare': 2, 'epic': 4, 'legend': 8}
perks = re.findall(r"id:\s*'(\w+)'[^\n]*?costs:\s*\[([0-9,\s]+)\]", src)
tree = sum(sum(int(x) for x in c.split(',') if x.strip()) for _, c in perks)

print('=' * 66)
print('成就系统审计')
print('=' * 66)
print('成就总数 : %d' % len(defs))
cnt = Counter(d['rarity'] for d in defs)
for k in ('common', 'rare', 'epic', 'legend'):
    if cnt[k]:
        print('  %-8s %2d 项 × %d LP = %3d' % (k, cnt[k], LP[k], cnt[k] * LP[k]))
total_lp = sum(cnt[k] * LP[k] for k in cnt)
print('LP 产出  : %d   全路线成本: %d   缺口(成本-产出): %d' % (total_lp, tree, tree - total_lp))
print()

ok = True
dup = [k for k, v in Counter(d['id'] for d in defs).items() if v > 1]
if dup:
    print('❌ 重复 id: %s' % dup); ok = False

miss_cat = [d['id'] for d in defs if not d['cat']]
if miss_cat:
    print('❌ 缺 cat: %s' % miss_cat); ok = False

dead = [d['id'] for d in defs if d['id'] not in calls]
if dead:
    print('❌ 死成就（无解锁路径）: %s' % dead); ok = False

orphan = [c for c in calls if c not in {d['id'] for d in defs}]
if orphan:
    print('❌ 解锁了未定义成就: %s' % orphan); ok = False

# 缺口方向必须是「成本 > 产出」，否则玩家能点满全路线，专精取舍失效。
if total_lp >= tree:
    print('❌ LP 产出(%d) >= 全路线成本(%d)：玩家可以点满全部路线' % (total_lp, tree)); ok = False
elif tree - total_lp != 3:
    print('❌ LP 缺口(成本-产出)应为 3，当前 %d' % (tree - total_lp)); ok = False

# 分类必须都在 ACH_CATS 中登记
cats_declared = re.findall(r"\{\s*id:\s*'(\w+)',\s*name:\s*'([^']+)',\s*icon:\s*'([^']*)'\s*\}", src)
declared_ids = {c[0] for c in cats_declared}
used = {d['cat'] for d in defs}
undeclared = used - declared_ids
if undeclared:
    print('❌ 未在 ACH_CATS 登记的分类: %s' % undeclared); ok = False

print('--- 分类分布 ---')
order = [c[0] for c in cats_declared]
for c in order:
    n = sum(1 for d in defs if d['cat'] == c)
    if n:
        print('  %-8s %2d 项' % (c, n))
print()

print('--- 新增成就的判定依据 ---')
checks = [
    ('退役球衣', 'jersey', 'jerseyTeams'),
    ('名人堂', 'hof', 'legacy.hof'),
    ('历史百大', 'top100', 'legacy.top100'),
    ('历史最佳', 'goat', 'legacy.goat'),
    ('进步最快', "mip: 'mip'", 'actKinds.mip'),
    ('最佳防守阵容', "alldefensive", 'actKinds'),
    ('得分王', "scoringchamp", 'actKinds'),
    ('篮板王', "rebchamp", 'actKinds'),
    ('助攻王', "astchamp", 'actKinds'),
    ('抢断王', "stlchamp", 'actKinds'),
    ('盖帽王', "blkchamp", 'actKinds'),
    ('三分王', "threechamp", 'actKinds'),
]
for name, needle, where in checks:
    hit = needle in src
    print('  %-14s %s  (%s)' % (name, '✔' if hit else '✘缺失', where))
    if not hit:
        ok = False

print()
print('✅ 全部检查通过' if ok else '❌ 存在问题，见上')
sys.exit(0 if ok else 1)
