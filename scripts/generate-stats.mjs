import { writeFileSync, mkdirSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'Mazennaji';
const TOKEN = process.env.GH_TOKEN;
const OUT = 'assets';
const FONT = 'Segoe UI, Helvetica, Arial, sans-serif';

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'readme-stats'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = n => Number(n).toLocaleString('en-US');

const profileQuery = `query($login:String!){user(login:$login){
createdAt
followers{totalCount}
pullRequests{totalCount}
openIssues:issues(states:OPEN){totalCount}
closedIssues:issues(states:CLOSED){totalCount}
repositoriesContributedTo(first:1,contributionTypes:[COMMIT,ISSUE,PULL_REQUEST,REPOSITORY]){totalCount}
}}`;

const reposQuery = `query($login:String!,$after:String){user(login:$login){
repositories(ownerAffiliations:OWNER,isFork:false,first:100,after:$after){
pageInfo{hasNextPage endCursor}
nodes{stargazerCount languages(first:15,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}
}}}`;

async function fetchRepos() {
  const nodes = [];
  let after = null;
  for (;;) {
    const { user } = await gql(reposQuery, { login: LOGIN, after });
    nodes.push(...user.repositories.nodes);
    if (!user.repositories.pageInfo.hasNextPage) break;
    after = user.repositories.pageInfo.endCursor;
  }
  return nodes;
}

function yearRanges(createdAt) {
  const start = new Date(createdAt);
  const now = new Date();
  const ranges = [];
  for (let y = start.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
    const from = y === start.getUTCFullYear() ? start : new Date(Date.UTC(y, 0, 1));
    const to = y === now.getUTCFullYear() ? now : new Date(Date.UTC(y, 11, 31, 23, 59, 59));
    ranges.push({ from: from.toISOString(), to: to.toISOString() });
  }
  return ranges;
}

async function fetchYears(createdAt) {
  const fields = `totalCommitContributions restrictedContributionsCount totalPullRequestReviewContributions contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}`;
  const ranges = yearRanges(createdAt);
  const body = ranges
    .map((r, i) => `y${i}:contributionsCollection(from:"${r.from}",to:"${r.to}"){${fields}}`)
    .join('\n');
  const { user } = await gql(`query($login:String!){user(login:$login){${body}}}`, { login: LOGIN });
  return ranges.map((_, i) => user[`y${i}`]);
}

function rank({ commits, prs, issues, reviews, stars, followers }) {
  const exp = x => 1 - 2 ** -x;
  const logn = x => x / (1 + x);
  const score =
    (2 * exp(commits / 1000) +
      3 * exp(prs / 50) +
      exp(issues / 25) +
      exp(reviews / 2) +
      4 * logn(stars / 50) +
      logn(followers / 10)) / 12;
  const percentile = Math.min(100, Math.max(0, (1 - score) * 100));
  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  return { level: levels[thresholds.findIndex(t => percentile <= t)], percentile };
}

function streaks(days, today) {
  let longest = { len: 0, start: null, end: null };
  let run = { len: 0, start: null, end: null };
  for (const d of days) {
    if (d.count > 0) {
      run = run.len === 0
        ? { len: 1, start: d.date, end: d.date }
        : { len: run.len + 1, start: run.start, end: d.date };
      if (run.len > longest.len) longest = { ...run };
    } else if (d.date !== today) {
      run = { len: 0, start: null, end: null };
    }
  }
  return { current: run, longest };
}

function fmtDate(s, withYear) {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC'
  });
}

function fmtRange(a, b) {
  if (!a) return '—';
  const y = String(new Date().getUTCFullYear());
  const withYear = a.slice(0, 4) !== y || b.slice(0, 4) !== y;
  return `${fmtDate(a, withYear)} – ${fmtDate(b, withYear)}`;
}

const PARTICLES = [
  [90, 1.8, 8, 0], [260, 1.4, 6, 1], [430, 2, 9, 2],
  [580, 1.4, 7, 0.5], [760, 1.8, 8.5, 3], [910, 1.4, 6.5, 1.5]
];

