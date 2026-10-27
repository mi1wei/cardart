# Folio 桌面内测发行准备

目前尚未生成或验收 Windows/macOS 安装包。本文件先记录第三方分发门槛；不能把源码测试通过当成安装器或发行验收通过。

## 第三方材料

```sh
npm run notices
```

使用当前原生平台安装的生产依赖生成 `release/legal/` 与 `release/Folio-<版本>-third-party-licenses.zip`。两者包含同一份 inventory、原始许可证、Electron/Chromium notices、原生/WASM 版本及固定构建来源。探测 Electron 版本时使用独立临时 profile，不启动照片库或读取用户配置。

组件清单不是法律意见。`licenses/SOURCES.txt` 明确区分源码引用/构建说明和完整对应源码交付；后者没有被链接或 ZIP 文件自动替代。特别需要审阅 LGPL 库替换与对应源码、HEVC/H.264 条件、原生库及 Rust 依赖声明、示例素材权利，以及 lazy-val 仅声明 MIT 但缺少独立 LICENSE 的已知问题。

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

## 尚未完成的发行前提

维护者仍需自行在仓库外离线保管私钥，仅提供 `desktop/license-public.pem`；见 `docs/license-issuer.md`。不生成占位生产公钥，也不以测试密钥发布安装包。

Windows 原生安装/UAC/防火墙与更新、两种 Mac DMG、最低系统与手机真机、发行 CI 和公开 beta feed 的验收均尚未完成；后续实施将在这里补齐实际命令和验收记录。
