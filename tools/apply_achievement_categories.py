# -*- coding: utf-8 -*-
"""一次性脚本：为 ACHIEVEMENTS 定义补cat 字段，并把成就面板改成分类分组渲染。"""
import io, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'assets', 'js', 'perfect-player-enhancements.js')

raw = io.open(P, 'rb').read()
had_bom = raw[:3] == b'\xef\xbb\xbf'
text = raw.decode('utf-8-sig')

# ── 1) 给每个成就补cat ─────────────────────────────────────────────
CAT = {
    # 起步
    'create_player': 'start', 'ovr_80': 'start', 'ovr_90': 'start', 'ovr_95': 'start',
    # 选秀
    'lottery_pick': 'draft', 'first_pick': 'draft', 'undrafted': 'draft',
    # 个人荣誉
    'all_star': 'honor', 'all_nba': 'honor', 'roty': 'honor', 'dpoy': 'honor',
    'sixth_man': 'honor', 'mvp': 'honor', 'fmvp': 'honor', 'mvp_x3': 'honor',
    # 球队战绩
    'playoffs': 'team', 'win_60': 'team', 'champion': 'team', 'champion_x3': 'team',
    # 单场数据
    'game_40': 'game', 'game_50': 'game', 'triple_double': 'game',
    'game_60': 'game', 'game_70': 'game', 'quadruple_double': 'game',
    'game_20_ast': 'game', 'game_20_reb': 'game',
    # 赛季场均
    'avg_30': 'season', 'season_25_10': 'season', 'avg_10_ast': 'season',
    'avg_12_reb': 'season', 'avg_35': 'season',
    # 生涯长度/累计
    'season_5': 'career', 'season_10': 'career', 'retire': 'career',
    'career_20000': 'career', 'career_30000': 'career', 'career_40000': 'career',
    'career_50000': 'career',
    # 彩蛋
    'explorer': 'meta', 'collector': 'meta',
}

added = [0]

def add_cat(m):
    aid = m.group(1)
    cat = CAT.get(aid)
    if not cat:
        return m.group(0)
    # 已带cat 则不重复添加
    if re.search(r",\s*cat:\s*'", m.group(0)):
        return m.group(0)
    added[0] += 1
    return m.group(0)[:-1].rstrip() + ", cat: '" + cat + "' }"

pat = re.compile(r"\{\s*id:\s*'([a-zA-Z_0-9]+)'\s*,\s*icon:[^\n]*?rarity:\s*'\w+'\s*\}")
text2, nsub = pat.subn(add_cat, text)
print('cat 字段补充: %d 处' % added[0])

missing = [k for k in CAT if ("id: '" + k + "'") in text2 and ("id: '" + k + "', cat") not in text2]
if missing:
    print('警告: 这些 id 未成功加 cat ->', missing)

out = text2.encode('utf-8')
if had_bom:
    out = b'\xef\xbb\xbf' + out
io.open(P, 'wb').write(out)
print('写入完成，字节数 %d -> %d' % (len(raw), len(out)))
