# -*- coding: utf-8 -*-
"""导出全部成就清单（按分类分组），用于人工核对。"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'assets', 'js', 'perfect-player-enhancements.js')
s = io.open(P, 'rb').read().decode('utf-8')

# 分类元数据
cat_block = re.search(r'var ACH_CATS = \[(.*?)\];', s, re.S).group(1)
cats = re.findall(r"\{\s*id:\s*'(\w+)',\s*name:\s*'([^']*)',\s*icon:\s*'([^']*)'", cat_block)
cat_name = {c[0]: (c[2], c[1]) for c in cats}
order = [c[0] for c in cats]

# 成就定义（逐条，允许多行）
items = []
for m in re.finditer(
        r"\{\s*id:\s*'([a-zA-Z_0-9]+)',\s*icon:\s*'([^']*)',\s*name:\s*'([^']*)',\s*"
        r"desc:\s*'([^']*)',\s*rarity:\s*'(\w+)',\s*cat:\s*'(\w+)'", s):
    items.append(m.groups())

RCN = {'common': '普通', 'rare': '稀有', 'epic': '史诗', 'legend': '传奇'}

by_cat = {}
for aid, ic, nm, desc, rar, cat in items:
    by_cat.setdefault(cat, []).append((aid, ic, nm, desc, rar))

total = len(items)
print('成就总数：%d 项，分类 %d 个\n' % (total, len(order)))
LP = {'common': 1, 'rare': 2, 'epic': 4, 'legend': 8}
sum_lp = 0
idx = 0
for cat in order:
    lst = by_cat.get(cat, [])
    if not lst:
        continue
    nm, ic = cat_name.get(cat, (cat, ''))
    got = [x for x in lst if x[4] != '']
    print('【%s %s】%d 项  传承点 %d' % (ic, nm, len(lst), sum(LP[x[4]] for x in lst)))
    for aid, i2, n2, d2, r2 in lst:
        idx += 1
        sum_lp += LP[r2]
        print('  %2d. %-22s %-4s %-14s %s' % (idx, aid, i2, n2, d2))
    print()
print('─' * 60)
print('LP 总产出：%d' % sum_lp)