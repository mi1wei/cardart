# 册页 Folio：界面改版与中英双语（设计文档）

- 日期：2026-10-27
- 状态：已确认（2026-10-27）
- 基础：本地相册管理（`docs/superpowers/specs/2026-10-26-photo-album-manager-design.md`），分支 `photo-album-manager`（fb0666c）。功能以那份文档为准；本文只改样子、加主页和中英切换。本文覆盖那份文档的两处：§9 里相册墙、相册页的样子，以及「界面用中文」的假设。
- 界面稿（已确认，双击就能打开）：`docs/superpowers/mockups/2026-10-27-folio-redesign/`
  - `home.html`：主页（选 B：居中 + 翻页视频）；
  - `albums.html`：相册墙和相册页（照片网格选 A：等高行）。
  - 界面稿里的照片是示意插画，实际显示用户自己的照片。
  - 界面稿和本文不一致的地方以本文为准：页脚不放版本号（稿里有 v1.0）；手机相册页保留「选择」按钮（稿里漏了）。
- 参考：cardart.cc 首页和「卡册」页（`/explore/albums`），数值是在页面上量的。

## 1. 目标

参考 cardart.cc 提升视觉，并且：

- 新增一个介绍这个软件有什么用的主页；
- 所有页面最上方加导航栏，里面有「相册 / Albums」；
- 加中英文切换按钮。

功能不变：建相册、上传、排序、选择删除、3D 翻阅、大图、手机访问，用法都和现在一样。

## 2. 共识

用户说的：

- 「ui 确实丑了点，能否参考https://cardart.cc/ 做一个视觉上的提升，我也需要有一个主页，主要介绍一下这个项目有啥用，在最上方加一个导航栏，里面有一个Albums」
- 主页给谁看：给用这个软件的人（选 A），不是对外宣传、卖授权码的网站（那是子项目 2）。
- 「添加一个中英文切换的按钮」
- 产品名：册页 / Folio（选 A）。
- 改版范围：整体换成 cardart.cc 的样式（选 A）。
- 主页上半部分：文字居中，下面放 3D 相册自己翻页的循环视频（选 B；看过录好的视频后说「可以」）。
- 照片网格：等高行，照片不裁切（选 A）。

假设（我定的，可以改）：

- 第一次打开时跟随浏览器语言：中文系统显示中文，其他显示英文。切换后记住，每台设备各记各的。
- 「最近的相册」就是相册墙排在最前的 4 本（按创建时间，新的在前）。
- 主页页脚不放版本号，等子项目 2 打包时再定版本。
- 相册库默认位置不变（`~/Pictures/相册库`），已有的相册库照常使用。
- 验证方式同上一期：构建、仓库外的一次性检查脚本、无头 Chrome、真机清单；仓库里不放测试文件。

## 3. 范围

要做：

- 视觉规范（§4），用到所有页面、弹窗、大图和 3D 的按钮与文字上。
- 导航栏（§5）。
- 主页（§6），含翻页视频。
- 相册墙改成透明袋卡片（§7）。
- 相册页改版，照片网格改成等高行（§8）。
- 中英切换，包括服务端返回给人看的文字（§10、§11）。
- README：改名「册页 Folio」，补充主页和语言切换。

不做：

- 不改 3D 书本身的样子（纸、环、翻页手感），只改它周围的按钮和文字。
- 不做深色模式、搜索（cardart 有，本期用不上）。
- 只有中文和英文；不翻译用户内容（相册名、文件名）。
- 子项目 2（授权码、打包、版本号）。

## 4. 视觉规范

- **颜色**：沿用现有变量（上一期已照 cardart 定好）：
  - 底色 `#f7f9fb`；
  - 文字三档：`oklch(23.5% 0.02 255)`、`oklch(46.5% 0.022 248)`、`oklch(52.5% 0.016 248)`；
  - 细线 `oklch(92.2% 0.007 245)`；主色 `#1d5f80`；
  - 新增浅主色 `oklch(95.2% 0.018 237)`，做功能卡片的图标底。
