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

function meterHtml(score) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="seg${i <= score ? " on" : ""}"></span>`;
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

function buildStub(g, idx, isHero) {
  const stub = document.createElement("article");
  stub.className = "stub" + (isHero ? " hero" : "");

  const away = g.away_abbr || g.away;
  const home = g.home_abbr || g.home;
  const seedLabel = isHero ? "Game of the Night" : `Seed ${idx + 1}`;

  stub.innerHTML = `
    <div class="stub-top">
      <div class="matchup">${away} @ ${home}</div>
      <div class="rank-seed">${seedLabel}</div>
    </div>
    <div class="meter-row">
      <span class="meter">${meterHtml(g.closeness)}</span>
      <span class="rating-label">${g.rating}</span>
    </div>
    <div class="perf" aria-hidden="true"></div>
    <div class="flip-zone">
      <div class="flip-card">
        <div class="flip-inner">
          <button class="flip-face flip-front" type="button" aria-label="Reveal final score for ${away} at ${home}">
            <span>Sealed — tap to reveal</span>
          </button>
          <div class="flip-face flip-back" aria-hidden="true">
            <span class="team${g.winner === g.away ? " winner" : ""}">
              <span class="at">${away}</span> <span class="score">${g.away_score}</span>
            </span>
            <span class="team${g.winner === g.home ? " winner" : ""}">
              <span class="at">${home}</span> <span class="score">${g.home_score}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  const flipCard = stub.querySelector(".flip-card");
  const front = stub.querySelector(".flip-front");
  const back = stub.querySelector(".flip-back");
  front.addEventListener("click", () => {
    flipCard.classList.add("revealed");
    // backface-visibility only hides content visually - screen readers can
    // still reach it regardless of rotation, so the seal has to be enforced
    // in the accessibility tree too, not just in CSS.
    back.setAttribute("aria-hidden", "false");
    front.setAttribute("aria-hidden", "true");
    front.setAttribute("tabindex", "-1");
  });

  return stub;
}

function renderGames(games) {
  const container = document.getElementById("games-container");
  container.innerHTML = "";

  const sorted = [...games].sort((a, b) => b.closeness - a.closeness);
  const [top, ...rest] = sorted;

  container.appendChild(buildStub(top, 0, true));

  if (rest.length) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Rest of the slate";
    container.appendChild(label);

    rest.forEach((g, i) => container.appendChild(buildStub(g, i + 1, false)));
  }
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
