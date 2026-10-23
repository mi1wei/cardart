# 3D 卡册翻页查看器（复刻 cardart.cc「Flip through in 3D」）设计文档

- 日期：2026-10-23
- 状态：已确认
- 实现计划：`docs/superpowers/plans/2026-10-23-album-book.md`
- 依据：REA 对原站的抓取与静态分析（证据见附录）。采用方案 B：外观与原站一致，用弹簧动画代替物理求解。

## 1. 目标

在本地复刻 https://cardart.cc/a/UtwuguztV8 里的「3D 翻阅」卡册。它是一本磨砂封面的四环活页册，每张透明 PVC 活页正反两面各插 2×3 张卡。功能包括：

- 拖拽或点击翻页；
- 点卡片看详情；
- 合上、打开封面。

外观和手感尽量接近原站。代码保持简单：JS 约 1100 行、CSS 约 360 行，不用框架。

## 2. 共识

用户说的：

- 「REA 分析一下这个网站 https://cardart.cc/a/UtwuguztV8, 分析其中3D相册的功能，复刻一个一样的」
- 选择方案 B，并对设计回复「确认」。

假设（设计阶段已列出，用户没有异议）：

- 这是个人演示项目，本地 `npm run dev` 能跑即可，不需要后端，也不需要部署。
- 「一样」指结构、布局、光影和交互流程一致，不追求像素级或物理级一致。
- 不复用原站的代码和卡面图片。默认使用程序绘制的占位卡，用户可以放入自己的图片。
- 界面用中文；桌面优先，触摸也能用。
- 不写单元测试（用户偏好），仓库里不放测试文件。用构建、仓库外的一次性检查脚本（node 断言和无头 Chrome）、与原站截图对比和手动清单来验证。

## 3. 范围

要做：

- **入口页**：显示相册标题、卡片数量和「3D 翻阅」按钮；点击后用 `import()` 懒加载查看器。
- **全屏查看器覆盖层**（布局同原站）：
  - 左上角显示标题；
  - 右上角放「合上/打开封面」书本图标按钮和 × 关闭按钮；
  - 底栏：打开时显示 ‹ k / N › 和提示；合上时显示「打开卡册」主按钮和提示；
  - 右侧卡片详情栏；
  - 竖屏手机时提示横屏。
- **3D 内容**：
  - 磨砂活页夹：封底、书脊、封面三块板，用两个铰链相连；
  - 钢制四环和环座；
  - PVC 活页：每面 2×3 个卡袋，环孔镂空；
  - 柔和阴影、环境反射；
  - 封面上的压印标题。
- **翻页**：
  - 由弹簧驱动整页翻转，外缘滞后形成弯曲；
  - 支持拖拽、甩动、点击两侧和键盘。

不做：

- 物理求解器；
- 布面、皮面、烫金等其他封面材质与配色，以及封面展示窗；
- 暗色模式、窄屏单页/平移模式、CSS 2D 降级版、多语言；
- 后端/API；
- Cmd-点击开新标签页、悬停翘角、焦点陷阱、图片 LRU 缓存。

保留基本的 aria 标签。

## 4. 技术选型

- Vite 8 + three 0.186，原生 JS ES 模块；不用 TypeScript，不用 UI 框架。
- 尽量使用 three 自带能力：
  - 环境与色调：用 `PMREMGenerator` 把仿原站的小「摄影棚」（渐变穹顶 + 3 块柔光板，§11）烘成环境图；`NeutralToneMapping`；
  - 阴影：`VSMShadowMap`（与原站相同），用 `shadow.radius` + `blurSamples` 做软阴影；地面用 `ShadowMaterial`，边缘淡出；书下方另加两块 alphaMap 平面做接触阴影；
  - 材质：`MeshPhysicalMaterial`，PVC 用 clearcoat，磨砂板用 `transmission` + `roughness` 做模糊透射；
  - 其他：`CanvasTexture`、`Raycaster`；
  - 几何：`ExtrudeGeometry`（圆角板）、`BoxGeometry`（铰链）、`TorusGeometry`（环）、`RoundedBoxGeometry`（环座，来自 `three/addons`）。