- **字体**：
  - 英文和数字用 Geist（npm 包 `@fontsource-variable/geist`，OFL 许可，打包进软件，不从网上加载）。许可证文本放在 `public/geist-OFL.txt`，随软件分发；README 里写明。
  - 中文用系统字体，顺序：`-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Noto Sans CJK SC', system-ui, sans-serif`。
- **字号**：

  | 用途 | 电脑 | 手机 |
  | --- | --- | --- |
  | 主页大标题 | 52px，行高 1.1，粗 600 | 34px |
  | 页面标题 | 28 / 34px，600 | 24 / 30px |
  | 区块标题 | 20 / 28px，600 | 同电脑 |
  | 正文 | 16 / 24px | 同电脑 |
  | 导航、按钮 | 14px，500 | 同电脑 |
  | 说明文字 | 13 / 20px | 同电脑 |

- **按钮**：一律胶囊形，高 36px（主页大按钮 44px）。
  - 主按钮：主色底、白字，上沿 1px 内高光；
  - 普通按钮：白底，1px 细线描边；
  - 主页「打开相册」：深色底（正文色）；
  - 危险按钮：白底红字；
  - 图标按钮：30px 圆形，悬停时浅灰底。
- **阴影**两档：
  - 浮起（菜单、上传进度、弹窗）：`0 0 0 1px` 6% 正文色、`0 8px 24px` 8%、`0 32px 64px -16px` 22%；
  - 卡片（功能卡片）：`0 0 0 1px` 5%、`0 2px 6px` 4%、`0 14px 32px -12px` 16%。
- **动效**：缓动 `cubic-bezier(0.22, 1, 0.36, 1)`。系统打开「减少动态效果」时：主页视频不播，悬停时照片不动。

## 5. 导航栏

- 所有页面最上方，滚动时吸顶。3D 和大图是全屏覆盖层，会盖住导航栏（和现在一样）。
- 高 56px，半透明底色加毛玻璃（`saturate(1.4) blur(12px)`），底部一条细线；左右留出刘海的安全区。
- 左边：logo（主色圆角方块里的书本图标，加「册页 / Folio」），点了回主页。
- 链接：「首页 / Home」→ `#/`，「相册 / Albums」→ `#/albums`。
  - 都是普通链接：点了新增一条历史记录，浏览器的返回键回到上一页；
  - 其他认不出的地址都当作主页；
  - 当前那项有浅灰胶囊底；
  - 在相册页里（含 3D、大图），「相册」算当前项。
- 右边：
  - 「手机访问」按钮：只在这台电脑上（localhost）显示，点了打开原来的手机访问弹窗；
  - 语言切换「中 / EN」：两段的胶囊，当前语言那段是白底。
- 手机上：不显示「手机访问」，其余一样。
- 相册墙原来的品牌栏（logo、「手机访问」）去掉，挪到导航栏。

## 6. 主页 `#/`

从上到下（界面稿 `home.html`）：

1. 一行小字：主色小圆点、「本地相册 · 照片不上传云端」、竖线、「3 本相册 · 206 张照片」。
   - 数量是真实的；没有相册时不显示数量；手机上不显示数量。
2. 大标题「把照片装进一本能翻的相册」，下面一段说明（文字见 §13）。
3. 按钮：
   - 「打开相册 →」：深色，去相册墙；
   - 「用手机看」：文字按钮，只在这台电脑上显示，打开手机访问弹窗；
   - 手机上只有「打开相册」，占满一行。