function streakSvg(d) {
  const particles = PARTICLES.map(([x, r, dur, begin]) =>
    `<circle cx="${x}" cy="230" r="${r}"><animate attributeName="cy" from="230" to="-10" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
  ).join('\n');
  const block = (x, big, label, sub, begin) => `<g opacity="0">
<animate attributeName="opacity" from="0" to="1" dur="0.9s" begin="${begin}s" fill="freeze"/>
<animateTransform attributeName="transform" type="translate" from="0 14" to="0 0" dur="0.9s" begin="${begin}s" fill="freeze"/>
<text x="${x}" y="108" font-size="46" font-weight="800" fill="#7c3aed" filter="url(#glow)" opacity="0.6">${esc(big)}</text>
<text x="${x}" y="108" font-size="46" font-weight="800" fill="url(#num)">${esc(big)}</text>
<text x="${x}" y="142" font-size="16" fill="#a78bfa">${esc(label)}</text>
<text x="${x}" y="166" font-size="12" fill="#6b5fa0">${esc(sub)}</text>
</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="220" viewBox="0 0 1000 220">
<defs>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0"/>
<stop offset="0.5" stop-color="#c4b5fd"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<linearGradient id="num" x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect">
<stop offset="0" stop-color="#ffffff"/>
<stop offset="0.5" stop-color="#ddd6fe"/>
<stop offset="1" stop-color="#a78bfa"/>
<animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="4s" repeatCount="indefinite"/>
</linearGradient>
<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#6d28d9"/>
</linearGradient>
<linearGradient id="div" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0"/>
<stop offset="0.5" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#ddd6fe"/>
<stop offset="1" stop-color="#7c3aed"/>
</linearGradient>
<radialGradient id="orb">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0.35"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
<feGaussianBlur stdDeviation="4"/>
</filter>
</defs>
<rect x="1" y="1" width="998" height="218" rx="20" fill="#0d0020" fill-opacity="0.35" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="998" height="218" rx="20" fill="none" stroke="url(#sheen)" stroke-width="2.5" pathLength="1000" stroke-dasharray="140 860">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="6s" repeatCount="indefinite"/>
</rect>
<circle cx="500" cy="95" r="90" fill="url(#orb)">
<animate attributeName="r" values="80;102;80" dur="4s" repeatCount="indefinite"/>
</circle>
<g fill="#c4b5fd">
${particles}
</g>
<rect x="333" y="40" width="1.5" height="140" fill="url(#div)"/>
<rect x="667" y="40" width="1.5" height="140" fill="url(#div)"/>
<g font-family="${FONT}" text-anchor="middle">
${block(167, num(d.total), 'Total Contributions', d.totalSub, 0.2)}
<g opacity="0">
<animate attributeName="opacity" from="0" to="1" dur="0.9s" begin="0.4s" fill="freeze"/>
<animateTransform attributeName="transform" type="translate" from="0 14" to="0 0" dur="0.9s" begin="0.4s" fill="freeze"/>
<g transform="rotate(-90 500 98)">
<circle cx="500" cy="98" r="50" fill="none" stroke="#2a1a4d" stroke-width="8"/>
<circle cx="500" cy="98" r="50" fill="none" stroke="url(#ring)" stroke-width="8" stroke-linecap="round" stroke-dasharray="314.16" stroke-dashoffset="314.16">
<animate attributeName="stroke-dashoffset" from="314.16" to="0" dur="1.8s" begin="0.6s" fill="freeze"/>
</circle>
</g>
<g>
<animateTransform attributeName="transform" type="rotate" from="0 500 98" to="360 500 98" dur="5s" repeatCount="indefinite"/>
<circle cx="500" cy="48" r="5" fill="#ddd6fe" filter="url(#glow)"/>
<circle cx="500" cy="48" r="2.5" fill="#ffffff"/>
</g>
<text x="500" y="112" font-size="40" font-weight="800" fill="#ffffff">${num(d.currentLen)}</text>
<g transform="translate(500 26)">
<path d="M0 -14 C6 -6 10 -2 10 4 A10 10 0 0 1 -10 4 C-10 -2 -4 -6 0 -14Z" fill="url(#flame)">
<animateTransform attributeName="transform" type="scale" values="1 1;1.12 0.92;0.94 1.1;1 1" dur="1.6s" repeatCount="indefinite"/>
</path>
</g>
<text x="500" y="182" font-size="16" font-weight="700" fill="#a78bfa">Current Streak</text>
<text x="500" y="204" font-size="12" fill="#6b5fa0">${esc(d.currentSub)}</text>
</g>
${block(833, num(d.longestLen), 'Longest Streak', d.longestSub, 0.6)}
</g>
</svg>
`;
}

function statsSvg(d) {
  const rows = [
    ['Total Stars', d.stars],
    ['Total Commits', d.commits],
    ['Total PRs', d.prs],
    ['Total Issues', d.issues],
    ['Contributed To', d.contributedTo]
  ];
  const rowsSvg = rows.map(([label, value], i) => {
    const y = 86 + 28 * i;
    return `<g opacity="0">
<animate attributeName="opacity" from="0" to="1" dur="0.6s" begin="${(0.3 + 0.15 * i).toFixed(2)}s" fill="freeze"/>
<path d="M28 ${y - 10} l5 5 l-5 5 l-5 -5Z" fill="#7c3aed"/>
<text x="44" y="${y}" font-size="14" fill="#a78bfa">${esc(label)}</text>
<text x="290" y="${y}" font-size="15" font-weight="700" fill="#ffffff" text-anchor="end">${num(value)}</text>
</g>`;
  }).join('\n');
  const offset = (263.9 * d.percentile / 100).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="220" viewBox="0 0 495 220">
<defs>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0"/>
<stop offset="0.5" stop-color="#c4b5fd"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#6d28d9"/>
</linearGradient>
<linearGradient id="ul" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<radialGradient id="orb">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0.35"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
<feGaussianBlur stdDeviation="4"/>
</filter>
</defs>
<rect x="1" y="1" width="493" height="218" rx="20" fill="#0d0020" fill-opacity="0.35" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="493" height="218" rx="20" fill="none" stroke="url(#sheen)" stroke-width="2.5" pathLength="1000" stroke-dasharray="140 860">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="7s" repeatCount="indefinite"/>
</rect>
<circle cx="392" cy="125" r="60" fill="url(#orb)">
<animate attributeName="r" values="52;70;52" dur="4s" repeatCount="indefinite"/>
</circle>
<g font-family="${FONT}">
<text x="28" y="40" font-size="18" font-weight="700" fill="#e0d0ff">GitHub Stats</text>
<rect x="28" y="49" width="0" height="2" rx="1" fill="url(#ul)"><animate attributeName="width" from="0" to="110" dur="1s" begin="0.2s" fill="freeze"/></rect>
${rowsSvg}
<g transform="rotate(-90 392 125)">
<circle cx="392" cy="125" r="42" fill="none" stroke="#2a1a4d" stroke-width="7"/>
<circle cx="392" cy="125" r="42" fill="none" stroke="url(#ring)" stroke-width="7" stroke-linecap="round" stroke-dasharray="263.9" stroke-dashoffset="263.9">
<animate attributeName="stroke-dashoffset" from="263.9" to="${offset}" dur="1.8s" begin="0.5s" fill="freeze"/>
</circle>
</g>
<g>
<animateTransform attributeName="transform" type="rotate" from="0 392 125" to="360 392 125" dur="6s" repeatCount="indefinite"/>
<circle cx="392" cy="83" r="4" fill="#ddd6fe" filter="url(#glow)"/>
</g>
<text x="392" y="133" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">${esc(d.level)}</text>
<text x="392" y="152" font-size="10" letter-spacing="3" fill="#6b5fa0" text-anchor="middle">RANK</text>
</g>
</svg>
`;
}

function languagesSvg(langs) {
  const total = langs.reduce((a, l) => a + l.size, 0) || 1;
  const rows = langs.slice(0, 4).map(l => ({ name: l.name, size: l.size }));
  const rest = langs.slice(4).reduce((a, l) => a + l.size, 0);
  if (rest > 0) rows.push({ name: 'Other', size: rest });
  const grads = ['b1', 'b1', 'b2', 'b3', 'b3'];
  const clips = rows.map((_, i) =>
    `<clipPath id="t${i + 1}"><rect x="28" y="${72 + 28 * i}" width="439" height="8" rx="4"/></clipPath>`
  ).join('\n');
  const rowsSvg = rows.map((r, i) => {
    const pct = (r.size / total) * 100;
    const w = ((pct / 100) * 439).toFixed(1);
    const ty = 66 + 28 * i;
    const by = 72 + 28 * i;
    return `<text x="28" y="${ty}" font-size="13" fill="#c4b5fd">${esc(r.name)}</text>
<text x="467" y="${ty}" font-size="13" fill="#a78bfa" text-anchor="end">${Math.max(1, Math.round(pct))}%</text>
<rect x="28" y="${by}" width="439" height="8" rx="4" fill="#1a0f33"/>
<g clip-path="url(#t${i + 1})">
<rect x="28" y="${by}" width="0" height="8" rx="4" fill="url(#${grads[i]})"><animate attributeName="width" from="0" to="${w}" dur="1.2s" begin="${(0.4 + 0.15 * i).toFixed(2)}s" fill="freeze"/></rect>
<rect x="-100" y="${by}" width="100" height="8" fill="url(#shine)"><animate attributeName="x" from="-100" to="500" dur="3s" begin="${(1.8 + 0.2 * i).toFixed(1)}s" repeatCount="indefinite"/></rect>
</g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="220" viewBox="0 0 495 220">
<defs>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0"/>
<stop offset="0.5" stop-color="#c4b5fd"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ul" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<linearGradient id="b1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d28d9"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient>
<linearGradient id="b2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b21b6"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
<linearGradient id="b3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4c1d95"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
<linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
<stop offset="0.5" stop-color="#ffffff" stop-opacity="0.55"/>
<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
${clips}
</defs>
<rect x="1" y="1" width="493" height="218" rx="20" fill="#0d0020" fill-opacity="0.35" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="493" height="218" rx="20" fill="none" stroke="url(#sheen)" stroke-width="2.5" pathLength="1000" stroke-dasharray="140 860">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="7s" begin="1.5s" repeatCount="indefinite"/>
</rect>
<g font-family="${FONT}">
<text x="28" y="40" font-size="18" font-weight="700" fill="#e0d0ff">Top Languages</text>
<text x="467" y="40" font-size="11" fill="#6b5fa0" text-anchor="end">by code size</text>
<rect x="28" y="49" width="0" height="2" rx="1" fill="url(#ul)"><animate attributeName="width" from="0" to="130" dur="1s" begin="0.2s" fill="freeze"/></rect>
${rowsSvg}
</g>
</svg>
`;
}

async function main() {
  if (!TOKEN) throw new Error('GH_TOKEN is not set');
  const { user: profile } = await gql(profileQuery, { login: LOGIN });
  const repos = await fetchRepos();
  const years = await fetchYears(profile.createdAt);

  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
  const commits = years.reduce((a, y) => a + y.totalCommitContributions + y.restrictedContributionsCount, 0);
  const reviews = years.reduce((a, y) => a + y.totalPullRequestReviewContributions, 0);
  const total = years.reduce((a, y) => a + y.contributionCalendar.totalContributions, 0);
  const prs = profile.pullRequests.totalCount;
  const issues = profile.openIssues.totalCount + profile.closedIssues.totalCount;
  const followers = profile.followers.totalCount;
  const contributedTo = profile.repositoriesContributedTo.totalCount;

  const dayMap = new Map();
  for (const y of years) {
    for (const w of y.contributionCalendar.weeks) {
      for (const d of w.contributionDays) {
        dayMap.set(d.date, Math.max(dayMap.get(d.date) || 0, d.contributionCount));
      }
    }
  }
  const days = [...dayMap].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);
  const { current, longest } = streaks(days, today);

  const langMap = new Map();
  for (const r of repos) {
    for (const e of r.languages.edges) {
      langMap.set(e.node.name, (langMap.get(e.node.name) || 0) + e.size);
    }
  }
  const langs = [...langMap].map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size);

  const { level, percentile } = rank({ commits, prs, issues, reviews, stars, followers });

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/streak.svg`, streakSvg({
    total,
    totalSub: `${fmtDate(profile.createdAt.slice(0, 10), true)} – Present`,
    currentLen: current.len,
    currentSub: fmtRange(current.start, current.end),
    longestLen: longest.len,
    longestSub: fmtRange(longest.start, longest.end)
  }));
  writeFileSync(`${OUT}/stats.svg`, statsSvg({ stars, commits, prs, issues, contributedTo, level, percentile }));
  writeFileSync(`${OUT}/languages.svg`, languagesSvg(langs));
  console.log({ stars, commits, prs, issues, contributedTo, reviews, followers, total, level, percentile, current, longest });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});