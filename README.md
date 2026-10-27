# 册页 Folio

本地相册管理工具：照片存在自己的电脑上，在浏览器里管理，用 3D 翻阅的方式看；同一 Wi‑Fi 下手机扫码也能看、能上传。界面有中文和英文。

## 运行

需要 macOS 和 Node 20.9 以上。

```bash
npm install
npm start
```

然后打开 http://localhost:5180 ，先看到主页；点导航栏的「相册」进入相册墙。

- 相册库默认在 `~/Pictures/相册库`，用 `ALBUM_LIBRARY=/你的/路径 npm start` 换位置。
- 端口默认 5180，用 `PORT=5181 npm start` 换端口。
- 开发：`npm run dev`；要让手机访问开发服务器，用 `npm run dev -- --host`。

## 语言

第一次打开时跟随浏览器语言：中文系统显示中文，其他显示英文。点导航栏右边的「中 / EN」切换，每台设备各自记住。正在导入照片时不能切换。

## 手机访问

在导航栏点「手机访问」，打开「允许手机访问」，用手机相机扫二维码。手机和电脑要连同一个 Wi‑Fi。每次重新打开开关都会换一个新链接，旧链接失效。

想在 iPhone 上全屏看：用 Safari 打开链接，点分享 →「添加到主屏幕」，以后点主屏幕上的「册页」图标打开，没有地址栏。用微信扫码时，先点右上角「···」→「在 Safari 中打开」。重新打开开关后，主屏幕上的图标也要删掉重新添加。

第一次启动时，macOS 可能会问是否允许 node 接受传入的网络连接。要选「允许」，否则手机打不开。局域网里走的是 HTTP，只在家里或可信的 Wi‑Fi 下使用。

## 删除

在网页里删除的相册和照片会直接从相册库删除，不能恢复。要备份，复制整个相册库文件夹即可。

## 字体

英文和数字用 Geist 字体（SIL Open Font License 1.1），打包在软件里，不从网上加载。许可证见 `public/geist-OFL.txt`。

## 图标

网页 Logo 与各平台图标共用 `src/assets/folio-mark.svg`：纯色照片页和弧形卷角，不使用阴影或渐变。修改后运行 `npm run icons` 重新生成资源，用 `npm test` 检查格式、尺寸及资源是否同步。

| 用途 | 资源 |
| --- | --- |
| 浏览器标签页 | `public/favicon.svg`、`public/favicon.ico` |
| iPhone 主屏幕 | `public/apple-touch-icon.png`（180px，不透明背景） |
| 通用应用图标 | `public/icons/folio-1024.png` |
| macOS Dock | `public/icons/folio.icns`（含 Retina 尺寸与透明外边距） |
| Windows | `public/favicon.ico`（16–256px 多尺寸，同浏览器后备图标） |

当前项目是网页应用，没有原生桌面应用打包配置；`.icns` 和 `.ico` 可在后续桌面打包时使用，不会自动替换 Node 进程的系统图标。已添加到 iPhone 主屏幕的旧图标，需要删除后重新添加才能更新。
