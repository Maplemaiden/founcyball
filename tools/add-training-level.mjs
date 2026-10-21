/**
 * 把关卡 JSON 写入 js/data/training.js（同 id 则覆盖）
 *
 * 用法：
 *   node tools/add-training-level.mjs tools/_last-level.json
 *   node tools/add-training-level.mjs path/to/level.json --no-verify
 *
 * 编辑器：
 *   先开本地服务：python -m http.server 5173
 *   打开 http://127.0.0.1:5173/tools/level-editor.html
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const trainingPath = path.join(root, "js", "data", "training.js");

const args = process.argv.slice(2).filter((a) => a !== "--no-verify");
const noVerify = process.argv.includes("--no-verify");
const jsonPath = args[0];

if (!jsonPath) {
  console.error("用法: node tools/add-training-level.mjs <level.json> [--no-verify]");
  process.exit(1);
}

const absJson = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
if (!fs.existsSync(absJson)) {
  console.error("找不到文件:", absJson);
  process.exit(1);
}

const level = JSON.parse(fs.readFileSync(absJson, "utf8"));
validateLevel(level);

const code = fs.readFileSync(trainingPath, "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const data = sandbox.window.FOUNCY_TRAINING;
if (!data || !Array.isArray(data.levels)) {
  console.error("无法解析 FOUNCY_TRAINING.levels");
  process.exit(1);
}

const idx = data.levels.findIndex((l) => l.id === level.id);
const action = idx >= 0 ? "覆盖" : "新增";
if (idx >= 0) data.levels[idx] = level;
else data.levels.push(level);

// 按难度分组排序，方便阅读
const order = { easy: 0, normal: 1, hard: 2 };
data.levels.sort((a, b) => {
  const da = order[a.diff] ?? 9;
  const db = order[b.diff] ?? 9;
  if (da !== db) return da - db;
  return String(a.id).localeCompare(String(b.id));
});

const out = serializeTraining(data);
fs.writeFileSync(trainingPath, out, "utf8");
console.log(`[${action}] ${level.diff}/${level.id}「${level.name}」→ js/data/training.js`);
console.log(`当前共 ${data.levels.length} 关`);

if (!noVerify) {
  console.log("\n运行可解性检测…");
  const r = spawnSync(process.execPath, [path.join(__dirname, "verify-training.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("\n检测未全部通过。关卡已写入，请用编辑器调整站位后再 add。");
    process.exitCode = 1;
  }
}

function validateLevel(lv) {
  const need = ["id", "diff", "name", "teamA", "teamB", "layout"];
  for (const k of need) {
    if (lv[k] == null) throw new Error(`缺少字段: ${k}`);
  }
  if (!["easy", "normal", "hard"].includes(lv.diff)) {
    throw new Error("diff 必须是 easy | normal | hard");
  }
  if (!Array.isArray(lv.teamA) || lv.teamA.length !== 3) throw new Error("teamA 需要 3 人");
  if (!Array.isArray(lv.teamB) || lv.teamB.length !== 3) throw new Error("teamB 需要 3 人");
  if (!lv.layout.ball || !lv.layout.A || !lv.layout.B) throw new Error("layout 不完整");
  if (lv.layout.A.length !== 3 || lv.layout.B.length !== 3) throw new Error("layout A/B 需要 3 点");
  lv.subtitle = lv.subtitle || "";
  lv.tip = lv.tip || "";
  lv.idealShots = lv.idealShots || 1;
  lv.focus = lv.focus || "aim";
}

function posCode(p) {
  return `{ x: W * ${(p.x / 68).toFixed(3)}, y: L * ${(p.y / 105).toFixed(3)} }`;
}

function q(s) {
  return JSON.stringify(s);
}

function serializeLevel(lv, indent) {
  const sp = " ".repeat(indent);
  const sp2 = " ".repeat(indent + 2);
  const sp3 = " ".repeat(indent + 4);
  const lines = [];
  lines.push(`${sp}{`);
  lines.push(`${sp2}id: ${q(lv.id)},`);
  lines.push(`${sp2}diff: ${q(lv.diff)},`);
  lines.push(`${sp2}name: ${q(lv.name)},`);
  lines.push(`${sp2}subtitle: ${q(lv.subtitle || "")},`);
  lines.push(`${sp2}tip: ${q(lv.tip || "")},`);
  lines.push(`${sp2}idealShots: ${lv.idealShots || 1},`);
  lines.push(`${sp2}focus: ${q(lv.focus || "aim")},`);
  lines.push(`${sp2}teamA: ${JSON.stringify(lv.teamA)},`);
  lines.push(`${sp2}teamB: ${JSON.stringify(lv.teamB)},`);
  lines.push(`${sp2}layout: {`);
  lines.push(`${sp3}ball: ${posCode(lv.layout.ball)},`);
  lines.push(`${sp3}A: [`);
  lv.layout.A.forEach((p, i) => {
    lines.push(`${sp3}  ${posCode(p)}${i < 2 ? "," : ""}`);
  });
  lines.push(`${sp3}],`);
  lines.push(`${sp3}B: [`);
  lv.layout.B.forEach((p, i) => {
    lines.push(`${sp3}  ${posCode(p)}${i < 2 ? "," : ""}`);
  });
  lines.push(`${sp3}],`);
  lines.push(`${sp2}},`);
  lines.push(`${sp}},`);
  return lines.join("\n");
}

function serializeTraining(data) {
  const sections = { easy: [], normal: [], hard: [], other: [] };
  for (const lv of data.levels) {
    (sections[lv.diff] || sections.other).push(lv);
  }

  const levelBlocks = [];
  if (sections.easy.length) {
    levelBlocks.push("      // —— 简单 ——");
    sections.easy.forEach((lv) => levelBlocks.push(serializeLevel(lv, 6)));
  }
  if (sections.normal.length) {
    levelBlocks.push("      // —— 普通 ——");
    sections.normal.forEach((lv) => levelBlocks.push(serializeLevel(lv, 6)));
  }
  if (sections.hard.length) {
    levelBlocks.push("      // —— 困难 ——");
    sections.hard.forEach((lv) => levelBlocks.push(serializeLevel(lv, 6)));
  }
  sections.other.forEach((lv) => levelBlocks.push(serializeLevel(lv, 6)));

  const diffs = (data.difficulties || [])
    .map((d) => {
      return `      {
        id: ${q(d.id)},
        name: ${q(d.name)},
        tag: ${q(d.tag || "")},
        desc: ${q(d.desc || "")},
      },`;
    })
    .join("\n");

  return `/**
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
    blurb: ${q(data.blurb || "")},
    difficulties: [
${diffs}
    ],
    levels: [
${levelBlocks.join("\n")}
    ],
  };
})();
`;
}
