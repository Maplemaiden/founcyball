/**
 * 排位段位表 + 杯数 / 本地账号（小程序登录前用 localStorage 占位）
 * arena：主页中景球场皮肤 id，对应 CSS [data-arena="..."]
 *
 * 分级原则（约 +31 杯/胜）：
 * - 前期跨度小，2～4 胜就能升一级，节奏密
 * - 中后期逐步拉开，避免刷分过快冲顶
 */
window.FOUNCY_RANKS = [
  // 杯门槛 | 跨度 | 约胜场 | 首次抵达奖励（占位）
  {
    id: "dirt",
    name: "泥地联赛",
    arenaName: "泥地球场",
    arena: "dirt",
    cupsNeed: 0,
    reward: null,
  },
  {
    id: "alley",
    name: "巷口联赛",
    arenaName: "巷口球场",
    arena: "alley",
    cupsNeed: 60,
    reward: { id: "r_alley", title: "巷口礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "park",
    name: "社区联赛",
    arenaName: "社区球场",
    arena: "park",
    cupsNeed: 140,
    reward: { id: "r_park", title: "社区礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "county",
    name: "区县联赛",
    arenaName: "区县球场",
    arena: "county",
    cupsNeed: 240,
    reward: { id: "r_county", title: "区县礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "city",
    name: "城市联赛",
    arenaName: "城市球场",
    arena: "city",
    cupsNeed: 360,
    reward: { id: "r_city", title: "城市礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "metro",
    name: "都会联赛",
    arenaName: "都会球场",
    arena: "metro",
    cupsNeed: 520,
    reward: { id: "r_metro", title: "都会礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "pro",
    name: "职业联赛",
    arenaName: "职业球场",
    arena: "pro",
    cupsNeed: 720,
    reward: { id: "r_pro", title: "职业礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "elite",
    name: "精英联赛",
    arenaName: "精英球场",
    arena: "elite",
    cupsNeed: 1000,
    reward: { id: "r_elite", title: "精英礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "champ",
    name: "冠军联赛",
    arenaName: "冠军球场",
    arena: "champ",
    cupsNeed: 1400,
    reward: { id: "r_champ", title: "冠军礼包", blurb: "首次抵达奖励（占位）" },
  },
  {
    id: "legend",
    name: "传奇联赛",
    arenaName: "传奇球场",
    arena: "legend",
    cupsNeed: 2000,
    reward: { id: "r_legend", title: "传奇礼包", blurb: "首次抵达奖励（占位）" },
  },
];

/** 无存档时的默认进度（新号从泥地起步） */
window.FOUNCY_RANK_DEFAULT = {
  cups: 0,
  displayName: "球场新星",
};

const PROFILE_SAVE_KEY = "founcy_profile_v1";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function rankByCups(cups) {
  const list = window.FOUNCY_RANKS || [];
  let best = list[0] || {
    id: "dirt",
    name: "泥地联赛",
    arenaName: "泥地球场",
    arena: "dirt",
    cupsNeed: 0,
  };
  const c = Math.max(0, cups | 0);
  for (const r of list) {
    if (c >= (r.cupsNeed || 0)) best = r;
  }
  return best;
}

function loadProfileRaw() {
  try {
    const raw = localStorage.getItem(PROFILE_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (_) {
    return null;
  }
}

function normalizeProfile(data) {
  const def = window.FOUNCY_RANK_DEFAULT || {};
  const cups = Math.max(0, Math.floor(Number(data && data.cups) || def.cups || 0));
  const displayName =
    (data && typeof data.displayName === "string" && data.displayName.trim()) ||
    def.displayName ||
    "球场新星";
  return {
    cups,
    displayName: displayName.slice(0, 12),
    /** false = 游客占位；微信登录后改为 true */
    loggedIn: !!(data && data.loggedIn),
    /** 预留：微信头像 URL / 本地头像 id */
    avatarUrl: (data && data.avatarUrl) || "",
    avatarPlayerId: (data && data.avatarPlayerId) || "",
  };
}

/**
 * 杯数浮动：赢 +30~32，输 −28~−30。
 * 对手杯更高 → 赢得多一点、输得少一点；对手更低则相反。
 * @param {number} myCups
 * @param {number} oppCups
 * @param {boolean} won
 * @returns {number} 有符号整数（输为负）
 */
function cupDelta(myCups, oppCups, won) {
  const diff = (Number(oppCups) || 0) - (Number(myCups) || 0);
  // ±400 杯拉满浮动
  const t = clamp(diff / 400, -1, 1);
  if (won) {
    // t=-1 → 30，t=0 → 31，t=1 → 32
    return Math.round(31 + t);
  }
  // t=-1 → -30，t=0 → -29，t=1 → -28
  return Math.round(-29 + t);
}

/**
 * 为人机排位捏一个对手杯数（贴着自己上下浮动）
 * @param {number} myCups
 * @param {"normal"|"hard"} [difficulty]
 */
function rollOpponentCups(myCups, difficulty) {
  const mine = Math.max(0, Number(myCups) || 0);
  const hard = difficulty === "hard";
  const bias = hard ? 40 : -10;
  const spread = hard ? 140 : 110;
  const jitter = (Math.random() * 2 - 1) * spread;
  return Math.max(0, Math.round(mine + bias + jitter));
}

window.FouncyRank = {
  saveKey: PROFILE_SAVE_KEY,

  loadProfile() {
    const raw = loadProfileRaw();
    if (raw) return normalizeProfile(raw);
    return normalizeProfile(null);
  },

  saveProfile(profile) {
    const p = normalizeProfile(profile || {});
    try {
      localStorage.setItem(
        PROFILE_SAVE_KEY,
        JSON.stringify({
          cups: p.cups,
          displayName: p.displayName,
          loggedIn: p.loggedIn,
          avatarUrl: p.avatarUrl || "",
          avatarPlayerId: p.avatarPlayerId || "",
        })
      );
    } catch (_) {}
    return p;
  },

  rankForCups(cups) {
    return rankByCups(cups);
  },

  /**
   * 冲杯进度：距下一联赛 / 球场还差多少
   * @returns {{
   *   atTop:boolean, current:object, next:object|null,
   *   cups:number, need:number, into:number, span:number, pct:number,
   *   label:string, hint:string
   * }}
   */
  progressToNext(cups) {
    const c = Math.max(0, Math.floor(Number(cups) || 0));
    const list = window.FOUNCY_RANKS || [];
    const current = rankByCups(c);
    const idx = list.findIndex((r) => r && r.id === current.id);
    const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
    if (!next) {
      return {
        atTop: true,
        current,
        next: null,
        cups: c,
        need: 0,
        into: 0,
        span: 1,
        pct: 1,
        label: "已登顶传奇联赛",
        hint: "守住杯数，别掉段",
      };
    }
    const lo = current.cupsNeed || 0;
    const hi = next.cupsNeed || lo + 1;
    const span = Math.max(1, hi - lo);
    const into = clamp(c - lo, 0, span);
    const need = Math.max(0, hi - c);
    const pct = clamp(into / span, 0, 1);
    const winsHint = Math.max(1, Math.ceil(need / 31));
    return {
      atTop: false,
      current,
      next,
      cups: c,
      need,
      into,
      span,
      pct,
      label: `还差 ${need} 杯 · 解锁${next.arenaName || next.name}`,
      hint: winsHint <= 1 ? "再赢 1 场就升段" : `大约再胜 ${winsHint} 场`,
    };
  },

  cupDelta,
  rollOpponentCups,

  /**
   * 结算一场排位：改杯数、升段、落盘。
   * @returns {{ won:boolean, delta:number, cupsBefore:number, cupsAfter:number, rank, oppCups:number, line:string, promoted:boolean }}
   */
  applyMatchResult(won, oppCups, profile) {
    const prev = normalizeProfile(profile || this.loadProfile());
    const cupsBefore = prev.cups;
    const rankBefore = rankByCups(cupsBefore);
    const delta = cupDelta(cupsBefore, oppCups, !!won);
    const cupsAfter = Math.max(0, cupsBefore + delta);
    const saved = this.saveProfile({ ...prev, cups: cupsAfter });
    const rank = rankByCups(saved.cups);
    const promoted = rank.id !== rankBefore.id && cupsAfter > cupsBefore;
    const sign = delta >= 0 ? "+" : "";
    let line = `杯数 ${sign}${delta} · 现 ${saved.cups} 杯`;
    if (promoted) {
      line += `\n升入${rank.name} · ${rank.arenaName || ""}`;
    } else if (won) {
      const prog = this.progressToNext(saved.cups);
      if (!prog.atTop && prog.need > 0 && prog.need <= 64) {
        line += `\n再差 ${prog.need} 杯解锁${prog.next.arenaName || prog.next.name}`;
      }
    }
    return {
      won: !!won,
      delta,
      cupsBefore,
      cupsAfter: saved.cups,
      rank,
      oppCups: Math.max(0, Math.round(Number(oppCups) || 0)),
      line,
      promoted,
    };
  },
};

/** @deprecated 请用 FouncyRank.loadProfile()；保留只读快照避免旧代码报错 */
window.FOUNCY_RANK_FAKE = { rankId: "dirt", cups: 0 };
