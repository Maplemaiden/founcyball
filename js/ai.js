/**
 * 人机决策：
 * - normal：像人——简单球短列表验票（能进必进），复杂球按意图少量采样抽签
 * - hard：用真实物理静默仿真广搜；能进必进（破解级，训练/极难用）
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

  /** 普通人机默认风格（偏均衡略攻；以后 Persona 可换这张表） */
  const NORMAL_STYLE = {
    shootHunger: 0.5,
    clearHunger: 0.4,
    foulHunger: 0.28,
    curveBias: 0.32,
    riskTemp: 14,
    skillGreed: 0.38,
  };

  /** 进球路线弹射 ≤ 该值才算「干净简单球」（墙也计；>1 则非简单） */
  const MAX_CLEAN_BOUNCES = 1;
  /** 探针里干净进球占比达此线 → 走简单球必进逻辑 */
  const CLEAN_APERTURE_MIN = 0.12;
  /** 多弹射进球：仍可能尝试，但常偏移失手 */
  const BANK_ATTEMPT_P = 0.4;
  const BANK_OFFSET_P = 0.62;

  function packShot(player, aim, power, curveSign, curveRadius, skillArmed, intent) {
    return {
      player,
      aim,
      power: Math.max(0.2, Math.min(1, power)),
      curveSign: curveSign || 0,
      curveRadius: curveRadius,
      skillArmed: !!skillArmed,
      intent: intent || "human",
    };
  }

  function shotBounces(result) {
    if (!result) return 99;
    if (typeof result.bounces === "number") return result.bounces;
    const walls = result.wallHits || 0;
    const bp = result.ballPlayerHits || 0;
    return walls + Math.max(0, bp - 1);
  }

  function isCleanGoal(result, team) {
    return !!(result && result.scorer === team && shotBounces(result) <= MAX_CLEAN_BOUNCES);
  }

  /** 出手角度偏移（多弹射球失手用；不重新验进） */
  function offsetAimPower(aim, power, degLo, degHi) {
    const base = Math.atan2(aim.y, aim.x);
    const deg = rand(degLo, degHi) * (Math.random() < 0.5 ? -1 : 1);
    const ang = base + (deg * Math.PI) / 180;
    return {
      aim: { x: Math.cos(ang), y: Math.sin(ang) },
      power: Math.max(0.25, Math.min(1, power * rand(0.82, 1.06))),
    };
  }

  /**
   * 人选权重（不像极难死磕离球最近）：
   * - 距离只做软衰减
   * - 中圈/开球附近：明显偏向两侧球员（防守习惯，也更像人）
   * - 身位在球「身后」（利于朝门推）加分
   * - 整体仍偏进攻（前锋略加；己半场后卫只是略抬，不强行清场）
   */
  function humanPickWeight(p, ball, team, pitch) {
    if (!p || !ball) return 0.01;
    const W = pitch.widthM || 68;
    const L = pitch.lengthM || 105;
    const midX = W * 0.5;
    const midY = L * 0.5;
    const dBall = Math.hypot(p.x - ball.x, p.y - ball.y);
    // 软距离：远一点仍常被点到，不会只剩最近那人
    let w = 1 / (1.35 + dBall * 0.055);

    const ballFromCenter = Math.hypot(ball.x - midX, ball.y - midY);
    const kickoffish = ballFromCenter < L * 0.14;
    const sideNess = Math.min(1, Math.abs(p.x - midX) / (W * 0.42));
    if (kickoffish) {
      // 开球：两侧远高于中路
      w *= 0.42 + sideNess * 1.35;
    } else if (ballFromCenter < L * 0.28) {
      w *= 0.7 + sideNess * 0.55;
    }

    // 身位：站在进攻方向后方更容易「人先点到的」
    const behind =
      team === "A" ? p.y >= ball.y - 1.5 : p.y <= ball.y + 1.5;
    w *= behind ? 1.28 : 0.72;

    const ownHalf =
      team === "A" ? ball.y >= midY : ball.y <= midY;
    const lane = p.lane || "mid";
    if (lane === "fwd") w *= ownHalf ? 0.95 : 1.18;
    else if (lane === "def") w *= ownHalf ? 1.12 : 0.88;
    else w *= 1.02;

    // 与球同侧边路略加（边路回追/边路开球）
    if ((p.x - midX) * (ball.x - midX) > 0) w *= 1.08;

    w *= rand(0.78, 1.22);
    return Math.max(0.02, w);
  }

  /** 按人感权重排序，取前 n 名（带噪声，非稳定最近） */
  function rankPlayersHuman(pool, ball, team, pitch, n) {
    const scored = (pool || []).map((p) => ({
      p,
      w: humanPickWeight(p, ball, team, pitch),
    }));
    scored.sort((a, b) => b.w - a.w);
    const k = Math.max(1, Math.min(n || 2, scored.length));
    return scored.slice(0, k).map((s) => s.p);
  }

  function pickPlayerHuman(pool, ball, team, pitch) {
    const items = (pool || []).map((p) => ({
      v: p,
      w: humanPickWeight(p, ball, team, pitch),
    }));
    if (!items.length) return null;
    return pickWeighted(items);
  }

  /**
   * 轻量探针：用人感首选球员 + 几何瞄准扇面，估「干净进球」角度占比。
   * 不做极难级全图密扫；约 30～40 次仿真，手机可接受。
   */
  function probeCleanAperture(ctx, pool, ball) {
    const { team, pitch, phys, evaluateShot } = ctx;
    const ranked = rankPlayersHuman(pool, ball, team, pitch, 2);
    const player = ranked[0];
    if (!player) return { cleanRatio: 0, tested: 0, clean: 0 };

    const targets = goalTargets(team, pitch);
    const baseAims = geometricAims(player, ball, targets);
    const aims = [];
    for (const a of baseAims) {
      aims.push(a);
      for (const d of [-10, -5, 5, 10]) {
        aims.push(rotate(a, (d * Math.PI) / 180));
      }
    }
    const powers = [0.85, 1];
    let tested = 0;
    let clean = 0;
    const seen = new Set();
    for (const aim of aims) {
      const key = `${aim.x.toFixed(3)},${aim.y.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const power of powers) {
        tested++;
        const result = evaluateShot({
          playerId: player.id,
          aim,
          power,
          curveSign: 0,
          curveRadius: phys.CURVE_R_MAX,
          skillArmed: false,
        });
        if (isCleanGoal(result, team)) clean++;
      }
    }
    return {
      cleanRatio: tested > 0 ? clean / tested : 0,
      tested,
      clean,
      player,
    };
  }

  function softmaxPick(scored, temp) {
    if (!scored.length) return null;
    const t = Math.max(0.5, temp || 10);
    let maxS = -Infinity;
    for (const it of scored) if (it.s > maxS) maxS = it.s;
    let sum = 0;
    const weights = scored.map((it) => {
      const w = Math.exp((it.s - maxS) / t);
      sum += w;
      return w;
    });
    let r = Math.random() * sum;
    for (let i = 0; i < scored.length; i++) {
      r -= weights[i];
      if (r <= 0) return scored[i].v;
    }
    return scored[scored.length - 1].v;
  }

  function lightCurves(player, phys, skillArmed, bias) {
    const out = [{ curveSign: 0, curveRadius: phys.CURVE_R_MAX }];
    if (!canUseCurve(player, phys, skillArmed) || bias <= 0) return out;
    if (Math.random() > bias) return out;
    const rMin = player.mods ? player.mods.curveRMin : phys.CURVE_R_MIN;
    const mid = rMin + (phys.CURVE_R_MAX - rMin) * 0.5;
    out.push(
      { curveSign: -1, curveRadius: mid },
      { curveSign: 1, curveRadius: mid }
    );
    return out;
  }

  function humanSkillOpts(player, greed) {
    const opts = [false];
    if (player.energy >= 1 && player.skill && Math.random() < greed) opts.push(true);
    return opts;
  }

  /**
   * 简单球：只对「弹射≤1」的干净进球必进；多弹射进球可碰运气但常偏移
   */
  function decideSimpleHuman(ctx, style, pool, ball) {
    const { team, pitch, phys, evaluateShot } = ctx;
    const targets = goalTargets(team, pitch);
    // 验 2～3 个「人会点」的人选，而不是离球最近两人
    const near = rankPlayersHuman(pool, ball, team, pitch, Math.min(3, pool.length));

    const powers = [0.72, 0.88, 1];
    let bestClean = null;
    let bestCleanSteps = Infinity;
    let bestBank = null;
    let bestBankSteps = Infinity;
    let bestUtil = null;
    let bestUtilScore = -Infinity;
    let evaluated = 0;
    const budget = 96;

    for (const player of near) {
      for (const skillArmed of humanSkillOpts(player, style.skillGreed * 0.85)) {
        const aims = geometricAims(player, ball, targets);
        // 简单球默认直线；低概率带一点弧（弧进球若弹射多会进 bank）
        const curves = lightCurves(player, phys, skillArmed, style.curveBias * 0.25);
        for (const aim of aims) {
          for (const power of powers) {
            for (const curve of curves) {
              if (evaluated >= budget) break;
              evaluated++;
              const result = evaluateShot({
                playerId: player.id,
                aim,
                power,
                curveSign: curve.curveSign,
                curveRadius: curve.curveRadius,
                skillArmed,
              });
              if (!result) continue;
              if (result.scorer === team) {
                const bounces = shotBounces(result);
                const cand = { player, aim, power, curve, skillArmed, bounces };
                if (bounces <= MAX_CLEAN_BOUNCES) {
                  if (!bestClean || result.steps < bestCleanSteps) {
                    bestClean = cand;
                    bestCleanSteps = result.steps;
                  }
                } else if (!bestBank || result.steps < bestBankSteps) {
                  bestBank = cand;
                  bestBankSteps = result.steps;
                }
                continue;
              }
              const u = utilityScore(team, pitch, result, player, ball);
              if (u > bestUtilScore) {
                bestUtilScore = u;
                bestUtil = { player, aim, power, curve, skillArmed };
              }
            }
          }
        }
      }
    }

    // 干净进球：微调仍须保持干净进球
    if (bestClean) {
      const base = bestClean;
      const baseAng = Math.atan2(base.aim.y, base.aim.x);
      for (const d of [-3, -2, 2, 3]) {
        const ang = baseAng + (d * Math.PI) / 180;
        const aim = { x: Math.cos(ang), y: Math.sin(ang) };
        for (const dp of [-0.06, 0.05]) {
          const power = Math.max(0.4, Math.min(1, base.power + dp));
          const result = evaluateShot({
            playerId: base.player.id,
            aim,
            power,
            curveSign: base.curve.curveSign,
            curveRadius: base.curve.curveRadius,
            skillArmed: base.skillArmed,
          });
          if (
            isCleanGoal(result, team) &&
            result.steps < bestCleanSteps
          ) {
            bestClean = {
              player: base.player,
              aim,
              power,
              curve: base.curve,
              skillArmed: base.skillArmed,
              bounces: shotBounces(result),
            };
            bestCleanSteps = result.steps;
          }
        }
      }
      return packShot(
        bestClean.player,
        bestClean.aim,
        bestClean.power,
        bestClean.curve.curveSign,
        bestClean.curve.curveRadius,
        bestClean.skillArmed,
        "simpleGoal"
      );
    }

    // 只有多弹射进球：一定概率尝试，且常偏移失手
    if (bestBank && Math.random() < BANK_ATTEMPT_P) {
      if (Math.random() < BANK_OFFSET_P) {
        const off = offsetAimPower(bestBank.aim, bestBank.power, 6, 16);
        return packShot(
          bestBank.player,
          off.aim,
          off.power,
          bestBank.curve.curveSign,
          bestBank.curve.curveRadius,
          bestBank.skillArmed,
          "bankOffset"
        );
      }
      return packShot(
        bestBank.player,
        bestBank.aim,
        bestBank.power,
        bestBank.curve.curveSign,
        bestBank.curve.curveRadius,
        bestBank.skillArmed,
        "bankLucky"
      );
    }

    if (bestUtil) {
      return packShot(
        bestUtil.player,
        bestUtil.aim,
        bestUtil.power,
        bestUtil.curve.curveSign,
        bestUtil.curve.curveRadius,
        bestUtil.skillArmed,
        "simpleSetup"
      );
    }

    const p = near[0];
    return packShot(
      p,
      normalize(ball.x - p.x, ball.y - p.y),
      0.85,
      0,
      phys.CURVE_R_MAX,
      false,
      "simpleFallback"
    );
  }

  /**
   * 复杂球：按意图少量带噪样本 → 仿真打分 → 温度抽签（不广搜、不加密进球）
   */
  function decideComplexHuman(ctx, style, pool, ball, foes) {
    const { team, pitch, phys, evaluateShot } = ctx;
    const attack = team === "A" ? { x: 0, y: -1 } : { x: 0, y: 1 };
    const midX = pitch.widthM * 0.5;
    const player = pickPlayerHuman(pool, ball, team, pitch) || pool[0];
    const toBall = normalize(ball.x - player.x, ball.y - player.y);
    const nearestFoe = foes
      .map((f) => ({ f, d: Math.hypot(f.x - ball.x, f.y - ball.y) }))
      .sort((a, b) => a.d - b.d)[0];
    const side = ball.x < midX ? -1 : 1;

    const intent = pickWeighted([
      { v: "clear", w: 0.22 + style.clearHunger * 0.55 },
      { v: "bumpFoe", w: 0.12 + style.foulHunger * 0.5 },
      { v: "gambleShot", w: 0.18 + style.shootHunger * 0.45 },
      { v: "softTouch", w: 0.2 },
      { v: "curveGamble", w: 0.08 + style.curveBias * 0.35 },
    ]);

    const skillArmed =
      player.energy >= 1 && player.skill && Math.random() < style.skillGreed * 0.7;
    const samples = [];

    function addSample(aim, power, curveSign, curveRadius, tag) {
      samples.push({
        player,
        aim: normalize(aim.x, aim.y),
        power: Math.max(0.25, Math.min(1, power)),
        curveSign: curveSign || 0,
        curveRadius: curveRadius || phys.CURVE_R_MAX,
        skillArmed,
        tag,
      });
    }

    if (intent === "clear") {
      // 大脚解围：球往边线 + 进攻方向推，远离自家门
      for (let i = 0; i < 5; i++) {
        const clearDir = normalize(side * rand(0.55, 1.2), attack.y * rand(0.45, 1.1));
        const gap = ball.r + player.r;
        const contact = {
          x: ball.x - clearDir.x * gap * 0.98,
          y: ball.y - clearDir.y * gap * 0.98,
        };
        addSample(
          rotate(normalize(contact.x - player.x, contact.y - player.y), rand(-0.2, 0.2)),
          rand(0.75, 1),
          0,
          phys.CURVE_R_MAX,
          "clear"
        );
      }
    } else if (intent === "bumpFoe" && nearestFoe) {
      for (let i = 0; i < 4; i++) {
        addSample(
          rotate(
            normalize(nearestFoe.f.x - player.x, nearestFoe.f.y - player.y),
            rand(-0.25, 0.25)
          ),
          rand(0.65, 1),
          0,
          phys.CURVE_R_MAX,
          "bump"
        );
      }
    } else if (intent === "softTouch") {
      for (let i = 0; i < 5; i++) {
        const push = normalize(
          toBall.x * 0.55 + attack.x * 0.2 + rand(-0.35, 0.35),
          toBall.y * 0.55 + attack.y * 0.45 + rand(-0.25, 0.25)
        );
        addSample(rotate(push, rand(-0.3, 0.3)), rand(0.35, 0.62), 0, phys.CURVE_R_MAX, "soft");
      }
    } else if (intent === "curveGamble" && canUseCurve(player, phys, skillArmed)) {
      const targets = goalTargets(team, pitch);
      const aims = geometricAims(player, ball, targets);
      const rMin = player.mods ? player.mods.curveRMin : phys.CURVE_R_MIN;
      const mid = rMin + (phys.CURVE_R_MAX - rMin) * rand(0.25, 0.65);
      for (let i = 0; i < 6; i++) {
        const aim = rotate(aims[i % aims.length], rand(-0.22, 0.22));
        addSample(aim, rand(0.7, 1), Math.random() < 0.5 ? -1 : 1, mid, "curve");
      }
    } else {
      // gambleShot：朝门几何 + 明显噪声，少量样本碰运气
      const targets = goalTargets(team, pitch);
      const aims = geometricAims(player, ball, targets);
      for (let i = 0; i < 7; i++) {
        const aim = rotate(aims[i % aims.length], rand(-0.28, 0.28));
        addSample(aim, rand(0.68, 1), 0, phys.CURVE_R_MAX, "gamble");
      }
    }

    const scored = [];
    for (const s of samples) {
      const result = evaluateShot({
        playerId: s.player.id,
        aim: s.aim,
        power: s.power,
        curveSign: s.curveSign,
        curveRadius: s.curveRadius,
        skillArmed: s.skillArmed,
      });
      if (!result) continue;
      // 乌龙样本直接丢掉
      if (result.scorer && result.scorer !== team) continue;
      let u = utilityScore(team, pitch, result, s.player, ball);
      // 偶然进球加权；多弹射进球权重明显更低（碰运气）
      if (result.scorer === team) {
        const bounces = shotBounces(result);
        u += bounces <= MAX_CLEAN_BOUNCES ? 160 : 55;
        s._bounces = bounces;
        s._scored = true;
      }
      if (s.tag === "clear") u += style.clearHunger * 12;
      if (s.tag === "bump") u += style.foulHunger * 10;
      scored.push({ v: s, s: u });
    }

    const pick = softmaxPick(scored, style.riskTemp);
    if (pick) {
      // 复杂局面抽到多弹射进球：常偏移失手
      if (pick._scored && (pick._bounces || 0) > MAX_CLEAN_BOUNCES && Math.random() < BANK_OFFSET_P) {
        const off = offsetAimPower(pick.aim, pick.power, 7, 18);
        return packShot(
          pick.player,
          off.aim,
          off.power,
          pick.curveSign,
          pick.curveRadius,
          pick.skillArmed,
          "complex:bankOffset"
        );
      }
      return packShot(
        pick.player,
        pick.aim,
        pick.power,
        pick.curveSign,
        pick.curveRadius,
        pick.skillArmed,
        "complex:" + (pick.tag || intent)
      );
    }

    return packShot(
      player,
      toBall,
      0.8,
      0,
      phys.CURVE_R_MAX,
      false,
      "complexFallback"
    );
  }

  /**
   * 无仿真时的弱兜底（不应常见）
   */
  function decideNormalBlind(ctx) {
    const { bodies, team, pitch, phys } = ctx;
    const ball = bodies.find((b) => b.isBall);
    const mine = bodies.filter((b) => b.team === team && !b.isBall && !(b.injuredTurns > 0));
    const pool = mine.length ? mine : bodies.filter((b) => b.team === team && !b.isBall);
    if (!ball || !pool.length) return null;
    const player = pickPlayerHuman(pool, ball, team, pitch) || pool[0];
    const targets = goalTargets(team, pitch);
    const aims = geometricAims(player, ball, targets);
    return packShot(player, aims[1] || aims[0], 0.88, 0, phys.CURVE_R_MAX, false, "blind");
  }

  /**
   * @param {{ bodies: object[], team: "A"|"B", pitch: { widthM:number, lengthM:number }, phys: object, evaluateShot?: Function }} ctx
   */
  function decideNormal(ctx) {
    const { bodies, team, pitch, evaluateShot } = ctx;
    const ball = bodies.find((b) => b.isBall);
    const mine = bodies.filter((b) => b.team === team && !b.isBall);
    const foes = bodies.filter((b) => b.team !== team && !b.isBall);
    if (!ball || !mine.length) return null;

    if (typeof evaluateShot !== "function") return decideNormalBlind(ctx);

    const healthy = mine.filter((p) => !(p.injuredTurns > 0));
    const pool = healthy.length ? healthy : mine;
    const style = NORMAL_STYLE;

    // 用「干净进球角度占比」判简单球（比纯几何清晰度靠谱；探针很轻）
    const probe = probeCleanAperture(ctx, pool, ball);
    const apertureCut =
      CLEAN_APERTURE_MIN - (style.shootHunger - 0.5) * 0.06;

    if (probe.cleanRatio >= apertureCut) {
      return decideSimpleHuman(ctx, style, pool, ball);
    }
    return decideComplexHuman(ctx, style, pool, ball, foes);
  }

  function decide(ctx) {
    if (ctx && ctx.difficulty === "hard") return decideHard(ctx);
    return decideNormal(ctx);
  }

  window.FouncyAI = { decide };
})();
