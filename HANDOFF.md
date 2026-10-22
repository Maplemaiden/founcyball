# Founcyball 交接文档（HANDOFF）

> 给新对话用：先读本文，再按需打开 `docs/` 与源码。  
> 更新日：2026-10-21（晚）  
> 仓库：https://github.com/Maplemaiden/founcyball

---

## 1. 项目是什么

**足球主题 · 俯视 2D · 回合制弹球对战**（工作名 Founcyball）。

- 竖屏，面向手机；载体是 **本地 Web（HTML Canvas）**，无构建；也可经 GitHub Pages 托管
- 模式：**排位人机**（普通 / 极难 AI）、**友谊赛本地双人**、**PeerJS 联机**、**训练关卡**
- 各上阵 **3 名圆形球员** + 1 球
- 球员用**中文互联网外号**（避免真名侵权）；数据里必须带 `prototype` 标明现实原型
- 正式内容方向见 `docs/FORMAL_OUTLINE.md`（微信小游戏 / Cocos 为后续目标）
- 早期玩法草稿见 `docs/MVP_DESIGN.md`（部分已过时，**以本文 + 代码为准**）

---

## 2. 怎么跑

```bash
cd c:\Users\yoimi\Desktop\myGame\founcyball
python -m http.server 5173
```

浏览器打开：http://127.0.0.1:5173/

启动流程：

1. **加载页**（`#bootSplash`）预加载全部球员头像 + 场外围图  
2. 若新手未完成 → 强制进入简单关 `e1`（见 §8）  
3. 否则进入主页

脚本顺序（`index.html` 底部，无构建）：

`physics.js` → `players.js` → `ranks.js` → `training.js` → `ai.js` → `net.js` → `game.js` → `app.js`  
另有 PeerJS CDN（联机用）。

---

## 3. 目录结构

```
founcyball/
├── HANDOFF.md
├── index.html                 ← 多屏壳 + 加载页 + 新手引导 + 联机聊天 UI
├── css/style.css
├── assets/
│   ├── pitch-surround.jpg     ← 场外围美术（绘制时 evenodd 扣洞）
│   └── avatars/               ← 球员头像 PNG
├── js/
│   ├── app.js                 ← 大厅/编队/训练/新手/联机/聊天/启动加载
│   ├── game.js                ← 对局核心，导出 FouncyBall
│   ├── ai.js                  ← 人机：normal 混战 / hard 仿真搜索
│   ├── net.js                 ← PeerJS 联机封装 FouncyNet
│   └── data/
│       ├── physics.js         ← 手感常数 + modsFromStats
│       ├── players.js         ← 外号球员 + prototype + 技能
│       ├── ranks.js           ← 排位段位假数据
│       └── training.js        ← 训练关卡 + tutorialLevelIds
├── tools/
│   ├── README.md
│   ├── level-editor.html      ← 可视化摆位编辑器
│   ├── add-training-level.mjs ← JSON → 写入 training.js
│   └── verify-training.mjs    ← 极难搜索验关是否可解
└── docs/
    ├── FORMAL_OUTLINE.md
    └── MVP_DESIGN.md
```

---

## 4. 球员表（必读：外号 ↔ 原型）

展示名用外号；**改数值/技能/美术时请同时看 `prototype`**，勿只凭外号猜人。

| id | 外号(name) | prototype（原型） | lane | 技能 |
|----|------------|-------------------|------|------|
| `suya` | 苏牙 | Luis Suárez / 苏亚雷斯 | fwd | 禁区猎手 |
| `zongcai` | 总裁 | Cristiano Ronaldo / C罗 | fwd | 翩若游龙 |
| `modi` | 魔笛 | Luka Modrić / 莫德里奇 | mid | 节拍弧 |
| `habao` | 哈宝 | Erling Haaland / 哈兰德 | fwd | 魔人布欧 |
| `wuseng` | 武僧 | Pepe / 佩佩 | def | 武林飞铲 |
| `meilaoban` | 梅老板 | Lionel Messi / 梅西 | mid | 闲庭信步 |

默认阵容：蓝 `梅老板/苏牙/武僧`；红 `总裁/魔笛/哈宝`。

**约定：** 新增球员必须写 `prototype: "英文名 / 中文名"`；外号仅作 `name`；并放入 `assets/avatars/{id}.png`。

---

## 5. 已实现玩法（以代码为准）

### 5.1 对局规则