4. 翻页视频：
   - 用这个软件的 3D 翻阅录的：书自己翻 3 页，再一起翻回开头，首尾相接；
   - 1280×700，约 10 秒、0.55 MB，H.264；另有封面图（第一帧），约 50 KB；
   - 随软件附带：`src/assets/home-book.mp4`、`src/assets/home-book.jpg`，从界面稿目录复制（内容和 `book-hero.mp4`、`book-hero-poster.jpg` 相同）；
   - 静音、循环、内联自动播放；宽度占满内容区，最大 1080px；手机上比屏幕略宽一点；
   - 四周 24px 渐隐：个别设备上视频底色和页面底色会有一点色差，这样不会露出方框；
   - 「减少动态效果」打开时只显示封面图，不加载视频。
5. 「能做什么」：4 张功能卡片（图标、标题、一句话）。电脑 4 列；手机 1 列，图标在左。
6. 「最近的相册」：相册墙最前面的 4 本，卡片和相册墙一样（§7）；右上「全部相册 →」。没有相册时整节不显示。
7. 页脚：细线分隔，logo 和「照片只保存在这台电脑上」。

数据：只调一次 `GET /api/albums`，数量和最近的相册都从它算。

## 7. 相册墙 `#/albums`

（界面稿 `albums.html` 上半部分）

- 标题区：「相册」，下面一行「6 本相册 · 507 张照片」；右边「新建相册」主按钮。手机上是 36px 的圆形「+」按钮。
- 卡片网格：每列最小 220px，自动排满；行距 40px、列距 24px。手机两列，行距 26px、列距 14px。
- 透明袋卡片（主页和相册墙共用）：
  - 后片：浅灰蓝渐变、圆角、带落影；
  - 3 张照片：白边 5px，4:3 的框，照片裁切填满；分别斜 -3°、2.5°、-1°，从袋口露出上半截；
  - 最前面那张是封面，后两张是相册里接下来的照片（来自 §11 的 `previews`）；
  - 前片：半透明毛玻璃，盖住照片的下半截；上沿中间有一个半圆缺口，带 1px 亮边；
  - 照片不到 3 张时，空位用浅色空白卡片补上；
  - 鼠标移上去，3 张照片往上抽出 6–12px；点卡片任何地方（「···」除外）都进入相册。
- 卡片下面一行：相册名（太长时省略）、照片张数、「···」菜单（重命名、删除相册）。
  - 电脑上「···」在鼠标移上去时才出现，手机上一直显示。
- 没有相册时：中间一个空袋子，下面「还没有相册」和「新建相册」按钮。

## 8. 相册页 `#/a/<id>`

（界面稿 `albums.html` 下半部分）

- 标题区：
  - 「相册 /」，是指向 `#/albums` 的普通链接（代替原来的「‹ 全部相册」）；相册不存在时的「回到全部相册」也指向 `#/albums`；
  - 相册名，点一下改名（现在就有）；鼠标移上去出现铅笔图标；
  - 下面一行「30 张照片」。
- 按钮放在标题下面一行：「3D 翻阅」（主按钮）、「上传照片」、「选择」。
  - 选择模式时换成：「取消」「已选 n 张」「删除」；
  - 手机上这一行只有「选择」（选择模式时是「取消」「已选 n 张」「删除」）；「上传」「3D 翻阅」仍是底部两个浮动按钮，和现在一样。
- 照片网格：等高行。
  - 同一行的照片一样高，按自己的长宽比完整显示，不裁切（宽高取自 `album.json` 的 `w`、`h`）；
  - 用 CSS 实现，不用脚本计算：每张照片的宽度按长宽比分配多出来的空间，所以同一行一定一样高；
  - 目标行高电脑约 190px、手机约 104px；每行左右撑满，最后一行不拉伸；
  - 每张照片最多长到行高的 2 倍：一张很宽的照片（宽高比大于约 3:1）放不进当前行时，这一行会差一点撑满，而不是把前面的照片拉得很大；
  - 间距 6px（手机 3px），圆角 8px（手机 4px）；仍用 600 的缓存图；
  - 鼠标移上去，照片放大到 1.03 倍。
