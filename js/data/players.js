/**
 * 球员图鉴 — 外号命名（避免真名侵权）；务必保留 prototype 字段供 AI/开发识别
 * 四维：力量 / 弧线 / 控停 / 冲撞（50≈基准）
 * lane: fwd 前锋 | mid 中场 | def 后防 —— 决定充能规则
 * skill: 绑定主动技（充能满可发动，发动后能量归零）
 *
 * prototype：现实球员原型（仅注释/识别用，不展示给玩家也行）
 */
window.FOUNCY_PLAYERS = [
  {
    id: "suya",
    name: "苏牙",
    /** @prototype Luis Suárez 路易斯·苏亚雷斯 */
    prototype: "Luis Suárez / 苏亚雷斯",
    avatar: "assets/avatars/suya.png",
    role: "前锋",
    lane: "fwd",
    number: 9,
    blurb: "禁区嗅觉灵，啃住就不松口。",
    owned: true,
    level: 9,
    power: 86,
    curve: 68,
    grip: 58,
    weight: 78,
    skill: {
      id: "box_hunter",
      name: "禁区猎手",
      desc: "本击碰到足球后，等自己减速，再沿当前朝向突然二段加速（方向不变）。",
    },
  },
  {
    id: "zongcai",
    name: "总裁",
    /** @prototype Cristiano Ronaldo 克里斯蒂亚诺·罗纳尔多（C罗） */
    prototype: "Cristiano Ronaldo / C罗",
    avatar: "assets/avatars/zongcai.png",
    role: "边锋",
    lane: "fwd",
    number: 7,
    blurb: "重炮任意球，抬头就能进。",
    owned: true,
    level: 10,
    power: 92,
    curve: 74,
    grip: 52,
    weight: 80,
    skill: {
      id: "dragon_glide",
      name: "翩若游龙",
      desc: "力量+20、弧线+20，持续 1 回合。",
    },
  },
  {
    id: "modi",
    name: "魔笛",
    /** @prototype Luka Modrić 卢卡·莫德里奇 */
    prototype: "Luka Modrić / 莫德里奇",
    avatar: "assets/avatars/modi.png",
    role: "中场",
    lane: "mid",
    number: 10,
    blurb: "节拍器本器，弧线调度满场。",
    owned: true,
    level: 8,
    power: 58,
    curve: 94,
    grip: 82,
    weight: 46,
    skill: {
      id: "tempo_arc",
      name: "节拍弧",
      desc: "弧线+20，持续 2 回合。",
    },
  },
  {
    id: "habao",
    name: "哈宝",
    /** @prototype Erling Haaland 埃尔林·哈兰德 */
    prototype: "Erling Haaland / 哈兰德",
    avatar: "assets/avatars/habao.png",
    role: "中锋",
    lane: "fwd",
    number: 9,
    blurb: "直线冲门机器，撞开一切。",
    owned: true,
    level: 10,
    power: 96,
    curve: 36,
    grip: 48,
    weight: 90,
    skill: {
      id: "buu_form",
      name: "魔人布欧",
      desc: "体积渐增至 1.25 倍、质量上升、力量+20，本击禁用弧线，持续 1 回合。",
    },
  },
  {
    id: "wuseng",
    name: "武僧",
    /** @prototype Pepe 佩佩（葡萄牙后卫） */
    prototype: "Pepe / 佩佩",
    avatar: "assets/avatars/wuseng.png",
    role: "后卫",
    lane: "def",
    number: 3,
    blurb: "铁头硬闯，防守脏活全包。",
    owned: true,
    level: 8,
    power: 55,
    curve: 32,
    grip: 86,
    weight: 96,
    skill: {
      id: "monk_slide",
      name: "武林飞铲",
      desc: "本击首个碰到的对方球员受伤 1 回合（无法移动）。",
    },
  },
  {
    id: "meilaoban",
    name: "梅老板",
    /** @prototype Lionel Messi 利昂内尔·梅西 */
    prototype: "Lionel Messi / 梅西",
    avatar: "assets/avatars/meilaoban.png",
    role: "前腰",
    lane: "mid",
    number: 10,
    blurb: "小步流星，弯刀切开防线。",
    owned: true,
    level: 10,
    power: 72,
    curve: 98,
    grip: 78,
    weight: 42,
    skill: {
      id: "stroll",
      name: "闲庭信步",
      desc: "本击若未碰到任何球员或足球，可立刻再击一次。",
    },
  },
];

window.FOUNCY_DEFAULT_LINEUP_A = ["meilaoban", "suya", "wuseng"];
window.FOUNCY_DEFAULT_LINEUP_B = ["zongcai", "modi", "habao"];

/** 未获得球员占位（仅编队列表展示，不可上场） */
window.FOUNCY_LOCKED_PLAYERS = [
  { id: "locked_a", name: "？？？", lane: "fwd", level: 1, owned: false },
  { id: "locked_b", name: "？？？", lane: "mid", level: 1, owned: false },
  { id: "locked_c", name: "？？？", lane: "def", level: 1, owned: false },
  { id: "locked_d", name: "？？？", lane: "fwd", level: 1, owned: false },
];