- 不写自定义 shader，活页弯曲在 CPU 上改写顶点。唯一的例外是地面阴影：用 `onBeforeCompile` 给 `ShadowMaterial` 加一行边缘淡出。

## 5. 文件结构与接口

```
index.html               入口页骨架
package.json             依赖 three；开发依赖 vite
public/cards.json        相册数据（默认 57 张占位卡）
public/cards/            可选：卡面图片
src/main.js              入口页：读 cards.json，渲染标题/数量/按钮，懒加载 viewer
src/style.css            入口页、覆盖层、底栏、详情栏、横屏提示样式
src/viewer.js            覆盖层 UI 与键盘；调用 createBook
src/book/layout.js       纯计算：尺寸常量、卡袋/卡位置、抖动、面内坐标→卡
src/book/textures.js     每一面的 CanvasTexture 绘制（膜、孔、卡袋、卡/占位）与图片加载
src/book/sheet.js        活页：截面曲线、静止孔角求解、网格与顶点更新
src/book/binder.js       活页夹：三板、铰链、环、环座、封面标题、接触阴影；pose(c)
src/book/scene.js        renderer、场景、灯光、环境、地面、镜头取景
src/book/book.js         createBook：组装、叶状态与弹簧、拖拽/点击、按需渲染
```

接口：

- `viewer.js`：`openViewer(album)` 创建覆盖层，返回关闭函数 `close`。
- `book.js`：`createBook(container, { album, insets, onChange, onCardClick })`，返回 `{ next(), prev(), toggleCover(), dispose() }`。
  - `insets = { top, bottom }`：顶栏、底栏的像素高度。画布铺满覆盖层，取景时避开这两条栏。
  - 初始状态 k = 1：直接以打开状态显示第一个跨页，不播放开封面动画。
  - `onChange({ spread, spreads, closed })`：创建后先回调一次，之后每次 k 变化时立即回调。`spread = k`，`spreads = S + 1`，`closed = (k === 0)`。
  - `onCardClick(card)`：`card` 是 cards.json 里的对象，另外附加 `index` 字段。
  - WebGL 不可用时抛出 `Error('webgl')`，由 viewer 显示提示。
- `layout.js`：
  - `DIM`：§7 中不随 S 变化的常量（含 W、H、T、CT、HB、h、drop 等）；
  - `sheetCount(n)`、`pocketRect(face, slot)`；
  - `cardPlacement(index)`：返回含抖动的位置与旋转；
  - `cardAt(face, x, y, n)`：按卡袋矩形判断，返回卡号或 −1。
- `textures.js`：`createFaceTexture(face, cards, onRedraw)`，返回 `CanvasTexture`；图片到达后重绘，并调用 `onRedraw`。
- `sheet.js`：
  - `arc(φ, Δ, L)`：圆弧位移函数（§8），binder 也用它；
  - `restHoleAngle(cy, R, y)`：静止孔角（§9）；
  - `restEdgeX(C, R, y)`：活页平铺在高度 y 时的外边 x，binder 用它计算 B；
  - `createSheet(frontTex, backTex)`，返回 `{ group, front, back, update(C, R, ψ, θ, b), dispose() }`。
- `binder.js`：
  - 纯计算：`binderPose(c, D, xb)` 返回 §8 的各关键点与环心 `{ p0, p1, p2, p3, phiS, phiF, n, sink, m, C }`；`binderSize(S)` 返回 `{ R, D, xb, B, closedCenter }`。
  - `createBinder({ sheets, title })`，返回 `{ group, R, B, xb, closedCenter, pose(c) → { C }, dispose() }`。
  - `pose(c)` 按封面进度摆放各部件，更新左侧接触阴影，返回环心 C。
  - `closedCenter`：合上时书的水平中心，用于镜头取景（§8）。
- `scene.js`：`createStage(container, halfWidth, insets)`，halfWidth = xb + B，用于取景宽度和阴影相机范围。返回 `{ scene, camera, renderer, frame(x, zoom), render(), resize(), dispose() }`。
  - `frame(x, zoom)` 按 §11 摆放镜头：取景中心为 x，距离再乘以 zoom。

