/**
 * 通用技能 / 连携占位
 * - 技能按 lane 限定位置；每项技能全局只能装备给一名球员
 * - 效果 id 与对局结算逻辑对应（game.js）
 */
(() => {
  "use strict";

  const LANE_LABEL = { fwd: "前锋", mid: "中场", def: "后防" };

  /** @type {Array<{id:string,name:string,lane:string,desc:string}>} */
  const SKILLS = [
    {
      id: "box_hunter",
      name: "禁区猎手",
      lane: "fwd",
      desc: "本击碰到足球后，等自己减速，再沿当前朝向突然二段加速（方向不变）。",
    },
    {
      id: "dragon_glide",
      name: "翩若惊鸿",
      lane: "fwd",
      desc: "力量+20、弧线+20，持续 1 回合。",
    },
    {
      id: "buu_form",
      name: "魔人布欧",
      lane: "fwd",
      desc: "体积渐增至 1.25 倍、质量上升、力量+20，本击禁用弧线，持续 1 回合。",
    },
    {
      id: "tempo_arc",
      name: "节拍弧",
      lane: "mid",
      desc: "弧线+20，持续 2 回合。",
    },
    {
      id: "stroll",
      name: "闲庭信步",
      lane: "mid",
      desc: "本击若未碰到任何球员或足球，可立刻再击一次。",
    },
    {
      id: "monk_slide",
      name: "武林飞铲",
      lane: "def",
      desc: "本击首个碰到的对方球员受伤 1 回合（无法选中移动）。",
    },
  ];

  /** 连携技占位（未实装；按指定球员组合，不绑定俱乐部字段） */
  const COMBOS = [
    {
      id: "galaxy_armada",
      name: "银河齐射",
      tag: "名宿组合",
      need: "场上含 总裁 / 魔笛 / 武僧 / 水爷 / 圣卡西 / 齐祖 中任意 ≥2 人",
      desc: "建设中：组合球员碰撞或连续触球后触发额外冲量。",
    },
    {
      id: "cosmos_tiki",
      name: "宇宙传控",
      tag: "名宿组合",
      need: "场上含 梅老板 / 苏牙 / 小罗 / 小白 中任意 ≥2 人",
      desc: "建设中：短传碰撞串联后下一次击球弧线微增。",
    },
    {
      id: "portugal_wall",
      name: "五盾防线",
      tag: "双人组合",
      need: "总裁 + 武僧同时上场",
      desc: "建设中：双人连携占位。",
    },
  ];

  /** 默认装备：保留原角色技能手感 */
  const DEFAULT_EQUIP = {
    box_hunter: "suya",
    dragon_glide: "zongcai",
    buu_form: "habao",
    tempo_arc: "modi",
    stroll: "meilaoban",
    monk_slide: "wuseng",
  };

  const SAVE_KEY = "founcy_skill_equip_v1";

  function byIdMap(list) {
    const m = Object.create(null);
    for (const s of list) m[s.id] = s;
    return m;
  }

  const skillById = byIdMap(SKILLS);

  function loadEquip() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...DEFAULT_EQUIP };
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return { ...DEFAULT_EQUIP };
      // 合并默认：缺的技能补上默认，非法项丢掉
      const out = { ...DEFAULT_EQUIP };
      for (const s of SKILLS) {
        if (Object.prototype.hasOwnProperty.call(data, s.id)) {
          const pid = data[s.id];
          out[s.id] = pid || null;
        }
      }
      // 保证一名球员最多一个技能
      const seen = Object.create(null);
      for (const s of SKILLS) {
        const pid = out[s.id];
        if (!pid) continue;
        if (seen[pid]) out[s.id] = null;
        else seen[pid] = s.id;
      }
      return out;
    } catch (_) {
      return { ...DEFAULT_EQUIP };
    }
  }

  function saveEquip(equip) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(equip || {}));
    } catch (_) {}
  }

  let equipCache = null;

  function getEquip() {
    if (!equipCache) equipCache = loadEquip();
    return equipCache;
  }

  function forPlayer(playerId) {
    if (!playerId) return null;
    const equip = getEquip();
    for (const s of SKILLS) {
      if (equip[s.id] === playerId) {
        return { id: s.id, name: s.name, desc: s.desc, lane: s.lane };
      }
    }
    return null;
  }

  function wearerOf(skillId) {
    const equip = getEquip();
    return equip[skillId] || null;
  }

  /**
   * 装备技能到球员；同技能会从其他人卸下；同球员原技能会被替换。
   * @returns {{ ok: boolean, reason?: string }}
   */
  function equipTo(skillId, playerId) {
    const skill = skillById[skillId];
    if (!skill) return { ok: false, reason: "未知技能" };
    const players = window.FOUNCY_PLAYERS || [];
    const p = players.find((x) => x.id === playerId);
    if (!p) return { ok: false, reason: "未知球员" };
    if (p.lane !== skill.lane) {
      return { ok: false, reason: `仅限${LANE_LABEL[skill.lane] || skill.lane}装备` };
    }
    const equip = { ...getEquip() };
    // 卸下该球员已有技能
    for (const s of SKILLS) {
      if (equip[s.id] === playerId) equip[s.id] = null;
    }
    equip[skillId] = playerId;
    equipCache = equip;
    saveEquip(equip);
    return { ok: true };
  }

  function unequip(skillId) {
    const equip = { ...getEquip() };
    if (!Object.prototype.hasOwnProperty.call(equip, skillId)) {
      return { ok: false, reason: "未知技能" };
    }
    equip[skillId] = null;
    equipCache = equip;
    saveEquip(equip);
    return { ok: true };
  }

  function laneLabel(lane) {
    return LANE_LABEL[lane] || lane || "";
  }

  window.FOUNCY_SKILLS = SKILLS;
  window.FOUNCY_COMBOS = COMBOS;
  window.FOUNCY_DEFAULT_SKILL_EQUIP = DEFAULT_EQUIP;
  window.FouncySkills = {
    list: () => SKILLS.slice(),
    combos: () => COMBOS.slice(),
    get: (id) => skillById[id] || null,
    getEquip,
    forPlayer,
    wearerOf,
    equipTo,
    unequip,
    laneLabel,
    reload() {
      equipCache = null;
      return getEquip();
    },
  };
})();