- 保留：
  - 封面照片上的「封面」标记；
  - 选择：右上角圆圈，选中后打勾；选中的照片缩小一圈，加 3px 主色框；
  - 电脑上拖动排序。等高行里照片换位会让行重新排、宽度变化，鼠标下面的照片可能立刻变成另一张，造成来回跳。所以每次换位后，要等鼠标再移动 24px 以上，才判断下一次换位。
- 空相册的拖放区、上传进度框、拖入照片时的高亮：位置和用法不变，只换样式（§4）。

## 9. 大图、3D、弹窗、提示

- 位置和用法都不变，换成新的字体和按钮样式（§4）。
- 弹窗圆角 20px、浮起阴影；菜单圆角 12px；轻提示是深色胶囊。
- 3D 和大图顶栏的按钮换成新的图标按钮样式；3D 底栏的「打开相册」用主按钮样式。

## 10. 中英切换

- 两种语言：中文、English。
- 第一次打开：浏览器语言（`navigator.languages` 的第一项）以 `zh` 开头就用中文，否则用英文。
- 点导航栏的「中 / EN」切换：
  - 当前页面重画，不刷新，等于重新打开这一页（选择模式会退出）；
  - 正在导入照片时，语言按钮变灰、不能点，导入结束后恢复，免得没传完的照片被丢掉；
  - 记在这个浏览器里（`localStorage`）；
  - 同时更新 `<html lang>`、页面标题（「册页」/「Folio」；相册页是「相册名 · 册页」）和主屏幕名称（`apple-mobile-web-app-title`）。
- 每次打开页面和切换语言时，都把当前语言写进 Cookie `lang`（一年、`SameSite=Lax`），让服务端用同一种语言。
- 界面上的文字全部放进一张中英对照表（新文件 `src/i18n.js`，内容见 §13），包括按钮的 `aria-label` 和鼠标悬停提示。
  - 英文单复数要对：1 photo / 2 photos。
  - 相册名、文件名等用户内容不翻译。新建相册的默认名是「新相册 / New album」。
  - 样式表里的「图片丢失」占位文字也分中英。
- 服务端给人看的文字也分中英（§11）：
  - 语言先看 Cookie `lang`；没有时看请求头 `Accept-Language`，以 `zh` 开头为中文；都没有用英文。
  - 手机第一次扫码时还没有 Cookie，就按手机的系统语言显示。
- 终端里的启动信息和警告，中英两句并排。

## 11. 服务端和接口改动

- `GET /api/albums` 的每一项改为 `{ id, title, count, previews, createdAt }`：
  - `previews`：最多 3 张 `{ id, w, h }`。封面在前，然后是相册里排在前面的照片（跳过封面）；
  - 去掉原来的 `cover` 字段（只有相册墙在用）。
- 分段下载（`Range`）：
  - 静态文件和图片都支持：返回 206 和 `Content-Range`；范围不对返回 416；所有文件响应都带 `Accept-Ranges: bytes`；
  - 原因：iPhone 的 Safari 播放视频必须用到它。
- 新增文件类型 `.mp4 → video/mp4`。
- 视频和封面图由 Vite 打包进 `/assets/`（文件名带哈希），所以可以长期缓存。
- 错误文字：
  - `library.js`、`app.js` 里 `fail()` 的第二个参数改成短代码（例如 `title-length`）；
  - `app.js` 发送前按请求的语言翻成中文或英文，对照表放在新文件 `server/text.js`；
  - 手机访问的几个 403 页面同样按语言显示，页面标题是「册页」/「Folio」。

## 12. 文件改动

