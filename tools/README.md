# 训练关卡工具

## 可视化编辑器

1. 在项目根目录开本地服务：

```bash
python -m http.server 5173
```

2. 浏览器打开：

[http://127.0.0.1:5173/tools/level-editor.html](http://127.0.0.1:5173/tools/level-editor.html)

3. 拖放球 / 蓝方 / 红方，填名称与难度。
4. 点 **写入游戏…**，下载 `_last-level.json`。
5. 把文件放到 `tools/`（若在「下载」文件夹则移过来），执行：

```bash
node tools/add-training-level.mjs tools/_last-level.json
```

同 `id` 会覆盖旧关。默认**不**跑极难人机验关（手搓关卡可直接写入）。

需要可解性检测时：

```bash
node tools/add-training-level.mjs tools/_last-level.json --verify
```

## 可解性检测（极难搜索，可选）

```bash
node tools/verify-training.mjs
```

要求：任意球员能进，且**离球最近的蓝方**也能一击进上门。手动做关可不跑。
