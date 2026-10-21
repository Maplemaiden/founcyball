/** 全局手感 + 四维属性 → 倍率（50 为基准 1.0） */
window.FOUNCY_PHYSICS = {
  PITCH: {
    lengthM: 105,
    widthM: 68,
    goalWidthM: 68 * (2 / 5) * (5 / 6), // 原 2/5 底线宽的 5/6 → 约底线 1/3
    goalDepthM: 6,
    centerCircleR: 9.15,
    /** 与对局 drawPitch 一致的标准示意尺寸（米） */
    penaltyW: 40.32,
    penaltyD: 16.5,
    sixYardW: 18.32,
    sixYardD: 5.5,
    penaltySpot: 11,
  },
  WIN_SCORE: 2,
  PLAYER_R: 1.35 * 3 * 1.5,
  BALL_R: 0.72 * 3,
  DRAG: 1.0,
  MAX_POWER: 145,
  MAX_SPEED: 160,
  REST: 0.35,
  TURN_SWITCH_SPEED: 2.4,
  WALL_BOUNCE: 0.9,
  BODY_RESTITUTION: 0.78,
  MAX_PULL_PX: 140,
  MIN_PULL_PX: 28,
  TRAIL_STEPS: 100,
  // 弧线半径：越大越直。操作从 R_MAX 拧到球员个人 Rmin
  CURVE_R_MAX: 125,
  // 弧线=100 满拧地板（≈旧版 15 的两倍，避免满弧过弯）
  CURVE_R_MIN: 30,
  CURVE_KEY_TIME: 1.05,
  /** 俯视滚动纯表现倍率（1=无打滑滚动，过大头像会转太疯） */
  SPIN_VISUAL: 0.28,

  /**
   * @param {{ power:number, curve:number, grip:number, weight:number }} stats 0~100
   *
   * 弧线 → 个人最小半径（满拧最弯）：
   *   curve 0     → 禁用弧线（完全拧不动）
   *   curve 70    → Rmin≈50.3（≈旧公式属性 32 满拧手感）
   *   curve 100   → Rmin=30（≈旧地板 15×2）
   *   低属性靠近直球：curve→0+ 时 Rmin≈118
   */
  modsFromStats(stats) {
    const p = (stats.power ?? 50) / 100;
    const rawCurve = stats.curve ?? 50;
    const c = Math.max(0, Math.min(1, rawCurve / 100));
    const g = (stats.grip ?? 50) / 100;
    const w = (stats.weight ?? 50) / 100;

    // 旧公式 curve=32 的满拧半径，作为新标尺「70」的锚点
    const RMIN_AT_70 = 62 - (62 - 31) * (32 / 85);
    const RMIN_AT_100 = 30;
    const RMIN_NEAR_ZERO = 118;

    let curveRMin;
    let curveDisabled = false;
    if (rawCurve <= 0 || c <= 0) {
      curveDisabled = true;
      curveRMin = 125;
    } else if (c <= 0.7) {
      const t = c / 0.7;
      curveRMin = RMIN_NEAR_ZERO + (RMIN_AT_70 - RMIN_NEAR_ZERO) * t;
    } else {
      const t = (c - 0.7) / 0.3;
      curveRMin = RMIN_AT_70 + (RMIN_AT_100 - RMIN_AT_70) * t;
    }

    // 控停：摩擦倍率拉大（滑行距离差更明显）
    //   grip 0→0.55（远滑）  50→1.05  100→1.55（快停）
    const dragMult = 0.55 + g * 1.0;

    // 冲撞：质量 + 弹性都拉开
    //   weight 0→mass0.45 / e≈0.70   50→1.225 / ≈0.82   100→2.0 / ≈0.95
    const mass = 0.45 + w * 1.55;
    const restitutionMult = 0.9 + w * 0.32; // 乘到全局 0.78 上约 0.70~1.03（会夹住）

    return {
      powerMult: 0.78 + p * 0.44,
      curveRMin,
      curveRMinMult: curveRMin / RMIN_AT_100,
      curveKeyTimeMult: curveDisabled ? 9 : 1.7 - c * 0.85,
      curveDisabled,
      dragMult,
      mass,
      restitutionMult,
    };
  },
};
