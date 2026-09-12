// 力士データベースと決まり手図鑑のページを組み立てます。
// build.mjs から呼ばれます。

export const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── 番付を数値にする ───────────────────────
   序ノ口を0、横綱を9として、同じ段の中は番号で上下します。
   ────────────────────────────────────────── */
const TIERS = [
  { key: '序ノ口', base: 0, graded: true,  max: 30 },
  { key: '序二段', base: 1, graded: true,  max: 100 },
  { key: '三段目', base: 2, graded: true,  max: 90 },
  { key: '幕下',   base: 3, graded: true,  max: 60 },
  { key: '十両',   base: 4, graded: true,  max: 14 },
  { key: '前頭',   base: 5, graded: true,  max: 17 },
  { key: '小結',   base: 6, graded: false },
  { key: '関脇',   base: 7, graded: false },
  { key: '大関',   base: 8, graded: false },
  { key: '横綱',   base: 9, graded: false }
];

export function rankValue(rank) {
  if (!rank) return null;
  for (const t of TIERS) {
    if (rank.startsWith(t.key)) {
      if (!t.graded) return t.base;
      const n = parseInt(rank.slice(t.key.length), 10);
      if (isNaN(n)) return t.base;
      return t.base + Math.max(0, Math.min(1, 1 - (n - 1) / t.max)) * 0.92;
    }
  }
  return null;
}

const DIVISION_LABEL = { makuuchi: '幕内', juryo: '十両', makushita: '幕下' };

