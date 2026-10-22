# Founcyball 交接文档（HANDOFF）

> 给新对话用：先读本文，再按需打开 `docs/` 与源码。  
> 更新日：2026-10-22（通用技能页 / 名宿球员 / 市场占位）  
> 仓库：https://github.com/Maplemaiden/founcyball  
> Pages：https://maplemaiden.github.io/founcyball/（`index.html` 里 `?v=` 为缓存戳）

---

## 1. 项目是什么

**足球主题 · 俯视 2D · 回合制弹球对战**（工作名 Founcyball）。

- 竖屏，面向手机；载体是 **本地 Web（HTML Canvas）**，无构建；也可经 GitHub Pages 托管
- 模式：**排位人机**（普通 / 极难 AI）、**友谊赛本地双人**、**PeerJS 联机**、**训练关卡**
- 各上阵 **3 名圆形球员** + 1 球；对局棋子为**圆形大头照**（可随滑动旋转）
- 球员用**中文互联网外号**（避免真名侵权）；数据里必须带 `prototype` 标明现实原型
- **技能为通用装备**（按 lane 限定；每项技能全局只能装给一人），见 `js/data/skills.js`
- 球员**不绑定俱乐部**；连携仅按「指定球员组合」占位文案
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

1. **加载页**（`#bootSplash`）预加载球员头像（webp）+ 场外围图等  
2. 若新手未完成 → 强制进入简单关 `e1`（见 §8）  
3. 否则进入主页

脚本顺序（`index.html` 底部，无构建；`?v=` 仅为缓存戳）：

`physics.js` → `players.js` → `skills.js` → `ranks.js` → `training.js` → `ai.js` → `game.js` → `net.js` → `app.js`  
另有 PeerJS CDN（联机用）。

---

## 3. 目录结构

```
founcyball/
├── HANDOFF.md
├── index.html                 ← 多屏壳 + 加载页 + 新手引导 + 进球/结算 UI + 联机聊天
├── css/style.css              ← 注意：url() 相对本文件，资源写 ../assets/...
├── assets/
│   ├── pitch-surround.jpg     ← 场外围美术（绘制时 evenodd 扣洞）
│   ├── avatars/               ← 球员头像（主用圆形白底 .webp 256）
│   │   └── ref/               ← 参考原图（可不进首包）
│   └── ui/
│       ├── scoreboard-plaque.png  ← 进球中央比分牌（透明异形）
│       └── result-plaque.png      ← 终局结算底板（透明异形）
├── js/
│   ├── app.js                 ← 大厅/编队/技能页/市场/训练/新手/联机
│   ├── game.js                ← 对局核心，导出 FouncyBall
│   ├── ai.js                  ← 人机：normal 混战 / hard 仿真搜索
│   ├── net.js                 ← PeerJS 联机封装 FouncyNet
│   └── data/
│       ├── physics.js         ← 手感常数 + modsFromStats
│       ├── players.js         ← 外号球员 + prototype + avatar（无俱乐部字段）
│       ├── skills.js          ← 通用技能装备 FouncySkills + 连携占位
│       ├── ranks.js           ← 排位段位假数据
│       └── training.js        ← 训练关卡 + tutorialLevelIds
├── tools/
│   ├── README.md / level-editor.html / add-training-level.mjs / verify-training.mjs
│   ├── knockout_avatars.py / import_new_avatars.py
│   └── knockout_ui_plaques.py / compress_ui_plaques.py
└── docs/
    ├── FORMAL_OUTLINE.md
    └── MVP_DESIGN.md
```

---

## 4. 球员表（必读：外号 ↔ 原型）

展示名用外号；**改数值/美术时请同时看 `prototype`**。技能不写在球员上，见 §6。

| id | 外号 | prototype | lane |
|----|------|-----------|------|
| `suya` | 苏牙 | Luis Suárez / 苏亚雷斯 | fwd |
| `zongcai` | 总裁 | Cristiano Ronaldo / C罗 | fwd |
| `habao` | 哈宝 | Erling Haaland / 哈兰德 | fwd |
| `modi` | 魔笛 | Luka Modrić / 莫德里奇 | mid |
| `meilaoban` | 梅老板 | Lionel Messi / 梅西 | mid |
| `qizu` | 齐祖 | Zinedine Zidane / 齐达内 | mid |
| `xiaoluo` | 小罗 | Ronaldinho / 罗纳尔迪尼奥 | mid |
| `xiaobai` | 小白 | Andrés Iniesta / 伊涅斯塔 | mid |
| `wuseng` | 武僧 | Pepe / 佩佩 | def |
| `shuiye` | 水爷 | Sergio Ramos / 拉莫斯 | def |
| `shengkaxi` | 圣卡西 | Iker Casillas / 卡西利亚斯 | def |

