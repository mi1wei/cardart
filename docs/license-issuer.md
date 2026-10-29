# Folio 离线许可证签发

许可证采用 Ed25519 签名，不绑定设备。它不是 Windows/macOS 安装包签名，不需要购买代码签名证书，也不能替代 macOS 公证或开启未签名 Mac 的标准自动更新。

## 维护者：准备密钥

在自己的可信电脑上运行，需 Node 24 以上。从项目根目录执行：

```sh
node scripts/license-issuer.mjs keygen \
  --private-out "$HOME/.folio-issuer/license-private.pem" \
  --public-out desktop/license-public.pem
```

私钥必须保存在仓库之外，不能提交、打包、发给测试者或放入 CI。工具拒绝在任意 Git 仓库内创建/使用私钥，也拒绝覆盖已有密钥。公钥可以提交到 `desktop/license-public.pem`，桌面应用只用它验证。

请备份私钥并限制访问。已有密钥时不要重新生成或替换公钥，否则原有许可证不能被新公钥验证。生成生产密钥是维护者自行完成的操作，测试只生成一次性测试密钥。

macOS 上私钥权限须为 `0600`。Windows 上工具检查目录和文件 ACL，仅接受当前用户、SYSTEM、Administrators 的访问规则；不能以 POSIX mode 代替 Windows ACL。检查不通过时，应先由维护者检查自己的私钥目录权限，不要对主目录或系统目录批量更改 ACL。

## 签发试用或正式许可

两者格式相同，区别为 `plan` 和你明确指定的到期时间。工具不自动赠送试用天数，也没有在线设备计数。

```sh
# 示例日期仅表示格式；改成你为这份许可确定的未来 UTC 时间。
EXPIRY_UTC="2030-01-01T00:00:00Z"
node scripts/license-issuer.mjs issue \
  --private-key "$HOME/.folio-issuer/license-private.pem" \
  --plan pro \
  --expires-at "$EXPIRY_UTC" \
  --out "$HOME/.folio-issuer/licenses/pro-example.json"
```

签发短期试用时改为 `--plan trial` 并显式指定其期限。每次使用新的输出文件名；工具不覆盖已存在的文件。将生成的 JSON 私下交给测试者，不把真实许可上传到公开 Release。

外层文件是：

```json
{
  "payload": "原始 UTF-8 许可证字节的 Base64URL",
  "signature": "Ed25519 签名的 Base64URL"
}
```

签名直接覆盖 payload 解码后的原始字节。外层 JSON 的缩进无关紧要，但不能重排、修改内部字节而复用原签名。

payload 含六个字段：`license_id`、`plan`、`device_id`、`expires_at`、`features`、`license_version`。当前格式版本为 `1`，`device_id` 固定为 `null`，plan 为 `trial`/`pro`，唯一已实现的写能力是 `album_write`。文档示例中的其他功能名不是已实现的产品功能。

## 测试者：导入许可

在运行 Folio 的电脑上打开导航栏“许可证”。页面独立显示当前状态、许可证类型和有效期；试用到期与正式许可到期会分别说明，照片仍可查看和备份。

默认先选择收到的 `.json` 文件，核对文件名后点击“导入许可证”；选择文件本身不会激活。没有文件时，可展开“改为粘贴许可证 JSON”并输入完整内容。粘贴内容会替换所选文件，重新选择文件会清除文本，避免误用旧输入。文件最大 8 KiB；无需私钥。导入失败不会替换原有有效许可。手机只能查看授权状态和访问被允许的数据，不能导入许可。

无有效许可、许可到期或没有 `album_write` 时，相册为只读：照片、原图、3D 浏览和库目录备份仍可用，不删除原图。内容修改由后端统一拒绝，不能通过手机上传绕过。已被接纳的写请求会安全完成。

更新应用、重新导入许可和电脑上的手机访问开关仍然可用。授权文件保存在当前用户的 Folio `userData/license.json`，不在照片库或安装目录；操作系统账号之间不自动共享激活状态。

## 限制

- 不绑定设备意味着有效 JSON 可以在其他电脑复制使用，不承诺防共享。
- 离线到期校验依赖本机时钟，不能防止用户修改客户端或时间。
- 没有授权服务器，不能即时获知退款、取消订阅或撤销。
- CLI/Vite 是明确的源码开发模式，不启用桌面授权策略；这不是不可绕过的 DRM。
- 桌面包缺少有效公钥会明确报错，不会自动生成密钥或默认为无限授权。
