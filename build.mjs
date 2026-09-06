// SUMO GIRL — 静的サイトビルダー
// microCMS の2つのAPI（contents / settings）から dist/ を生成します。
// 依存パッケージなし。Node.js 18 以上で動きます。

import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// Cloudflare Pages に登録済みの VITE_ 付きの名前にも対応しています
const SERVICE = process.env.MICROCMS_SERVICE_DOMAIN || process.env.VITE_MICROCMS_SERVICE_DOMAIN;
const KEY = process.env.MICROCMS_API_KEY || process.env.VITE_MICROCMS_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://sumogirl.pages.dev';
const OUT = 'dist';

/* ──────────────────────────────────────────────────────────
   本場所の日程。年に一度、ここだけ書き換えてください。
   協会の発表で日付を確認してから更新すること。
   ────────────────────────────────────────────────────────── */
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

/* ── microCMS ───────────────────────────────── */

async function api(endpoint, query = '') {
  const url = `https://${SERVICE}.microcms.io/api/v1/${endpoint}${query}`;
  const res = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': KEY } });
  if (!res.ok) throw new Error(`${endpoint} の取得に失敗しました (${res.status}): ${await res.text()}`);
  return res.json();
}

/* ── 小道具 ─────────────────────────────────── */

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// microCMS のセレクトは配列で返るので先頭を取る
const pick = (v, fallback = '') => Array.isArray(v) ? (v[0] || fallback) : (v || fallback);

const KINDS = {
  miru:     { label: '観る',   desc: '見て思ったことです。場所の十五日間はここが増えます。うまく言えないことも、そのまま書きます。' },
  kazoeru:  { label: '数える', desc: '数えると分かることがあります。図を1枚と、それを見て驚いた話を1つ。場所のあいだに作っています。' },
  shiru:    { label: '知る',   desc: '用語、所作、番付、決まり手。わたしが最初に分からなかったものから順に調べています。ここがいちばん厚くなる予定です。' }
};

// content_type は複数選択のため、最初に選ばれた1つを主カテゴリとして使う
const kindOf = (a) => (KINDS[pick(a.content_type)] ? pick(a.content_type) : 'shiru');
const urlOf = (a) => `/${kindOf(a)}/${a.slug || a.id}/`;

function jpDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