默认阵容：蓝 `梅老板/苏牙/武僧`；红 `总裁/魔笛/哈宝`。  
未获得占位：`FOUNCY_LOCKED_PLAYERS`（编队列表展示，不可上场）。

**约定：** 新增球员必须 `prototype` + `avatar: assets/avatars/{id}.webp`（圆形**白底**头像）；**不要**写 `club` / `clubName`。

---

## 5. 已实现玩法（以代码为准）

### 5.1 对局规则

| 项 | 现状 |
|----|------|
| 视角 | 竖屏；球场逻辑 **105×68**；球门在上下 |
| 站位默认 | **蓝方在下**（攻上）、红方在上（攻下） |
| 视角规则 | 非热座：`viewBottomTeam` = 己方（人机=人类；联机=`localTeam`）；热座固定蓝在下，换手不翻屏 |
| 球门 | `goalWidthM ≈ 底线 1/3`；槽深 **6** |
| 单位 | 圆；棋子绘大头照；`SPIN_VISUAL≈0.28` 控制滚动观感 |
| 回合 | 选人 → 拖拽蓄力 → 松手发射；速度低于阈值换手 |
| 蓄力 | **从球员圆心起算**；往哪边拉，反方向弹出 |
| 弧线 | 见 §7；碰撞后取消；布欧本击禁弧；新手前两关 `disableCurve` |
| 进球 | 球**整体**过门线且在门柱间；慢放锁定 `pendingScorer`；同帧弹回门外用扫掠仍判进 |
| 乌龙 | 本回合踢进自家门 + 本击最后触球己方 → 对方得分 |
| 胜负 | 排位/友谊/联机 **先到 2**；训练 **先到 1**（`winScore`） |

### 5.2 进球 / 终局 UI（重要）

- **已取消**进球「继续」模态打断（旧 `#overlay` 仅兼容残留路径）
- **普通进球**：慢放 → 中央 `#goalFanfare` 比分牌（旧分→跳变新分）→ ~1.6s 自动开球
- **决胜球**：比分演出稍长 → `#resultScreen` 结算页  
  - **再来一局** / **再试一次**：`restartMatch`（联机仅房主可点并广播 restart）  
  - **返回**：调 `onMatchOver(winner)` → 主页 / 联机房间 / 训练页
- 底板图：`assets/ui/*-plaque.png`（透明异形）。**CSS 里必须写 `../assets/ui/...`**（相对 `css/`，写错会 404）

### 5.3 操作

- **主指/鼠标**：点球员拖拽蓄力  
- **副指**：侧向拉 → 弧线  
- **键盘**：蓄力中 **A** 左旋 / **D** 右旋  
- 轨迹预览：虚线 + 力度疏密 + 一次折射预判  

### 5.4 人机难度

| 难度 | 行为 |
|------|------|
| `normal` | 混战 AI：偏砸球/撞人，大噪声，不算落点 |
| `hard` | 真实物理静默仿真搜索；`evaluateShot` 在 `game.js` |

排位可选普通/极难；训练对手固定极难。人机红方开局**随机 3 人**，编队页不展示电脑阵容。

### 5.5 大厅模式

- **主页**：段位球场皮 + 排位 / 热座 / 联机；开战用当前编队  
- **底栏**（对局隐藏）：训练 · 编队 · 主页 · **技能** · **市场**  
- **排位**：人机，红方随机；**热座**：本地双人；**联机**：PeerJS 开房  
- **编队**：半场槽位 + 圆卡拖拽；卡片**不显示球队**  
- **开球站位**：先手 / 后手两套；点「摆位」拖拽保存  
  - 约束：不可进中圈；**最多 1 人**进大禁区；仅己方半场  
  - 存 `localStorage`（`founcy_formation_v1`）  
- **技能页**：通用技能列表（标位置）+ 连携占位 Tab；点技能弹出装备抽屉（同 lane 球员；一技一人；可卸下）  
  - 装备存 `founcy_skill_equip_v1`；API：`FouncySkills.equipTo / unequip / forPlayer`  
- **市场页**：转会 / 球衣 / 边框占位（未实装）  
- **球员详情**：显示当前装备技能 + 迷你物理演示  
- **训练**：通关 `founcy_train_v1`  

