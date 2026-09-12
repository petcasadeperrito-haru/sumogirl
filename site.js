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

  /* ── 表のしぼりこみと並べ替え ── */
  var table = document.querySelector('table.sortable');
  if (table) {
    var tbody = table.tBodies[0];
    var rows = Array.prototype.slice.call(tbody.rows);
    var q = document.getElementById('q');
    var hits = document.getElementById('hits');
    var chips = document.querySelectorAll('.chip');
    var filter = 'all';

    function apply() {
      var term = (q && q.value || '').trim().toLowerCase();
      var n = 0;
      rows.forEach(function (r) {
        var okF = filter === 'all' || r.dataset.div === filter || r.dataset.t === filter;
        var okQ = !term || (r.dataset.q || '').toLowerCase().indexOf(term) !== -1;
        var show = okF && okQ;
        r.hidden = !show;
        if (show) n++;
      });
      if (hits) hits.textContent = n + ' 件を表示';
    }

    if (q) q.addEventListener('input', apply);
    Array.prototype.forEach.call(chips, function (c) {
      c.addEventListener('click', function () {
        Array.prototype.forEach.call(chips, function (o) { o.classList.remove('on'); });
        c.classList.add('on');
        filter = c.dataset.f;
        apply();
      });
    });

    var dir = 1, cur = -1;
    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th, i) {
      if (!th.dataset.sort) return;
      th.tabIndex = 0;
      th.setAttribute('role', 'button');
      function sort() {
        dir = (cur === i) ? -dir : 1;
        cur = i;
        Array.prototype.forEach.call(table.tHead.rows[0].cells, function (o) {
          o.removeAttribute('aria-sort');
        });
        th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
        var num = th.dataset.sort === 'num';
        rows.sort(function (a, b) {
          var x = a.cells[i], y = b.cells[i];
          var av = num ? parseFloat(x.dataset.v !== undefined ? x.dataset.v : x.textContent) : x.textContent.trim();
          var bv = num ? parseFloat(y.dataset.v !== undefined ? y.dataset.v : y.textContent) : y.textContent.trim();
          if (num) { av = isNaN(av) ? -Infinity : av; bv = isNaN(bv) ? -Infinity : bv; return (av - bv) * dir; }
          return av.localeCompare(bv, 'ja') * dir;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      }
      th.addEventListener('click', sort);
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); }
      });
    });

    var p = new URLSearchParams(location.search).get('q');
    if (p && q) { q.value = p; }
    apply();
  }

  /* ── トップの場所表示 ── */
  var el = document.getElementById('bashoData');
  if (!el) return;
  var data = JSON.parse(el.textContent);
  var list = (data.basho || []).map(function (b) {
    return { name: b.name, start: new Date(b.start), end: new Date(b.end) };
  }).sort(function (a, b) { return a.start - b.start; });

  var DAY = 86400000, today = new Date();
  today.setHours(0, 0, 0, 0);

  var year = today.getFullYear();
  var jan1 = new Date(year, 0, 1).getTime(), dec31 = new Date(year, 11, 31).getTime();
  var x = 24 + ((today.getTime() - jan1) / (dec31 - jan1)) * 672;
  var line = document.getElementById('nowLine');
  if (line) {
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    document.getElementById('nowDot').setAttribute('cx', x);
    document.getElementById('nowMark').removeAttribute('hidden');
  }

  var cur2 = null, just = null, next = null;
  list.forEach(function (b) {
    var end = new Date(b.end); end.setHours(23, 59, 59, 999);
    if (today >= b.start && today <= end) cur2 = b;
    if (today > end && (today - end) / DAY <= 5) just = b;
    if (today < b.start && !next) next = b;
  });

  var st = document.getElementById('status');
  if (cur2) {
    var n = Math.round((today - cur2.start) / DAY) + 1;
    st.innerHTML = cur2.name + ' <b>' + n + '日目</b>';
    build(cur2, n);
  } else if (just) {
    st.textContent = just.name + 'は千秋楽を迎えました。';
  } else if (next) {
    st.innerHTML = next.name + 'まで <b>' + Math.round((next.start - today) / DAY) + '日</b>';
  } else {
    st.textContent = '今年の本場所は終わりました。';
  }

  function build(b, n) {
    var wrote = (data.written && data.written[b.name]) || [];
    var ol = document.getElementById('days');
    if (!ol) return;
    for (var i = 1; i <= 15; i++) {
      var d = new Date(b.start.getTime() + (i - 1) * DAY);
      var li = document.createElement('li');
      li.className = 'day' + (wrote.indexOf(i) !== -1 ? ' done' : '') + (i === n ? ' today' : '');
      li.innerHTML = '<span class="mark"></span><span class="n">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>';
      li.setAttribute('aria-label', i + '日目 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
        (wrote.indexOf(i) !== -1 ? '記事あり' : '記事なし'));
      ol.appendChild(li);
    }
    document.getElementById('fifteen').removeAttribute('hidden');
  }
})();