| 项 | 现状 |
|----|------|
| 视角 | 竖屏；球场逻辑 **105×68**；球门在上下 |
| 球门 | `goalWidthM ≈ 底线 1/3`（原 2/5 × 5/6）；槽深 **6** |
| 单位 | 球员/球均为圆；默认半径统一（哈宝技能可变大） |
| 回合 | 选人 → 拖拽蓄力 → 松手发射；全场速度低于阈值可换手 |
| 蓄力 | **从球员圆心起算**；往哪边拉，反方向弹出 |
| 弧线 | 绕圆转向；碰撞后取消；布欧本击禁弧；新手前两关 `disableCurve` |
| 进球 | 球**整体**越过门线且在门柱之间 |
| 乌龙 | **本回合**踢进**自家门**，且本击**最后触球**是己方球员 → 对方得分，文案「乌龙球」 |
| 进球表现 | 先锁定 `pendingScorer` → **慢放**约 0.55s（物理×0.2）+ 白闪 → 再弹结算；慢放中球钳在门内防弹回漏判 |
| 胜负 | 排位/友谊/联机 **先到 2**；训练关 **先到 1**（`winScore`） |

### 5.2 操作

- **主指/鼠标**：点球员拖拽蓄力，松手发射  
- **副指**：主指按住时侧向拉 → 弧线  
- **键盘**：蓄力中 **A** 左旋 / **D** 右旋  
- 轨迹预览：虚线 + 力度疏密 + 一次折射预判  

### 5.3 技能与充能

- 能量 0～1，满了可点底部能量条发动，出手归零  
- `fwd` 自己击打触球 +1/3，**每回合每人一次**；`mid` 触球 +1/5/回合；`def` 己方半场触球或撞对方 +1/5/回合  

| 技能 | 效果摘要 |
|------|----------|
| 禁区猎手 | 碰球后等减速，再沿**当前速度方向**突然二段加速（方向不变） |
| 翩若游龙 | 力+20、弧+20，1 回合 |
| 节拍弧 | 弧+20，2 回合 |
| 魔人布欧 | ×1.25 体积/质量、力+20、本击禁弧，1 回合 |
| 武林飞铲 | 本击首个碰到的对手受伤 1 回合 |
| 闲庭信步 | 本击未碰人/球 → 可再击一次 |

### 5.4 人机难度

| 难度 | 行为 |
|------|------|
| `normal` | 原混战 AI：加权选人 + 大噪声瞄准 |
| `hard` | 真实物理静默仿真搜索；能进则进；`evaluateShot` 在 `game.js` |

排位主页可选「普通 / 极难」；训练关对手固定 **极难**。

### 5.5 大厅模式

- **主页**：段位假数据球场皮 + **排位赛 / 友谊赛**；点「开战」直接用当前编队进对局（排位人机随机红方）  
- **底栏常驻**（对局中隐藏）：**训练 · 编队 · 主页 · 球探 · 商店** —— 只切屏  
- **排位赛**：人机，红方随机阵容，可选 AI 难度  
- **友谊赛**：本地双人热座  
- **联机**：PeerJS 房间号；房主蓝方、客机红方；双方准备后开战  
- **编队**（排位/友谊共用）：上方可折叠半场三角**固定槽位**；下方滚屏圆卡（已拥有按中文名排序 + 未获得占位）；拖卡换上场；**点卡**打开详情抽屉（四维/技能/演示 canvas，无上场按钮）  
- **训练**：简单/普通/困难关卡列表；通关写入 `localStorage`（`founcy_train_v1`）  
- 球探 / 商店：仍为占位  

### 5.6 联机聊天

- 仅联机对局右下角显示聊天按钮  
- 点开从底部上拉面板；消息经 Peer 同步 `{ t: "chat", text, team, ts }`  
- 气泡颜色：蓝方 `#3d7bfd`、红方 `#e74c3c`；未读角标  
- 本局记录保留在 `online.chatLog`（离房清空）  

---

## 6. 新手教程

- 必打简单关顺序：`tutorialLevelIds = ["e1","e2","e3"]`  
  - e1 门前礼包、e2 通天走廊：`disableCurve: true`（禁弧）  
  - e3 绝妙弧线：解锁弧线并引导副指 / A·D  
- 未完成前：**不能进主页 / 编队 / 球探 / 商店 / 联机**；底栏仅训练可用  
- 通关后自动进下一关；全部完成后解锁大厅  
- 关内聚光引导：`#tutorGuide`（球场高亮、周围变暗）  
- 重置新手进度（控制台）：

```js
localStorage.removeItem('founcy_train_v1')
```

然后刷新。

---

## 7. 训练关卡与工具

当前关卡（`js/data/training.js`）：

| 难度 | id | 名称 |
|------|-----|------|
| 简单 | e1 / e2 / e3 | 门前礼包 / 通天走廊 / 绝妙弧线 |
| 普通 | n1 / n2 / n3 | 人墙绕弧 / 边路回扣 / 借墙弹射 |
| 困难 | h1 / h2 / h3 | 一线天 / 中圈重炮 / 背身刁钻 |

关卡字段要点：`layout`（ball / A[3] / B[3] 世界坐标米）、`teamA`/`teamB`、`disableCurve`、`idealShots`、`focus`。

**做关流程**（详见 `tools/README.md`）：

