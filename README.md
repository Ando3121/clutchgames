# ClutchGames

Spoiler-free NBA daily digest. Every game from the previous day is ranked by
how close it was — no scores or winners shown until you click to reveal.

- `nba_digest_website.py` — runs daily via GitHub Actions, fetches scores from
  Sportradar, and appends them to a Google Sheet.
- `docs/` — the public site (GitHub Pages), reads the same Google Sheet
  client-side (view-only share link, no backend).

See `NBA_DIGEST_CONTEXT.md` for full project rules and setup details.
