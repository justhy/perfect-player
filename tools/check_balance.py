# -*- coding: utf-8 -*-
"""校验成就 LP 产出与传承树成本是否保持固定缺口。

缺口方向（v4 起修正）：必须是「成本 > 产出」，即
    全路线总成本 - LP 总产出 == LEGACY_COST_GAP
早先的 v3 算成了「产出 - 成本 == 3」，数值同为 3 但方向相反，
导致玩家能点满全路线还剩 3 点，专精取舍实际失效。
"""
import io, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'assets', 'js', 'perfect-player-enhancements.js')
s = io.open(P, 'rb').read().decode('utf-8')

LP = {'common': 1, 'rare': 2, 'epic': 4, 'legend': 8}

# 从源码读缺口常量，避免脚本与代码各写一个数字
_m = re.search(r"LEGACY_COST_GAP\s*=\s*(\d+)", s)
EXPECT_GAP = int(_m.group(1)) if _m else 3

items = re.findall(r"id:\s*'[a-zA-Z_0-9]+',\s*icon:[^\n]*?rarity:\s*'(\w+)',\s*cat:", s)
perks = re.findall(r"id:\s*'(\w+)'[^\n]*?costs:\s*\[([0-9,\s]+)\]", s)

total_lp = sum(LP[r] for r in items)
tree = 0
print('%-10s %-24s %s' % ('路线', '逐级价格', '小计'))
print('-' * 52)
for pid, raw in perks:
    costs = [int(x) for x in raw.split(',') if x.strip()]
    tree += sum(costs)
    print('%-10s %-24s %d' % (pid, str(costs), sum(costs)))
print('-' * 52)
gap = tree - total_lp

print()
print('成就总数      : %d' % len(items))
print('LP 总产出     : %d' % total_lp)
print('全路线总成本  : %d' % tree)
print('缺口(成本-产出): %d' % gap)

ok = True
if total_lp >= tree:
    print('\n❌ LP 产出(%d) >= 全路线成本(%d)：玩家可以点满全部路线，专精取舍失效' % (total_lp, tree))
    ok = False
elif gap != EXPECT_GAP:
    print('\n❌ 缺口应为 %d，当前 %d' % (EXPECT_GAP, gap))
    ok = False
else:
    print('\n✅ 缺口 = %d（成本 > 产出），全成就也无法点满全路线，必须做专精取舍' % gap)

# 每条路线单独是否可点满（用于确认取舍真实存在）
print('\n单路线满级成本（对比总产出 %d）：' % total_lp)
for pid, raw in perks:
    costs = [int(x) for x in raw.split(',') if x.strip()]
    s_ = sum(costs)
    print('  %-10s %3d  %s' % (pid, s_, '可单独点满' if s_ <= total_lp else '不足，需搭配其他路线'))

sys.exit(0 if ok else 1)
