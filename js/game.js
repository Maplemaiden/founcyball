(() => {
  "use strict";

  const PHYS = window.FOUNCY_PHYSICS;
  const PITCH = PHYS.PITCH;
  const WIN_SCORE = PHYS.WIN_SCORE;
  const PLAYER_R = PHYS.PLAYER_R;
  const BALL_R = PHYS.BALL_R;
  const DRAG = PHYS.DRAG;
  const MAX_POWER = PHYS.MAX_POWER;
  const MAX_SPEED = PHYS.MAX_SPEED;
  const REST = PHYS.REST;
  const TURN_SWITCH_SPEED = PHYS.TURN_SWITCH_SPEED;
  const WALL_BOUNCE = PHYS.WALL_BOUNCE;
  const BODY_RESTITUTION = PHYS.BODY_RESTITUTION;
  const MAX_PULL_PX = PHYS.MAX_PULL_PX;
  const MIN_PULL_PX = PHYS.MIN_PULL_PX;
  const TRAIL_STEPS = PHYS.TRAIL_STEPS;
  const CURVE_R_MAX = PHYS.CURVE_R_MAX;
  const CURVE_R_MIN = PHYS.CURVE_R_MIN;
  const CURVE_KEY_TIME = PHYS.CURVE_KEY_TIME;
  const SPIN_VISUAL = PHYS.SPIN_VISUAL != null ? PHYS.SPIN_VISUAL : 0.28;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const el = {
    scoreA: document.getElementById("scoreA"),
    scoreB: document.getElementById("scoreB"),
    phase: document.getElementById("phase"),
    btnRestart: document.getElementById("btnRestart"),
    overlay: document.getElementById("overlay"),
    overlayEyebrow: document.getElementById("overlayEyebrow"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayMsg: document.getElementById("overlayMsg"),
    btnOverlay: document.getElementById("btnOverlay"),
    energyRows: document.getElementById("energyRows"),
  };

  /** 苏牙二段：碰球后等减速，保持当前朝向只突然加大速度 */
  const SUYA_BITE_SPEED_THRESH = 8;
  const SUYA_BITE_BURST = 82;
  const BUU_SCALE = 1.25;
  const BUU_GROW_SEC = 0.45;
  /** 进球慢动作：真实时长 + 物理时间倍率 */
  const GOAL_SLOW_SEC = 0.55;
  const GOAL_SLOW_SCALE = 0.2;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let viewW = 0;
  let viewH = 0;

  /** 场外视觉边距（米）：露出凹槽围边 / 看台，不影响物理 */
  const VIEW_PAD_M = 9;

  const pitchArt = new Image();
  pitchArt.src = "assets/pitch-surround.jpg";
  let pitchArtReady = false;
  pitchArt.onload = () => {
    pitchArtReady = true;
  };
  pitchArt.onerror = () => {
    pitchArtReady = false;
  };

  /** 球员圆形大头照缓存（透明 PNG，绘制时随 spin 旋转） */
  const avatarImgs = Object.create(null);

  function preloadAvatars() {
    const list = window.FOUNCY_PLAYERS || [];
    for (const p of list) {
      if (!p || !p.id || avatarImgs[p.id]) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = p.avatar || `assets/avatars/${p.id}.png`;
      avatarImgs[p.id] = img;
    }
  }

  function avatarReady(defId) {
    const img = avatarImgs[defId];
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  function avatarFailed(defId) {
    const img = avatarImgs[defId];
    return !!(img && img.complete && !(img.naturalWidth > 0));
  }

  /**
   * 等待头像 + 场外围图就绪（供启动加载页）。
   * @param {{ onProgress?: (done:number, total:number, id?:string) => void, timeoutMs?: number }} [opts]
   */
  function waitAssets(opts) {
    const onProgress = opts && opts.onProgress;
    const timeoutMs = (opts && opts.timeoutMs) || 20000;
    preloadAvatars();

    const list = (window.FOUNCY_PLAYERS || []).filter((p) => p && p.id);
    const total = list.length + 1; // + pitch art
    const t0 = performance.now();

    return new Promise((resolve) => {
      let pitchArtFailed = false;
      let settled = false;

      function pitchOk() {
        return (
          pitchArtReady ||
          (pitchArt.complete && pitchArt.naturalWidth > 0) ||
          pitchArtFailed ||
          (pitchArt.complete && !(pitchArt.naturalWidth > 0))
        );
      }

      function report(lastId) {
        let done = 0;
        for (const p of list) {
          if (avatarReady(p.id) || avatarFailed(p.id)) done += 1;
        }
        if (pitchOk()) done += 1;
        if (onProgress) onProgress(done, total, lastId);
        return done;
      }

      function finish() {
        if (settled) return;
        settled = true;
        report();
        resolve();
      }

      if (!pitchArt.complete) {
        pitchArt.addEventListener("load", () => report(), { once: true });
        pitchArt.addEventListener(
          "error",
          () => {
            pitchArtFailed = true;
            report();
          },
          { once: true }
        );
      }

      function tick() {
        const done = report();
        if (done >= total || performance.now() - t0 > timeoutMs) {
          finish();
          return;
        }
        requestAnimationFrame(tick);
      }

      for (const p of list) {
        const img = avatarImgs[p.id];
        if (!img) continue;
        if (img.complete) continue;
        img.addEventListener("load", () => report(p.id), { once: true });
        img.addEventListener("error", () => report(p.id), { once: true });
      }
      tick();
    });
  }

  preloadAvatars();

  /** 球场 + 球门槽外轮廓（屏幕坐标），用于扣洞 / 描边 */
  function pitchOutlineScreen() {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const { gx0, gx1 } = goalXRange();
    return [
      worldToScreen(0, 0),
      worldToScreen(gx0, 0),
      worldToScreen(gx0, -D),
      worldToScreen(gx1, -D),
      worldToScreen(gx1, 0),
      worldToScreen(W, 0),
      worldToScreen(W, L),
      worldToScreen(gx1, L),
      worldToScreen(gx1, L + D),
      worldToScreen(gx0, L + D),
      worldToScreen(gx0, L),
      worldToScreen(0, L),
    ];
  }

  function pathFromPoints(pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  const state = {
    running: false,
    phase: "select", // select | aim | sim | goalSlow | goal | over
    /** 进球慢动作剩余真实秒数 */
    goalSlowLeft: 0,
    /** 进球白闪 0~1 */
    goalFlash: 0,
    /** 已判定的得分方（慢放前锁定，避免球被顶出后不算） */
    pendingScorer: null,
    turn: "A",
    scoreA: 0,
    scoreB: 0,
    selected: null,
    power: 0,
    aim: { x: 0, y: 1 },
    bodies: [],
    lineupA: [],
    lineupB: [],
    dragging: false,
    /** 蓄力原点：始终为选中球员圆心（client 坐标） */
    dragOrigin: null,
    /** 主指按下时的 client 坐标；位移相对此点，映射到圆心 */
    dragStartClient: null,
    finger: null,
    pendingOverlay: null,
    curveSign: 0,
    curveRadius: CURVE_R_MAX,
    keyCurveHold: 0,
    keys: { a: false, d: false },
    primaryPointerId: null,
    curvePointerId: null,
    curveFingerClient: null,
    /** 副指按下时的 client 原点；弧度按相对侧滑，避免一点就拧满 */
    curveTouchOrigin: null,
    curveFromTouch: false,
    /** null | "A" | "B" —— 该方由电脑操控 */
    aiTeam: null,
    /** "normal" | "hard" —— 人机难度 */
    aiDifficulty: "normal",
    aiThinking: false,
    /** 静默仿真中：跳过特效/UI，供极难 AI 评估射门 */
    simulating: false,
    /**
     * 画面下方的队伍（己方视角）。
     * 热座固定 "A"；人机则为人类方。物理坐标不变，仅绘制/点触做 180° 映射。
     */
    viewBottomTeam: "A",
    /** 本击结算上下文（技能/充能） */
    shotCtx: null,
    strollBonus: false,
    /** 训练关自定义站位；null 则用默认开球位 */
    trainingLayout: null,
    /**
     * 开球站位（编队自定义）。按队伍存绝对世界坐标：
     * { A?: { kick:[{x,y}×3], receive:[…] }, B?: {…} }
     * kick=该方开球（先手），receive=对方开球（后手）
     */
    kickoffLayouts: null,
    /** 训练关卡 id（有则视为训练模式） */
    trainingId: null,
    /** 胜负球数（训练可改为 1） */
    winScore: WIN_SCORE,
    /** 比赛结束回调 (winner) => void */
    onMatchOver: null,
    /** 阶段变化回调 (phase) => void */
    onPhaseChange: null,
    /** 训练失败时不弹窗、直接重开（新手教程） */
    autoRetryOnFail: false,
    /** 自动重开前回调（用于重置教学引导） */
    onAutoRetry: null,
    /** 新手：强制禁用弧线输入 */
    curveLocked: false,
    /**
     * 联机本机操控方："A" | "B" | null
     * null = 热座/人机（按原规则）
     */
    localTeam: null,
    /** 联机事件回调 (evt) => void —— shot / arm / restart */
    onNetEvent: null,
    /** 对方出手因本机仍在仿真/进球动画而暂存 */
    pendingRemoteShots: [],
    /** 已应用过的远程出手 seq，防重放 */
    appliedRemoteSeqs: {},
  };

  let remoteShotFlushing = false;

  let rafId = 0;
  let bound = false;
  let aiTimers = [];

  /** 轻量特效粒子（世界坐标） */
  const FX = {
    particles: [],
    max: 96,
  };

  function clearFx() {
    FX.particles.length = 0;
  }

  function spawnSparks(wx, wy, count, opts) {
    if (state.simulating) return;
    const color = (opts && opts.color) || "rgba(255,255,255,0.92)";
    const speed = (opts && opts.speed) || 26;
    const life = (opts && opts.life) || 0.32;
    for (let i = 0; i < count; i++) {
      if (FX.particles.length >= FX.max) FX.particles.shift();
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.8);
      FX.particles.push({
        x: wx,
        y: wy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life,
        maxLife: life,
        r: 1.1 + Math.random() * 2.4,
        color,
      });
    }
  }

  function maybeImpactSpark(wx, wy, impact) {
    if (impact < 6) return;
    const n = Math.min(10, 2 + Math.floor(impact / 18));
    const alpha = Math.min(0.95, 0.4 + impact / 90);
    spawnSparks(wx, wy, n, {
      color: `rgba(255,255,255,${alpha})`,
      speed: 12 + Math.min(42, impact * 0.5),
      life: 0.2 + Math.min(0.35, impact / 130),
    });
  }

  function spawnGoalBurst(wx, wy, team) {
    const tint = team === "A" ? "rgba(158,192,255,0.95)" : "rgba(255,176,168,0.95)";
    spawnSparks(wx, wy, 26, { color: tint, speed: 58, life: 0.72 });
    spawnSparks(wx, wy, 14, { color: "rgba(200,245,66,0.92)", speed: 42, life: 0.55 });
  }

  /** 慢放期间把球钳在已进球门内，防止门网弹回后位置判定丢失 */
  function pinBallInGoal(scorer) {
    const b = ball();
    if (!b || !scorer) return;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const { gx0, gx1 } = goalXRange();
    b.x = Math.max(gx0 + b.r + 0.05, Math.min(gx1 - b.r - 0.05, b.x));
    if (scorer === "A") {
      // 上门：整球须在 y+r < 0
      b.y = Math.min(b.y, -b.r - 0.08);
      b.y = Math.max(b.y, -D + b.r + 0.05);
    } else {
      // 下门：整球须在 y-r > L
      b.y = Math.max(b.y, L + b.r + 0.08);
      b.y = Math.min(b.y, L + D - b.r - 0.05);
    }
  }

  function beginGoalSlowMo(scorer) {
    // 先锁定得分，再播慢动作（结算用 pendingScorer，不再重新 checkGoal）
    state.pendingScorer = scorer;
    pinBallInGoal(scorer);
    const bb = ball();
    const L = PITCH.lengthM;
    if (bb) {
      spawnGoalBurst(bb.x, scorer === "A" ? Math.min(bb.y, 0) : Math.max(bb.y, L), scorer);
    }
    state.goalSlowLeft = GOAL_SLOW_SEC;
    state.goalFlash = 1;
    setPhase("goalSlow");
  }

  function updateFx(dt) {
    for (let i = FX.particles.length - 1; i >= 0; i--) {
      const p = FX.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        FX.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-3.2 * dt);
      p.vy *= Math.exp(-3.2 * dt);
    }
  }

  function drawFx() {
    if (!FX.particles.length) return;
    for (const p of FX.particles) {
      const s = worldToScreen(p.x, p.y);
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r * (0.65 + 0.35 * a), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function curveBend01() {
    if (!state.curveSign) return 0;
    const { rMin } = selectedCurveLimits();
    return Math.max(
      0,
      Math.min(1, (CURVE_R_MAX - state.curveRadius) / Math.max(1e-3, CURVE_R_MAX - rMin))
    );
  }

  function teamName(t) {
    if (t === "A") return "蓝方";
    if (state.aiTeam === "B") return "电脑";
    if (state.aiTeam === "A") return "电脑";
    return "红方";
  }

  function isAiTurn() {
    return !!state.aiTeam && state.turn === state.aiTeam;
  }

  function isRemoteTurn() {
    return !!state.localTeam && state.turn !== state.localTeam;
  }

  /** 本机不可操作（电脑回合或对方联机回合） */
  function inputBlocked() {
    return isAiTurn() || state.aiThinking || isRemoteTurn();
  }

  function clearAiTimers() {
    for (const id of aiTimers) clearTimeout(id);
    aiTimers = [];
    state.aiThinking = false;
  }

  function aiDelay(ms, fn) {
    const id = setTimeout(() => {
      aiTimers = aiTimers.filter((t) => t !== id);
      if (!state.running) return;
      fn();
    }, ms);
    aiTimers.push(id);
  }

  function queueAiTurn() {
    clearAiTimers();
    if (!state.running || state.phase !== "select" || !isAiTurn()) return;
    if (el.overlay && !el.overlay.classList.contains("hidden")) return;
    if (!window.FouncyAI || typeof window.FouncyAI.decide !== "function") return;

    state.aiThinking = true;
    syncUI();

    // 短暂停顿 → 亮出蓄力预览 → 再出手（让人看清电脑在干嘛）
    const thinkMs =
      state.aiDifficulty === "hard"
        ? 220 + Math.random() * 180
        : 380 + Math.random() * 420;
    aiDelay(thinkMs, () => {
      if (!state.running || state.phase !== "select" || !isAiTurn()) return;
      let decision = null;
      try {
        decision = window.FouncyAI.decide({
          bodies: state.bodies,
          team: state.turn,
          pitch: PITCH,
          phys: PHYS,
          difficulty: state.aiDifficulty || "normal",
          evaluateShot,
        });
      } catch (err) {
        console.error("FouncyAI.decide failed", err);
      }
      if (!decision || !decision.player) {
        state.aiThinking = false;
        syncUI();
        // 决策失败时稍后再试，避免卡死
        aiDelay(400, () => queueAiTurn());
        return;
      }

      state.selected = decision.player;
      // 极难：听决策；普通：能量满时大概率发动
      if (decision.skillArmed != null) {
        decision.player.skillArmed = !!decision.skillArmed;
      } else if (
        decision.player.energy >= 1 &&
        decision.player.skill &&
        Math.random() < 0.72
      ) {
        decision.player.skillArmed = true;
      }
      state.power = decision.power;
      state.aim = { x: decision.aim.x, y: decision.aim.y };
      if (!playerCanCurve(decision.player)) {
        state.curveSign = 0;
        state.curveRadius = CURVE_R_MAX;
      } else {
        state.curveSign = decision.curveSign || 0;
        state.curveRadius = decision.curveRadius || CURVE_R_MAX;
      }
      state.dragging = false;
      state.dragOrigin = null;
      state.dragStartClient = null;
      state.finger = null;
      state.primaryPointerId = null;
      state.curvePointerId = null;
      state.curveFingerClient = null;
      state.curveFromTouch = false;
      state.keys.a = false;
      state.keys.d = false;
      state.aiThinking = false;
      setPhase("aim");

      const aimMs =
        state.aiDifficulty === "hard"
          ? 280 + Math.random() * 220
          : 520 + Math.random() * 480;
      aiDelay(aimMs, () => {
        if (!state.running || state.phase !== "aim" || !isAiTurn()) return;
        if (!state.selected || state.power < 0.05) return;
        shoot();
      });
    });
  }

  function cloneBodyForSim(b) {
    return {
      id: b.id,
      defId: b.defId,
      name: b.name,
      number: b.number,
      team: b.team,
      lane: b.lane,
      skill: b.skill ? { ...b.skill } : null,
      x: b.x,
      y: b.y,
      vx: 0,
      vy: 0,
      r: b.r,
      baseR: b.baseR,
      mass: b.mass,
      baseMass: b.baseMass,
      isBall: b.isBall,
      spin: 0,
      curveSign: 0,
      curveRadius: 0,
      mods: b.mods ? { ...b.mods } : null,
      stats: b.stats ? { ...b.stats } : null,
      energy: b.energy,
      energyChargedThisTurn: false,
      skillArmed: false,
      buffPower: b.buffPower || 0,
      buffCurve: b.buffCurve || 0,
      buffTurns: b.buffTurns || 0,
      injuredTurns: b.injuredTurns || 0,
      sizeScale: b.sizeScale || 1,
      buuActive: !!b.buuActive,
      buuGrowing: !!b.buuGrowing,
      buuGrowT: b.buuGrowT || 0,
      disableCurveShot: !!b.disableCurveShot,
    };
  }

  /**
   * 静默完整物理仿真一击（不改动真实对局状态）。
   * @returns {{ scorer: "A"|"B"|null, steps: number, hitBall: boolean, ballX: number, ballY: number } | null}
   */
  function evaluateShot(opts) {
    if (!opts || state.simulating || !state.bodies.length) return null;
    const playerId = opts.playerId;
    const aimIn = opts.aim;
    const power = Math.max(0.05, Math.min(1, opts.power || 0));
    if (!playerId || !aimIn) return null;

    const liveBodies = state.bodies;
    const liveShotCtx = state.shotCtx;
    const liveSelected = state.selected;

    state.simulating = true;
    state.bodies = liveBodies.map(cloneBodyForSim);
    state.shotCtx = null;
    state.selected = null;

    let result = null;
    try {
      const p = state.bodies.find((b) => b.id === playerId);
      if (!p || p.isBall || p.injuredTurns > 0) {
        result = null;
      } else {
        let skillId = null;
        if (opts.skillArmed && p.skill && p.energy >= 1) {
          p.skillArmed = true;
          skillId = applySkillOnShoot(p);
        } else {
          p.skillArmed = false;
          p.disableCurveShot = false;
        }

        beginShotContext(p, skillId);
        refreshPlayerMods(p);

        const aim = normalize(aimIn.x, aimIn.y);
        const mult = p.mods ? p.mods.powerMult : 1;
        const spd = power * MAX_POWER * mult;
        p.vx = aim.x * spd;
        p.vy = aim.y * spd;

        const canCurve =
          playerCanCurve(p) && opts.curveSign && opts.curveRadius > 0;
        if (canCurve) {
          const rMin =
            p.mods && p.mods.curveRMin != null
              ? Math.max(CURVE_R_MIN, p.mods.curveRMin)
              : CURVE_R_MIN;
          p.curveSign = opts.curveSign;
          p.curveRadius = Math.max(rMin, opts.curveRadius);
        } else {
          clearBodyCurve(p);
        }
        p.disableCurveShot = false;

        const STEP = 1 / 60;
        const maxSteps = 60 * 9;
        let scorer = null;
        let steps = 0;
        for (; steps < maxSteps; steps++) {
          const bb = ball();
          const prevX = bb ? bb.x : null;
          const prevY = bb ? bb.y : null;
          integrate(STEP);
          // 位移后立刻判：避免随后门网/撞人把球顶回门外漏判
          scorer = checkGoalSweep(prevX, prevY);
          collideBodies();
          if (!scorer) scorer = checkGoal();
          collideWalls();
          tickSuyaBite();
          if (!scorer) scorer = checkGoal();
          if (scorer) break;
          const suyaWaiting =
            state.shotCtx &&
            state.shotCtx.suyaBitePending &&
            !state.shotCtx.suyaBiteDone;
          if (allSlowEnough() && !suyaWaiting) break;
        }

        const b = ball();
        result = {
          scorer,
          steps,
          hitBall: !!(state.shotCtx && state.shotCtx.hitBall),
          ballX: b ? b.x : 0,
          ballY: b ? b.y : 0,
        };
      }
    } finally {
      state.bodies = liveBodies;
      state.shotCtx = liveShotCtx;
      state.selected = liveSelected;
      state.simulating = false;
    }
    return result;
  }

  function makePlayerBody(def, team, slot, x, y) {
    const stats = {
      power: def.power,
      curve: def.curve,
      grip: def.grip,
      weight: def.weight,
    };
    const mods = PHYS.modsFromStats(stats);
    return {
      id: `${team}${slot + 1}`,
      defId: def.id,
      name: def.name,
      number: def.number,
      team,
      lane: def.lane || "mid",
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
      spin: 0,
      curveSign: 0,
      curveRadius: 0,
      mods,
      stats,
      energy: 0,
      energyChargedThisTurn: false,
      skillArmed: false,
      buffPower: 0,
      buffCurve: 0,
      buffTurns: 0,
      injuredTurns: 0,
      buuActive: false,
      buuGrowing: false,
      buuGrowT: 0,
      sizeScale: 1,
      disableCurveShot: false,
    };
  }

  function effectiveStats(b) {
    return {
      power: Math.max(0, Math.min(100, (b.stats.power || 50) + (b.buffPower || 0))),
      curve: Math.max(0, Math.min(100, (b.stats.curve || 50) + (b.buffCurve || 0))),
      grip: b.stats.grip,
      weight: b.stats.weight,
    };
  }

  function refreshPlayerMods(b) {
    if (!b || b.isBall) return;
    const mods = PHYS.modsFromStats(effectiveStats(b));
    b.mods = mods;
    const scale = b.sizeScale || 1;
    b.baseMass = mods.mass;
    b.mass = mods.mass * scale * scale;
    b.r = (b.baseR || PLAYER_R) * scale;
  }

  function addEnergy(b, amount) {
    if (!b || b.isBall || !b.skill) return;
    const before = b.energy;
    b.energy = Math.min(1, b.energy + amount);
    if (b.energy >= 1 && before < 1) syncEnergyDock();
    else if (Math.abs(b.energy - before) > 0.001) syncEnergyDock();
  }

  function ownHalfY(team, y) {
    const mid = PITCH.lengthM * 0.5;
    return team === "A" ? y >= mid : y <= mid;
  }

  function energyPanelTeam() {
    if (state.localTeam) return state.localTeam;
    if (state.aiTeam) return state.viewBottomTeam;
    return state.turn;
  }

  function toggleSkillArm(bodyId, opts) {
    const fromRemote = !!(opts && opts.fromRemote);
    const b = state.bodies.find((x) => x.id === bodyId);
    if (!b || b.isBall || !b.skill) return;
    if (b.energy < 1 && !b.skillArmed) return;
    if (b.injuredTurns > 0) return;
    // 仅允许操作能量条所属方
    if (b.team !== energyPanelTeam() && !fromRemote) return;
    if (inputBlocked() && !fromRemote) return;
    if (opts && typeof opts.skillArmed === "boolean") {
      b.skillArmed = opts.skillArmed;
    } else {
      b.skillArmed = !b.skillArmed;
    }
    syncEnergyDock();
    syncUI();
    if (!fromRemote && state.onNetEvent) {
      state.onNetEvent({
        type: "arm",
        bodyId: b.id,
        skillArmed: !!b.skillArmed,
      });
    }
  }

  function syncEnergyDock() {
    if (state.simulating) return;
    if (!el.energyRows) return;
    const team = energyPanelTeam();
    const list = state.bodies.filter((b) => !b.isBall && b.team === team);
    el.energyRows.innerHTML = "";
    for (const b of list) {
      const ready = b.energy >= 1;
      const pct = Math.round(Math.min(1, b.energy) * 100);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "energy-chip";
      if (ready) btn.classList.add("ready");
      if (b.skillArmed) btn.classList.add("armed");
      if (b.injuredTurns > 0) btn.classList.add("injured");
      btn.dataset.bodyId = b.id;
      const skillLabel = b.skillArmed
        ? `已发动·${b.skill.name}`
        : ready
          ? b.skill.name
          : b.skill
            ? b.skill.name
            : "";
      btn.innerHTML = `<div class="ec-top"><span class="ec-name">${b.name}</span><span class="ec-skill">${skillLabel}</span></div><div class="ec-bar"><i style="width:${pct}%"></i></div>`;
      btn.title = b.skill ? `${b.skill.name}：${b.skill.desc}` : "";
      btn.addEventListener("click", () => toggleSkillArm(b.id));
      el.energyRows.appendChild(btn);
    }
  }

  function beginShotContext(shooter, skillId) {
    state.shotCtx = {
      shooter,
      skillId: skillId || null,
      hitBall: false,
      hitPlayer: false,
      /** 本击最后触球的球员队伍（任意己方/对方） */
      lastTouchTeam: null,
      lastTouchId: null,
      suyaBitePending: false,
      suyaBiteDone: false,
      /** 碰球后持续刷新：触发二段时沿此朝向只加大速率 */
      suyaLastDir: null,
      pepeDone: false,
    };
  }

  /** 禁区猎手：碰球后等减速，用当下朝向突然加大速度（方向不变） */
  function tickSuyaBite() {
    const ctx = state.shotCtx;
    if (!ctx || ctx.suyaBiteDone) return;
    const p = ctx.shooter;
    if (!p || p.isBall) return;

    const sp = Math.hypot(p.vx, p.vy);
    if (sp >= REST) {
      ctx.suyaLastDir = { x: p.vx / sp, y: p.vy / sp };
    }

    if (!ctx.suyaBitePending) return;
    if (sp >= SUYA_BITE_SPEED_THRESH) return;

    const dir = ctx.suyaLastDir;
    if (!dir) return;

    p.vx = dir.x * SUYA_BITE_BURST;
    p.vy = dir.y * SUYA_BITE_BURST;
    clearBodyCurve(p);
    ctx.suyaBitePending = false;
    ctx.suyaBiteDone = true;
    spawnSparks(p.x, p.y, 14, {
      color: "rgba(255,120,100,0.95)",
      speed: 52,
      life: 0.45,
    });
  }

  function applySkillOnShoot(p) {
    if (!p.skillArmed || !p.skill || p.energy < 1) {
      p.disableCurveShot = false;
      return null;
    }
    const sid = p.skill.id;
    p.energy = 0;
    p.skillArmed = false;

    if (sid === "dragon_glide") {
      p.buffPower = 20;
      p.buffCurve = 20;
      p.buffTurns = 1;
      refreshPlayerMods(p);
    } else if (sid === "tempo_arc") {
      p.buffCurve = 20;
      p.buffTurns = 2;
      refreshPlayerMods(p);
    } else if (sid === "buu_form") {
      p.buffPower = 20;
      p.buffTurns = 1;
      p.buuActive = true;
      p.buuGrowing = true;
      p.buuGrowT = 0;
      p.disableCurveShot = true;
      refreshPlayerMods(p);
    } else {
      p.disableCurveShot = false;
    }
    syncEnergyDock();
    return sid;
  }

  function tickStatusOnTurnEnd(endingTeam) {
    for (const b of state.bodies) {
      if (b.isBall) continue;
      b.energyChargedThisTurn = false;
      if (b.team !== endingTeam) continue;
      if (b.buffTurns > 0) {
        b.buffTurns -= 1;
        if (b.buffTurns <= 0) {
          b.buffPower = 0;
          b.buffCurve = 0;
          if (b.buuActive) {
            b.buuActive = false;
            b.buuGrowing = false;
            b.sizeScale = 1;
          }
          refreshPlayerMods(b);
        }
      }
      if (b.injuredTurns > 0) b.injuredTurns -= 1;
    }
  }

  function separateOverlapsAround(b) {
    for (const o of state.bodies) {
      if (o === b) continue;
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const dist = Math.hypot(dx, dy);
      const min = b.r + o.r;
      if (dist < 1e-6 || dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const push = (min - dist) * 0.55;
      b.x += nx * push;
      b.y += ny * push;
      o.x -= nx * push * 0.35;
      o.y -= ny * push * 0.35;
    }
  }

  function updateBuuGrowth(dt) {
    for (const b of state.bodies) {
      if (!b.buuGrowing) continue;
      b.buuGrowT = Math.min(1, b.buuGrowT + dt / BUU_GROW_SEC);
      const t = b.buuGrowT;
      const eased = t * t * (3 - 2 * t);
      b.sizeScale = 1 + (BUU_SCALE - 1) * eased;
      refreshPlayerMods(b);
      separateOverlapsAround(b);
      if (t >= 1) b.buuGrowing = false;
    }
  }

  function onPlayerBallTouch(player, ballBody) {
    if (!player || player.isBall) return;
    const ctx = state.shotCtx;
    if (ctx) {
      ctx.lastTouchTeam = player.team;
      ctx.lastTouchId = player.id;
      if (ctx.shooter === player) ctx.hitBall = true;
    }

    if (player.lane === "fwd") {
      if (ctx && ctx.shooter === player && !player.energyChargedThisTurn) {
        addEnergy(player, 1 / 3);
        player.energyChargedThisTurn = true;
      }
    } else if (player.lane === "mid") {
      if (!player.energyChargedThisTurn) {
        addEnergy(player, 1 / 5);
        player.energyChargedThisTurn = true;
      }
    } else if (player.lane === "def") {
      if (!player.energyChargedThisTurn && ownHalfY(player.team, player.y)) {
        addEnergy(player, 1 / 5);
        player.energyChargedThisTurn = true;
      }
    }

    // 苏牙：禁区猎手 —— 碰球后进入二段等待（减速后再沿出手方向爆发）
    if (
      ctx &&
      ctx.skillId === "box_hunter" &&
      ctx.shooter === player &&
      !ctx.suyaBiteDone &&
      !ctx.suyaBitePending
    ) {
      ctx.suyaBitePending = true;
    }
  }

  function onPlayerPlayerHit(a, b) {
    const ctx = state.shotCtx;
    if (ctx) {
      if (ctx.shooter === a || ctx.shooter === b) ctx.hitPlayer = true;
    }

    const pair = [
      [a, b],
      [b, a],
    ];
    for (const [self, other] of pair) {
      if (self.isBall || other.isBall) continue;
      // 后防：碰撞对方球员充能
      if (
        self.lane === "def" &&
        other.team !== self.team &&
        !self.energyChargedThisTurn
      ) {
        addEnergy(self, 1 / 5);
        self.energyChargedThisTurn = true;
      }
      // 武僧飞铲：本击首个碰到的对手受伤
      if (
        ctx &&
        ctx.skillId === "monk_slide" &&
        ctx.shooter === self &&
        other.team !== self.team &&
        !ctx.pepeDone
      ) {
        ctx.pepeDone = true;
        other.injuredTurns = Math.max(other.injuredTurns, 1);
        spawnSparks(other.x, other.y, 10, {
          color: "rgba(200,245,66,0.9)",
          speed: 40,
          life: 0.4,
        });
        syncEnergyDock();
      }
    }
  }

  function makeBallBody(x, y) {
    return {
      id: "ball",
      defId: "ball",
      name: "足球",
      number: 0,
      team: "ball",
      x,
      y,
      vx: 0,
      vy: 0,
      r: BALL_R,
      mass: 0.35,
      isBall: true,
      spin: 0,
      curveSign: 0,
      curveRadius: 0,
      mods: {
        powerMult: 1,
        curveRMin: CURVE_R_MAX,
        curveRMinMult: 1,
        curveKeyTimeMult: 1,
        dragMult: 0.92,
        mass: 0.35,
        restitutionMult: 1,
      },
      stats: null,
    };
  }

  function defaultKickoffSpots(team) {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const gap = PLAYER_R * 2.4;
    const back = PLAYER_R * 0.5;
    const xs = [W * 0.22, W * 0.5, W * 0.78];
    if (team === "A") {
      const aY = L * 0.74 + back;
      return xs.map((x, i) => ({
        x,
        y: i === 1 ? aY - gap * 0.55 : aY,
      }));
    }
    const bY = L * 0.26 - back;
    return xs.map((x, i) => ({
      x,
      y: i === 1 ? bY + gap * 0.55 : bY,
    }));
  }

  function spotsForKickoff(team, kickOffTeam) {
    const side = state.kickoffLayouts && state.kickoffLayouts[team];
    const key = team === kickOffTeam ? "kick" : "receive";
    const custom = side && Array.isArray(side[key]) ? side[key] : null;
    if (custom && custom.length >= 3) {
      return custom.slice(0, 3).map((s) => ({ x: s.x, y: s.y }));
    }
    return defaultKickoffSpots(team);
  }

  function resetPositions(preserveMeta = false, kickOffTeam = null) {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const whoKicks = kickOffTeam === "A" || kickOffTeam === "B" ? kickOffTeam : state.turn || "A";
    const meta = {};
    if (preserveMeta) {
      for (const b of state.bodies) {
        if (b.isBall) continue;
        meta[b.id] = {
          energy: b.energy,
          skillArmed: b.skillArmed,
          buffPower: b.buffPower,
          buffCurve: b.buffCurve,
          buffTurns: b.buffTurns,
          injuredTurns: b.injuredTurns,
          buuActive: b.buuActive,
          sizeScale: b.buuActive ? b.sizeScale : 1,
          energyChargedThisTurn: false,
        };
      }
    }

    const bodies = [];
    const spotsA = spotsForKickoff("A", whoKicks);
    state.lineupA.forEach((def, i) => {
      const s = spotsA[i] || defaultKickoffSpots("A")[i];
      const p = makePlayerBody(def, "A", i, s.x, s.y);
      if (meta[p.id]) Object.assign(p, meta[p.id]);
      refreshPlayerMods(p);
      bodies.push(p);
    });

    const spotsB = spotsForKickoff("B", whoKicks);
    state.lineupB.forEach((def, i) => {
      const s = spotsB[i] || defaultKickoffSpots("B")[i];
      const p = makePlayerBody(def, "B", i, s.x, s.y);
      if (meta[p.id]) Object.assign(p, meta[p.id]);
      refreshPlayerMods(p);
      bodies.push(p);
    });

    bodies.push(makeBallBody(W * 0.5, L * 0.5));
    state.bodies = bodies;
    applyTrainingLayout(state.trainingLayout);
  }

  /** 训练关：覆盖球与双方站位（按阵容下标） */
  function applyTrainingLayout(layout) {
    if (!layout || !state.bodies.length) return;
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const b = state.bodies.find((x) => x.isBall);
    if (b && layout.ball) {
      b.x = clamp(layout.ball.x, b.r, W - b.r);
      b.y = clamp(layout.ball.y, -PITCH.goalDepthM + b.r, L + PITCH.goalDepthM - b.r);
      b.vx = 0;
      b.vy = 0;
    }

    const placeTeam = (team, spots) => {
      if (!spots || !spots.length) return;
      const list = state.bodies.filter((x) => x.team === team && !x.isBall);
      list.forEach((p, i) => {
        const s = spots[i];
        if (!s) return;
        p.x = clamp(s.x, p.r, W - p.r);
        p.y = clamp(s.y, p.r, L - p.r);
        p.vx = 0;
        p.vy = 0;
      });
    };
    placeTeam("A", layout.A);
    placeTeam("B", layout.B);

    // 防止关卡配置略挤时开局叠在一起
    for (let pass = 0; pass < 4; pass++) {
      for (const b of state.bodies) separateOverlapsAround(b);
    }
  }

  function selectedCurveLimits() {
    const m = state.selected && state.selected.mods;
    // 优先用绝对 curveRMin；无则回退 CURVE_R_MIN × 倍率
    let rMin = CURVE_R_MIN;
    if (m) {
      rMin = m.curveRMin != null ? m.curveRMin : CURVE_R_MIN * (m.curveRMinMult || 1);
    }
    const keyTime = CURVE_KEY_TIME * (m ? m.curveKeyTimeMult : 1);
    return { rMin: Math.max(CURVE_R_MIN, rMin), keyTime: Math.max(0.4, keyTime) };
  }

  function ball() {
    return state.bodies.find((b) => b.isBall);
  }

  function resize() {
    const stage = document.getElementById("stage");
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 画面：场外边距 + 上下球门槽 + 球场（边距只用于美术，物理仍在 0..W / 0..L）
    const worldW = PITCH.widthM + VIEW_PAD_M * 2;
    const worldH = PITCH.lengthM + PITCH.goalDepthM * 2 + VIEW_PAD_M * 2;
    const aspect = worldW / worldH;
    let cssW = rect.width;
    let cssH = cssW / aspect;
    if (cssH > rect.height) {
      cssH = rect.height;
      cssW = cssH * aspect;
    }

    viewW = cssW;
    viewH = cssH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    scale = cssW / worldW;
    offsetX = VIEW_PAD_M * scale;
    offsetY = (PITCH.goalDepthM + VIEW_PAD_M) * scale;
  }

  /** 是否需要把球场转 180°，让 viewBottomTeam 出现在屏幕下方 */
  function viewFlipActive() {
    return state.viewBottomTeam === "B";
  }

  function toViewXY(x, y) {
    if (!viewFlipActive()) return { x, y };
    return { x: PITCH.widthM - x, y: PITCH.lengthM - y };
  }

  function fromViewXY(x, y) {
    if (!viewFlipActive()) return { x, y };
    return { x: PITCH.widthM - x, y: PITCH.lengthM - y };
  }

  function worldToScreen(x, y) {
    const v = toViewXY(x, y);
    return { x: offsetX + v.x * scale, y: offsetY + v.y * scale };
  }

  function screenToWorld(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const vx = (sx - r.left - offsetX) / scale;
    const vy = (sy - r.top - offsetY) / scale;
    return fromViewXY(vx, vy);
  }

  /** 屏幕方向 → 世界瞄准方向（翻转视角时需转 180°） */
  function screenDirToWorldAim(dx, dy) {
    if (!viewFlipActive()) return normalize(-dx, -dy);
    return normalize(dx, dy);
  }

  function setPhase(phase) {
    state.phase = phase;
    syncUI();
    if (typeof state.onPhaseChange === "function") {
      try {
        state.onPhaseChange(phase, {
          turn: state.turn,
          aiTeam: state.aiTeam,
        });
      } catch (err) {
        console.error("onPhaseChange failed", err);
      }
    }
    if (phase === "select") {
      flushPendingRemoteShots();
      queueAiTurn();
    }
  }

  function canApplyRemoteShotNow() {
    return (
      state.running &&
      (state.phase === "select" || state.phase === "aim") &&
      !state.simulating
    );
  }

  function flushPendingRemoteShots() {
    if (remoteShotFlushing) return;
    if (!state.pendingRemoteShots || !state.pendingRemoteShots.length) return;
    if (!canApplyRemoteShotNow()) return;
    remoteShotFlushing = true;
    try {
      while (state.pendingRemoteShots.length && canApplyRemoteShotNow()) {
        const msg = state.pendingRemoteShots.shift();
        applyRemoteShotNow(msg);
      }
    } finally {
      remoteShotFlushing = false;
    }
  }

  function syncUI() {
    el.scoreA.textContent = String(state.scoreA);
    el.scoreB.textContent = String(state.scoreB);

    const who = teamName(state.turn);
    let aimExtra = "蓄力";
    if (state.phase === "aim") {
      if (state.curveLocked) {
        aimExtra = "蓄力 · 直线";
      } else if (state.curveSign) {
        const side = state.curveSign < 0 ? "左旋" : "右旋";
        aimExtra = `${side} · R${state.curveRadius.toFixed(0)}`;
      } else {
        aimExtra = "蓄力 · 副指加弧";
      }
    }
    const map = {
      select: isAiTurn()
        ? state.aiThinking
          ? `${who} · 思考中`
          : `${who} · 准备`
        : state.strollBonus
          ? `${who} · 闲庭信步·再击`
          : `${who} · 选人`,
      aim: isAiTurn()
        ? `${who} · 出手预览`
        : state.selected && state.selected.skillArmed
          ? `${who} · ${state.selected.skill.name}`
          : `${who} · ${aimExtra}`,
      sim: "结算中…",
      goalSlow: "进球！",
      goal: "进球！",
      over: "比赛结束",
    };
    el.phase.textContent = map[state.phase] || "";

    let pillTeam = "neutral";
    if (state.phase === "select" || state.phase === "aim") pillTeam = state.turn;
    else if (state.phase === "goal" || state.phase === "goalSlow") pillTeam = state.turn;
    el.phase.dataset.team = pillTeam;
    syncEnergyDock();
  }

  /** 选中球员圆心 → 浏览器 client 坐标 */
  function bodyCenterClient(b) {
    const s = worldToScreen(b.x, b.y);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + s.x, y: rect.top + s.y };
  }

  /** 点选球员并立即开始蓄力拖动（原点锚定球心，相对位移映射到圆心） */
  function beginAimOnPlayer(p, e) {
    state.selected = p;
    state.power = 0;
    // 蓝攻上(-y)，红攻下(+y)
    state.aim = p.team === "A" ? { x: 0, y: -1 } : { x: 0, y: 1 };
    state.dragging = true;
    const c = bodyCenterClient(p);
    state.dragOrigin = { x: c.x, y: c.y };
    state.dragStartClient = { x: e.clientX, y: e.clientY };
    state.finger = { x: c.x, y: c.y };
    state.primaryPointerId = e.pointerId;
    resetCurveInput();
    setPhase("aim");
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function resetCurveInput() {
    state.curveSign = 0;
    state.curveRadius = CURVE_R_MAX;
    state.keyCurveHold = 0;
    state.curvePointerId = null;
    state.curveFingerClient = null;
    state.curveTouchOrigin = null;
    state.curveFromTouch = false;
  }

  /** y 向下坐标系中，相对方向 dir 的「世界左侧」单位法线 */
  function leftNormal(dir) {
    return normalize(dir.y, -dir.x);
  }

  /** 屏幕视觉左侧（视角翻转时与世界左相反） */
  function viewLeftNormal(dir) {
    const n = leftNormal(dir);
    if (!viewFlipActive()) return n;
    return { x: -n.x, y: -n.y };
  }

  /** 绕圆转向：sign=-1 左弯，+1 右弯 */
  function steerVelocity(vx, vy, radius, sign, dt) {
    const sp = Math.hypot(vx, vy);
    if (sp < REST || !radius || !sign) return { vx, vy };
    const theta = sign * (sp / radius) * dt;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return {
      vx: vx * c - vy * s,
      vy: vx * s + vy * c,
    };
  }

  function clearBodyCurve(b) {
    b.curveSign = 0;
    b.curveRadius = 0;
  }

  function skillBlocksCurve(p) {
    return !!(
      p &&
      p.skillArmed &&
      p.skill &&
      p.skill.id === "buu_form"
    );
  }

  /** 弧线属性为 0 / 技能禁用 / 布欧态 / 新手锁弧 → 完全不能拧弧 */
  function playerCanCurve(p) {
    if (state.curveLocked) return false;
    if (!p || p.isBall || p.disableCurveShot) return false;
    if (skillBlocksCurve(p)) return false;
    if (p.mods && p.mods.curveDisabled) return false;
    return effectiveStats(p).curve > 0;
  }

  /**
   * 副指拧弧（手机友好）：
   * 以副指按下点为原点，沿「瞄准方向的左侧」侧滑控制弯度。
   * - 回到原点附近 → 取消弧线（易回退）
   * - 侧滑约 130px 才到满弯（ease-in，不会一点就拧满）
   */
  function updateCurveFromTouch(clientX, clientY) {
    if (!state.selected || state.power < 0.02) return;
    if (!playerCanCurve(state.selected)) {
      resetCurveInput();
      state.curveFromTouch = true;
      syncUI();
      return;
    }
    state.curveFingerClient = { x: clientX, y: clientY };
    if (!state.curveTouchOrigin) {
      state.curveTouchOrigin = { x: clientX, y: clientY };
    }

    const P = state.selected;
    const aim = normalize(state.aim.x, state.aim.y);
    const left = viewLeftNormal(aim);
    // 屏幕空间「左」法线（与视角一致）
    const o = worldToScreen(P.x, P.y);
    const l = worldToScreen(P.x + left.x, P.y + left.y);
    const sLeft = normalize(l.x - o.x, l.y - o.y);

    const dx = clientX - state.curveTouchOrigin.x;
    const dy = clientY - state.curveTouchOrigin.y;
    const latPx = dx * sLeft.x + dy * sLeft.y;

    // 死区：滑回原点附近即可清掉弧线
    const DEAD_PX = 28;
    // 满弯行程：刻意偏长，避免误触拧满
    const FULL_PX = 130;

    if (Math.abs(latPx) < DEAD_PX) {
      state.curveSign = 0;
      state.curveRadius = CURVE_R_MAX;
      state.curveFromTouch = true;
      syncUI();
      return;
    }

    // 向瞄准左侧滑 → 左旋(-1)，与旧逻辑一致
    const sign = latPx > 0 ? -1 : 1;
    const mag = Math.min(1, (Math.abs(latPx) - DEAD_PX) / (FULL_PX - DEAD_PX));
    // ease-in：前半段弯得慢，后半段才接近满弯
    const eased = mag * mag;
    const { rMin } = selectedCurveLimits();
    let R = CURVE_R_MAX + (rMin - CURVE_R_MAX) * eased;
    R = Math.max(rMin, Math.min(CURVE_R_MAX, R));

    // 同侧轻平滑，换侧立刻跟手
    if (state.curveSign === sign && state.curveSign !== 0) {
      R = state.curveRadius * 0.55 + R * 0.45;
    }
    state.curveSign = sign;
    state.curveRadius = R;
    state.curveFromTouch = true;
    syncUI();
  }

  function updateCurveFromKeys(dt) {
    if (state.phase !== "aim" || state.curveFromTouch) return;
    if (!playerCanCurve(state.selected)) {
      if (state.curveSign) resetCurveInput();
      return;
    }
    const { a, d } = state.keys;
    if (!a && !d) return;
    if (a && d) return;
    // A=屏幕左旋，视角翻转时左右对调
    let sign = a ? -1 : 1;
    if (viewFlipActive()) sign = -sign;
    if (state.curveSign !== sign) {
      state.curveSign = sign;
      state.keyCurveHold = 0;
    }
    state.keyCurveHold += dt;
    const { rMin, keyTime } = selectedCurveLimits();
    const t = Math.min(1, state.keyCurveHold / keyTime);
    state.curveRadius = CURVE_R_MAX + (rMin - CURVE_R_MAX) * t;
    syncUI();
  }

  /**
   * @param {string} title
   * @param {string} msg
   * @param {() => void} onOk
   * @param {{ team?: "A"|"B"|null, eyebrow?: string }} [opts]
   */
  function showOverlay(title, msg, onOk, opts) {
    const team = opts && opts.team ? opts.team : null;
    const eyebrow = (opts && opts.eyebrow) || (title === "GOAL!" ? "GOAL" : "比赛");
    el.overlay.classList.remove("team-a", "team-b", "neutral");
    if (team === "A") el.overlay.classList.add("team-a");
    else if (team === "B") el.overlay.classList.add("team-b");
    else el.overlay.classList.add("neutral");
    if (el.overlayEyebrow) el.overlayEyebrow.textContent = eyebrow;
    el.overlayTitle.textContent = title;
    el.overlayMsg.textContent = msg;
    el.overlay.classList.remove("hidden");
    state.pendingOverlay = onOk;
    // 对方已经出手在排队：别卡在弹窗上，立刻进入下一回合并消化
    if (state.pendingRemoteShots && state.pendingRemoteShots.length) {
      requestAnimationFrame(() => {
        if (state.pendingRemoteShots && state.pendingRemoteShots.length) {
          hideOverlay();
        }
      });
    }
  }

  function hideOverlay() {
    el.overlay.classList.add("hidden");
    el.overlay.classList.remove("team-a", "team-b", "neutral");
    const cb = state.pendingOverlay;
    state.pendingOverlay = null;
    if (cb) cb();
  }

  function integrate(dt) {
    updateBuuGrowth(dt);
    for (const b of state.bodies) {
      if (Math.hypot(b.vx, b.vy) > 0) {
        const drag = DRAG * (b.mods ? b.mods.dragMult : 1);
        const damp = Math.exp(-drag * dt);
        b.vx *= damp;
        b.vy *= damp;
      }
      if (Math.hypot(b.vx, b.vy) < REST) {
        b.vx = 0;
        b.vy = 0;
        clearBodyCurve(b);
      }
      // 弧线：碰撞前持续绕圆转向
      if (b.curveSign && b.curveRadius > 0 && Math.hypot(b.vx, b.vy) >= REST) {
        const steered = steerVelocity(b.vx, b.vy, b.curveRadius, b.curveSign, dt);
        b.vx = steered.vx;
        b.vy = steered.vy;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // 俯视滚动（纯表现）：倍率压低，避免头像转太疯
      const sp = Math.hypot(b.vx, b.vy);
      if (sp >= REST && b.r > 0) {
        b.spin = (b.spin || 0) + (sp / b.r) * dt * SPIN_VISUAL;
      }

      const cap = Math.hypot(b.vx, b.vy);
      if (cap > MAX_SPEED) {
        b.vx = (b.vx / cap) * MAX_SPEED;
        b.vy = (b.vy / cap) * MAX_SPEED;
      }
    }
  }

  function goalXRange() {
    const half = PITCH.goalWidthM / 2;
    return {
      gx0: PITCH.widthM / 2 - half,
      gx1: PITCH.widthM / 2 + half,
    };
  }

  function collideWalls() {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const { gx0, gx1 } = goalXRange();

    for (const b of state.bodies) {
      // 左右边线（场内）
      if (b.y >= 0 && b.y <= L) {
        if (b.x - b.r < 0) {
          const impact = Math.abs(b.vx);
          b.x = b.r;
          b.vx = Math.abs(b.vx) * WALL_BOUNCE;
          clearBodyCurve(b);
          maybeImpactSpark(0, b.y, impact);
        } else if (b.x + b.r > W) {
          const impact = Math.abs(b.vx);
          b.x = W - b.r;
          b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
          clearBodyCurve(b);
          maybeImpactSpark(W, b.y, impact);
        }
      }

      // 门线开口：足球与球员均可进入（需大致对准球门宽度）
      const inGoalX = b.x > gx0 && b.x < gx1;
      const topOpen = inGoalX;
      const botOpen = inGoalX;

      // 上下底线：球门口开放，其余位置反弹
      if (!topOpen && b.y - b.r < 0) {
        const impact = Math.abs(b.vy);
        b.y = b.r;
        b.vy = Math.abs(b.vy) * WALL_BOUNCE;
        clearBodyCurve(b);
        maybeImpactSpark(b.x, 0, impact);
      } else if (!botOpen && b.y + b.r > L) {
        const impact = Math.abs(b.vy);
        b.y = L - b.r;
        b.vy = -Math.abs(b.vy) * WALL_BOUNCE;
        clearBodyCurve(b);
        maybeImpactSpark(b.x, L, impact);
      }

      // 向外球门槽：左右壁 + 后门网（球与球员）
      collideGoalPocket(b, gx0, gx1, 0, -D, true);
      collideGoalPocket(b, gx0, gx1, L, L + D, false);
      hitPost(b, gx0, 0);
      hitPost(b, gx1, 0);
      hitPost(b, gx0, L);
      hitPost(b, gx1, L);
    }
  }

  /** 球门槽碰撞：向外衍射的 U 形槽 */
  function collideGoalPocket(b, gx0, gx1, lineY, backY, isTop) {
    const inPocket = isTop
      ? b.y < lineY && b.y > backY - b.r
      : b.y > lineY && b.y < backY + b.r;
    if (!inPocket) return;

    // 左右门柱内壁
    if (b.x - b.r < gx0) {
      const impact = Math.abs(b.vx);
      b.x = gx0 + b.r;
      b.vx = Math.abs(b.vx) * WALL_BOUNCE;
      clearBodyCurve(b);
      maybeImpactSpark(gx0, b.y, impact);
    } else if (b.x + b.r > gx1) {
      const impact = Math.abs(b.vx);
      b.x = gx1 - b.r;
      b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
      clearBodyCurve(b);
      maybeImpactSpark(gx1, b.y, impact);
    }

    // 后门网
    if (isTop && b.y - b.r < backY) {
      const impact = Math.abs(b.vy);
      b.y = backY + b.r;
      b.vy = Math.abs(b.vy) * WALL_BOUNCE;
      clearBodyCurve(b);
      maybeImpactSpark(b.x, backY, impact);
    } else if (!isTop && b.y + b.r > backY) {
      const impact = Math.abs(b.vy);
      b.y = backY - b.r;
      b.vy = -Math.abs(b.vy) * WALL_BOUNCE;
      clearBodyCurve(b);
      maybeImpactSpark(b.x, backY, impact);
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
        clearBodyCurve(b);
        maybeImpactSpark(px, py, Math.abs(vn));
      }
    }
  }

  function collideBodies() {
    const list = state.bodies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
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

        // 弹性取双方 restitutionMult 平均，再乘全局基准并夹紧
        const eA = a.mods ? a.mods.restitutionMult : 1;
        const eB = b.mods ? b.mods.restitutionMult : 1;
        const e = Math.max(0.55, Math.min(0.98, BODY_RESTITUTION * 0.5 * (eA + eB)));
        const jImp = (-(1 + e) * velN) / inv;
        a.vx -= (jImp * nx) / a.mass;
        a.vy -= (jImp * ny) / a.mass;
        b.vx += (jImp * nx) / b.mass;
        b.vy += (jImp * ny) / b.mass;
        clearBodyCurve(a);
        clearBodyCurve(b);
        maybeImpactSpark(a.x + nx * a.r, a.y + ny * a.r, Math.abs(velN));

        if (a.isBall && !b.isBall) onPlayerBallTouch(b, a);
        else if (b.isBall && !a.isBall) onPlayerBallTouch(a, b);
        else if (!a.isBall && !b.isBall) onPlayerPlayerHit(a, b);
      }
    }
  }

  function allSlowEnough() {
    return state.bodies.every((b) => Math.hypot(b.vx, b.vy) < TURN_SWITCH_SPEED);
  }

  function freezeAll() {
    for (const b of state.bodies) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  function checkGoalAt(x, y, r) {
    const L = PITCH.lengthM;
    const { gx0, gx1 } = goalXRange();
    // 蓝在下攻上：整球进上门 → 蓝得分；红在上攻下：整球进下门 → 红得分
    // 上门 = 红方自家球门；下门 = 蓝方自家球门
    if (y + r < 0 && x - r > gx0 && x + r < gx1) return "A";
    if (y - r > L && x - r > gx0 && x + r < gx1) return "B";
    return null;
  }

  function checkGoal() {
    const b = ball();
    if (!b) return null;
    return checkGoalAt(b.x, b.y, b.r);
  }

  /**
   * 本步位移是否「整球越过门线」（门柱之间）。
   * 用于进球后同帧被门网/球员顶回场内、静止点已在门外时仍判进球（含乌龙）。
   */
  function checkGoalSweep(prevX, prevY) {
    const b = ball();
    if (!b) return null;
    const now = checkGoalAt(b.x, b.y, b.r);
    if (now) return now;
    if (prevX == null || prevY == null) return null;

    const L = PITCH.lengthM;
    const { gx0, gx1 } = goalXRange();
    const r = b.r;
    const dx = b.x - prevX;
    const dy = b.y - prevY;
    if (Math.abs(dy) < 1e-9) return null;

    // 整球过上门线：中心自上而下越过 y = -r
    const topY = -r;
    if (prevY >= topY && b.y < topY) {
      const t = (topY - prevY) / dy;
      if (t >= 0 && t <= 1) {
        const x = prevX + dx * t;
        if (x - r > gx0 && x + r < gx1) return "A";
      }
    }
    // 整球过下门线：中心自下而上越过 y = L + r
    const botY = L + r;
    if (prevY <= botY && b.y > botY) {
      const t = (botY - prevY) / dy;
      if (t >= 0 && t <= 1) {
        const x = prevX + dx * t;
        if (x - r > gx0 && x + r < gx1) return "B";
      }
    }
    return null;
  }

  /**
   * 乌龙：当前回合方踢进自家球门，且本击最后触球是该方球员。
   * scorer = 得分方（对方）；自家门：A→下门(scorer B)，B→上门(scorer A)
   */
  function isOwnGoal(scorer, endingTeam, ctx) {
    if (!scorer || !endingTeam || !ctx || ctx.lastTouchTeam !== endingTeam) return false;
    if (endingTeam === "A" && scorer === "B") return true;
    if (endingTeam === "B" && scorer === "A") return true;
    return false;
  }

  function afterSim() {
    const ctx = state.shotCtx;
    const endingTeam = state.turn;
    // 慢放已判定过则用锁定结果；否则当场再检
    const scorer = state.pendingScorer || checkGoal();
    state.pendingScorer = null;
    const ownGoal = isOwnGoal(scorer, endingTeam, ctx);

    // 梅老板：闲庭信步 —— 未碰到人/球则可再击（进球时不触发）
    const strollAgain =
      !scorer &&
      ctx &&
      ctx.skillId === "stroll" &&
      !ctx.hitBall &&
      !ctx.hitPlayer &&
      ctx.shooter;

    if (scorer) {
      state.goalSlowLeft = 0;
      state.goalFlash = 0;
      state.pendingScorer = null;
      if (scorer === "A") state.scoreA += 1;
      else state.scoreB += 1;
      tickStatusOnTurnEnd(endingTeam);
      state.shotCtx = null;
      syncUI();

      const need = state.winScore || WIN_SCORE;
      if (state.scoreA >= need || state.scoreB >= need) {
        const winner = state.scoreA >= need ? "A" : "B";
        const training = !!state.trainingId;
        const cleared = training && winner === "A";

        // 新手教程失败：不弹失败窗、不退出，原地复位重开
        if (training && !cleared && state.autoRetryOnFail) {
          freezeAll();
          if (typeof state.onAutoRetry === "function") {
            try {
              state.onAutoRetry();
            } catch (err) {
              console.error("onAutoRetry failed", err);
            }
          }
          restartMatch();
          return;
        }

        setPhase("over");
        showOverlay(
          cleared ? "通关！" : training ? "挑战失败" : `${teamName(winner)}获胜`,
          cleared
            ? "已通关本关，可返回训练页继续。"
            : training
              ? "对方先破门。点继续返回训练页再试。"
              : ownGoal
                ? `乌龙定胜负！最终比分 ${state.scoreA} : ${state.scoreB}`
                : `最终比分 ${state.scoreA} : ${state.scoreB}`,
          () => {
            const cb = state.onMatchOver;
            if (typeof cb === "function") {
              state.onMatchOver = null;
              cb(winner);
              return;
            }
            restartMatch();
          },
          {
            team: winner,
            eyebrow: cleared ? "CLEAR" : training ? "FAILED" : "MATCH OVER",
          }
        );
        return;
      }

      setPhase("goal");
      const kickOff = scorer === "A" ? "B" : "A";
      if (ownGoal) {
        showOverlay(
          "乌龙球!",
          `${teamName(endingTeam)}乌龙，${teamName(scorer)}得分！ ${state.scoreA} : ${state.scoreB}`,
          () => {
            resetPositions(true, kickOff);
            state.turn = kickOff;
            state.selected = null;
            syncEnergyDock();
            setPhase("select");
          },
          { team: scorer, eyebrow: "OWN GOAL" }
        );
      } else {
        showOverlay(
          "GOAL!",
          `${teamName(scorer)}进球！ ${state.scoreA} : ${state.scoreB}`,
          () => {
            resetPositions(true, kickOff);
            state.turn = kickOff;
            state.selected = null;
            syncEnergyDock();
            setPhase("select");
          },
          { team: scorer, eyebrow: "GOAL" }
        );
      }
      return;
    }

    if (strollAgain) {
      state.shotCtx = null;
      state.strollBonus = true;
      state.selected = null;
      state.power = 0;
      syncEnergyDock();
      setPhase("select");
      return;
    }

    tickStatusOnTurnEnd(endingTeam);
    state.shotCtx = null;
    state.strollBonus = false;
    state.turn = state.turn === "A" ? "B" : "A";
    state.selected = null;
    syncEnergyDock();
    setPhase("select");
  }

  function computeShotVelocity() {
    const aim = normalize(state.aim.x, state.aim.y);
    if (state.selected) refreshPlayerMods(state.selected);
    const mult = state.selected && state.selected.mods ? state.selected.mods.powerMult : 1;
    const power = state.power * MAX_POWER * mult;
    return {
      vx: aim.x * power,
      vy: aim.y * power,
      aim,
      power,
    };
  }

  function shoot(opts) {
    const fromRemote = !!(opts && opts.fromRemote);
    const p = state.selected;
    if (!p || state.power <= 0) return;
    // 出手后清掉尚未触发的 AI 定时器，避免重复射击
    for (const id of aiTimers) clearTimeout(id);
    aiTimers = [];
    state.aiThinking = false;
    state.strollBonus = false;

    if (!fromRemote && state.onNetEvent) {
      state.onNetEvent({
        type: "shot",
        playerId: p.id,
        aim: { x: state.aim.x, y: state.aim.y },
        power: state.power,
        curveSign: state.curveSign || 0,
        curveRadius: state.curveRadius,
        skillArmed: !!p.skillArmed,
      });
    }

    const skillId = applySkillOnShoot(p);
    beginShotContext(p, skillId);
    refreshPlayerMods(p);

    const v = computeShotVelocity();
    p.vx = v.vx;
    p.vy = v.vy;
    if (playerCanCurve(p) && state.curveSign && state.curveRadius > 0) {
      const { rMin } = selectedCurveLimits();
      p.curveSign = state.curveSign;
      p.curveRadius = Math.max(rMin, state.curveRadius);
    } else {
      clearBodyCurve(p);
    }
    p.disableCurveShot = false;
    state.dragging = false;
    state.dragOrigin = null;
    state.dragStartClient = null;
    state.finger = null;
    state.primaryPointerId = null;
    state.curvePointerId = null;
    state.curveFingerClient = null;
    setPhase("sim");
  }

  /**
   * 应用对方发来的一击。
   * 若本机还在仿真 / 进球慢放 / 弹窗阶段，先入队，等进入 select 再执行，
   * 避免「一方已出手、另一方直接丢弃」导致永久不同步。
   */
  function applyRemoteShot(msg) {
    if (!msg || !state.running) return false;
    if (!canApplyRemoteShotNow()) {
      // 同 seq 去重，避免 ACK 重发叠两枪
      if (
        msg.seq != null &&
        state.pendingRemoteShots.some((m) => m && m.seq === msg.seq)
      ) {
        return true;
      }
      state.pendingRemoteShots.push(msg);
      // 进球弹窗开着：立刻关掉进入下一回合，消化对方已发出的击球
      if (
        (state.phase === "goal" || state.phase === "over") &&
        el.overlay &&
        !el.overlay.classList.contains("hidden")
      ) {
        hideOverlay();
      }
      // 慢放阶段：加速结束，避免对方等太久
      if (state.phase === "goalSlow") {
        state.goalSlowLeft = 0;
      }
      return true;
    }
    return applyRemoteShotNow(msg);
  }

  function applyRemoteShotNow(msg) {
    if (!msg || !state.running) return false;
    if (msg.seq != null && state.appliedRemoteSeqs[msg.seq]) return true;
    const p = state.bodies.find((b) => !b.isBall && b.id === msg.playerId);
    if (!p) return false;
    // 回合已切走则丢弃（陈旧包）；仍在对方回合则应用
    if (p.team !== state.turn) return false;
    if (p.injuredTurns > 0) return false;

    if (msg.seq != null) state.appliedRemoteSeqs[msg.seq] = true;
    cancelAim();
    state.selected = p;
    if (msg.skillArmed && p.skill && p.energy >= 1) p.skillArmed = true;
    else p.skillArmed = false;

    const ax = msg.aim && typeof msg.aim.x === "number" ? msg.aim.x : 0;
    const ay = msg.aim && typeof msg.aim.y === "number" ? msg.aim.y : 1;
    state.aim = normalize(ax, ay);
    state.power = Math.max(0.05, Math.min(1, Number(msg.power) || 0));
    state.curveSign = msg.curveSign || 0;
    state.curveRadius =
      typeof msg.curveRadius === "number" ? msg.curveRadius : CURVE_R_MAX;
    state.dragging = false;
    // 直接进入仿真，避免 setPhase("aim") 再套一层触发 flush 重入
    state.phase = "aim";
    syncUI();
    shoot({ fromRemote: true });
    return true;
  }

  function applyRemoteArm(msg) {
    if (!msg || !state.running) return false;
    toggleSkillArm(msg.bodyId, {
      fromRemote: true,
      skillArmed: !!msg.skillArmed,
    });
    return true;
  }

  function applyRemoteRestart() {
    if (!state.running) return false;
    hideOverlay();
    restartMatch();
    return true;
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  function pickPlayer(wx, wy) {
    let best = null;
    let bestD = Infinity;
    for (const b of state.bodies) {
      if (b.team !== state.turn) continue;
      if (b.injuredTurns > 0) continue;
      const d = Math.hypot(b.x - wx, b.y - wy);
      if (d <= b.r * 1.35 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  function cancelAim() {
    state.selected = null;
    state.power = 0;
    state.dragging = false;
    state.dragOrigin = null;
    state.dragStartClient = null;
    state.finger = null;
    state.primaryPointerId = null;
    resetCurveInput();
    setPhase("select");
  }

  function restartMatch() {
    clearAiTimers();
    clearFx();
    state.scoreA = 0;
    state.scoreB = 0;
    state.turn = "A";
    state.selected = null;
    state.power = 0;
    state.dragging = false;
    state.dragOrigin = null;
    state.dragStartClient = null;
    state.finger = null;
    state.primaryPointerId = null;
    state.shotCtx = null;
    state.strollBonus = false;
    state.goalSlowLeft = 0;
    state.goalFlash = 0;
    state.pendingScorer = null;
    resetCurveInput();
    state.keys.a = false;
    state.keys.d = false;
    resetPositions(false);
    syncEnergyDock();
    setPhase("select");
  }

  /**
   * 拖拽蓄力：原点固定在球员圆心；
   * 手指相对按下点的位移，等价映射为「从圆心拉出」；
   * 拉动方向的反方向弹出；拖动距离 = 力度（有上限）
   */
  function updateDragFromFinger(sx, sy) {
    if (!state.selected || state.selected.isBall || !state.dragStartClient) return;

    const c = bodyCenterClient(state.selected);
    state.dragOrigin = { x: c.x, y: c.y };

    const dx = sx - state.dragStartClient.x;
    const dy = sy - state.dragStartClient.y;
    state.finger = { x: c.x + dx, y: c.y + dy };
    const dist = Math.hypot(dx, dy);

    if (dist < 1) {
      state.power = 0;
      syncUI();
      return;
    }

    state.power = Math.min(dist, MAX_PULL_PX) / MAX_PULL_PX;
    // 往哪边拉，就往反方向弹（含视角翻转）
    state.aim = screenDirToWorldAim(dx, dy);
    syncUI();
  }

  // ——— 绘制 ———
  function fillWorldQuad(x0, y0, x1, y1, fill) {
    const a = worldToScreen(x0, y0);
    const b = worldToScreen(x1, y0);
    const c = worldToScreen(x1, y1);
    const d = worldToScreen(x0, y1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function strokeWorldQuad(x0, y0, x1, y1) {
    const a = worldToScreen(x0, y0);
    const b = worldToScreen(x1, y0);
    const c = worldToScreen(x1, y1);
    const d = worldToScreen(x0, y1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.stroke();
  }

  /** 场外围美术：铺满后按物理轮廓把中间扣掉，避免线重叠 */
  function drawPitchArtBackdrop() {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const pad = VIEW_PAD_M;
    const corners = [
      worldToScreen(-pad, -D - pad),
      worldToScreen(W + pad, -D - pad),
      worldToScreen(-pad, L + D + pad),
      worldToScreen(W + pad, L + D + pad),
    ];
    const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
    const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
    const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
    const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
    const dw = maxX - minX;
    const dh = maxY - minY;
    const hole = pitchOutlineScreen();

    ctx.save();
    // evenodd：外框保留，球场+球门槽挖空
    ctx.beginPath();
    ctx.rect(minX - 1, minY - 1, dw + 2, dh + 2);
    pathFromPoints(hole);
    ctx.clip("evenodd");

    if (viewFlipActive()) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(pitchArt, minX, minY, dw, dh);
    ctx.restore();
  }

  /** 沿球场边界内侧画阴影，强化「凹下去」 */
  function drawPitchRecessShade() {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const { gx0, gx1 } = goalXRange();
    const band = Math.max(10, scale * 2.8);

    ctx.save();
    ctx.beginPath();
    pathFromPoints(pitchOutlineScreen());
    ctx.clip();

    const edges = [
      [worldToScreen(0, 0), worldToScreen(0, L), 1, 0],
      [worldToScreen(W, 0), worldToScreen(W, L), -1, 0],
      [worldToScreen(0, 0), worldToScreen(gx0, 0), 0, 1],
      [worldToScreen(gx1, 0), worldToScreen(W, 0), 0, 1],
      [worldToScreen(0, L), worldToScreen(gx0, L), 0, -1],
      [worldToScreen(gx1, L), worldToScreen(W, L), 0, -1],
      [worldToScreen(gx0, -D), worldToScreen(gx0, 0), 1, 0],
      [worldToScreen(gx1, -D), worldToScreen(gx1, 0), -1, 0],
      [worldToScreen(gx0, L), worldToScreen(gx0, L + D), 1, 0],
      [worldToScreen(gx1, L), worldToScreen(gx1, L + D), -1, 0],
      [worldToScreen(gx0, -D), worldToScreen(gx1, -D), 0, 1],
      [worldToScreen(gx0, L + D), worldToScreen(gx1, L + D), 0, -1],
    ];

    for (const [a, b, nx, ny] of edges) {
      const g = ctx.createLinearGradient(
        a.x,
        a.y,
        a.x + nx * band,
        a.y + ny * band
      );
      g.addColorStop(0, "rgba(20,60,90,0.22)");
      g.addColorStop(0.55, "rgba(20,60,90,0.08)");
      g.addColorStop(1, "rgba(20,60,90,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x + nx * band, b.y + ny * band);
      ctx.lineTo(a.x + nx * band, a.y + ny * band);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 玻璃感围边高光 */
  function drawPitchCurb() {
    const t = Math.max(2.8, scale * 0.6);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.beginPath();
    pathFromPoints(pitchOutlineScreen());
    ctx.strokeStyle = "rgba(80,190,255,0.85)";
    ctx.lineWidth = t;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1, t * 0.35);
    ctx.stroke();
    ctx.restore();
  }

  function drawPitch() {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const { gx0, gx1 } = goalXRange();

    // 明亮沙漠天兜底
    const bog = ctx.createLinearGradient(0, 0, 0, viewH);
    bog.addColorStop(0, "#7ec8f5");
    bog.addColorStop(0.35, "#f0d58a");
    bog.addColorStop(1, "#e8c36a");
    ctx.fillStyle = bog;
    ctx.fillRect(0, 0, viewW, viewH);

    if (pitchArtReady) {
      drawPitchArtBackdrop();
    }

    // 可玩区草皮：不透明，只保留程序线
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      const y0 = (L / stripes) * i;
      const y1 = (L / stripes) * (i + 1) + 0.05;
      const base = i % 2 === 0 ? "#3cb86a" : "#34a85c";
      fillWorldQuad(0, y0, W, y1, base);
    }

    drawGoalPocket(gx0, gx1, -D, 0, true);
    drawGoalPocket(gx0, gx1, L, L + D, false);

    drawPitchRecessShade();
    drawPitchCurb();

    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(1.5, scale * 0.12);
    const tl = worldToScreen(0, 0);
    const tr = worldToScreen(W, 0);
    const bl = worldToScreen(0, L);
    const br = worldToScreen(W, L);
    const tg0 = worldToScreen(gx0, 0);
    const tg1 = worldToScreen(gx1, 0);
    const bg0 = worldToScreen(gx0, L);
    const bg1 = worldToScreen(gx1, L);

    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tg0.x, tg0.y);
    ctx.moveTo(tg1.x, tg1.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.moveTo(bl.x, bl.y);
    ctx.lineTo(bg0.x, bg0.y);
    ctx.moveTo(bg1.x, bg1.y);
    ctx.lineTo(br.x, br.y);
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.moveTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.62)";
    ctx.lineWidth = Math.max(1.2, scale * 0.09);
    const penW = PITCH.penaltyW || 40.32;
    const penD = PITCH.penaltyD || 16.5;
    const sixW = PITCH.sixYardW || 18.32;
    const sixD = PITCH.sixYardD || 5.5;
    const spotY = PITCH.penaltySpot || 11;
    const px0 = (W - penW) / 2;
    const sx0 = (W - sixW) / 2;
    strokeWorldQuad(px0, 0, px0 + penW, penD);
    strokeWorldQuad(sx0, 0, sx0 + sixW, sixD);
    strokeWorldQuad(px0, L - penD, px0 + penW, L);
    strokeWorldQuad(sx0, L - sixD, sx0 + sixW, L);

    const spotR = Math.max(1.6, 0.22 * scale);
    for (const sy of [spotY, L - spotY]) {
      const sp = worldToScreen(W / 2, sy);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, spotR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
    }

    const ml0 = worldToScreen(0, L / 2);
    const ml1 = worldToScreen(W, L / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1.5, scale * 0.12);
    ctx.beginPath();
    ctx.moveTo(ml0.x, ml0.y);
    ctx.lineTo(ml1.x, ml1.y);
    ctx.stroke();

    const c = worldToScreen(W / 2, L / 2);
    ctx.beginPath();
    ctx.arc(c.x, c.y, PITCH.centerCircleR * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(2, 0.28 * scale), 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  function drawGoalPocket(gx0, gx1, y0, y1, isTop) {
    const a = worldToScreen(gx0, y0);
    const b = worldToScreen(gx1, y1);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);

    ctx.fillStyle = "#2a9a58";
    ctx.fillRect(x, y, w, h);

    // 交叉网线
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    const step = Math.max(6, Math.min(w, h) / 5);
    for (let i = -h; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
    }
    ctx.restore();

    // 门柱高光
    ctx.strokeStyle = "rgba(250,250,250,0.95)";
    ctx.lineWidth = Math.max(2.8, scale * 0.24);
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, scale * 0.08);
    ctx.strokeRect(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h - 4));

    // 门线高亮
    ctx.strokeStyle = "#c8f542";
    ctx.lineWidth = Math.max(2, scale * 0.18);
    const lineY = isTop ? worldToScreen(gx0, y1).y : worldToScreen(gx0, y0).y;
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + w, lineY);
    ctx.stroke();
  }

  /** 足球：白底 + 旋转块面/缝线，滑动时能看出在滚 */
  function drawBallBody(b, p, r) {
    const spin = b.spin || 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(spin);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "#f2f2f2";
    ctx.fill();

    // 块面
    ctx.fillStyle = "#1a1a1a";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const cx = Math.cos(a) * r * 0.42;
      const cy = Math.sin(a) * r * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // 缝线十字，强化旋转可读性
    ctx.strokeStyle = "rgba(40,40,40,0.55)";
    ctx.lineWidth = Math.max(1.2, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, 0);
    ctx.lineTo(r * 0.85, 0);
    ctx.moveTo(0, -r * 0.85);
    ctx.lineTo(0, r * 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /** 世界瞄准方向 → 屏幕方向（视角翻转时转 180°） */
  function worldAimToScreenDir(aim) {
    if (!viewFlipActive()) return { x: aim.x, y: aim.y };
    return { x: -aim.x, y: -aim.y };
  }

  function drawLaunchArrow(cx, cy, aim, length, color) {
    const dir = worldAimToScreenDir(aim);
    const mag = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / mag;
    const uy = dir.y / mag;
    const ex = cx + ux * length;
    const ey = cy + uy * length;
    const head = Math.max(7, length * 0.28);
    const px = -uy;
    const py = ux;

    ctx.beginPath();
    ctx.moveTo(cx + ux * 2, cy + uy * 2);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * head + px * head * 0.45, ey - uy * head + py * head * 0.45);
    ctx.lineTo(ex - ux * head - px * head * 0.45, ey - uy * head - py * head * 0.45);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** 球员：圆形大头照棋子（随 spin 旋转）+ 队伍描边 / 状态环 */
  function drawPlayerBody(b, p, r) {
    const spin = b.spin || 0;
    const selected = state.selected === b;
    const mine = b.team === state.turn && (state.phase === "select" || state.phase === "aim");
    const canPick = mine && state.phase === "select" && !selected && !isAiTurn();
    const dim = !mine && (state.phase === "select" || state.phase === "aim");
    const fill = b.team === "A" ? "#3d7bfd" : "#e74c3c";
    const fillDeep = b.team === "A" ? "#1f4fb8" : "#a8281c";
    const stripe = b.team === "A" ? "#9ec0ff" : "#ffb0a8";
    const hasAvatar = avatarReady(b.defId);
    const avatar = hasAvatar ? avatarImgs[b.defId] : null;

    // 脚下阴影
    ctx.save();
    ctx.globalAlpha = dim ? 0.22 : 0.38;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.62, r * 0.78, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 能量满：外圈向外发光（己方/对方均提示）
    if (b.energy >= 1) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);
      const glow = b.team === "A" ? "120,200,255" : "255,180,120";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5 + pulse * 5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${glow},${0.25 + pulse * 0.45})`;
      ctx.lineWidth = 3.5 + pulse * 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2 + pulse * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,245,66,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 受伤标记
    if (b.injuredTurns > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,80,80,0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 本回合可点：呼吸描边
    if (canPick) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2.5 + pulse * 3.2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.22 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    if (dim) ctx.globalAlpha = 0.52;

    if (avatar) {
      // 队伍色底圈（头像透明边缘时仍能看出阵营）
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = fillDeep;
      ctx.fill();

      ctx.save();
      ctx.rotate(spin);
      ctx.beginPath();
      ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
      ctx.clip();
      const d = r * 2;
      ctx.drawImage(avatar, -r, -r, d, d);
      ctx.restore();
    } else {
      // 头像未加载时的回退棋子
      const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      grad.addColorStop(0, stripe);
      grad.addColorStop(0.45, fill);
      grad.addColorStop(1, fillDeep);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.save();
      ctx.rotate(spin);
      ctx.beginPath();
      ctx.rect(-r, -r * 0.22, r * 2, r * 0.44);
      ctx.fillStyle = stripe;
      ctx.globalAlpha = dim ? 0.2 : 0.35;
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(11, r * 0.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 2;
      ctx.fillText(String(b.number || b.id.slice(-1)), 0, 0.5);
      ctx.shadowBlur = 0;
    }

    // 队伍色描边（不随头像纹样转，避免晃眼）
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (selected) {
      ctx.strokeStyle = "#c8f542";
      ctx.lineWidth = 3.2;
    } else if (mine) {
      ctx.strokeStyle = b.team === "A" ? "rgba(158,192,255,0.95)" : "rgba(255,176,168,0.95)";
      ctx.lineWidth = 2.2;
    } else {
      ctx.strokeStyle = b.team === "A" ? "rgba(61,123,253,0.85)" : "rgba(231,76,60,0.85)";
      ctx.lineWidth = 1.8;
    }
    ctx.stroke();
    ctx.restore();

    // 选中酸柠外环（不随 spin 转）
    if (selected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,245,66,0.85)";
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  function drawBodies() {
    for (const b of state.bodies) {
      const p = worldToScreen(b.x, b.y);
      const r = b.r * scale;
      if (b.isBall) drawBallBody(b, p, r);
      else drawPlayerBody(b, p, r);
    }
  }

  /**
   * 预判轨迹（世界坐标）：
   * - 含一次墙/圆障碍折射
   * - 第二次碰撞处截断
   * - 返回 { pts, bounce }；绘制时再取约 2/3
   */
  function predictTrajectory(mover, vx0, vy0, curveSign, curveRadius) {
    const W = PITCH.widthM;
    const L = PITCH.lengthM;
    const D = PITCH.goalDepthM;
    const { gx0, gx1 } = goalXRange();
    const others = state.bodies.filter((b) => b !== mover);
    const dt = 1 / 60;
    const maxSteps = Math.max(TRAIL_STEPS * 2, 160);

    let x = mover.x;
    let y = mover.y;
    let vx = vx0;
    let vy = vy0;
    const r = mover.r;
    let bounced = false;
    let bouncePt = null;
    let curving = !!(curveSign && curveRadius > 0);
    const pts = [{ x, y }];

    function markBounce() {
      if (!bouncePt) bouncePt = { x, y };
    }

    function reflectWallNormal(nx, ny) {
      const vn = vx * nx + vy * ny;
      if (vn >= 0) return false;
      vx -= (1 + WALL_BOUNCE) * vn * nx;
      vy -= (1 + WALL_BOUNCE) * vn * ny;
      return true;
    }

    function tryCircleHit(ox, oy, orad) {
      const dx = x - ox;
      const dy = y - oy;
      const min = r + orad;
      const dist = Math.hypot(dx, dy);
      if (dist >= min || dist < 1e-6) return "none";
      const nx = dx / dist;
      const ny = dy / dist;
      const vn = vx * nx + vy * ny;
      if (vn >= 0) {
        // 略微分开避免粘连
        x = ox + nx * min;
        y = oy + ny * min;
        return "none";
      }
      if (bounced) return "second";
      x = ox + nx * (min + 0.02);
      y = oy + ny * (min + 0.02);
      vx -= (1 + BODY_RESTITUTION) * vn * nx;
      vy -= (1 + BODY_RESTITUTION) * vn * ny;
      bounced = true;
      curving = false;
      markBounce();
      return "first";
    }

    function resolveWalls() {
      // 左右（场内或球门槽内）
      if (y >= 0 && y <= L) {
        if (x - r < 0) {
          if (bounced) return "second";
          x = r;
          if (reflectWallNormal(1, 0)) bounced = true;
          return "first";
        }
        if (x + r > W) {
          if (bounced) return "second";
          x = W - r;
          if (reflectWallNormal(-1, 0)) bounced = true;
          return "first";
        }
      }

      const inGoalX = x > gx0 && x < gx1;
      if (!inGoalX && y - r < 0) {
        if (bounced) return "second";
        y = r;
        if (reflectWallNormal(0, 1)) bounced = true;
        return "first";
      }
      if (!inGoalX && y + r > L) {
        if (bounced) return "second";
        y = L - r;
        if (reflectWallNormal(0, -1)) bounced = true;
        return "first";
      }

      // 上门槽
      if (y < 0) {
        if (x - r < gx0) {
          if (bounced) return "second";
          x = gx0 + r;
          if (reflectWallNormal(1, 0)) bounced = true;
          return "first";
        }
        if (x + r > gx1) {
          if (bounced) return "second";
          x = gx1 - r;
          if (reflectWallNormal(-1, 0)) bounced = true;
          return "first";
        }
        if (y - r < -D) {
          if (bounced) return "second";
          y = -D + r;
          if (reflectWallNormal(0, 1)) bounced = true;
          return "first";
        }
      }
      // 下门槽
      if (y > L) {
        if (x - r < gx0) {
          if (bounced) return "second";
          x = gx0 + r;
          if (reflectWallNormal(1, 0)) bounced = true;
          return "first";
        }
        if (x + r > gx1) {
          if (bounced) return "second";
          x = gx1 - r;
          if (reflectWallNormal(-1, 0)) bounced = true;
          return "first";
        }
        if (y + r > L + D) {
          if (bounced) return "second";
          y = L + D - r;
          if (reflectWallNormal(0, -1)) bounced = true;
          return "first";
        }
      }

      // 门柱
      const posts = [
        [gx0, 0],
        [gx1, 0],
        [gx0, L],
        [gx1, L],
      ];
      for (const [px, py] of posts) {
        const hit = tryCircleHit(px, py, 0.7);
        if (hit !== "none") return hit;
      }
      return "none";
    }

    const dragMult = mover.mods ? mover.mods.dragMult : 1;
    for (let i = 0; i < maxSteps; i++) {
      const damp = Math.exp(-DRAG * dragMult * dt);
      vx *= damp;
      vy *= damp;
      if (Math.hypot(vx, vy) < REST) break;

      if (curving) {
        const steered = steerVelocity(vx, vy, curveRadius, curveSign, dt);
        vx = steered.vx;
        vy = steered.vy;
      }

      x += vx * dt;
      y += vy * dt;

      let hit = resolveWalls();
      if (hit === "first") {
        curving = false;
        markBounce();
      }
      if (hit === "second") {
        pts.push({ x, y });
        break;
      }

      for (const o of others) {
        hit = tryCircleHit(o.x, o.y, o.r);
        if (hit === "first") {
          curving = false;
          markBounce();
        }
        if (hit === "second") {
          pts.push({ x, y });
          return { pts, bounce: bouncePt };
        }
      }

      pts.push({ x, y });
    }

    return { pts, bounce: bouncePt };
  }

  function trimPathToFraction(pts, fraction) {
    if (pts.length < 2) return pts;
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    const limit = total * fraction;
    if (limit <= 0) return [pts[0]];

    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + seg >= limit) {
        const t = (limit - acc) / seg;
        out.push({
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        });
        break;
      }
      acc += seg;
      out.push(pts[i]);
    }
    return out;
  }

  function drawAimAssist() {
    if (state.phase !== "aim" || !state.selected) return;
    const p = state.selected;
    const sp = worldToScreen(p.x, p.y);
    const pr = p.r * scale;
    const ringR = pr + 9;

    // 蓄力环底 + 满力圈
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, MAX_PULL_PX, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(200,245,66,0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 拉回辅助线：始终从球员圆心拉出
    if (state.dragging && state.finger && state.power > 0) {
      const rect = canvas.getBoundingClientRect();
      const fx = state.finger.x - rect.left;
      const fy = state.finger.y - rect.top;

      ctx.beginPath();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.6;
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
    }

    if (state.power <= 0.02) return;

    // 蓄力填充弧：灰 → 酸柠，线宽随力度略增
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * state.power;
    const t = state.power;
    const rCol = Math.round(160 + (200 - 160) * t);
    const gCol = Math.round(160 + (245 - 160) * t);
    const bCol = Math.round(160 + (66 - 160) * t);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, ringR, start, end);
    ctx.strokeStyle = `rgb(${rCol},${gCol},${bCol})`;
    ctx.lineWidth = 4 + t * 3;
    ctx.lineCap = "round";
    ctx.stroke();

    // 弹出方向箭头
    drawLaunchArrow(
      sp.x,
      sp.y,
      state.aim,
      pr + 16 + state.power * 22,
      `rgba(200,245,66,${0.55 + state.power * 0.4})`
    );

    // 弧线弯度环 + 标签（键盘/副指通用）
    if (state.curveSign) {
      const bend = curveBend01();
      const cr = ringR + 7;
      const curveCol =
        state.curveSign < 0 ? "rgba(120,200,255,0.95)" : "rgba(255,176,120,0.95)";
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, cr, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, cr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bend);
      ctx.strokeStyle = curveCol;
      ctx.lineWidth = 3.6;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.font = `bold ${Math.max(11, pr * 0.42)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = curveCol;
      ctx.fillText(state.curveSign < 0 ? "◀ 左旋" : "右旋 ▶", sp.x, sp.y - pr - 14);
    }

    // 副指弧线目标点（强化）
    if (state.curveFingerClient) {
      const rect = canvas.getBoundingClientRect();
      const cx = state.curveFingerClient.x - rect.left;
      const cy = state.curveFingerClient.y - rect.top;
      const active = !!state.curveSign;
      const col = !active
        ? "rgba(255,255,255,0.45)"
        : state.curveSign < 0
          ? "rgba(120,200,255,0.95)"
          : "rgba(255,176,120,0.95)";

      // 弯向连接（二次贝塞尔，向侧向鼓出）
      const mx = (sp.x + cx) / 2;
      const my = (sp.y + cy) / 2;
      const aimDir = worldAimToScreenDir(state.aim);
      const side = active
        ? state.curveSign < 0
          ? { x: aimDir.y, y: -aimDir.x }
          : { x: -aimDir.y, y: aimDir.x }
        : { x: 0, y: 0 };
      const bulge = 18 + curveBend01() * 28;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.quadraticCurveTo(mx + side.x * bulge, my + side.y * bulge, cx, cy);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = active ? col.replace("0.95", "0.45") : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = col;
      ctx.fillText(active ? (state.curveSign < 0 ? "左" : "右") : "—", cx, cy - 18);
    }

    const { vx, vy } = computeShotVelocity();
    const cSign = state.curveSign || 0;
    const cRad = state.curveSign ? state.curveRadius : 0;
    const pred = predictTrajectory(p, vx, vy, cSign, cRad);
    const full = pred.pts;
    const bounce = pred.bounce;
    const pts = trimPathToFraction(full, 2 / 3);
    if (pts.length < 2) return;

    // 虚线：力量越大越密（间隙越小）
    const dashLen = 4 + state.power * 3;
    const gapLen = 14 - state.power * 11;
    ctx.beginPath();
    ctx.setLineDash([dashLen, Math.max(2.5, gapLen)]);
    ctx.strokeStyle = "rgba(200,245,66,0.9)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    const s0 = worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < pts.length; i++) {
      const s = worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const last = pts[pts.length - 1];
    const sl = worldToScreen(last.x, last.y);
    ctx.beginPath();
    ctx.arc(sl.x, sl.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,245,66,0.95)";
    ctx.fill();

    // 第一次碰撞/折射点高亮
    if (bounce) {
      const bp = worldToScreen(bounce.x, bounce.y);
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 160);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 7 + pulse * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.35})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 230, 90, 0.95)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
  }

  function drawGoalFlash() {
    if (!state.goalFlash || state.goalFlash <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.55 * state.goalFlash})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, viewW, viewH);
    drawPitch();
    drawBodies();
    drawFx();
    drawAimAssist();
    drawGoalFlash();
  }

  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    updateFx(dt);

    if (state.phase === "aim") {
      updateCurveFromKeys(dt);
    }

    if (state.phase === "sim") {
      let scored = null;
      while (acc >= STEP) {
        const bb = ball();
        const prevX = bb ? bb.x : null;
        const prevY = bb ? bb.y : null;
        integrate(STEP);
        // 位移后立刻判：避免随后门网/撞人把球顶回门外漏判（含乌龙）
        scored = checkGoalSweep(prevX, prevY);
        collideBodies();
        if (!scored) scored = checkGoal();
        collideWalls();
        tickSuyaBite();
        if (!scored) scored = checkGoal();
        if (scored) break;
        acc -= STEP;
      }
      // 二段还在等减速时不要提前结束回合
      const suyaWaiting =
        state.shotCtx &&
        state.shotCtx.suyaBitePending &&
        !state.shotCtx.suyaBiteDone;
      if (scored) {
        acc = 0;
        beginGoalSlowMo(scored);
      } else if (allSlowEnough() && !suyaWaiting) {
        acc = 0;
        freezeAll();
        afterSim();
      }
    } else if (state.phase === "goalSlow") {
      while (acc >= STEP) {
        const slowStep = STEP * GOAL_SLOW_SCALE;
        integrate(slowStep);
        collideBodies();
        collideWalls();
        tickSuyaBite();
        // 每步钳回门内，避免门网反弹把「已进球」顶丢
        pinBallInGoal(state.pendingScorer);
        state.goalSlowLeft -= STEP;
        state.goalFlash = Math.max(0, state.goalFlash - STEP * 1.8);
        acc -= STEP;
        if (state.goalSlowLeft <= 0) break;
      }
      if (state.goalSlowLeft <= 0) {
        acc = 0;
        state.goalFlash = 0;
        freezeAll();
        afterSim();
      }
    } else {
      acc = 0;
      if (state.goalFlash > 0) {
        state.goalFlash = Math.max(0, state.goalFlash - dt * 2.5);
      }
    }

    render();
    rafId = requestAnimationFrame(frame);
  }

  function onPointerDown(e) {
    if (!state.running) return;
    if (inputBlocked()) return;
    if (state.phase === "select") {
      const w = screenToWorld(e.clientX, e.clientY);
      const p = pickPlayer(w.x, w.y);
      if (p) beginAimOnPlayer(p, e);
      return;
    }

    if (state.phase === "aim" && state.selected) {
      // 副指：主指蓄力中时，另一指控制弧线（新手锁弧时忽略）
      if (
        state.dragging &&
        state.primaryPointerId != null &&
        e.pointerId !== state.primaryPointerId
      ) {
        if (state.curveLocked) return;
        state.curvePointerId = e.pointerId;
        state.curveTouchOrigin = { x: e.clientX, y: e.clientY };
        state.curveFromTouch = true;
        // 按下瞬间不给弧度，等侧滑再拧
        state.curveSign = 0;
        state.curveRadius = CURVE_R_MAX;
        state.curveFingerClient = { x: e.clientX, y: e.clientY };
        syncUI();
        return;
      }

      const w = screenToWorld(e.clientX, e.clientY);
      const p = pickPlayer(w.x, w.y);
      if (p && p !== state.selected) {
        beginAimOnPlayer(p, e);
        return;
      }

      state.dragging = true;
      state.primaryPointerId = e.pointerId;
      const c = bodyCenterClient(state.selected);
      state.dragOrigin = { x: c.x, y: c.y };
      state.dragStartClient = { x: e.clientX, y: e.clientY };
      state.finger = { x: c.x, y: c.y };
      state.power = 0;
      syncUI();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
  }

  function onPointerMove(e) {
    if (!state.running || state.phase !== "aim") return;
    if (inputBlocked()) return;

    if (state.curvePointerId != null && e.pointerId === state.curvePointerId) {
      updateCurveFromTouch(e.clientX, e.clientY);
      return;
    }

    if (state.dragging && e.pointerId === state.primaryPointerId) {
      updateDragFromFinger(e.clientX, e.clientY);
    }
  }

  function onPointerUp(e) {
    if (!state.running || state.phase !== "aim") return;
    if (inputBlocked()) return;

    // 副指抬起：保持当前弧线参数（原点清掉，方便下次重拧）
    if (state.curvePointerId != null && e.pointerId === state.curvePointerId) {
      state.curvePointerId = null;
      state.curveFingerClient = null;
      state.curveTouchOrigin = null;
      // 仍标记为触控弧线，避免被键盘立刻覆盖；下一次按 A/D 时再让键盘接管
      return;
    }

    if (!state.dragging || e.pointerId !== state.primaryPointerId) return;

    updateDragFromFinger(e.clientX, e.clientY);

    const pullDist = state.dragOrigin && state.finger
      ? Math.hypot(state.finger.x - state.dragOrigin.x, state.finger.y - state.dragOrigin.y)
      : 0;

    state.dragging = false;
    state.primaryPointerId = null;

    if (pullDist >= MIN_PULL_PX && state.power > 0.05) {
      shoot();
      return;
    }

    cancelAim();
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k !== "a" && k !== "d") return;
    if (state.phase !== "aim") return;
    if (inputBlocked()) return;
    e.preventDefault();
    if (k === "a") state.keys.a = true;
    if (k === "d") state.keys.d = true;
    // 键盘接管弧线
    if (state.curveFromTouch && !state.curvePointerId) {
      state.curveFromTouch = false;
      state.keyCurveHold = 0;
    }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === "a") state.keys.a = false;
    if (k === "d") state.keys.d = false;
    // 松开后保持当前弯度与半径
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    el.btnRestart.addEventListener("click", () => {
      if (!state.running) return;
      // 联机仅蓝方（房主）可重开，并广播
      if (state.localTeam && state.localTeam !== "A") return;
      if (state.onNetEvent) state.onNetEvent({ type: "restart" });
      hideOverlay();
      restartMatch();
    });
    el.btnOverlay.addEventListener("click", () => hideOverlay());
    window.addEventListener("resize", () => {
      if (state.running) resize();
    });
  }

  function start(config) {
    bindOnce();
    stop(false);
    state.lineupA = (config && config.teamA) || [];
    state.lineupB = (config && config.teamB) || [];
    if (state.lineupA.length !== 3 || state.lineupB.length !== 3) {
      console.error("FouncyBall.start: need 3 players per team");
      return;
    }
    // vsAI: true → 红方电脑；也可显式传 aiTeam: "A"|"B"
    if (config && config.aiTeam) state.aiTeam = config.aiTeam;
    else if (config && config.vsAI) state.aiTeam = "B";
    else state.aiTeam = null;

    state.aiDifficulty =
      config && config.aiDifficulty === "hard" ? "hard" : "normal";

    state.trainingLayout =
      config && config.trainingLayout ? config.trainingLayout : null;
    state.kickoffLayouts =
      config && config.kickoffLayouts ? config.kickoffLayouts : null;
    state.trainingId = (config && config.trainingId) || null;
    state.winScore =
      config && config.winScore > 0 ? config.winScore : WIN_SCORE;
    state.onMatchOver =
      config && typeof config.onMatchOver === "function" ? config.onMatchOver : null;
    state.onPhaseChange =
      config && typeof config.onPhaseChange === "function" ? config.onPhaseChange : null;
    state.autoRetryOnFail = !!(config && config.autoRetryOnFail);
    state.onAutoRetry =
      config && typeof config.onAutoRetry === "function" ? config.onAutoRetry : null;
    state.curveLocked = !!(config && config.disableCurve);
    state.localTeam =
      config && (config.localTeam === "A" || config.localTeam === "B")
        ? config.localTeam
        : null;
    state.onNetEvent =
      config && typeof config.onNetEvent === "function" ? config.onNetEvent : null;
    state.pendingRemoteShots = [];
    state.appliedRemoteSeqs = {};
    remoteShotFlushing = false;

    // 联机：本机方在下；人机：人类方在下；热座：蓝方在下
    if (state.localTeam) state.viewBottomTeam = state.localTeam;
    else if (state.aiTeam === "A") state.viewBottomTeam = "B";
    else if (state.aiTeam === "B") state.viewBottomTeam = "A";
    else state.viewBottomTeam = "A";

    state.running = true;
    state.keys.a = false;
    state.keys.d = false;
    hideOverlay();
    restartMatch();
    resize();
    last = performance.now();
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop(clearCanvas = true) {
    state.running = false;
    clearAiTimers();
    clearFx();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    state.dragging = false;
    state.primaryPointerId = null;
    resetCurveInput();
    if (clearCanvas && ctx) {
      ctx.clearRect(0, 0, viewW || canvas.width, viewH || canvas.height);
    }
  }

  window.FouncyBall = {
    start,
    stop,
    evaluateShot,
    waitAssets,
    avatarReady,
    applyRemoteShot,
    applyRemoteArm,
    applyRemoteRestart,
  };
})();

