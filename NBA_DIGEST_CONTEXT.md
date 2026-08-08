# NBA Daily Digest — Project Context

## What this project does
Fetches the previous day's NBA game results, scores each game on a 1–5 closeness scale, and outputs a spoiler-free summary. Results are written to a Google Sheet automatically each day via a GitHub Actions workflow.

---

## Rules (always apply)

- **Never reveal who won a game** in the summary — scores, winners, series outcomes, and overtime must all be hidden by default
- **Never mention if a game went to overtime** — this is a spoiler
- **Never reveal series outcomes** (e.g. "Team X advance", "series over") — only show scores when the user explicitly asks to reveal them
- **Rank games by closeness** — most competitive game listed first
- **Melbourne time (AEDT, UTC+11)** is the reference timezone — "yesterday" and "today" are calculated relative to Melbourne, not US timezones

---

## Closeness Scale (1–5)

| Score | Label | Point Differential |
|---|---|---|
| 🔵 5 | Thriller | 0–4 pts |
| 🟢 4 | Competitive | 5–8 pts |
| 🟡 3 | Some drama | 9–14 pts |
| 🟠 2 | Not close | 15–22 pts |
| 🔴 1 | Blowout | 23+ pts |

---

## Output Format

### Summary table (spoiler-free, always shown)
```
**🏀 NBA Playoffs — [Day Date Month]** · [Round, Game X] · Ranked by closeness

| Rank | Matchup | Closeness | Rating |
|---|---|---|---|
| 1 | TEAM_A @ TEAM_B | 🔵🔵🔵🔵🔵 | Thriller (Xpt gap) |
| 2 | TEAM_C @ TEAM_D | 🟡🟡🟡⚫⚫ | Some drama (Xpt gap) |
```

### Score reveal (hidden by default)
Wrap scores in a `<details>` block so the user can choose to reveal:
```
<details><summary>🔒 Reveal scores</summary>
| Matchup | Score |
|---|---|
| TEAM_A @ TEAM_B | 112 – 108 |
</details>
```

### Brief commentary (after table)
- Highlight the best game of the night
- Note any unusual in-game drama (big comebacks, dominant runs) without revealing the winner
- Keep it to 2–3 sentences

---

## Data Sources (in priority order)

1. **fetch_sports_data tool** (NBA scores) — check this first for recent games
2. **Web search** — always search the web if the sports data tool doesn't have results; never tell the user games haven't finished without checking the web first
3. Useful URLs:
   - ESPN scores: `https://www.espn.com/nba/scoreboard/_/date/YYYYMMDD`
   - ESPN playoffs: `https://www.espn.com/nba/story/_/id/48419498/nba-playoffs-2026-...`
   - Wikipedia 2026 playoffs: `https://en.wikipedia.org/wiki/2026_NBA_playoffs`

---

## Automation Setup

### GitHub Actions workflow
- Runs daily at **07:00 UTC = 5:00 PM AEDT Melbourne time**
- Workflow file: `.github/workflows/nba_digest.yml`
- Script file: `nba_digest.py`

### GitHub Secrets required
| Secret | Description |
|---|---|
| `SPORTRADAR_KEY` | Sportradar free NBA API key |
| `SPREADSHEET_ID` | Google Sheet ID (from URL) |
| `GOOGLE_CREDENTIALS` | Full contents of Google service account JSON file |

### Google Sheets setup
- Sheet tab must be named **"NBA Digest"**
- The service account email must be shared on the sheet with **Editor** access
- One row appended per game per day
- Columns: Date, Away Team, Away Abbr, Away Score, Home Team, Home Abbr, Home Score, Winner, Loser, Margin, Closeness (1-5), Rating, Scale

---

## Key files

| File | Purpose |
|---|---|
| `nba_digest.py` | Main Python script — fetches scores, calculates closeness, writes to Sheets |
| `.github/workflows/nba_digest.yml` | GitHub Actions workflow — schedules daily run |

---

## Closeness calculation (Python)

```python
def closeness(score_a, score_b):
    diff = abs(score_a - score_b)
    if diff <= 4:  return 5, "Thriller"
    if diff <= 8:  return 4, "Competitive"
    if diff <= 14: return 3, "Some drama"
    if diff <= 22: return 2, "Not close"
    return 1, "Blowout"
```

---

## 2025–26 Season context (as of May 15 2026)

### Conference Semifinals results so far
**Eastern Conference**
- NYK Knicks def. PHI 76ers 4–0
- DET Pistons vs CLE Cavaliers — tied 3–3, Game 7 May 17 in Detroit

**Western Conference**
- SAS Spurs def. MIN Timberwolves 4–2
- OKC Thunder def. LAL Lakers 4–0

### Conference Finals matchups
- **East:** NYK Knicks vs DET/CLE winner (starts ~May 19)
- **West:** SAS Spurs vs OKC Thunder (starts ~May 20)

### NBA Finals
- Starts **Wednesday June 3, 2026** — all games 8:30 PM ET on ABC

### Notable storylines
- OKC Thunder are defending champions and went 8–0 to start the playoffs
- PHI 76ers came back from 3–1 down to eliminate BOS Celtics (first time in 76ers history)
- DET Pistons also came back from 3–1 down vs ORL Magic in Round 1
- Victor Wembanyama missed several games for SAS with injury but returned strongly
- NYK's OG Anunoby missed time with a hamstring injury but returned to full training