async function write(path, html) {
  const full = join(OUT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

/* ── 部品 ───────────────────────────────────── */

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

function header(current = '') {
  const nav = Object.entries(KINDS).map(([k, v]) =>
    `<li><a href="/${k}/"${current === k ? ' aria-current="page"' : ''}>${v.label}</a></li>`
  ).join('');
  return `<header class="site">
  <div class="wrap bar">
    <a class="logo" href="/"><span class="a">SUMO</span><span class="b">girl</span></a>
    <nav aria-label="カテゴリ"><ul>${nav}</ul></nav>
    <div class="tools">
      <span id="fsLabel">文字の大きさ</span>
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
    <p>${esc(s.site_name || 'SUMO GIRL')}</p>
    <p>本場所の映像・写真は掲載していません。図はすべて自作です。</p>
    ${links ? `<ul class="social">${links}</ul>` : ''}
  </div>
</footer>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function itemRow(a) {
  const k = kindOf(a);
  return `<article class="item">
  <p class="meta"><span class="tag ${k}">${KINDS[k].label}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></p>
  <h3><a href="${urlOf(a)}">${esc(a.title_ja)}</a></h3>
</article>`;
}

/* ── 一年の帯 ───────────────────────────────── */

function yearBar(bashoList) {
  const year = new Date().getFullYear();
  const jan1 = new Date(year, 0, 1).getTime();
  const dec31 = new Date(year, 11, 31).getTime();
  const span = dec31 - jan1;
  const X = (t) => 24 + ((t - jan1) / span) * 672;

  const blocks = [];
  const wide = [];
  const narrow = [];
  for (const b of bashoList) {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    if (isNaN(s) || isNaN(e)) continue;
    const x1 = X(s), x2 = X(e);
    const w = Math.max(x2 - x1, 10);
    const cx = (x1 + w / 2).toFixed(1);
    blocks.push(`<rect x="${x1.toFixed(1)}" y="38" width="${w.toFixed(1)}" height="12" rx="6"/>`);
    wide.push(`<text x="${cx}" y="70">${esc(b.name)}</text>`);
    narrow.push(`<text x="${cx}" y="76">${new Date(b.start).getMonth() + 1}月</text>`);
  }

  return `<svg viewBox="0 0 720 84" role="img" aria-labelledby="ybT ybD">
  <title id="ybT">一年の中の本場所の位置</title>
  <desc id="ybD">一月から十二月までを横一列にした帯。年に六回、それぞれ十五日間の本場所が置かれている。</desc>
  <line x1="24" y1="44" x2="696" y2="44" stroke="var(--rule)" stroke-width="1.5"/>
  <g fill="var(--shu)">${blocks.join('')}</g>
  <g class="lbl-wide" fill="var(--sub)" font-size="13" text-anchor="middle">${wide.join('')}</g>
  <g class="lbl-narrow" fill="var(--sub)" font-size="21" text-anchor="middle">${narrow.join('')}</g>
  <g id="nowMark" hidden>
    <line id="nowLine" x1="0" y1="24" x2="0" y2="58" stroke="var(--sumi)" stroke-width="2"/>
    <circle id="nowDot" cx="0" cy="24" r="4" fill="var(--sumi)"/>
  </g>
</svg>`;
}

/* ── トップページ ───────────────────────────── */

function indexPage(s, articles) {
  const hero = articles.find(a => a.featured) || articles[0];
  const rest = articles.filter(a => a !== hero).slice(0, 4);

  const basho = BASHO;

  // 記事から「どの場所の何日目を書いたか」を集める
  const written = {};
  for (const a of articles) {
    if (a.basho && a.basho_day) {
      (written[a.basho] ||= []).push(Number(a.basho_day));
    }
  }

  const heroBlock = hero ? `<article class="lead wrap">
  <span class="tag ${kindOf(hero)}">${KINDS[kindOf(hero)].label}</span>
  <h2><a href="${urlOf(hero)}">${esc(hero.title_ja)}</a></h2>
  ${hero.summary_ja ? `<p>${esc(hero.summary_ja)}</p>` : ''}
  ${hero.figure_svg ? `<div class="figure">${hero.figure_svg}</div>` : ''}
</article>` : `<div class="wrap"><p class="empty">まだ記事がありません。</p></div>`;

  const gates = Object.entries(KINDS).map(([k, v]) =>
    `<li><p class="name"><a href="/${k}/">${v.label}</a></p><p>${esc(v.desc)}</p></li>`
  ).join('');

  return head(
    s.site_name || 'SUMO GIRL',
    s.description_ja || '相撲が動くのは年90日。残りの日に、調べたり数えたりしています。',
    '/'
  ) + header() + `
<section class="year wrap" aria-labelledby="yearTitle">
  <h1 id="yearTitle" class="thesis">${(s.tagline_ja || '相撲が動くのは、一年で九十日。<br>残りの日に、調べたり数えたりしています。')}</h1>
  ${yearBar(basho)}
  <p class="status" id="status"></p>
  ${s.notice ? `<p class="notice">${esc(s.notice)}</p>` : ''}
  <div class="fifteen" id="fifteen" hidden>
    <h2 id="fifteenTitle">この場所に書いたもの</h2>
    <ol class="days" id="days" aria-labelledby="fifteenTitle"></ol>
  </div>
</section>
<script id="bashoData" type="application/json">${JSON.stringify({ basho, written })}</script>

<main id="main">
${heroBlock}

<section class="list wrap" aria-labelledby="recentTitle">
  <h2 id="recentTitle">最近書いたもの</h2>
  ${rest.map(itemRow).join('\n') || '<p class="empty">まだありません。</p>'}
  <p class="more"><a href="/archive/">これまでに書いたもの</a></p>
</section>

<section class="gates wrap" aria-label="三つの入口">
  <ul>${gates}</ul>
</section>

<section class="about wrap" aria-labelledby="aboutTitle">
  <div class="about-in">
    <svg viewBox="0 0 176 132" role="img" aria-labelledby="abT abD">
      <title id="abT">力士と書き手の大きさの比較</title>
      <desc id="abD">大きな力士のシルエットの横に、書き手を表す小さな人影が立っている。</desc>
      <line x1="4" y1="118" x2="172" y2="118" stroke="var(--rule)" stroke-width="1.5"/>
      <g fill="var(--shu)">
        <circle cx="58" cy="36" r="18"/><circle cx="58" cy="14" r="6.5"/>
        <path d="M24 118 Q16 66 58 57 Q100 66 92 118 Z"/>
      </g>
      <g fill="var(--sumi)">
        <circle cx="136" cy="62" r="8"/>
        <path d="M127 62 Q125 78 130 82 L142 82 Q147 78 145 62 Z"/>
        <path d="M127 82 Q125 101 129 118 L143 118 Q147 101 145 82 Z"/>
      </g>
    </svg>
    <div>
      <h2 id="aboutTitle">書いている人</h2>
      ${(s.profile_ja || '').split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('\n')}
      ${s.sign_ja ? `<p class="sign">${esc(s.sign_ja)}</p>` : ''}
    </div>
  </div>
</section>
</main>
` + footer(s);
}

/* ── 記事ページ ─────────────────────────────── */

function postPage(s, a) {
  const k = kindOf(a);
  return head(
    `${a.title_ja} — ${s.site_name || 'SUMO GIRL'}`,
    a.summary_ja || s.description_ja || '',
    urlOf(a)
  ) + header(k) + `
<main id="main">
<article class="post wrap">
  <p class="meta"><span class="tag ${k}">${KINDS[k].label}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></p>
  <h1>${esc(a.title_ja)}</h1>
  ${a.figure_svg ? `<div class="figure">${a.figure_svg}</div>` : ''}
  <div class="body">${a.body_ja || ''}</div>
</article>
<p class="backlink wrap"><a href="/${k}/">${KINDS[k].label}の記事をもっと見る</a></p>
</main>
` + footer(s);
}

/* ── 一覧ページ ─────────────────────────────── */

function listPage(s, title, desc, articles, current = '', path = '/') {
  return head(`${title} — ${s.site_name || 'SUMO GIRL'}`, desc, path) + header(current) + `
<div class="pagehead wrap">
  <h1>${esc(title)}</h1>
  <p>${esc(desc)}</p>
</div>
<main id="main">
<section class="list wrap" aria-label="記事の一覧">
  ${articles.map(itemRow).join('\n') || '<p class="empty">まだ記事がありません。</p>'}
</section>
</main>
` + footer(s);
}

/* ── 実行 ───────────────────────────────────── */

const settings = await api('settings');
const { contents: articles } = await api('contents', '?limit=100&orders=-publishedAt');

console.log(`記事 ${articles.length} 本を取得しました。`);

await write('index.html', indexPage(settings, articles));

for (const a of articles) {
  await write(`${kindOf(a)}/${a.slug || a.id}/index.html`, postPage(settings, a));
}

for (const [k, v] of Object.entries(KINDS)) {
  const list = articles.filter(a => kindOf(a) === k);
  await write(`${k}/index.html`, listPage(settings, v.label, v.desc, list, k, `/${k}/`));
}

await write('archive/index.html',
  listPage(settings, 'これまでに書いたもの', '古い順に下へ続きます。', articles, '', '/archive/'));

// アセットをコピー
await mkdir(join(OUT, 'assets'), { recursive: true });
for (const f of await readdir('assets')) {
  await copyFile(join('assets', f), join(OUT, 'assets', f));
}

// sitemap と robots
const urls = ['/', '/archive/', ...Object.keys(KINDS).map(k => `/${k}/`), ...articles.map(urlOf)];
await write('sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `<url><loc>${SITE_URL}${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`${OUT}/ に書き出しました。`);