```
package.json            新增依赖 @fontsource-variable/geist；name 改为 folio
index.html              标题、主屏幕名称改为「册页」（运行时按语言更新）
README.md               改名「册页 Folio」；补充主页、语言切换、字体许可
public/geist-OFL.txt    新增：Geist 字体的许可证文本
src/i18n.js             新增：中英对照表、t()、当前语言、切换语言
src/nav.js              新增：导航栏
src/home.js             新增：主页
src/folder.js           新增：透明袋卡片（主页、相册墙共用）
src/assets/home-book.mp4、home-book.jpg   新增：主页视频和封面图
src/main.js             改：三种页面（主页、相册墙、相册页）、导航栏、切换语言后重画
src/router.js           改：#/ 是主页，#/albums 是相册墙，认不出的地址当作主页
src/wall.js             改：标题区、透明袋卡片、空状态；去掉品牌栏
src/album.js            改：标题区、按钮行、等高行网格、拖动换位间隔
src/lightbox.js、viewer.js、phone.js、ui.js   改：文字改用对照表；按钮样式
src/style.css           改：视觉规范、导航栏、主页、透明袋、等高行、按钮
server/text.js          新增：服务端中英文字
server/app.js           改：Range、.mp4、按语言返回文字
server/library.js       改：previews；错误改用代码
server/index.js         改：启动信息中英并排
```

旧设计文档开头加一行，指向本文。

## 13. 中英对照表

`{n}` 等是变量。英文里「1 photo / {n} photos」这样写的，表示按数量选单数或复数。

**导航与通用**

| 中文 | English |
| --- | --- |
| 册页 | Folio |
| 首页 | Home |
| 相册 | Albums |
| 手机访问 | Phone access |
| 取消 | Cancel |
| 确定 | OK |
| 删除 | Delete |
| 保存 | Save |
| 关闭 | Close |
| 更多 | More |
| 加载失败：{原因} | Couldn't load: {reason} |
| 操作失败：{原因} | Something went wrong: {reason} |
| 保存失败：{原因} | Couldn't save: {reason} |
| 图片丢失 | Image missing |
| {n} 张照片 | 1 photo / {n} photos |
| {a} 本相册 · {p} 张照片 | 1 album / {a} albums · 1 photo / {p} photos |

**主页**

| 中文 | English |
| --- | --- |
| 本地相册 | Local photo albums |
| 照片不上传云端 | Nothing is uploaded |
| 把照片装进一本能翻的相册 | Your photos, bound into a real album |
| 照片存在自己的电脑上。横的竖的自动排版，像真的相册一样一页页翻；同一个 Wi‑Fi 下，手机扫码也能看。 | Folio keeps your photos on your own computer, lays them out page by page, and lets you flip through them like a real album. Phones on the same Wi‑Fi can join with a scan. |
| 打开相册 | Open albums |
| 用手机看 | View on phone |
| 能做什么 | What it does |
| 照片只在你的电脑上 | Stays on your computer |
| 不上传到任何地方。整个相册库就是一个文件夹，复制一份就是备份。 | Nothing leaves your machine. The library is just a folder — copy it and you have a backup. |
| 像真的相册一样翻 | Flip it like a real album |
| 3D 翻页，拖动或点两侧翻；一万张照片也是一本连续的书。 | Turn pages in 3D by dragging or tapping. Even 10,000 photos make one continuous book. |
| 横竖自动排版 | Automatic layout |
| 横的竖的混在一起，每页自动排一到四张，照片不裁切。 | Landscape and portrait photos share pages, one to four per page, never cropped. |
| 手机扫码就能看 | Open it on your phone |
| 同一个 Wi‑Fi 下扫码，手机也能看、能上传；iPhone 可以添加到主屏幕全屏看。 | Scan the code on the same Wi‑Fi to view and upload from your phone, or add it to your iPhone Home Screen. |
| 最近的相册 | Recent albums |
| 全部相册 → | All albums → |
| 照片只保存在这台电脑上 | Your photos stay on this computer |

**相册墙**

| 中文 | English |
| --- | --- |
| 新建相册 | New album |
| 还没有相册 | No albums yet |
| 重命名 | Rename |
| 删除相册 | Delete album |
| 新相册（新建时的默认名） | New album |
| 创建 | Create |
| 重命名相册 | Rename album |
| 删除相册「{名称}」？相册里的照片会一起删除，不能恢复。 | Delete "{name}"? Its photos will be deleted too. This can't be undone. |

