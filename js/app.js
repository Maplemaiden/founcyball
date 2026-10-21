(() => {
  "use strict";

  const players = window.FOUNCY_PLAYERS;
  const lockedPlayers = window.FOUNCY_LOCKED_PLAYERS || [];
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const ranks = window.FOUNCY_RANKS || [];
  const rankFake = window.FOUNCY_RANK_FAKE || { rankId: "city", cups: 0 };

  /** 半场三角阵型：槽位坐标固定，不随球员 lane 移动 */
  const SLOT_POS = [
    { x: 50, y: 28 }, // 0 前
    { x: 28, y: 72 }, // 1 左下
    { x: 72, y: 72 }, // 2 右下
  ];

  const trainingData = window.FOUNCY_TRAINING || { difficulties: [], levels: [], blurb: "" };
  const PITCH_W = (window.FOUNCY_PHYSICS && window.FOUNCY_PHYSICS.PITCH.widthM) || 68;
  const PITCH_L = (window.FOUNCY_PHYSICS && window.FOUNCY_PHYSICS.PITCH.lengthM) || 105;

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
    pitchSlots: document.getElementById("pitchSlots"),
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
    trainBlurb: document.getElementById("trainBlurb"),
    trainDiff: document.getElementById("trainDiff"),
    trainDiffDesc: document.getElementById("trainDiffDesc"),
    trainList: document.getElementById("trainList"),
    trainLevelCount: document.getElementById("trainLevelCount"),
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
    e2: {
      select: {
        title: "第二关 · 选人",
        text: "同样点选中间靠近球的蓝方球员。",
        hole: "stage",
      },
      aim: {
        title: "再远一点",
        text: "距离更远，可以把力蓄满再松手。本关仍是直线，不能拧弧。",
        hole: "stage",
      },
    },
    e3: {
      select: {
        title: "第三关 · 选人",
        text: "点选蓝方球员准备进攻。这一关要学会弧线。",
        hole: "stage",
      },
      aim: {
        title: "解锁弧线",
        text: "先照常拖动蓄力。再用另一根手指左右滑动拧弧；电脑也可按住 A（左旋）或 D（右旋）。",
        hole: "stage",
      },
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

  const roster = {
    /** "ranked" | "friendly" | "online" —— 仅影响开战，编队页共用 */
    mode: "ranked",
    /** "normal" | "hard" —— 仅排位赛人机 */
    aiDifficulty: "normal",
    team: "A",
    activeSlot: 0,
    pitchFolded: false,
    A: padLine(window.FOUNCY_DEFAULT_LINEUP_A),
    B: padLine(window.FOUNCY_DEFAULT_LINEUP_B),
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
    matchStarted: false,
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

  function pushMyLineup() {
    if (!online.net || !online.net.isConnected()) return;
    const ids = padLine(roster.A);
    online.net.send({ t: "lineup", ids });
  }

  function pushReady() {
    if (!online.net || !online.net.isConnected()) return;
    online.net.send({ t: "ready", ready: !!online.readyMe });
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
      window.FouncyBall.applyRemoteShot(msg);
      return;
    }
    if (msg.t === "arm" && window.FouncyBall) {
      window.FouncyBall.applyRemoteArm(msg);
      return;
    }
    if (msg.t === "restart" && window.FouncyBall) {
      window.FouncyBall.applyRemoteRestart();
    }
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
    if (ui.onlineHint) ui.onlineHint.textContent = "正在加入…";
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
    show("match");
    requestAnimationFrame(() => {
      window.FouncyBall.start({
        teamA: resolveLine(teamAIds),
        teamB: resolveLine(teamBIds),
        vsAI: false,
        localTeam,
        winScore: 2,
        trainingId: null,
        trainingLayout: null,
        onMatchOver: null,
        onNetEvent: (evt) => {
          if (!online.net || !online.net.isConnected()) return;
          if (evt.type === "shot") {
            online.net.send({
              t: "shot",
              playerId: evt.playerId,
              aim: evt.aim,
              power: evt.power,
              curveSign: evt.curveSign,
              curveRadius: evt.curveRadius,
              skillArmed: evt.skillArmed,
            });
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
    if (ui.trainBlurb) ui.trainBlurb.textContent = trainingData.blurb || "";
    if (ui.trainLevelCount) {
      ui.trainLevelCount.textContent = `${(trainingData.levels || []).length} 关`;
    }

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

    const diffMeta = (trainingData.difficulties || []).find((d) => d.id === trainUi.diff);
    if (ui.trainDiffDesc) {
      ui.trainDiffDesc.textContent = diffMeta
        ? `${diffMeta.tag || ""} · ${diffMeta.desc || ""}`
        : "";
    }

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
        <div class="tlevel-name">${lv.name}</div>
        <div class="tlevel-sub">${lv.subtitle || ""}</div>
        <p class="tlevel-tip">${lv.tip || ""}</p>
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
        onPhaseChange: (phase) => onTutorialPhase(phase),
        onMatchOver: (winner) => {
          hideTutorGuide();
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
            if (ui.btnExit) ui.btnExit.textContent = "退出";
            alert("新手训练完成！现在可以自由探索主页、编队等功能了。");
            show("home");
            return;
          }
          tutorialActiveLevel = null;
          if (ui.btnExit) ui.btnExit.textContent = "退出";
          show("train");
        },
      });
    });
  }

  function show(name) {
    closePlayerSheet();
    hideTutorGuide();

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

  function renderPitch() {
    if (!ui.pitchSlots) return;
    const line = currentLine();
    ui.pitchSlots.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const id = line[i];
      const p = id ? byId[id] : null;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pitch-slot" + (roster.activeSlot === i ? " active" : "");
      btn.dataset.slot = String(i);
      btn.style.left = `${SLOT_POS[i].x}%`;
      btn.style.top = `${SLOT_POS[i].y}%`;
      btn.innerHTML = avatarHtml(p, "空");
      btn.addEventListener("click", () => {
        roster.activeSlot = i;
        renderRoster();
      });
      // 场上球员也可拖到其他槽交换
      if (p) {
        btn.addEventListener("pointerdown", (e) => beginDrag(e, p.id, i));
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

  /** 底部简易演示：按技能播一段循环小动画 */
  function startSkillDemo(p) {
    stopSkillDemo();
    const canvas = ui.psDemoCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const skillId = p && p.skill ? p.skill.id : null;
    const t0 = performance.now();

    function drawBall(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f5f5f5";
      ctx.fill();
      ctx.strokeStyle = "#2a1f14";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function drawPlayer(x, y, r, img, scale) {
      const rr = r * (scale || 1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = "#3d7bfd";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      if (img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, rr - 1.5, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x - rr, y - rr, rr * 2, rr * 2);
        ctx.restore();
      }
      ctx.restore();
    }

    const avatar = new Image();
    if (p && p.avatar) avatar.src = p.avatar;

    function frame(now) {
      const t = ((now - t0) / 1000) % 3.2;
      ctx.clearRect(0, 0, W, H);

      // 简易场地边线
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, W - 20, H - 20);
      ctx.beginPath();
      ctx.moveTo(W * 0.55, 10);
      ctx.lineTo(W * 0.55, H - 10);
      ctx.stroke();

      const py = H * 0.55;
      let px = 56;
      let pr = 18;
      let bx = W * 0.62;
      let by = py;
      let scale = 1;

      if (!skillId) {
        px = 56 + (t / 3.2) * (W - 120);
        drawPlayer(px, py, pr, null, 1);
        drawBall(bx, by, 9);
      } else if (skillId === "box_hunter") {
        // 减速后二段加速
        if (t < 1.1) px = 50 + t * 70;
        else if (t < 1.55) px = 50 + 1.1 * 70;
        else px = 50 + 1.1 * 70 + (t - 1.55) * 160;
        bx = Math.min(W - 40, 90 + t * 95);
        if (t > 1.5 && t < 1.75) {
          ctx.fillStyle = "rgba(255,120,100,0.55)";
          ctx.beginPath();
          ctx.arc(px, py, 28, 0, Math.PI * 2);
          ctx.fill();
        }
        drawPlayer(px, py, pr, avatar, 1);
        drawBall(bx, by, 9);
      } else if (skillId === "dragon_glide" || skillId === "tempo_arc") {
        // 弧线轨迹
        const u = t / 3.2;
        px = 40 + u * (W - 90);
        const bend = skillId === "tempo_arc" ? 38 : 28;
        py = H * 0.55 - Math.sin(u * Math.PI) * bend;
        ctx.strokeStyle = "rgba(126,200,245,0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const s = i / 40;
          const x = 40 + s * (W - 90);
          const y = H * 0.55 - Math.sin(s * Math.PI) * bend;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        drawPlayer(px, py, pr, avatar, 1);
        drawBall(W * 0.72, H * 0.55, 9);
      } else if (skillId === "buu_form") {
        scale = t < 1.2 ? 1 + (t / 1.2) * 0.35 : 1.35;
        px = 70 + Math.min(1, t / 2.2) * 120;
        bx = px + 40 + scale * 10;
        drawPlayer(px, py, pr, avatar, scale);
        drawBall(bx, by, 9);
      } else if (skillId === "monk_slide") {
        px = 50 + Math.min(1, t / 1.4) * 150;
        const foeX = W * 0.62;
        const hit = t > 1.2;
        drawPlayer(foeX, py, 16, null, 1);
        if (hit) {
          ctx.strokeStyle = "rgba(200,245,66,0.8)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(foeX, py, 26 + (t - 1.2) * 10, 0, Math.PI * 2);
          ctx.stroke();
        }
        drawPlayer(Math.min(px, foeX - 28), py, pr, avatar, 1);
        drawBall(W * 0.82, py, 9);
      } else if (skillId === "stroll") {
        // 未碰球再动一次
        if (t < 1.2) px = 48 + t * 55;
        else if (t < 1.55) px = 48 + 1.2 * 55;
        else px = 48 + 1.2 * 55 + (t - 1.55) * 90;
        if (t > 1.45 && t < 1.7) {
          ctx.fillStyle = "rgba(200,245,66,0.4)";
          ctx.beginPath();
          ctx.arc(px, py, 26, 0, Math.PI * 2);
          ctx.fill();
        }
        drawPlayer(px, py, pr, avatar, 1);
        drawBall(W * 0.78, py, 9);
      } else {
        px = 50 + (t / 3.2) * (W - 120);
        drawPlayer(px, py, pr, avatar, 1);
        drawBall(bx, by, 9);
      }

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
    if (ui.labelA) ui.labelA.textContent = "蓝";
    if (ui.labelB) ui.labelB.textContent = isRanked() ? "电脑" : "红";
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
      roster.pitchFolded = !roster.pitchFolded;
      syncPitchFoldUi();
    });
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
    if (isOnline() && online.role) {
      show("online");
      syncOnlineUi();
      return;
    }
    show(lobbyReturn === "match" ? "home" : lobbyReturn || "home");
  });

  const tutorOkBtn = document.getElementById("tutorOk");
  if (tutorOkBtn) {
    tutorOkBtn.addEventListener("click", () => dismissTutorGuide());
  }

  if (ui.playerSheetClose) ui.playerSheetClose.addEventListener("click", closePlayerSheet);
  if (ui.playerSheetBackdrop) ui.playerSheetBackdrop.addEventListener("click", closePlayerSheet);

  syncHomeModePills();
  renderRankHome();
  renderTrain();
  syncTutorDockLock();

  // 新手未完成：直接切入当前简单关
  if (!isTutorialDone()) {
    const next = getNextTutorialLevel();
    if (next) startTrainingLevel(next, { fromTutorial: true });
    else show("train");
  } else {
    show("home");
  }
})();
