(() => {
  "use strict";

  const players = window.FOUNCY_PLAYERS;
  const lockedPlayers = window.FOUNCY_LOCKED_PLAYERS || [];
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const ranks = window.FOUNCY_RANKS || [];
  const rankFake = window.FOUNCY_RANK_FAKE || { rankId: "city", cups: 0 };

  const trainingData = window.FOUNCY_TRAINING || { difficulties: [], levels: [], blurb: "" };
  const PHYS = window.FOUNCY_PHYSICS || {};
  const PITCH = PHYS.PITCH || {};
  const PITCH_W = PITCH.widthM || 68;
  const PITCH_L = PITCH.lengthM || 105;
  const PLAYER_R = PHYS.PLAYER_R || 6.075;
  const CENTER_R = PITCH.centerCircleR || 9.15;
  const PEN_W = PITCH.penaltyW || 40.32;
  const PEN_D = PITCH.penaltyD || 16.5;
  const HALF_L = PITCH_L * 0.5;
  const FORMATION_SAVE_KEY = "founcy_formation_v1";

  const ui = {
    lobby: document.getElementById("lobby"),
    screens: {
      home: document.getElementById("screen-home"),
      roster: document.getElementById("screen-roster"),
      train: document.getElementById("screen-train"),
      online: document.getElementById("screen-online"),
      placeholder: document.getElementById("screen-placeholder"),
      match: document.getElementById("screen-match"),
    },
    onlineHint: document.getElementById("onlineHint"),
    onlineActions: document.getElementById("onlineActions"),
    onlineRoom: document.getElementById("onlineRoom"),
    onlineCodeDisplay: document.getElementById("onlineCodeDisplay"),
    onlineStatus: document.getElementById("onlineStatus"),
    onlineMySide: document.getElementById("onlineMySide"),
    onlineOppSide: document.getElementById("onlineOppSide"),
    onlineMyLineup: document.getElementById("onlineMyLineup"),
    onlineOppLineup: document.getElementById("onlineOppLineup"),
    onlineReadyMe: document.getElementById("onlineReadyMe"),
    onlineReadyOpp: document.getElementById("onlineReadyOpp"),
    btnOnlineStart: document.getElementById("btnOnlineStart"),
    btnCreateRoom: document.getElementById("btnCreateRoom"),
    btnJoinRoom: document.getElementById("btnJoinRoom"),
    btnCopyCode: document.getElementById("btnCopyCode"),
    btnLeaveRoom: document.getElementById("btnLeaveRoom"),
    btnOnlineBack: document.getElementById("btnOnlineBack"),
    onlineCodeInput: document.getElementById("onlineCodeInput"),
    placeholderTitle: document.getElementById("placeholderTitle"),
    rosterTitle: document.getElementById("rosterTitle"),
    labelA: document.getElementById("labelA"),
    labelB: document.getElementById("labelB"),
    rosterPitch: document.getElementById("rosterPitch"),
    pitchSlots: document.getElementById("pitchSlots"),
    rosterPosHint: document.getElementById("rosterPosHint"),
    btnEditFormation: document.getElementById("btnEditFormation"),
    ownedGrid: document.getElementById("ownedGrid"),
    lockedGrid: document.getElementById("lockedGrid"),
    btnExit: document.getElementById("btnExitMatch"),
    btnBattle: document.getElementById("btnBattle"),
    btnTogglePitch: document.getElementById("btnTogglePitch"),
    homeStage: document.getElementById("homeStage"),
    rankName: document.getElementById("rankName"),
    rankCups: document.getElementById("rankCups"),
    arenaName: document.getElementById("arenaName"),
    arenaSub: document.getElementById("arenaSub"),
    trainDiff: document.getElementById("trainDiff"),
    trainList: document.getElementById("trainList"),
    playerSheet: document.getElementById("playerSheet"),
    psAvatar: document.getElementById("psAvatar"),
    psName: document.getElementById("psName"),
    psLevel: document.getElementById("psLevel"),
    psRoleText: document.getElementById("psRoleText"),
    psBlurb: document.getElementById("psBlurb"),
    psPower: document.getElementById("psPower"),
    psCurve: document.getElementById("psCurve"),
    psGrip: document.getElementById("psGrip"),
    psWeight: document.getElementById("psWeight"),
    psBarPower: document.getElementById("psBarPower"),
    psBarCurve: document.getElementById("psBarCurve"),
    psBarGrip: document.getElementById("psBarGrip"),
    psBarWeight: document.getElementById("psBarWeight"),
    psSkillName: document.getElementById("psSkillName"),
    psSkillDesc: document.getElementById("psSkillDesc"),
    psDemoCanvas: document.getElementById("psDemoCanvas"),
    playerSheetClose: document.getElementById("playerSheetClose"),
    playerSheetBackdrop: document.getElementById("playerSheetBackdrop"),
  };

  const trainUi = {
    diff: "easy",
  };

  const TRAIN_SAVE_KEY = "founcy_train_v1";

  /** 退出对局后回到的大厅页 */
  let lobbyReturn = "home";

  /** 当前正在进行的新手关 */
  let tutorialActiveLevel = null;
  let tutorStepKey = null;
  let tutorSeen = Object.create(null);

  /** 仅第一关保留聚光点选/蓄力文字引导 */
  const TUTOR_SCRIPTS = {
    e1: {
      select: {
        title: "第一关 · 选人",
        text: "点选场上中间、靠近足球的蓝方球员。",
        hole: "stage",
      },
      aim: {
        title: "直线蓄力",
        text: "向下拖动蓄力，对准球，松手发射撞进上门。本关只能直线，暂时不能拧弧。",
        hole: "stage",
      },
    },
  };

  /** 第 2/3 关：进关居中播放操作动画（可重复观看） */
  const TUTOR_INTROS = {
    e2: {
      title: "第二关 · 蓄满再射",
      text: "距离更远了。主指按住球员向下拉满，松手直线撞门。本关仍不能拧弧。",
      demo: "powerPull",
    },
    e3: {
      title: "第三关 · 学会弧线",
      text: "主指按住球员向下拉蓄力（先别松），同时用另一根手指在旁边左右滑来拧弧。电脑可用 A / D。",
      demo: "curveHands",
    },
  };

  function loadTrainSave() {
    try {
      const raw = localStorage.getItem(TRAIN_SAVE_KEY);
      if (!raw) return { cleared: {} };
      const data = JSON.parse(raw);
      return { cleared: data && data.cleared ? data.cleared : {} };
    } catch (_) {
      return { cleared: {} };
    }
  }

  function isTrainCleared(id) {
    return !!loadTrainSave().cleared[id];
  }

  function markTrainCleared(id) {
    if (!id) return;
    const data = loadTrainSave();
    data.cleared[id] = true;
    try {
      localStorage.setItem(TRAIN_SAVE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function tutorialLevelIds() {
    const ids = trainingData.tutorialLevelIds;
    if (Array.isArray(ids) && ids.length) return ids.slice();
    return (trainingData.levels || [])
      .filter((lv) => lv.diff === "easy")
      .map((lv) => lv.id);
  }

  function isTutorialDone() {
    return tutorialLevelIds().every((id) => isTrainCleared(id));
  }

  function getTutorialLevelById(id) {
    return (trainingData.levels || []).find((lv) => lv.id === id) || null;
  }

  function getNextTutorialLevel() {
    for (const id of tutorialLevelIds()) {
      if (!isTrainCleared(id)) return getTutorialLevelById(id);
    }
    return null;
  }

  function tutorialIndex(id) {
    const ids = tutorialLevelIds();
    const i = ids.indexOf(id);
    return i < 0 ? 0 : i;
  }

  function syncTutorDockLock() {
    const dock = document.getElementById("appDock");
    if (!dock) return;
    dock.classList.toggle("tutor-locked", !isTutorialDone());
  }

  function hideTutorGuide() {
    const el = document.getElementById("tutorGuide");
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("has-hole");
    tutorStepKey = null;
  }

  function hideTutorIntro() {
    const el = document.getElementById("tutorIntro");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  }

  function syncTutorReplayBtn() {
    const btn = document.getElementById("btnTutorReplay");
    if (!btn) return;
    const show = !!(tutorialActiveLevel && TUTOR_INTROS[tutorialActiveLevel]);
    btn.classList.toggle("hidden", !show);
  }

  function setTutorIntroDemo(demoKind) {
    document.querySelectorAll("#tutorIntroDemo .td-panel").forEach((panel) => {
      const on = panel.getAttribute("data-demo") === demoKind;
      panel.classList.toggle("hidden", !on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  function showTutorIntro(levelId) {
    const intro = TUTOR_INTROS[levelId];
    const el = document.getElementById("tutorIntro");
    if (!intro || !el) return;
    const stepEl = document.getElementById("tutorIntroStep");
    const titleEl = document.getElementById("tutorIntroTitle");
    const textEl = document.getElementById("tutorIntroText");
    const ids = tutorialLevelIds();
    if (stepEl) {
      stepEl.textContent = `新手 ${tutorialIndex(levelId) + 1} / ${ids.length}`;
    }
    if (titleEl) titleEl.textContent = intro.title;
    if (textEl) textEl.textContent = intro.text;
    setTutorIntroDemo(intro.demo);
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    // 重启动画：强制重排
    el.querySelectorAll(".td-hand, .td-arc-path, .td-straight-path").forEach((node) => {
      node.style.animation = "none";
      // eslint-disable-next-line no-unused-expressions
      node.offsetHeight;
      node.style.animation = "";
    });
  }

  function setTutorHole(target) {
    const guide = document.getElementById("tutorGuide");
    const hole = document.getElementById("tutorHole");
    if (!guide || !hole) return;
    if (!target) {
      guide.classList.remove("has-hole");
      return;
    }
    const node =
      target === "stage"
        ? document.getElementById("stage")
        : typeof target === "string"
          ? document.querySelector(target)
          : target;
    if (!node) {
      guide.classList.remove("has-hole");
      return;
    }
    const r = node.getBoundingClientRect();
    const pad = 8;
    hole.style.left = `${Math.max(0, r.left - pad)}px`;
    hole.style.top = `${Math.max(0, r.top - pad)}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;
    guide.classList.add("has-hole");
  }

  function showTutorGuide(levelId, stepKey) {
    const script = TUTOR_SCRIPTS[levelId];
    const step = script && script[stepKey];
    const guide = document.getElementById("tutorGuide");
    if (!step || !guide) return;
    const seenKey = `${levelId}:${stepKey}`;
    if (tutorSeen[seenKey]) return;

    tutorStepKey = stepKey;
    const ids = tutorialLevelIds();
    const stepEl = document.getElementById("tutorStep");
    const titleEl = document.getElementById("tutorTitle");
    const textEl = document.getElementById("tutorText");
    if (stepEl) {
      stepEl.textContent = `新手 ${tutorialIndex(levelId) + 1} / ${ids.length}`;
    }
    if (titleEl) titleEl.textContent = step.title;
    if (textEl) textEl.textContent = step.text;
    guide.classList.remove("hidden");
    requestAnimationFrame(() => setTutorHole(step.hole || null));
  }

  function dismissTutorGuide() {
    if (tutorialActiveLevel && tutorStepKey) {
      tutorSeen[`${tutorialActiveLevel}:${tutorStepKey}`] = true;
    }
    hideTutorGuide();
  }

  function onTutorialPhase(phase, meta) {
    if (!tutorialActiveLevel || isTutorialDone()) return;
    // 第 2/3 关只用进关动画，不再弹点选/蓄力卡
    if (TUTOR_INTROS[tutorialActiveLevel]) {
      if (phase === "sim" || phase === "goal" || phase === "over") hideTutorGuide();
      return;
    }
    // 电脑回合不弹引导
    if (meta && meta.aiTeam && meta.turn === meta.aiTeam) {
      hideTutorGuide();
      return;
    }
    if (phase === "select") showTutorGuide(tutorialActiveLevel, "select");
    else if (phase === "aim") showTutorGuide(tutorialActiveLevel, "aim");
    else if (phase === "sim" || phase === "goal" || phase === "over") hideTutorGuide();
  }

  function padLine(ids) {
    const line = [null, null, null];
    for (let i = 0; i < 3; i++) line[i] = ids[i] || null;
    return line;
  }

  /** 默认开球站位（蓝方绝对世界坐标，与 game.js defaultKickoffSpots 一致） */
  function defaultFormationSpots() {
    const gap = PLAYER_R * 2.4;
    const back = PLAYER_R * 0.5;
    const xs = [PITCH_W * 0.22, PITCH_W * 0.5, PITCH_W * 0.78];
    const aY = PITCH_L * 0.74 + back;
    return xs.map((x, i) => ({
      x,
      y: i === 1 ? aY - gap * 0.55 : aY,
    }));
  }

  function cloneSpots(spots) {
    return (spots || []).slice(0, 3).map((s) => ({ x: Number(s.x), y: Number(s.y) }));
  }

  function mirrorSpotsToTeamB(spots) {
    return cloneSpots(spots).map((s) => ({
      x: PITCH_W - s.x,
      y: PITCH_L - s.y,
    }));
  }

  function normalizeFormationSide(side) {
    const fallback = defaultFormationSpots();
    const src = Array.isArray(side) && side.length >= 3 ? side : fallback;
    const out = [];
    for (let i = 0; i < 3; i++) {
      const s = src[i] || fallback[i];
      out.push(clampFormationPos(Number(s.x), Number(s.y), out, i));
    }
    return out;
  }

  function loadFormations() {
    const fallback = {
      kick: defaultFormationSpots(),
      receive: defaultFormationSpots(),
    };
    try {
      const raw = localStorage.getItem(FORMATION_SAVE_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      return {
        kick: normalizeFormationSide(data && data.kick),
        receive: normalizeFormationSide(data && data.receive),
      };
    } catch (_) {
      return fallback;
    }
  }

  function saveFormations() {
    try {
      localStorage.setItem(
        FORMATION_SAVE_KEY,
        JSON.stringify({
          kick: cloneSpots(formations.kick),
          receive: cloneSpots(formations.receive),
        })
      );
    } catch (_) {}
  }

  /** 圆与禁区矩形是否相交（己方下半场大禁区） */
  function overlapsOwnPenalty(x, y, r) {
    const px0 = (PITCH_W - PEN_W) / 2;
    const px1 = px0 + PEN_W;
    const py0 = PITCH_L - PEN_D;
    const py1 = PITCH_L;
    const cx = Math.max(px0, Math.min(px1, x));
    const cy = Math.max(py0, Math.min(py1, y));
    return Math.hypot(x - cx, y - cy) < r - 1e-6;
  }

  /** 体积不可进入中圈；最多一人进大禁区；须留在己方半场 */
  function clampFormationPos(x, y, others, selfIndex) {
    const r = PLAYER_R;
    let nx = Math.max(r, Math.min(PITCH_W - r, x));
    let ny = Math.max(HALF_L + r, Math.min(PITCH_L - r, y));

    // 整体离开中圈
    const cx = PITCH_W * 0.5;
    const cy = PITCH_L * 0.5;
    const minDist = CENTER_R + r;
    for (let iter = 0; iter < 4; iter++) {
      const d = Math.hypot(nx - cx, ny - cy);
      if (d >= minDist || d < 1e-6) break;
      const s = minDist / d;
      nx = cx + (nx - cx) * s;
      ny = cy + (ny - cy) * s;
      nx = Math.max(r, Math.min(PITCH_W - r, nx));
      ny = Math.max(HALF_L + r, Math.min(PITCH_L - r, ny));
    }

    // 已有一人在禁区则其他人推出
    const inBoxCount = (others || []).reduce((n, s, i) => {
      if (i === selfIndex || !s) return n;
      return n + (overlapsOwnPenalty(s.x, s.y, r) ? 1 : 0);
    }, 0);
    if (inBoxCount >= 1 && overlapsOwnPenalty(nx, ny, r)) {
      const px0 = (PITCH_W - PEN_W) / 2;
      const px1 = px0 + PEN_W;
      const py0 = PITCH_L - PEN_D;
      // 推到禁区顶边之外（更靠近中场）
      ny = Math.min(ny, py0 - r);
      // 若仍因左右贴边相交，再向左右推开
      if (overlapsOwnPenalty(nx, ny, r)) {
        if (nx < PITCH_W * 0.5) nx = px0 - r;
        else nx = px1 + r;
        nx = Math.max(r, Math.min(PITCH_W - r, nx));
      }
      ny = Math.max(HALF_L + r, Math.min(PITCH_L - r, ny));
    }

    return { x: nx, y: ny };
  }

  /** 世界坐标（蓝方半场）→ 半场面板百分比：中线在上、球门在下 */
  function worldToPitchPercent(x, y) {
    return {
      left: (x / PITCH_W) * 100,
      top: ((y - HALF_L) / HALF_L) * 100,
    };
  }

  function clientToWorldOnPitch(clientX, clientY) {
    const el = ui.rosterPitch;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = ((clientX - rect.left) / rect.width) * PITCH_W;
    const y = HALF_L + ((clientY - rect.top) / rect.height) * HALF_L;
    return { x, y };
  }

  const formations = loadFormations();

  const roster = {
    /** "ranked" | "friendly" | "online" —— 仅影响开战，编队页共用 */
    mode: "ranked",
    /** "normal" | "hard" —— 仅排位赛人机 */
    aiDifficulty: "normal",
    team: "A",
    activeSlot: 0,
    pitchFolded: false,
    /** "kick" 先手开球站位 | "receive" 后手站位 */
    formationSide: "kick",
    /** 是否正在拖拽摆位 */
    posEditing: false,
    A: padLine(window.FOUNCY_DEFAULT_LINEUP_A),
    B: padLine(window.FOUNCY_DEFAULT_LINEUP_B),
  };

  const posDrag = {
    active: false,
    moved: false,
    pointerId: null,
    slot: -1,
  };

  const online = {
    net: null,
    role: null, // "host" | "guest"
    roomCode: "",
    connected: false,
    readyMe: false,
    readyOpp: false,
    /** 对手阵容 id[] */
    oppLine: padLine(window.FOUNCY_DEFAULT_LINEUP_B),
    /** 对手开球站位（对方本地「己方半场」坐标，开战时再镜像到红方） */
    oppLayouts: null,
    matchStarted: false,
    /** @type {{ team: "A"|"B", text: string, ts: number, mine: boolean }[]} */
    chatLog: [],
    chatUnread: 0,
    /** 待对方 ACK 的出手，丢包时重发 */
    pendingShotAcks: /** @type {Map<number, { payload: object, tries: number, timer: number }>} */ (
      new Map()
    ),
  };

  const chatUi = {
    fab: document.getElementById("btnMatchChat"),
    badge: document.getElementById("matchChatBadge"),
    sheet: document.getElementById("matchChatSheet"),
    backdrop: document.getElementById("matchChatBackdrop"),
    close: document.getElementById("matchChatClose"),
    log: document.getElementById("matchChatLog"),
    form: document.getElementById("matchChatForm"),
    input: document.getElementById("matchChatInput"),
  };

  const drag = {
    active: false,
    moved: false,
    pointerId: null,
    playerId: null,
    ghost: null,
    fromSlot: -1,
    startX: 0,
    startY: 0,
  };

  function isRanked() {
    return roster.mode === "ranked";
  }

  function isOnline() {
    return roster.mode === "online";
  }

  function myOnlineTeam() {
    return online.role === "guest" ? "B" : "A";
  }

  function formatLineNames(ids) {
    return (ids || [])
      .map((id) => (id && byId[id] ? byId[id].name : "—"))
      .join(" · ");
  }

  function ensureOnlineNet() {
    if (online.net) return online.net;
    if (!window.FouncyNet) {
      alert("联机模块未加载");
      return null;
    }
    const net = window.FouncyNet.createNet();
    online.net = net;

    net.on("connected", () => {
      online.connected = true;
      syncOnlineUi();
      pushMyLineup();
      pushReady();
    });
    net.on("disconnected", () => {
      online.connected = false;
      online.readyOpp = false;
      if (online.matchStarted && window.FouncyBall) {
        window.FouncyBall.stop();
        alert("对手已断开连接");
        show("online");
      }
      online.matchStarted = false;
      syncOnlineUi();
    });
    net.on("error", (err) => {
      if (ui.onlineStatus) {
        ui.onlineStatus.textContent = (err && err.message) || "连接出错";
      }
    });
    net.on("message", onOnlineMessage);
    return net;
  }

  function myFormationPayload() {
    return {
      kick: cloneSpots(formations.kick),
      receive: cloneSpots(formations.receive),
    };
  }

  /** 本地存的是蓝方半场坐标；映射到指定队伍的世界坐标 */
  function layoutsForTeam(stored, team) {
    const kick = normalizeFormationSide(stored && stored.kick);
    const receive = normalizeFormationSide(stored && stored.receive);
    if (team === "B") {
      return { kick: mirrorSpotsToTeamB(kick), receive: mirrorSpotsToTeamB(receive) };
    }
    return { kick, receive };
  }

  function buildKickoffLayoutsForMatch(teamAStored, teamBStored) {
    const out = {};
    if (teamAStored) out.A = layoutsForTeam(teamAStored, "A");
    if (teamBStored) out.B = layoutsForTeam(teamBStored, "B");
    return out;
  }

  function pushMyLineup() {
    if (!online.net || !online.net.isConnected()) return;
    const ids = padLine(roster.A);
    online.net.send({ t: "lineup", ids, formation: myFormationPayload() });
  }

  function pushReady() {
    if (!online.net || !online.net.isConnected()) return;
    online.net.send({ t: "ready", ready: !!online.readyMe });
  }

  function clearPendingShotAcks() {
    online.pendingShotAcks.forEach((entry) => {
      if (entry.timer) clearTimeout(entry.timer);
    });
    online.pendingShotAcks.clear();
  }

  function ackRemoteShot(seq) {
    if (seq == null || !online.net) return;
    online.net.send({ t: "shot-ack", seq });
  }

  function trackShotForAck(payload) {
    const seq = payload.seq;
    if (seq == null) return;
    const prev = online.pendingShotAcks.get(seq);
    if (prev && prev.timer) clearTimeout(prev.timer);
    const entry = { payload, tries: 0, timer: 0 };
    const schedule = () => {
      entry.timer = setTimeout(() => {
        if (!online.pendingShotAcks.has(seq)) return;
        if (!online.net || !online.net.isConnected()) {
          schedule();
          return;
        }
        entry.tries += 1;
        if (entry.tries > 12) {
          online.pendingShotAcks.delete(seq);
          console.warn("[online] shot ack timeout", seq);
          return;
        }
        online.net.send(entry.payload);
        schedule();
      }, 700);
    };
    online.pendingShotAcks.set(seq, entry);
    schedule();
  }

  function onShotAck(seq) {
    const entry = online.pendingShotAcks.get(seq);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    online.pendingShotAcks.delete(seq);
  }

  function onOnlineMessage(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "hello" || msg.t === "welcome") {
      online.connected = true;
      syncOnlineUi();
      pushMyLineup();
      pushReady();
      return;
    }
    if (msg.t === "lineup" && Array.isArray(msg.ids)) {
      online.oppLine = padLine(msg.ids);
      if (msg.formation) {
        // 对手发来的是「己方半场」坐标，先按蓝方规范化，开战时再镜像到红方
        online.oppLayouts = {
          kick: normalizeFormationSide(msg.formation.kick),
          receive: normalizeFormationSide(msg.formation.receive),
        };
      }
      syncOnlineUi();
      return;
    }
    if (msg.t === "ready") {
      online.readyOpp = !!msg.ready;
      syncOnlineUi();
      return;
    }
    if (msg.t === "start") {
      beginOnlineMatch(msg);
      return;
    }
    if (msg.t === "shot" && window.FouncyBall) {
      // 先 ACK，再应用（应用可能入队等待本机动画结束）
      if (msg.seq != null) ackRemoteShot(msg.seq);
      window.FouncyBall.applyRemoteShot(msg);
      return;
    }
    if (msg.t === "shot-ack") {
      onShotAck(msg.seq);
      return;
    }
    if (msg.t === "arm" && window.FouncyBall) {
      window.FouncyBall.applyRemoteArm(msg);
      return;
    }
    if (msg.t === "restart" && window.FouncyBall) {
      window.FouncyBall.applyRemoteRestart();
      return;
    }
    if (msg.t === "chat") {
      const text = String(msg.text || "").trim().slice(0, 120);
      const team = msg.team === "B" ? "B" : "A";
      if (!text) return;
      pushChatMessage({
        team,
        text,
        ts: msg.ts || Date.now(),
        mine: team === myOnlineTeam(),
      });
    }
  }

  function isChatOpen() {
    return !!(chatUi.sheet && chatUi.sheet.classList.contains("open"));
  }

  function clearChatLog() {
    online.chatLog = [];
    online.chatUnread = 0;
    renderChatLog();
    syncChatBadge();
  }

  function syncChatBadge() {
    if (!chatUi.badge) return;
    const n = online.chatUnread;
    chatUi.badge.textContent = n > 99 ? "99+" : String(n);
    chatUi.badge.classList.toggle("hidden", n <= 0);
  }

  function setChatFabVisible(on) {
    if (chatUi.fab) chatUi.fab.classList.toggle("hidden", !on);
    if (!on) closeChatSheet();
  }

  function openChatSheet() {
    if (!chatUi.sheet) return;
    chatUi.sheet.classList.remove("hidden");
    chatUi.sheet.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      chatUi.sheet.classList.add("open");
    });
    online.chatUnread = 0;
    syncChatBadge();
    renderChatLog();
    setTimeout(() => {
      if (chatUi.input) chatUi.input.focus();
    }, 280);
  }

  function closeChatSheet() {
    if (!chatUi.sheet) return;
    chatUi.sheet.classList.remove("open");
    chatUi.sheet.setAttribute("aria-hidden", "true");
    if (chatUi.input) chatUi.input.blur();
    setTimeout(() => {
      if (chatUi.sheet && !chatUi.sheet.classList.contains("open")) {
        chatUi.sheet.classList.add("hidden");
      }
    }, 280);
  }

  function renderChatLog() {
    if (!chatUi.log) return;
    chatUi.log.innerHTML = "";
    if (!online.chatLog.length) {
      const empty = document.createElement("div");
      empty.className = "match-chat-empty";
      empty.textContent = "还没有消息，打个招呼吧";
      chatUi.log.appendChild(empty);
      return;
    }
    online.chatLog.forEach((m) => {
      const row = document.createElement("div");
      row.className =
        "match-chat-row " +
        (m.mine ? "me" : "opp") +
        " team-" +
        (m.team === "B" ? "b" : "a");
      const meta = document.createElement("div");
      meta.className = "match-chat-meta";
      meta.textContent = m.mine
        ? "你"
        : m.team === "A"
          ? "蓝方"
          : "红方";
      const bubble = document.createElement("div");
      bubble.className = "match-chat-bubble";
      bubble.textContent = m.text;
      row.appendChild(meta);
      row.appendChild(bubble);
      chatUi.log.appendChild(row);
    });
    chatUi.log.scrollTop = chatUi.log.scrollHeight;
  }

  function pushChatMessage(entry) {
    online.chatLog.push(entry);
    if (online.chatLog.length > 200) online.chatLog.shift();
    if (!entry.mine && !isChatOpen()) {
      online.chatUnread += 1;
      syncChatBadge();
    }
    if (isChatOpen() || entry.mine) renderChatLog();
  }

  function sendChatMessage() {
    if (!chatUi.input) return;
    const text = String(chatUi.input.value || "").trim().slice(0, 120);
    if (!text) return;
    if (!online.matchStarted || !online.net || !online.net.isConnected()) {
      alert("当前无法发送（未联机或已断开）");
      return;
    }
    const team = myOnlineTeam();
    const ts = Date.now();
    online.net.send({ t: "chat", text, team, ts });
    pushChatMessage({ team, text, ts, mine: true });
    chatUi.input.value = "";
    chatUi.input.focus();
  }

  function syncOnlineUi() {
    const inRoom = !!(online.role && online.roomCode);
    if (ui.onlineActions) ui.onlineActions.classList.toggle("hidden", inRoom);
    if (ui.onlineRoom) ui.onlineRoom.classList.toggle("hidden", !inRoom);
    if (ui.onlineCodeDisplay) ui.onlineCodeDisplay.textContent = online.roomCode || "------";

    const myTeam = myOnlineTeam();
    if (ui.onlineMySide) ui.onlineMySide.textContent = myTeam === "A" ? "蓝方" : "红方";
    if (ui.onlineOppSide) ui.onlineOppSide.textContent = myTeam === "A" ? "红方" : "蓝方";
    if (ui.onlineMyLineup) ui.onlineMyLineup.textContent = formatLineNames(roster.A);
    if (ui.onlineOppLineup) {
      ui.onlineOppLineup.textContent = online.connected
        ? formatLineNames(online.oppLine)
        : "等待加入…";
    }
    if (ui.onlineReadyMe) ui.onlineReadyMe.checked = !!online.readyMe;
    if (ui.onlineReadyOpp) {
      ui.onlineReadyOpp.textContent = online.readyOpp ? "已准备" : "未准备";
      ui.onlineReadyOpp.classList.toggle("on", !!online.readyOpp);
    }

    if (ui.onlineStatus) {
      if (!inRoom) ui.onlineStatus.textContent = "";
      else if (!online.connected) ui.onlineStatus.textContent = "等待朋友加入…";
      else if (!online.readyMe || !online.readyOpp) ui.onlineStatus.textContent = "双方准备后即可开战";
      else ui.onlineStatus.textContent = online.role === "host" ? "可以开始对局" : "等待房主开战";
    }

    if (ui.btnOnlineStart) {
      const canStart =
        online.role === "host" &&
        online.connected &&
        online.readyMe &&
        online.readyOpp &&
        lineFull(roster.A) &&
        lineFull(online.oppLine);
      ui.btnOnlineStart.disabled = !canStart;
      ui.btnOnlineStart.textContent =
        online.role === "guest" ? "等待房主开战" : "开始对局";
    }
  }

  function leaveOnlineRoom() {
    clearPendingShotAcks();
    if (online.net) {
      try {
        online.net.send({ t: "leave" });
      } catch (_) {}
      online.net.disconnect();
    }
    online.net = null;
    online.role = null;
    online.roomCode = "";
    online.connected = false;
    online.readyMe = false;
    online.readyOpp = false;
    online.oppLine = padLine(window.FOUNCY_DEFAULT_LINEUP_B);
    online.matchStarted = false;
    clearChatLog();
    setChatFabVisible(false);
    if (ui.onlineCodeInput) ui.onlineCodeInput.value = "";
    syncOnlineUi();
  }

  async function createOnlineRoom() {
    const net = ensureOnlineNet();
    if (!net) return;
    if (ui.onlineHint) ui.onlineHint.textContent = "正在创建房间…";
    try {
      const info = await net.createRoom();
      online.role = info.role;
      online.roomCode = info.roomCode;
      online.connected = false;
      online.readyMe = false;
      online.readyOpp = false;
      syncOnlineUi();
      if (ui.onlineHint) {
        ui.onlineHint.textContent = "把房间号发给朋友，对方选「联机」→ 输入房间号加入。";
      }
    } catch (err) {
      alert((err && err.message) || "创建房间失败");
      leaveOnlineRoom();
    }
  }

  async function joinOnlineRoom() {
    const code = (ui.onlineCodeInput && ui.onlineCodeInput.value) || "";
    const net = ensureOnlineNet();
    if (!net) return;
    if (ui.onlineHint) {
      ui.onlineHint.textContent = "正在加入（信令不稳时会自动重试）…";
    }
    try {
      const info = await net.joinRoom(code);
      online.role = info.role;
      online.roomCode = info.roomCode;
      online.connected = true;
      online.readyMe = false;
      online.readyOpp = false;
      syncOnlineUi();
      pushMyLineup();
      pushReady();
      if (ui.onlineHint) ui.onlineHint.textContent = "已加入房间。双方准备后由房主开战。";
    } catch (err) {
      alert((err && err.message) || "加入失败");
      leaveOnlineRoom();
    }
  }

  function beginOnlineMatch(msg) {
    const teamAIds = padLine((msg && msg.teamA) || (online.role === "host" ? roster.A : online.oppLine));
    const teamBIds = padLine((msg && msg.teamB) || (online.role === "host" ? online.oppLine : roster.A));
    if (!lineFull(teamAIds) || !lineFull(teamBIds)) {
      alert("双方阵容未就绪");
      return;
    }
    const localTeam = myOnlineTeam();
    if (ui.labelA) ui.labelA.textContent = localTeam === "A" ? "你" : "对手";
    if (ui.labelB) ui.labelB.textContent = localTeam === "B" ? "你" : "对手";
    online.matchStarted = true;
    clearPendingShotAcks();
    clearChatLog();
    show("match");
    setChatFabVisible(true);
    const hostFormation = (msg && msg.formationA) || (online.role === "host" ? myFormationPayload() : null);
    const guestFormation =
      (msg && msg.formationB) ||
      (online.role === "guest" ? myFormationPayload() : online.oppLayouts);
    requestAnimationFrame(() => {
      window.FouncyBall.start({
        teamA: resolveLine(teamAIds),
        teamB: resolveLine(teamBIds),
        vsAI: false,
        localTeam,
        winScore: 2,
        trainingId: null,
        trainingLayout: null,
        kickoffLayouts: buildKickoffLayoutsForMatch(hostFormation, guestFormation),
        onMatchOver: null,
        onNetEvent: (evt) => {
          if (!online.net) return;
          if (evt.type === "shot") {
            const payload = {
              t: "shot",
              seq: online.net.nextSeq(),
              playerId: evt.playerId,
              aim: evt.aim,
              power: evt.power,
              curveSign: evt.curveSign,
              curveRadius: evt.curveRadius,
              skillArmed: evt.skillArmed,
            };
            online.net.send(payload);
            trackShotForAck(payload);
          } else if (evt.type === "arm") {
            online.net.send({
              t: "arm",
              bodyId: evt.bodyId,
              skillArmed: evt.skillArmed,
            });
          } else if (evt.type === "restart") {
            online.net.send({ t: "restart" });
          }
        },
      });
    });
  }

  function hostStartOnlineMatch() {
    if (online.role !== "host" || !online.net || !online.net.isConnected()) return;
    if (!online.readyMe || !online.readyOpp) return;
    if (!lineFull(roster.A) || !lineFull(online.oppLine)) {
      alert("请双方在编队页选满 3 人");
      return;
    }
    const payload = {
      t: "start",
      teamA: padLine(roster.A),
      teamB: padLine(online.oppLine),
      formationA: myFormationPayload(),
      formationB: online.oppLayouts || myFormationPayload(),
    };
    online.net.send(payload);
    beginOnlineMatch(payload);
  }

  function currentRank() {
    return (
      ranks.find((r) => r.id === rankFake.rankId) ||
      ranks[0] || {
        id: "city",
        name: "城市联赛",
        arenaName: "城市球场",
        arena: "city",
      }
    );
  }

  function renderRankHome() {
    const rank = currentRank();
    if (ui.rankName) ui.rankName.textContent = rank.name;
    if (ui.rankCups) ui.rankCups.textContent = `${rankFake.cups || 0} 杯`;
    if (ui.arenaName) ui.arenaName.textContent = rank.arenaName || rank.name;
    if (ui.homeStage) ui.homeStage.dataset.arena = rank.arena || rank.id;
    syncArenaSub();
  }

  function syncArenaSub() {
    if (!ui.arenaSub) return;
    if (isOnline()) {
      ui.arenaSub.textContent = "联机 · 开房间约战";
      return;
    }
    if (!isRanked()) {
      ui.arenaSub.textContent = "热座 · 本地双人";
      return;
    }
    ui.arenaSub.textContent =
      roster.aiDifficulty === "hard" ? "排位赛 · 极难电脑" : "排位赛 · 普通电脑";
  }

  function syncDiffToggle() {
    const wrap = document.getElementById("diffToggle");
    if (wrap) wrap.classList.toggle("hidden", !isRanked());
    document.querySelectorAll("[data-ai-diff]").forEach((pill) => {
      pill.classList.toggle(
        "on",
        pill.getAttribute("data-ai-diff") === roster.aiDifficulty
      );
    });
    if (ui.btnBattle) {
      ui.btnBattle.textContent = isOnline() ? "进入房间" : "开战";
    }
    syncArenaSub();
  }

  function syncDock(active, placeholderTitle) {
    document.querySelectorAll("#appDock .dock-item").forEach((btn) => {
      const nav = btn.getAttribute("data-nav");
      if (nav === "placeholder" && active === "placeholder") {
        btn.classList.toggle(
          "on",
          !!placeholderTitle && btn.getAttribute("data-title") === placeholderTitle
        );
      } else {
        btn.classList.toggle("on", nav === active);
      }
    });
  }

  function focusTagLabel(focus) {
    const map = {
      aim: "瞄准",
      power: "力度",
      touch: "轻推",
      curve: "弧线",
      angle: "斜线",
      bank: "借墙",
      gap: "窄缝",
      long: "远射",
      setup: "变向",
    };
    return map[focus] || "训练";
  }

  function layoutToPct(pt) {
    return {
      left: `${((pt.x / PITCH_W) * 100).toFixed(1)}%`,
      top: `${((pt.y / PITCH_L) * 100).toFixed(1)}%`,
    };
  }

  function buildMiniPitch(layout) {
    const mini = document.createElement("div");
    mini.className = "tlevel-mini";
    mini.setAttribute("aria-hidden", "true");
    if (!layout) return mini;

    const addDot = (cls, pt) => {
      if (!pt) return;
      const d = document.createElement("span");
      d.className = `tlevel-dot ${cls}`;
      const p = layoutToPct(pt);
      d.style.left = p.left;
      d.style.top = p.top;
      mini.appendChild(d);
    };

    (layout.B || []).forEach((pt) => addDot("b", pt));
    (layout.A || []).forEach((pt) => addDot("a", pt));
    addDot("ball", layout.ball);
    return mini;
  }

  function renderTrain() {
    if (!ui.trainDiff || !ui.trainList) return;

    ui.trainDiff.innerHTML = "";
    (trainingData.difficulties || []).forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "train-diff-btn" + (d.id === trainUi.diff ? " on" : "");
      btn.dataset.diff = d.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", d.id === trainUi.diff ? "true" : "false");
      btn.textContent = d.name;
      btn.addEventListener("click", () => {
        trainUi.diff = d.id;
        renderTrain();
      });
      ui.trainDiff.appendChild(btn);
    });

    const tutorOn = !isTutorialDone();
    ui.screens.train?.classList.toggle("tutor-mode", tutorOn);
    if (tutorOn) trainUi.diff = "easy";

    const levels = (trainingData.levels || []).filter((lv) => lv.diff === trainUi.diff);
    ui.trainList.innerHTML = "";
    const tutorIds = tutorialLevelIds();
    const nextTutor = getNextTutorialLevel();

    levels.forEach((lv, i) => {
      const cleared = isTrainCleared(lv.id);
      const tutorIdx = tutorIds.indexOf(lv.id);
      const lockedByTutor =
        tutorOn && tutorIdx >= 0 && nextTutor && lv.id !== nextTutor.id && !cleared;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "tlevel" + (cleared ? " cleared" : "") + (lockedByTutor ? " tutor-locked" : "");
      btn.dataset.diff = lv.diff;
      btn.dataset.id = lv.id;
      if (lockedByTutor) btn.disabled = true;

      const body = document.createElement("div");
      body.className = "tlevel-body";
      body.innerHTML = `
        <div class="tlevel-top">
          <span class="tlevel-idx">关卡 ${String(i + 1).padStart(2, "0")}</span>
          <span class="tlevel-tag ${lv.focus || ""}">${focusTagLabel(lv.focus)}</span>
          ${cleared ? '<span class="tlevel-cleared">已通关</span>' : ""}
          ${lockedByTutor ? '<span class="tlevel-cleared" style="background:#ddd">未解锁</span>' : ""}
        </div>
        <div class="tlevel-name">${lv.name || ""}</div>
      `;

      const side = document.createElement("div");
      side.className = "tlevel-side";
      side.innerHTML = cleared
        ? `
        <div class="tlevel-ideal done">已通关</div>
        <div class="tlevel-go" aria-hidden="true"></div>
      `
        : `
        <div class="tlevel-ideal"><b>${lv.idealShots || 1}</b>击理想</div>
        <div class="tlevel-go" aria-hidden="true"></div>
      `;

      btn.appendChild(buildMiniPitch(lv.layout));
      btn.appendChild(body);
      btn.appendChild(side);
      if (!lockedByTutor) {
        btn.addEventListener("click", () => startTrainingLevel(lv));
      }
      ui.trainList.appendChild(btn);
    });
    syncTutorDockLock();
  }

  function startTrainingLevel(lv, opts) {
    if (!lv || !window.FouncyBall) return;
    const fromTutor = !!(opts && opts.fromTutorial) || !isTutorialDone();
    const isTutorLv = tutorialLevelIds().includes(lv.id);
    if (!isTutorialDone() && isTutorLv) {
      const next = getNextTutorialLevel();
      if (next && lv.id !== next.id && !isTrainCleared(lv.id)) {
        lv = next;
      }
    }

    const teamA = resolveLine(padLine(lv.teamA || window.FOUNCY_DEFAULT_LINEUP_A));
    const teamB = resolveLine(padLine(lv.teamB || window.FOUNCY_DEFAULT_LINEUP_B));
    if (ui.labelA) ui.labelA.textContent = "你";
    if (ui.labelB) ui.labelB.textContent = "极难";

    tutorialActiveLevel = isTutorLv && !isTutorialDone() ? lv.id : null;
    if (tutorialActiveLevel) {
      tutorSeen = Object.create(null);
      if (ui.btnExit) ui.btnExit.textContent = "重试";
    } else if (ui.btnExit) {
      ui.btnExit.textContent = "退出";
    }
    syncTutorReplayBtn();

    setChatFabVisible(false);
    show("match");
    requestAnimationFrame(() => {
      window.FouncyBall.start({
        teamA,
        teamB,
        vsAI: true,
        aiDifficulty: "hard",
        winScore: 1,
        trainingId: lv.id,
        trainingLayout: lv.layout || null,
        disableCurve: !!lv.disableCurve,
        autoRetryOnFail: !!tutorialActiveLevel,
        onAutoRetry: () => {
          if (!tutorialActiveLevel) return;
          tutorSeen = Object.create(null);
          hideTutorGuide();
          // 第 2/3 关失败：复位后重播进关动画
          if (TUTOR_INTROS[tutorialActiveLevel]) {
            showTutorIntro(tutorialActiveLevel);
          }
        },
        onPhaseChange: (phase, meta) => onTutorialPhase(phase, meta),
        onMatchOver: (winner) => {
          hideTutorGuide();
          hideTutorIntro();
          if (winner === "A") markTrainCleared(lv.id);
          const stillTutor = !isTutorialDone();
          syncTutorDockLock();
          if (winner === "A" && stillTutor) {
            const next = getNextTutorialLevel();
            if (next) {
              startTrainingLevel(next, { fromTutorial: true });
              return;
            }
          }
          if (winner === "A" && !stillTutor && fromTutor) {
            tutorialActiveLevel = null;
            syncTutorReplayBtn();
            if (ui.btnExit) ui.btnExit.textContent = "退出";
            alert("新手训练完成！现在可以自由探索主页、编队等功能了。");
            show("home");
            return;
          }
          // 非新手训练失败仍回训练页；新手失败由 autoRetryOnFail 原地重开，不会走到这里
          tutorialActiveLevel = null;
          syncTutorReplayBtn();
          if (ui.btnExit) ui.btnExit.textContent = "退出";
          show("train");
        },
      });
      // 第 2/3 关：开局先播操作动画
      if (tutorialActiveLevel && TUTOR_INTROS[tutorialActiveLevel]) {
        showTutorIntro(tutorialActiveLevel);
      }
    });
  }

  function show(name) {
    closePlayerSheet();
    hideTutorGuide();
    hideTutorIntro();
    if (name !== "match") {
      tutorialActiveLevel = null;
      syncTutorReplayBtn();
    }

    // 新手未完成：禁止主页 / 编队 / 球探 / 商店 / 联机
    if (!isTutorialDone()) {
      const blocked = ["home", "roster", "placeholder", "online"];
      if (blocked.includes(name)) {
        const next = getNextTutorialLevel();
        if (next) {
          startTrainingLevel(next, { fromTutorial: true });
          return;
        }
        name = "train";
      }
    }

    const inMatch = name === "match";
    if (ui.lobby) ui.lobby.classList.toggle("hidden", inMatch);
    ui.screens.match.classList.toggle("hidden", !inMatch);

    if (!inMatch) {
      Object.entries(ui.screens).forEach(([k, el]) => {
        if (k === "match" || !el) return;
        el.classList.toggle("hidden", k !== name);
      });
      if (name === "placeholder") {
        syncDock("placeholder", ui.placeholderTitle?.textContent);
      } else {
        syncDock(name);
      }
    }

    if (name !== "roster" && roster.posEditing) {
      formations.kick = normalizeFormationSide(formations.kick);
      formations.receive = normalizeFormationSide(formations.receive);
      saveFormations();
      roster.posEditing = false;
      if (isOnline() && online.role) pushMyLineup();
    }
    if (name === "roster") {
      roster.team = "A";
      if (!lineFull(roster.A)) roster.A = padLine(window.FOUNCY_DEFAULT_LINEUP_A);
      if (!lineFull(roster.B)) roster.B = padLine(window.FOUNCY_DEFAULT_LINEUP_B);
      roster.activeSlot = firstEmptyOr(0);
      renderRoster();
    }
    if (name === "home") renderRankHome();
    if (name === "train") renderTrain();
    if (name === "online") syncOnlineUi();
    if (!inMatch) lobbyReturn = name;

    if (name !== "match" && window.FouncyBall) {
      window.FouncyBall.stop();
    }
    syncTutorDockLock();
  }

  function currentLine() {
    return roster[roster.team];
  }

  function firstEmptyOr(fallback) {
    const line = currentLine();
    const empty = line.findIndex((id) => !id);
    return empty >= 0 ? empty : fallback;
  }

  function lineFull(line) {
    return line.every((id) => !!id);
  }

  function rollAiLineup() {
    const pool = players.map((p) => p.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return padLine(pool.slice(0, 3));
  }

  function resolveLine(ids) {
    return ids.map((id) => {
      const p = byId[id];
      if (!p) throw new Error("missing player " + id);
      return { ...p };
    });
  }

  /** 已拥有：全部按中文名首字母排序（上场与否不改变顺序） */
  function sortOwnedList() {
    return players.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  function placeOnSlot(playerId, slotIndex) {
    const line = currentLine();
    if (slotIndex < 0 || slotIndex > 2) return;
    const from = line.findIndex((id) => id === playerId);
    const prev = line[slotIndex];
    if (from === slotIndex) return;
    if (from >= 0) {
      line[from] = prev || null;
      line[slotIndex] = playerId;
    } else {
      line[slotIndex] = playerId;
    }
    roster.activeSlot = firstEmptyOr(slotIndex);
    if (isOnline() && online.role) {
      pushMyLineup();
      syncOnlineUi();
    }
  }

  function avatarHtml(p, emptyLabel) {
    if (!p) {
      return `<div class="pitch-avatar empty">${emptyLabel || "空"}</div>`;
    }
    if (p.avatar) {
      return `<div class="pitch-avatar"><img src="${p.avatar}" alt="" draggable="false" /></div>`;
    }
    return `<div class="pitch-avatar empty">${(p.name || "?").slice(0, 1)}</div>`;
  }

  function currentFormationSpots() {
    const key = roster.formationSide === "receive" ? "receive" : "kick";
    return formations[key];
  }

  function syncFormationUi() {
    document.querySelectorAll("[data-formation]").forEach((pill) => {
      const on = pill.getAttribute("data-formation") === roster.formationSide;
      pill.classList.toggle("on", on);
      pill.setAttribute("aria-selected", on ? "true" : "false");
    });
    ui.screens.roster?.classList.toggle("pos-editing", !!roster.posEditing);
    if (ui.btnEditFormation) {
      ui.btnEditFormation.classList.toggle("editing", !!roster.posEditing);
      ui.btnEditFormation.setAttribute("aria-pressed", roster.posEditing ? "true" : "false");
      ui.btnEditFormation.title = roster.posEditing ? "保存站位" : "调整站位";
    }
    if (ui.rosterPosHint) {
      ui.rosterPosHint.classList.toggle("hidden", !roster.posEditing);
    }
  }

  function setFormationSide(side) {
    if (side !== "kick" && side !== "receive") return;
    if (side === roster.formationSide) return;
    roster.formationSide = side;
    syncFormationUi();
    renderPitch();
  }

  function toggleFormationEdit() {
    if (roster.posEditing) {
      // 保存
      formations.kick = normalizeFormationSide(formations.kick);
      formations.receive = normalizeFormationSide(formations.receive);
      saveFormations();
      roster.posEditing = false;
      if (isOnline() && online.role) pushMyLineup();
    } else {
      roster.pitchFolded = false;
      syncPitchFoldUi();
      roster.posEditing = true;
    }
    syncFormationUi();
    renderPitch();
  }

  function renderPitch() {
    if (!ui.pitchSlots) return;
    const line = currentLine();
    const spots = currentFormationSpots();
    const sizeW = (PLAYER_R * 2) / PITCH_W * 100;
    ui.pitchSlots.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const id = line[i];
      const p = id ? byId[id] : null;
      const spot = spots[i] || defaultFormationSpots()[i];
      const pct = worldToPitchPercent(spot.x, spot.y);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "pitch-slot" +
        (roster.activeSlot === i ? " active" : "") +
        (overlapsOwnPenalty(spot.x, spot.y, PLAYER_R) ? " in-box" : "");
      btn.dataset.slot = String(i);
      btn.style.left = `${pct.left}%`;
      btn.style.top = `${pct.top}%`;
      btn.style.width = `${sizeW}%`;
      btn.innerHTML = avatarHtml(p, "空");
      btn.addEventListener("click", (e) => {
        if (roster.posEditing) return;
        if (posDrag.active || posDrag.moved) return;
        roster.activeSlot = i;
        renderRoster();
      });
      if (p) {
        btn.addEventListener(
          "pointerdown",
          (e) => {
            if (roster.posEditing) beginPosDrag(e, i);
            else beginDrag(e, p.id, i);
          },
          { passive: false }
        );
      }
      ui.pitchSlots.appendChild(btn);
    }
  }

  function makeCard(p, opts) {
    const onPitch = opts.onPitch;
    const locked = opts.locked;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rcard" + (onPitch ? " on-pitch" : "") + (locked ? " locked" : "");
    btn.dataset.playerId = p.id;
    btn.innerHTML = `
      <div class="rcard-avatar"></div>
      <div class="rcard-name">${p.name}</div>
      <div class="rcard-lv">Lv.${p.level || 1}</div>
    `;
    const av = btn.querySelector(".rcard-avatar");
    if (p.avatar) {
      av.innerHTML = `<img src="${p.avatar}" alt="" draggable="false" />`;
    } else {
      av.textContent = locked ? "?" : (p.name || "?").slice(0, 1);
    }

    if (!locked) {
      btn.addEventListener("pointerdown", (e) => beginDrag(e, p.id, -1));
    }
    btn.addEventListener("click", (e) => {
      if (drag.moved) {
        e.preventDefault();
        return;
      }
      openPlayerSheet(p, locked);
    });
    return btn;
  }

  let demoRaf = 0;
  let demoPlayer = null;

  function setBar(el, value) {
    if (!el) return;
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    el.style.width = `${v}%`;
  }

  function openPlayerSheet(p, locked) {
    if (!ui.playerSheet || !p) return;
    demoPlayer = p;
    ui.playerSheet.classList.toggle("locked", !!locked);
    ui.playerSheet.classList.remove("hidden");
    ui.playerSheet.setAttribute("aria-hidden", "false");

    if (ui.psName) ui.psName.textContent = p.name;
    if (ui.psLevel) ui.psLevel.textContent = `Lv.${p.level || 1}`;
    if (ui.psRoleText) {
      const laneLabel = p.lane === "fwd" ? "前锋" : p.lane === "mid" ? "中场" : p.lane === "def" ? "后防" : "";
      ui.psRoleText.textContent = [p.role, laneLabel].filter(Boolean).join(" · ");
    }
    if (ui.psBlurb) ui.psBlurb.textContent = locked ? "尚未获得，球探可搜寻。" : p.blurb || "";

    if (ui.psAvatar) {
      if (p.avatar && !locked) {
        ui.psAvatar.innerHTML = `<img src="${p.avatar}" alt="" />`;
      } else {
        ui.psAvatar.textContent = locked ? "?" : (p.name || "?").slice(0, 1);
      }
    }

    const hideStats = locked;
    const pow = hideStats ? 0 : p.power;
    const cur = hideStats ? 0 : p.curve;
    const gri = hideStats ? 0 : p.grip;
    const wei = hideStats ? 0 : p.weight;
    if (ui.psPower) ui.psPower.textContent = hideStats ? "??" : String(pow ?? 0);
    if (ui.psCurve) ui.psCurve.textContent = hideStats ? "??" : String(cur ?? 0);
    if (ui.psGrip) ui.psGrip.textContent = hideStats ? "??" : String(gri ?? 0);
    if (ui.psWeight) ui.psWeight.textContent = hideStats ? "??" : String(wei ?? 0);
    setBar(ui.psBarPower, hideStats ? 12 : pow);
    setBar(ui.psBarCurve, hideStats ? 12 : cur);
    setBar(ui.psBarGrip, hideStats ? 12 : gri);
    setBar(ui.psBarWeight, hideStats ? 12 : wei);

    if (ui.psSkillName) {
      ui.psSkillName.textContent = locked ? "未解锁" : p.skill ? p.skill.name : "无技能";
    }
    if (ui.psSkillDesc) {
      ui.psSkillDesc.textContent = locked
        ? "获得该球员后可查看技能效果。"
        : p.skill
          ? p.skill.desc
          : "暂无主动技能。";
    }

    startSkillDemo(locked ? null : p);
  }

  function closePlayerSheet() {
    stopSkillDemo();
    demoPlayer = null;
    if (!ui.playerSheet) return;
    ui.playerSheet.classList.add("hidden");
    ui.playerSheet.setAttribute("aria-hidden", "true");
  }

  function stopSkillDemo() {
    if (demoRaf) cancelAnimationFrame(demoRaf);
    demoRaf = 0;
  }

  /** 底部技能演示：对局同款足球 + 简易物理碰撞循环 */
  function startSkillDemo(p) {
    stopSkillDemo();
    const canvas = ui.psDemoCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const skillId = p && p.skill ? p.skill.id : null;
    const PAD = 12;
    const DRAG = 1.35;
    const REST = 2.2;
    const E = 0.82;
    const CYCLE = 3.6;

    const avatar = new Image();
    if (p && p.avatar) avatar.src = p.avatar;

    /** 与对局 drawBallBody 同款：白底黑块 + 旋转缝线 */
    function drawSoccerBall(b) {
      const r = b.r;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin || 0);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f2f2f2";
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
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

    function drawPlayerBody(b, img, teamColor) {
      const rr = b.r * (b.scale || 1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = teamColor || "#3d7bfd";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      if (img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, rr - 1.5), 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, b.x - rr, b.y - rr, rr * 2, rr * 2);
        ctx.restore();
      }
      ctx.restore();
    }

    function clampWall(b) {
      const r = b.r * (b.scale || 1);
      if (b.x - r < PAD) {
        b.x = PAD + r;
        b.vx = Math.abs(b.vx) * E;
      } else if (b.x + r > W - PAD) {
        b.x = W - PAD - r;
        b.vx = -Math.abs(b.vx) * E;
      }
      if (b.y - r < PAD) {
        b.y = PAD + r;
        b.vy = Math.abs(b.vy) * E;
      } else if (b.y + r > H - PAD) {
        b.y = H - PAD - r;
        b.vy = -Math.abs(b.vy) * E;
      }
    }

    function collide(a, b) {
      const ra = a.r * (a.scale || 1);
      const rb = b.r * (b.scale || 1);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const min = ra + rb;
      if (dist >= min) return false;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = min - dist;
      const ma = a.mass || 1;
      const mb = b.mass || 1;
      const inv = 1 / ma + 1 / mb;
      const corr = overlap / inv;
      a.x -= (nx * corr) / ma;
      a.y -= (ny * corr) / ma;
      b.x += (nx * corr) / mb;
      b.y += (ny * corr) / mb;
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velN = rvx * nx + rvy * ny;
      if (velN > 0) return true;
      const j = (-(1 + E) * velN) / inv;
      a.vx -= (j * nx) / ma;
      a.vy -= (j * ny) / ma;
      b.vx += (j * nx) / mb;
      b.vy += (j * ny) / mb;
      return true;
    }

    function integrate(b, dt) {
      const sp0 = Math.hypot(b.vx, b.vy);
      if (sp0 > 0) {
        const damp = Math.exp(-DRAG * dt);
        b.vx *= damp;
        b.vy *= damp;
      }
      if (Math.hypot(b.vx, b.vy) < REST) {
        b.vx = 0;
        b.vy = 0;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp >= REST && b.r > 0) b.spin = (b.spin || 0) + (sp / b.r) * dt * 0.55;
      // 弧线转向
      if (b.curveSign && b.curveR > 0 && sp >= REST) {
        const ang = (sp / b.curveR) * b.curveSign * dt;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = b.vx * c - b.vy * s;
        const ny = b.vx * s + b.vy * c;
        b.vx = nx;
        b.vy = ny;
      }
    }

    let player;
    let ball;
    let foe = null;
    let meta = {};
    let cycleT0 = performance.now();
    let last = cycleT0;
    const CYCLE_LEN = skillId === "monk_slide" ? 4.2 : CYCLE;

    function resetScene() {
      meta = {
        hitBall: false,
        hitFoe: false,
        biteDone: false,
        strollDone: false,
        flash: 0,
        injureT: 0,
        curveArmed: false,
      };
      const midY = H * 0.52;
      ball = {
        x: 150,
        y: midY,
        r: 9,
        vx: 0,
        vy: 0,
        mass: 0.35,
        spin: 0,
        scale: 1,
      };
      player = {
        x: 48,
        y: midY,
        r: 17,
        vx: 0,
        vy: 0,
        mass: 1.35,
        spin: 0,
        scale: 1,
        curveSign: 0,
        curveR: 0,
      };
      foe = null;

      if (!skillId) {
        // 直线撞球
        player.vx = 120;
        ball.x = 145;
      } else if (skillId === "box_hunter") {
        player.vx = 125;
        ball.x = 140;
        ball.y = midY;
      } else if (skillId === "dragon_glide" || skillId === "tempo_arc") {
        // 先直线撞球，碰后再拧弧带走
        player.vx = 135;
        ball.x = 138;
        ball.y = midY;
        meta.flash = 0.55;
        meta.pendingCurve = skillId === "tempo_arc" ? -1 : 1;
        meta.pendingCurveR = skillId === "tempo_arc" ? 48 : 62;
      } else if (skillId === "buu_form") {
        player.vx = 95;
        player.scale = 1;
        ball.x = 155;
      } else if (skillId === "monk_slide") {
        // 正对红方，必撞；球在更远处也会被波及
        player.vx = 175;
        foe = {
          x: 155,
          y: midY,
          r: 16,
          vx: 0,
          vy: 0,
          mass: 1.05,
          spin: 0,
          scale: 1,
          injured: false,
          injureAge: 0,
        };
        ball.x = 250;
        ball.y = midY + 6;
      } else if (skillId === "stroll") {
        // 第一段擦肩而过，第二段对准球
        player.y = midY - 26;
        player.vx = 95;
        ball.x = 200;
        ball.y = midY + 8;
      } else {
        player.vx = 120;
        ball.x = 145;
      }
    }

    resetScene();

    function step(dt) {
      const elapsed = (performance.now() - cycleT0) / 1000;
      if (elapsed > CYCLE_LEN) {
        cycleT0 = performance.now();
        resetScene();
        return;
      }

      if (skillId === "buu_form") {
        player.scale = Math.min(1.32, 1 + elapsed * 0.32);
        player.mass = 1.35 * player.scale;
      }
      if (skillId === "box_hunter" && meta.hitBall && !meta.biteDone) {
        const sp = Math.hypot(player.vx, player.vy);
        if (sp < 32) {
          const ang = Math.atan2(player.vy || 0, player.vx || 1);
          player.vx = Math.cos(ang) * 185;
          player.vy = Math.sin(ang) * 185;
          meta.biteDone = true;
          meta.flash = 0.4;
        }
      }
      if (skillId === "stroll" && !meta.hitBall && !meta.strollDone && elapsed > 1.05) {
        // 掉头对准球再冲
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        player.vx = (dx / len) * 155;
        player.vy = (dy / len) * 155;
        meta.strollDone = true;
        meta.flash = 0.4;
      }
      // 碰球后再开弧，保证先撞到球
      if (meta.hitBall && meta.pendingCurve && !meta.curveArmed) {
        player.curveSign = meta.pendingCurve;
        player.curveR = meta.pendingCurveR;
        meta.curveArmed = true;
      }
      if (meta.flash > 0) meta.flash = Math.max(0, meta.flash - dt);
      if (foe && foe.injured) foe.injureAge += dt;

      integrate(player, dt);
      integrate(ball, dt);
      if (foe) {
        if (!foe.injured || foe.injureAge < 0.28) integrate(foe, dt);
        else {
          foe.vx *= Math.exp(-6 * dt);
          foe.vy *= Math.exp(-6 * dt);
          if (Math.hypot(foe.vx, foe.vy) < REST) {
            foe.vx = 0;
            foe.vy = 0;
          }
          foe.x += foe.vx * dt;
          foe.y += foe.vy * dt;
        }
      }

      if (collide(player, ball)) meta.hitBall = true;
      if (foe) {
        if (!foe.injured && collide(player, foe)) {
          meta.hitFoe = true;
          foe.injured = true;
          foe.injureAge = 0;
          // 被铲飞一小段
          foe.vx = Math.max(60, player.vx * 0.45);
          foe.vy = -55;
          player.vx *= 0.55;
          meta.flash = 0.5;
          meta.injureT = 1;
        }
        collide(foe, ball);
      }

      clampWall(player);
      clampWall(ball);
      if (foe) clampWall(foe);

      if (meta.hitBall || meta.hitFoe) {
        // 飞铲撞人后取消弧；弧线技碰球后仍保留 pending 弧
        if (skillId === "monk_slide" || skillId === "box_hunter" || skillId === "buu_form") {
          player.curveSign = 0;
        }
      }
      if (meta.injureT > 0) meta.injureT = Math.max(0, meta.injureT - dt);
    }

    function drawInjuredFoe(f, now) {
      const shake = f.injured ? Math.sin(now * 0.04) * 2.2 : 0;
      const ox = f.x + shake;
      const oy = f.y;
      drawPlayerBody({ ...f, x: ox, y: oy }, null, f.injured ? "#7a7a7a" : "#e74c3c");
      if (!f.injured) return;

      const age = f.injureAge || 0;
      // 冲击环
      const ring = 18 + Math.min(22, age * 55);
      ctx.strokeStyle = `rgba(200,245,66,${Math.max(0, 0.85 - age * 0.55)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ox, oy, ring, 0, Math.PI * 2);
      ctx.stroke();

      // 眩晕星
      ctx.fillStyle = "#ffe566";
      ctx.strokeStyle = "#2a1f14";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = age * 4 + (i / 3) * Math.PI * 2;
        const sx = ox + Math.cos(a) * 22;
        const sy = oy - f.r - 10 + Math.sin(a) * 5;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 「受伤」字
      if (age < 1.6) {
        ctx.font = "bold 12px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(255,80,80,${Math.max(0.2, 1 - age * 0.4)})`;
        ctx.fillText("受伤", ox, oy - f.r - 18);
      }
    }

    function frame(now) {
      const raw = Math.min(0.05, (now - last) / 1000);
      last = now;
      let acc = raw;
      const STEP = 1 / 60;
      while (acc >= STEP) {
        step(STEP);
        acc -= STEP;
      }
      if (acc > 0) step(acc);

      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#2f8f48" : "#348f4c";
        ctx.fillRect(0, (H / 6) * i, W, H / 6 + 1);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);
      ctx.beginPath();
      ctx.moveTo(W * 0.55, PAD);
      ctx.lineTo(W * 0.55, H - PAD);
      ctx.stroke();

      if (meta.flash > 0) {
        ctx.fillStyle =
          skillId === "box_hunter" || skillId === "monk_slide"
            ? `rgba(255,120,100,${0.5 * meta.flash})`
            : `rgba(200,245,66,${0.45 * meta.flash})`;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r * (player.scale || 1) + 12, 0, Math.PI * 2);
        ctx.fill();
      }

      if (foe) drawInjuredFoe(foe, now);
      drawPlayerBody(player, avatar, "#3d7bfd");
      drawSoccerBall(ball);

      demoRaf = requestAnimationFrame(frame);
    }

    demoRaf = requestAnimationFrame(frame);
  }

  function renderCards() {
    const line = currentLine();
    const onSet = new Set(line.filter(Boolean));
    if (ui.ownedGrid) {
      ui.ownedGrid.innerHTML = "";
      sortOwnedList().forEach((p) => {
        ui.ownedGrid.appendChild(makeCard(p, { onPitch: onSet.has(p.id), locked: false }));
      });
    }
    if (ui.lockedGrid) {
      ui.lockedGrid.innerHTML = "";
      const locked = lockedPlayers.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      locked.forEach((p) => {
        ui.lockedGrid.appendChild(makeCard(p, { onPitch: false, locked: true }));
      });
    }
  }

  function syncPitchFoldUi() {
    ui.screens.roster?.classList.toggle("pitch-folded", roster.pitchFolded);
    if (ui.btnTogglePitch) {
      ui.btnTogglePitch.textContent = roster.pitchFolded ? "展开球场" : "收起球场";
      ui.btnTogglePitch.setAttribute("aria-expanded", roster.pitchFolded ? "false" : "true");
    }
  }

  function renderRoster() {
    if (ui.rosterTitle) ui.rosterTitle.textContent = "编队";
    syncPitchFoldUi();
    syncFormationUi();
    renderPitch();
    renderCards();
  }

  function startMatchFromLobby() {
    if (isOnline()) {
      if (!lineFull(roster.A)) {
        roster.A = padLine(window.FOUNCY_DEFAULT_LINEUP_A);
      }
      show("online");
      syncOnlineUi();
      return;
    }
    if (!lineFull(roster.A)) {
      roster.A = padLine(window.FOUNCY_DEFAULT_LINEUP_A);
    }
    const teamB = isRanked() ? rollAiLineup() : padLine(roster.B);
    if (!lineFull(roster.A) || !lineFull(teamB)) {
      alert("请先在编队里选满三个上场球员");
      show("roster");
      return;
    }
    if (roster.posEditing) {
      formations.kick = normalizeFormationSide(formations.kick);
      formations.receive = normalizeFormationSide(formations.receive);
      saveFormations();
      roster.posEditing = false;
    }
    if (ui.labelA) ui.labelA.textContent = "蓝";
    if (ui.labelB) ui.labelB.textContent = isRanked() ? "电脑" : "红";
    setChatFabVisible(false);
    show("match");
    requestAnimationFrame(() => {
      window.FouncyBall.start({
        teamA: resolveLine(roster.A),
        teamB: resolveLine(teamB),
        vsAI: isRanked(),
        aiDifficulty: isRanked() ? roster.aiDifficulty : "normal",
        winScore: 2,
        trainingId: null,
        trainingLayout: null,
        kickoffLayouts: buildKickoffLayoutsForMatch(myFormationPayload(), null),
        onMatchOver: null,
      });
    });
  }

  function slotElFromPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const slot = el.closest?.(".pitch-slot");
      if (slot) return slot;
    }
    return null;
  }

  function clearDropHot() {
    document.querySelectorAll(".pitch-slot.drop-hot").forEach((el) => el.classList.remove("drop-hot"));
  }

  function beginDrag(e, playerId, fromSlot) {
    if (e.button != null && e.button !== 0) return;
    if (drag.active) return;
    const target = e.currentTarget;
    drag.active = true;
    drag.moved = false;
    drag.pointerId = e.pointerId;
    drag.playerId = playerId;
    drag.fromSlot = fromSlot;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (_) {}

    const ghost = document.createElement("div");
    ghost.className = "rcard-ghost";
    ghost.style.opacity = "0";
    const p = byId[playerId];
    if (p?.avatar) {
      ghost.innerHTML = `<img src="${p.avatar}" alt="" />`;
    } else {
      ghost.textContent = (p?.name || "?").slice(0, 1);
      ghost.style.display = "grid";
      ghost.style.placeItems = "center";
      ghost.style.color = "#fff";
      ghost.style.fontWeight = "900";
    }
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    moveGhost(e.clientX, e.clientY);

    const onMove = (ev) => {
      if (!drag.active || ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 8) {
        drag.moved = true;
        if (drag.ghost) drag.ghost.style.opacity = "1";
      }
      if (!drag.moved) return;
      moveGhost(ev.clientX, ev.clientY);
      clearDropHot();
      const slot = slotElFromPoint(ev.clientX, ev.clientY);
      if (slot) slot.classList.add("drop-hot");
    };
    const onUp = (ev) => {
      if (!drag.active || ev.pointerId !== drag.pointerId) return;
      const didMove = drag.moved;
      const pid = drag.playerId;
      clearDropHot();
      if (didMove) {
        const slot = slotElFromPoint(ev.clientX, ev.clientY);
        if (slot) placeOnSlot(pid, Number(slot.dataset.slot));
      }
      endDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (didMove) renderRoster();
      // 短时保留 moved，吞掉随后的 click
      setTimeout(() => {
        drag.moved = false;
      }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    e.preventDefault();
  }

  function moveGhost(x, y) {
    if (!drag.ghost) return;
    drag.ghost.style.left = `${x}px`;
    drag.ghost.style.top = `${y}px`;
  }

  function endDrag() {
    if (drag.ghost) drag.ghost.remove();
    drag.active = false;
    drag.pointerId = null;
    drag.playerId = null;
    drag.ghost = null;
    drag.fromSlot = -1;
    clearDropHot();
  }

  function syncHomeModePills() {
    document.querySelectorAll("[data-home-mode]").forEach((pill) => {
      pill.classList.toggle("on", pill.getAttribute("data-home-mode") === roster.mode);
    });
    syncDiffToggle();
  }

  document.querySelectorAll("[data-home-mode]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const mode = pill.getAttribute("data-home-mode");
      if (mode === "ranked" || mode === "friendly" || mode === "online") {
        roster.mode = mode;
        syncHomeModePills();
      }
    });
  });

  document.querySelectorAll("[data-ai-diff]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const diff = pill.getAttribute("data-ai-diff");
      if (diff === "normal" || diff === "hard") {
        roster.aiDifficulty = diff;
        syncDiffToggle();
      }
    });
  });

  if (ui.btnBattle) ui.btnBattle.addEventListener("click", startMatchFromLobby);

  if (ui.btnCreateRoom) ui.btnCreateRoom.addEventListener("click", () => createOnlineRoom());
  if (ui.btnJoinRoom) ui.btnJoinRoom.addEventListener("click", () => joinOnlineRoom());
  if (ui.btnCopyCode) {
    ui.btnCopyCode.addEventListener("click", async () => {
      const code = online.roomCode;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        ui.btnCopyCode.textContent = "已复制";
        setTimeout(() => {
          if (ui.btnCopyCode) ui.btnCopyCode.textContent = "复制房间号";
        }, 1200);
      } catch (_) {
        prompt("复制房间号", code);
      }
    });
  }
  if (ui.btnLeaveRoom) {
    ui.btnLeaveRoom.addEventListener("click", () => {
      leaveOnlineRoom();
      if (ui.onlineHint) {
        ui.onlineHint.textContent = "开房间把房间号发给朋友，或输入房间号加入。";
      }
    });
  }
  if (ui.btnOnlineBack) {
    ui.btnOnlineBack.addEventListener("click", () => {
      if (online.matchStarted) return;
      show("home");
    });
  }
  if (ui.btnOnlineStart) ui.btnOnlineStart.addEventListener("click", () => hostStartOnlineMatch());
  if (ui.onlineReadyMe) {
    ui.onlineReadyMe.addEventListener("change", () => {
      online.readyMe = !!ui.onlineReadyMe.checked;
      pushReady();
      syncOnlineUi();
    });
  }
  if (ui.onlineCodeInput) {
    ui.onlineCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") joinOnlineRoom();
    });
  }

  if (ui.btnTogglePitch) {
    ui.btnTogglePitch.addEventListener("click", () => {
      if (roster.posEditing) return;
      roster.pitchFolded = !roster.pitchFolded;
      syncPitchFoldUi();
    });
  }

  if (ui.btnEditFormation) {
    ui.btnEditFormation.addEventListener("click", () => toggleFormationEdit());
  }

  document.querySelectorAll("[data-formation]").forEach((pill) => {
    pill.addEventListener("click", () => {
      setFormationSide(pill.getAttribute("data-formation"));
    });
  });

  function beginPosDrag(e, slotIndex) {
    // 触控 pointer 的 button 多为 0；忽略鼠标右键
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!roster.posEditing || posDrag.active) return;
    const target = e.currentTarget;
    if (!target) return;

    posDrag.active = true;
    posDrag.moved = false;
    posDrag.pointerId = e.pointerId;
    posDrag.slot = slotIndex;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (_) {}

    const readPoint = (ev) => {
      if (ev.touches && ev.touches.length) {
        return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      }
      if (ev.changedTouches && ev.changedTouches.length) {
        return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
      }
      return { x: ev.clientX, y: ev.clientY };
    };

    const applyAt = (clientX, clientY) => {
      const world = clientToWorldOnPitch(clientX, clientY);
      if (!world) return;
      const key = roster.formationSide === "receive" ? "receive" : "kick";
      const spots = formations[key];
      const next = clampFormationPos(world.x, world.y, spots, posDrag.slot);
      spots[posDrag.slot] = next;
      const btn = ui.pitchSlots?.querySelector(`.pitch-slot[data-slot="${posDrag.slot}"]`);
      if (btn) {
        const pct = worldToPitchPercent(next.x, next.y);
        btn.style.left = `${pct.left}%`;
        btn.style.top = `${pct.top}%`;
        btn.classList.toggle("in-box", overlapsOwnPenalty(next.x, next.y, PLAYER_R));
      }
    };

    applyAt(e.clientX, e.clientY);

    const samePointer = (ev) => {
      if (posDrag.pointerId == null) return true;
      if (ev.pointerId == null) return true; // touch 兜底事件
      return ev.pointerId === posDrag.pointerId;
    };

    const onMove = (ev) => {
      if (!posDrag.active || !samePointer(ev)) return;
      const pt = readPoint(ev);
      if (pt.x == null || pt.y == null) return;
      posDrag.moved = true;
      applyAt(pt.x, pt.y);
      if (ev.cancelable) ev.preventDefault();
    };

    const cleanup = () => {
      posDrag.active = false;
      posDrag.pointerId = null;
      posDrag.slot = -1;
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (_) {}
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      document.removeEventListener("touchmove", onMove, true);
      document.removeEventListener("touchend", onUp, true);
      document.removeEventListener("touchcancel", onUp, true);
      setTimeout(() => {
        posDrag.moved = false;
      }, 0);
    };

    const onUp = (ev) => {
      if (!posDrag.active || !samePointer(ev)) return;
      cleanup();
    };

    // 同时挂在捕获目标与 document：兼容 iOS 触控丢失 window 监听的情况
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.addEventListener("touchmove", onMove, { passive: false, capture: true });
    document.addEventListener("touchend", onUp, true);
    document.addEventListener("touchcancel", onUp, true);

    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }

  document.querySelectorAll("#appDock [data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.getAttribute("data-nav");
      if (nav === "placeholder") {
        ui.placeholderTitle.textContent = btn.getAttribute("data-title") || "占位";
        show("placeholder");
        return;
      }
      show(nav);
    });
  });

  ui.btnExit.addEventListener("click", () => {
    // 新手中：退出 = 重试当前关，不能回大厅
    if (!isTutorialDone() && tutorialActiveLevel) {
      const lv = getTutorialLevelById(tutorialActiveLevel) || getNextTutorialLevel();
      if (lv) {
        startTrainingLevel(lv, { fromTutorial: true });
        return;
      }
    }
    if (window.FouncyBall) window.FouncyBall.stop();
    online.matchStarted = false;
    setChatFabVisible(false);
    closeChatSheet();
    if (isOnline() && online.role) {
      show("online");
      syncOnlineUi();
      return;
    }
    show(lobbyReturn === "match" ? "home" : lobbyReturn || "home");
  });

  if (chatUi.fab) {
    chatUi.fab.addEventListener("click", () => {
      if (isChatOpen()) closeChatSheet();
      else openChatSheet();
    });
  }
  if (chatUi.backdrop) chatUi.backdrop.addEventListener("click", () => closeChatSheet());
  if (chatUi.close) chatUi.close.addEventListener("click", () => closeChatSheet());
  if (chatUi.form) {
    chatUi.form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendChatMessage();
    });
  }
  // 输入时别让对局吃掉按键
  if (chatUi.input) {
    chatUi.input.addEventListener("keydown", (e) => e.stopPropagation());
    chatUi.input.addEventListener("keyup", (e) => e.stopPropagation());
  }

  const tutorOkBtn = document.getElementById("tutorOk");
  if (tutorOkBtn) {
    tutorOkBtn.addEventListener("click", () => dismissTutorGuide());
  }
  const tutorIntroOk = document.getElementById("tutorIntroOk");
  if (tutorIntroOk) {
    tutorIntroOk.addEventListener("click", () => hideTutorIntro());
  }
  const btnTutorReplay = document.getElementById("btnTutorReplay");
  if (btnTutorReplay) {
    btnTutorReplay.addEventListener("click", () => {
      if (tutorialActiveLevel && TUTOR_INTROS[tutorialActiveLevel]) {
        showTutorIntro(tutorialActiveLevel);
      }
    });
  }

  if (ui.playerSheetClose) ui.playerSheetClose.addEventListener("click", closePlayerSheet);
  if (ui.playerSheetBackdrop) ui.playerSheetBackdrop.addEventListener("click", closePlayerSheet);

  syncHomeModePills();
  renderRankHome();
  renderTrain();
  syncTutorDockLock();

  function buildBootFaces() {
    const box = document.getElementById("bootFaces");
    if (!box) return;
    box.innerHTML = "";
    (window.FOUNCY_PLAYERS || []).forEach((p) => {
      if (!p || !p.id) return;
      const el = document.createElement("div");
      el.className = "boot-face";
      el.dataset.id = p.id;
      el.title = p.name || p.id;
      const img = document.createElement("img");
      img.alt = p.name || "";
      img.decoding = "async";
      img.src = p.avatar || `assets/avatars/${p.id}.webp`;
      el.appendChild(img);
      box.appendChild(el);
    });
  }

  function setBootProgress(done, total, lastId) {
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
    const bar = document.getElementById("bootBar");
    const label = document.getElementById("bootPct");
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${pct}%`;
    if (lastId) {
      const face = document.querySelector(`#bootFaces .boot-face[data-id="${lastId}"]`);
      if (face) face.classList.add("on");
    }
    // 按已完成数点亮（含场地图那一项时仍按球员 id 点亮）
    document.querySelectorAll("#bootFaces .boot-face").forEach((face) => {
      const id = face.dataset.id;
      if (
        window.FouncyBall &&
        typeof window.FouncyBall.avatarReady === "function" &&
        window.FouncyBall.avatarReady(id)
      ) {
        face.classList.add("on");
      }
    });
  }

  function hideBootSplash() {
    const splash = document.getElementById("bootSplash");
    if (!splash) return;
    splash.classList.add("done");
    splash.setAttribute("aria-busy", "false");
    setTimeout(() => splash.remove(), 400);
  }

  function enterAppAfterBoot() {
    hideBootSplash();
    // 新手未完成：直接切入当前简单关
    if (!isTutorialDone()) {
      const next = getNextTutorialLevel();
      if (next) startTrainingLevel(next, { fromTutorial: true });
      else show("train");
    } else {
      show("home");
    }
  }

  async function runBootSplash() {
    buildBootFaces();
    const started = performance.now();
    const minMs = 650;

    if (window.FouncyBall && typeof window.FouncyBall.waitAssets === "function") {
      await window.FouncyBall.waitAssets({
        onProgress: setBootProgress,
        timeoutMs: 20000,
      });
    } else {
      // 兜底：自行预加载头像
      const list = window.FOUNCY_PLAYERS || [];
      let done = 0;
      const total = Math.max(1, list.length);
      await Promise.all(
        list.map(
          (p) =>
            new Promise((resolve) => {
              const img = new Image();
              const finish = () => {
                done += 1;
                setBootProgress(done, total, p.id);
                resolve();
              };
              img.onload = finish;
              img.onerror = finish;
              img.src = p.avatar || `assets/avatars/${p.id}.webp`;
            })
        )
      );
    }

    // 确保脸圈都亮起
    document.querySelectorAll("#bootFaces .boot-face").forEach((f) => f.classList.add("on"));
    setBootProgress(1, 1);

    const wait = Math.max(0, minMs - (performance.now() - started));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    enterAppAfterBoot();
  }

  // 先藏大厅，等资源好再进（避免闪一下主页）
  if (ui.lobby) ui.lobby.classList.add("hidden");
  if (ui.screens.match) ui.screens.match.classList.add("hidden");
  runBootSplash();
})();
