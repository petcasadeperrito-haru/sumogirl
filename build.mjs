// SUMO GIRL LAB — 静的サイトビルダー
// microCMS（contents / settings / rikishi）と data/sumo.json から dist/ を生成します。
// 依存パッケージなし。Node.js 18 以上。

import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { enrich, buildRankings, pct, divisionLabel, resultText } from './stats.mjs';
import {
  rikishiTable, rikishiCards, rikishiBody, rankingBody,
  kimariteBody, kimariteDetail, esc
} from './rikishi.mjs';
import { japanMap } from './japan.mjs';
import { cardIndex, kimariteCard, rikishiCard, rankingCard, draftsPage } from './share.mjs';

const SERVICE = process.env.MICROCMS_SERVICE_DOMAIN || process.env.VITE_MICROCMS_SERVICE_DOMAIN;
const KEY = process.env.MICROCMS_API_KEY || process.env.VITE_MICROCMS_API_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://sumogirl.jp').replace(/\/$/, '');

/* ── サイト名（2026-10-31 変更）────────────────
   日本語ページは「相撲ガール・ラボ」、英語ページ（/en/）は「SUMO GIRL LAB」。
   旧名は構造化データの別名に残して、検索のつながりを保ちます。 */
const NAME_JA = '相撲ガール・ラボ';
const NAME_EN = 'SUMO GIRL LAB';
const OLD_NAMES = ['SUMO GIRL LAB', 'SUMOガール', 'SUMO GIRL', '相撲ガールラボ', 'SUMOガールラボ'];
const HOME_TITLE_JA = `${NAME_JA}｜相撲好きのリケジョが観て、数えて、確かめる大相撲`;
const HOME_TITLE_EN = `${NAME_EN} | A science student who grew up loving sumo, counting what she sees`;
const DESC_JA = '子どものころから相撲が大好きな理系の女子大生が、観て思ったことを書き、気になったことを数えて確かめるサイト。観戦の記録、相撲の入門、力士データと決まり手図鑑。';
const DESC_EN = 'A Japanese science student who has loved sumo since childhood writes about what she sees at grand sumo, then counts and checks what she wonders about. Beginner guides, tournament notes and sumo data.';

// 記事ごとの検索語（data/seo.json）。本文は変えずに、構造化データの keywords に使います。
const SEO = (() => {
  for (const p of ['data/seo.json', 'seo.json']) if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return {};
})();
// アクセス解析。測定IDはページのソースに出る公開情報なので、ここに直接書いています。
// 環境変数 GA_ID を設定すると、そちらが優先されます。
const GA_ID = process.env.GA_ID || 'G-P3DQR3GD8D';
const CF_BEACON = process.env.CF_BEACON || '';
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
const KINDS_EN = {
  miru:    { label: 'Diary', desc: 'What I noticed watching grand sumo. This section grows during each 15-day tournament.' },
  kazoeru: { label: 'Data',  desc: 'One question, counted and drawn as one chart.' },
  shiru:   { label: 'Learn', desc: 'Terms, rituals, rankings and techniques: everything I looked up, in one place.' }
};
const kindOf = a => (KINDS[pick(a.content_type)] ? pick(a.content_type) : 'shiru');
const urlOf = a => `/${kindOf(a)}/${a.slug || a.id}/`;
const enUrlOf = a => `/en${urlOf(a)}`;
const jpDate = iso => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const enDate = iso => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' });

// タイトルが「テスト」で始まる記事は、検索に出さず、一覧にも載せません。
const isTest = a => /^\s*テスト/.test(a.title_ja || '');
// 英語タイトルと英語本文の両方がある記事だけ、英語ページを作ります。
const hasEn = a => !isTest(a) && !!(a.title_en && String(a.title_en).trim()) && !!(a.body_en && String(a.body_en).replace(/<[^>]+>/g, '').trim());
const plain = html => String(html || '').replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();
const clip = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
// 英語の要約欄はないので、英語本文の最初の段落から作ります。
const summaryEn = a => {
  const firstP = (String(a.body_en || '').match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1];
  return clip(plain(firstP || a.body_en), 155);
};
const keywordsOf = (a, lang) => (SEO[a.slug] && SEO[a.slug][lang]) || [];