/* ── 番付推移グラフ ─────────────────────── */
export function rankChart(r) {
  const hist = (r.rankHistory || []).filter(h => rankValue(h.rank) !== null);
  if (hist.length < 2) return '';

  const W = 720, H = 280, L = 52, R = 16, T = 18, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const x = (i) => L + (hist.length === 1 ? iw / 2 : (i / (hist.length - 1)) * iw);
  const y = (v) => T + ih - (v / 9.92) * ih;

  // 段の区切り線
  const bands = TIERS.map(t => {
    const yy = y(t.base);
    return `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="var(--rule)" stroke-width="1"/>`;
  }).join('');

  const labels = ['序ノ口', '三段目', '十両', '前頭', '大関', '横綱'].map(k => {
    const t = TIERS.find(t => t.key === k);
    return `<text x="${L - 8}" y="${(y(t.base) + 4).toFixed(1)}" font-size="11" fill="var(--sub)" text-anchor="end">${k}</text>`;
  }).join('');

  const pts = hist.map((h, i) => [x(i), y(rankValue(h.rank))]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `M${pts[0][0].toFixed(1)} ${(H - B).toFixed(1)} ` +
    pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts[pts.length - 1][0].toFixed(1)} ${(H - B).toFixed(1)} Z`;

  const last = pts[pts.length - 1];

  // 年のめもり
  const years = [];
  let seen = null;
  hist.forEach((h, i) => {
    const yr = h.basho.slice(0, 4);
    if (yr !== seen) { seen = yr; years.push([x(i), yr]); }
  });
  const yearTicks = years.map(([xx, yr]) =>
    `<text x="${xx.toFixed(1)}" y="${H - 12}" font-size="11" fill="var(--sub)" text-anchor="middle">${yr}</text>`
  ).join('');

  const first = hist[0], now = hist[hist.length - 1];
  return `<div class="chart">
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="rcT rcD">
    <title id="rcT">${esc(r.name)}の番付推移</title>
    <desc id="rcD">${esc(first.basho)}の${esc(first.rank)}から、${esc(now.basho)}の${esc(now.rank)}まで、${hist.length}場所ぶんの番付の動きを折れ線で示しています。</desc>
    ${bands}${labels}
    <path d="${area}" fill="var(--shu)" opacity="0.08"/>
    <path d="${line}" fill="none" stroke="var(--shu)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.5" fill="var(--shu)"/>
    ${yearTicks}
  </svg>
</div>`;
}

/* ── 力士カード ─────────────────────────── */
export function rikishiCard(r) {
  const c = r.mawashiColor;
  return `<a class="rk-card" href="/rikishi/${encodeURIComponent(r.name)}/">
  <span class="rk-mawashi" style="background:${esc(c?.hex || '#888')}" aria-hidden="true"></span>
  <span class="rk-body">
    <span class="rk-name">${esc(r.name)}</span>
    <span class="rk-meta">${esc(r.rank)}　${esc(r.heya || '')}</span>
  </span>
</a>`;
}

/* ── 力士ページ ─────────────────────────── */
export function rikishiBody(r, memo) {
  const c = r.mawashiColor;
  const yusho = Object.entries(r.yusho || {}).filter(([, v]) => v > 0);
  const s = r.sansho || {};
  const sansho = [['殊勲賞', s.shukun], ['敢闘賞', s.kanto], ['技能賞', s.gino]].filter(([, v]) => v > 0);
  const cr = r.career || {}, rec = r.record || {};

  const rows = [
    ['番付', r.rank],
    ['部屋', r.heya],
    ['出身', r.from],
    ['最高位', r.highestRank],
    ['体格', r.physique],
    ['初土俵', cr.hatsudohyo],
    ['新十両', cr.shinjuryo],
    ['新入幕', cr.shinnyumaku],
    ['最終学歴', cr.gakureki],
    ['通算成績', rec.career],
    ['幕内成績', rec.makuuchi],
    ['2026年', rec.year2026],
    ['優勝', yusho.length ? yusho.map(([k, v]) => `${k} ${v}回`).join('、') : null],
    ['三賞', sansho.length ? sansho.map(([k, v]) => `${k} ${v}回`).join('、') : null],
    ['まわし', c?.name]
  ].filter(([, v]) => v);

  const style = (r.kimariteStyle || []).slice(0, 5);
  const maxPct = Math.max(1, ...style.map(k => k.pct));

  return `<article class="post wrap">
  <p class="meta">
    <span class="tag kazoeru">力士</span>
    <span class="rk-mawashi big" style="background:${esc(c?.hex || '#888')}" aria-hidden="true"></span>
    <span>${esc(DIVISION_LABEL[r.division] || '')}</span>
  </p>
  <h1>${esc(r.name)}</h1>

  ${rankChart(r)}

  ${style.length ? `<h2 class="sub">よく使う決まり手</h2>
  <ul class="bars">
    ${style.map(k => `<li>
      <span class="bl">${esc(k.name)}</span>
      <span class="bt"><span class="bf" style="width:${(k.pct / maxPct * 100).toFixed(0)}%"></span></span>
      <span class="bv">${k.pct}%</span>
    </li>`).join('')}
  </ul>` : ''}

  <h2 class="sub">記録</h2>
  <table class="facts">
    <tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>
  </table>

  ${r.note ? `<p class="rk-note">${esc(r.note)}</p>` : ''}
  ${memo ? `<div class="memo">
    <p class="memo-label">わたしのメモ</p>
    <p class="memo-body">${esc(memo.comment)}</p>
  </div>` : ''}

  <p class="source">番付・成績は日本相撲協会の公表資料をもとに集計しています。</p>
</article>
<p class="backlink wrap"><a href="/rikishi/">力士の一覧にもどる</a></p>`;
}

/* ── 力士一覧 ───────────────────────────── */
export function rikishiIndexBody(list) {
  const groups = ['makuuchi', 'juryo', 'makushita'];
  return `<main id="main">
${groups.map(g => {
    const rs = list.filter(r => r.division === g);
    if (!rs.length) return '';
    return `<section class="wrap rk-section" aria-labelledby="g-${g}">
  <h2 id="g-${g}" class="rk-head">${DIVISION_LABEL[g]}<span class="rk-count">${rs.length}人</span></h2>
  <div class="rk-grid">${rs.map(rikishiCard).join('')}</div>
</section>`;
  }).join('')}
</main>`;
}

/* ── 決まり手 ───────────────────────────── */
const KIND = { '基本技': 'kihon', '投げ手': 'nage', '掛け手': 'kake', '反り手': 'sori', '捻り手': 'hineri', '特殊技': 'tokushu', '非技': 'hiwaza' };

export function kimariteIndexBody(kimarite, byKimarite) {
  const types = [...new Set(kimarite.map(k => k.type))];
  return `<main id="main">
<section class="wrap rk-section">
  ${types.map(t => {
    const ks = kimarite.filter(k => k.type === t);
    return `<h2 class="rk-head">${esc(t)}<span class="rk-count">${ks.length}手</span></h2>
    <div class="km-grid">${ks.map(k => {
      const users = byKimarite.get(k.name) || [];
      return `<a class="km ${KIND[k.type] || ''}" href="/kimarite/${k.n}/">
        <span class="km-n">${esc(k.name)}</span>
        <span class="km-y">${esc(k.yomi)}</span>
        ${users.length ? `<span class="km-u">${users.length}人</span>` : ''}
      </a>`;
    }).join('')}</div>`;
  }).join('')}
</section>
</main>`;
}

export function kimariteBody(k, users) {
  return `<article class="post wrap">
  <p class="meta"><span class="tag shiru">決まり手</span><span>${esc(k.type)}　第${k.n}手</span></p>
  <h1>${esc(k.name)}<span class="yomi">${esc(k.yomi)}</span></h1>
  <div class="body"><p>${esc(k.desc)}</p></div>
  ${users.length ? `<h2 class="sub">この手をよく使う力士</h2>
  <div class="rk-grid">${users.map(([r, pct]) => `<a class="rk-card" href="/rikishi/${encodeURIComponent(r.name)}/">
    <span class="rk-mawashi" style="background:${esc(r.mawashiColor?.hex || '#888')}" aria-hidden="true"></span>
    <span class="rk-body"><span class="rk-name">${esc(r.name)}</span><span class="rk-meta">${esc(r.rank)}　${pct}%</span></span>
  </a>`).join('')}</div>` : `<p class="empty">追跡している関取のなかに、この手を得意にしている力士はいません。</p>`}
  <p class="source">決まり手の分類は日本相撲協会が定める八十二手および非技五つによります。</p>
</article>
<p class="backlink wrap"><a href="/kimarite/">決まり手の一覧にもどる</a></p>`;
}
