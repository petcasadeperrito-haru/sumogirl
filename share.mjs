// SNS用のページ。
//  /cards/   Instagram用のカード（1080×1350）。画面を撮って投稿します。
//  /drafts/  X用の下書き。文面をコピーして使います。
// どちらも検索には出しません（noindex ＋ sitemap 除外）。

import { pct, buildRankings, resultText, bashoName } from './stats.mjs';
import { rankValue, esc } from './rikishi.mjs';

const W = 1080, H = 1350;

/* ── カード用の番付推移グラフ ───────────────── */
function cardChart(r) {
  const hist = (r.rankHistory || []).filter(h => rankValue(h.rank) !== null);
  if (hist.length < 2) return '';

  const w = 900, h = 420, L = 120, R = 20, T = 20, B = 54;
  const iw = w - L - R, ih = h - T - B;
  const x = i => L + (i / (hist.length - 1)) * iw;
  const y = v => T + ih - (v / 9.92) * ih;

  const tiers = [['序ノ口', 0], ['三段目', 2], ['十両', 4], ['前頭', 5], ['大関', 8], ['横綱', 9]];
  const lines = tiers.map(([, v]) =>
    `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${w - R}" y2="${y(v).toFixed(1)}" stroke="#D8D0BE" stroke-width="1.5"/>`).join('');
  const labels = tiers.map(([k, v]) =>
    `<text x="${L - 16}" y="${(y(v) + 10).toFixed(1)}" font-size="26" fill="#6E675B" text-anchor="end">${k}</text>`).join('');

  const pts = hist.map((hh, i) => [x(i), y(rankValue(hh.rank))]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  const years = []; let seen = null;
  hist.forEach((hh, i) => {
    const yr = hh.basho.slice(0, 4);
    if (yr !== seen && (years.length === 0 || i - years[years.length - 1][2] > 4)) {
      seen = yr; years.push([x(i), yr, i]);
    }
  });

  return `<svg viewBox="0 0 ${w} ${h}" class="cc" role="img" aria-label="${esc(r.name)}の番付推移">
  ${lines}${labels}
  <path d="${d}" fill="none" stroke="#A8351F" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="11" fill="#A8351F"/>
  ${years.map(([xx, yr]) => `<text x="${xx.toFixed(1)}" y="${h - 14}" font-size="24" fill="#6E675B" text-anchor="middle">${yr}</text>`).join('')}
</svg>`;
}

/* ── カードの外枠 ───────────────────────────── */
function cardShell(title, inner, note) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Yomogi&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/card.css">
</head>
<body>
<div class="stage">
  <div class="card" id="card">${inner}</div>
  <p class="shot">${esc(note)}</p>
  <p class="shot"><a href="/cards/">カードの一覧にもどる</a></p>
</div>
</body>
</html>`;
}

const mark = `<div class="mark"><span class="m1">SUMO</span><span class="m2">girl</span><span class="m3">LAB</span><span class="m4">sumogirl.jp</span></div>`;

/* ── 決まり手カード ─────────────────────────── */
export function kimariteCard(k, users) {
  const inner = `
<div class="top"><span class="badge">${esc(k.type)}</span><span class="num">第${k.n}手 ／ 八十二手</span></div>
<div class="mid">
  <h1 class="kname">${esc(k.name)}</h1>
  <p class="kyomi">${esc(k.yomi)}</p>
  <p class="kdesc">${esc(k.desc)}</p>
  ${users.length ? `<p class="kuse">この手を得意にしている関取　<b>${users.length}</b>人</p>` : ''}
</div>
${mark}`;
  return cardShell(`${k.name} — カード`, inner,
    '枠の中をスクリーンショットして投稿してください。1080×1350です。');
}

/* ── 力士カード ─────────────────────────────── */
export function rikishiCard(r) {
  const c = r._career;
  const inner = `
<div class="top"><span class="badge">${esc(r.rank)}</span><span class="num">${esc(r.heya || '')}　${esc(r.from || '')}</span></div>
<div class="mid">
  <h1 class="rname"><span class="rdot" style="background:${esc(r.mawashiColor?.hex || '#999')}"></span>${esc(r.name)}</h1>
  ${r._last ? `<p class="rlast">${esc(bashoName(r._last.basho))}　<b>${esc(resultText(r._last))}</b>${r._last.note ? `　<span>${esc(r._last.note)}</span>` : ''}${r.next ? `　<span>${esc(bashoName(r.next.basho))}で${esc(r.next.label)}</span>` : ''}</p>` : ''}
  ${cardChart(r)}
  <div class="stats">
    ${c ? `<div><dt>通算</dt><dd>${c.win}勝${c.loss}敗</dd></div>
    <div><dt>勝率</dt><dd>${pct(c.rate)}%</dd></div>` : ''}
    ${r.highestRank ? `<div><dt>最高位</dt><dd>${esc(r.highestRank)}</dd></div>` : ''}
    ${r.career?.hatsudohyo ? `<div><dt>初土俵</dt><dd>${esc(r.career.hatsudohyo)}</dd></div>` : ''}
  </div>
</div>
${mark}`;
  return cardShell(`${r.name} — カード`, inner,
    '枠の中をスクリーンショットして投稿してください。1080×1350です。');
}

/* ── ランキングカード ───────────────────────── */
export function rankingCard(id, title, note, rows) {
  const inner = `
<div class="top"><span class="badge">ランキング</span><span class="num">${esc(note)}</span></div>
<div class="mid">
  <h1 class="rkttl">${esc(title)}</h1>
  <ol class="rklist">${rows.map((x, i) => `<li>
    <span class="rkn">${i + 1}</span>
    <span class="rkname">${esc(x.name)}</span>
    <span class="rkval">${esc(x.value)}</span>
  </li>`).join('')}</ol>
</div>
${mark}`;
  return cardShell(`${title} — カード`, inner,
    '枠の中をスクリーンショットして投稿してください。1080×1350です。');
}

/* ── カードの一覧 ───────────────────────────── */
export function cardIndex(rikishi, kimarite, ranks) {
  const sec = (ttl, note, items) => `<section>
  <h2>${esc(ttl)}<span>${items.length}</span></h2>
  <p class="note">${esc(note)}</p>
  <div class="grid">${items.map(([href, label]) =>
    `<a href="${href}">${esc(label)}</a>`).join('')}</div>
</section>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>投稿用カード — SUMO GIRL LAB</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Yomogi&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/card.css">
</head>
<body class="idx">
<div class="wrap">
<h1>投稿用カード</h1>
<p class="lead">Instagram用の画像です。カードを開いて、枠の中をスクリーンショットしてください。サイズは1080×1350（4:5）で、Instagramのフィードにちょうど収まります。</p>
<p class="lead small">Windowsなら <b>Windowsキー + Shift + S</b> で範囲を選んで撮れます。このページは検索には出ません。</p>
${sec('ランキング', '場所が終わったときや、話題になったときに。', ranks)}
${sec('決まり手', '一日一手。八十七種あるので、三か月近くもちます。', kimarite)}
${sec('力士', '番付推移のグラフが入ります。昇進や引退のときに。', rikishi)}
</div>
</body>
</html>`;
}

/* ── Xの下書き ──────────────────────────────── */
export function draftsPage(articles, db, siteUrl, kindLabel, urlOf) {
  const drafts = [];

  for (const a of articles) {
    const body = [a.title_ja, a.summary_ja].filter(Boolean).join('\n\n');
    drafts.push({
      tag: kindLabel(a),
      head: a.title_ja,
      text: body,
      link: siteUrl + urlOf(a)
    });
  }

  if (db) {
    const R = buildRankings(db.rikishi);

    // 直近の場所のふりかえり
    const lb = db.lastBasho;
    if (lb && lb.yusho?.length) {
      const [mk, jr] = lb.yusho;
      const nth = c => c === 1 ? '初優勝' : `${c}度目の優勝`;
      const k = lb.sansho?.kanto || [], sh = lb.sansho?.shukun || [], g = lb.sansho?.gino || [];
      const lines = [
        `${lb.name}は${mk.name}が${mk.record}で${nth(mk.count)}。`,
        jr ? `十両は${jr.name}が${jr.record}で${nth(jr.count)}。` : '',
        [sh.length && `殊勲賞は${sh.join('と')}`, k.length && `敢闘賞は${k.join('と')}`, g.length && `技能賞は${g.join('と')}`].filter(Boolean).join('、') + (sh.length + k.length + g.length ? '。' : ''),
        lb.next?.shinjuryo?.length ? `\n${lb.next.name}では${lb.next.shinjuryo.join('と')}が新十両です。` : ''
      ].filter(Boolean);
      drafts.push({ tag: '場所', head: `${lb.name}をふりかえる`, text: lines.join('\n'), link: `${siteUrl}/` });

      const ten = db.rikishi.filter(r => r._last && r._last.basho === lb.id && r._last.w >= 10)
        .sort((a, b) => b._last.w - a._last.w || a.row - b.row);
      if (ten.length) drafts.push({
        tag: '数字', head: `${lb.name}で二桁勝った関取`,
        text: `${lb.name}で二桁勝った関取は${ten.length}人。\n${ten.slice(0, 7).map(r => `${r.name}${r._last.w}`).join('・')}${ten.length > 7 ? 'ほか' : ''}。\n\n一人ずつの今年の成績は、力士のページにまとめています。`,
        link: `${siteUrl}/rikishi/`
      });

      for (const n of lb.next?.shinjuryo || []) {
        const r = db.rikishi.find(x => x.name === n);
        if (!r || !r._year) continue;
        const wins = (r.results2026 || []).filter(x => /優勝/.test(x.note)).map(x => x.note.replace('優勝', ''));
        drafts.push({
          tag: '力士', head: `${n}、${lb.next.name}で新十両`,
          text: `${n}が${lb.next.name}で新十両。\n2026年は${r._year.win}勝${r._year.loss}敗${wins.length ? `、${wins.join('・')}で優勝` : ''}。\n${r.heya || ''}、${r.from || ''}出身。`,
          link: `${siteUrl}/rikishi/${encodeURIComponent(n)}/`
        });
      }
    }

    const top = R.byYearRate[0];
    if (top) drafts.push({
      tag: '数字', head: '2026年の勝率',
      text: `2026年、十両以上でいちばん勝っているのは${top.name}。\n勝率${pct(top._yearS.rate)}％（${top._yearS.win}勝${top._yearS.loss}敗）。\n\n追いかけている力士${db.rikishi.length}人ぶんを数えました。`,
      link: `${siteUrl}/ranking/`
    });

    const k = R.byKimarite[0];
    if (k) drafts.push({
      tag: '数字', head: 'いちばん多い決まり手',
      text: `関取のうち${k.users}人が、得意技に「${k.name}」を挙げています。\n決まり手は全部で八十七種あるのに、ここに集中します。\n\n残りの八十六種も図鑑にしました。`,
      link: `${siteUrl}/kimarite/`
    });

    const f = R.byFrom.filter(x => x.name !== '不明');
    const abroad = f.find(x => !/[都道府県]$/.test(x.name));
    const topPref = f.find(x => /[都道府県]$/.test(x.name));
    if (abroad && topPref) drafts.push({
      tag: '数字', head: '出身地',
      text: `追いかけている力士の出身地を数えたら、${abroad.name}が${abroad.n}人。\n国内でいちばん多い${topPref.name}の${topPref.n}人より多い。\n\n地図にすると、ひと目でわかります。`,
      link: `${siteUrl}/map/`
    });

    const s = R.bySchool.find(x => x.name === '大学');
    if (s) drafts.push({
      tag: '数字', head: '学歴',
      text: `追いかけている力士のうち、${s.n}人が大学を出ています。\n中学を出てすぐ入門、というイメージがありましたが、実際はけっこう違いました。`,
      link: `${siteUrl}/ranking/`
    });
  }

  const item = (d, i) => `<article class="draft">
  <div class="dh"><span class="badge">${esc(d.tag)}</span><span class="dt">${esc(d.head)}</span></div>
  <textarea id="t${i}" rows="6" aria-label="投稿の下書き">${esc(d.text)}</textarea>
  <div class="dfoot">
    <span class="count" id="c${i}"></span>
    <button type="button" data-copy="t${i}">本文をコピー</button>
    <button type="button" data-copy-text="${esc(d.link)}">リンクをコピー</button>
  </div>
  <p class="link">返信に貼るリンク：<code>${esc(d.link)}</code></p>
</article>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Xの下書き — SUMO GIRL LAB</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Yomogi&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/card.css">
</head>
<body class="idx">
<div class="wrap">
<h1>Xの下書き</h1>
<p class="lead">そのままでは投稿しないでください。<b>直してから使うための叩き台</b>です。最後の一行を自分の言葉に変えるだけで、伸び方が変わります。</p>
<p class="lead small">リンクは本文に入れず、<b>投稿したあとの返信に貼る</b>のがおすすめです。本文にURLが入ると表示が伸びにくくなります。このページは検索には出ません。</p>
${drafts.map(item).join('')}
</div>
<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var v = b.dataset.copy ? document.getElementById(b.dataset.copy).value : b.dataset.copyText;
  navigator.clipboard.writeText(v).then(function () {
    var o = b.textContent; b.textContent = 'コピーしました'; b.classList.add('done');
    setTimeout(function () { b.textContent = o; b.classList.remove('done'); }, 1600);
  });
});
document.querySelectorAll('textarea').forEach(function (t) {
  var c = document.getElementById('c' + t.id.slice(1));
  function up() {
    var n = Array.from(t.value).length;
    c.textContent = n + ' 文字';
    c.className = 'count' + (n > 140 ? ' over' : '');
  }
  t.addEventListener('input', up); up();
});
</script>
</body>
</html>`;
}
