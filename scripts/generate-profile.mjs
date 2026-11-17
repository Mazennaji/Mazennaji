import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'Mazennaji';
const TOKEN = process.env.GH_TOKEN;
const OUT = 'assets';
const README = 'README.md';
const MONO = 'JetBrains Mono, SFMono-Regular, Consolas, monospace';
const ROLE = 'software engineer · full stack · ai';
const AI = ['PyTorch', 'RL', 'LLM pipelines'];
const WEB = ['React', 'Next.js', 'NestJS', 'Django'];
const CURATED = [
  'React', 'Next.js', 'NestJS', 'Django', 'FastAPI', 'PostgreSQL', 'Supabase',
  'Docker', 'PyTorch', 'React Native', 'SQL Server', 'Reinforcement Learning'
];
const SKIP = new Set([
  'HTML', 'CSS', 'SCSS', 'Jupyter Notebook', 'Shell', 'Dockerfile', 'Makefile',
  'Batchfile', 'PowerShell', 'Vue', 'GDScript', 'Perl', 'Lua'
]);

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

const repoFields = 'name url description stargazerCount primaryLanguage{name}';

const infoQuery = `query($login:String!){user(login:$login){
name
followers{totalCount}
repositories(ownerAffiliations:OWNER,isFork:false){totalCount}
pinnedItems(first:6,types:REPOSITORY){nodes{... on Repository{${repoFields}}}}
recent:repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:7,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{${repoFields}}}
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

function terminalSvg(d) {
  const C = { prompt: '#8b5cf6', cmd: '#e0d0ff', out: '#c4b5fd', key: '#a78bfa', str: '#86efac', plain: '#e0d0ff' };
  const q = s => [`"${s}"`, C.str];
  const list = arr => arr.flatMap((s, i) => (i ? [[', ', C.plain], q(s)] : [q(s)]));
  const lines = [
    { y: 92, t: [0.02, 0.06], segs: [['$', C.prompt], [' whoami', C.cmd]] },
    { y: 122, t: [0.08, 0.18], segs: [[d.whoami, C.out]] },
    { y: 165, t: [0.22, 0.27], segs: [['$', C.prompt], [' cat stack.json', C.cmd]] },
    { y: 195, t: [0.30, 0.38], segs: [['{ ', C.plain], ['"core"', C.key], [': [', C.plain], ...list(d.core), ['],', C.plain]] },
    { y: 222, t: [0.39, 0.47], segs: [['  ', C.plain], ['"ai"', C.key], [': [', C.plain], ...list(AI), ['],', C.plain]] },
    { y: 249, t: [0.48, 0.56], segs: [['  ', C.plain], ['"web"', C.key], [': [', C.plain], ...list(WEB), ['],', C.plain]] },
    {
      y: 276,
      t: [0.57, 0.64],
      segs: [
        ['  ', C.plain], ['"repos"', C.key], [`: ${d.repos}, `, C.plain],
        ['"stars"', C.key], [`: ${d.stars}, `, C.plain],
        ['"followers"', C.key], [`: ${d.followers} }`, C.plain]
      ]
    }
  ];
  const clips = lines.map((l, i) => {
    const chars = l.segs.reduce((a, [t]) => a + t.length, 0);
    const w = Math.min(836, Math.ceil(chars * 9.7) + 6);
    return `<clipPath id="c${i}"><rect x="32" y="${l.y - 18}" height="26" width="0"><animate attributeName="width" values="0;0;${w};${w};0" keyTimes="0;${l.t[0]};${l.t[1]};0.95;1" dur="18s" repeatCount="indefinite"/></rect></clipPath>`;
  }).join('\n');
  const text = lines.map((l, i) =>
    `<g clip-path="url(#c${i})"><text x="32" y="${l.y}" xml:space="preserve">${l.segs.map(([t, c]) => `<tspan fill="${c}">${esc(t)}</tspan>`).join('')}</text></g>`
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="340" viewBox="0 0 900 340">
<defs>
<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7c3aed"/>
<stop offset="1" stop-color="#2a0066"/>
</linearGradient>
${clips}
</defs>
<rect x="1" y="1" width="898" height="338" rx="16" fill="#0b0614" stroke="url(#frame)" stroke-width="2"/>
<path d="M1 38V17a16 16 0 0 1 16-16H883a16 16 0 0 1 16 16V38Z" fill="#150a28"/>
<circle cx="28" cy="20" r="6" fill="#ff5f57"/>
<circle cx="50" cy="20" r="6" fill="#febc2e"/>
<circle cx="72" cy="20" r="6" fill="#28c840"/>
<text x="450" y="25" text-anchor="middle" font-family="${MONO}" font-size="13" fill="#8b7bb8">${esc(d.handle)}: ~/profile</text>
<g font-family="${MONO}" font-size="16">
${text}
<text x="32" y="313" fill="#8b5cf6">$</text>
</g>
<rect x="52" y="299" width="10" height="18" fill="#a78bfa">
<animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/>
</rect>
</svg>
`;
}