### 5.6 联机聊天

- 对局右下角 FAB；Peer 同步 `{ t: "chat", ... }`；离房清空  

---

## 6. 技能与充能（`skills.js`）

- 球员数据**不再**内嵌 `skill`；对局里 `game.js` 用 `FouncySkills.forPlayer(id)` 解析  
- 能量 0～1，满了可发动，出手归零  
- 充能：`fwd` 击打触球 +1/3/回合；`mid` 触球 +1/5/回合；`def` 己方半场触球或撞对方 +1/5/回合  
- 默认装备：`box_hunter→suya`，`dragon_glide→zongcai`，`buu_form→habao`，`tempo_arc→modi`，`stroll→meilaoban`，`monk_slide→wuseng`

| id | 名称 | lane | 效果摘要 |
|----|------|------|----------|
| `box_hunter` | 禁区猎手 | fwd | 碰球减速后沿速度方向二段加速 |
| `dragon_glide` | 翩若惊鸿 | fwd | 力+20、弧+20，1 回合 |
| `buu_form` | 魔人布欧 | fwd | ×1.25 体积/质量、力+20、本击禁弧，1 回合 |
| `tempo_arc` | 节拍弧 | mid | 弧+20，2 回合 |
| `stroll` | 闲庭信步 | mid | 未碰人/球 → 可再击 |
| `monk_slide` | 武林飞铲 | def | 本击首碰对手受伤 1 回合 |

连携技：`COMBOS` 仅占位（银河齐射 / 宇宙传控 / 五盾防线），**未实装**。

---

## 7. 四维 → 物理（弧线已重标定）

`js/data/physics.js` → `modsFromStats`：

| 维 | 影响 |
|----|------|
| 力量 | `powerMult` → 初速度 |
| 弧线 | 见下表；`curveDisabled` 时完全不能拧弧 |
| 控停 | `dragMult` 0.55～1.55 |
| 冲撞 | `mass` + 弹性倍率 |

**弧线标尺（2026-10 定稿）：**

| 属性 | 满拧 Rmin（约） | 说明 |
|------|-----------------|------|
| **0** | — | 禁用弧线 |
| **70** | ≈50.3 | ≈旧公式「属性 32」手感 |
| **100** | **30** | ≈旧地板 15×2，不满拧过弯 |
| 低属性 | →118 | 接近直线 |

其它常改：`MAX_POWER` / `DRAG` / `CURVE_R_MAX` / `SPIN_VISUAL` / `TURN_SWITCH_SPEED` / `PLAYER_R` / `BALL_R` / `WIN_SCORE`。

---

## 8. 新手教程

- 顺序：`tutorialLevelIds = ["e1","e2","e3"]`；e1 / e2 禁弧（`disableCurve`），e3 开弧  
- 未完成：锁主页/编队/技能/市场/联机，底栏仅训练  
- **e1**：聚光卡 `#tutorGuide`（选人 → 直线蓄力）  
- **e2 / e3**：进关居中 `#tutorIntro` 操作动画（e2 单指蓄满；e3 双手拧弧）；HUD「再看」可重播；**无**点选类提示卡  
- **失败**：`autoRetryOnFail` — 不弹失败窗、不回训练页，原地复位；e2/e3 再播进关动画  
- 重置：`localStorage.removeItem('founcy_train_v1')` 后刷新（注意拼写是 `localStorage`）  

---

## 9. 训练关卡与工具

| 难度 | id | 名称 |
|------|-----|------|
| 简单 | e1 / e2 / e3 | 门前礼包 / 通天走廊 / 绝妙弧线 |
| 普通 | n1 / n2 / n3 | 人墙绕弧 / 边路回扣 / 借墙弹射 |
| 困难 | h1 / h2 / h3 | 一线天 / 中圈重炮 / **借力打力** |

做关：`tools/level-editor.html` → 下载 JSON →  

```bash
node tools/add-training-level.mjs tools/_last-level.json
```

默认**不**跑极难验关。需要可解性检测时加 `--verify`，或单独：

```bash
node tools/verify-training.mjs
```

美术工具（Python + Pillow）：

```bash
python tools/knockout_avatars.py      # 头像抠白
python tools/import_new_avatars.py    # 新头像导入 → 圆形白底 webp
python tools/knockout_ui_plaques.py   # UI 牌抠外底 → 透明 PNG
python tools/compress_ui_plaques.py   # 压缩 JPG 源（可选）
```

---

## 10. 关键 API

