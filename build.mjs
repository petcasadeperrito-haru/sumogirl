// SUMO GIRL LAB — 静的サイトビルダー
// microCMS（contents / settings / rikishi）と data/sumo.json から dist/ を生成します。
// 依存パッケージなし。Node.js 18 以上。

import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { enrich, buildRankings, pct, divisionLabel } from './stats.mjs';
import {
  rikishiTable, rikishiBody, rankingBody,
  kimariteBody, kimariteDetail, esc
} from './rikishi.mjs';

const SERVICE = process.env.MICROCMS_SERVICE_DOMAIN || process.env.VITE_MICROCMS_SERVICE_DOMAIN;
const KEY = process.env.MICROCMS_API_KEY || process.env.VITE_MICROCMS_API_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://sumogirl.pages.dev').replace(/\/$/, '');
const OUT = 'dist';

/* ──────────────────────────────────────────────
   本場所の日程。年に一度、ここだけ書き換えます。
   ────────────────────────────────────────────── */
const BASHO = [
  { name: '初場所',     start: '2026-01-11', end: '2026-01-25' },
  { name: '春場所',     start: '2026-03-08', end: '2026-03-22' },
  { name: '夏場所',     start: '2026-05-10', end: '2026-05-24' },
  { name: '名古屋場所', start: '2026-07-12', end: '2026-07-26' },
  { name: '九月場所',   start: '2026-09-13', end: '2026-09-27' },
  { name: '九州場所',   start: '2026-11-08', end: '2026-11-22' }
];

if (!SERVICE || !KEY) {
  console.error('環境変数 VITE_MICROCMS_SERVICE_DOMAIN と VITE_MICROCMS_API_KEY を設定してください。');
  process.exit(1);
}

async function api(endpoint, query = '') {
  const res = await fetch(`https://${SERVICE}.microcms.io/api/v1/${endpoint}${query}`,
    { headers: { 'X-MICROCMS-API-KEY': KEY } });
  if (!res.ok) throw new Error(`${endpoint} (${res.status})`);
  return res.json();
}

const pick = (v, f = '') => Array.isArray(v) ? (v[0] || f) : (v || f);

const KINDS = {
  miru:    { label: '観る',   desc: '見て思ったこと。場所の十五日間はここが増えます。' },
  kazoeru: { label: '数える', desc: 'データを一つ取り上げて、図一枚で説明します。' },
  shiru:   { label: '知る',   desc: '用語、所作、番付、決まり手。調べたことの置き場です。' }
};
const kindOf = a => (KINDS[pick(a.content_type)] ? pick(a.content_type) : 'shiru');
const urlOf = a => `/${kindOf(a)}/${a.slug || a.id}/`;
const jpDate = iso => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

