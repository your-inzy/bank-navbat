/* ==========================================================================
   Admin dashboard — per-service stats (stretch goal)
   ========================================================================== */

(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };

  function render(view) {
    $('subLine').textContent =
      'Ish kuni: ' + view.businessDate + ' — real vaqtda yangilanadi';

    $('kIssued').textContent = view.stats.issued;
    $('kServed').textContent = view.stats.served;
    $('kWaiting').textContent = view.stats.waiting;
    $('kBusiest').textContent = view.report.busiest
      ? view.report.busiest.icon + ' ' + view.report.busiest.name
      : '—';

    var tb = $('tbody');
    tb.innerHTML = '';
    view.report.byService.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="svc-tag"><span class="swatch" style="background:' +
        r.color +
        '"></span>' +
        r.icon +
        ' ' +
        r.name +
        '</span></td>' +
        '<td class="num">' +
        r.issued +
        '</td>' +
        '<td class="num">' +
        r.served +
        '</td>' +
        '<td class="num">' +
        r.noShow +
        '</td>' +
        '<td class="num">' +
        r.waiting +
        '</td>' +
        '<td class="num">' +
        r.avgWaitMin +
        '</td>' +
        '<td class="num">' +
        r.avgServeMin +
        '</td>';
      tb.appendChild(tr);
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
    }, 2600);
  }

  $('btnReset').addEventListener('click', async function () {
    if (!confirm('Bugungi barcha navbat raqamlari nolga tushiriladi. Davom etilsinmi?')) return;
    try {
      await Navbat.post('/api/reset', {});
      toast('Navbat nolga tushirildi');
    } catch (err) {
      toast('Xatolik: ' + err.message);
    }
  });

  Navbat.connect(render, function (online) {
    $('offline').classList.toggle('show', !online);
  });
})();