async function write(path, html) {
  const full = join(OUT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

/* ── 共通の枠 ─────────────────────────────── */
function analytics() {
  let out = '';
  if (GA_ID) {
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>
`;
  }
  if (CF_BEACON) {
    out += `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${CF_BEACON}"}'></script>
`;
  }
  return out;
}

/* ── 構造化データ（JSON-LD）──────────────────── */
const ORG_ID = `${SITE_URL}/#org`, SITE_ID = `${SITE_URL}/#website`;
function siteLd(lang = 'ja') {
  const en = lang === 'en';
  return [
    {
      '@type': 'WebSite', '@id': en ? `${SITE_URL}/en/#website` : SITE_ID,
      url: `${SITE_URL}${en ? '/en/' : '/'}`,
      name: en ? NAME_EN : NAME_JA,
      alternateName: en ? [NAME_JA, 'SUMO GIRL'] : OLD_NAMES,
      description: en ? DESC_EN : DESC_JA,
      inLanguage: lang,
      publisher: { '@id': ORG_ID }
    },
    {
      '@type': 'Organization', '@id': ORG_ID,
      name: NAME_JA, alternateName: [NAME_EN, 'SUMOガール'],
      url: `${SITE_URL}/`,
      description: DESC_JA,
      logo: `${SITE_URL}/favicon.svg`
    }
  ];
}
const AUTHOR = lang => ({
  '@type': 'Person',
  name: lang === 'en' ? 'SUMO GIRL LAB editor' : `${NAME_JA} 編集部`,
  description: lang === 'en'
    ? 'A Japanese university student in science who has loved sumo since childhood.'
    : '子どものころから相撲が大好きな、理系の女子大学生。',
  url: `${SITE_URL}${lang === 'en' ? '/en/about/' : '/about/'}`
});
function crumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({
      '@type': 'ListItem', position: i + 1, name, ...(path ? { item: SITE_URL + path } : {})
    }))
  };
}
function articleLd(a, lang = 'ja') {
  const en = lang === 'en', k = kindOf(a);
  const path = en ? enUrlOf(a) : urlOf(a);
  const kw = keywordsOf(a, lang);
  return [
    {
      '@type': 'Article', '@id': `${SITE_URL}${path}#article`,
      mainEntityOfPage: `${SITE_URL}${path}`,
      headline: clip(en ? a.title_en : a.title_ja, 110),
      description: en ? summaryEn(a) : (a.summary_ja || ''),
      inLanguage: lang,
      datePublished: a.publishedAt,
      dateModified: a.revisedAt || a.updatedAt || a.publishedAt,
      ...(a.thumbnail?.url ? { image: [a.thumbnail.url] } : {}),
      author: AUTHOR(lang),
      publisher: { '@id': ORG_ID },
      isPartOf: { '@id': en ? `${SITE_URL}/en/#website` : SITE_ID },
      articleSection: en ? KINDS_EN[k].label : KINDS[k].label,
      about: { '@type': 'Thing', name: en ? 'Sumo' : '大相撲', sameAs: en ? 'https://en.wikipedia.org/wiki/Sumo' : 'https://ja.wikipedia.org/wiki/%E5%A4%A7%E7%9B%B8%E6%92%B2' },
      ...(kw.length ? { keywords: kw.join(', ') } : {})
    },
    crumbLd(en
      ? [[NAME_EN, '/en/'], [KINDS_EN[k].label, `/en/${k}/`], [a.title_en]]
      : [[NAME_JA, '/'], [KINDS[k].label, `/${k}/`], [a.title_ja]])
  ];
}
const ldScript = graph => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>\n`;

// opt: { lang: 'ja'|'en', alt: { ja: path, en: path }（対になるページ）, ld: [...], noindex, ogType }
function head(title, description, path, opt = {}) {
  const lang = opt.lang || 'ja';
  const alt = opt.alt || null;
  const hreflang = alt && alt.ja && alt.en ? `<link rel="alternate" hreflang="ja" href="${esc(SITE_URL + alt.ja)}">
<link rel="alternate" hreflang="en" href="${esc(SITE_URL + alt.en)}">
<link rel="alternate" hreflang="x-default" href="${esc(SITE_URL + alt.ja)}">
` : '';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${opt.noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${esc(SITE_URL + path)}">
${hreflang}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${opt.ogType || 'website'}">
<meta property="og:url" content="${esc(SITE_URL + path)}">
<meta property="og:site_name" content="${lang === 'en' ? NAME_EN : NAME_JA}">
<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'ja_JP'}">
<meta name="twitter:card" content="summary">
${ldScript([...siteLd(lang), ...(opt.ld || [])])}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='12' cy='11' r='7' fill='%23A8351F'/%3E%3Cpath d='M2 30 Q-1 15 12 12 Q25 15 22 30 Z' fill='%23A8351F'/%3E%3Ccircle cx='27' cy='19' r='3' fill='%23241F1C'/%3E%3Cpath d='M23 30 Q23 23 27 22.5 Q31 23 31 30 Z' fill='%23241F1C'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Yomogi&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
${analytics()}</head>
<body>
<a class="skip" href="#main">${lang === 'en' ? 'Skip to content' : '本文へ移動'}</a>`;
}

// alt: 言語切替の行き先（日本語ページなら英語版のパス、英語ページなら日本語版のパス）
function header(cur = '', lang = 'ja', alt = null) {
  const li = ([href, l, k]) => `<li><a href="${href}"${cur === k ? ' aria-current="page"' : ''}>${l}</a></li>`;
  if (lang === 'en') {
    const read = Object.entries(KINDS_EN).map(([k, v]) => [`/en/${k}/`, v.label, k]);
    return `<header class="site">
  <div class="wrap bar">
    <a class="logo" href="/en/" aria-label="${NAME_EN} home"><span class="a">SUMO</span><span class="b">girl</span><span class="c">LAB</span></a>
    <nav aria-label="Site">
      <ul class="secondary">${read.map(li).join('')}${li(['/en/about/', 'About', 'about'])}</ul>
    </nav>
    <div class="tools">
      <span id="fsLabel">Text</span>
      <button type="button" data-size="1" aria-pressed="true" aria-describedby="fsLabel">S</button>
      <button type="button" data-size="1.1" aria-pressed="false" aria-describedby="fsLabel">M</button>
      <button type="button" data-size="1.22" aria-pressed="false" aria-describedby="fsLabel">L</button>
      <a class="lang" href="${alt || '/'}" lang="ja" hreflang="ja">日本語</a>
    </div>
  </div>
</header>`;
  }
  const data = [['rikishi', '力士'], ['kimarite', '決まり手'], ['ranking', 'ランキング'], ['map', '出身地']].map(([k, l]) => [`/${k}/`, l, k]);
  const read = Object.entries(KINDS).map(([k, v]) => [`/${k}/`, v.label, k]);
  return `<header class="site">
  <div class="wrap bar">
    <a class="logo" href="/" aria-label="${NAME_JA} トップ"><span class="a">相撲</span><span class="b">ガール</span><span class="c">ラボ</span></a>
    <nav aria-label="サイト内">
      <ul class="primary">${data.map(li).join('')}</ul>
      <ul class="secondary">${read.map(li).join('')}</ul>
    </nav>
    <div class="tools">
      <span id="fsLabel">文字</span>
      <button type="button" data-size="1" aria-pressed="true" aria-describedby="fsLabel">小</button>
      <button type="button" data-size="1.1" aria-pressed="false" aria-describedby="fsLabel">中</button>
      <button type="button" data-size="1.22" aria-pressed="false" aria-describedby="fsLabel">大</button>
      <a class="lang" href="${alt || '/en/'}" lang="en" hreflang="en">EN</a>
    </div>
  </div>
</header>`;
}