## 6. 数据

`public/cards.json`：

```json
{
  "title": "图书馆借书卡",
  "cards": [
    { "id": "c01", "title": "卡片 1", "color": "#d9a441", "src": "cards/c01.jpg" }
  ]
}
```

- `src` 可选。缺失或加载失败时画占位卡：底色用 `color`，再画标题和序号。
- 默认文件包含 57 张没有 `src` 的占位卡，即 5 张活页、6 个跨页，与原站一致。
- 加载图片时设置 `crossOrigin = 'anonymous'`；建议把图片放在 `public/cards/`。

## 7. 尺寸常量

单位为 mm，1 个场景单位 = 1 mm。数值来自原站（REA）。

| 项 | 值 |
|---|---|
| 卡 | 85.6 × 54，圆角 3.18 |
| 卡袋 | 89.4 × 57.6，间距 3.4 |
| 页边距 | 书脊侧 22，外侧 5.6，上 6.4，下 6.4 |
| 页 W × H | 209.8 × 192.4 |
| 环孔 | 圆心距内边 9.2，半径 3.1 |
| 环位置（沿书脊 z） | −81, −27, 27, 81 |
| 活页厚 T | 1.05 |
| 环半径 R | max(13, 8 + 0.65·S)，环线半径 1.6 |
| 书脊 | 宽 2D，其中 D = R + 2.5；打开时下沉 drop = 2.2 |
| 铰链 | 弧长 h = 5 |
| 板 | 厚 CT = 1.6，高 HB = H + 14，平面圆角 2.6 |
| 环座 | 宽 max(11, 0.85R) × 高 3.2 × 长 H − 18；两端各一颗铆钉（半球，半径 2.4，压扁到 0.45），距端部 7 |

布局与编号：

- S = max(1, ceil(n / 12))，n 为卡片数。
- 每面 2 列 × 3 行，`slot = row·2 + col`。
- 面编号 f：活页 i 的正面 f = 2i，背面 f = 2i + 1。卡号 = f·6 + slot，卡号小于 n 时该位置才有卡。
- 下面的坐标都按「看到的样子」给出，原点在该面左上角。背面被看到时外边在左，所以外侧边距也在左。
  - 卡袋左上角：x = (正面 ? 22 : 5.6) + col·92.8，y = 6.4 + row·61。
  - 环孔中心：正面 x = 9.2，背面 x = W − 9.2；y = H/2 + 环位置。
- 卡在袋内先居中，再加确定性抖动。设 n 为卡号，U(x) = fract(sin(x·127.1 + 311.7)·43758.5453)：
  - dx = (U(n) − 0.5)·1.4；
  - dy = (U(n + 7.13) − 0.6)·1.6；
  - 旋转 (U(n + 3.7) − 0.5)·0.006 rad。
- 板宽 B 在初始化时计算：取开、合两态下右堆所有静止活页的 `restEdgeX` 最大值，减去 xb = D + h，再加 7。
  - R = 13 时：打开状态下外边 x 在 209.5–211.9 之间；合上状态下活页随环右移，外边 x 在 238.7–242.8 之间。
  - 因此 B ≈ 229.3，xb + B ≈ 249.8。

## 8. 坐标与活页夹结构

**坐标约定**

- y 轴向上，卡册平放。书脊沿 z 轴，截面在 xy 平面内，x 向右。
- z 正向朝观察者（屏幕下方），页面上边在 z = −H/2。

**圆弧位移函数**

arc(φ, Δ, L) 表示从方向 φ 出发、转过 Δ（逆时针为正）、走过弧长 L 后的位移：

- 一般情况：(L/Δ)·(sin(φ+Δ) − sin φ, cos φ − cos(φ+Δ))；
- |Δ| < 1e-5 时：L·(cos φ, sin φ)。

**封面进度与姿态**

封面进度 c ∈ [0, 1]，0 为合上，1 为打开。打开时先抬起封面，再放倒书脊：

