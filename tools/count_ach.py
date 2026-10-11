# -*- coding: utf-8 -*-
"""统计各分类成就数量，用于估算面板所需高度。"""
import io, re, os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'assets', 'js', 'perfect-player-enhancements.js')
s = io.open(P, 'rb').read().decode('utf-8')

cats = re.findall(r"\{\s*id:\s*'([a-z]+)',\s*name:\s*'([^']*)',\s*icon:\s*'([^']*)'", s)
items = re.findall(r"id:\s*'[a-zA-Z_0-9]+',\s*icon:[^\n]*?cat:\s*'(\w+)'", s)
c = Counter(items)
print('分类数 %d，成就总数 %d' % (len(cats), len(items)))
tot = 0
mx = 0
for cid, nm, ic in cats:
    n = c.get(cid, 0)
    tot += n
    mx = max(mx, n)
    print('  %-8s %-6s %-8s %d 项' % (cid, ic, nm, n))
print('合计 %d，单分类最大 %d 项' % (tot, mx))
print('成就定义总数 %d' % len(re.findall(r"\{ id: '", s)))