function footer(s, lang = 'ja') {
  const links = [
    s.x_url && `<li><a href="${esc(s.x_url)}">X</a></li>`,
    s.instagram_url && `<li><a href="${esc(s.instagram_url)}">Instagram</a></li>`,
    s.note_url && `<li><a href="${esc(s.note_url)}">note</a></li>`
  ].filter(Boolean).join('');
  if (lang === 'en') return `<footer>
  <div class="wrap">
    <p class="fn">${NAME_EN}</p>
    <p>Figures are counted by the author from records published by the Japan Sumo Association and may contain errors. No photos or video of tournament bouts are used. All charts and illustrations are our own.</p>
    ${links ? `<ul class="social">${links}</ul>` : ''}
    <p class="fsub"><a href="/en/about/">About</a>　<a href="/en/archive/">All articles</a>　<a href="/" lang="ja">日本語</a>　<a href="/privacy/" lang="ja">Privacy policy (Japanese)</a></p>
  </div>
</footer>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
  return `<footer>
  <div class="wrap">
    <p class="fn">${NAME_JA}</p>
    <p>データは日本相撲協会の公表資料をもとに、筆者が自分で集計したものです。本場所の映像・写真は掲載していません。図表はすべて自作です。</p>
    ${links ? `<ul class="social">${links}</ul>` : ''}
    <p class="fsub"><a href="/about/">このサイトについて</a>　<a href="/archive/">記事の一覧</a>　<a href="/en/" lang="en">English</a>　<a href="/privacy/">プライバシーポリシー</a></p>
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
  <g fill="var(--ink)">${blocks.join('')}</g>
  <g class="lbl-wide ax">${wide.join('')}</g>
  <g class="lbl-narrow ax2">${narrow.join('')}</g>
  <g id="nowMark" hidden>
    <line id="nowLine" x1="0" y1="26" x2="0" y2="56" stroke="var(--ink)" stroke-width="2"/>
    <circle id="nowDot" cx="0" cy="26" r="3.5" fill="var(--ink)"/>
  </g>
</svg>`;
}

/* ── 直近の場所の結果 ─────────────────────── */
function lastBashoBlock(db) {
  const lb = db.lastBasho;
  if (!lb) return '';
  const byName = new Map(db.rikishi.map(r => [r.name, r]));
  const a = n => byName.has(n) ? `<a href="/rikishi/${encodeURIComponent(n)}/">${esc(n)}</a>` : esc(n);
  const rec = n => { const x = byName.get(n)?._last; return x && x.basho === lb.id ? `（${resultText(x)}）` : ''; };
  const names = list => list.length ? list.map(n => a(n) + rec(n)).join('・') : '該当なし';
  const [mk, ...others] = lb.yusho || [];
  const nth = c => c === 1 ? '初優勝' : `${c}度目`;
  const ten = db.rikishi
    .filter(r => r._last && r._last.basho === lb.id && r._last.w >= 10)
    .sort((x, y) => y._last.w - x._last.w || x.row - y.row);

  return `<section class="wrap block lastb" aria-labelledby="lbT">
  <div class="bhead"><h2 id="lbT">${esc(lb.name)}の結果</h2><a href="/rikishi/">全員の成績を見る</a></div>
  <div class="lbgrid">
    ${mk ? `<div class="lbmain">
      <p class="lbk">${esc(mk.division)}優勝</p>
      <p class="lbn">${a(mk.name)}</p>
      <p class="lbr">${esc(mk.rank)}　${esc(mk.record)}　${nth(mk.count)}</p>
      ${mk.memo ? `<p class="lbm">${esc(mk.memo)}</p>` : ''}
    </div>` : ''}
    <dl class="lbl">
      ${others.map(y => `<div><dt>${esc(y.division)}優勝</dt><dd>${a(y.name)}（${esc(y.record)}）　${nth(y.count)}${y.memo ? `<span class="lbs">${esc(y.memo)}</span>` : ''}</dd></div>`).join('')}
      <div><dt>殊勲賞</dt><dd>${names(lb.sansho?.shukun || [])}</dd></div>
      <div><dt>敢闘賞</dt><dd>${names(lb.sansho?.kanto || [])}</dd></div>
      <div><dt>技能賞</dt><dd>${names(lb.sansho?.gino || [])}</dd></div>
      ${(lb.kinboshi || []).length ? `<div><dt>金星</dt><dd>${lb.kinboshi.map(k => `${a(k.name)}（${k.day}日目、${esc(k.opponent)}に勝つ）`).join('・')}</dd></div>` : ''}
      ${lb.next?.shinjuryo?.length ? `<div><dt>${esc(lb.next.name)}で新十両</dt><dd>${lb.next.shinjuryo.map(a).join('・')}</dd></div>` : ''}
    </dl>
  </div>
  ${ten.length ? `<h3 class="lbh">二桁勝った関取　${ten.length}人</h3>
  <ul class="lbten">${ten.map(r => `<li>${a(r.name)}<span>${r._last.w}勝</span></li>`).join('')}</ul>` : ''}
  <p class="source">出典：日本相撲協会（各段優勝・三賞・力士プロフィール）。${lb.next?.banzuke ? `${esc(lb.next.name)}の番付発表は${+lb.next.banzuke.slice(5, 7)}月${+lb.next.banzuke.slice(8, 10)}日の予定です。` : ''}</p>
</section>`;
}

/* ── トップページ ─────────────────────────── */
function indexPage(s, articles, db) {
  const latest = articles.slice(0, 5);
  let hub = '', top5 = '';

  if (db) {
    const R = buildRankings(db.rikishi);
    hub = `<section class="hub wrap" aria-label="データベース">
  <a class="hcard" href="/rikishi/"><span class="hn">${db.rikishi.length}</span><span class="hl">力士</span><span class="hd">番付推移・成績・決まり手の傾向</span></a>
  <a class="hcard" href="/kimarite/"><span class="hn">${db.kimarite.length}</span><span class="hl">決まり手</span><span class="hd">八十二手と非技五つ</span></a>
  <a class="hcard" href="/ranking/"><span class="hn">7</span><span class="hl">ランキング</span><span class="hd">勝率・部屋別・出身地・学歴</span></a>
  <a class="hcard" href="/map/"><span class="hn">${new Set(db.rikishi.map(r => r.from)).size}</span><span class="hl">出身地</span><span class="hd">日本地図でみる出身地</span></a>
</section>`;

    const t = R.byYearRate.slice(0, 5);
    top5 = `<section class="wrap block">
  <div class="bhead"><h2>2026年 勝率上位<small>十両以上の土俵で</small></h2><a href="/ranking/">ランキングをすべて見る</a></div>
  <table class="data compact"><thead><tr><th scope="col" class="n">#</th><th scope="col">力士</th><th scope="col">番付</th><th scope="col" class="n">勝率%</th><th scope="col" class="n">勝-敗</th></tr></thead>
  <tbody>${t.map((r, i) => `<tr><td class="n rk">${i + 1}</td><td class="nm"><span class="dot" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span><a href="/rikishi/${encodeURIComponent(r.name)}/">${esc(r.name)}</a></td><td>${esc(r.rank)}</td><td class="n">${pct(r._yearS.rate)}</td><td class="n">${r._yearS.win}-${r._yearS.loss}</td></tr>`).join('')}</tbody></table>
</section>`;
  }

  // 最新の1本を大きく、続く4本を横に並べます（ファーストビューに記事が入るように）
  const [pick, ...rest] = latest;
  const meta = a => `<span class="pk ${kindOf(a)}">${KINDS[kindOf(a)].label}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time>`;
  const feed = pick ? `<div class="feedgrid">
    <article class="pick">
      <a href="${urlOf(pick)}">
        <span class="pmeta">${meta(pick)}<span class="pnew">最新</span></span>
        <h3 class="ptitle">${esc(pick.title_ja)}</h3>
        ${pick.summary_ja ? `<span class="psum">${esc(pick.summary_ja)}</span>` : ''}
        <span class="pmore" aria-hidden="true">続きを読む</span>
      </a>
    </article>
    ${rest.length ? `<ul class="posts side">${rest.map(a => `<li>
      <a href="${urlOf(a)}"><span class="pk ${kindOf(a)}">${KINDS[kindOf(a)].label}</span><span class="pt">${esc(a.title_ja)}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></a>
    </li>`).join('')}</ul>` : ''}
  </div>` : '<p class="empty">まだ記事がありません。</p>';

  return head(HOME_TITLE_JA, s.description_ja || DESC_JA, '/', { alt: { ja: '/', en: '/en/' } })
    + header('', 'ja', '/en/') + `
<script id="bashoData" type="application/json">${JSON.stringify({ basho: BASHO, written: writtenMap(articles) })}</script>
<main id="main">
<section class="intro wrap" aria-labelledby="ht">
  <h1 id="ht">${s.tagline_ja || '大相撲が動くのは、一年で九十日。<br>残りの日は、数えたり調べたりしています。'}</h1>
  <p class="status" id="status"></p>
  ${s.notice ? `<p class="notice">${esc(s.notice)}</p>` : ''}
</section>
<section class="wrap feed" aria-labelledby="feedT">
  <div class="bhead"><h2 id="feedT">最近書いたもの</h2><a href="/archive/">記事の一覧</a></div>
  <div class="fifteen" id="fifteen" hidden><h3 id="f15">この場所に書いたもの</h3><ol class="days" id="days" aria-labelledby="f15"></ol></div>
  ${feed}
</section>
${db ? lastBashoBlock(db) : ''}
<section class="wrap block cal" aria-labelledby="calT">
  <div class="bhead"><h2 id="calT">一年の本場所</h2></div>
  ${yearBar()}
</section>
${hub}
${top5}
<section class="wrap block about">
  <h2>このサイトについて</h2>
  ${(s.profile_ja || '').split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('') || ABOUT_SHORT_JA}
  <p><a href="/about/">${NAME_JA}について、くわしく</a></p>
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
  const en = hasEn(a);
  return head(`${a.title_ja}｜${NAME_JA}`, a.summary_ja || s.description_ja || DESC_JA, urlOf(a), {
      alt: en ? { ja: urlOf(a), en: enUrlOf(a) } : null,
      ld: isTest(a) ? [] : articleLd(a, 'ja'),
      noindex: isTest(a), ogType: 'article'
    })
    + header(k, 'ja', en ? enUrlOf(a) : '/en/') + `<main id="main"><article class="detail wrap">
  <nav class="crumb"><a href="/${k}/">${KINDS[k].label}</a> <span>/</span> <time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></nav>
  <h1>${esc(a.title_ja)}</h1>
  ${a.summary_ja ? `<p class="lead-p">${esc(a.summary_ja)}</p>` : ''}
  ${a.figure_svg ? `<figure class="chart">${a.figure_svg}</figure>` : ''}
  <div class="body">${a.body_ja || ''}</div>
  ${en ? `<p class="langnote"><a href="${enUrlOf(a)}" lang="en" hreflang="en">Read this article in English</a></p>` : ''}
</article></main>` + footer(s);
}

