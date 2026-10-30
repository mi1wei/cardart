# Folio 桌面内测发行准备

当前桌面内测仅支持 **Windows 11 x64 和 macOS 13+ Apple Silicon（arm64）**，Intel Mac 暂不支持，也不参与构建、候选汇总或发布验收。已在本机生成 Apple Silicon 的本地 ad-hoc DMG 候选；两个目标的技术检查以对应源码提交的 Actions 结果为准，完整发行仍受分发审查和人工验收阻断。本机或 CI 结果不等于干净系统、quarantine、真机或分发许可验收通过。

## 维护者直接下载自测包

`main` 每次更新（包括合并 PR 和直接推送）都会通过 **Desktop checks** 先创建真实的递增 beta Git tag，再自动生成维护者自测包。tag 和打包源码固定使用本次推送的完整提交，不会在排队期间悄悄切到更新的 main。每个平台只运行一遍现有完整自测流程：Windows x64/Apple Silicon 的源码、桌面、原生打包和严格成品检查；Windows 还运行安装、运行中保护、重装及卸载测试。无需在自己的电脑编译。

仍可在 GitHub **Actions → Desktop checks → Run workflow** 手动触发；手动模式固定解析一次当时 `main` 的完整提交。PR 只做只读验证，不上传安装包，也不取得草稿写权限；标签、其他分支和分叉仓库的推送不会触发自动自测上传。

成功后打开运行摘要中的 **Maintainer-only self-test download**，用有仓库写权限的账号登录，下载未公开 Draft Release 中对应平台的 ZIP：

- `Folio-<版本>-self-test-win32-x64.zip`：解压后运行 Windows 安装器。
- `Folio-<版本>-self-test-darwin-arm64.zip`：解压后打开 Apple Silicon DMG。

同名 `.zip.json` 是来源与 SHA-256 校验信息，不是安装器。ZIP 同时包含精确候选报告、声明材料、`SHA256SUMS` 和 `self-test.json`；后者明确 `distributionApproved: false`。`buildTag` 是真实 Git tag，`tag` 是独立的自测草稿标识；摘要同时列出真实 tag、完整 source commit、运行与下载链接。许可证需自行签发并单独导入，不会附带私钥或真实激活文件。

这些草稿只供维护者自测，不公开、不设为 latest、不进入公开更新 feed；**不要点击 Publish release**。真实 `v...` tag 只标记源码和构建版本，不代表批准公开发行。自测草稿继续使用独立的 `self-test-` 前缀，并绑定提交、运行及尝试编号，不与正式候选 Release 混用，也不覆盖旧资产。部分构建失败或人工取消时，草稿可能不完整，应等待两个目标及完成任务均成功，使用成功运行摘要中的最终下载链接。重试只复用同来源、同 hash 的既有资产；不同 hash 会拒绝覆盖，需要重新构建时可手动触发新运行，生成隔离的新草稿。

### 自动版本与重建

源码 `package.json` 和 lockfile 的版本是系列基线，例如 `0.1.0-beta.1`。分配器读取全部远程 tags，按同系列 beta 序号的数值最大值加一；尚无 tag 时，该基线首次分配 `v0.1.0-beta.2`。同一提交重跑复用已有 tag；不同提交竞争同一编号时重新读取并分配下一个，不移动或覆盖旧 tag。失败后保留 tag，重试不因构建失败再次升版。major/minor/patch 不自动推断，切换系列由维护者同步修改源码 package 和 lockfile。

构建从已经核对的 tag 派生发行版本，注入包内 metadata；不会修改源码 package/lock，不产生机器人 main 提交。以 `v0.1.0-beta.2` 为例，包内版本、About、法律材料、报告和文件名统一为 `0.1.0-beta.2`：`Folio-0.1.0-beta.2-windows-x64-setup.exe`、`Folio-0.1.0-beta.2-macos-arm64.dmg`。`folioBuild.tag` 同时记录真实 tag。PR/开发不带发行环境变量，仍使用基线版本。

main 运行不再互相取消，因此可能并行构建多个版本；PR 仍取消旧检查。同 SHA 的 tag 分配串行，不同 SHA 通过原子 ref 创建解决竞争。序号按 tag 成功预留顺序递增，不保证与合并时间或构建结束顺序一致；公开发行仍人工选择经批准的候选。权限或 tag ruleset 拒绝时停止，不回退为无 tag 包，也不自动放宽规则。

