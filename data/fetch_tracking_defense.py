"""Fetch NBA tracking DEFENDED FG% (closest-defender) per player-season, 2013-14 -> 2025-26.
Run on a machine with open internet:  pip install nba_api pandas  ->  python fetch_tracking_defense.py
Output: tracking_defense.csv (season, category, player_name, dfg_pct, expected_pct, diff_pct, freq)

Categories fetched:
  Overall            every shot he was closest defender on (rim + mid + threes)
  Less Than 6Ft      rim protection — the deterrence half
  Greater Than 15Ft  the perimeter half, which is what perdef should lean on
  3 Pointers         the pure three-point slice

build_ratings.py auto-ingests this file if present next to it. NEVER hand-edit values;
a season that fails is skipped and reported, never fabricated."""
import time, csv
from nba_api.stats.endpoints import leaguedashptdefend

CATEGORIES = ["Overall", "Less Than 6Ft", "Greater Than 15Ft", "3 Pointers"]
rows = []
missing = []
for yr in range(2014, 2027):
    season = f"{yr-1}-{str(yr)[2:]}"
    for cat in CATEGORIES:
        for attempt in range(3):
            try:
                d = leaguedashptdefend.LeagueDashPtDefend(season=season, defense_category=cat,
                                                          per_mode_simple="PerGame").get_data_frames()[0]
                break
            except Exception as e:
                print(f"{season} {cat} attempt {attempt+1} failed: {e}"); time.sleep(5)
        else:
            print(f"SKIPPING {season} {cat} — do not fabricate"); missing.append((season, cat)); continue
        # every slice carries its own column names; the diff column is PLUSMINUS outside Overall
        pct = {"Overall": "D_FG_PCT", "Less Than 6Ft": "LT_06_PCT", "Greater Than 15Ft": "GT_15_PCT", "3 Pointers": "FG3_PCT"}[cat]
        exp = {"Overall": "NORMAL_FG_PCT", "Less Than 6Ft": "NS_LT_06_PCT", "Greater Than 15Ft": "NS_GT_15_PCT", "3 Pointers": "NS_FG3_PCT"}[cat]
        diff = "PCT_PLUSMINUS" if cat == "Overall" else "PLUSMINUS"
        att = {"Overall": "D_FGA", "Less Than 6Ft": "FGA_LT_06", "Greater Than 15Ft": "FGA_GT_15", "3 Pointers": "FG3A"}[cat]
        for _, r in d.iterrows():
            rows.append(dict(season=yr, category=cat, player_name=r["PLAYER_NAME"],
                             dfg_pct=r.get(pct), expected_pct=r.get(exp), diff_pct=r.get(diff),
                             freq=r.get("FREQ"), att=r.get(att), gp=r.get("GP")))
        print(f"{season} {cat}: {len(d)} players")
        time.sleep(1.5)
with open("tracking_defense.csv", "w", newline="", encoding="utf-8") as f:   # names carry accents; cp1255 is not an option
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print(f"wrote tracking_defense.csv ({len(rows)} rows)")
if missing:
    print("MISSING (skipped, not fabricated):", missing)
