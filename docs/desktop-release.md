# Folio 桌面内测发行准备

已在本机生成 Apple Silicon 的本地 ad-hoc DMG 候选，并检查生产 fuses、原生缓存、只读授权和退出；Windows/Intel 安装器及完整发行验收尚未完成。本文件中的本机结果不等于干净系统、quarantine、真机或分发许可验收通过。

## 第三方材料

```sh
npm run notices
```

使用当前原生平台安装的生产依赖生成 `release/legal/` 与 `release/Folio-<版本>-third-party-licenses.zip`。两者包含同一份 inventory、原始许可证、Electron/Chromium notices、原生/WASM 版本及固定构建来源。探测 Electron 版本时使用独立临时 profile，不启动照片库或读取用户配置。

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

缺少批准、输入摘要变化、缺少原始声明/构建材料、未知许可或版本、素材 hash 不匹配均返回非零。不同平台的清单分别审阅，不能用一个目标的批准冒充全部目标。公开仓库的 Actions Artifacts 也不能视为私密分发；上传可下载产物和公开 Release 都必须经过分发门槛。

应用菜单的“第三方声明”在未激活/过期时仍可使用。正式资源必须指向生成的 `release/legal/`，不能用源码目录中的概述替代；Electron 自带声明也不能删除。

## 原生安装器配置与校验

已加入 `electron-builder.cjs`、固定私网规则的 NSIS 钩子和 ASAR/原生架构/fuses/资源校验器。维护者提供真实授权公钥后，本机已生成 `release/Folio-0.1.0-beta.1-macos-arm64.dmg`；未生成 NSIS，也没有改动本机防火墙。**本地生成不等于全部平台安装验收或分发批准。**

准备真实公钥后，仅在对应的原生机器/runner 执行：

```sh
# Apple Silicon
npm run package:desktop -- --mac dmg --arm64
# Intel Mac，不以 Rosetta 验证替代
npm run package:desktop -- --mac dmg --x64
# Windows x64
npm run package:desktop -- --win nsis --x64
```

三个命令不是在同一台 Mac 上交叉构建。依赖按当前平台执行 `npm ci --include=optional`，并设置 `SHARP_IGNORE_GLOBAL_LIBVIPS=1`。构建脚本始终 `--publish never`，禁用证书自动发现；Windows 未签名，Mac 仅本地 ad-hoc，不公证。

构建前校验固定公钥和原生目标；完成全部 target 后检查真实文件内容，包括 ASAR 白名单、原生模块解包/架构、WASM 文件、web/legal 与输入一致、原始 Electron 声明、公钥、图标、更新 feed 和 fuses。使用最终阶段而不是只依赖 `afterSign`：未签名 Windows 会跳过该事件，NSIS 的提权 helper 也在后续才写入解包目录。

出包后可以按实际目录复核，例如：

```sh
npm run verify:package -- --app release/mac-arm64/Folio.app --platform darwin --arch arm64
npm run verify:package -- --app release/win-unpacked --platform win32 --arch x64
npm run smoke:package -- --app release/mac-arm64/Folio.app
```

黑盒 smoke 不开启 inspector，使用临时中文/空格库和 profile，以真实 utility process/Worker 重建 PNG/primary-HEIC 缓存，检查原图、Range 视频及缺许可时拒绝写入，再验证端口关闭和库锁释放。macOS 测试进程使用 Chromium 的 mock-keychain 参数，避免自动化接触用户钥匙串；不改变生产 fuses 或正常启动参数，真实钥匙串/系统提示仍需人工验收。它不会读取生产私钥或签发真实许可。普通 `npm test` 跳过依赖实包的单个用例；原生流水线通过 `FOLIO_PACKAGE_APP` 显式运行。

应用支持 `--user-data-dir=<绝对路径> --quit` 正常退出指定 profile 的现有实例；没有实例时不启动服务。该命令通过已有本机单实例机制走统一 drain，不依赖调试端口或强杀。显式退出时，加载中的空页面不执行需等页面完成加载的 JavaScript；已进入导入的页面仍等待完整队列完成。

`FOLIO_DESKTOP_INTERNAL_TEST=1` 仅是**构建时**自动化 profile，输出 `release/internal/`；它只允许主进程 inspector，其他 fuses/资源/公钥规则不放宽，不能作为外发下载件。外发包必须关闭该模式并通过默认校验。该开关不是运行时授权、公钥或更新源后门。

Windows 安装器按机器安装并请求 UAC，应用保持 `asInvoker`。安装完成不自动启动，避免提权后从另一管理员账号创建照片库；请从登录用户的开始菜单正常启动，不选择“以管理员身份运行”。NSIS/提权 helper 可以是独立的 ia32 程序，不等于应用支持 32 位；应用和原生图像模块仍必须为 x64。