1. http://127.0.0.1:5173/tools/level-editor.html 摆位  
2. 下载 JSON → `node tools/add-training-level.mjs tools/_last-level.json`  
3. （可选）`node tools/add-training-level.mjs … --verify` 或 `node tools/verify-training.mjs`  

手搓关卡默认不跑极难验关；需要时再 `--verify`。

---

## 8. 四维 → 物理

`js/data/physics.js` → `modsFromStats`：

| 维 | 影响 |
|----|------|
| 力量 power | `powerMult` → 击打初速度 |
| 弧线 curve | 更小 `curveRMin`、更快拧满；0 则禁弧 |
| 控停 grip | `dragMult` 0.55~1.55 |
| 冲撞 weight | `mass` + 碰撞弹性倍率 |

技能的「力/弧 +20」加在有效属性上再重算 mods。

常改常数：`MAX_POWER` / `DRAG` / `CURVE_R_*` / `TURN_SWITCH_SPEED` / `PLAYER_R` / `BALL_R` / `WIN_SCORE`。

---

## 9. 关键 API

```js
FouncyBall.start({
  teamA, teamB,
  vsAI?, aiTeam?,
  aiDifficulty?: "normal"|"hard",
  winScore?,
  trainingId?, trainingLayout?,
  disableCurve?,          // 新手禁弧
  localTeam?: "A"|"B",    // 联机本机方
  onMatchOver?(winner),
  onPhaseChange?(phase, { turn, aiTeam }),
  onNetEvent?(evt),
})
FouncyBall.stop()
FouncyBall.waitAssets({ onProgress, timeoutMs })  // 启动加载
FouncyBall.evaluateShot(opts)                     // 极难 AI / 验关
FouncyBall.applyRemoteShot / applyRemoteArm / applyRemoteRestart

FouncyAI.decide({ bodies, team, pitch, phys, difficulty, evaluateShot })
FouncyNet.createNet()  // PeerJS
```

---

## 10. 刻意未做 / 占位

- 连携技  
- 微信小游戏 / Cocos 工程  
- 音效、商店实装、养成存档（训练通关除外）  
- 排位真实段位 / 赛季  
- 联机观战、表情包以外的社交  

---

## 11. 已知坑

1. **编队红方空槽**：须固定 3 槽，勿 `splice` 缩数组。  
2. **蓄力方向**：拉向的反方向弹出；原点锚定圆心。  
3. **进球**：须整球过线；慢放结算用 `pendingScorer`，勿再依赖慢放后的 `checkGoal()`。  
4. **乌龙**：看 `lastTouchTeam` + 是否自家门；得分方仍是对方。  
5. **AI 选人**：`pickWeighted` 吃 `{v,w}`（经 `scraped`）。  
6. **进球复位**：`resetPositions(true)` 保留能量/buff。  
7. **编队槽位**：站位按槽索引固定，勿再按 `lane` 重排坐标。  
8. **训练站位**：球员中心距 ≥14、球员-球 ≥10；开局会再 `separateOverlaps`。  
9. **新手锁底栏**：改导航时记得看 `isTutorialDone()`。  
10. **联机**：依赖公共 PeerServer + CDN；防火墙/网络差会连不上。  
11. **`tools/_last-level.json`**：本地草稿，勿提交仓库。  

---

## 12. 建议下一对话方向

1. 训练关内容扩充 / 星级评价（几击通关）  
2. 联机稳定性、断线重连、房间内聊天预开局  
3. 音效与基础反馈  
4. 平衡调参 / 连携技  
5. Cocos / 微信小游戏迁移  

新对话开场可复制：

```
请先阅读 c:\Users\yoimi\Desktop\myGame\founcyball\HANDOFF.md，
注意球员外号与 prototype 原型对照表，
再在当前 Web 正式版上继续：<你的具体任务>
```

---

## 13. 代码入口速查

| 想改… | 去哪 |
|--------|------|
| 胜负、摩擦、力度、弧线常数 | `js/data/physics.js` |
| 球员外号/原型/四维/技能 | `js/data/players.js` |
| 训练关 / 新手关顺序 | `js/data/training.js` |
| 人机决策（普通/极难） | `js/ai.js` |
| 联机 Peer | `js/net.js` |
| 大厅/编队/训练/新手/聊天/启动 | `js/app.js` |
| 物理、输入、绘制、技能、仿真 | `js/game.js` |
| 屏幕结构 / 加载页 / 引导 / 聊天 DOM | `index.html` |
| 样式 | `css/style.css` |
| 做关 / 验关 | `tools/` |
| 正式版规划 | `docs/FORMAL_OUTLINE.md` |

---

**一句话现状：** 竖屏 Web 可玩正式雏形——白天绿茵大厅 + 排位/友谊 + 半场编队与球员面板 + 弹球/弧线/充能技能（含苏牙二段）+ 乌龙与进球慢放 + 普通/极难人机 + 训练/新手教程 + PeerJS 联机聊天；连携与小游戏迁移未开始。
