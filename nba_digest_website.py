#!/usr/bin/env python3
"""
NBA Daily Digest - Website Version
Fetches recently completed NBA games from balldontlie.io, scores each game
on a 1-5 closeness scale, and merges results into small static JSON files
under docs/data/nba/ that the public website reads.

Runs hourly during game hours via GitHub Actions. Each run checks "today"
and "yesterday" (US Eastern, the NBA's own game-date convention) and merges
any newly-finished games into that date's JSON file - already-published
games are left untouched, so games appear on the site within about an hour
of finishing rather than in one daily batch.

Note on closeness scoring: the scale below is NBA-specific (point-differential
thresholds tuned for basketball scoring). Other sports (NFL/AFL/MLB) would need
their own scale, not a shared/generic one - deliberately not abstracted yet
since no other sport exists in this project.
"""

import os
import json
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BALLDONTLIE_API_KEY = os.environ["BALLDONTLIE_API_KEY"]

# Optional override for testing/backfilling against a specific past date
# (format YYYY-MM-DD). Unset in normal hourly runs, which check "today and
# yesterday" in US Eastern time.
TARGET_DATE = os.environ.get("TARGET_DATE")

# Where the site's data files live, relative to this script's location
# (this script sits at the repo root, docs/ is served by GitHub Pages).
DATA_DIR = Path(__file__).parent / "docs" / "data" / "nba"

ET = ZoneInfo("America/New_York")

# ── Closeness scale (NBA-specific) ────────────────────────────────────────────
def closeness(score_a, score_b):
    diff = abs(score_a - score_b)
    if diff <= 4:  return 5, "Thriller"
    if diff <= 8:  return 4, "Competitive"
    if diff <= 14: return 3, "Some drama"
    if diff <= 22: return 2, "Not close"
    return 1, "Blowout"

def dots(score):
    return "●" * score + "○" * (5 - score)

# ── Which game-dates to check this run ────────────────────────────────────────
def dates_to_check():
    if TARGET_DATE:
        return [TARGET_DATE]
    today_et = datetime.now(ET).date()
    yesterday_et = today_et - timedelta(days=1)
    return [d.isoformat() for d in (yesterday_et, today_et)]

# ── Fetch completed games for one date from balldontlie.io ────────────────────
def fetch_games_for_date(date_label):
    url = f"https://api.balldontlie.io/v1/games?dates[]={date_label}"
    req = urllib.request.Request(url, headers={"Authorization": BALLDONTLIE_API_KEY})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    games = []
    for g in data.get("data", []):
        if g.get("status_state") != "final":
            continue

        home = g["home_team"]
        away = g["visitor_team"]
        home_score = g["home_team_score"]
        away_score = g["visitor_team_score"]
        winner = home["full_name"] if home_score > away_score else away["full_name"]
        loser  = away["full_name"] if home_score > away_score else home["full_name"]
        margin = abs(home_score - away_score)
        level, label = closeness(home_score, away_score)

        games.append({
            "date":       date_label,
            "away":       away["full_name"],
            "away_abbr":  away["abbreviation"],
            "away_score": away_score,
            "home":       home["full_name"],
            "home_abbr":  home["abbreviation"],
            "home_score": home_score,
            "winner":     winner,
            "loser":      loser,
            "margin":     margin,
            "closeness":  level,
            "rating":     label,
            "dots":       dots(level),
        })

    games.sort(key=lambda g: g["closeness"], reverse=True)
    return games

# ── Merge newly-finished games into that date's JSON file ─────────────────────
def merge_into_json(date_label, new_games):
    """Merges new_games into docs/data/nba/{date_label}.json, keeping already-
    published games untouched (matched by away+home team). Updates index.json
    if this is a newly-seen date. Returns the number of games actually added."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    day_file = DATA_DIR / f"{date_label}.json"

    existing_games = []
    if day_file.exists():
        existing_games = json.loads(day_file.read_text())["games"]
    existing_keys = {(g["away"], g["home"]) for g in existing_games}

    added = 0
    for g in new_games:
        key = (g["away"], g["home"])
        if key not in existing_keys:
            existing_games.append(g)
            existing_keys.add(key)
            added += 1

    if not existing_games:
        return 0  # nothing published or newly found for this date - write nothing

    existing_games.sort(key=lambda g: g["closeness"], reverse=True)
    day_file.write_text(json.dumps(
        {"sport": "nba", "date": date_label, "games": existing_games},
        indent=2,
    ))

    index_file = DATA_DIR / "index.json"
    dates = json.loads(index_file.read_text()) if index_file.exists() else []
    if date_label not in dates:
        dates.append(date_label)
        dates = sorted(set(dates), reverse=True)
        index_file.write_text(json.dumps(dates, indent=2))

    return added

# ── Main ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    total_added = 0
    for date_label in dates_to_check():
        print(f"Checking {date_label}...")
        games = fetch_games_for_date(date_label)
        print(f"  Found {len(games)} completed game(s)")
        added = merge_into_json(date_label, games)
        if added:
            print(f"  ✅ Added {added} new game(s) to {date_label}.json")
        total_added += added

    if total_added:
        print(f"Done — {total_added} new game(s) published. 🏀")
    else:
        print("Done — no new games to publish.")
