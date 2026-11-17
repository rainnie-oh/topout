# Topout P0

把攀岩记录变成一座岩点塔。目前这一版能做到：用你自己的数据生成一座真塔，在手机浏览器里看。

```
你的记录 (CSV/JSON) ──importer──▶ sessions ──bake (pymunk)──▶ web/public/data/mine.json ──▶ Vite 前端
```

## 1. 准备环境（只需一次）

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
npm --prefix web install
```

## 2. 填数据

两种格式任选，也可以混着用（同一天同一个岩馆会自动合并）：

- **按 session 汇总**：`templates/sessions_template.csv`，一行一次去岩馆
  `date,gym,V0-1,V2,V3,V4,V5,V6,V7+`
- **逐条 send**（App 导出多是这种）：`templates/sends_template.csv`
  `date,grade[,gym][,count]`

规则：

- **列名**：大小写和常见别名都认（Date / Rating / Location / Route Type …）。
- **难度**：认 V-scale 和 Font，比如 `6A`≈V3，`7A+`≈V7，都会落进 7 个难度桶。
- **跳过的行**：线路难度（`5.10a`）、非 Boulder 类型和无法识别的难度会跳过，并在报告里列出来。
- **日期**：只认 `YYYY-MM-DD` 或 `YYYY/M/D`，格式不对的行会报错，并告诉你是哪一行。

> 各 App 的真实导出文件我没拿到样本，只按常见列名做了宽松匹配。第一次导入某个 App 的文件时，先看一眼报告里跳过了多少行。

## 3. 生成塔

```bash
pipeline/.venv/bin/python pipeline/build.py 我的记录.csv
```

跑一遍几秒钟，输出 `web/public/data/mine.json`。同样的输入、种子和 pymunk 版本，结果是确定的。

只想单独跑一步也可以：
`pipeline/importer.py a.csv -o sessions.json`，然后 `pipeline/bake.py sessions.json`

示例数据：`data/sample_sessions.json`（原 `data3.json`），生成结果提交在 `web/public/data/sample.json`。

默认页面用的是 mock 数据 `sample.json`。你自己的数据生成到 `mine.json`，不进 git（仓库是公开的），打开 `?data=mine` 查看。

## 4. 看

```bash
npm --prefix web run dev -- --host
```

手机和电脑连同一个 Wi‑Fi，用手机打开终端里显示的 Network 地址。

`?data=xxx` 会加载 `web/public/data/xxx.json`，方便对比两次生成的结果。

发布：`npm --prefix web run build`，然后把 `web/dist/` 整个目录放到任意静态托管。

## 和原型的对应关系

行为以 `Prototype.dc.html` 为准，逐条移植：

- **落下回放**：START 0.4，SPEED 2.4，尾部残差用 smoothstep 混掉。
- **果冻物理**：弹簧回位加 PBD 碰撞，pusher 半径 36。
- **手势**：点按选中，竖滑滚动，横滑或按住 220ms 推岩点。
- **选中态**：放大加投影，其他岩点变暗。
- **刻度与 tooltip**：横短线刻度，地标虚线，中线常驻 tooltip。
- **其他**：年 / 月 / 周切换（ctrl+滚轮或触控板双指捏合也能切），深浅主题切换，回到顶部，名字可以改。

和原型不一样的地方：

| | 原型 | 现在 |
|---|---|---|
| 渲染 | 每个岩点一个 DOM/SVG 节点 | Canvas 画岩点和刻度，DOM 只负责控件和玻璃浮层 |
| 尺寸 | 固定 390×844 | 390 逻辑宽，等比缩放到设备宽度（最宽 440px），高度跟屏幕走 |
| 安全区 | 写死 top 58 / bottom 34 | 读 `env(safe-area-inset-*)` |
| 统计数字 | 写死 358 / 12,166 / V6 | 从数据算（样例数据里其实有 92 条 V7+） |
| 副标题 | "比 Alex 爬得还高" | "比去年高 X%"，今年没超过去年就不显示 |
| 年份标签 / 周起点 | 写死 2024–2026、2024-01-01 | 从数据推：第一次 session 那周的周一 |
| 名字、主题 | 刷新就丢 | 存在 localStorage |
| 分享按钮 | 不能点 | 系统分享，不支持时复制链接（海报是 P1） |

## 还没验证 / 已知问题

- **真机手感**：只在桌面浏览器里模拟手机尺寸点过，还没在真 iPhone / Android 上试过。
- **面积系数 C**：年 / 月 / 周固定是 3.2 / 12 / 55，和原型一致。一年 100 次左右的真实数据，塔会比样例矮很多，到时候看效果再决定要不要按数据量自动调。
- **原型里的遗留问题**：左上的「YYYY 年 M 月 ⌄」只显示，不能下拉选；V3 月牙形状还没换；涂鸦主题的黄色对比度低。
