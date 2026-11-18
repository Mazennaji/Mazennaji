import { writeFileSync, mkdirSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'Mazennaji';
const TOKEN = process.env.GH_TOKEN;
const OUT = 'assets';
const MAX_ROWS = 6;
const FONT = 'Segoe UI, Helvetica, Arial, sans-serif';
const MONO = 'JetBrains Mono, SFMono-Regular, Consolas, monospace';

const KINDS = {
  PUSH: { bg: '#6d28d9', fg: '#ffffff' },
  PR: { bg: '#8b5cf6', fg: '#ffffff' },
  ISSUE: { bg: '#5b21b6', fg: '#ffffff' },
  NEW: { bg: '#a78bfa', fg: '#1a0f33' },
  RELEASE: { bg: '#c4b5fd', fg: '#1a0f33' }
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'readme-stats',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400 / 7)}w ago`;
  return `${Math.round(s / 86400 / 30)}mo ago`;
}

function describe(e) {
  const repo = e.repo.name.split('/').pop();
  const p = e.payload || {};
  const base = { repo, when: e.created_at };
  switch (e.type) {
    case 'PushEvent': {
      const commits = p.commits || [];
      const n = p.distinct_size ?? p.size ?? commits.length ?? 1;
      const last = commits.length ? commits[commits.length - 1].message.split('\n')[0] : '';
      return { ...base, kind: 'PUSH', n: n || 1, text: last || `Pushed ${n} commit${n === 1 ? '' : 's'}` };
    }
    case 'PullRequestEvent': {
      if (!p.pull_request) return null;
      const verb = p.action === 'closed' && p.pull_request.merged ? 'Merged' : cap(p.action);
      return { ...base, kind: 'PR', text: `${verb} #${p.pull_request.number} ${p.pull_request.title}` };
    }
    case 'IssuesEvent':
      if (!p.issue) return null;
      return { ...base, kind: 'ISSUE', text: `${cap(p.action)} #${p.issue.number} ${p.issue.title}` };
    case 'CreateEvent':
      return p.ref_type === 'repository' ? { ...base, kind: 'NEW', text: `Created repository ${repo}` } : null;
    case 'ReleaseEvent':
      return p.release ? { ...base, kind: 'RELEASE', text: `Released ${p.release.tag_name}` } : null;
    default:
      return null;
  }
}

function collect(events) {
  const items = [];
  for (const e of events) {
    const d = describe(e);
    if (!d) continue;
    const prev = items[items.length - 1];
    const sameDay = prev && prev.when.slice(0, 10) === d.when.slice(0, 10);
    if (d.kind === 'PUSH' && prev && prev.kind === 'PUSH' && prev.repo === d.repo && sameDay) {
      prev.n += d.n;
      continue;
    }
    items.push(d);
    if (items.length === MAX_ROWS) break;
  }
  return items;
}

function activitySvg(items) {
  const rowH = 52;
  const top = 84;
  const rows = items.length ? items : [{ kind: 'NEW', text: 'No recent public activity', repo: LOGIN, when: new Date().toISOString() }];
  const H = top + rows.length * rowH + 14;
  const body = rows.map((r, i) => {
    const y = top + i * rowH;
    const k = KINDS[r.kind];
    const begin = (0.4 + i * 0.15).toFixed(2);
    const meta = `${r.repo}${r.n > 1 ? ` · ${r.n} commits` : ''} · ${ago(r.when)}`;
    return `<g opacity="0">
<animate attributeName="opacity" from="0" to="1" dur="0.6s" begin="${begin}s" fill="freeze"/>
<animateTransform attributeName="transform" type="translate" from="0 10" to="0 0" dur="0.6s" begin="${begin}s" fill="freeze"/>
<rect x="28" y="${y - 17}" width="74" height="26" rx="13" fill="${k.bg}"/>
<text x="65" y="${y + 1}" font-family="${MONO}" font-size="11" font-weight="700" letter-spacing="1" fill="${k.fg}" text-anchor="middle">${r.kind}</text>
<text x="120" y="${y - 2}" font-family="${FONT}" font-size="15" fill="#e0d0ff">${esc(clip(r.text, 78))}</text>
<text x="120" y="${y + 16}" font-family="${MONO}" font-size="11.5" fill="#6b5fa0">${esc(clip(meta, 90))}</text>
</g>
${i < rows.length - 1 ? `<rect x="28" y="${y + 25}" width="944" height="1" fill="#2a1a4d" opacity="0.7"/>` : ''}`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${H}" viewBox="0 0 1000 ${H}">
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
</defs>
<rect x="1" y="1" width="998" height="${H - 2}" rx="20" fill="#0d0020" fill-opacity="0.35" stroke="#2a1a4d" stroke-width="1.5"/>
<rect x="1" y="1" width="998" height="${H - 2}" rx="20" fill="none" stroke="url(#sheen)" stroke-width="2.5" pathLength="1000" stroke-dasharray="140 860">
<animate attributeName="stroke-dashoffset" from="0" to="-1000" dur="8s" repeatCount="indefinite"/>
</rect>
<text x="28" y="42" font-family="${FONT}" font-size="18" font-weight="700" fill="#e0d0ff">Recent Activity</text>
<rect x="28" y="51" width="0" height="2" rx="1" fill="url(#ul)"><animate attributeName="width" from="0" to="130" dur="1s" begin="0.2s" fill="freeze"/></rect>
<circle cx="926" cy="36" r="4" fill="#a78bfa">
<animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite"/>
</circle>
<text x="972" y="40" font-family="${MONO}" font-size="11" letter-spacing="2" fill="#6b5fa0" text-anchor="end">LIVE</text>
${body}
</svg>
`;
}

async function main() {
  if (!TOKEN) throw new Error('GH_TOKEN is not set');
  const events = await api(`/users/${LOGIN}/events/public?per_page=100`);
  mkdirSync(OUT, { recursive: true });
  const items = collect(events);
  writeFileSync(`${OUT}/activity.svg`, activitySvg(items));
  console.log(items.map(i => `${i.kind} ${i.repo} ${i.text}`));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});