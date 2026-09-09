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
    let lastSseAt = 0; // last time the SSE stream actually delivered something
    let stopped = false;

    const POLL_FAST_MS = 2500; // SSE dead / buffered — polling carries the load
    const POLL_SLOW_MS = 20000; // SSE healthy — poll is just a safety net
    const SSE_HEALTHY_MS = 26000; // no state/ping within this => treat SSE as down
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

    // --- Transport 1: SSE (primary when it works) ---
    function openSSE() {
      let es;
      try {
        es = new EventSource('/events');
      } catch (e) {
        return;
      }
      es.addEventListener('state', function (e) {
        lastSseAt = Date.now();
        apply(e.data);
      });
      es.addEventListener('ping', function () {
        lastSseAt = Date.now();
      });
      es.addEventListener('error', function () {
        markMaybeOffline();
        if (es.readyState === EventSource.CLOSED) setTimeout(openSSE, 3000);
      });
    }
    openSSE();

    // --- Transport 2: adaptive polling backbone ---
    // Polls fast until SSE proves itself, then backs off to a slow safety net.
    // Keeps hundreds of concurrent clients cheap when SSE is healthy, while
    // still guaranteeing <=2.5s updates through proxies that buffer SSE.
    async function poll() {
      try {
        const r = await fetch('/api/state', { cache: 'no-store' });
        if (r.ok) apply(await r.text());
        else markMaybeOffline();
      } catch (e) {
        markMaybeOffline();
      }
    }

    function loop() {
      if (stopped) return;
      const sseHealthy = Date.now() - lastSseAt < SSE_HEALTHY_MS;
      setTimeout(
        function () {
          if (stopped) return;
          poll().then(loop);
        },
        sseHealthy ? POLL_SLOW_MS : POLL_FAST_MS
      );
    }
    poll().then(loop);

    return {
      close: function () {
        stopped = true;
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

  // --- Notification sounds (WebAudio, no audio files needed) -----------------

  function audioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = audioCtx._ctx || (audioCtx._ctx = new Ctx());
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** One bell-like tone with a few harmonics and a soft decay. */
  function bell(ctx, freq, start, dur, level, dest) {
    [1, 2, 3].forEach(function (h, i) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * h;
      const peak = level / (i + 1.4);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g).connect(dest);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  }

  /**
   * Play a notification sound.
   * @param {'call'|'recall'|'ticket'} [kind]  defaults to 'call'
   */
  function chime(kind) {
    try {
      const ctx = audioCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);

      if (kind === 'ticket') {
        // short, quiet single blip — a ticket was issued
        bell(ctx, 1318, t, 0.35, 0.22, master);
      } else if (kind === 'recall') {
        // urgent triple — customer is being called again
        bell(ctx, 784, t, 0.55, 0.4, master);
        bell(ctx, 784, t + 0.22, 0.55, 0.4, master);
        bell(ctx, 1046, t + 0.44, 0.8, 0.4, master);
      } else {
        // default "call": classic two-tone PA chime, bing – bong
        bell(ctx, 659.25, t, 1.1, 0.42, master); // E5
        bell(ctx, 523.25, t + 0.42, 1.4, 0.42, master); // C5
      }
    } catch (e) {
      /* ignore */
    }
  }

  return {
    connect: connect,
    post: post,
    waitText: waitText,
    peopleText: peopleText,
    plural: plural,
    fmtClock: fmtClock,
    fmtDate: fmtDate,
    elapsed: elapsed,
    chime: chime,
  };
})();
