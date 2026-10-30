# 册页 Folio

本地相册管理工具：照片存在自己的电脑上，在浏览器里管理，用 3D 翻阅的方式看；同一 Wi‑Fi 下手机扫码也能看、能上传。界面有中文和英文。

## 运行

源码运行需要 macOS 和 Node 24 以上；`.nvmrc` 指定开发/CI 使用的 Node 24 LTS。

```bash
npm install
npm start
```

然后打开 http://localhost:5180 ，先看到主页；点导航栏的「相册」进入相册墙。

- 相册库默认在 `~/Pictures/相册库`，用 `ALBUM_LIBRARY=/你的/路径 npm start` 换位置。
- 端口默认 5180，用 `PORT=5181 npm start` 换端口。
- 开发：`npm run dev`；要让手机访问开发服务器，用 `npm run dev -- --host`。

## 语言

第一次打开时跟随浏览器语言：中文系统显示中文，其他显示英文。点导航栏右边的「中 / EN」切换，每台设备各自记住。正在准备或导入照片/视频时不能切换语言或相册库，以免丢失导入队列。

## 视频

同一本相册可以混排照片与 MP4、MOV、M4V 视频，一起排序、设封面、添加备注和删除。每个视频最多 **1 GB（1,000,000,000 字节）**，不额外限制时长。

Folio 原样保存视频，不转码、不换封装，也不打包新的 ffmpeg 或编解码器。导入设备的浏览器需要能解码视频并生成 JPEG 封面；其他设备的播放能力取决于其浏览器、系统和可用解码路径，容器后缀不保证某种编码可播放。

不能播放时仍保留封面、详情、备注和原文件入口；读取失败与设备不支持会分别提示。3D 相册只显示视频封面、播放标记和时长，点击后进入原生播放器，不在书页内播放。许可证到期不会删除视频，仍可查看与备份。

## 手机访问

在导航栏点「手机访问」，打开「允许手机访问」，用手机相机扫二维码。手机和电脑要连同一个 Wi‑Fi。每次重新打开开关都会换一个新链接，旧链接失效。

想在 iPhone 上全屏看：用 Safari 打开链接，点分享 →「添加到主屏幕」，以后点主屏幕上的「册页」图标打开，没有地址栏。用微信扫码时，先点右上角「···」→「在 Safari 中打开」。重新打开开关后，主屏幕上的图标也要删掉重新添加。

第一次启动时，macOS 可能会问是否允许 node 接受传入的网络连接。要选「允许」，否则手机打不开。局域网里走的是 HTTP，只在家里或可信的 Wi‑Fi 下使用。

## 删除

在网页里删除的相册、照片和视频会直接从相册库删除，不能恢复。备份时先从托盘退出 Folio，等待导入和保存完成，再复制整个相册库文件夹，保留原文件、视频封面、详情和备注。

## 字体

英文和数字用 Geist 字体（SIL Open Font License 1.1），打包在软件里，不从网上加载。许可证见 `public/geist-OFL.txt`。

## 桌面内测开发与分发

已加入 Electron 桌面壳、离线 JSON 授权、托盘和更新协调；当前内测仅支持 Windows 11 x64 与 macOS 13+ Apple Silicon（arm64），Intel Mac 暂不支持。原生打包与技术验证以对应源码的 CI 结果为准；真机与完整发行验收尚未完成，未发布公开更新通道。桌面使用维护者提供的授权公钥；私钥必须保存在仓库外，签发见 `docs/license-issuer.md`。CLI/Vite 保留明确开发模式，不代表桌面应用已获授权。

`npm run notices` 生成当前原生目标的第三方清单与声明 ZIP。生成成功不代表已获分发许可；对应源码、LGPL 替换、编解码器及素材权利等仍需审阅。分发门槛和当前限制见 [桌面发行说明](docs/desktop-release.md)。

## 图标

应用图标来自插画源图 `src/assets/folio-app-icon.png`（1024px，圆角方块外透明）：小朋友翻开相册，左页是夕阳海面，右页是远山与河流。页面里的品牌 Logo（顶栏、页脚、照片查看页）也使用这张插画；macOS 菜单栏模板和按钮里的小图标仍使用单色矢量 `src/assets/folio-mark.svg`，因为菜单栏图标必须是单色剪影，按钮图标太小、放不下插画细节。修改任一源文件后运行 `npm run icons` 重新生成资源，用 `npm test` 检查格式、尺寸及资源是否同步。插画缩放在 `scripts/icon-raster.js` 中用纯 JavaScript 完成，保证 macOS 与 Windows 生成的文件逐字节一致；同步检查逐字节比较，不要改成 sharp 缩放。

| 用途 | 资源 |
| --- | --- |
| 浏览器标签页 | `public/favicon.ico` |
| iPhone 主屏幕 | `public/apple-touch-icon.png`（180px，不透明，四角延续方块颜色） |
| 通用应用图标 | `public/icons/folio-1024.png` |
| 页面品牌 Logo | `public/icons/folio-logo.png`（96px，按 22–28px 显示，适配 3 倍屏） |
| macOS Dock | `public/icons/folio.icns`（含 Retina 尺寸与透明外边距） |
| macOS 菜单栏 | `public/icons/trayTemplate.png`、`trayTemplate@2x.png`（透明单色，来自矢量标志） |
| Windows | `public/favicon.ico`（16–256px 多尺寸，同浏览器图标） |

插画在 16/32px 下细节有限。插画来源的版权需在正式分发前确认，见 `licenses/ASSET_PROVENANCE.txt`。

网页与桌面壳共享这些资源；原生安装包尚待构建验收，源码 Node 进程的系统图标不会自动替换。已添加到 iPhone 主屏幕的旧图标，需要删除后重新添加才能更新。

## Ed25519 密钥

```bash
node scripts/license-issuer.mjs keygen \
  --private-out "$HOME/.folio-issuer/license-private.pem" \
  --public-out desktop/license-public.pem
```


## 出包
```bash
export SHARP_IGNORE_GLOBAL_LIBVIPS=1
npm ci --include=optional
npm run package:desktop -- --mac dmg --arm64
```


## license  3 个月试用许可
```bash
EXPIRY_UTC="$(node -e 'console.log(new Date(Date.now()+90*24*60*60*1000).toISOString().replace(/\.\d{3}Z$/,"Z"))')"

node scripts/license-issuer.mjs issue \
  --private-key "$HOME/.folio-issuer/license-private.pem" \
  --plan trial \
  --expires-at "$EXPIRY_UTC" \
  --out "$HOME/Downloads/folio-trial-$(date +%Y%m%d-%H%M%S).json"
```