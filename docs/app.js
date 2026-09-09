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

// balldontlie.io abbreviations mostly match ESPN's logo CDN slugs directly
// (lowercased), except these two - verified against ESPN's CDN directly
// rather than assumed, since abbreviation conventions differ across sports
// data providers.
const LOGO_SLUG_OVERRIDES = { NOP: "no", UTA: "utah" };

function logoUrl(abbr) {
  const slug = LOGO_SLUG_OVERRIDES[abbr] || abbr.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
}

function meterHtml(score) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="seg${i <= score ? " on" : ""}"></span>`;
  }
  return html;
}

function fmtMonthLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtDayOptionLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", timeZone: "UTC" });
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

// ── Reveal state: tracked by game id so it survives re-sorting ────────────────
let revealedIds = new Set();

function teamCellHtml(name, abbr) {
  return `
    <span class="team-cell">
      <img class="logo" src="${logoUrl(abbr)}" alt="" width="24" height="24" loading="lazy"
           onerror="this.style.visibility='hidden'">
      <span class="team-name">${abbr || name}</span>
    </span>
  `;
}

function buildRow(g) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${teamCellHtml(g.away, g.away_abbr)}</td>
    <td class="at-cell">@</td>
    <td>${teamCellHtml(g.home, g.home_abbr)}</td>
    <td class="closeness-cell">
      <span class="closeness-inner">
        <span class="meter">${meterHtml(g.closeness)}</span>
        <span class="rating-label">${g.rating}</span>
      </span>
    </td>
    <td class="score-cell"></td>
  `;

  const scoreCell = tr.querySelector(".score-cell");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reveal-btn";
  scoreCell.appendChild(btn);

  function paint(revealed) {
    if (revealed) {
      btn.classList.add("revealed");
      const awayWin = g.winner === g.away ? "win" : "";
      const homeWin = g.winner === g.home ? "win" : "";
      btn.innerHTML =
        `<span class="${awayWin}">${g.away_score}</span>` +
        `<span class="dash">–</span>` +
        `<span class="${homeWin}">${g.home_score}</span>`;
      btn.setAttribute(
        "aria-label",
        `${g.away} ${g.away_score}, ${g.home} ${g.home_score}` +
          (g.winner ? `, ${g.winner} won` : "")
      );
    } else {
      btn.classList.remove("revealed");
      btn.textContent = "Reveal";
      btn.setAttribute("aria-label", `Reveal final score for ${g.away} at ${g.home}`);
    }
  }

  paint(revealedIds.has(g.id));

  btn.addEventListener("click", () => {
    const nowRevealed = !revealedIds.has(g.id);
    if (nowRevealed) revealedIds.add(g.id);
    else revealedIds.delete(g.id);
    paint(nowRevealed);
  });

  return tr;
}

let currentGames = [];
let currentSort = "time";

function renderTable() {
  const tbody = document.getElementById("games-tbody");
  tbody.innerHTML = "";

  const sorted = [...currentGames].sort((a, b) =>
    currentSort === "closeness"
      ? b.closeness - a.closeness
      : new Date(a.datetime) - new Date(b.datetime)
  );

  sorted.forEach((g) => tbody.appendChild(buildRow(g)));

  const revealAllBtn = document.getElementById("reveal-all");
  const allRevealed = sorted.length > 0 && sorted.every((g) => revealedIds.has(g.id));
  revealAllBtn.textContent = allRevealed ? "Hide all scores" : "Show all scores";
  revealAllBtn.classList.toggle("active", allRevealed);
}

function renderGames(games) {
  currentGames = games;
  revealedIds = new Set();
  renderTable();
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed for ${path}: ${res.status}`);
  return res.json();
}

function setupControls() {
  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentSort = btn.dataset.sort;
      document.querySelectorAll(".sort-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderTable();
    });
  });

  document.getElementById("reveal-all").addEventListener("click", () => {
    const allRevealed = currentGames.length > 0 && currentGames.every((g) => revealedIds.has(g.id));
    revealedIds = allRevealed ? new Set() : new Set(currentGames.map((g) => g.id));
    renderTable();
  });
}

async function main() {
  const statusEl = document.getElementById("status");
  const wrap = document.getElementById("games-wrap");
  setupControls();

  try {
    const dates = await fetchJson(`${DATA_DIR}/index.json`);

    if (!dates.length) {
      statusEl.textContent = "No games found yet — check back after the next digest run.";
      return;
    }

    const picker = document.getElementById("date-picker");
    const select = document.getElementById("date-select");
    const subtitle = document.getElementById("subtitle");

    // dates arrives newest-first from index.json, so same-month dates are
    // already contiguous - no extra sorting needed to group them.
    let currentGroupLabel = null;
    let currentGroup = null;
    dates.forEach((d) => {
      const groupLabel = fmtMonthLabel(d);
      if (groupLabel !== currentGroupLabel) {
        currentGroupLabel = groupLabel;
        currentGroup = document.createElement("optgroup");
        currentGroup.label = groupLabel;
        select.appendChild(currentGroup);
      }
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = fmtDayOptionLabel(d);
      currentGroup.appendChild(opt);
    });
    picker.style.display = dates.length > 1 ? "flex" : "none";

    const cache = {};
    async function showDate(d) {
      subtitle.textContent = fmtDateLabel(d);
      wrap.style.display = "none";
      statusEl.style.display = "block";
      statusEl.textContent = "Loading games…";
      try {
        if (!cache[d]) {
          const dayData = await fetchJson(`${DATA_DIR}/${d}.json`);
          cache[d] = dayData.games;
        }
        statusEl.style.display = "none";
        wrap.style.display = "block";
        renderGames(cache[d]);
      } catch (err) {
        console.error(err);
        statusEl.textContent = "Couldn't load that day's games.";
        statusEl.classList.add("error");
        statusEl.style.display = "block";
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
