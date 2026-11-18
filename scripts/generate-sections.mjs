import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'Mazennaji';
const TOKEN = process.env.GH_TOKEN;
const OUT = 'assets';
const README = 'README.md';
const TIMELINE = 'data/timeline.json';
const FONT = 'Segoe UI, Helvetica, Arial, sans-serif';
const MONO = 'JetBrains Mono, SFMono-Regular, Consolas, monospace';
const NAV = [
  ['About', 'about'],
  ['Work', 'selected-work'],
  ['Journey', 'journey'],
  ['Stack', 'tech-arsenal'],
  ['Stats', 'github-stats'],
  ['Contact', 'lets-build-something']
];

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

const repoFields = 'name url description stargazerCount primaryLanguage{name color}';
const projectsQuery = `query($login:String!){user(login:$login){
pinnedItems(first:6,types:REPOSITORY){nodes{... on Repository{${repoFields}}}}
recent:repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:8,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{${repoFields}}}
}}`;

function wrap(text, max, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > max ? w.slice(0, max) : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = `${(last.length > max - 1 ? last.slice(0, max - 1) : last).replace(/[ ,.;:]+$/, '')}…`;
    return kept;
  }
  return lines;
}

const SHEEN = `<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0"/>
<stop offset="0.5" stop-color="#c4b5fd"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>`;

