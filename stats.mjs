// 力士データの集計。ランキングと一覧表のもとになる数値をここで作ります。

export function parseRecord(s = '') {
  const m = String(s).match(/(\d+)勝(\d+)敗(?:(\d+)休)?(?:（(\d+)場所）)?/);
  if (!m) return null;
  const win = +m[1], loss = +m[2];
  return {
    win, loss,
    rest: m[3] ? +m[3] : 0,
    basho: m[4] ? +m[4] : null,
    total: win + loss,
    rate: win + loss > 0 ? win / (win + loss) : 0
  };
}

export const pct = (v) => (v * 100).toFixed(1);

/* 一場所の成績を「12勝3敗」「全休」の形に */
export function resultText(x) {
  if (!x) return '';
  if (x.w + x.l === 0 && x.a > 0) return '全休';
  return `${x.w}勝${x.l}敗${x.a ? `${x.a}休` : ''}`;
}

/* 場所の名前（build.mjs の BASHO と同じ呼び方） */
const BASHO_NAME = { '01': '初場所', '03': '春場所', '05': '夏場所', '07': '名古屋場所', '09': '九月場所', '11': '九州場所' };
export const bashoName = (id = '') => BASHO_NAME[id.slice(5, 7)] || id;
export const sideJ = (s) => s === 'east' ? '東' : s === 'west' ? '西' : '';

const SCHOOL = (g = '') =>
  g.startsWith('大卒') ? '大学' :
  g.startsWith('高卒') ? '高校' :
  g.startsWith('中卒') ? '中学' :
  g ? 'その他' : '不明';

const SEKITORI = /^(横綱|大関|関脇|小結|前頭|十両)/;

export function enrich(rikishi) {
  return rikishi.map(r => {
    const career = parseRecord(r.record?.career);
    const year = parseRecord(r.record?.year2026);
    const res = r.results2026 || [];
    // 十両以上の土俵で取った分だけの2026年成績（ランキング用。幕下以下の白星を混ぜないため）
    const top = res.filter(x => SEKITORI.test(x.rank));
    const sw = top.reduce((a, x) => a + x.w, 0), sl = top.reduce((a, x) => a + x.l, 0);
    return {
      ...r,
      _career: career,
      _year: year,
      _last: res.length ? res[res.length - 1] : null,
      _yearS: top.length ? { win: sw, loss: sl, total: sw + sl, basho: top.length, rate: sw + sl ? sw / (sw + sl) : 0 } : null,
      _school: SCHOOL(r.career?.gakureki),
      _h: r.physique?.height || null,
      _w: r.physique?.weight || null
    };
  });
}

const DIV = { makuuchi: '幕内', juryo: '十両', makushita: '幕下' };
export const divisionLabel = (d) => DIV[d] || '';

/* ── ランキングを作る ───────────────────────── */
export function buildRankings(list) {
  const sekitori = list.filter(r => r.division !== 'makushita');

  const byCareerRate = [...list]
    .filter(r => r._career && r._career.total >= 100)
    .sort((a, b) => b._career.rate - a._career.rate);

  // 十両以上の土俵で取った分だけで比べます（幕下以下の白星は混ぜない）
  const byYearRate = [...list]
    .filter(r => r._yearS && r._yearS.total >= 20)
    .sort((a, b) => b._yearS.rate - a._yearS.rate || b._yearS.win - a._yearS.win);

  const byWins = [...list]
    .filter(r => r._career)
    .sort((a, b) => b._career.win - a._career.win);

  // 決まり手の使用傾向
  const kim = new Map();
  for (const r of sekitori) {
    for (const k of r.kimariteStyle || []) {
      if (!kim.has(k.name)) kim.set(k.name, { name: k.name, users: 0, sum: 0 });
      const e = kim.get(k.name);
      e.users++; e.sum += k.pct;
    }
  }
  const byKimarite = [...kim.values()]
    .map(e => ({ ...e, avg: e.sum / e.users }))
    .sort((a, b) => b.users - a.users || b.avg - a.avg);

  // 部屋別
  const heya = new Map();
  for (const r of sekitori) {
    const h = r.heya || '不明';
    if (!heya.has(h)) heya.set(h, { name: h, n: 0, win: 0, loss: 0 });
    const e = heya.get(h);
    e.n++;
    if (r._yearS) { e.win += r._yearS.win; e.loss += r._yearS.loss; }
  }
  const byHeya = [...heya.values()]
    .filter(e => e.win + e.loss > 0)
    .map(e => ({ ...e, rate: e.win / (e.win + e.loss) }))
    .sort((a, b) => b.rate - a.rate || b.n - a.n);

  // 出身地
  const from = new Map();
  for (const r of list) {
    const f = r.from || '不明';
    from.set(f, (from.get(f) || 0) + 1);
  }
  const byFrom = [...from.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);

  // 最終学歴
  const school = new Map();
  for (const r of list) school.set(r._school, (school.get(r._school) || 0) + 1);
  const order = ['中学', '高校', '大学', 'その他', '不明'];
  const bySchool = order
    .filter(k => school.has(k))
    .map(name => ({ name, n: school.get(name) }));

  return { byCareerRate, byYearRate, byWins, byKimarite, byHeya, byFrom, bySchool };
}