需要本地重建已有版本时，在匹配的原生机器和干净 checkout 中执行（以下以 Apple Silicon 为例）：

```sh
git fetch origin --tags
git switch --detach v0.1.0-beta.2
export RELEASE_TAG=v0.1.0-beta.2
export SOURCE_COMMIT="$(git rev-parse HEAD)"
npm ci --include=optional
npm run package:desktop -- --mac dmg --arm64
```

Windows 原生 runner 使用 `--win nsis --x64`。必须提供同时匹配 tag、HEAD 的完整 SOURCE_COMMIT；只改文件名或环境中的版本号会失败。

tag 使用当前 Actions 的 `GITHUB_TOKEN` 创建，不会再自动触发 tag-push 工作流；自测在同一个 workflow 中显式接续。要生成经过分发审查的正式候选，请手动运行 **Desktop candidate** 并输入已有 tag。外部正常推送 beta tag 的原入口仍保留。历史草稿不补 tag、不删除，也不会把自测草稿直接发布为正式候选。

仅受信的 main 推送或维护者手动自测任务有草稿创建/上传权限，`GH_TOKEN` 只传给相应步骤，不传给源码构建命令。工具代码与固定 main 源码分目录检出，保持成品源提交清晰。手动上线验证时仍可选择已审阅的工作流分支，打包源码固定来自 main；日常手动运行选择 main。自动触发的实际结果以配置合入后的主干运行记录为准。

仓库是公开的，Actions Artifacts 不是仅维护者可见的下载渠道，所以个人自测使用草稿资产而不是公开 Artifacts。此入口不修改 `distribution-review.json`、人工验收记录或正式候选/发布脚本；给其他人分发及公开发布仍走后文的实际审查与审批。

## 第三方材料

```sh
npm run notices
```

使用当前原生平台安装的生产依赖生成 `release/legal/` 与 `release/Folio-<版本>-third-party-licenses.zip`。两者包含同一份 inventory、原始许可证、Electron/Chromium notices、原生/WASM 版本及固定构建来源。探测 Electron 版本时使用独立临时 profile，不启动照片库或读取用户配置。

Windows 的 Sharp addon 与 libvips DLL 同在 `@img/sharp-win32-x64`，按其 `versions.json` 清点嵌入组件；Mac 使用独立的 `@img/sharp-libvips-*` 包。识别 Windows 的 Apache/LGPL 复合声明不等于批准分发。

组件清单不是法律意见。`licenses/SOURCES.txt` 明确区分源码引用/构建说明和完整对应源码交付；后者没有被链接或 ZIP 文件自动替代。特别需要审阅 LGPL 库替换与对应源码、HEVC/H.264 条件、原生库及 Rust 依赖声明、NSIS/提权 helper 等安装器组件、示例素材权利，以及 lazy-val 仅声明 MIT 但缺少独立 LICENSE 的已知问题。

`licenses/distribution-review.json` 默认不含任何批准。只有维护者在取得适当审查后，才可为**这些确切输入**添加记录：

```json
{
  "inputsDigest": "实际 inventory.json 中的 inputsDigest",
  "notices": true,
  "correspondingSources": true,
  "replaceableLibraries": true,
  "codecsAndPatents": true
}
```

这不是可直接复制的实际批准，也不是让维护者在没有材料时勾选布尔值。`notices` 审阅包含字体/示例素材权利和已知声明缺项；保留相应非敏感依据。不要向公开仓库提交秘密、个人资料或保密审查文档。

```sh
npm run notices -- --require-distribution-approval
```

缺少批准、输入摘要变化、缺少原始声明/构建材料、未知许可或版本、素材 hash 不匹配均返回非零。不同平台的清单分别审阅，不能用一个目标的批准冒充全部目标。公开仓库的 Actions Artifacts 也不能视为私密分发；对外提供下载和公开 Release 都必须经过分发门槛。上文维护者自测草稿是独立的未批准自测入口，不代表审查已经通过。

应用菜单的“第三方声明”在未激活/过期时仍可使用。正式资源必须指向生成的 `release/legal/`，不能用源码目录中的概述替代；Electron 自带声明也不能删除。

## 原生安装器配置与校验

