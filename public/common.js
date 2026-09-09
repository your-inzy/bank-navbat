/* ==========================================================================
   Bank navbat tizimi — umumiy mijoz kodi
   ========================================================================== */

window.Navbat = (function () {
  'use strict';

  /**
   * Subscribe to server state.
   *
   * Two transports run together:
   *   1. Server-Sent Events (/events) — sub-second updates on a LAN.
   *   2. A 2.5s poll of /api/state — the reliable backbone. Works through any
   *      proxy, tunnel or host (some, e.g. Cloudflare, buffer SSE bodies).
   *
   * Whichever delivers first wins; identical snapshots are ignored so there is
   * no redundant re-render or double chime.
   *
   * @param {(view: object) => void} onState
   * @param {(online: boolean) => void} [onConnChange]
   */
  function connect(onState, onConnChange) {
    let alive = null;
    let lastJson = '';
    let lastOkAt = 0;
    const POLL_MS = 2500;
    const OFFLINE_AFTER_MS = 7000;

    function setConn(v) {
      if (v !== alive) {
        alive = v;
        if (onConnChange) onConnChange(v);
      }
    }

    function apply(text) {
      lastOkAt = Date.now();
      setConn(true);
      if (text === lastJson) return;
      lastJson = text;
      try {
        onState(JSON.parse(text));
      } catch (err) {
        console.error('Holatni oʻqib boʻlmadi', err);
      }
    }

    function markMaybeOffline() {
      if (Date.now() - lastOkAt > OFFLINE_AFTER_MS) setConn(false);
    }

    // --- Transport 1: SSE (best effort) ---
    function openSSE() {
      let es;
      try {
        es = new EventSource('/events');
      } catch (e) {
        return;
      }
      es.addEventListener('state', function (e) {
        apply(e.data);
      });
      es.addEventListener('error', function () {
        markMaybeOffline();
        if (es.readyState === EventSource.CLOSED) setTimeout(openSSE, 3000);
      });
    }
    openSSE();

    // --- Transport 2: polling backbone ---
    async function poll() {
      try {
        const r = await fetch('/api/state', { cache: 'no-store' });
        if (r.ok) apply(await r.text());
        else markMaybeOffline();
      } catch (e) {
        markMaybeOffline();
      }
    }
    poll();
    const pollTimer = setInterval(poll, POLL_MS);

    return {
      close: function () {
        clearInterval(pollTimer);
      },
    };
  }

  /** JSON POST so'rov. */
  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* ignore */
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Soʻrovda xatolik');
    }
    return data;
  }

  /** "A012" -> "A 0 1 2" (ovozli e'lon uchun). */
  function spellCode(code) {
    return String(code).split('').join(' ');
  }

  /** Kutish vaqtini o'zbekcha matnга aylantirish. */
  function waitText(etaMin, peopleAhead) {
    if (peopleAhead === 0) return 'Siz keyingisiz';
    if (!etaMin || etaMin < 1) return '1 daqiqadan kam';
    return '~' + etaMin + ' daqiqa';
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  /** "3 kishi" kabi. */
  function peopleText(n) {
    return n + ' kishi';
  }

  const WEEKDAYS = [
    'Yakshanba',
    'Dushanba',
    'Seshanba',
    'Chorshanba',
    'Payshanba',
    'Juma',
    'Shanba',
  ];
  const MONTHS = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr',
  ];

  function fmtClock(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function fmtDate(d) {
    d = d || new Date();
    return (
      WEEKDAYS[d.getDay()] +
      ', ' +
      d.getDate() +
      '-' +
      MONTHS[d.getMonth()] +
      ' ' +
      d.getFullYear()
    );
  }

  function elapsed(sinceTs) {
    const s = Math.max(0, Math.floor((Date.now() - sinceTs) / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  /** Ikki tonli "ding-dong" signali (audio fayl kerak emas). */
  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = chime._ctx || (chime._ctx = new Ctx());
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const notes = [
        { f: 880, t: 0 },
        { f: 1174, t: 0.18 },
        { f: 1567, t: 0.36 },
      ];
      notes.forEach(function (n) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n.f;
        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.exponentialRampToValueAtTime(0.35, now + n.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + n.t);
        osc.stop(now + n.t + 0.55);
      });
    } catch (e) {
      /* ignore */
    }
  }

  /** Ovozli e'lon (imkoni bo'lsa o'zbekcha). */
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const uz = voices.find((v) => /uz/i.test(v.lang));
      const ru = voices.find((v) => /ru/i.test(v.lang));
      u.voice = uz || ru || null;
      u.lang = (uz && uz.lang) || (ru && ru.lang) || 'uz-UZ';
      u.rate = 0.92;
      u.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* ignore */
    }
  }

  return {
    connect: connect,
    post: post,
    spellCode: spellCode,
    waitText: waitText,
    peopleText: peopleText,
    plural: plural,
    fmtClock: fmtClock,
    fmtDate: fmtDate,
    elapsed: elapsed,
    chime: chime,
    speak: speak,
  };
})();
