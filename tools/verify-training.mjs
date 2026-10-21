/**
 * 头less：用近似实战物理，对训练关做「极难 AI」式搜索，
 * 检查蓝方能否从开局一击打进上门。
 *
 * 用法：node tools/verify-training.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadWindowScript(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window;
}

const physWin = loadWindowScript("js/data/physics.js");
const playersWin = loadWindowScript("js/data/players.js");
const trainWin = loadWindowScript("js/data/training.js");

const PHYS = physWin.FOUNCY_PHYSICS;
const PITCH = PHYS.PITCH;
const PLAYERS = Object.fromEntries(playersWin.FOUNCY_PLAYERS.map((p) => [p.id, p]));
const LEVELS = trainWin.FOUNCY_TRAINING.levels;

const PLAYER_R = PHYS.PLAYER_R;
const BALL_R = PHYS.BALL_R;
const DRAG = PHYS.DRAG;
const MAX_POWER = PHYS.MAX_POWER;
const MAX_SPEED = PHYS.MAX_SPEED;
const REST = PHYS.REST;
const TURN_SWITCH = PHYS.TURN_SWITCH_SPEED;
const WALL_BOUNCE = PHYS.WALL_BOUNCE;
const BODY_REST = PHYS.BODY_RESTITUTION;
const CURVE_R_MAX = PHYS.CURVE_R_MAX;
const CURVE_R_MIN = PHYS.CURVE_R_MIN;

const SUYA_BITE_SPEED_THRESH = 8;
const SUYA_BITE_BURST = 82;
const BUU_SCALE = 1.25;
const BUU_GROW_SEC = 0.45;

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function rotate(dir, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return normalize(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
}

function steerVelocity(vx, vy, radius, sign, dt) {
  const sp = Math.hypot(vx, vy);
  if (sp < REST || !radius || !sign) return { vx, vy };
  const theta = sign * (sp / radius) * dt;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { vx: vx * c - vy * s, vy: vx * s + vy * c };
}

function goalXRange() {
  const half = PITCH.goalWidthM / 2;
  return { gx0: PITCH.widthM / 2 - half, gx1: PITCH.widthM / 2 + half };
}

function makeBody(def, team, slot, x, y) {
  const stats = {
    power: def.power,
    curve: def.curve,
    grip: def.grip,
    weight: def.weight,
  };
  const mods = PHYS.modsFromStats(stats);
  return {
    id: `${team}${slot + 1}`,
    team,
    skill: def.skill ? { ...def.skill } : null,
    x,
    y,
    vx: 0,
    vy: 0,
    r: PLAYER_R,
    baseR: PLAYER_R,
    mass: mods.mass,
    baseMass: mods.mass,
    isBall: false,
    curveSign: 0,
    curveRadius: 0,
    mods,
    stats,
    energy: 0,
    skillArmed: false,
    buffPower: 0,
    buffCurve: 0,
    buffTurns: 0,
    sizeScale: 1,
    buuActive: false,
    buuGrowing: false,
    buuGrowT: 0,
    disableCurveShot: false,
  };
}

function makeBall(x, y) {
  return {
    id: "ball",
    team: "ball",
    x,
    y,
    vx: 0,
    vy: 0,
    r: BALL_R,
    mass: 0.35,
    isBall: true,
    curveSign: 0,
    curveRadius: 0,
    mods: {
      powerMult: 1,
      dragMult: 0.92,
      mass: 0.35,
      restitutionMult: 1,
      curveRMin: CURVE_R_MAX,
      curveDisabled: true,
    },
  };
}

function cloneBodies(bodies) {
  return bodies.map((b) => ({
    ...b,
    mods: b.mods ? { ...b.mods } : null,
    stats: b.stats ? { ...b.stats } : null,
    skill: b.skill ? { ...b.skill } : null,
    vx: 0,
    vy: 0,
    curveSign: 0,
    curveRadius: 0,
  }));
}

function refreshMods(b) {
  if (!b || b.isBall) return;
  const stats = {
    power: Math.max(0, Math.min(100, (b.stats.power || 50) + (b.buffPower || 0))),
    curve: Math.max(0, Math.min(100, (b.stats.curve || 50) + (b.buffCurve || 0))),
    grip: b.stats.grip,
    weight: b.stats.weight,
  };
  const mods = PHYS.modsFromStats(stats);
  b.mods = mods;
  const scale = b.sizeScale || 1;
  b.baseMass = mods.mass;
  b.mass = mods.mass * scale * scale;
  b.r = (b.baseR || PLAYER_R) * scale;
}

function clearCurve(b) {
  b.curveSign = 0;
  b.curveRadius = 0;
}

function separate(bodies) {
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (dist < 1e-6 || dist >= min) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const push = (min - dist) * 0.55;
        a.x += nx * push;
        a.y += ny * push;
        b.x -= nx * push * 0.35;
        b.y -= ny * push * 0.35;
      }
    }
  }
}

function buildScene(level) {
  const bodies = [];
  level.teamA.forEach((id, i) => {
    const def = PLAYERS[id];
    const spot = level.layout.A[i];
    bodies.push(makeBody(def, "A", i, spot.x, spot.y));
  });
  level.teamB.forEach((id, i) => {
    const def = PLAYERS[id];
    const spot = level.layout.B[i];
    bodies.push(makeBody(def, "B", i, spot.x, spot.y));
  });
  bodies.push(makeBall(level.layout.ball.x, level.layout.ball.y));
  separate(bodies);
  return bodies;
}

function updateBuu(bodies, dt) {
  for (const b of bodies) {
    if (!b.buuGrowing) continue;
    b.buuGrowT = Math.min(1, b.buuGrowT + dt / BUU_GROW_SEC);
    const t = b.buuGrowT;
    const eased = t * t * (3 - 2 * t);
    b.sizeScale = 1 + (BUU_SCALE - 1) * eased;
    refreshMods(b);
    if (t >= 1) b.buuGrowing = false;
  }
}

function integrate(bodies, dt) {
  updateBuu(bodies, dt);
  for (const b of bodies) {
    if (Math.hypot(b.vx, b.vy) > 0) {
      const drag = DRAG * (b.mods ? b.mods.dragMult : 1);
      const damp = Math.exp(-drag * dt);
      b.vx *= damp;
      b.vy *= damp;
    }
    if (Math.hypot(b.vx, b.vy) < REST) {
      b.vx = 0;
      b.vy = 0;
      clearCurve(b);
    }
    if (b.curveSign && b.curveRadius > 0 && Math.hypot(b.vx, b.vy) >= REST) {
      const steered = steerVelocity(b.vx, b.vy, b.curveRadius, b.curveSign, dt);
      b.vx = steered.vx;
      b.vy = steered.vy;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const cap = Math.hypot(b.vx, b.vy);
    if (cap > MAX_SPEED) {
      b.vx = (b.vx / cap) * MAX_SPEED;
      b.vy = (b.vy / cap) * MAX_SPEED;
    }
  }
}

function hitPost(b, px, py) {
  const pr = 0.7;
  const dx = b.x - px;
  const dy = b.y - py;
  const dist = Math.hypot(dx, dy);
  const min = b.r + pr;
  if (dist > 0 && dist < min) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = min - dist;
    b.x += nx * overlap;
    b.y += ny * overlap;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + WALL_BOUNCE) * vn * nx;
      b.vy -= (1 + WALL_BOUNCE) * vn * ny;
      clearCurve(b);
    }
  }
}

function collideGoalPocket(b, gx0, gx1, lineY, backY, isTop) {
  const inPocket = isTop
    ? b.y < lineY && b.y > backY - b.r
    : b.y > lineY && b.y < backY + b.r;
  if (!inPocket) return;
  if (b.x - b.r < gx0) {
    b.x = gx0 + b.r;
    b.vx = Math.abs(b.vx) * WALL_BOUNCE;
    clearCurve(b);
  } else if (b.x + b.r > gx1) {
    b.x = gx1 - b.r;
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
    clearCurve(b);
  }
  if (isTop && b.y - b.r < backY) {
    b.y = backY + b.r;
    b.vy = Math.abs(b.vy) * WALL_BOUNCE;
    clearCurve(b);
  } else if (!isTop && b.y + b.r > backY) {
    b.y = backY - b.r;
    b.vy = -Math.abs(b.vy) * WALL_BOUNCE;
    clearCurve(b);
  }
}

function collideWalls(bodies) {
  const W = PITCH.widthM;
  const L = PITCH.lengthM;
  const D = PITCH.goalDepthM;
  const { gx0, gx1 } = goalXRange();
  for (const b of bodies) {
    if (b.y >= 0 && b.y <= L) {
      if (b.x - b.r < 0) {
        b.x = b.r;
        b.vx = Math.abs(b.vx) * WALL_BOUNCE;
        clearCurve(b);
      } else if (b.x + b.r > W) {
        b.x = W - b.r;
        b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
        clearCurve(b);
      }
    }
    const inGoalX = b.x > gx0 && b.x < gx1;
    if (!inGoalX && b.y - b.r < 0) {
      b.y = b.r;
      b.vy = Math.abs(b.vy) * WALL_BOUNCE;
      clearCurve(b);
    } else if (!inGoalX && b.y + b.r > L) {
      b.y = L - b.r;
      b.vy = -Math.abs(b.vy) * WALL_BOUNCE;
      clearCurve(b);
    }
    collideGoalPocket(b, gx0, gx1, 0, -D, true);
    collideGoalPocket(b, gx0, gx1, L, L + D, false);
    hitPost(b, gx0, 0);
    hitPost(b, gx1, 0);
    hitPost(b, gx0, L);
    hitPost(b, gx1, L);
  }
}

function collideBodies(bodies, shotCtx) {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (dist === 0 || dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = min - dist;
      const inv = 1 / a.mass + 1 / b.mass;
      const corr = overlap / inv;
      a.x -= (nx * corr) / a.mass;
      a.y -= (ny * corr) / a.mass;
      b.x += (nx * corr) / b.mass;
      b.y += (ny * corr) / b.mass;
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velN = rvx * nx + rvy * ny;
      if (velN > 0) continue;
      const eA = a.mods ? a.mods.restitutionMult : 1;
      const eB = b.mods ? b.mods.restitutionMult : 1;
      const e = Math.max(0.55, Math.min(0.98, BODY_REST * 0.5 * (eA + eB)));
      const jImp = (-(1 + e) * velN) / inv;
      a.vx -= (jImp * nx) / a.mass;
      a.vy -= (jImp * ny) / a.mass;
      b.vx += (jImp * nx) / b.mass;
      b.vy += (jImp * ny) / b.mass;
      clearCurve(a);
      clearCurve(b);
      if (a.isBall && !b.isBall && shotCtx && shotCtx.shooter === b) shotCtx.hitBall = true;
      if (b.isBall && !a.isBall && shotCtx && shotCtx.shooter === a) shotCtx.hitBall = true;
      // 苏牙二段
      const shooter = shotCtx && shotCtx.shooter;
      if (
        shotCtx &&
        shotCtx.skillId === "box_hunter" &&
        !shotCtx.suyaBiteDone &&
        !shotCtx.suyaBitePending
      ) {
        if ((a.isBall && b === shooter) || (b.isBall && a === shooter)) {
          shotCtx.suyaBitePending = true;
        }
      }
    }
  }
}

function checkGoal(bodies) {
  const b = bodies.find((x) => x.isBall);
  const L = PITCH.lengthM;
  const { gx0, gx1 } = goalXRange();
  if (b.y + b.r < 0 && b.x - b.r > gx0 && b.x + b.r < gx1) return "A";
  if (b.y - b.r > L && b.x - b.r > gx0 && b.x + b.r < gx1) return "B";
  return null;
}

function tickSuya(shotCtx) {
  if (!shotCtx || shotCtx.suyaBiteDone) return;
  const p = shotCtx.shooter;
  if (!p) return;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp >= REST) shotCtx.suyaLastDir = { x: p.vx / sp, y: p.vy / sp };
  if (!shotCtx.suyaBitePending) return;
  if (sp >= SUYA_BITE_SPEED_THRESH) return;
  const dir = shotCtx.suyaLastDir;
  if (!dir) return;
  p.vx = dir.x * SUYA_BITE_BURST;
  p.vy = dir.y * SUYA_BITE_BURST;
  clearCurve(p);
  shotCtx.suyaBitePending = false;
  shotCtx.suyaBiteDone = true;
}

function applySkill(p, skillArmed) {
  if (!skillArmed || !p.skill) {
    p.disableCurveShot = false;
    return null;
  }
  const sid = p.skill.id;
  if (sid === "dragon_glide") {
    p.buffPower = 20;
    p.buffCurve = 20;
    refreshMods(p);
  } else if (sid === "tempo_arc") {
    p.buffCurve = 20;
    refreshMods(p);
  } else if (sid === "buu_form") {
    p.buffPower = 20;
    p.buuActive = true;
    p.buuGrowing = true;
    p.buuGrowT = 0;
    p.disableCurveShot = true;
    refreshMods(p);
  } else {
    p.disableCurveShot = false;
  }
  return sid;
}

function canCurve(p) {
  if (!p || p.isBall || p.disableCurveShot) return false;
  if (p.mods && p.mods.curveDisabled) return false;
  return true;
}

function evaluateShot(baseBodies, opts) {
  const bodies = cloneBodies(baseBodies);
  separate(bodies);
  const p = bodies.find((b) => b.id === opts.playerId);
  if (!p || p.isBall) return null;

  const skillId = applySkill(p, opts.skillArmed);
  refreshMods(p);
  const shotCtx = {
    shooter: p,
    skillId,
    hitBall: false,
    suyaBitePending: false,
    suyaBiteDone: false,
    suyaLastDir: null,
  };

  const aim = normalize(opts.aim.x, opts.aim.y);
  const mult = p.mods ? p.mods.powerMult : 1;
  const spd = opts.power * MAX_POWER * mult;
  p.vx = aim.x * spd;
  p.vy = aim.y * spd;

  if (canCurve(p) && opts.curveSign && opts.curveRadius > 0) {
    const rMin =
      p.mods && p.mods.curveRMin != null
        ? Math.max(CURVE_R_MIN, p.mods.curveRMin)
        : CURVE_R_MIN;
    p.curveSign = opts.curveSign;
    p.curveRadius = Math.max(rMin, opts.curveRadius);
  } else {
    clearCurve(p);
  }

  const STEP = 1 / 60;
  const maxSteps = 60 * 9;
  let scorer = null;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    integrate(bodies, STEP);
    collideBodies(bodies, shotCtx);
    collideWalls(bodies);
    tickSuya(shotCtx);
    scorer = checkGoal(bodies);
    if (scorer) break;
    const suyaWaiting = shotCtx.suyaBitePending && !shotCtx.suyaBiteDone;
    const allSlow = bodies.every((b) => Math.hypot(b.vx, b.vy) < TURN_SWITCH);
    if (allSlow && !suyaWaiting) break;
  }
  return { scorer, steps, hitBall: shotCtx.hitBall };
}

function curveVariants(player, skillArmed) {
  const out = [{ curveSign: 0, curveRadius: CURVE_R_MAX }];
  if (!canCurve(player) || (skillArmed && player.skill && player.skill.id === "buu_form")) {
    return out;
  }
  const rMin = player.mods ? player.mods.curveRMin : CURVE_R_MIN;
  const mid = rMin + (CURVE_R_MAX - rMin) * 0.45;
  out.push(
    { curveSign: -1, curveRadius: mid },
    { curveSign: 1, curveRadius: mid },
    { curveSign: -1, curveRadius: rMin },
    { curveSign: 1, curveRadius: rMin }
  );
  return out;
}

function searchWithPlayers(bodies, ball, players, budget) {
  const mid = PITCH.widthM * 0.5;
  const half = PITCH.goalWidthM / 2;
  const targets = [
    { x: mid - half * 0.72, y: 0 },
    { x: mid, y: 0 },
    { x: mid + half * 0.72, y: 0 },
  ];

  const candidates = [];
  for (const player of players) {
    for (const skillArmed of [false]) {
      for (const t of targets) {
        const ballToGoal = normalize(t.x - ball.x, t.y - ball.y);
        const gap = ball.r + player.r;
        const contact = {
          x: ball.x - ballToGoal.x * gap * 0.99,
          y: ball.y - ballToGoal.y * gap * 0.99,
        };
        const hit = normalize(contact.x - player.x, contact.y - player.y);
        const aims = [
          hit,
          rotate(hit, -0.08),
          rotate(hit, 0.08),
          normalize(ball.x - player.x, ball.y - player.y),
        ];
        for (const aim of aims) {
          for (const power of [0.55, 0.7, 0.85, 1]) {
            for (const curve of curveVariants(player, skillArmed)) {
              candidates.push({
                player,
                aim,
                power,
                curve,
                skillArmed,
                pri: curve.curveSign ? 1 : 0,
              });
            }
          }
        }
      }
      const base = Math.atan2(ball.y - player.y, ball.x - player.x);
      const curves = curveVariants(player, skillArmed);
      const straight = curves.filter((c) => !c.curveSign);
      const curved = curves.filter((c) => c.curveSign);
      for (let i = 0; i < 72; i++) {
        const ang = base + (i / 72) * Math.PI * 2;
        const aim = { x: Math.cos(ang), y: Math.sin(ang) };
        for (const power of [0.55, 0.72, 0.88, 1]) {
          for (const curve of straight) {
            candidates.push({ player, aim, power, curve, skillArmed, pri: 2 });
          }
        }
      }
      for (let i = 0; i < 36; i++) {
        const ang = base + (i / 36) * Math.PI * 2;
        const aim = { x: Math.cos(ang), y: Math.sin(ang) };
        for (const power of [0.78, 1]) {
          for (const curve of curved) {
            candidates.push({ player, aim, power, curve, skillArmed, pri: 3 });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => a.pri - b.pri);
  let evaluated = 0;
  let best = null;

  for (const c of candidates) {
    if (evaluated >= budget && best) break;
    if (evaluated >= budget + 400) break;
    evaluated++;
    const r = evaluateShot(bodies, {
      playerId: c.player.id,
      aim: c.aim,
      power: c.power,
      curveSign: c.curve.curveSign,
      curveRadius: c.curve.curveRadius,
      skillArmed: c.skillArmed,
    });
    if (r && r.scorer === "A") {
      if (!best || r.steps < best.steps) {
        best = {
          steps: r.steps,
          player: c.player.id,
          power: c.power,
          curve: c.curve.curveSign,
          evaluated,
        };
      }
      if (c.pri <= 1 && r.steps < 200) break;
    }
  }
  return { ok: !!best, best, evaluated };
}

function searchLevel(level) {
  const bodies = buildScene(level);
  const ball = bodies.find((b) => b.isBall);
  const mine = bodies.filter((b) => b.team === "A" && !b.isBall);
  const ordered = mine.slice().sort((a, b) => {
    return (
      Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y)
    );
  });

  const any = searchWithPlayers(bodies, ball, ordered, 1600);
  const nearest = searchWithPlayers(bodies, ball, [ordered[0]], 2000);
  return { any, nearest, nearestId: ordered[0].id, bodies };
}

const results = [];
for (const lv of LEVELS) {
  const t0 = Date.now();
  const r = searchLevel(lv);
  const ms = Date.now() - t0;
  const okAny = r.any.ok;
  const okNear = r.nearest.ok;
  results.push({
    id: lv.id,
    diff: lv.diff,
    name: lv.name,
    okAny,
    okNear,
    any: r.any.best,
    near: r.nearest.best,
    nearestId: r.nearestId,
    ms,
  });
  const mark = !okAny ? "FAIL" : !okNear ? "WEAK" : "OK";
  const anyDetail = okAny
    ? `any=${r.any.best.player}/p${r.any.best.power}/c${r.any.best.curve}/s${r.any.best.steps}`
    : "any=NONE";
  const nearDetail = okNear
    ? `near=${r.nearestId}/p${r.nearest.best.power}/c${r.nearest.best.curve}/s${r.nearest.best.steps}`
    : `near=${r.nearestId}/NONE`;
  console.log(`[${mark}] ${lv.diff}/${lv.id} ${lv.name} (${ms}ms) ${anyDetail} | ${nearDetail}`);
}

const fails = results.filter((r) => !r.okAny);
const weaks = results.filter((r) => r.okAny && !r.okNear);
console.log("\n--- summary ---");
console.log(`any-player pass ${results.length - fails.length}/${results.length}`);
console.log(`nearest-player pass ${results.length - fails.length - weaks.length}/${results.length}`);
if (fails.length) {
  console.log("UNSOLVABLE:", fails.map((f) => f.id).join(", "));
  process.exitCode = 1;
}
if (weaks.length) {
  console.log("NEAREST-FAIL (野解 only):", weaks.map((f) => f.id).join(", "));
  process.exitCode = 1;
}