- 两个铰链角：
  - α1 = (π/2)·(1 − clamp(2c − 1, 0, 1))：封底—书脊铰链；
  - α2 = (π/2)·(1 − clamp(2c, 0, 1))：书脊—封面铰链。
- 封底固定：中线在 y = −CT/2（上表面 y = 0），x ∈ [xb, xb + B]，其中 xb = D + h。
- 关键点：
  - p0 = (xb, −CT/2)；
  - p1 = p0 + arc(π, −α1, h)；
  - 书脊方向 φs = π − α1，p2 = p1 + 2D·(cos φs, sin φs)；
  - p3 = p2 + arc(φs, −α2, h)；封面从 p3 沿 φf = φs − α2 方向延伸 B。
- 书脊下沉：书脊组（书脊板、环座、环）沿内法线 n̂ = (sin φs, −cos φs) 的反方向下沉 sink = drop·(1 − α1/(π/2))²。
- 环心：C = p1 + D·(cos φs, sin φs) + n̂·(CT/2 + D − sink)。
- 铰链：用厚 CT 的 BoxGeometry，放在弧的两个端点之间（弦近似）；靠书脊的一端用下沉后的端点。
- 校验值（R = 13）：打开时 C = (0, 13.3)；合上时 C ≈ (33.6, 17.9)，封面中线 y ≈ 36.6，盖在环的上方。

**取景中心**

- 原站开合时不改变缩放，只平移镜头：合上的书留在画面中央，约占半宽。
- closedCenter = (p1.x − CT + xb + B)/2，这里 p1 取 c = 0 时的值。R = 13 时约为 132.8。
- 取景中心 x = closedCenter·(1 − smoothstep(c))，其中 smoothstep(t) = t²(3 − 2t)。

**封面标题**

- 放在封面外侧面上的一块透明平面，宽 min(B − 44, 150)，高 30；距书脊侧边 24，距下边 22。合上时它位于左下角。
- Canvas 按 8 px/mm 绘制，下面的坐标以 mm 计、原点在平面左上角：
  - 字体 600、7.2 mm，基线 y = 25；
  - 标题上方一条 9 × 0.7 的短横线，位于 y = 15；
  - 先用 rgba(20,30,40,0.35) 向右下偏移 0.2 画一遍作压印阴影，再用白色画一遍。
- 平面不透明度 0.7，不写深度。

## 9. 活页模型

**叶与状态**

- 叶 j = 0 是封面，j = 1..S 是活页 j − 1。
- 整数状态 k ∈ [0, S + 1]：j < k 的叶在左侧。k = 0 表示合上；打开时计数显示 `k / (S + 1)`。
- 跨页 k（k ≥ 1）：
  - 左边显示面 2k − 3；k = 1 时左边是封面内侧（无贴图的磨砂板）。
  - 右边显示面 2k − 2；k = S + 1 时右边是空的封底。
- 每叶的状态量：θ（0 = 右，π = 左）、ω、弯曲 b、β（= db/dt）。封面只有 θ，且 c = θ/π。

**截面曲线 P(s)**

s ∈ [0, W]，从内边量起。

- 孔在环上的角度为 ψ，孔心 Hh = C + R·(cos ψ, sin ψ)。
- P(0) = Hh − 9.2·(cos ψ, sin ψ)，起始方向为 ψ（径向）。
- 之后依次走下列等曲率段，段内转角按长度线性分配：

| 段 | s 区间 | 转角 |
|---|---|---|
| 孔条（刚性） | 0 – 13.5 | 0 |
| 缝线铰链 | 13.5 – 20.4 | θ − ψ |
| 内列 | 20.4 – 109.9 | 0.2·b |
| 列间铰链 | 109.9 – 116.3 | 0.6·b |
| 外列 | 116.3 – 209.8 | 0.2·b |

**静止孔角**

