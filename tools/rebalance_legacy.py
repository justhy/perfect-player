# -*- coding: utf-8 -*-
"""【已废弃·请勿运行】重配传承点平衡：全路线成本 = 全部成就 LP 产出 - GAP，保持"必须专精"的设计意图。

做法：只在最贵的两条路线（prodigy 全属性 / clutch 大心脏）上按比例抬价，
不动 4 条常规路线的逐级价格结构，避免老存档的已购等级价格发生漂移。

================================================================================
⚠️ 危险：本脚本存在正则回溯 bug，实际运行会把 LEGACY_PERKS 总成本改到 112
   （远低于 LP 产出），直接摧毁"必须专精"的平衡设计。已确认该 bug 真实发生过。

正确做法：手动 Edit assets/js/perfect-player-enhancements.js 里的 LEGACY_PERKS，
   改完后必须同步 bump LEGACY_SCHEMA_VERSION，然后跑tools/check_balance.py 验证。
本文件仅作历史记录保留，勿删亦勿运行。
================================================================================
"""
import io, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'assets', 'js', 'perfect-player-enhancements.js')

GAP = 3  # 故意保留的缺口点数

raw = io.open(P, 'rb').read()
had_bom = raw[:3] == b'\xef\xbb\xbf'
text = raw.decode('utf-8-sig')

# 当前成就 LP 产出
items = re.findall(
    r"\{\s*id:\s*'[a-zA-Z_0-9]+'\s*,\s*icon:[^\n]*?rarity:\s*'(\w+)'\s*,\s*cat:", text)
LP = {'common': 1, 'rare': 2, 'epic': 4, 'legend': 8}
total_lp = sum(LP[r] for r in items)
print('成就数: %d  |  LP 产出: %d' % (len(items), total_lp))

# 当前传承树成本
m = re.search(r"var LEGACY_PERKS = \[(.*?)\n  \];", text, re.S)
block = m.group(1)
perks = re.findall(r"id:\s*'(\w+)'.*?costs:\s*\[([0-9,\s]+)\]", block)
cur_tree = sum(sum(int(x) for x in c.split(',') if x.strip()) for _, c in perks)
print('当前全路线成本: %d  (缺口 %d)' % (cur_tree, total_lp - cur_tree))

target = total_lp - GAP
need = target - cur_tree
print('目标成本: %d  |  需增加: %d' % (target, need))

if need <= 0:
    print('无需调整（当前成本已高于目标，缺口语义失效）')
    sys.exit(1)

# 只调整最贵的两条路线：prodigy（成本最高）和 clutch
new_block = block
bump = {}
for pid, costs_raw in perks:
    if pid not in ('prodigy', 'clutch'):
        continue
    costs = [int(x) for x in costs_raw.split(',') if x.strip()]
    share = costs[-1] / float(sum(costs))
    add = int(round(need * share))
    if add <= 0:
        continue
    new_costs = costs[:-1] + [costs[-1] + add]
    bump[pid] = (costs, new_costs, add)
    old_txt = 'costs: [%s]' % ', '.join(str(c) for c in costs)
    new_txt = 'costs: [%s]' % ', '.join(str(c) for c in new_costs)
    # 仅替换该路线那一行
    pat = re.compile(r"(id:\s*'" + pid + r"'[^\n]*?costs:\s*\[)" + re.escape(
        ', '.join(str(c) for c in costs)) + r"(\])")
    new_block, n = pat.subn(lambda mm: mm.group(1) + new_txt[7:] + mm.group(2), new_block)
    assert n == 1, '替换失败: ' + pid

new_tree = sum(sum(int(x) for x in c.split(',') if x.strip())
               for _, c in re.findall(r"id:\s*'(\w+)'.*?costs:\s*\[([0-9,\s]+)\]", new_block))

text = text[:m.start(1)] + new_block + text[m.end(1):]

for pid, (old, new, add) in bump.items():
    print('  %-8s %s -> %s  (+%d)' % (pid, old, new, add))

# 把除数固定为GAP 会在玩家凑满时留出精确缺口
text = text.replace(
    "'.pp-lg-hint'", "'.pp-lg-hint'", 1)
out = text.encode('utf-8')
if had_bom:
    out = b'\xef\xbb\xbf' + out
io.open(P, 'wb').write(out)
print('新全路线成本: %d  |  新缺口: %d  ✅' % (new_tree, total_lp - new_tree))