function navSvg(label, index) {
  const w = Math.ceil(label.length * 9.2 + 56);
  const h = 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
${SHEEN}
</defs>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="19" fill="#120025" fill-opacity="0.6" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="19" fill="none" stroke="url(#sheen)" stroke-width="2" pathLength="1000" stroke-dasharray="160 840">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="${(5 + index * 0.45).toFixed(2)}s" repeatCount="indefinite"/>
</rect>
<path d="M18 20 l4 -4 l4 4 l-4 4Z" fill="#8b5cf6">
<animate attributeName="opacity" values="1;0.35;1" dur="2.4s" begin="${(index * 0.3).toFixed(1)}s" repeatCount="indefinite"/>
</path>
<text x="36" y="25" font-family="${MONO}" font-size="14" fill="#e0d0ff">${esc(label)}</text>
</svg>
`;
}

function cardSvg(repo, index) {
  const name = repo.name.length > 30 ? `${repo.name.slice(0, 29)}…` : repo.name;
  const desc = wrap(repo.description || 'No description yet.', 58, 2);
  const lang = repo.primaryLanguage ? repo.primaryLanguage.name : null;
  const color = repo.primaryLanguage && repo.primaryLanguage.color ? repo.primaryLanguage.color : '#8b5cf6';
  const begin = (0.2 + index * 0.12).toFixed(2);
  const descSvg = desc.map((l, i) =>
    `<text x="28" y="${78 + i * 20}" font-size="13" fill="#b9a8f0">${esc(l)}</text>`
  ).join('\n');
  const langSvg = lang
    ? `<circle cx="34" cy="143" r="5" fill="${esc(color)}"/>
<text x="46" y="148" font-size="13" fill="#c4b5fd">${esc(lang)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="170" viewBox="0 0 495 170">
<defs>
${SHEEN}
<linearGradient id="ul" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</linearGradient>
<radialGradient id="orb">
<stop offset="0" stop-color="#7c3aed" stop-opacity="0.3"/>
<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/>
</radialGradient>
</defs>
<rect x="1" y="1" width="493" height="168" rx="20" fill="#0d0020" fill-opacity="0.35" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="493" height="168" rx="20" fill="none" stroke="url(#sheen)" stroke-width="2.5" pathLength="1000" stroke-dasharray="140 860">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="${(6 + index * 0.6).toFixed(1)}s" repeatCount="indefinite"/>
</rect>
<circle cx="440" cy="40" r="60" fill="url(#orb)">
<animate attributeName="r" values="46;66;46" dur="${(4 + index * 0.3).toFixed(1)}s" repeatCount="indefinite"/>
</circle>
<g font-family="${FONT}" opacity="0">
<animate attributeName="opacity" from="0" to="1" dur="0.7s" begin="${begin}s" fill="freeze"/>
<animateTransform attributeName="transform" type="translate" from="0 10" to="0 0" dur="0.7s" begin="${begin}s" fill="freeze"/>
<path d="M28 33 l5 5 l-5 5 l-5 -5Z" fill="#7c3aed"/>
<text x="44" y="43" font-size="17" font-weight="700" fill="#e0d0ff">${esc(name)}</text>
<rect x="28" y="54" width="0" height="2" rx="1" fill="url(#ul)"><animate attributeName="width" from="0" to="120" dur="0.9s" begin="${begin}s" fill="freeze"/></rect>
${descSvg}
${langSvg}
<text x="467" y="148" font-size="13" fill="#a78bfa" text-anchor="end">★ ${num(repo.stargazerCount || 0)}</text>
</g>
</svg>
`;
}

function timelineSvg(entries) {
  const rowH = 96;
  const top = 56;
  const H = top + (entries.length - 1) * rowH + 70;
  const lineLen = (entries.length - 1) * rowH;
  const rows = entries.map((e, i) => {
    const y = top + i * rowH;
    const begin = (0.5 + i * 0.55).toFixed(2);
    const note = wrap(e.note || '', 84, 2).map((l, k) =>
      `<text x="226" y="${y + 28 + k * 19}" font-size="13" fill="#9d8fd0">${esc(l)}</text>`
    ).join('\n');
    return `<g opacity="0">
<animate attributeName="opacity" from="0" to="1" dur="0.7s" begin="${begin}s" fill="freeze"/>
<animateTransform attributeName="transform" type="translate" from="14 0" to="0 0" dur="0.7s" begin="${begin}s" fill="freeze"/>
<circle cx="190" cy="${y}" r="8" fill="#0d0020" stroke="#a78bfa" stroke-width="2"/>
<circle cx="190" cy="${y}" r="3.5" fill="#ddd6fe"/>
<circle cx="190" cy="${y}" r="8" fill="none" stroke="#a78bfa" stroke-width="1.5">
<animate attributeName="r" values="8;18" dur="2.6s" begin="${begin}s" repeatCount="indefinite"/>
<animate attributeName="opacity" values="0.8;0" dur="2.6s" begin="${begin}s" repeatCount="indefinite"/>
</circle>
<text x="166" y="${y + 5}" font-family="${MONO}" font-size="14" fill="#a78bfa" text-anchor="end">${esc(e.period || '')}</text>
<text x="226" y="${y + 5}" font-family="${FONT}" font-size="17" font-weight="700" fill="#e0d0ff">${esc(e.title || '')}</text>
<g font-family="${FONT}">
${note}
</g>
</g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${H}" viewBox="0 0 900 ${H}">
<defs>
${SHEEN}
<linearGradient id="line" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#a78bfa"/>
<stop offset="1" stop-color="#6d28d9" stop-opacity="0.4"/>
</linearGradient>
</defs>
<rect x="1" y="1" width="898" height="${H - 2}" rx="20" fill="#0d0020" fill-opacity="0.35" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="898" height="${H - 2}" rx="20" fill="none" stroke="url(#sheen)" stroke-width="2.5" pathLength="1000" stroke-dasharray="140 860">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="9s" repeatCount="indefinite"/>
</rect>
<line x1="190" y1="${top}" x2="190" y2="${top + lineLen}" stroke="url(#line)" stroke-width="2" stroke-dasharray="${lineLen}" stroke-dashoffset="${lineLen}">
<animate attributeName="stroke-dashoffset" from="${lineLen}" to="0" dur="${(0.55 * entries.length + 0.4).toFixed(2)}s" begin="0.3s" fill="freeze"/>
</line>
${rows}
</svg>
`;
}

function replaceBlock(text, tag, content) {
  const re = new RegExp(`(<!--${tag}:START-->)[\\s\\S]*?(<!--${tag}:END-->)`);
  return text.replace(re, (_, a, b) => `${a}\n\n${content}\n\n${b}`);
}

function cardsHtml(repos) {
  const cell = (r, i) =>
    `<td width="50%" valign="top"><a href="${esc(r.url)}"><img src="./assets/project-${i + 1}.svg" alt="${esc(r.name)}" width="100%"/></a></td>`;
  const rows = [];
  for (let i = 0; i < repos.length; i += 2) {
    rows.push(`<tr>\n${cell(repos[i], i)}\n${repos[i + 1] ? cell(repos[i + 1], i + 1) : '<td width="50%"></td>'}\n</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  NAV.forEach(([label, anchor], i) => {
    writeFileSync(`${OUT}/nav-${anchor}.svg`, navSvg(label, i));
  });

  if (existsSync(TIMELINE)) {
    const entries = JSON.parse(readFileSync(TIMELINE, 'utf8'));
    if (entries.length) writeFileSync(`${OUT}/timeline.svg`, timelineSvg(entries));
  }

  if (!TOKEN) throw new Error('GH_TOKEN is not set');
  const { user } = await gql(projectsQuery, { login: LOGIN });
  const pinned = user.pinnedItems.nodes.filter(n => n && n.name);
  const repos = (pinned.length
    ? pinned
    : user.recent.nodes.filter(n => n.name !== LOGIN)
  ).slice(0, 6);

  repos.forEach((r, i) => writeFileSync(`${OUT}/project-${i + 1}.svg`, cardSvg(r, i)));
  for (const f of readdirSync(OUT)) {
    const m = f.match(/^project-(\d+)\.svg$/);
    if (m && Number(m[1]) > repos.length) unlinkSync(`${OUT}/${f}`);
  }

  if (existsSync(README)) {
    const text = readFileSync(README, 'utf8');
    writeFileSync(README, replaceBlock(text, 'CARDS', cardsHtml(repos)));
  }
  console.log({ projects: repos.map(r => r.name) });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});