- `restHoleAngle(C.y, R, y)` 在 [−π/2 + 0.02, π/2 − 0.02] 上二分 28 次，求使 θ = 0 时 P(20.4).y = y 的 ψ。该高度随 ψ 单调递增；超出范围时取端点。
- 活页 i 在右堆的高度 yR = (S − i − 0.5)·T，在左堆的高度 yL = (i + 0.5)·T。
- ψR = restHoleAngle(C.y, R, yR)；ψL = π − restHoleAngle(C.y, R, yL)。
- 例：R = 13 且打开时，ψR 约在 −0.66 到 −0.43 之间。
- C 会随封面移动，所以每帧重算（开销可以忽略）。
- 翻动中 ψ = ψR + (θ/π)·(ψL − ψR)。
- 静止时 b = 0，整页平铺在对应的堆上。θ ∈ [0, π] 且外缘角 θ + b ∈ [0, π]，所以页面不会向下穿过堆面。

**网格**

- 正面网格（FrontSide，正面贴图）和背面网格（BackSide，背面贴图设 `repeat.x = −1, offset.x = 1`）共享一个 `PlaneGeometry(1, 1, 39, 1)`。
- 40 列顶点对应非均匀站点：0、13.5，然后缝线铰链 8 等分、内列 12 等分、列间 6 等分、外列 12 等分。
- uv.x = s/W。每次 update 写入顶点：第一行 (P(s).x, P(s).y, −H/2)，第二行 z = +H/2；然后调用 `computeVertexNormals()` 和 `computeBoundingSphere()`（点击检测要用）。这样平铺在右侧时正面朝上。
- 环孔：贴图透明像素 + `alphaTest: 0.5`。three 的阴影深度材质会沿用 map 和 alphaTest，所以孔在阴影里也是透的。
- 只有正面网格投影（`shadowSide = DoubleSide`），两面都接收阴影。

**弹簧**

半隐式欧拉，每帧 dt ≤ 1/30 s，按不超过 1/120 s 分子步。

- θ：目标为 0 或 π；ω0 = 9 rad/s，ζ = 0.9，一次翻页约 0.6 s。越界时夹到 [0, π]，并把 ω 置 0。
- b：目标为 −0.06·ω，使外缘滞后；ω0 = 14，ζ = 0.55，结尾有轻微回弹。b 夹在 [−θ, π − θ] 内。
- 静止判定：|θ − 目标| < 1e-3、|ω| < 1e-2、|b| < 1e-3、|β| < 1e-2 时，吸附到目标。
- 多叶移动（例如从 k = 4 合上）：从离当前跨页最近的叶开始，每叶比前一叶延迟 60 ms 出发。
- `prefers-reduced-motion: reduce` 时，叶和镜头都直接吸附到目标，不播放动画。

## 10. 交互

**拖拽**

- pointerdown 时，求指针射线与平面 y = 0 的交点 x：
  - 合上时（k = 0）不论位置都抓封面；
  - 否则，x ≥ C.x 抓右堆顶叶（j = k，要求 k ≤ S），x < C.x 抓左堆顶叶（j = k − 1）；
  - 没有可抓的叶时，只当作点击处理。
- 指针移动超过 5 px（鼠标）或 9 px（触摸）才进入拖拽，否则当作点击。
- 拖拽中：
  - θe = acos(clamp(cos θe0 + Δx/W, −1, 1))，其中 θe0 是起拖时的 θ + b；封面同样使用 W。
  - Δx（mm）= 指针的屏幕横向位移（px）÷ 起拖时测得的每毫米像素数。后者取 (0,0,0) 到 (W,0,0) 投影到屏幕上的长度 ÷ W。
  - θ 以弹簧追随 θe。活页的 b = θe − θ（夹在允许范围内）；封面没有 b。
- 松手：
  - 进度 p：从右起拖时 p = θe/π，从左起拖时 p = 1 − θe/π；
  - v：朝翻页方向的指针速度，单位 W/s，取最近 100 ms，用起拖时的同一比例换算；
  - v > 0.9，或者 p > 0.22 且 v ≥ −0.05 时翻过去（k ± 1），否则回弹。

**点击**