function enPostPage(s, a) {
  const k = kindOf(a);
  const sum = summaryEn(a);
  return head(`${a.title_en} | ${NAME_EN}`, sum || DESC_EN, enUrlOf(a), {
      lang: 'en', alt: { ja: urlOf(a), en: enUrlOf(a) }, ld: articleLd(a, 'en'), ogType: 'article'
    })
    + header(k, 'en', urlOf(a)) + `<main id="main"><article class="detail wrap">
  <nav class="crumb" aria-label="Breadcrumb"><a href="/en/${k}/">${KINDS_EN[k].label}</a> <span>/</span> <time datetime="${esc(a.publishedAt)}">${enDate(a.publishedAt)}</time></nav>
  <h1>${esc(a.title_en)}</h1>
  ${a.figure_svg ? `<figure class="chart">${a.figure_svg}</figure>` : ''}
  <div class="body">${a.body_en}</div>
  <p class="langnote"><a href="${urlOf(a)}" lang="ja" hreflang="ja">この記事を日本語で読む</a></p>
</article></main>` + footer(s, 'en');
}

const postList = (arts, lang = 'ja') => {
  if (!arts.length) return `<p class="empty">${lang === 'en' ? 'No articles yet.' : 'まだ記事がありません。'}</p>`;
  return `<ul class="posts">${arts.map(a => {
    const k = kindOf(a);
    return lang === 'en'
      ? `<li><a href="${enUrlOf(a)}"><span class="pk ${k}">${KINDS_EN[k].label}</span><span class="pt">${esc(a.title_en)}</span><time datetime="${esc(a.publishedAt)}">${enDate(a.publishedAt)}</time></a></li>`
      : `<li><a href="${urlOf(a)}"><span class="pk ${k}">${KINDS[k].label}</span><span class="pt">${esc(a.title_ja)}</span><time datetime="${esc(a.publishedAt)}">${jpDate(a.publishedAt)}</time></a></li>`;
  }).join('')}</ul>`;
};

function listPage(s, title, sub, arts, cur, path, opt = {}) {
  const fullTitle = opt.title || `${title}｜${NAME_JA}`;
  return head(fullTitle, opt.desc || sub, path, { alt: { ja: path, en: `/en${path}` }, ld: [crumbLd([[NAME_JA, '/'], [title]])] })
    + header(cur, 'ja', `/en${path}`)
    + pagehead(title, sub) + `<main id="main"><div class="wrap block">
  ${postList(arts)}
</div></main>` + footer(s);
}

