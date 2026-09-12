// 力士一覧、ランキング、決まり手図鑑のページを組み立てます。

import { pct, divisionLabel, buildRankings } from './stats.mjs';

export const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── 番付を数値にする ─────────────────────── */
const TIERS = [
  { key: '序ノ口', base: 0, max: 30 },
  { key: '序二段', base: 1, max: 100 },
  { key: '三段目', base: 2, max: 90 },
  { key: '幕下',   base: 3, max: 60 },
  { key: '十両',   base: 4, max: 14 },
  { key: '前頭',   base: 5, max: 17 },
  { key: '小結',   base: 6 },
  { key: '関脇',   base: 7 },
  { key: '大関',   base: 8 },
  { key: '横綱',   base: 9 }
];

export function rankValue(rank) {
  if (!rank) return null;
  for (const t of TIERS) {
    if (rank.startsWith(t.key)) {
      if (!t.max) return t.base;
      const n = parseInt(rank.slice(t.key.length), 10);
      if (isNaN(n)) return t.base;
      return t.base + Math.max(0, Math.min(1, 1 - (n - 1) / t.max)) * 0.92;
    }
  }
  return null;
}

/* ── 番付推移グラフ ───────────────────────── */
export function rankChart(r) {
  const hist = (r.rankHistory || []).filter(h => rankValue(h.rank) !== null);
  if (hist.length < 2) return '';

  const W = 760, H = 250, L = 54, R = 14, T = 14, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const x = i => L + (i / (hist.length - 1)) * iw;
  const y = v => T + ih - (v / 9.92) * ih;

  const bands = TIERS.map(t =>
    `<line x1="${L}" y1="${y(t.base).toFixed(1)}" x2="${W - R}" y2="${y(t.base).toFixed(1)}" stroke="var(--rule)" stroke-width="1"/>`
  ).join('');

  const labels = ['序ノ口', '三段目', '十両', '前頭', '大関', '横綱'].map(k => {
    const t = TIERS.find(t => t.key === k);
    return `<text x="${L - 8}" y="${(y(t.base) + 4).toFixed(1)}" class="ax" text-anchor="end">${k}</text>`;
  }).join('');

  const pts = hist.map((h, i) => [x(i), y(rankValue(h.rank))]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  const years = []; let seen = null;
  hist.forEach((h, i) => {
    const yr = h.basho.slice(0, 4);
    if (yr !== seen) { seen = yr; years.push([x(i), yr]); }
  });

  const f = hist[0], n = hist[hist.length - 1];
  return `<figure class="chart">
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="rcT rcD">
    <title id="rcT">${esc(r.name)}の番付推移</title>
    <desc id="rcD">${esc(f.basho)}の${esc(f.rank)}から${esc(n.basho)}の${esc(n.rank)}まで、${hist.length}場所ぶんの推移。</desc>
    ${bands}${labels}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="var(--accent)"/>
    ${years.map(([xx, yr]) => `<text x="${xx.toFixed(1)}" y="${H - 10}" class="ax" text-anchor="middle">${yr}</text>`).join('')}
  </svg>
  <figcaption>初土俵からの番付推移　全${hist.length}場所</figcaption>
</figure>`;
}

/* ── 小さな番付推移（カード用） ─────────────── */
function spark(r) {
  const h = (r.rankHistory || []).filter(x => rankValue(x.rank) !== null).slice(-28);
  if (h.length < 2) return '';
  const W = 72, H = 22;
  const pts = h.map((x, i) => [
    (i / (h.length - 1)) * W,
    H - 2 - (rankValue(x.rank) / 9.92) * (H - 4)
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
  <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.4"/>
  <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2" fill="var(--accent)"/>
</svg>`;
}

/* ── 力士カード ───────────────────────────── */
export function rikishiCards(list) {
  return `<div class="cards" id="cardView" hidden>${list.map(r => {
    const c = r._career;
    return `<a class="card" href="/rikishi/${encodeURIComponent(r.name)}/" data-div="${r.division}" data-q="${esc([r.name, r.heya, r.from, r.rank].join(' '))}">
  <span class="cbar" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span>
  <span class="crank">${esc(r.rank)}</span>
  <span class="cmain">
    <span class="cname">${esc(r.name)}</span>
    <span class="cmeta">${esc(r.heya || '')}　${esc(r.from || '')}</span>
    <span class="cfoot">${spark(r)}<span class="crate">${c ? pct(c.rate) + '%' : '—'}</span></span>
  </span>
</a>`;
  }).join('')}</div>`;
}

/* ── 力士一覧（表） ───────────────────────── */
export function rikishiTable(list) {
  const rows = list.map(r => {
    const c = r._career, yr = r._year;
    return `<tr data-div="${r.division}" data-q="${esc([r.name, r.heya, r.from, r.rank].join(' '))}">
  <td class="nm"><span class="dot" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span><a href="/rikishi/${encodeURIComponent(r.name)}/">${esc(r.name)}</a></td>
  <td data-v="${rankValue(r.rank) ?? -1}">${esc(r.rank)}</td>
  <td>${esc(r.heya || '')}</td>
  <td>${esc(r.from || '')}</td>
  <td class="n" data-v="${c ? c.win : -1}">${c ? c.win : '—'}</td>
  <td class="n" data-v="${c ? c.rate : -1}">${c ? pct(c.rate) : '—'}</td>
  <td class="n" data-v="${yr ? yr.rate : -1}">${yr ? `${yr.win}-${yr.loss}` : '—'}</td>
  <td class="n" data-v="${r._h || -1}">${r._h || '—'}</td>
  <td class="n" data-v="${r._w || -1}">${r._w || '—'}</td>
</tr>`;
  }).join('');

  return `<div class="toolbar">
  <input type="search" id="q" class="search" placeholder="四股名・部屋・出身地でしぼりこむ" aria-label="力士をしぼりこむ">
  <div class="chips" role="group" aria-label="番付でしぼりこむ">
    <button type="button" class="chip on" data-f="all">すべて<span>${list.length}</span></button>
    <button type="button" class="chip" data-f="makuuchi">幕内<span>${list.filter(r => r.division === 'makuuchi').length}</span></button>
    <button type="button" class="chip" data-f="juryo">十両<span>${list.filter(r => r.division === 'juryo').length}</span></button>
    <button type="button" class="chip" data-f="makushita">幕下<span>${list.filter(r => r.division === 'makushita').length}</span></button>
  </div>
  <div class="views" role="group" aria-label="表示のしかた">
    <button type="button" class="view on" data-v="card">カード</button>
    <button type="button" class="view" data-v="table">表</button>
  </div>
</div>
<div class="tw" id="tableView" hidden>
<table class="data sortable" id="rikishiTable">
  <thead><tr>
    <th scope="col" data-sort="text">四股名</th>
    <th scope="col" data-sort="num">番付</th>
    <th scope="col" data-sort="text">部屋</th>
    <th scope="col" data-sort="text">出身</th>
    <th scope="col" class="n" data-sort="num">通算勝</th>
    <th scope="col" class="n" data-sort="num">勝率%</th>
    <th scope="col" class="n" data-sort="num">2026年</th>
    <th scope="col" class="n" data-sort="num">身長</th>
    <th scope="col" class="n" data-sort="num">体重</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<p class="hits" id="hits"></p>`;
}

/* ── 力士の詳細 ───────────────────────────── */
export function rikishiBody(r, memo) {
  const c = r.mawashiColor, cr = r.career || {}, rec = r.record || {};
  const yusho = Object.entries(r.yusho || {}).filter(([, v]) => v > 0);
  const s = r.sansho || {};
  const sansho = [['殊勲賞', s.shukun], ['敢闘賞', s.kanto], ['技能賞', s.gino]].filter(([, v]) => v > 0);

  const kpi = [
    ['番付', r.rank],
    ['最高位', r.highestRank],
    ['通算', rec.career ? `${r._career.win}勝${r._career.loss}敗` : null],
    ['通算勝率', r._career ? `${pct(r._career.rate)}%` : null],
    ['2026年', rec.year2026]
  ].filter(([, v]) => v);

  const rows = [
    ['部屋', r.heya], ['出身', r.from],
    ['身長・体重', r._h ? `${r._h}cm・${r._w}kg` : null],
    ['初土俵', cr.hatsudohyo], ['新十両', cr.shinjuryo], ['新入幕', cr.shinnyumaku],
    ['最終学歴', cr.gakureki],
    ['幕内成績', rec.makuuchi],
    ['優勝', yusho.length ? yusho.map(([k, v]) => `${k} ${v}回`).join('、') : null],
    ['三賞', sansho.length ? sansho.map(([k, v]) => `${k} ${v}回`).join('、') : null],
    ['まわし', c?.name]
  ].filter(([, v]) => v);

  const style = (r.kimariteStyle || []).slice(0, 5);
  const mx = Math.max(1, ...style.map(k => k.pct));

  return `<article class="detail wrap">
  <nav class="crumb"><a href="/rikishi/">力士データベース</a> <span>/</span> ${esc(divisionLabel(r.division))}</nav>
  <h1><span class="dot big" style="background:${esc(c?.hex || '#999')}"></span>${esc(r.name)}</h1>

  <dl class="kpi">${kpi.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>

  ${rankChart(r)}

  <div class="cols">
    <section>
      <h2>よく使う決まり手</h2>
      ${style.length ? `<ul class="bars">${style.map(k => `<li>
        <a class="bl" href="/kimarite/?q=${encodeURIComponent(k.name)}">${esc(k.name)}</a>
        <span class="bt"><span class="bf" style="width:${(k.pct / mx * 100).toFixed(0)}%"></span></span>
        <span class="bv">${k.pct}%</span></li>`).join('')}</ul>` : '<p class="empty">データがありません。</p>'}
    </section>
    <section>
      <h2>記録</h2>
      <table class="facts"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    </section>
  </div>

  ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
  ${memo ? `<blockquote class="memo"><p>${esc(memo.comment)}</p><cite>書いている人のメモ</cite></blockquote>` : ''}
  <p class="source">番付・成績は日本相撲協会の公表資料をもとに集計しています。</p>
</article>`;
}

/* ── ランキング ───────────────────────────── */
function rankTable(caption, rows, cols) {
  return `<section class="rank">
  <h2>${esc(caption)}</h2>
  <table class="data">
    <thead><tr><th scope="col" class="n">#</th>${cols.map(c => `<th scope="col"${c[2] ? ' class="n"' : ''}>${esc(c[0])}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td class="n rk">${i + 1}</td>${cols.map(c => `<td${c[2] ? ' class="n"' : ''}>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>`;
}

const link = r => `<span class="nm"><span class="dot" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span><a href="/rikishi/${encodeURIComponent(r.name)}/">${esc(r.name)}</a></span>`;

export function rankingBody(list) {
  const R = buildRankings(list);
  return `<main id="main"><div class="wrap ranks">
${rankTable('通算勝率　上位20（100番以上）', R.byCareerRate.slice(0, 20), [
    ['力士', link], ['番付', r => esc(r.rank), false],
    ['勝率%', r => pct(r._career.rate), true],
    ['勝-敗', r => `${r._career.win}-${r._career.loss}`, true]
  ])}
${rankTable('2026年 勝率　上位20（20番以上）', R.byYearRate.slice(0, 20), [
    ['力士', link], ['番付', r => esc(r.rank), false],
    ['勝率%', r => pct(r._year.rate), true],
    ['勝-敗', r => `${r._year.win}-${r._year.loss}`, true]
  ])}
${rankTable('通算勝星　上位20', R.byWins.slice(0, 20), [
    ['力士', link], ['番付', r => esc(r.rank), false],
    ['勝', r => r._career.win, true],
    ['場所', r => r._career.basho ?? '—', true]
  ])}
${rankTable('得意にしている力士が多い決まり手', R.byKimarite.slice(0, 20), [
    ['決まり手', k => esc(k.name), false],
    ['関取数', k => k.users, true],
    ['平均比率%', k => k.avg.toFixed(1), true]
  ])}
${rankTable('部屋別　2026年勝率（関取のみ）', R.byHeya.slice(0, 15), [
    ['部屋', h => esc(h.name), false],
    ['関取', h => h.n, true],
    ['勝率%', h => pct(h.rate), true],
    ['勝-敗', h => `${h.win}-${h.loss}`, true]
  ])}
${rankTable('出身地', R.byFrom.slice(0, 15), [
    ['出身', f => esc(f.name), false], ['人数', f => f.n, true]
  ])}
${rankTable('最終学歴', R.bySchool, [
    ['学歴', s => esc(s.name), false], ['人数', s => s.n, true]
  ])}
<p class="source">日本相撲協会の公表資料をもとに、当サイトで集計したものです。幕下は追跡対象の範囲に限られます。</p>
</div></main>`;
}

/* ── 決まり手 ─────────────────────────────── */
export function kimariteBody(kimarite, byKimarite) {
  const rows = kimarite.map(k => {
    const u = byKimarite.get(k.name) || [];
    return `<tr data-t="${esc(k.type)}" data-q="${esc(k.name + ' ' + k.yomi + ' ' + k.type)}">
  <td class="n">${k.n}</td>
  <td class="nm"><a href="/kimarite/${k.n}/">${esc(k.name)}</a><span class="yomi">${esc(k.yomi)}</span></td>
  <td>${esc(k.type)}</td>
  <td class="ds">${esc(k.desc)}</td>
  <td class="n" data-v="${u.length}">${u.length || '—'}</td>
</tr>`;
  }).join('');
  const types = [...new Set(kimarite.map(k => k.type))];

  return `<div class="toolbar">
  <input type="search" id="q" class="search" placeholder="決まり手名・読みでしぼりこむ" aria-label="決まり手をしぼりこむ">
  <div class="chips" role="group" aria-label="種別でしぼりこむ">
    <button type="button" class="chip on" data-f="all">すべて<span>${kimarite.length}</span></button>
    ${types.map(t => `<button type="button" class="chip" data-f="${esc(t)}">${esc(t)}<span>${kimarite.filter(k => k.type === t).length}</span></button>`).join('')}
  </div>
</div>
<div class="tw">
<table class="data sortable" id="kimariteTable">
  <thead><tr>
    <th scope="col" class="n" data-sort="num">No.</th>
    <th scope="col" data-sort="text">決まり手</th>
    <th scope="col" data-sort="text">種別</th>
    <th scope="col">説明</th>
    <th scope="col" class="n" data-sort="num">得意な関取</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<p class="hits" id="hits"></p>`;
}

export function kimariteDetail(k, users) {
  return `<article class="detail wrap">
  <nav class="crumb"><a href="/kimarite/">決まり手図鑑</a> <span>/</span> ${esc(k.type)}</nav>
  <h1>${esc(k.name)}<small>${esc(k.yomi)}</small></h1>
  <dl class="kpi">
    <div><dt>番号</dt><dd>第${k.n}手</dd></div>
    <div><dt>種別</dt><dd>${esc(k.type)}</dd></div>
    <div><dt>得意な関取</dt><dd>${users.length}人</dd></div>
  </dl>
  <p class="lead-p">${esc(k.desc)}</p>
  ${users.length ? `<h2>この手を得意にしている力士</h2>
  <table class="data"><thead><tr><th scope="col">力士</th><th scope="col">番付</th><th scope="col" class="n">比率%</th></tr></thead>
  <tbody>${users.map(([r, p]) => `<tr><td class="nm"><span class="dot" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span><a href="/rikishi/${encodeURIComponent(r.name)}/">${esc(r.name)}</a></td><td>${esc(r.rank)}</td><td class="n">${p}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">追跡している関取のなかに、この手を得意にしている力士はいません。</p>'}
  <p class="source">決まり手の分類は日本相撲協会が定める八十二手および非技五つによります。</p>
</article>`;
}
