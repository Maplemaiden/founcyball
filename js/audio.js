(() => {
  "use strict";

  /** 音效表：id → 相对站点根路径 */
  const SFX = {
    ball_hit: "assets/sfx/ball-hit.wav",
    goal_swish: "assets/sfx/goal-swish.wav",
    turn: "assets/sfx/select.wav",
    cheer: "assets/sfx/cheer.wav",
  };

  const buffers = Object.create(null);
  const lastPlayAt = Object.create(null);
  /** @type {Record<string, Array<{ src: AudioBufferSourceNode, gain: GainNode }>>} */
  const active = Object.create(null);
  let ctx = null;
  let unlocked = false;
  let masterGain = null;
  let muted = false;
  let volume = 0.85;

  const MUTE_KEY = "founcy_sfx_mute_v1";
  const VOL_KEY = "founcy_sfx_vol_v1";
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
    const savedVol = localStorage.getItem(VOL_KEY);
    if (savedVol != null && savedVol !== "") {
      const v = Number(savedVol);
      if (Number.isFinite(v)) volume = Math.max(0, Math.min(1, v));
    }
  } catch (_) {
    /* ignore */
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  async function unlock() {
    const c = ensureCtx();
    if (!c) return false;
    try {
      if (c.state === "suspended") await c.resume();
    } catch (_) {
      /* ignore */
    }
    unlocked = c.state === "running";
    return unlocked;
  }

  function setMuted(on) {
    muted = !!on;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
    if (masterGain) masterGain.gain.value = muted ? 0 : volume;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    try {
      localStorage.setItem(VOL_KEY, String(volume));
    } catch (_) {
      /* ignore */
    }
    if (masterGain && !muted) masterGain.gain.value = volume;
  }

  async function loadOne(id) {
    if (buffers[id]) return buffers[id];
    const url = SFX[id];
    if (!url) return null;
    const c = ensureCtx();
    if (!c) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      const buf = await c.decodeAudioData(raw.slice(0));
      buffers[id] = buf;
      return buf;
    } catch (_) {
      return null;
    }
  }

  function preload(ids) {
    const list = ids && ids.length ? ids : Object.keys(SFX);
    ensureCtx();
    return Promise.all(list.map((id) => loadOne(id)));
  }

  /**
   * @param {string} id
   * @param {{ impact?: number, volume?: number, cooldownMs?: number, rate?: number }} [opts]
   */
  function play(id, opts) {
    opts = opts || {};
    if (muted) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") {
      // 未解锁时尝试 resume（若仍在用户手势栈内会成功）
      unlock();
      if (!c || c.state !== "running") return;
    }
    const buf = buffers[id];
    if (!buf) {
      loadOne(id).then((b) => {
        if (b) play(id, opts);
      });
      return;
    }

    const cooldown = opts.cooldownMs != null ? opts.cooldownMs : 55;
    const now = performance.now();
    if (cooldown > 0 && lastPlayAt[id] != null && now - lastPlayAt[id] < cooldown) return;
    lastPlayAt[id] = now;

    // impact≈速度：弱碰轻声，强碰更响；阈值与火花接近
    let gain = opts.volume != null ? opts.volume : 1;
    if (opts.impact != null) {
      const imp = Math.max(0, opts.impact);
      if (imp < 5) return;
      gain *= Math.min(1, 0.22 + imp / 55);
    }

    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts.rate != null) src.playbackRate.value = opts.rate;
    else if (opts.impact != null) {
      // 轻碰略高、重碰略低，避免完全同音重复
      src.playbackRate.value = Math.max(0.82, Math.min(1.18, 1.08 - opts.impact / 220));
    }

    const g = c.createGain();
    g.gain.value = Math.max(0, Math.min(1, gain));
    src.connect(g);
    g.connect(masterGain || c.destination);

    const entry = { src, gain: g };
    if (!active[id]) active[id] = [];
    active[id].push(entry);
    src.onended = () => {
      const list = active[id];
      if (!list) return;
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
    };

    try {
      src.start(0);
    } catch (_) {
      /* ignore */
    }
  }

  /** 停止指定音效；不传 id 则停掉全部正在播的 */
  function stop(id) {
    const ids = id ? [id] : Object.keys(active);
    for (const key of ids) {
      const list = active[key];
      if (!list || !list.length) continue;
      active[key] = [];
      for (const entry of list) {
        try {
          entry.src.onended = null;
          entry.src.stop(0);
        } catch (_) {
          /* already stopped */
        }
        try {
          entry.src.disconnect();
          entry.gain.disconnect();
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  // 任意首次指针/按键解锁（浏览器自动播放策略）
  function armUnlockOnce() {
    const go = () => {
      unlock();
      document.removeEventListener("pointerdown", go, true);
      document.removeEventListener("keydown", go, true);
    };
    document.addEventListener("pointerdown", go, true);
    document.addEventListener("keydown", go, true);
  }

  armUnlockOnce();
  preload(["ball_hit", "goal_swish", "turn", "cheer"]);

  window.FouncyAudio = {
    unlock,
    preload,
    play,
    stop,
    setMuted,
    setVolume,
    isMuted: () => muted,
    getVolume: () => volume,
    ready: (id) => !!buffers[id],
  };
})();