function enListPage(s, title, sub, arts, cur, path, fullTitle) {
  const jaPath = path.replace(/^\/en/, '');
  return head(fullTitle || `${title} | ${NAME_EN}`, sub, path, { lang: 'en', alt: { ja: jaPath, en: path }, ld: [crumbLd([[NAME_EN, '/en/'], [title]])] })
    + header(cur, 'en', jaPath)
    + pagehead(title, sub) + `<main id="main"><div class="wrap block">
  ${postList(arts, 'en')}
</div></main>` + footer(s, 'en');
}

/* ── 英語のトップ ─────────────────────────── */
function enIndexPage(s, arts) {
  const latest = arts.slice(0, 8);
  const byKind = k => arts.filter(a => kindOf(a) === k).length;
  return head(HOME_TITLE_EN, DESC_EN, '/en/', { lang: 'en', alt: { ja: '/', en: '/en/' } })
    + header('', 'en', '/') + `
<main id="main">
<section class="intro wrap" aria-labelledby="ht">
  <h1 id="ht">Grand sumo, watched closely<br>and counted carefully.</h1>
  <p class="status">${esc(DESC_EN)}</p>
</section>
<section class="wrap feed" aria-labelledby="feedT">
  <div class="bhead"><h2 id="feedT">Latest articles</h2><a href="/en/archive/">All articles</a></div>
  ${postList(latest, 'en')}
</section>
<section class="hub wrap" aria-label="Sections">
  ${Object.entries(KINDS_EN).map(([k, v]) => `<a class="hcard" href="/en/${k}/"><span class="hn">${byKind(k)}</span><span class="hl">${v.label}</span><span class="hd">${esc(v.desc)}</span></a>`).join('\n  ')}
</section>
<section class="wrap block about">
  <h2>About this site</h2>
  ${ABOUT_SHORT_EN}
  <p><a href="/en/about/">More about ${NAME_EN}</a></p>
</section>
</main>` + footer(s, 'en');
}

/* ── このサイトについて（運営者ページ）─────────
   個人が特定できる情報（名前・大学名・学年・地域・顔写真）は載せません。 */
const ABOUT_SHORT_JA = `<p>子どものころから相撲が大好きな、理系の女子大学生が書いています。観て思ったことを書いて、気になったことは数えて確かめる。数字は主役ではなく、「思ったこと」の裏づけです。</p>`;
const ABOUT_SHORT_EN = `<p>Written by a Japanese university student in science who has loved sumo since she was a child. She writes down what she notices, then counts to check it. The numbers back up the story; they are not the story.</p>`;

function aboutPage(s) {
  const body = `
<h2>相撲が好きな、理系の女子大生のサイトです</h2>
<p>${NAME_JA}は、子どものころから相撲が大好きな理系の女子大学生が書いているサイトです。</p>
<p>理系に進んで、データを扱うようになってから、ずっと好きだった相撲の見え方が少し変わりました。「立ち合いで前に出た方が勝つって本当？」「幕下上位って、そんなに強いの？」。気になったことがあると、つい数えて確かめたくなるのです。</p>
<p>数えてみると、ずっと見てきたはずの相撲に、知らなかった顔がたくさんありました。このサイトは、その発見を書きとめておく場所です。</p>

<h2>記事の書き方</h2>
<p>記事はいつも、まず「思ったこと」から書きます。そのあとに「気になって数えたこと」を載せます。数字は主役ではなく、思ったことを確かめるための道具です。データが好きな人にも、相撲を見はじめたばかりの人にも、同じ記事を楽しんでもらえるようにしています。</p>

<h2>このサイトにあるもの</h2>
<ul>
<li><a href="/miru/">観る</a>：取組や番付を見て思ったこと。場所の十五日間はここが増えます</li>
<li><a href="/kazoeru/">数える</a>：気になったことを一つ取り上げて、数えて、図にしたもの</li>
<li><a href="/shiru/">知る</a>：用語、所作、番付、決まり手など、はじめての人がつまずきやすいことの解説</li>
<li><a href="/rikishi/">力士データベース</a>・<a href="/kimarite/">決まり手図鑑</a>・<a href="/ranking/">ランキング</a>・<a href="/map/">出身地マップ</a></li>
<li><a href="/en/" lang="en">English</a>：海外の相撲ファンのための英語版</li>
</ul>

<h2>データについて</h2>
<p>記事やデータベースの数値は、日本相撲協会が公表している資料などをもとに、筆者が自分で調べて数えたものです。数え方は各記事に書き、出典も載せています。正確さには気をつけていますが、集計や転記の誤りがあるかもしれません。正式な記録は、日本相撲協会の公表資料でご確認ください。</p>

<h2>図と写真について</h2>
<p>本場所の映像や、会場内で撮影した写真は使っていません。力士や取組の図は、すべて自分で描き起こしています。</p>

<h2>運営者</h2>
<p>${NAME_JA} 編集部（理系の女子大学生）</p>
<p>個人の特定につながる情報（名前・学校名・住んでいる地域など）は公開していません。</p>
${s.contact_url || s.x_url ? `<h2>お問い合わせ</h2>
<p>記事の誤りのご指摘や、お問い合わせは<a href="${esc(s.contact_url || s.x_url)}" rel="nofollow">こちら</a>からお願いします。</p>` : ''}
<p><a href="/privacy/">プライバシーポリシー</a></p>
`;
  return head(`このサイトについて｜${NAME_JA}`,
    `${NAME_JA}は、子どものころから相撲が大好きな理系の女子大生が、観て思ったことを書き、気になったことを数えて確かめるサイトです。`, '/about/', {
      alt: { ja: '/about/', en: '/en/about/' },
      ld: [{ '@type': 'AboutPage', url: `${SITE_URL}/about/`, name: `このサイトについて｜${NAME_JA}`, inLanguage: 'ja', about: { '@id': ORG_ID } },
        crumbLd([[NAME_JA, '/'], ['このサイトについて']])]
    })
    + header('about', 'ja', '/en/about/')
    + pagehead('このサイトについて', '相撲が大好きな理系の女子大生が、観て、数えて、確かめています。')
    + `<main id="main"><article class="detail wrap"><div class="body">${body}</div></article></main>` + footer(s);
}

