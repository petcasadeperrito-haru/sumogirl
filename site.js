(function () {
  /* ── 文字の大きさ ── */
  var btns = document.querySelectorAll('.tools button');
  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(btns, function (o) { o.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      document.documentElement.style.setProperty('--fs', b.dataset.size + 'rem');
    });
  });

  /* ── ここから下はトップページのみ ── */
  var el = document.getElementById('bashoData');
  if (!el) return;

  var data = JSON.parse(el.textContent);
  var list = (data.basho || []).map(function (b) {
    return { name: b.name, start: new Date(b.start), end: new Date(b.end) };
  }).filter(function (b) {
    return !isNaN(b.start) && !isNaN(b.end);
  }).sort(function (a, b) { return a.start - b.start; });

  var DAY = 86400000;
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  /* 帯の上に「今日」を置く */
  var year = today.getFullYear();
  var jan1 = new Date(year, 0, 1).getTime();
  var dec31 = new Date(year, 11, 31).getTime();
  var x = 24 + ((today.getTime() - jan1) / (dec31 - jan1)) * 672;
  var line = document.getElementById('nowLine');
  if (line) {
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    document.getElementById('nowDot').setAttribute('cx', x);
    document.getElementById('nowMark').removeAttribute('hidden');
  }

  /* いまどの状態か */
  var current = null, justEnded = null, next = null;
  list.forEach(function (b) {
    var end = new Date(b.end); end.setHours(23, 59, 59, 999);
    if (today >= b.start && today <= end) current = b;
    if (today > end && (today - end) / DAY <= 5) justEnded = b;
    if (today < b.start && !next) next = b;
  });

  var status = document.getElementById('status');
  if (current) {
    var n = Math.round((today - current.start) / DAY) + 1;
    status.innerHTML = esc(current.name) + '　<b>' + n + '日目</b>。';
    buildFifteen(current, n);
  } else if (justEnded) {
    status.textContent = justEnded.name + 'が終わりました。しばらく振り返りを書きます。';
  } else if (next) {
    var left = Math.round((next.start - today) / DAY);
    status.innerHTML = esc(next.name) + 'まで、あと<b>' + left + '日</b>。いまは読むほうにまわっています。';
  } else {
    status.textContent = '今年の本場所は終わりました。次の場所までは、調べものの期間です。';
  }

  /* 場所中だけ十五日のマスを出す */
  function buildFifteen(b, n) {
    var wrote = (data.written && data.written[b.name]) || [];
    var ol = document.getElementById('days');
    if (!ol) return;
    for (var i = 1; i <= 15; i++) {
      var d = new Date(b.start.getTime() + (i - 1) * DAY);
      var li = document.createElement('li');
      li.className = 'day' + (wrote.indexOf(i) !== -1 ? ' done' : '') + (i === n ? ' today' : '');
      li.innerHTML = '<span class="mark"></span><span class="n">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>';
      li.setAttribute('aria-label', i + '日目　' + (d.getMonth() + 1) + '月' + d.getDate() + '日　' +
        (wrote.indexOf(i) !== -1 ? '記事あり' : '記事なし'));
      ol.appendChild(li);
    }
    document.getElementById('fifteen').removeAttribute('hidden');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
