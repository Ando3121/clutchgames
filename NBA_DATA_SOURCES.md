# NBA Game Results — How Data is Fetched

## Overview

When a user asks for NBA game results in chat, Claude uses two data sources in priority order:

1. **`fetch_sports_data` tool** (primary)
2. **Web search** (fallback)

---

## 1. fetch_sports_data Tool

A built-in Claude tool that pulls live and recent NBA scores directly.

### Usage
```
fetch_sports_data(
    data_type="scores",
    league="nba"
)
```

### What it returns
- Recent completed games with final scores
- Live in-progress games
- Upcoming scheduled games
- Team names, abbreviations, and scores for both home and away teams
- Game status (e.g. "closed" for completed games)

### Limitations
- Sometimes lags 1–2 days behind the most recent games
- Occasionally missing play-in or playoff games
- Does not always have same-day results for late US tip-offs

---

## 2. Web Search (fallback)

If `fetch_sports_data` doesn't return the expected games, Claude immediately falls back to web search — **without telling the user** the first source failed.

### Search queries used
General results for a date:
```
NBA playoff games [Month Day Year] scores results
```

For a specific game:
```
[Team A] [Team B] Game [X] [Month Day Year] final score
```

### Reliable sources found in search results
- **ESPN** — `espn.com/nba/scoreboard`
- **GMA Network** — `gmanetwork.com` (good for Filipino basketball coverage, often has clean score summaries)
- **Land of Basketball** — `landofbasketball.com/yearbyyear/` (good for playoff results by year)
- **Wikipedia** — `en.wikipedia.org/wiki/2026_NBA_playoffs` (good for series results and context)
- **Google's sports results** — often shown directly in search snippets

---

## 3. How scores are processed after fetching

Once scores are retrieved from either source, Claude applies the following logic before displaying results:

### Closeness calculation
```python
def closeness(score_a, score_b):
    diff = abs(score_a - score_b)
    if diff <= 4:  return 5, "Thriller"
    if diff <= 8:  return 4, "Competitive"
    if diff <= 14: return 3, "Some drama"
    if diff <= 22: return 2, "Not close"
    return 1, "Blowout"
```

### Ranking
Games are sorted by closeness score descending — most competitive game listed first (rank 1).

### Spoiler protection
- Final scores are hidden inside a `<details>` block by default
- Winner, loser, and series outcomes are never mentioned in the summary
- Overtime is never mentioned (it reveals that a game was close and went long)

---

## 4. What to replicate for the website

For the website to replicate what Claude does in chat, it needs a data source that provides:

| Field | Example |
|---|---|
| Game date | `2026-05-15` |
| Home team name | `Cleveland Cavaliers` |
| Home team abbreviation | `CLE` |
| Away team name | `Detroit Pistons` |
| Away team abbreviation | `DET` |
| Home score | `116` |
| Away score | `109` |
| Game status | `closed` (i.e. completed) |

### Recommended free APIs for the website
| API | Cost | Notes |
|---|---|---|
| **balldontlie.io** | Free, no key needed | Easiest to get started |
| **Sportradar** | Free trial tier | More reliable, requires signup |
| **ESPN (unofficial)** | Free, no key | Undocumented, may break |

---

## 5. Timezone note

All game dates are based on **US Eastern Time** (when games are played). Claude converts to **Melbourne AEDT (UTC+11)** when determining what "yesterday" or "today" means for the user. The website version uses **UTC** as a neutral timezone for a global audience.
