// ClutchGames — reads small static JSON files generated daily by the
// GitHub Actions workflow (nba_digest_website.py), which also writes to a
// private Google Sheet used as the human-editable audit log. The site never
// talks to the Sheet directly.
//
// Data layout: data/{sport}/index.json (list of available dates, newest
// first) + data/{sport}/{date}.json (that day's games). Only "nba" exists
// today, but the path is sport-namespaced so adding another sport later is
// "add a folder," not a rewrite. No sport-switcher UI exists yet.

const SPORT = "nba";
const DATA_DIR = `data/${SPORT}`;

const DOTS_ON = "●";
const DOTS_OFF = "○";

function dotsHtml(score) {
  let html = "";
  for (let i = 0; i < 5; i++) {
    html += `<span class="${i < score ? "on" : "off"}">${i < score ? DOTS_ON : DOTS_OFF}</span>`;
  }
  return html;
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function renderGames(games) {
  const container = document.getElementById("games-container");
  container.innerHTML = "";

  const sorted = [...games].sort((a, b) => b.closeness - a.closeness);

  sorted.forEach((g, idx) => {
    const card = document.createElement("div");
    card.className = "game-card";

    const away = g.away_abbr || g.away;
    const home = g.home_abbr || g.home;

    card.innerHTML = `
      <div class="game-top">
        <div class="matchup">${away} @ ${home}</div>
        <div class="rank-badge">#${idx + 1}</div>
      </div>
      <div class="closeness-row">
        <span class="dots">${dotsHtml(g.closeness)}</span>
        <span class="rating-label">${g.rating}</span>
      </div>
      <button class="reveal-btn" type="button">🔒 Reveal score</button>
      <div class="score-panel">
        <div class="team-line">
          <span>${g.away}</span>
          <span class="${g.winner === g.away ? "winner" : ""}">${g.away_score}</span>
        </div>
        <div class="team-line">
          <span>${g.home}</span>
          <span class="${g.winner === g.home ? "winner" : ""}">${g.home_score}</span>
        </div>
      </div>
    `;

    const btn = card.querySelector(".reveal-btn");
    const panel = card.querySelector(".score-panel");
    btn.addEventListener("click", () => {
      const shown = panel.classList.toggle("shown");
      btn.textContent = shown ? "🔓 Hide score" : "🔒 Reveal score";
    });

    container.appendChild(card);
  });
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed for ${path}: ${res.status}`);
  return res.json();
}

async function main() {
  const statusEl = document.getElementById("status");
  try {
    const dates = await fetchJson(`${DATA_DIR}/index.json`);

    if (!dates.length) {
      statusEl.textContent = "No games found yet — check back after the next digest run.";
      return;
    }

    const picker = document.getElementById("date-picker");
    const select = document.getElementById("date-select");
    const subtitle = document.getElementById("subtitle");

    dates.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = fmtDateLabel(d);
      select.appendChild(opt);
    });
    picker.style.display = dates.length > 1 ? "flex" : "none";

    const cache = {};
    async function showDate(d) {
      subtitle.textContent = fmtDateLabel(d);
      statusEl.textContent = "Loading games…";
      statusEl.style.display = "block";
      try {
        if (!cache[d]) {
          const dayData = await fetchJson(`${DATA_DIR}/${d}.json`);
          cache[d] = dayData.games;
        }
        statusEl.style.display = "none";
        renderGames(cache[d]);
      } catch (err) {
        console.error(err);
        statusEl.textContent = "Couldn't load that day's games.";
        statusEl.classList.add("error");
      }
    }

    select.addEventListener("change", () => showDate(select.value));
    await showDate(dates[0]);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load games right now — please check back later.";
    statusEl.classList.add("error");
  }
}

main();
