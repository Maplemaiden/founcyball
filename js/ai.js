/**
 * 人机决策：
 * - normal：偏混战，噪声大
 * - hard：用真实物理静默仿真搜射门；能进必进，否则推最佳控球/压迫
 */
(() => {
  "use strict";

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pickWeighted(items) {
    const total = items.reduce((s, it) => s + it.w, 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.v;
    }
    return items[items.length - 1].v;
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  /** 绕方向旋转 angleRad（屏幕 y 向下） */
  function rotate(dir, angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return normalize(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
  }

  function scraped(list) {
    return list.map((s) => ({ v: s.p, w: s.w }));
  }

  function goalTargets(team, pitch) {
    const mid = pitch.widthM * 0.5;
    const half = (pitch.goalWidthM || pitch.widthM * 0.33) * 0.5;
    const y = team === "A" ? 0 : pitch.lengthM;
    const inset = half * 0.72;
    return [
      { x: mid - inset, y },
      { x: mid, y },
      { x: mid + inset, y },
    ];
  }

  function canUseCurve(player, phys, skillArmed) {
    if (!player || player.disableCurveShot) return false;
    if (player.mods && player.mods.curveDisabled) return false;
    if (skillArmed && player.skill && player.skill.id === "buu_form") return false;
    return true;
  }

  function curveVariants(player, phys, skillArmed) {
    const out = [{ curveSign: 0, curveRadius: phys.CURVE_R_MAX }];
    if (!canUseCurve(player, phys, skillArmed)) return out;
    const rMin = player.mods ? player.mods.curveRMin : phys.CURVE_R_MIN;
    const mid = rMin + (phys.CURVE_R_MAX - rMin) * 0.45;
    out.push(
      { curveSign: -1, curveRadius: mid },
      { curveSign: 1, curveRadius: mid },
      { curveSign: -1, curveRadius: rMin },
      { curveSign: 1, curveRadius: rMin }
    );
    return out;
  }

  function skillOptions(player) {
    const opts = [false];
    if (player.energy >= 1 && player.skill) opts.push(true);
    return opts;
  }

  /**
   * 几何种子：朝「撞球后球大致飞向球门点」的接触线瞄准
   */
  function geometricAims(player, ball, targets) {
    const aims = [];
    const toBall = normalize(ball.x - player.x, ball.y - player.y);
    aims.push(toBall);
    for (const t of targets) {
      const ballToGoal = normalize(t.x - ball.x, t.y - ball.y);
      const gap = ball.r + player.r;
      const contact = {
        x: ball.x - ballToGoal.x * gap * 0.99,
        y: ball.y - ballToGoal.y * gap * 0.99,
      };
      const hit = normalize(contact.x - player.x, contact.y - player.y);
      aims.push(hit);
      // 略偏左右，应对质量差/弹性
      aims.push(rotate(hit, -0.08));
      aims.push(rotate(hit, 0.08));
    }
    return aims;
  }

  function utilityScore(team, pitch, result, player, ball) {
    if (!result) return -1e9;
    // 乌龙极差
    if (result.scorer && result.scorer !== team) return -1e8;

    const goalY = team === "A" ? 0 : pitch.lengthM;
    const midX = pitch.widthM * 0.5;
    const distGoal = Math.hypot(result.ballX - midX, result.ballY - goalY);
    const ownGoalY = team === "A" ? pitch.lengthM : 0;
    const distOwn = Math.hypot(result.ballX - midX, result.ballY - ownGoalY);

    let s = 0;
    if (result.hitBall) s += 40;
    // 球越靠近对方球门越好
    s += Math.max(0, 120 - distGoal);
    // 远离自家门
    s += Math.min(40, distOwn * 0.35);
    // 离球近的人略优先（省力/更稳）
    const dBall = Math.hypot(player.x - ball.x, player.y - ball.y);
    s += Math.max(0, 25 - dBall * 0.8);
    return s;
  }

  /**
   * 极难：仿真搜索；发现得分立即采用（候选按「更可能进」排序）
   */
  function decideHard(ctx) {
    const { bodies, team, pitch, phys, evaluateShot } = ctx;
    if (typeof evaluateShot !== "function") return decideNormal(ctx);

    const ball = bodies.find((b) => b.isBall);
    const mine = bodies.filter((b) => b.team === team && !b.isBall);
    if (!ball || !mine.length) return null;

    const healthy = mine.filter((p) => !(p.injuredTurns > 0));
    const pool = healthy.length ? healthy : mine;
    const targets = goalTargets(team, pitch);
    const powersGeo = [0.62, 0.78, 0.9, 1];
    const powersSweep = [0.55, 0.72, 0.88, 1];

    // 离球近的优先试
    const ordered = pool.slice().sort((a, b) => {
      const da = Math.hypot(a.x - ball.x, a.y - ball.y);
      const db = Math.hypot(b.x - ball.x, b.y - ball.y);
      return da - db;
    });

    const candidates = [];

    function pushCand(player, aim, power, curve, skillArmed, priority) {
      candidates.push({
        player,
        aim,
        power,
        curveSign: curve.curveSign,
        curveRadius: curve.curveRadius,
        skillArmed,
        priority,
      });
    }

    // 1) 几何瞄准（高优先）
    for (const player of ordered) {
      for (const skillArmed of skillOptions(player)) {
        const aims = geometricAims(player, ball, targets);
        const curves = curveVariants(player, phys, skillArmed);
        for (const aim of aims) {
          for (const power of powersGeo) {
            for (const curve of curves) {
              // 直线优先：先试无弧
              const pri = curve.curveSign === 0 ? 0 : 1;
              pushCand(player, aim, power, curve, skillArmed, pri);
            }
          }
        }
      }
    }

    // 2) 绕「朝球」方向密扫（含远角/垫射）
    for (const player of ordered) {
      const base = Math.atan2(ball.y - player.y, ball.x - player.x);
      for (const skillArmed of skillOptions(player)) {
        const curves = curveVariants(player, phys, skillArmed);
        const straight = curves.filter((c) => c.curveSign === 0);
        const curved = curves.filter((c) => c.curveSign !== 0);
        // 先无弧密扫（约 5°），再少量带弧
        for (let i = 0; i < 72; i++) {
          const ang = base + (i / 72) * Math.PI * 2;
          const aim = { x: Math.cos(ang), y: Math.sin(ang) };
          for (const power of powersSweep) {
            for (const curve of straight) {
              pushCand(player, aim, power, curve, skillArmed, 2);
            }
          }
        }
        for (let i = 0; i < 24; i++) {
          const ang = base + (i / 24) * Math.PI * 2;
          const aim = { x: Math.cos(ang), y: Math.sin(ang) };
          for (const power of [0.78, 1]) {
            for (const curve of curved) {
              pushCand(player, aim, power, curve, skillArmed, 3);
            }
          }
        }
      }
    }

    candidates.sort((a, b) => a.priority - b.priority);

    let bestGoal = null;
    let bestGoalSteps = Infinity;
    let bestUtil = null;
    let bestUtilScore = -Infinity;

    // 几何优先；找到进球后可早停。预算防止低端机卡死
    const budget = 1200;
    let evaluated = 0;

    for (const c of candidates) {
      if (evaluated >= budget && bestGoal) break;
      if (evaluated >= budget + 400) break;
      evaluated++;

      const result = evaluateShot({
        playerId: c.player.id,
        aim: c.aim,
        power: c.power,
        curveSign: c.curveSign,
        curveRadius: c.curveRadius,
        skillArmed: c.skillArmed,
      });
      if (!result) continue;

      if (result.scorer === team) {
        // 更短步数 = 更干净的进球；同级取先搜到的高优先
        if (!bestGoal || result.steps < bestGoalSteps) {
          bestGoal = c;
          bestGoalSteps = result.steps;
        }
        // 已找到进球且优先队列前段扫完可早停
        if (c.priority <= 1 && result.steps < 180) break;
        continue;
      }

      const u = utilityScore(team, pitch, result, c.player, ball);
      if (u > bestUtilScore) {
        bestUtilScore = u;
        bestUtil = c;
      }
    }

    // 找到进球后再做一轮局部加密，避免擦柱错过
    if (bestGoal) {
      const refine = [];
      const baseAng = Math.atan2(bestGoal.aim.y, bestGoal.aim.x);
      for (let d = -6; d <= 6; d++) {
        if (d === 0) continue;
        const ang = baseAng + (d * Math.PI) / 180;
        refine.push({
          ...bestGoal,
          aim: { x: Math.cos(ang), y: Math.sin(ang) },
          power: Math.min(1, bestGoal.power + 0.05),
        });
        refine.push({
          ...bestGoal,
          aim: { x: Math.cos(ang), y: Math.sin(ang) },
          power: Math.max(0.4, bestGoal.power - 0.08),
        });
      }
      for (const c of refine) {
        const result = evaluateShot({
          playerId: c.player.id,
          aim: c.aim,
          power: c.power,
          curveSign: c.curveSign,
          curveRadius: c.curveRadius,
          skillArmed: c.skillArmed,
        });
        if (result && result.scorer === team && result.steps < bestGoalSteps) {
          bestGoal = c;
          bestGoalSteps = result.steps;
        }
      }

      return {
        player: bestGoal.player,
        aim: bestGoal.aim,
        power: Math.max(0.2, Math.min(1, bestGoal.power)),
        curveSign: bestGoal.curveSign,
        curveRadius: bestGoal.curveRadius,
        skillArmed: !!bestGoal.skillArmed,
        intent: "hardGoal",
      };
    }

    const pick = bestUtil;
    if (!pick) {
      // 极端兜底：朝球全力
      const player = ordered[0];
      return {
        player,
        aim: normalize(ball.x - player.x, ball.y - player.y),
        power: 0.92,
        curveSign: 0,
        curveRadius: phys.CURVE_R_MAX,
        skillArmed: false,
        intent: "hardFallback",
      };
    }

    return {
      player: pick.player,
      aim: pick.aim,
      power: Math.max(0.2, Math.min(1, pick.power)),
      curveSign: pick.curveSign,
      curveRadius: pick.curveRadius,
      skillArmed: !!pick.skillArmed,
      intent: "hardSetup",
    };
  }

  /**
   * @param {{ bodies: object[], team: "A"|"B", pitch: { widthM:number, lengthM:number }, phys: object }} ctx
   * @returns {{ player: object, aim: {x:number,y:number}, power: number, curveSign: number, curveRadius: number, intent: string }}
   */
  function decideNormal(ctx) {
    const { bodies, team, pitch, phys } = ctx;
    const ball = bodies.find((b) => b.isBall);
    const mine = bodies.filter((b) => b.team === team && !b.isBall);
    const foes = bodies.filter((b) => b.team !== team && !b.isBall);
    if (!ball || !mine.length) return null;

    // 进攻方向：蓝在下攻上(-y)，红在上攻下(+y)
    const attack = team === "A" ? { x: 0, y: -1 } : { x: 0, y: 1 };
    const goalX = pitch.widthM * 0.5;
    const goalY = team === "A" ? 0 : pitch.lengthM;

    // 选人：离球越近权重越高，再掺随机，偶尔故意选远的搅局
    const scored = mine.map((p) => {
      const d = Math.hypot(p.x - ball.x, p.y - ball.y);
      const near = 1 / (0.8 + d);
      const noise = rand(0.15, 1.1);
      return { p, w: near * noise };
    });
    if (Math.random() < 0.18) {
      // 偶尔瞎选一个，制造莫名其妙冲撞
      scored.forEach((s) => {
        s.w = rand(0.3, 1);
      });
    }
    const healthy = scored.filter((s) => !(s.p.injuredTurns > 0));
    const pool = healthy.length ? healthy : scored;
    const player = pickWeighted(scraped(pool));
    if (!player) return null;

    const toBall = normalize(ball.x - player.x, ball.y - player.y);
    const nearestFoe = foes
      .map((f) => ({ f, d: Math.hypot(f.x - player.x, f.y - player.y) }))
      .sort((a, b) => a.d - b.d)[0];
    const toFoe = nearestFoe
      ? normalize(nearestFoe.f.x - player.x, nearestFoe.f.y - player.y)
      : attack;
    const toGoal = normalize(goalX - player.x, goalY - player.y);

    // 意图权重：撞球为主，偶尔撞人 / 朝门乱射 / 完全乱打
    const intent = pickWeighted([
      { v: "smashBall", w: 0.52 },
      { v: "bumpFoe", w: 0.22 },
      { v: "roughShot", w: 0.18 },
      { v: "wild", w: 0.08 },
    ]);

    let aim;
    let power;
    if (intent === "smashBall") {
      // 朝球，夹角噪声很大 → 经常擦到或撞歪
      aim = rotate(toBall, rand(-0.55, 0.55));
      power = rand(0.48, 0.92);
    } else if (intent === "bumpFoe") {
      aim = rotate(toFoe, rand(-0.4, 0.4));
      power = rand(0.55, 0.98);
    } else if (intent === "roughShot") {
      // 「朝门」但噪声夸张，不追求进球线
      const blend = normalize(
        toBall.x * 0.35 + toGoal.x * 0.65,
        toBall.y * 0.35 + toGoal.y * 0.65
      );
      aim = rotate(blend, rand(-0.75, 0.75));
      power = rand(0.62, 1);
    } else {
      aim = rotate(attack, rand(-Math.PI, Math.PI));
      power = rand(0.35, 0.88);
    }

    // 球很近时更爱全力砸，制造混战
    const ballDist = Math.hypot(player.x - ball.x, player.y - ball.y);
    if (ballDist < player.r * 3.2 && Math.random() < 0.55) {
      power = Math.max(power, rand(0.72, 1));
      aim = rotate(toBall, rand(-0.35, 0.35));
    }

    // 弧线：多数直线/轻弯；弧线属性 0 / 禁用时绝不拧
    let curveSign = 0;
    let curveRadius = phys.CURVE_R_MAX;
    const canCurve = !(player.mods && player.mods.curveDisabled) && !player.disableCurveShot;
    if (canCurve) {
      const rMin = player.mods ? player.mods.curveRMin : phys.CURVE_R_MIN;
      const roll = Math.random();
      if (roll < 0.28) {
        curveSign = Math.random() < 0.5 ? -1 : 1;
        curveRadius = rand(rMin + (phys.CURVE_R_MAX - rMin) * 0.35, phys.CURVE_R_MAX * 0.95);
      } else if (roll < 0.4) {
        curveSign = Math.random() < 0.5 ? -1 : 1;
        curveRadius = rand(rMin, rMin + (phys.CURVE_R_MAX - rMin) * 0.45);
      }
    }

    return {
      player,
      aim,
      power: Math.max(0.2, Math.min(1, power)),
      curveSign,
      curveRadius,
      intent,
    };
  }

  function decide(ctx) {
    if (ctx && ctx.difficulty === "hard") return decideHard(ctx);
    return decideNormal(ctx);
  }

  window.FouncyAI = { decide };
})();
