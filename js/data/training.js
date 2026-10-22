/**
 * 训练关卡表
 * - 目标：尽量少步进球（理想 1 击）
 * - 对手固定极难 AI（红方）
 * - 坐标：球场逻辑米制，宽 68 × 长 105；蓝攻上(y→0)，红攻下(y→105)
 *
 * 间距约定（PLAYER_R≈6.1，BALL_R≈2.2）：
 *   球员中心距 ≥ 14；球员与球中心距 ≥ 10
 *
 * 编辑器：tools/level-editor.html
 * 写入：node tools/add-training-level.mjs <level.json>
 */
(() => {
  "use strict";

  const W = 68;
  const L = 105;

  window.FOUNCY_TRAINING = {
    blurb: "对手使用极难电脑。尽量一击破门——拖到对方回合会被反打。",
    difficulties: [
      {
        id: "easy",
        name: "简单",
        tag: "开阔",
        desc: "新手必练：先直线，再学弧线。",
      },
      {
        id: "normal",
        name: "普通",
        tag: "绕人",
        desc: "需要弧线、借墙或变向。",
      },
      {
        id: "hard",
        name: "困难",
        tag: "窄缝",
        desc: "角度刁钻，容错极低。",
      },
    ],
    levels: [
      // —— 简单 ——
      {
        id: "e1",
        diff: "easy",
        name: "门前礼包",
        subtitle: "直线推门",
        tip: "中路无人。选中间蓝点，对准球往上门推。",
        idealShots: 1,
        focus: "aim",
        teamA: ["suya","meilaoban","wuseng"],
        teamB: ["zongcai","modi","habao"],
        layout: {
          ball: { x: W * 0.500, y: L * 0.260 },
          A: [
            { x: W * 0.500, y: L * 0.460 },
            { x: W * 0.140, y: L * 0.720 },
            { x: W * 0.860, y: L * 0.720 }
          ],
          B: [
            { x: W * 0.100, y: L * 0.180 },
            { x: W * 0.900, y: L * 0.180 },
            { x: W * 0.100, y: L * 0.550 }
          ],
        },
      },
      {
        id: "e2",
        diff: "easy",
        name: "通天走廊",
        subtitle: "中路直塞",
        tip: "再远一点，同样是空走廊。对准球心全力推。",
        idealShots: 1,
        focus: "power",
        teamA: ["meilaoban","suya","wuseng"],
        teamB: ["zongcai","modi","habao"],
        layout: {
          ball: { x: W * 0.500, y: L * 0.400 },
          A: [
            { x: W * 0.500, y: L * 0.600 },
            { x: W * 0.120, y: L * 0.820 },
            { x: W * 0.880, y: L * 0.820 }
          ],
          B: [
            { x: W * 0.080, y: L * 0.140 },
            { x: W * 0.920, y: L * 0.140 },
            { x: W * 0.920, y: L * 0.480 }
          ],
        },
      },
      {
        id: "e3",
        diff: "easy",
        name: "绝妙弧线",
        subtitle: "学会拧弧",
        tip: "直线不好进时：蓄力中用副指左右拉，或按 A / D 拧弧。",
        idealShots: 1,
        focus: "curve",
        teamA: ["meilaoban","suya","wuseng"],
        teamB: ["zongcai","modi","habao"],
        layout: {
          ball: { x: W * 0.656, y: L * 0.284 },
          A: [
            { x: W * 0.149, y: L * 0.455 },
            { x: W * 0.094, y: L * 0.135 },
            { x: W * 0.860, y: L * 0.077 }
          ],
          B: [
            { x: W * 0.904, y: L * 0.203 },
            { x: W * 0.397, y: L * 0.219 },
            { x: W * 0.360, y: L * 0.080 }
          ],
        },
      },
      // —— 普通 ——
      {
        id: "n1",
        diff: "normal",
        name: "人墙绕弧",
        subtitle: "副指拧弯",
        tip: "正前方偏右有人挡直线。用魔笛拧左弧绕过去。",
        idealShots: 1,
        focus: "curve",
        teamA: ["modi","meilaoban","wuseng"],
        teamB: ["zongcai","habao","suya"],
        layout: {
          ball: { x: W * 0.368, y: L * 0.207 },
          A: [
            { x: W * 0.502, y: L * 0.707 },
            { x: W * 0.494, y: L * 0.849 },
            { x: W * 0.706, y: L * 0.920 }
          ],
          B: [
            { x: W * 0.422, y: L * 0.418 },
            { x: W * 0.097, y: L * 0.251 },
            { x: W * 0.120, y: L * 0.120 }
          ],
        },
      },
      {
        id: "n2",
        diff: "normal",
        name: "边路回扣",
        subtitle: "斜线射门",
        tip: "球在边路，瞄准远角或先撞球再让球改向。",
        idealShots: 1,
        focus: "angle",
        teamA: ["zongcai","meilaoban","wuseng"],
        teamB: ["habao","modi","suya"],
        layout: {
          ball: { x: W * 0.211, y: L * 0.281 },
          A: [
            { x: W * 0.220, y: L * 0.500 },
            { x: W * 0.785, y: L * 0.225 },
            { x: W * 0.887, y: L * 0.326 }
          ],
          B: [
            { x: W * 0.552, y: L * 0.084 },
            { x: W * 0.576, y: L * 0.207 },
            { x: W * 0.780, y: L * 0.100 }
          ],
        },
      },
      {
        id: "n3",
        diff: "normal",
        name: "借墙弹射",
        subtitle: "边线折射",
        tip: "正对球门被封，试着把球撞向边线再弹入。",
        idealShots: 1,
        focus: "bank",
        teamA: ["meilaoban","suya","wuseng"],
        teamB: ["zongcai","modi","habao"],
        layout: {
          ball: { x: W * 0.875, y: L * 0.457 },
          A: [
            { x: W * 0.720, y: L * 0.540 },
            { x: W * 0.400, y: L * 0.680 },
            { x: W * 0.160, y: L * 0.580 }
          ],
          B: [
            { x: W * 0.460, y: L * 0.407 },
            { x: W * 0.455, y: L * 0.285 },
            { x: W * 0.673, y: L * 0.370 }
          ],
        },
      },
      // —— 困难 ——
      {
        id: "h1",
        diff: "hard",
        name: "一线天",
        subtitle: "窄缝穿档",
        tip: "两名后卫之间只有一线空隙，力度和角度都要准。",
        idealShots: 1,
        focus: "gap",
        teamA: ["suya","meilaoban","modi"],
        teamB: ["wuseng","habao","zongcai"],
        layout: {
          ball: { x: W * 0.566, y: L * 0.403 },
          A: [
            { x: W * 0.373, y: L * 0.894 },
            { x: W * 0.902, y: L * 0.781 },
            { x: W * 0.631, y: L * 0.927 }
          ],
          B: [
            { x: W * 0.437, y: L * 0.256 },
            { x: W * 0.904, y: L * 0.148 },
            { x: W * 0.676, y: L * 0.244 }
          ],
        },
      },
      {
        id: "h2",
        diff: "hard",
        name: "中圈重炮",
        subtitle: "远射破局",
        tip: "球在中场附近，禁区有人。找空档或借碰撞变向。",
        idealShots: 1,
        focus: "long",
        teamA: ["zongcai","modi","wuseng"],
        teamB: ["habao","suya","meilaoban"],
        layout: {
          ball: { x: W * 0.519, y: L * 0.749 },
          A: [
            { x: W * 0.509, y: L * 0.950 },
            { x: W * 0.220, y: L * 0.860 },
            { x: W * 0.780, y: L * 0.860 }
          ],
          B: [
            { x: W * 0.300, y: L * 0.200 },
            { x: W * 0.700, y: L * 0.200 },
            { x: W * 0.500, y: L * 0.100 }
          ],
        },
      },
      {
        id: "h3",
        diff: "hard",
        name: "借力打力",
        subtitle: "斜切进门",
        tip: "你在球右后方，正对球门被挡。斜着撞球，往左上远角送。",
        idealShots: 1,
        focus: "setup",
        teamA: ["meilaoban","suya","wuseng"],
        teamB: ["zongcai","modi","habao"],
        layout: {
          ball: { x: W * 0.400, y: L * 0.300 },
          A: [
            { x: W * 0.601, y: L * 0.458 },
            { x: W * 0.852, y: L * 0.916 },
            { x: W * 0.880, y: L * 0.760 }
          ],
          B: [
            { x: W * 0.477, y: L * 0.176 },
            { x: W * 0.663, y: L * 0.214 },
            { x: W * 0.191, y: L * 0.173 }
          ],
        },
      },
    ],
  };
})();
