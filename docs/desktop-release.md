# Folio 桌面内测发行准备

目前尚未生成或验收 Windows/macOS 安装包。本文件先记录第三方分发门槛；不能把源码测试通过当成安装器或发行验收通过。

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

已加入 `electron-builder.cjs`、固定私网规则的 NSIS 钩子和 ASAR/原生架构/fuses/资源校验器。**配置准备不等于已生成或安装验收通过。**本机实际构建已在缺少维护者授权公钥时正确停止，没有生成 DMG/NSIS，也没有改动本机防火墙。

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
```

`FOLIO_DESKTOP_INTERNAL_TEST=1` 仅是**构建时**自动化 profile，输出 `release/internal/`；它只允许主进程 inspector，其他 fuses/资源/公钥规则不放宽，不能作为外发下载件。外发包必须关闭该模式并通过默认校验。该开关不是运行时授权、公钥或更新源后门。

Windows 安装器按机器安装并请求 UAC，应用保持 `asInvoker`。安装完成不自动启动，避免提权后从另一管理员账号创建照片库；请从登录用户的开始菜单正常启动，不选择“以管理员身份运行”。NSIS/提权 helper 可以是独立的 ia32 程序，不等于应用支持 32 位；应用和原生图像模块仍必须为 x64。

默认 NSIS 进程检查可能强制结束仍在托盘运行的应用，因此本配置覆盖该检查：只查询并等待正常退出，仍在运行或无法确认时停止安装/卸载，让用户先从托盘“退出”，不由安装器终止进程。其他登录会话也需退出。此行为仍须原生 Windows 验证。

防火墙钩子只管理 `io.github.mi1wei.folio - Private LAN`，限定 `Folio.exe`、TCP、Private、LocalSubnet；卸载只移除该规则，保留照片库、用户配置和授权。规则更新失败会提示，不关闭系统防火墙或放开 Public。**NSIS 编译、实际监听 exe、UAC、规则幂等/组织策略和卸载保留尚未在 Windows 验证，不能据此宣称手机已可连接。**

## 尚未完成的发行前提

维护者仍需自行在仓库外离线保管私钥，仅提供 `desktop/license-public.pem`；见 `docs/license-issuer.md`。不生成占位生产公钥，也不以测试密钥发布安装包。

Windows 原生安装/UAC/防火墙与更新、两种 Mac DMG、最低系统与手机真机、发行 CI 和公开 beta feed 的验收均尚未完成；后续实施将在这里补齐实际命令和验收记录。