已加入 `electron-builder.cjs`、固定私网规则的 NSIS 钩子和 ASAR/原生架构/fuses/资源校验器。维护者提供真实授权公钥后，本机已生成 Apple Silicon DMG，Windows 原生 CI 也已编译 NSIS 并校验成品；没有改动本机防火墙。**技术构建通过不等于两个目标的真实安装验收或分发批准。**

准备真实公钥后，仅在对应的原生机器/runner 执行：

```sh
# Apple Silicon
npm run package:desktop -- --mac dmg --arm64
# Windows x64
npm run package:desktop -- --win nsis --x64
```

这两个命令分别在对应原生平台执行，不在同一台 Mac 上交叉构建。依赖按当前平台执行 `npm ci --include=optional`，并设置 `SHARP_IGNORE_GLOBAL_LIBVIPS=1`。构建脚本始终 `--publish never`，禁用证书自动发现；Windows 未签名，Mac 仅本地 ad-hoc，不公证。配置与资源校验器均拒绝 macOS x64 安装器目标。

构建前校验固定公钥和原生目标；完成全部 target 后检查真实文件内容，包括 ASAR 白名单、原生模块解包/架构、WASM 文件、web/legal 与输入一致、原始 Electron 声明、公钥、图标、更新 feed 和 fuses。使用最终阶段而不是只依赖 `afterSign`：未签名 Windows 会跳过该事件，NSIS 的提权 helper 也在后续才写入解包目录。

生产 fuses 关闭 Cookie 加密，校验器拒绝开启它。桌面窗口唯一的 Cookie 是语言 `folio_lang`（`album_key` 只发给手机），加密不保护机密；而开启后 Electron 会把密钥存进 macOS 钥匙串「Folio Safe Storage」，ad-hoc 签名的每次打包 cdhash 都不同，钥匙串会在每个新包首次启动时要求输入登录密码。关闭后应用不使用系统钥匙串；旧版本加密保存的 Cookie 读不出会被丢弃，语言只回退一次。

出包后可以按实际目录复核，例如：

```sh
npm run verify:package -- --app release/mac-arm64/Folio.app --platform darwin --arch arm64
npm run verify:package -- --app release/win-unpacked --platform win32 --arch x64
npm run smoke:package -- --app release/mac-arm64/Folio.app
```

黑盒 smoke 不开启 inspector，使用临时中文/空格库和 profile，以真实 utility process/Worker 重建 PNG/primary-HEIC 和视频 JPEG 封面的缓存，检查照片/视频原字节、相册视频 Range、视频 Details、只读备注和缺许可时拒绝写入，再验证端口关闭和库锁释放。首页装饰视频的旧 Range 检查仍保留，不把它当作相册视频验收。自测只在私有 profile 中选择空闲端口，避免干扰已运行实例或触发端口占用提示，不改变生产端口策略。macOS 测试进程使用 Chromium 的 mock-keychain 参数，避免自动化接触用户钥匙串；不改变生产 fuses 或正常启动参数，真实钥匙串/系统提示仍需人工验收。它不会读取生产私钥或签发真实许可。普通 `npm test` 跳过依赖实包的单个用例；原生流水线通过 `FOLIO_PACKAGE_APP` 显式运行。

应用支持 `--user-data-dir=<绝对路径> --quit` 正常退出指定 profile 的现有实例；没有实例时不启动服务。该命令通过已有本机单实例机制走统一 drain，不依赖调试端口或强杀。显式退出时，加载中的空页面不执行需等页面完成加载的 JavaScript；已进入导入的页面仍等待完整队列完成。

`FOLIO_DESKTOP_INTERNAL_TEST=1` 仅是**构建时**自动化 profile，输出 `release/internal/`；它只允许主进程 inspector，其他 fuses/资源/公钥规则不放宽，不能作为外发下载件。外发包必须关闭该模式并通过默认校验。该开关不是运行时授权、公钥或更新源后门。

Windows 安装器按机器安装并请求 UAC，应用保持 `asInvoker`。安装完成不自动启动，避免提权后从另一管理员账号创建照片库；请从登录用户的开始菜单正常启动，不选择“以管理员身份运行”。NSIS/提权 helper 可以是独立的 ia32 程序，不等于应用支持 32 位；应用和原生图像模块仍必须为 x64。

`node scripts/windows-installer-smoke.mjs --allow-disposable-runner` 仅允许在一次性 GitHub-hosted Windows x64 管理员 runner 上执行。它先核对当前提交的已验证候选及全部文件哈希，并拒绝已有 Folio 安装、默认用户数据、相册库、注册表、规则或运行进程；不能用它在日常电脑或 self-hosted runner 上安装测试。