async function write(path, html) {
  const full = join(OUT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

/* ── 共通の枠 ─────────────────────────────── */
function head(title, description, path) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(SITE_URL + path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ja_JP">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='12' cy='11' r='7' fill='%23A8351F'/%3E%3Cpath d='M2 30 Q-1 15 12 12 Q25 15 22 30 Z' fill='%23A8351F'/%3E%3Ccircle cx='27' cy='19' r='3' fill='%23241F1C'/%3E%3Cpath d='M23 30 Q23 23 27 22.5 Q31 23 31 30 Z' fill='%23241F1C'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Yomogi&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>`;
}

function header(cur = '') {
  const data = [['rikishi', '力士'], ['kimarite', '決まり手'], ['ranking', 'ランキング']];
  const read = Object.entries(KINDS).map(([k, v]) => [k, v.label]);
  const li = ([k, l]) => `<li><a href="/${k}/"${cur === k ? ' aria-current="page"' : ''}>${l}</a></li>`;
  return `<header class="site">
  <div class="wrap bar">
    <a class="logo" href="/"><span class="a">SUMO</span><span class="b">girl</span><span class="c">LAB</span></a>
    <nav aria-label="サイト内">
      <ul class="primary">${data.map(li).join('')}</ul>
      <ul class="secondary">${read.map(li).join('')}</ul>
    </nav>
    <div class="tools">
      <span id="fsLabel">文字</span>
      <button type="button" data-size="1" aria-pressed="true" aria-describedby="fsLabel">小</button>
      <button type="button" data-size="1.1" aria-pressed="false" aria-describedby="fsLabel">中</button>
      <button type="button" data-size="1.22" aria-pressed="false" aria-describedby="fsLabel">大</button>
    </div>
  </div>
</header>`;
}

function footer(s) {
  const links = [
    s.x_url && `<li><a href="${esc(s.x_url)}">X</a></li>`,
    s.instagram_url && `<li><a href="${esc(s.instagram_url)}">Instagram</a></li>`,
    s.note_url && `<li><a href="${esc(s.note_url)}">note</a></li>`
  ].filter(Boolean).join('');
  return `<footer>
  <div class="wrap">
    <p class="fn">${esc(s.site_name || 'SUMO GIRL LAB')}</p>
    <p>データは日本相撲協会の公表資料をもとに集計したものです。本場所の映像・写真は掲載していません。図表はすべて自作です。</p>
    ${links ? `<ul class="social">${links}</ul>` : ''}
  </div>
</footer>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function pagehead(title, sub, extra = '') {
  return `<div class="phead"><div class="wrap">
  <h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}${extra}
</div></div>`;
}

/* ── 一年の帯 ─────────────────────────────── */
function yearBar() {
  const year = new Date().getFullYear();
  const jan1 = new Date(year, 0, 1).getTime(), dec31 = new Date(year, 11, 31).getTime();
  const X = t => 24 + ((t - jan1) / (dec31 - jan1)) * 672;
  const blocks = [], wide = [], narrow = [];
  for (const b of BASHO) {
    const x1 = X(new Date(b.start).getTime()), x2 = X(new Date(b.end).getTime());
    const w = Math.max(x2 - x1, 10), cx = (x1 + w / 2).toFixed(1);
    blocks.push(`<rect x="${x1.toFixed(1)}" y="38" width="${w.toFixed(1)}" height="10" rx="5"/>`);
    wide.push(`<text x="${cx}" y="68">${esc(b.name)}</text>`);
    narrow.push(`<text x="${cx}" y="74">${new Date(b.start).getMonth() + 1}月</text>`);
  }
  return `<svg viewBox="0 0 720 82" role="img" aria-labelledby="ybT ybD">
  <title id="ybT">一年の中の本場所の位置</title>
  <desc id="ybD">年六場所、各十五日間の位置を一年の帯の上に示したもの。</desc>
  <line x1="24" y1="43" x2="696" y2="43" stroke="var(--rule)" stroke-width="1"/>
  <g fill="var(--accent)">${blocks.join('')}</g>
  <g class="lbl-wide ax">${wide.join('')}</g>
  <g class="lbl-narrow ax2">${narrow.join('')}</g>
  <g id="nowMark" hidden>
    <line id="nowLine" x1="0" y1="26" x2="0" y2="56" stroke="var(--ink)" stroke-width="2"/>
    <circle id="nowDot" cx="0" cy="26" r="3.5" fill="var(--ink)"/>
  </g>
</svg>`;
}

/* ── トップページ ─────────────────────────── */
function indexPage(s, articles, db) {
  const latest = articles.slice(0, 4);
  let hub = '', top5 = '';

  if (db) {
    const R = buildRankings(db.rikishi);
    hub = `<section class="hub wrap" aria-label="データベース">
  <a class="hcard" href="/rikishi/"><span class="hn">${db.rikishi.length}</span><span class="hl">力士</span><span class="hd">番付推移・成績・決まり手の傾向</span></a>
  <a class="hcard" href="/kimarite/"><span class="hn">${db.kimarite.length}</span><span class="hl">決まり手</span><span class="hd">八十二手と非技五つ</span></a>
  <a class="hcard" href="/ranking/"><span class="hn">7</span><span class="hl">ランキング</span><span class="hd">勝率・部屋別・出身地・学歴</span></a>
</section>`;

    const t = R.byYearRate.slice(0, 5);
    top5 = `<section class="wrap block">
  <div class="bhead"><h2>2026年 勝率上位</h2><a href="/ranking/">ランキングをすべて見る</a></div>
  <table class="data compact"><thead><tr><th scope="col" class="n">#</th><th scope="col">力士</th><th scope="col">番付</th><th scope="col" class="n">勝率%</th><th scope="col" class="n">勝-敗</th></tr></thead>
  <tbody>${t.map((r, i) => `<tr><td class="n rk">${i + 1}</td><td class="nm"><span class="dot" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span><a href="/rikishi/${encodeURIComponent(r.name)}/">${esc(r.name)}</a></td><td>${esc(r.rank)}</td><td class="n">${pct(r._year.rate)}</td><td class="n">${r._year.win}-${r._year.loss}</td></tr>`).join('')}</tbody></table>
</section>`;
  }

  return head(s.site_name || 'SUMO GIRL LAB',
    s.description_ja || '大相撲の力士データと、見て思ったことの記録。', '/')
    + header() + `
<section class="hero wrap" aria-labelledby="ht">
  <h1 id="ht">${s.tagline_ja || '大相撲が動くのは、一年で九十日。<br>残りの日は、数えたり調べたりしています。'}</h1>
  ${yearBar()}
  <p class="status" id="status"></p>
  ${s.notice ? `<p class="notice">${esc(s.notice)}</p>` : ''}
  <div class="fifteen" id="fifteen" hidden><h2 id="f15">この場所に書いたもの</h2><ol class="days" id="days" aria-labelledby="f15"></ol></div>
</section>
<script id="bashoData" type="application/json">${JSON.stringify({ basho: BASHO, written: writtenMap(articles) })}</script>
<main id="main">
${hub}
${top5}
<section class="wrap block">
  <div class="bhead"><h2>最近書いたもの</h2><a href="/archive/">記事の一覧</a></div>
  ${latest.length ? `<ul class="posts">${latest.map(a => `<li>
    <a href="${urlOf(a)}"><span class="pk ${kindOf(a)}">${KINDS[kindOf(a)].label}</span><span class="pt">${esc(a.title_ja)}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></a>
  </li>`).join('')}</ul>` : '<p class="empty">まだ記事がありません。</p>'}
</section>
<section class="wrap block about">
  <h2>このサイトについて</h2>
  ${(s.profile_ja || '').split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('') || '<p>大相撲の記録を集めて、数えて、書いています。</p>'}
</section>
</main>` + footer(s);
}

function writtenMap(articles) {
  const w = {};
  for (const a of articles) if (a.basho && a.basho_day) (w[a.basho] ||= []).push(Number(a.basho_day));
  return w;
}

/* ── 記事 ─────────────────────────────────── */
function postPage(s, a) {
  const k = kindOf(a);
  return head(`${a.title_ja} — ${s.site_name || 'SUMO GIRL LAB'}`, a.summary_ja || s.description_ja || '', urlOf(a))
    + header(k) + `<main id="main"><article class="detail wrap">
  <nav class="crumb"><a href="/${k}/">${KINDS[k].label}</a> <span>/</span> <time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></nav>
  <h1>${esc(a.title_ja)}</h1>
  ${a.summary_ja ? `<p class="lead-p">${esc(a.summary_ja)}</p>` : ''}
  ${a.figure_svg ? `<figure class="chart">${a.figure_svg}</figure>` : ''}
  <div class="body">${a.body_ja || ''}</div>
</article></main>` + footer(s);
}

function listPage(s, title, sub, arts, cur, path) {
  return head(`${title} — ${s.site_name || 'SUMO GIRL LAB'}`, sub, path) + header(cur)
    + pagehead(title, sub) + `<main id="main"><div class="wrap block">
  ${arts.length ? `<ul class="posts">${arts.map(a => `<li><a href="${urlOf(a)}"><span class="pk ${kindOf(a)}">${KINDS[kindOf(a)].label}</span><span class="pt">${esc(a.title_ja)}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></a></li>`).join('')}</ul>`
      : '<p class="empty">まだ記事がありません。</p>'}
</div></main>` + footer(s);
}

/* ── 実行 ─────────────────────────────────── */
const settings = await api('settings');
const { contents: articles } = await api('contents', '?limit=100&orders=-publishedAt');
console.log(`記事 ${articles.length} 本。`);

const DB_PATH = ['data/sumo.json', 'sumo.json'].find(p => existsSync(p));
let db = null, dbUrls = [];

if (DB_PATH) {
  const raw = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  db = { rikishi: enrich(raw.rikishi || []), kimarite: raw.kimarite || [] };

  let memos = new Map();
  try {
    const { contents } = await api('rikishi', '?limit=200');
    memos = new Map(contents.map(m => [m.name, m]));
    console.log(`力士メモ ${contents.length} 件。`);
  } catch { console.log('rikishi API は未作成です。'); }

  const byKimarite = new Map();
  for (const r of db.rikishi) for (const k of r.kimariteStyle || []) {
    if (!byKimarite.has(k.name)) byKimarite.set(k.name, []);
    byKimarite.get(k.name).push([r, k.pct]);
  }
  for (const v of byKimarite.values()) v.sort((a, b) => b[1] - a[1]);

  const order = { makuuchi: 0, juryo: 1, makushita: 2 };
  const sorted = [...db.rikishi].sort((a, b) => order[a.division] - order[b.division] || a.row - b.row);

  await write('rikishi/index.html',
    head(`力士データベース — ${settings.site_name || 'SUMO GIRL LAB'}`,
      `幕内・十両・幕下あわせて${db.rikishi.length}人の番付推移と成績。`, '/rikishi/')
    + header('rikishi')
    + pagehead('力士データベース', `幕内・十両・幕下あわせて${db.rikishi.length}人。見出しをクリックすると並べ替えられます。`)
    + `<main id="main"><div class="wrap block">${rikishiTable(sorted)}</div></main>` + footer(settings));

  for (const r of db.rikishi) {
    await write(`rikishi/${r.name}/index.html`,
      head(`${r.name}（${r.rank}）— ${settings.site_name || 'SUMO GIRL LAB'}`,
        `${r.name}、${r.heya}、${r.from}。番付推移と通算成績。`, `/rikishi/${encodeURIComponent(r.name)}/`)
      + header('rikishi') + `<main id="main">${rikishiBody(r, memos.get(r.name))}</main>` + footer(settings));
    dbUrls.push(`/rikishi/${encodeURIComponent(r.name)}/`);
  }

  await write('ranking/index.html',
    head(`ランキング — ${settings.site_name || 'SUMO GIRL LAB'}`,
      '勝率、決まり手、部屋別、出身地、最終学歴の集計。', '/ranking/')
    + header('ranking')
    + pagehead('ランキング', '当サイトが追跡している力士の範囲で集計しています。')
    + rankingBody(db.rikishi) + footer(settings));

  await write('kimarite/index.html',
    head(`決まり手図鑑 — ${settings.site_name || 'SUMO GIRL LAB'}`,
      '日本相撲協会が定める八十二手と非技五つ、あわせて87種。', '/kimarite/')
    + header('kimarite')
    + pagehead('決まり手図鑑', '八十二手と非技五つ、あわせて87種。得意にしている関取の数も出しています。')
    + `<main id="main"><div class="wrap block">${kimariteBody(db.kimarite, byKimarite)}</div></main>` + footer(settings));

  for (const k of db.kimarite) {
    await write(`kimarite/${k.n}/index.html`,
      head(`${k.name} — ${settings.site_name || 'SUMO GIRL LAB'}`, k.desc, `/kimarite/${k.n}/`)
      + header('kimarite') + `<main id="main">${kimariteDetail(k, (byKimarite.get(k.name) || []).slice(0, 20))}</main>` + footer(settings));
    dbUrls.push(`/kimarite/${k.n}/`);
  }

  dbUrls.push('/rikishi/', '/kimarite/', '/ranking/');
  console.log(`力士 ${db.rikishi.length} 人、決まり手 ${db.kimarite.length} 種。`);
} else {
  console.log('sumo.json が見つかりません。データベースは作りません。');
}

await write('index.html', indexPage(settings, articles, db));
for (const a of articles) await write(`${kindOf(a)}/${a.slug || a.id}/index.html`, postPage(settings, a));
for (const [k, v] of Object.entries(KINDS))
  await write(`${k}/index.html`, listPage(settings, v.label, v.desc, articles.filter(a => kindOf(a) === k), k, `/${k}/`));
await write('archive/index.html', listPage(settings, '記事の一覧', '新しい順に並んでいます。', articles, '', '/archive/'));

await mkdir(join(OUT, 'assets'), { recursive: true });
for (const f of ['style.css', 'site.js']) {
  const src = existsSync(join('assets', f)) ? join('assets', f) : existsSync(f) ? f : null;
  if (src) await copyFile(src, join(OUT, 'assets', f));
  else console.warn(`警告: ${f} が見つかりません。`);
}

const urls = ['/', '/archive/', ...Object.keys(KINDS).map(k => `/${k}/`), ...articles.map(urlOf), ...dbUrls];
await write('sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + urls.map(u => `<url><loc>${SITE_URL}${u}</loc></url>`).join('\n') + `\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`${OUT}/ に書き出しました。`);
