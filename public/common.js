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

  // --- Speech synthesis -------------------------------------------------------

  // Named voice to grab first: Microsoft Madina, the uz-UZ online neural voice
  // available in Microsoft Edge. Everything below is only a safety net so the
  // announcement is never silent if Madina is missing (e.g. opened in Chrome).
  const VOICE_NAME_PREF = [/madina/i];

  // Languages whose voices pronounce Uzbek (Latin) acceptably, best first.
  // Turkic languages (tr / az / kk …) share the sound system and Latin
  // orthography, so they read Uzbek far better than ru/en fallbacks.
  const VOICE_LANG_PREF = ['uz', 'tr', 'az', 'kk', 'ky', 'tk', 'ru', 'en'];

  let voiceCache = [];
  function refreshVoices() {
    try {
      voiceCache = window.speechSynthesis.getVoices() || [];
    } catch (e) {
      voiceCache = [];
    }
    return voiceCache;
  }
  if ('speechSynthesis' in window) {
    refreshVoices();
    try {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } catch (e) {
      /* older engines */
    }
  }

  function langRank(v) {
    const l = (v.lang || '').toLowerCase().slice(0, 2);
    const i = VOICE_LANG_PREF.indexOf(l);
    return i === -1 ? 99 : i;
  }

  /** All installed voices, Turkic/Uzbek-friendly ones first. */
  function listVoices() {
    return refreshVoices()
      .slice()
      .sort((a, b) => langRank(a) - langRank(b) || (a.name < b.name ? -1 : 1));
  }

  function pickVoice(preferred) {
    const vs = refreshVoices();
    if (!vs.length) return null;
    if (preferred) {
      const hit = vs.find((v) => v.voiceURI === preferred || v.name === preferred);
      if (hit) return hit;
    }
    // "Automatic": Microsoft Madina / Sardor (uz-UZ) if present …
    for (const rx of VOICE_NAME_PREF) {
      const hit = vs.find((v) => rx.test(v.name || ''));
      if (hit) return hit;
    }
    // … otherwise the best available language match.
    for (const code of VOICE_LANG_PREF) {
      const hit = vs.find((v) => (v.lang || '').toLowerCase().slice(0, 2) === code);
      if (hit) return hit;
    }
    return vs[0] || null;
  }

  /**
   * Speak a phrase.
   * @param {string} text
   * @param {{voiceURI?: string, rate?: number, pitch?: number}} [opts]
   */
  function speak(text, opts) {
    try {
      if (!('speechSynthesis' in window)) return;
      opts = opts || {};
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(opts.voiceURI);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else {
        u.lang = 'uz-UZ';
      }
      u.rate = opts.rate || 0.9;
      u.pitch = opts.pitch == null ? 1 : opts.pitch;
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
    listVoices: listVoices,
    pickVoice: pickVoice,
  };
})();