- 合上时，任何点击都打开封面。
- 打开时：
  - 射线命中活页网格 → 由 uv 得到面编号和面内坐标：x = uv.x·W，背面取 (1 − uv.x)·W；y = (1 − uv.y)·H → 落在有卡的卡袋内 → 调用 `onCardClick`；
  - 没有命中卡时，按平面交点判断：x < C.x 为 prev，否则为 next。

**命令与键盘**

- next：k = min(k + 1, S + 1)。
- prev：k = max(k − 1, 0)。k = 1 时 prev 会合上封面。
- toggleCover：k > 0 时变为 0，k = 0 时变为 1。
- 键盘：← 和 PageUp 为 prev，→ 和 PageDown 为 next；Esc 先关详情，详情已关时再关查看器。

**窗口缩放**

ResizeObserver 触发 resize，然后重绘。

## 11. 渲染与镜头

**渲染器与场景**

- WebGLRenderer：开启 antialias，pixelRatio ≤ 2，输出 sRGB，`NeutralToneMapping`，exposure 1.22，`VSMShadowMap`。
- `scene.background` 设为 #f7f9fb（与覆盖层同色、不透明），这样磨砂透射能采样到正确的底色。
- 环境：仿原站的小摄影棚，`pmrem.fromScene(棚, 0.02)` 作为 `scene.environment`，`environmentIntensity` 0.6。烘焙后释放棚的几何与材质。
  - 穹顶：`SphereGeometry(10, 48, 24)`，BackSide，顶点色。设 t 为顶点高度 / 10：t > 0 时 v = 0.16 + 0.1t，否则 v = 0.16(1 + t) + 0.03；颜色 (v, 1.01v, 1.04v)。
  - 三块柔光板（`MeshBasicMaterial`，DoubleSide，颜色 (v, v, 0.98v)），都放在距原点 8 处并朝向原点：
    - 5.2 × 3.6，方向 (−0.5, 0.45, 0.74)，v = 7；
    - 1.2 × 6，方向 (0.85, −0.15, 0.5)，v = 2.2；
    - 7 × 1.2，方向 (0.1, −0.9, 0.42)，v = 0.9。
  - 以上按原站的 z 轴向上给出：整个棚放进一个组，lookAt 之后再把组绕 x 轴转 −π/2。
