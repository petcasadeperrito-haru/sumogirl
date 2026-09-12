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

const SCHOOL = (g = '') =>
  g.startsWith('大卒') ? '大学' :
  g.startsWith('高卒') ? '高校' :
  g.startsWith('中卒') ? '中学' :
  g ? 'その他' : '不明';

export function enrich(rikishi) {
  return rikishi.map(r => {
    const career = parseRecord(r.record?.career);
    const year = parseRecord(r.record?.year2026);
    return {
      ...r,
      _career: career,
      _year: year,
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

  const byYearRate = [...list]
    .filter(r => r._year && r._year.total >= 20)
    .sort((a, b) => b._year.rate - a._year.rate);

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
    if (r._year) { e.win += r._year.win; e.loss += r._year.loss; }
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