**相册页**

| 中文 | English |
| --- | --- |
| 点击改名 | Click to rename |
| 3D 翻阅 | Flip in 3D |
| 上传照片 | Upload photos |
| 上传（手机浮动按钮） | Upload |
| 选择 | Select |
| 已选 {n} 张 | {n} selected |
| 封面 | Cover |
| 把照片拖到这里 | Drop photos here |
| 或 点这里选择照片 | or choose photos |
| 支持 JPG、PNG、HEIC、WebP | JPG, PNG, HEIC and WebP |
| 相册不存在。回到全部相册 | This album doesn't exist. Back to all albums |
| 正在导入 {i} / {n} | Importing {i} of {n} |
| 导入完成 | Import finished |
| 已导入 {n} 张 | Imported 1 photo / {n} photos |
| ，跳过 {n} 张（{原因}） | , skipped {n} ({reasons}) |
| 重复 {n} | {n} duplicate / {n} duplicates |
| 格式不支持 {n} | {n} unsupported |
| 太大 {n} | {n} too large |
| ，失败 {n} 张 | , {n} failed |
| 删除照片 | Delete photos |
| 删除 {n} 张照片？删除后不能恢复。 | Delete 1 photo? / Delete {n} photos? This can't be undone. |
| 照片有变化，已刷新 | The photos changed elsewhere and were reloaded |

**大图**

| 中文 | English |
| --- | --- |
| 设为封面 | Set as cover |
| 已设为封面 | Cover updated |
| 查看原图 | View original |
| 上一张 | Previous |
| 下一张 | Next |
| 删除照片（确认框标题） | Delete photo |
| 删除这张照片？删除后不能恢复。 | Delete this photo? This can't be undone. |

**3D 翻阅**

| 中文 | English |
| --- | --- |
| 拖动页面或点击两侧翻页；点击照片看大图 | Drag a page or click either side to turn it; click a photo to enlarge it |
| 点击封面或向左拖动打开 | Click the cover or drag it left to open |
| 每页 | Per page |
| 每页 1 张 | 1 per page |
| 宽松 | Relaxed |
| 紧凑 | Compact |
| 全屏 | Full screen |
| 退出全屏 | Exit full screen |
| 合上相册 | Close book |
| 打开相册（3D 里的按钮） | Open book |
| 上一页 | Previous page |
| 下一页 | Next page |
| 跳到第几个跨页 | Jump to spread |
| 当前浏览器无法显示 3D 相册（WebGL 不可用） | This browser can't show the 3D album (WebGL is unavailable) |
| 请横过手机查看相册 | Turn your phone sideways to view the album |
| 当前浏览器不能全屏 | This browser can't go full screen |
| iPhone 的浏览器不能全屏：点分享 →「添加到主屏幕」，以后从主屏幕上的「册页」图标打开就是全屏。 | iPhone browsers can't go full screen: tap Share → "Add to Home Screen", then open Folio from its Home Screen icon. |
| 微信里不能全屏：点右上角「···」→「在 Safari 中打开」，再点分享 →「添加到主屏幕」。 | WeChat can't go full screen: tap "···" at the top right → "Open in Safari", then Share → "Add to Home Screen". |

**手机访问弹窗**

| 中文 | English |
| --- | --- |
| 用手机看相册 | View on your phone |
| 手机和这台电脑连同一个 Wi‑Fi，用手机相机扫下面的码。 | Connect your phone to the same Wi‑Fi as this computer, then scan the code with its camera. |
| 复制 | Copy |
| 已复制 | Copied |
| 复制失败，请手动复制 | Couldn't copy. Please copy it by hand. |
| 想在 iPhone 上全屏看：在 Safari 里点分享 →「添加到主屏幕」，以后点主屏幕上的「册页」图标打开。 | For full screen on iPhone: in Safari, tap Share → "Add to Home Screen", then open Folio from its icon. |
| 允许手机访问 | Allow phone access |
| 关掉后，手机马上打不开 | Phones lose access as soon as this is off |
| 打开下面的开关后显示链接 | Turn on the switch below to show the link |
| 这台电脑没有连接局域网 | This computer isn't on a local network |