- 灯光（参数取自原站）：
  - 主光 DirectionalLight(#ffffff, 1.35)，位于左侧上方、略偏远端，坐标 (−290, 420, −75)，目标在原点，投影。
  - 主光阴影：mapSize 2048，radius 14，blurSamples 16，intensity 0.7，bias −8e-4，normalBias 1.5。
  - 主光阴影相机：x ∈ ±(halfWidth + 50)，z ∈ ±220，near 100，far 1000；up 设为 (0, 0, −1)，让左右范围对应书宽。
  - 小屏（min(screen.width, screen.height) < 600）时，阴影改为 mapSize 1024、radius 8、blurSamples 10。
  - 补光 HemisphereLight(#ffffff, #d9dee2, 0.18)。
- 地面：1600 × 1000 的平面，`ShadowMaterial`，opacity 0.16，位于 y = −(CT + drop + 0.02) ≈ −3.82，也就是打开时下沉书脊的底面（−3.8）之下。
  - 和原站一样，阴影在打开的书的范围外 16 mm 内淡出：设 d 为地面点 (x, z) 超出 |x| ≤ halfWidth、|z| ≤ H/2 矩形的距离，alpha 再乘以 1 − smoothstep(0, 16, d)。
- 接触阴影（binder.js）：板不靠投影产生落地阴影，所以左、右半本下方各放一块平面。
  - 材质：黑色 `MeshBasicMaterial`，transparent，depthWrite 关闭，opacity 0.32，renderOrder −1。
  - alphaMap 是一张 256² 的 Canvas：先铺黑底；再画白色圆角矩形 (22, 18, 212, 220, r14)，blur 12px、alpha 0.45；最后画圆角矩形 (19, 16, 218, 224, r6)，blur 2.5px、alpha 1。
  - 尺寸为 (xb + B)·1.16 × H·1.14；中心 x = ±(xb + B)/2 + 4，z = +5，y = −(CT + drop + 0.01)。
  - 右块常显。左块的不透明度为 0.32 × smoothstep(0, 1, 1 − (π − c·π)/0.26)，只在封面接近完全打开时淡入。

**材质**

- PVC 活页：`MeshPhysicalMaterial`，roughness 0.48，clearcoat 1，clearcoatRoughness 0.14，ior 1.54，specularIntensity 0.6。
- 磨砂板（封底、书脊、封面、铰链）：
  - `MeshPhysicalMaterial`，颜色 #e9eef2；
  - transmission 1，roughness 0.6，thickness 1.6，ior 1.5；
  - clearcoat 0.6，clearcoatRoughness 0.4，specularIntensity 0.45；
  - castShadow 关闭，receiveShadow 开启。注意 VSM 下接收阴影的物体也会写入阴影贴图，这是 three 的行为，原站相同。
- 钢（环、环座、铆钉）：#b8bec5，metalness 1，roughness 0.3，clearcoat 0.3。

**贴图**

每面一张 839 × 770 的 Canvas（W、H 各乘 4 px/mm 后取整），sRGB，使用最大各向异性。下面的尺寸以 mm 计，颜色取自原站。内容依次为：

- PVC 膜底 #eef1f3；
- 焊缝区：把 6 个卡袋的外包矩形四边各扩 1.6，填 #f5f6f8，描 0.22 宽的 rgba(24,31,40,0.16) 边；
- 每个卡袋：
  - 先用膜底色填满卡袋矩形，再画卡；
  - 卡：图片按 cover 方式裁切到圆角 3.18，或画占位卡；卡下有阴影（模糊 1.2、下移 0.25，rgba(0,0,0,0.28)）；
  - 袋口：y + 2.38 处一条 0.5 高的阴影色细条（alpha 0.5），y + 2.08 处一条 0.3 高的白边 rgba(255,255,255,0.9)；
  - 描 0.22 宽的阴影色边框；
- 4 个孔：先在半径 holeR + 0.35 处描 0.5 宽的白边，再用 `destination-out` 挖空半径 holeR 的圆；
- 最后沿整面描一圈 0.6 宽的白边。

**镜头**

- PerspectiveCamera，fov 24，near 50，far 4000。
- 画布铺满覆盖层。可用高度比 band = max(0.3, (画布高 − top − bottom)/画布高)。
- 取景宽 w = 2·halfWidth + 24，取景深 h = H + 30，两者都是常量。
- 距离 s = max((w/2)/(tan12°·aspect), (h/2)/(tan12°·band))·zoom。
  - zoom = 1 + 0.15·sin(π·c)。封面竖起时角会抬得很高，所以稍微拉远；这是对原站「最多拉远 1.15 倍」修正的简化。
- 视线偏离竖直方向 9°：相机位于 (x, 4 + s·cos9°, s·sin9°)，看向 (x, 4, 0)。
- `setViewOffset(画布宽, 画布高, 0, (bottom − top)/2, 画布宽, 画布高)`，让书居中在顶栏和底栏之间。翻页时竖起的页角可以伸到栏下，不会被裁掉。
- 镜头不做额外平滑：c 本身由弹簧驱动，已经是连续的；reduced motion 下随 c 直接切换。

**按需渲染**

只有在有叶在动或正在拖拽时才运行 rAF；全部静止后停止。

## 12. 查看器 UI

- **覆盖层**：`role="dialog"`、`aria-modal="true"`、`aria-label` 为相册标题，背景 #f7f9fb。
- **顶栏**：
  - 左上角显示标题。
  - 右上角书本图标按钮：打开时显示合着的书，aria-label 为「合上卡册」；合上时换成翻开的书，aria-label 为「打开卡册」，同时设置 `aria-pressed="true"` 并显示浅色圆底。
  - × 按钮，aria-label 为「关闭」。
- **底栏（打开时）**：
  - 圆形描边按钮 ‹（「上一页」）；
  - 计数 `k / N`（`aria-live="polite"`）；
  - 圆形描边按钮 ›（「下一页」），k = S + 1 时禁用；
  - 下方提示：「拖动页面或点击两侧翻页；点击卡片查看详情」。
- **底栏（合上时）**：深青色（#1d5f80）胶囊主按钮「打开卡册」，带翻开的书图标；下方提示：「点击封面或向左拖动打开」。
- **详情栏**：
  - 从右侧滑入，宽 360 px，窄屏时全宽；
  - 显示大图（或放大的占位卡）、标题、「第 i 张，共 n 张」，以及 × 关闭按钮（「关闭详情」）；
  - 覆盖在场景上，不移动场景。
- **竖屏提示**：满足 `@media (max-width: 600px) and (orientation: portrait)` 时，显示「请横过手机查看卡册」。
- **关闭查看器**：移除覆盖层，并调用 `dispose()`。

## 13. 错误与降级

- WebGL 不可用（创建 renderer 失败），或发生 `webglcontextlost`：在覆盖层中显示「当前浏览器无法显示 3D 卡册（WebGL 不可用）」，保留关闭按钮。
- cards.json 加载失败：入口页显示「相册数据加载失败」。
- 图片缺失或加载失败：画占位卡。图片到达后，重绘对应面的贴图并请求一帧。
- 详情栏的大图加载失败时移除该图片，露出下面的占位（底色 + 标题）。
- dispose：
  - 取消 rAF，移除事件监听和 ResizeObserver；
  - 释放几何、材质、贴图、PMREM 和 renderer。

## 14. 验证与成功标准

检查脚本放在仓库外（`/tmp/album-checks/`），用完即删，不提交。

- **构建**：`npm run build` 通过（three 使 viewer chunk 超过 500 kB，只出现体积警告）。
- **几何断言**（node）：layout、sheet、binder 的纯计算与 §7–§9 的校验值一致，包括 S、卡袋位置、`cardAt`、孔角范围、活页外边、环心与板宽 B。
- **浏览器检查**（无头 Chrome，经 DevTools 协议，视口 1280×720）：
  - 键盘与按钮：打开、←/→/PageUp/PageDown、‹ ›、连按到底与合上、开合按钮、翻页途中关闭再打开、Esc；
  - 指针：慢拖超过 22% 翻页、不足回弹、快甩翻页、反向甩回取消、拖左页回翻、点卡看详情（左右两页）、点两侧翻页、拖动和点击封面打开；
  - 边界：卡片数 0/1/7/12/13、图片成功与失败（贴图和详情栏）、cards.json 损坏、无 WebGL、reduced motion、手机竖屏提示与横屏取景。
  - console 和页面异常必须为空（无 WebGL 时 three 自己打印的错误除外）。
- **截图对比**：本地 1/6、3/6、合上三张截图与原站同一状态的 REA 截图并排对比，以下各项应一致：三板结构、四环与环座、2×3 卡布局、磨砂封面、阴影、底栏与提示；书在画面中的位置和比例应接近。
- **手动清单**（脚本覆盖不到的部分）：
  - 真机触摸拖拽与点击；
  - Safari 下接触阴影的模糊（依赖 `ctx.filter`）；
  - 从第 4 个跨页合上时的错峰动画观感；
  - 桌面拖动窗口大小时的重新取景。
- **规模**：JS 约 1100 行、CSS 约 360 行，运行时依赖只有 three。

## 附录：REA 证据

- `ev_38b3ad9b…`：原站首屏抓取（网络、DOM、截图）。
- `ev_6fd90bbb…`：打开 3D 后按两次 → 的分步截图与按需加载的 chunk。
- `ev_bf220c37…` / `ev_d1c5c611…`：查看器脚本静态分析，涉及尺寸常量、活页夹结构、交互阈值、材质与灯光参数。
- `ev_8d2a3c47…`：合上封面状态截图（写规格时补充）。确认了以下几点：
  - 封面盖住右堆，透过磨砂能看到模糊的卡面；
  - 左下角有压印标题；
  - 底栏换成「打开卡册」按钮。