原生 CI 随后实际安装、从安装目录运行现有成品 smoke、同版本重装和卸载，检查 HKLM 注册、安装后不自动运行、唯一的 Private/LocalSubnet/TCP 程序规则及卸载清理。默认用户数据目录和 Pictures 相册库中只放本次自建的图片、元数据与许可文件保留标记，逐文件比较操作前后的哈希；许可标记不是有效签发文件。清理只使用本次安装的卸载器及有所有权标记的数据目录，不关闭其他进程或更改全局防火墙设置。执行结果以对应提交的 Windows CI 为准。

这是 Windows Server hosted runner 的安装回归，不是 Windows 11 普通账号/UAC 提示、组织策略、手机连通性或两个不同版本的升级验收；报告中的这些人工验收项仍为未完成。候选工作流仍先要求精确分发批准，安装测试不会解除下载或公开发布门槛。

默认 NSIS 进程检查可能强制结束仍在托盘运行的应用，因此本配置覆盖该检查：只查询并等待正常退出，仍在运行或无法确认时停止安装/卸载，让用户先从托盘“退出”，不由安装器终止进程。安装 smoke 会在自有已安装主进程和后端仍运行时分别尝试安装和卸载，要求退出码 2、原 PID/HTTP 服务继续可用、安装文件和用户数据哈希、注册表及规则保持不变，然后正常退出应用再执行重装/卸载。

卸载保护检查使用自有卸载器副本及 NSIS 的 `_?=` 同步模式取得实际退出码，不改变正常卸载路径，也不靠仿冒进程名证明保护有效。实际结果以对应 Windows CI 为准；其他登录会话也需先退出，Windows 11 的多用户/权限差异仍须真机验收。

防火墙钩子只管理 `io.github.mi1wei.folio - Private LAN`，限定 `Folio.exe`、TCP、Private、LocalSubnet；卸载只移除该规则，保留照片库、用户配置和授权。规则更新失败会提示，不关闭系统防火墙或放开 Public。**NSIS 编译结果以原生 CI 为准；实际监听 exe、UAC、规则幂等/组织策略和卸载保留仍须 Windows 11 真机验收，不能据此宣称手机已可连接。**

## 视频混排的验证边界

视频原样保存，服务端仅做有界容器/JPEG 校验，不转码、不换封装、不调用或打包新的 ffmpeg/codec。播放依赖当前 Electron/Chromium、浏览器与操作系统实际提供的解码路径；格式白名单不是 H.264、HEVC、HDR 或任意 profile 的通用播放保证，编解码器与专利仍属于现有分发审查范围。

本地 Apple Silicon 验证使用自有 H.264/AAC MP4、MOV、M4V、带旋转矩阵、极短及封面需缩小的样片；真实 Electron 检查解码帧、队列/保存、原生控件、备注和释放，production-fuse 目录包检查只读服务与可再生 poster。夹具生成工具只供维护者准备素材，不是测试运行或应用的依赖，测试媒体也不进入安装包。

Windows 11 x64、最低 macOS 13、真实 iPhone Safari 的连续上传、切后台、省流/播放受限，以及 HEVC/10-bit/HDR 仍须分别取得设备证据。当前 macOS 26.1 的运行结果不能替代这些验收；没有特定硬件解码器也不直接等于没有软件解码能力。只在实际不支持时降级为封面与说明，不能把文件 404 误称为设备 codec 不支持。

所有结论绑定实际源码与成品；旧自测包、构建成功或结构夹具不代表新视频功能或最低系统已验收，更不代表公开发行已获批准。

## 应用更新

Windows 安装版启动后只检查固定 GitHub beta 更新源；不会自动下载，未发布 beta 时不能承诺已有可用更新。菜单显示检查/可下载/进度/可安装状态，下载失败可重试。下载须确认，安装还需单独确认；完整导入队列和已接纳的写入会先安全完成，之后才调用安装器，可能再次请求 UAC。普通关窗或退出绝不安装缓存更新；未激活/过期不影响更新入口。

更新文件的 SHA-512 由 electron-updater 保留校验；未签名内测没有 Authenticode 发行者认证，校验和不能替代它。下载未通过校验、版本不匹配或 drain 失败都不能启动安装器。若退出已经开始再失败，不恢复编辑或假称服务仍可用；保留相册/授权并提供明确的退出提示。