function enAboutPage(s) {
  const body = `
<h2>A sumo site by a science student</h2>
<p>${NAME_EN} is written by a Japanese university student in science who has loved sumo since she was a child.</p>
<p>Studying science, and working with data, changed how she watches a sport she has always loved. Does the wrestler who moves forward at the tachiai really win? Are the top makushita wrestlers really that strong? When something makes her wonder, she can't help counting to find out.</p>
<p>Counting showed her sides of sumo she had never noticed, even after years of watching. This site is where she writes those discoveries down.</p>

<h2>How the articles work</h2>
<p>Every article starts with what she noticed, and only then the numbers she counted to check it. The data backs up the story; it is not the story. The goal is that the same article works for a data lover and for someone watching sumo for the first time.</p>

<h2>What you'll find here</h2>
<ul>
<li><a href="/en/miru/">Diary</a>: notes on bouts and rankings, growing day by day during each tournament</li>
<li><a href="/en/kazoeru/">Data</a>: one question, counted and turned into a chart</li>
<li><a href="/en/shiru/">Learn</a>: terms, rituals, rankings and techniques that first-time viewers often find confusing</li>
<li><a href="/rikishi/" lang="ja">Wrestler database</a> and <a href="/kimarite/" lang="ja">winning techniques</a> (in Japanese)</li>
</ul>

<h2>About the data</h2>
<p>The figures on this site were researched and counted by the author from records published by the Japan Sumo Association and other public sources, and may not be accurate. Each article explains how the counting was done and lists its sources. For official records, please refer to the Japan Sumo Association.</p>

<h2>About images</h2>
<p>We don't use video or photos of tournament bouts. All illustrations of wrestlers and bouts are drawn by hand.</p>

<h2>Who runs this site</h2>
<p>The ${NAME_EN} editor, a university student in science. We don't publish personal details such as names, schools or locations.</p>
${s.contact_url || s.x_url ? `<h2>Contact</h2>
<p>To report a mistake or get in touch, please use <a href="${esc(s.contact_url || s.x_url)}" rel="nofollow">this link</a>.</p>` : ''}
`;
  return head(`About | ${NAME_EN}`,
    `${NAME_EN} is written by a Japanese science student who has loved sumo since childhood. She writes what she notices at grand sumo, then counts to check it.`, '/en/about/', {
      lang: 'en', alt: { ja: '/about/', en: '/en/about/' },
      ld: [{ '@type': 'AboutPage', url: `${SITE_URL}/en/about/`, name: `About | ${NAME_EN}`, inLanguage: 'en', about: { '@id': ORG_ID } },
        crumbLd([[NAME_EN, '/en/'], ['About']])]
    })
    + header('about', 'en', '/about/')
    + pagehead('About', 'A sumo fan since childhood, now counting what she sees.')
    + `<main id="main"><article class="detail wrap"><div class="body">${body}</div></article></main>` + footer(s, 'en');
}


/* ── プライバシーポリシー ─────────────────── */
function privacyPage(s) {
  const name = NAME_JA;
  const contact = s.contact_url || s.x_url || '';
  const today = new Date();
  const updated = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  return head(`プライバシーポリシー｜${name}`,
    `${name}における、アクセス解析と個人情報の取り扱いについて。`, '/privacy/')
    + header()
    + pagehead('プライバシーポリシー', `${name}（以下「当サイト」）における、情報の取り扱いについて定めたものです。`)
    + `<main id="main"><article class="detail wrap">
<div class="body">

<h2>アクセス解析について</h2>
<p>当サイトでは、サイトの利用状況を把握し、内容を改善するために、次のアクセス解析ツールを使用しています。</p>

<h3>Google アナリティクス</h3>
<p>Google LLC が提供する Google アナリティクスを使用しています。このツールは、閲覧されたページ、サイトに滞在した時間、おおよその地域、使用されている端末やブラウザの種類といった情報を、Cookie（クッキー）を用いて収集します。</p>
<p>収集される情報は統計的に処理されたものであり、個人を特定するものではありません。収集された情報は Google 社のプライバシーポリシーに基づいて管理されます。</p>
<p>Cookie による収集を希望されない場合は、ご利用のブラウザの設定で Cookie を無効にするか、Google が提供する<a href="https://tools.google.com/dlpage/gaoptout?hl=ja" rel="nofollow">オプトアウト アドオン</a>をご利用ください。</p>
<p>Google アナリティクスの詳細は、<a href="https://policies.google.com/technologies/partner-sites?hl=ja" rel="nofollow">Google のポリシーと規約</a>および<a href="https://marketingplatform.google.com/about/analytics/terms/jp/" rel="nofollow">Google アナリティクス利用規約</a>をご確認ください。</p>

<h3>Cloudflare Web Analytics</h3>
<p>当サイトは Cloudflare, Inc. が提供する Cloudflare Web Analytics を使用しています。このツールは Cookie を使用せず、閲覧者を個人として識別したり、複数のサイトを横断して追跡したりすることはありません。</p>

<h2>個人情報の取り扱い</h2>
<p>当サイトは、お問い合わせフォームや会員登録の仕組みを設けておらず、氏名・住所・電話番号・メールアドレスなどの個人情報を、閲覧者から直接取得することはありません。</p>
<p>前項のアクセス解析によって取得する情報には、IPアドレスなど個人情報に該当しうるものが含まれる場合がありますが、当サイトではこれを個人の特定に用いることはなく、サイトの改善以外の目的で利用することもありません。</p>
<p>取得した情報を、法令に基づく場合を除き、第三者に提供することはありません。</p>

<h2>当サイトで扱う情報について</h2>
<p>当サイトに掲載している力士の成績、番付、決まり手などの記録は、日本相撲協会が公表している資料をもとに、当サイトが独自に集計したものです。内容の正確性には注意を払っていますが、集計や転記の誤りが含まれる可能性があります。正式な記録については、必ず日本相撲協会の公表資料をご確認ください。</p>
<p>当サイトは、本場所の映像および会場内で撮影された写真を掲載していません。図表はすべて当サイトが作成したものです。</p>
<p>出身地マップの地図データは、Wikimedia Commons で公開されている「日本地図」（作者：Lincun、<a href="https://creativecommons.org/licenses/by-sa/3.0/deed.ja" rel="license">CC BY-SA 3.0</a>）を簡略化して作成した二次的著作物です。同ライセンスの継承条件に従い、当サイトの地図も CC BY-SA 3.0 で提供します。</p>
<p>上記を除く当サイトの文章・図表の著作権は、当サイトに帰属します。引用の範囲を超えて利用される場合は、ご連絡ください。</p>

<h2>免責事項</h2>
<p>当サイトの情報を利用して生じたいかなる損害についても、当サイトは責任を負いかねます。</p>
<p>当サイトから外部サイトへのリンクを掲載する場合がありますが、リンク先で提供される情報やサービスについて、当サイトは責任を負いません。</p>

<h2>ポリシーの変更</h2>
<p>当サイトは、必要に応じて本ポリシーを変更することがあります。変更した場合は、このページに掲載します。</p>

${contact ? `<h2>お問い合わせ</h2>
<p>本ポリシーに関するお問い合わせは、<a href="${esc(contact)}" rel="nofollow">こちら</a>よりお願いします。</p>` : ''}

<p class="source">最終更新日：${updated}</p>
</div>
</article></main>` + footer(s);
}

