/* ==========================================================================
   TV display (read-only, auto-updating)
   ========================================================================== */

(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };

  var soundOn = localStorage.getItem('tvSound') !== 'off';
  var voiceURI = localStorage.getItem('tvVoiceURI') || '';
  var lastSeq = null;
  var initialised = false;

  updateSoundBtn();
  $('soundToggle').addEventListener('click', function () {
    soundOn = !soundOn;
    localStorage.setItem('tvSound', soundOn ? 'on' : 'off');
    updateSoundBtn();
    if (soundOn) Navbat.chime(); // user gesture — unlocks audio + speech
  });
  function updateSoundBtn() {
    $('soundToggle').textContent = soundOn ? '🔊 Ovoz: yoniq' : '🔇 Ovoz: oʻchiq';
  }

  // ---- Announcement voice picker ----
  function buildVoiceList() {
    var sel = $('voiceSelect');
    var voices = Navbat.listVoices();
    // keep the "auto" option, replace the rest
    sel.length = 1;
    voices.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + ' (' + v.lang + ')';
      sel.appendChild(o);
    });
    // restore saved choice if still available
    sel.value = voiceURI;
    if (sel.value !== voiceURI) {
      voiceURI = '';
      sel.value = '';
    }
  }
  buildVoiceList();
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.addEventListener('voiceschanged', buildVoiceList);
    } catch (e) {
      /* ignore */
    }
  }
  // Voices often load a beat after page load.
  setTimeout(buildVoiceList, 400);
  setTimeout(buildVoiceList, 1500);

  $('voiceSelect').addEventListener('change', function () {
    voiceURI = this.value;
    localStorage.setItem('tvVoiceURI', voiceURI);
    sampleSpeak();
  });
  $('voiceTest').addEventListener('click', sampleSpeak);

  function sampleSpeak() {
    Navbat.chime();
    setTimeout(function () {
      Navbat.speak('Navbat raqami A 100. Uch raqamli operatorga murojaat qiling.', {
        voiceURI: voiceURI,
      });
    }, 700);
  }

  // ---- Clock ----
  function tickClock() {
    var d = new Date();
    $('clock').textContent = Navbat.fmtClock(d);
    $('date').textContent = Navbat.fmtDate(d);
  }
  setInterval(tickClock, 1000);
  tickClock();

  // ---- Announcement ----
  function announce(call) {
    if (soundOn) {
      Navbat.chime();
      var text =
        'Navbat raqami ' +
        call.code +
        '. ' +
        call.operatorId +
        '-operatorga murojaat qiling.';
      setTimeout(function () {
        Navbat.speak(text, { voiceURI: voiceURI });
      }, 950);
    }
    var hl = $('headline');
    hl.classList.remove('flash');
    void hl.offsetWidth;
    hl.classList.add('flash');
  }

  // ---- Render ----
  function render(view) {
    var call = view.lastCall;
    if (call) {
      $('hlCode').textContent = call.code;
      $('hlOp').textContent = call.operatorId + '-OPERATOR';
      $('hlGoto').textContent =
        (call.serviceIcon ? call.serviceIcon + ' ' : '') +
        call.serviceName +
        ' — Iltimos, ' +
        call.operatorId +
        '-operatorga murojaat qiling';
      $('hlNote').textContent = call.recall ? 'Qayta chaqirilmoqda' : '';
    } else {
      $('hlCode').textContent = '—';
      $('hlOp').textContent = '—';
      $('hlGoto').textContent = 'Navbat kutilmoqda';
      $('hlNote').textContent = '';
    }

    // Operator grid (6)
    var grid = $('opGrid');
    grid.innerHTML = '';
    view.board.forEach(function (b) {
      var cell = document.createElement('div');
      cell.className = 'op-cell';
      if (!b.online) cell.classList.add('paused');
      else if (!b.ticketCode) cell.classList.add('idle');
      if (call && call.operatorId === b.id && b.ticketCode === call.code) {
        cell.classList.add('just-called');
      }

      var statusTxt = !b.online ? 'dam olishda' : b.ticketCode ? '' : 'boʻsh';
      var svcHtml = b.ticketCode
        ? '<span class="dot" style="background:' +
          (b.serviceColor || '#789') +
          '"></span>' +
          (b.serviceIcon ? b.serviceIcon + ' ' : '') +
          (b.serviceName || '')
        : '';
      cell.innerHTML =
        '<div class="op-name">' +
        b.id +
        '-operator <small>' +
        statusTxt +
        '</small></div>' +
        '<div class="op-code">' +
        (b.ticketCode || '—') +
        '</div>' +
        '<div class="op-svc">' +
        svcHtml +
        '</div>';
      grid.appendChild(cell);
    });

    // Waiting list (next up to 8, across all queues)
    var wl = $('waitingList');
    wl.innerHTML = '';
    if (!view.waitingList.length) {
      var e = document.createElement('div');
      e.className = 'wait-empty';
      e.textContent = 'Hozircha navbatda hech kim yoʻq';
      wl.appendChild(e);
    } else {
      view.waitingList.forEach(function (w) {
        var item = document.createElement('div');
        item.className = 'wait-item';
        item.innerHTML =
          '<span class="dot" style="background:' +
          (w.serviceColor || '#789') +
          '"></span>' +
          '<span class="wi-code tabnum">' +
          w.code +
          '</span><span class="wi-svc">' +
          (w.serviceIcon ? w.serviceIcon + ' ' : '') +
          w.serviceName +
          '</span>';
        wl.appendChild(item);
      });
    }

    // Legend (service colors)
    var lg = $('legend');
    lg.innerHTML = '';
    view.services.forEach(function (s) {
      var span = document.createElement('span');
      span.innerHTML =
        '<i style="background:' + s.color + '"></i>' + s.icon + ' ' + s.name;
      lg.appendChild(span);
    });

    // Footer stats
    $('stIssued').textContent = view.stats.issued;
    $('stServed').textContent = view.stats.served;
    $('stWaiting').textContent = view.stats.waiting;
    $('stAvg').textContent = view.stats.avgServiceMin;

    // Detect a fresh call
    if (call) {
      if (initialised && call.seq !== lastSeq) announce(call);
      lastSeq = call.seq;
    }
    initialised = true;
  }

  function onConn(online) {
    $('offline').classList.toggle('show', !online);
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = function () {};
  }

  Navbat.connect(render, onConn);
})();
