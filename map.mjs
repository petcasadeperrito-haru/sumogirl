// 出身地のタイル地図。47都道府県を同じ大きさの升目に並べ、
// 海外は右側に別ブロックとして置きます。

export const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* [短縮名, 正式名, 列, 行] ── 列は西ほど小さく、行は北ほど小さい */
const GRID = [
  ['北海', '北海道', 12, 0],
  ['青森', '青森県', 12, 1],
  ['秋田', '秋田県', 11, 2], ['岩手', '岩手県', 12, 2],
  ['山形', '山形県', 11, 3], ['宮城', '宮城県', 12, 3],
  ['新潟', '新潟県', 11, 4], ['福島', '福島県', 12, 4],
  ['石川', '石川県', 7, 5], ['富山', '富山県', 8, 5], ['長野', '長野県', 9, 5],
  ['群馬', '群馬県', 10, 5], ['栃木', '栃木県', 11, 5], ['茨城', '茨城県', 12, 5],
  ['福井', '福井県', 7, 6], ['岐阜', '岐阜県', 8, 6], ['山梨', '山梨県', 9, 6],
  ['埼玉', '埼玉県', 10, 6], ['千葉', '千葉県', 11, 6],
  ['島根', '島根県', 3, 7], ['鳥取', '鳥取県', 4, 7], ['兵庫', '兵庫県', 5, 7],
  ['京都', '京都府', 6, 7], ['滋賀', '滋賀県', 7, 7], ['愛知', '愛知県', 8, 7],
  ['静岡', '静岡県', 9, 7], ['東京', '東京都', 10, 7], ['神奈', '神奈川県', 11, 7],
  ['山口', '山口県', 2, 8], ['広島', '広島県', 3, 8], ['岡山', '岡山県', 4, 8],
  ['大阪', '大阪府', 5, 8], ['奈良', '奈良県', 6, 8], ['三重', '三重県', 7, 8],
  ['福岡', '福岡県', 2, 9], ['大分', '大分県', 3, 9], ['愛媛', '愛媛県', 4, 9],
  ['香川', '香川県', 5, 9], ['和歌', '和歌山県', 6, 9],
  ['佐賀', '佐賀県', 1, 10], ['熊本', '熊本県', 2, 10], ['高知', '高知県', 3, 10],
  ['徳島', '徳島県', 4, 10],
  ['長崎', '長崎県', 1, 11], ['宮崎', '宮崎県', 2, 11],
  ['鹿児', '鹿児島県', 1, 12],
  ['沖縄', '沖縄県', 0, 13]
];

const norm = s => String(s || '').replace(/(都|道|府|県)$/, '');

export function buildMap(list) {
  const counts = new Map();
  for (const r of list) {
    const k = r.from || '不明';
    if (!counts.has(k)) counts.set(k, []);
    counts.get(k).push(r);
  }

  const domesticNames = new Set(GRID.map(g => g[1]));
  const overseas = [...counts.entries()]
    .filter(([k]) => !domesticNames.has(k) && k !== '不明')
    .map(([name, rs]) => ({ name, rs }))
    .sort((a, b) => b.rs.length - a.rs.length);

  const max = Math.max(1, ...[...counts.values()].map(v => v.length));

  const S = 40, G = 3;                 // 升の大きさと隙間
  const W = 14 * (S + G) + 190;        // 右に海外ブロック
  const H = 14 * (S + G) + 8;

  const tiles = GRID.map(([short, full, c, r]) => {
    const rs = counts.get(full) || [];
    const n = rs.length;
    const x = c * (S + G), y = r * (S + G);
    const op = n ? (0.18 + 0.72 * (n / max)).toFixed(2) : 0;
    return `<g class="tile${n ? ' has' : ''}" data-from="${esc(full)}" tabindex="${n ? 0 : -1}" role="${n ? 'button' : 'presentation'}"${n ? ` aria-label="${esc(full)} ${n}人"` : ''}>
  <rect x="${x}" y="${y}" width="${S}" height="${S}" rx="3" class="bg"/>
  ${n ? `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="3" fill="var(--accent)" opacity="${op}"/>` : ''}
  <text x="${x + S / 2}" y="${y + 17}" class="tn">${short}</text>
  ${n ? `<text x="${x + S / 2}" y="${y + 32}" class="tc">${n}</text>` : ''}
</g>`;
  }).join('');

  const ox = 14 * (S + G) + 12;
  const oTiles = overseas.map((o, i) => {
    const y = i * (S + G) + 26;
    const op = (0.18 + 0.72 * (o.rs.length / max)).toFixed(2);
    return `<g class="tile has" data-from="${esc(o.name)}" tabindex="0" role="button" aria-label="${esc(o.name)} ${o.rs.length}人">
  <rect x="${ox}" y="${y}" width="170" height="${S}" rx="3" class="bg"/>
  <rect x="${ox}" y="${y}" width="170" height="${S}" rx="3" fill="var(--accent)" opacity="${op}"/>
  <text x="${ox + 12}" y="${y + 25}" class="tn" text-anchor="start">${esc(o.name)}</text>
  <text x="${ox + 158}" y="${y + 25}" class="tc" text-anchor="end">${o.rs.length}</text>
</g>`;
  }).join('');

  const payload = {};
  for (const [k, rs] of counts) {
    payload[k] = rs.map(r => ({
      name: r.name, rank: r.rank, heya: r.heya,
      color: r.mawashiColor?.hex || '#999'
    }));
  }

  return `<div class="mapwrap">
<svg viewBox="0 0 ${W} ${H}" class="jpmap" role="img" aria-labelledby="mT mD">
  <title id="mT">力士の出身地</title>
  <desc id="mD">四十七都道府県を同じ大きさの升目で並べ、出身力士の人数を色の濃さで示した図。右側は海外の出身地。</desc>
  ${tiles}
  <text x="${ox}" y="18" class="ol">海外</text>
  ${oTiles}
</svg>
<aside class="mapside" id="mapside" aria-live="polite">
  <p class="ph">升目をえらぶと、その出身地の力士が出ます。</p>
</aside>
</div>
<script id="mapData" type="application/json">${JSON.stringify(payload)}</script>`;
}
