#!/usr/bin/env python3
"""
NBA Daily Digest - Website Version
Fetches yesterday's NBA results, scores each game on a 1-5 closeness scale,
appends rows to Google Sheets (the human-editable audit log), and writes
small static JSON files under docs/data/nba/ that the public website reads.

Changes from personal version:
- No team exclusions — all games are included
- Runs on UTC time rather than Melbourne (AEDT) time, suitable for a global audience

Note on closeness scoring: the scale below is NBA-specific (point-differential
thresholds tuned for basketball scoring). Other sports (NFL/AFL/MLB) would need
their own scale, not a shared/generic one — deliberately not abstracted yet
since no other sport exists in this project.
"""

import os
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

# ── Config (set these as GitHub Actions secrets) ──────────────────────────────
SPORTRADAR_KEY      = os.environ["SPORTRADAR_KEY"]       # Sportradar free API key
SPREADSHEET_ID      = os.environ["SPREADSHEET_ID"]       # Google Sheet ID (from URL)
GOOGLE_CREDENTIALS  = os.environ["GOOGLE_CREDENTIALS"]  # Service account JSON (as string)

SHEET_NAME          = "NBA Digest"         # Tab name inside your spreadsheet

# Optional override for testing/backfilling against a specific past date
# (format YYYY-MM-DD). Unset in normal daily runs, which use "yesterday UTC".
TARGET_DATE = os.environ.get("TARGET_DATE")

# Where the site's data files live, relative to this script's location
# (this script sits at the repo root, docs/ is served by GitHub Pages).
DATA_DIR = Path(__file__).parent / "docs" / "data" / "nba"

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

# ── Fetch yesterday's (or TARGET_DATE's) NBA games from Sportradar ───────────
def fetch_games():
    if TARGET_DATE:
        target = datetime.strptime(TARGET_DATE, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        # Use UTC — the workflow runs at 07:00 UTC, after US games have finished
        target = datetime.now(timezone.utc) - timedelta(days=1)

    date_str   = target.strftime("%Y/%m/%d")
    date_label = target.strftime("%Y-%m-%d")

    url = (
        f"https://api.sportradar.com/nba/trial/v8/en/games/{date_str}/schedule.json"
        f"?api_key={SPORTRADAR_KEY}"
    )
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    games = []
    for g in data.get("games", []):
        if g.get("status") != "closed":
            continue

        home       = g["home"]["name"]
        away       = g["away"]["name"]
        home_score = g["home_points"]
        away_score = g["away_points"]
        winner     = home if home_score > away_score else away
        loser      = away if home_score > away_score else home
        margin     = abs(home_score - away_score)
        level, label = closeness(home_score, away_score)

        games.append({
            "date":       date_label,
            "away":       away,
            "away_abbr":  g["away"]["alias"],
            "away_score": away_score,
            "home":       home,
            "home_abbr":  g["home"]["alias"],
            "home_score": home_score,
            "winner":     winner,
            "loser":      loser,
            "margin":     margin,
            "closeness":  level,
            "rating":     label,
            "dots":       dots(level),
        })

    # Sort by closeness descending (most competitive first)
    games.sort(key=lambda g: g["closeness"], reverse=True)

    return games, date_label

# ── Connect to Google Sheets ──────────────────────────────────────────────────
def get_sheets_service():
    creds_info = json.loads(GOOGLE_CREDENTIALS)
    creds = service_account.Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)

# ── Ensure header row exists ──────────────────────────────────────────────────
HEADERS = [
    "Date", "Away Team", "Away Abbr", "Away Score",
    "Home Team", "Home Abbr", "Home Score",
    "Winner", "Loser", "Margin", "Closeness (1-5)", "Rating", "Scale"
]

def ensure_headers(service):
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A1:M1"
    ).execute()
    existing = result.get("values", [])
    if not existing or existing[0] != HEADERS:
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_NAME}!A1",
            valueInputOption="RAW",
            body={"values": [HEADERS]}
        ).execute()
        print("✅ Header row written")

# ── Dedup guard: don't re-log a game already in the sheet ─────────────────────
def get_existing_keys(service):
    """(date, away, home) keys already present in the sheet, for dedup."""
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:E"
    ).execute()
    keys = set()
    for row in result.get("values", []):
        if len(row) >= 5:
            keys.add((row[0], row[1], row[4]))  # date, away, home
    return keys

# ── Append game rows ──────────────────────────────────────────────────────────
def append_rows(service, games):
    existing = get_existing_keys(service)

    rows = []
    skipped = 0
    for g in games:
        key = (g["date"], g["away"], g["home"])
        if key in existing:
            skipped += 1
            continue
        rows.append([
            g["date"],
            g["away"], g["away_abbr"], g["away_score"],
            g["home"], g["home_abbr"], g["home_score"],
            g["winner"], g["loser"], g["margin"],
            g["closeness"], g["rating"], g["dots"],
        ])

    if skipped:
        print(f"Skipped {skipped} already-logged game(s)")

    if not rows:
        print("No new rows to append.")
        return

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A1",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows}
    ).execute()
    print(f"✅ Appended {len(rows)} rows to Google Sheet")

# ── Write static JSON files for the website ────────────────────────────────────
def write_json_files(games, date_label):
    """Writes docs/data/nba/{date}.json and updates docs/data/nba/index.json.
    Independent of the sheet's dedup guard — always reflects the full set of
    games fetched for this date (each date's file is simply overwritten)."""
    if not games:
        print("No games to write to JSON.")
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    day_file = DATA_DIR / f"{date_label}.json"
    day_file.write_text(json.dumps(
        {"sport": "nba", "date": date_label, "games": games},
        indent=2,
    ))

    index_file = DATA_DIR / "index.json"
    dates = json.loads(index_file.read_text()) if index_file.exists() else []
    if date_label not in dates:
        dates.append(date_label)
    dates = sorted(set(dates), reverse=True)
    index_file.write_text(json.dumps(dates, indent=2))

    print(f"✅ Wrote {day_file.name} and updated index.json ({len(dates)} date(s) total)")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Fetching NBA games...")
    games, date_label = fetch_games()
    print(f"Found {len(games)} games for {date_label}")

    print("Connecting to Google Sheets...")
    service = get_sheets_service()
    ensure_headers(service)
    append_rows(service, games)

    write_json_files(games, date_label)

    print("Done! 🏀")