Mac 只显示手动下载入口：用户确认后打开固定 Releases 页面，下载 Apple Silicon（arm64）DMG，先从托盘退出再覆盖应用；当前没有 Intel 下载件。不会初始化 Squirrel.Mac 或自动安装，也不生成 Mac 更新元数据。源码开发不联系真实 Windows feed。

控制流、主进程/托盘菜单及 Mac 只读入口已有自动化测试；**两个递增 Windows 安装包的受控下载/损坏校验/升级/UAC 取消/照片授权保留尚未原生验收**。GitHub 公共 feed 也没有发布或实测，不以这些源码测试代替上述结果。

## 原生 CI 与候选白名单

`desktop-checks.yml` 在 `windows-2022` x64 和 `macos-15` arm64 运行源码/桌面测试、原生构建及成品检查。只缓存 npm 下载，不跨平台复用 node_modules；普通 PR 检查不上传二进制，也不取得发布写权限。官方 Actions 固定到已核对的完整 commit SHA。

两个目标均运行完整桌面测试，包括真实鼠标、3D、翻页、原生全屏事件和保存检查。Intel 专用的软件渲染副本、驱动参数与延长时限已移除；沙箱、上下文隔离和 CSP 保持开启。暂缓支持不代表此前 Intel 虚拟机的全屏超时已修复，后续恢复支持须重新原生验收。

成品 package.json 记录实际 source commit 与 dirty 状态。`verify:release` 只接受与当前干净源码一致的生产包，并验证签名结构/未签名状态、真实运行与只读 DMG；不把较新 runner 当成最低系统或干净设备验收。Windows 的 `beta.yml` 必须匹配本次安装器的版本、文件名、size、SHA-512 和提权标记；blockmap 的每个 BLAKE2b-18 块都对照实际文件验证。

`desktop-release.yml` 仅构建已存在且版本一致的 beta tag。每个原生目标通过精确输入的分发审查后才允许上传 Actions Artifact；法律门槛未通过时不会泄露可下载产物。汇总必须且只能收到 `win32-x64` 和 `darwin-arm64` 两个目标，拒绝旧 commit、缺架构、重复目标、额外 Intel 目标、哈希变化或多余文件；将两套 legal 材料合成一个 ZIP，并生成 `SHA256SUMS`、`release-manifest.json` 和下载说明。草稿和公开发布白名单也只接受这两个安装器。

正式候选流程只有汇总 job 有 Release 写权限，且 builder 始终 `--publish never`。草稿阶段只上传白名单，重试只补同 tag/commit 下缺少的文件；已有公开版本、不同源 commit 或不同哈希的同名资产均拒绝覆盖。草稿不是已发布的 updater feed。请为 `desktop-candidates` 配置适当的 GitHub Environment 审批，最终公开发布还需独立保护。

这些工作流已在真实原生 runner 上运行，具体技术状态以每个提交的 Actions 结果为准；配置校验或单个平台通过不能代替两个受支持目标的成品检查。PR 不上传安装器，分发门槛未通过时也不能从正式 Desktop candidate 流程下载二进制。维护者个人自测使用前述独立草稿入口。

## 人工验收与公开 beta 发布

`licenses/desktop-acceptance.json` 默认 `candidates: []`，当前没有完整真机验收记录。**不要把本机 smoke、CI runner、模拟的 GitHub 边界测试或未签名的正常提示填成通过。**

每个候选记录精确的 `tag`、40 位 `sourceCommit`，并为 `win32-x64`、`darwin-arm64` 两个目标提供 `systems`：`target`、`os`、实际 `osVersion`、实际安装器 `installerSha256` 和 `passed`。Windows 记录 `os: "Windows 11"`；Apple Silicon 必须有 `os: "macOS"`、`osVersion: "13.x"` 的最低系统验收。可以另保留较新系统的测试证据，但不能替代这两个最低目标；当前验收记录不接受额外 Intel 目标。

候选的 `checks` 需逐项完成并记录为 `true`；没有完成保持 `false`，不能用空记录或占位哈希发布：