/* ── 実行 ─────────────────────────────────── */
const settings = await api('settings');
const { contents: articles } = await api('contents', '?limit=100&orders=-publishedAt');
console.log(`記事 ${articles.length} 本。`);

const DB_PATH = ['data/sumo.json', 'sumo.json'].find(p => existsSync(p));
let db = null, dbUrls = [];

if (DB_PATH) {
  const raw = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  db = { rikishi: enrich(raw.rikishi || []), kimarite: raw.kimarite || [], lastBasho: raw.lastBasho || null };

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
    head(`相撲 力士データベース（幕内・十両・幕下${db.rikishi.length}人）｜${NAME_JA}`,
      `幕内・十両・幕下あわせて${db.rikishi.length}人の番付推移と成績。`, '/rikishi/')
    + header('rikishi')
    + pagehead('力士データベース', `幕内・十両・幕下あわせて${db.rikishi.length}人。カードで眺めるか、表で並べ替えるか、切り替えられます。`)
    + `<main id="main"><div class="wrap block">${rikishiTable(sorted)}${rikishiCards(sorted)}</div></main>` + footer(settings));

  await write('map/index.html',
    head(`力士の出身地マップ｜${NAME_JA}`,
      '力士の出身地を日本地図の上に示したもの。海外出身もあわせて。', '/map/')
    + header('map')
    + pagehead('出身地マップ', '円の大きさが人数です。えらぶと、その土地の力士が出ます。')
    + `<main id="main"><div class="wrap block">${japanMap(db.rikishi)}</div></main>` + footer(settings));
  dbUrls.push('/map/');

  for (const r of db.rikishi) {
    await write(`rikishi/${r.name}/index.html`,
      head(`${r.name}（${r.rank}）の成績と番付推移｜${NAME_JA}`,
        `${r.name}、${r.heya}、${r.from}。番付推移と通算成績。`, `/rikishi/${encodeURIComponent(r.name)}/`)
      + header('rikishi') + `<main id="main">${rikishiBody(r, memos.get(r.name))}</main>` + footer(settings));
    dbUrls.push(`/rikishi/${encodeURIComponent(r.name)}/`);
  }

  await write('ranking/index.html',
    head(`力士ランキング（勝率・決まり手・部屋別・出身地）｜${NAME_JA}`,
      '勝率、決まり手、部屋別、出身地、最終学歴の集計。', '/ranking/')
    + header('ranking')
    + pagehead('ランキング', '当サイトが追跡している力士の範囲で集計しています。')
    + rankingBody(db.rikishi) + footer(settings));

  await write('kimarite/index.html',
    head(`決まり手一覧・決まり手図鑑（82手と非技）｜${NAME_JA}`,
      '日本相撲協会が定める八十二手と非技五つ、あわせて87種。', '/kimarite/')
    + header('kimarite')
    + pagehead('決まり手図鑑', '八十二手と非技五つ、あわせて87種。得意にしている関取の数も出しています。')
    + `<main id="main"><div class="wrap block">${kimariteBody(db.kimarite, byKimarite)}</div></main>` + footer(settings));

  for (const k of db.kimarite) {
    await write(`kimarite/${k.n}/index.html`,
      head(`${k.name}とは｜決まり手図鑑｜${NAME_JA}`, k.desc, `/kimarite/${k.n}/`, { ld: [crumbLd([[NAME_JA, '/'], ['決まり手図鑑', '/kimarite/'], [k.name]])] })
      + header('kimarite') + `<main id="main">${kimariteDetail(k, (byKimarite.get(k.name) || []).slice(0, 20))}</main>` + footer(settings));
    dbUrls.push(`/kimarite/${k.n}/`);
  }

  dbUrls.push('/rikishi/', '/kimarite/', '/ranking/');
  console.log(`力士 ${db.rikishi.length} 人、決まり手 ${db.kimarite.length} 種。`);
} else {
  console.log('sumo.json が見つかりません。データベースは作りません。');
}

// テスト記事はページだけ作り（noindex）、一覧・トップ・サイトマップには載せません。
const listed = articles.filter(a => !isTest(a));
const enArticles = listed.filter(hasEn);
console.log(`英語版のある記事 ${enArticles.length} 本。`);

const KIND_TITLES_JA = {
  miru: `相撲観戦記・場所の振り返り｜${NAME_JA}`,
  kazoeru: `相撲データ｜リケジョが数えた大相撲の数字｜${NAME_JA}`,
  shiru: `相撲の基本・ルール・用語の解説｜${NAME_JA}`
};
const KIND_DESC_JA = {
  miru: '取組や番付を見て思ったことの記録。本場所の十五日間はここが増えます。',
  kazoeru: '決まり手、番付の動き、出身地、立ち合い。気になったことを一つ取り上げて、自分で数えて、図にしました。理系の女子大生が数えた相撲データです。',
  shiru: '仕切り、番付、付出、一門、締め込み。はじめて相撲を見る人がつまずきやすいことを、調べてまとめました。'
};
const KIND_TITLES_EN = {
  miru: `Sumo Tournament Diary | ${NAME_EN}`,
  kazoeru: `Sumo Data and Statistics, Counted by Hand | ${NAME_EN}`,
  shiru: `Sumo 101: Rules, Rankings and Rituals Explained | ${NAME_EN}`
};

