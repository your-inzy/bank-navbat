/* ==========================================================================
   Staff panel (one per operator)
   ========================================================================== */

(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };

  var OPERATOR_COUNT = 6;
  var opId = Number(localStorage.getItem('operatorId')) || null;
  var lastView = null;
  var calledAtTs = null;
  var timerInt = null;
  var busy = false;

  // ---- Operator picker ----
  function buildPicker() {
    var grid = $('opGrid');
    grid.innerHTML = '';
    for (var i = 1; i <= OPERATOR_COUNT; i++) {
      (function (n) {
        var btn = document.createElement('button');
        btn.textContent = n + '-operator';
        btn.addEventListener('click', function () {
          chooseOperator(n);
        });
        grid.appendChild(btn);
      })(i);
    }
  }

  function chooseOperator(n) {
    opId = n;
    localStorage.setItem('operatorId', String(n));
    $('opPick').hidden = true;
    $('panel').hidden = false;
    $('opTitle').textContent = n + '-operator paneli';
    Navbat.post('/api/operator', { operatorId: n, online: true }).catch(function () {});
    if (lastView) render(lastView);
  }

  $('switchOp').addEventListener('click', function () {
    localStorage.removeItem('operatorId');
    opId = null;
    $('panel').hidden = true;
    $('opPick').hidden = false;
  });

  // ---- Actions ----
  async function action(url, body) {
    if (!opId || busy) return;
    busy = true;
    setDisabled(true);
    try {
      var res = await Navbat.post(url, Object.assign({ operatorId: opId }, body || {}));
      if (url === '/api/call-next') {
        toast(res.called ? 'Chaqirildi: ' + res.called.code : 'Navbatda kutayotganlar yoʻq');
      } else if (url === '/api/skip') {
        toast(
          res.called
            ? 'Oʻtkazib yuborildi. Keyingisi: ' + res.called.code
            : 'Oʻtkazib yuborildi. Navbat boʻsh'
        );
      } else if (url === '/api/recall') {
        toast(res.recalled ? 'Qayta chaqirildi: ' + res.recalled.code : 'Qayta chaqirish uchun mijoz yoʻq');
      }
    } catch (err) {
      toast('Xatolik: ' + err.message);
    } finally {
      busy = false;
      if (lastView) render(lastView);
    }
  }

  $('btnCall').addEventListener('click', function () {
    action('/api/call-next');
  });
  $('btnRecall').addEventListener('click', function () {
    action('/api/recall');
  });
  $('btnSkip').addEventListener('click', function () {
    action('/api/skip');
  });

  $('statusToggle').addEventListener('click', function () {
    if (!opId || !lastView) return;
    var me = myOp(lastView);
    var next = !(me && me.online);
    Navbat.post('/api/operator', { operatorId: opId, online: next }).catch(function (err) {
      toast('Xatolik: ' + err.message);
    });
  });

  // Space = call next
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space') return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'button') return;
    e.preventDefault();
    action('/api/call-next');
  });

  function setDisabled(v) {
    $('btnCall').disabled = v;
    $('btnRecall').disabled = v;
    $('btnSkip').disabled = v;
    $('pullQueues')
      .querySelectorAll('button')
      .forEach(function (b) {
        b.disabled = v;
      });
  }

  function myOp(view) {
    return (view.operators || []).find(function (o) {
      return o.id === opId;
    });
  }

  // ---- Per-queue pull buttons ----
  function buildPullQueues(view) {
    var box = $('pullQueues');
    box.innerHTML = '';
    view.services.forEach(function (s) {
      var btn = document.createElement('button');
      btn.className = 'pull-btn';
      btn.innerHTML =
        '<span class="pb-name">' +
        s.icon +
        ' ' +
        s.name +
        '</span><span class="pb-count">' +
        s.waiting +
        ' <small>' +
        (s.waiting === 1 ? 'kishi' : 'kishi') +
        '</small></span>';
      btn.disabled = busy || s.waiting === 0;
      btn.addEventListener('click', function () {
        action('/api/call-next', { serviceId: s.id });
      });
      box.appendChild(btn);
    });
  }

  // ---- Service checkboxes ----
  function buildSvcChecks(view) {
    var box = $('svcChecks');
    if (box.children.length !== view.services.length) {
      box.innerHTML = '';
      view.services.forEach(function (s) {
        var label = document.createElement('label');
        label.innerHTML =
          '<input type="checkbox" value="' +
          s.id +
          '"><span>' +
          s.icon +
          ' ' +
          s.name +
          '</span>';
        label.querySelector('input').addEventListener('change', onSvcChange);
        box.appendChild(label);
      });
    }
    var me = myOp(view);
    var mine = me ? me.serviceIds : [];
    box.querySelectorAll('input').forEach(function (inp) {
      if (document.activeElement !== inp) {
        inp.checked = mine.indexOf(inp.value) !== -1;
      }
    });
  }

  function onSvcChange() {
    var ids = [];
    $('svcChecks')
      .querySelectorAll('input:checked')
      .forEach(function (inp) {
        ids.push(inp.value);
      });
    if (!ids.length) {
      toast('Kamida bitta xizmat turi tanlanishi kerak');
      if (lastView) buildSvcChecks(lastView);
      return;
    }
    Navbat.post('/api/operator', { operatorId: opId, serviceIds: ids }).catch(function (err) {
      toast('Xatolik: ' + err.message);
    });
  }

  // ---- Render ----
  function render(view) {
    lastView = view;
    if (!opId) return;
    var me = myOp(view);
    if (!me) return;

    // Status toggle
    var st = $('statusToggle');
    if (me.online) {
      st.textContent = 'Onlayn';
      st.className = 'status-toggle online';
    } else {
      st.textContent = 'Operator dam olishda';
      st.className = 'status-toggle paused';
    }

    // Current ticket
    var box = $('currentBox');
    if (me.current) {
      calledAtTs = me.current.calledAt;
      box.innerHTML =
        '<div class="svc-pill" style="color:' +
        me.current.serviceColor +
        '">' +
        me.current.serviceIcon +
        ' ' +
        me.current.serviceName +
        '</div>' +
        '<div class="code tabnum">' +
        me.current.code +
        '</div>' +
        '<div class="timer" id="curTimer">0:00</div>';
      startTimer();
    } else {
      calledAtTs = null;
      stopTimer();
      box.innerHTML = '<div class="empty">Navbat boʻsh</div>';
    }

    // Next
    $('nextCode').textContent = me.next ? me.next.code : '—';
    $('nextSvc').textContent = me.next ? ' · ' + me.next.serviceIcon + ' ' + me.next.serviceName : '';

    // Buttons
    if (!busy) {
      $('btnCall').disabled = false;
      $('btnRecall').disabled = !me.current;
      $('btnSkip').disabled = !me.current;
    }

    buildPullQueues(view);
    buildSvcChecks(view);

    // Waiting breakdown
    var wb = $('waitBreakdown');
    wb.innerHTML = '';
    var total = 0;
    view.services.forEach(function (s) {
      total += s.waiting;
      var row = document.createElement('div');
      row.className = 'wb-row';
      row.innerHTML =
        '<span class="wb-name"><span class="dot" style="background:' +
        s.color +
        '"></span>' +
        s.icon +
        ' ' +
        s.name +
        '</span><span class="wb-n tabnum">' +
        s.waiting +
        '</span>';
      wb.appendChild(row);
    });
    var totalRow = document.createElement('div');
    totalRow.className = 'wb-total';
    totalRow.innerHTML = '<span>Jami</span><span class="tabnum">' + total + '</span>';
    wb.appendChild(totalRow);

    // Stats
    $('sIssued').textContent = view.stats.issued;
    $('sServed').textContent = view.stats.served;
    $('sNoShow').textContent = view.stats.noShow;
    $('sAvg').textContent = view.stats.avgServiceMin;
  }

  function startTimer() {
    stopTimer();
    updateTimer();
    timerInt = setInterval(updateTimer, 1000);
  }
  function stopTimer() {
    if (timerInt) clearInterval(timerInt);
    timerInt = null;
  }
  function updateTimer() {
    var el = $('curTimer');
    if (el && calledAtTs) el.textContent = Navbat.elapsed(calledAtTs);
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

  function onConn(online) {
    $('offline').classList.toggle('show', !online);
  }

  buildPicker();
  if (opId) chooseOperator(opId);
  Navbat.connect(render, onConn);
})();