```js
FouncyBall.start({
  teamA, teamB,
  vsAI?, aiTeam?,
  aiDifficulty?: "normal"|"hard",
  winScore?,
  trainingId?, trainingLayout?,
  kickoffLayouts?,        // 编队自定义开球站位
  disableCurve?,
  localTeam?: "A"|"B",
  autoRetryOnFail?, onAutoRetry?,
  onMatchOver?(winner),   // 结算「返回」；勿再依赖弹窗继续
  onPhaseChange?(phase, { turn, aiTeam }),
  onNetEvent?(evt),
})
FouncyBall.stop()
FouncyBall.waitAssets({ onProgress, timeoutMs })
FouncyBall.avatarReady(id)
FouncyBall.evaluateShot(opts)
FouncyBall.applyRemoteShot / applyRemoteArm / applyRemoteRestart

FouncyAI.decide({ bodies, team, pitch, phys, difficulty, evaluateShot })
FouncyNet.createNet()
```

---

## 11. 刻意未做 / 占位

- 连携技实装（仅 `skills.js` 文案）  
- 微信小游戏 / Cocos  
- 音效、市场实装、养成（训练通关除外）  
- 排位真实段位 / 赛季  
- 联机断线重连、观战  

---

## 12. 已知坑

1. **编队红方空槽**：固定 3 槽，勿 `splice` 缩数组。  
2. **蓄力**：拉向的反方向弹出；原点锚定圆心。  
3. **进球**：整球过线；慢放用 `pendingScorer`。  
4. **乌龙**：`lastTouchTeam` + 自家门。  
5. **CSS 资源路径**：相对 `css/style.css`，必须 `../assets/...`。  
6. **UI 牌 JPG 源**：外圈有底；线上用 **PNG 透明版**。  
7. **弧线 0**：`curveDisabled`，输入与 AI 都不得拧弧。  
8. **AI 选人**：`pickWeighted` 吃 `{v,w}`（`scraped`）。  
9. **进球复位**：`resetPositions(true)` 可保留能量/buff。  
10. **编队槽位**：人选按槽索引；开球坐标在 `formations.kick/receive`，勿按 lane 重排。  
11. **摆位模式**：须点「摆位」才能拖站位；未进入时拖拽只换人。手机触控已加 document/touch 兜底。  
12. **新手锁底栏**：改导航看 `isTutorialDone()`。  
13. **联机**：公共 PeerServer + CDN；网络差易失败；开战同步双方 `kickoffLayouts`。  
14. **`tools/_last-level.json`**：本地草稿，勿提交。  
15. **旧设备看不到新功能**：多半是 HTML/JS 缓存；打开带 `?r=1` 或清站点数据。  

---

## 13. 建议下一对话方向

1. 连携技实装 / 技能平衡  
2. 训练关扩充与星级  
3. 联机稳定性、断线重连  
4. 音效与手感反馈  
5. Cocos / 微信小游戏迁移  

新对话开场可复制：

```
请先阅读 c:\Users\yoimi\Desktop\myGame\founcyball\HANDOFF.md，
注意球员外号与 prototype（无俱乐部绑定）、skills.js 通用装备（一技一人）、
编队先手/后手摆位、新手教程、进球中央比分牌+结算页，
再在当前 Web 正式版上继续：<你的具体任务>
```

---

## 14. 代码入口速查

| 想改… | 去哪 |
|--------|------|
| 胜负、摩擦、力度、弧线标尺、旋转观感 | `js/data/physics.js` |
| 球员外号/原型/四维/头像 | `js/data/players.js` |
| 通用技能装备 / 连携占位 | `js/data/skills.js` |
| 训练关 / 新手关顺序 | `js/data/training.js` |
| 人机 | `js/ai.js` |
| 联机 Peer | `js/net.js` |
| 大厅/编队/技能页/市场/新手/聊天 | `js/app.js` |
| 物理、输入、绘制、技能结算、进球演出 | `js/game.js` |
| 比分牌 / 结算底板 | `assets/ui/*.png` + `css/style.css` |
| 屏幕 DOM | `index.html` |
| 做关 / 抠图工具 | `tools/` |
| 正式版规划 | `docs/FORMAL_OUTLINE.md` |

---

**一句话现状：** 竖屏 Web 可玩雏形——排位/热座/联机/训练 + 11 名外号球员（白底头像）+ 通用技能装备页 + 编队开球摆位 + 新手教程 + 进球比分牌/结算；市场与连携占位；小游戏迁移未开始。