| 字段 | 必须实际确认的结果 |
|---|---|
| `licenseStates` / `tamperedLicenseRejected` | 缺许可、有效 trial/pro、到期只读及篡改拒绝；原图不删 |
| `phoneReadOnly` | 手机授权 gate 与只读写入拒绝，电脑专属设置不可从 LAN 修改 |
| `photoAndHeic` | JPG/HEIC 导入、主图/方向、去重、原图字节及缓存重建 |
| `viewerFullscreenLanguages` | 3D 翻页、全屏、中英文及重启恢复 |
| `trayAndExit` | 关窗后台手机访问、导入继续、托盘恢复、显式退出排空 |
| `portAndNetworks` | 端口占用回退、多网卡/VPN 选择及正确二维码 |
| `windowsUacFirewall` | 登录用户非提升运行；实际监听 exe 对应 Private/LocalSubnet 程序规则；Public 未放行；拒绝 UAC/组织策略有明确结果 |
| `controlledWindowsUpgrade` | 两个递增测试包在受控 feed 下载/升级，断网/损坏拒绝/UAC 取消/导入中升级及规则不重复 |
| `manualMacUpdate` | 下载正确芯片 DMG，先退出再覆盖，不假称有自动安装 |
| `dataRetention` | 升级/卸载重装后原图哈希、顺序、封面和授权保留；始终先备份库 |
| `downloadPrompts` | 干净系统不预装 Node；真实下载件保留 quarantine，记录正常逐应用确认；不可全局关闭系统保护或绕过组织策略 |

不要在该记录中写私钥、真实个人许可证、用户照片、账号身份或保密审查材料。发布脚本只提取这一候选的上述必要字段，生成单独的 `release-acceptance.json`，不上传整个验收账本。

公开前还需在 GitHub 仓库 Settings → Environments 配置 `desktop-publish` 的 **Required reviewers**，并按团队需要配置 `desktop-candidates` 审批。仅写工作流中的 environment 名称不够：发布脚本会读取实际保护规则，没有非空 required-reviewer 规则即停止。保护配置和审批是否可用尚未在远程验证。

准备好全部真实记录及对应源码/分发审查后，从 `main` 手动运行 `desktop-publish.yml`，输入**已有 Draft beta tag**，显式勾选 `confirm_public_beta`，再由 Environment 审批。该操作将使文件公开，不是保密下载。脚本重新下载/校验精确白名单、确认远程 tag/source commit、现有资产 hash、当前法律批准和真实验收，先附加可校验的验收记录，再转为公开 Pre-release；不创建/改写 tag，不替换同名文件。

第一版发布只建立通道，不能宣称尚不存在的下一版升级已通过。脚本始终记录 `publicUpdateFeedVerified: false`；后续两个已审批公开 beta 的真实 GitHub 端到端升级，还需单独验收。问题版本应停止分发并发布新修复版，不覆盖旧 tag/同版本资产，不自动降级或改写照片数据。

## 当前结果与未完成项

维护者已提供 `desktop/license-public.pem`；私钥继续由维护者在仓库外离线保管，见 `docs/license-issuer.md`。开发与打包只读取公钥，不以测试密钥替换生产公钥。

| 项目 | 当前证据 |
|---|---|
| Apple Silicon 本地 DMG | 已生成，生产 fuses/原生缓存/Range/只读授权/正常退出/只读镜像运行/ad-hoc 与镜像完整性通过；不是公证或下载件验收 |
| Windows/Apple Silicon 包与远程 CI | 已运行真实原生 PR 流程；技术状态以提交对应的 Actions 结果为准，PR 不上传安装器，不替代真机验收 |
| Intel Mac | 暂不支持，不参与本轮构建、发布或验收；历史失败没有被当作已修复 |
| Windows 受控升级/UAC/防火墙 | 控制流回归通过；真实安装/升级/组织策略及非提升账号尚未验证 |
| 分发与最低系统/手机验收 | 法律审批和验收记录为空，仍然阻断分发 |
| GitHub 发布与更新 feed | 正式候选/公开更新 feed 尚未发行验收；维护者自测草稿另行标识，不是公开发布或分发批准 |

如需复核本地成品，先在干净已提交工作树生成 DMG，再执行：

```sh
npm run verify:release -- \
  --app release/mac-arm64/Folio.app \
  --artifact release/Folio-0.1.0-beta.1-macos-arm64.dmg \
  --output release/local-native-verification-new
```

输出目录须为新的专用目录，不覆盖已有验收记录。不要把当前单平台本地候选误作已经满足完整跨平台 Done 条件。