function marqueeSvg(items) {
  const GAP = 16;
  const sized = [];
  let W = 0;
  for (let pass = 0; W < 1300 && pass < 10; pass++) {
    for (const it of items) {
      const w = Math.ceil(it.name.length * 9 + 44);
      sized.push({ ...it, x: W, w });
      W += w + GAP;
    }
  }
  const pills = sized.map(p =>
    `<rect x="${p.x}" y="20" width="${p.w}" height="40" rx="20" fill="#120025" stroke="${p.stroke}"/><text x="${p.x + p.w / 2}" y="45">${esc(p.name)}</text>`
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="80" viewBox="0 0 1200 80">
<defs>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#000000"/>
<stop offset="0.1" stop-color="#ffffff"/>
<stop offset="0.9" stop-color="#ffffff"/>
<stop offset="1" stop-color="#000000"/>
</linearGradient>
<mask id="edge"><rect width="1200" height="80" fill="url(#fade)"/></mask>
<g id="row" font-family="${MONO}" font-size="15" fill="#e0d0ff" text-anchor="middle">
${pills}
</g>
</defs>
<g mask="url(#edge)">
<g>
<animateTransform attributeName="transform" type="translate" from="0 0" to="-${W} 0" dur="${(W / 46).toFixed(1)}s" repeatCount="indefinite"/>
<use href="#row" x="0"/>
<use href="#row" x="${W}"/>
</g>
</g>
</svg>
`;
}

function replaceBlock(text, tag, content) {
  const re = new RegExp(`(<!--${tag}:START-->)[\\s\\S]*?(<!--${tag}:END-->)`);
  return text.replace(re, (_, a, b) => `${a}\n\n${content}\n\n${b}`);
}

function replaceInline(text, tag, content) {
  const re = new RegExp(`(<!--${tag}:START-->)[\\s\\S]*?(<!--${tag}:END-->)`);
  return text.replace(re, (_, a, b) => `${a}${content}${b}`);
}

function projectsTable(nodes) {
  const cell = s => String(s || '—').replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  const rows = nodes.map(n => {
    const stack = `${n.primaryLanguage ? n.primaryLanguage.name : '—'}${n.stargazerCount ? ` · ★ ${n.stargazerCount}` : ''}`;
    return `| **[${cell(n.name)}](${n.url})** | ${cell(stack)} | ${cell(n.description)} |`;
  });
  return ['| Project | Stack | What it does |', '|:--|:--|:--|', ...rows].join('\n');
}

async function main() {
  if (!TOKEN) throw new Error('GH_TOKEN is not set');
  const { user: info } = await gql(infoQuery, { login: LOGIN });
  const repos = await fetchRepos();

  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
  const langMap = new Map();
  for (const r of repos) {
    for (const e of r.languages.edges) {
      langMap.set(e.node.name, (langMap.get(e.node.name) || 0) + e.size);
    }
  }
  const live = [...langMap]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .filter(n => !SKIP.has(n));

  const displayName = (info.name || LOGIN).toLowerCase();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/terminal.svg`, terminalSvg({
    handle: `${LOGIN.toLowerCase()}@dev`,
    whoami: `${displayName} · ${ROLE}`,
    core: live.slice(0, 3),
    repos: info.repositories.totalCount,
    stars,
    followers: info.followers.totalCount
  }));

  const liveItems = live.slice(0, 8).map(name => ({ name, stroke: '#a78bfa' }));
  const liveLower = new Set(live.map(n => n.toLowerCase()));
  const curatedItems = CURATED.filter(n => !liveLower.has(n.toLowerCase())).map(name => ({ name, stroke: '#6d28d9' }));
  writeFileSync(`${OUT}/marquee.svg`, marqueeSvg([...liveItems, ...curatedItems]));

  if (existsSync(README)) {
    const pinned = info.pinnedItems.nodes.filter(n => n && n.name);
    const projects = pinned.length
      ? pinned
      : info.recent.nodes.filter(n => n.name !== LOGIN).slice(0, 6);
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    let text = readFileSync(README, 'utf8');
    text = replaceBlock(text, 'PROJECTS', projectsTable(projects));
    text = replaceInline(text, 'UPDATED', date);
    writeFileSync(README, text);
  }
  console.log({ stars, live: live.slice(0, 8), repos: info.repositories.totalCount, followers: info.followers.totalCount });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});