await write('index.html', indexPage(settings, listed, db));
for (const a of articles) await write(`${kindOf(a)}/${a.slug || a.id}/index.html`, postPage(settings, a));
for (const [k, v] of Object.entries(KINDS))
  await write(`${k}/index.html`, listPage(settings, v.label, KIND_DESC_JA[k] || v.desc, listed.filter(a => kindOf(a) === k), k, `/${k}/`, { title: KIND_TITLES_JA[k] }));
await write('archive/index.html', listPage(settings, '記事の一覧', '新しい順に並んでいます。', listed, '', '/archive/'));
await write('about/index.html', aboutPage(settings));

/* ── 英語版（/en/）────────────────────────── */
await write('en/index.html', enIndexPage(settings, enArticles));
for (const a of enArticles) await write(`en/${kindOf(a)}/${a.slug || a.id}/index.html`, enPostPage(settings, a));
for (const [k, v] of Object.entries(KINDS_EN))
  await write(`en/${k}/index.html`, enListPage(settings, v.label, v.desc, enArticles.filter(a => kindOf(a) === k), k, `/en/${k}/`, KIND_TITLES_EN[k]));
await write('en/archive/index.html', enListPage(settings, 'All articles', 'Newest first.', enArticles, '', '/en/archive/'));
await write('en/about/index.html', enAboutPage(settings));
await write('privacy/index.html', privacyPage(settings));

/* ── SNS用のページ（検索には出しません） ─────────── */
{
  const cardR = [], cardK = [], cardRank = [];

  if (db) {
    const byK = new Map();
    for (const r of db.rikishi) for (const k of r.kimariteStyle || []) {
      if (!byK.has(k.name)) byK.set(k.name, []);
      byK.get(k.name).push([r, k.pct]);
    }

    for (const k of db.kimarite) {
      await write(`cards/kimarite/${k.n}/index.html`, kimariteCard(k, byK.get(k.name) || []));
      cardK.push([`/cards/kimarite/${k.n}/`, k.name]);
    }
    for (const r of db.rikishi) {
      await write(`cards/rikishi/${r.name}/index.html`, rikishiCard(r));
      cardR.push([`/cards/rikishi/${encodeURIComponent(r.name)}/`, r.name]);
    }

    const R = buildRankings(db.rikishi);
    const defs = [
      ['year-rate', '2026年 勝率', '十両以上で二十番以上', R.byYearRate.slice(0, 5)
        .map(x => ({ name: x.name, value: `${pct(x._yearS.rate)}%` }))],
      ['career-rate', '通算勝率', '百番以上', R.byCareerRate.slice(0, 5)
        .map(x => ({ name: x.name, value: `${pct(x._career.rate)}%` }))],
      ['kimarite', '得意にしている力士が多い決まり手', '関取のみ', R.byKimarite.slice(0, 5)
        .map(x => ({ name: x.name, value: `${x.users}人` }))],
      ['heya', '部屋別 2026年勝率', '関取のみ', R.byHeya.slice(0, 5)
        .map(x => ({ name: x.name, value: `${pct(x.rate)}%` }))],
      ['from', '出身地', `${db.rikishi.length}人を集計`, R.byFrom.filter(x => x.name !== '不明').slice(0, 5)
        .map(x => ({ name: x.name, value: `${x.n}人` }))]
    ];
    for (const [id, ttl, note, rows] of defs) {
      if (!rows.length) continue;
      await write(`cards/ranking/${id}/index.html`, rankingCard(id, ttl, note, rows));
      cardRank.push([`/cards/ranking/${id}/`, ttl]);
    }
  }

  await write('cards/index.html', cardIndex(cardR, cardK, cardRank));
  await write('drafts/index.html',
    draftsPage(articles, db, SITE_URL, a => KINDS[kindOf(a)].label, urlOf));
  console.log(`カード ${cardR.length + cardK.length + cardRank.length} 枚、Xの下書きページを作りました。`);
}

await mkdir(join(OUT, 'assets'), { recursive: true });
for (const f of ['style.css', 'site.js', 'card.css']) {
  const src = existsSync(join('assets', f)) ? join('assets', f) : existsSync(f) ? f : null;
  if (src) await copyFile(src, join(OUT, 'assets', f));
  else console.warn(`警告: ${f} が見つかりません。`);
}

for (const f of ['favicon.svg']) {
  const src = [join('public', f), f].find(p => existsSync(p));
  if (src) await copyFile(src, join(OUT, f));
}

/* ── サイトマップ（日英の対応つき）─────────── */
const lastmodOf = a => (a.revisedAt || a.updatedAt || a.publishedAt || '').slice(0, 10);
const newest = listed[0] ? lastmodOf(listed[0]) : '';
const sm = [];   // [path, lastmod, {ja, en} | null]
const pair = (ja, en) => ({ ja, en });
sm.push(['/', newest, pair('/', '/en/')], ['/en/', newest, pair('/', '/en/')]);
sm.push(['/about/', '', pair('/about/', '/en/about/')], ['/en/about/', '', pair('/about/', '/en/about/')]);
sm.push(['/archive/', newest, pair('/archive/', '/en/archive/')], ['/en/archive/', newest, pair('/archive/', '/en/archive/')]);
for (const k of Object.keys(KINDS)) sm.push([`/${k}/`, newest, pair(`/${k}/`, `/en/${k}/`)], [`/en/${k}/`, newest, pair(`/${k}/`, `/en/${k}/`)]);
sm.push(['/privacy/', '', null]);
for (const a of listed) {
  const p = hasEn(a) ? pair(urlOf(a), enUrlOf(a)) : null;
  sm.push([urlOf(a), lastmodOf(a), p]);
  if (p) sm.push([enUrlOf(a), lastmodOf(a), p]);
}
for (const u of dbUrls) sm.push([u, '', null]);

const xmlEsc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
await write('sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`
  + sm.map(([u, lm, p]) => `<url><loc>${xmlEsc(SITE_URL + u)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}${p
      ? `<xhtml:link rel="alternate" hreflang="ja" href="${xmlEsc(SITE_URL + p.ja)}"/><xhtml:link rel="alternate" hreflang="en" href="${xmlEsc(SITE_URL + p.en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${xmlEsc(SITE_URL + p.ja)}"/>`
      : ''}</url>`).join('\n') + `\n</urlset>\n`);
// Cloudflare の「robots.txt の管理」がオンのときは、Cloudflare 側の内容が先頭に足されます。
await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`サイトマップ ${sm.length} 件。`);

console.log(`${OUT}/ に書き出しました。`);