默认 NSIS 进程检查可能强制结束仍在托盘运行的应用，因此本配置覆盖该检查：只查询并等待正常退出，仍在运行或无法确认时停止安装/卸载，让用户先从托盘“退出”，不由安装器终止进程。其他登录会话也需退出。此行为仍须原生 Windows 验证。

防火墙钩子只管理 `io.github.mi1wei.folio - Private LAN`，限定 `Folio.exe`、TCP、Private、LocalSubnet；卸载只移除该规则，保留照片库、用户配置和授权。规则更新失败会提示，不关闭系统防火墙或放开 Public。**NSIS 编译、实际监听 exe、UAC、规则幂等/组织策略和卸载保留尚未在 Windows 验证，不能据此宣称手机已可连接。**

## 应用更新

Windows 安装版启动后只检查固定 GitHub beta 更新源；不会自动下载，未发布 beta 时不能承诺已有可用更新。菜单显示检查/可下载/进度/可安装状态，下载失败可重试。下载须确认，安装还需单独确认；完整导入队列和已接纳的写入会先安全完成，之后才调用安装器，可能再次请求 UAC。普通关窗或退出绝不安装缓存更新；未激活/过期不影响更新入口。

更新文件的 SHA-512 由 electron-updater 保留校验；未签名内测没有 Authenticode 发行者认证，校验和不能替代它。下载未通过校验、版本不匹配或 drain 失败都不能启动安装器。若退出已经开始再失败，不恢复编辑或假称服务仍可用；保留相册/授权并提供明确的退出提示。

Mac 只显示手动下载入口：用户确认后打开固定 Releases 页面，下载匹配芯片的 DMG，先从托盘退出再覆盖应用。不会初始化 Squirrel.Mac 或自动安装，也不生成 Mac 更新元数据。源码开发不联系真实 Windows feed。

控制流、主进程/托盘菜单及 Mac 只读入口已有自动化测试；**两个递增 Windows 安装包的受控下载/损坏校验/升级/UAC 取消/照片授权保留尚未原生验收**。GitHub 公共 feed 也没有发布或实测，不以这些源码测试代替上述结果。

## 原生 CI 与候选白名单

`desktop-checks.yml` 在 `windows-2022` x64、`macos-15-intel` x64 和 `macos-15` arm64 运行源码/桌面测试、原生构建及成品检查。只缓存 npm 下载，不跨平台复用 node_modules；普通 PR 检查不上传二进制，也不取得发布写权限。官方 Actions 固定到已核对的完整 commit SHA。

成品 package.json 记录实际 source commit 与 dirty 状态。`verify:release` 只接受与当前干净源码一致的生产包，并验证签名结构/未签名状态、真实运行与只读 DMG；不把较新 runner 当成最低系统或干净设备验收。Windows 的 `beta.yml` 必须匹配本次安装器的版本、文件名、size、SHA-512 和提权标记；blockmap 的每个 BLAKE2b-18 块都对照实际文件验证。

`desktop-release.yml` 仅构建已存在且版本一致的 beta tag。每个原生目标通过精确输入的分发审查后才允许上传 Actions Artifact；法律门槛未通过时不会泄露可下载产物。汇总必须收到三个目标，拒绝旧 commit、缺架构、重复目标、哈希变化或多余文件；将三套 legal 材料合成一个 ZIP，并生成 `SHA256SUMS`、`release-manifest.json` 和下载说明。

只有汇总 job 有 Release 写权限，且 builder 始终 `--publish never`。草稿阶段只上传白名单，重试只补同 tag/commit 下缺少的文件；已有公开版本、不同源 commit 或不同哈希的同名资产均拒绝覆盖。草稿不是已发布的 updater feed。请为 `desktop-candidates` 配置适当的 GitHub Environment 审批，最终公开发布还需独立保护。

这些工作流与负面用例已在本地校验，但**尚未推送或运行远程 Actions**；不能据此宣称 Windows/Intel 包已生成，或能从 Actions 下载。

## 尚未完成的发行前提

维护者已提供 `desktop/license-public.pem`；私钥继续由维护者在仓库外离线保管，见 `docs/license-issuer.md`。开发与打包只读取公钥，不以测试密钥替换生产公钥。

Windows/Intel 安装器、Windows 原生安装/UAC/防火墙与升级、最低系统与手机真机、发行 CI 和公开 beta feed 的验收均尚未完成。Apple Silicon 仅有上述本地候选与自动化结果，不等于下载件的完整发行验收。