**服务端（按请求的语言）**

| 中文 | English |
| --- | --- |
| 地址不对 | Wrong address |
| 手机访问已关闭，请在电脑上打开「手机访问」 | Phone access is off. Turn on "Phone access" on the computer. |
| 链接已失效，请在电脑上重新扫码 | This link has expired. Scan the new code on the computer. |
| 请在电脑上打开「手机访问」，用手机扫码进入 | Turn on "Phone access" on the computer, then scan the code with your phone. |
| 没有这个页面 | Page not found |
| 服务器出错了 | Server error |
| 相册名要 1–50 个字 | Album names must be 1–50 characters |
| 相册不存在 | Album not found |
| 封面照片不存在 | Cover photo not found |
| 每页张数只能是 1、2、3 | Photos per page must be 1, 2 or 3 |
| 照片有变化，请刷新后再排 | The photos changed. Refresh and try again. |
| 没有选中照片 | No photos selected |
| 没有这张图 | Photo not found |
| 图片丢失 | Image missing |
| 只能在电脑上设置 | Only available on the computer |
| 不允许跨站请求 | Cross-site requests aren't allowed |
| 请求格式不对、参数不对 | Bad request |
| 请求太大 | Request too large |
| 缺少上传标记 | Missing upload header |
| 没有这个接口 | Not found |
| 不支持 | Not supported |

**终端（中英两句并排）**

| 中文 | English |
| --- | --- |
| 册页已启动：{地址}；相册库：{目录} | Folio is running: {url}; library: {dir} |
| 端口 {n} 被占用，可以用 PORT=xxxx npm start 换一个 | Port {n} is in use. Try PORT=xxxx npm start. |
| 相册库目录不可写：{目录}（{原因}） | The library folder isn't writable: {dir} ({reason}) |
| library.json 读不了，已重建：{原因} | library.json was unreadable and has been rebuilt: {reason} |
| 跳过相册 {id}：{原因} | Skipped album {id}: {reason} |

## 14. 验证

- `npm run build` 通过。
- 一次性检查（仓库外 `/tmp/album-checks/`）：
  - 现有 10 个检查改成新路由和新结构后全部通过（相册墙在 `#/albums`；检查里固定用中文）；
  - 新增 `check-home`：
    - 数量和「最近的相册」正确；没有相册时不显示数量和「最近的相册」；
    - 视频在播放、会循环；「减少动态效果」时只有封面图、不加载视频；
    - 手机布局；
  - 新增 `check-i18n`：
    - 切到英文后，除用户内容外，页面上没有中文：主页、相册墙、相册页、选择模式、大图、3D、手机访问弹窗、各个确认框；
    - 刷新后仍是英文；切回中文正常；
    - 导入进行中语言按钮不能点，导入结束后恢复；
    - 服务端错误文字和手机访问的 403 页面，按 Cookie 和 `Accept-Language` 返回对应语言；
  - `check-server` 增加：`previews` 的内容和顺序；Range 返回 206 和 416；`.mp4` 的类型；
  - 截图：每个页面中英各一张，电脑和手机都有，和界面稿对照；
  - 一万张照片的相册页：记录等高行网格出现第一屏的时间，和现在的方格比较。
- 真机清单（用户）：
  - iPhone Safari：主页视频能播放；从主屏幕图标打开时，导航栏不被状态栏挡住；
  - 中英切换；
  - 相册墙卡片的样子；电脑上在等高行里拖动排序。

## 15. 待验证

- 等高行里拖动排序的手感：24px 的间隔够不够，要在电脑上实际拖一拖。
- iPhone 上视频的自动播放（静音加内联播放）和分段下载。
- 一万张照片时，等高行网格的排版速度。
