# DSH ↔ Aurabot 私信桥接（预发布）

DSH 保持独立抖音插件；Aurabot 只通过自己的模块 API 提供模型、人格和记忆。两个项目不合并。

## 当前组件

- `lib/aurabot-bridge.mjs`：DSH 调用 Aurabot 的模块 API。
- `lib/aurabot-send.mjs`：DSH 侧回复/主动发送适配；先做联系人许可预检，阻止未授权消息进入 Aurabot；对同一入站事件加并发锁，区分生成失败、发送中、已发送和结果不确定。
- `POST /api/aurabot/send`：经过 DSH 本机设置 Token 认证的主动发送入口。
- `GET /api/aurabot/contacts`：向 Aurabot 模块提供 DSH 已授权联系人。
- `integrations/aurabot-module/douyin-bridge/index.mjs`：可直接复制安装的 Aurabot 用户模块。

## API 协议

Aurabot 扩展路由的真实前缀来自模块 API 文档：`/aurabot/api/ext/<module-id>/`。本模块 ID 为 `douyin-bridge`，所以地址为：

- `GET /aurabot/api/ext/douyin-bridge/health`
- `POST /aurabot/api/ext/douyin-bridge/message`
- `POST /aurabot/api/ext/douyin-bridge/proactive`

鉴权使用 `Authorization: Bearer <sharedSecret>`。远程 Aurabot 地址必须 HTTPS；HTTP 只允许本机回环。

## 安装

一键安装（推荐）：解压整合包后，右键包根目录的 `install-all.ps1`，用 PowerShell 运行。它会先备份，再一次装好 DSH 插件和这个 Aurabot 桥接模块。装完按 `安装说明-整合版.md` 配两把密钥、点一次“测试 Aurabot 连接”就行。

手动安装：将 `integrations/aurabot-module/douyin-bridge/` 整个目录复制到：

```text
%USERPROFILE%\\.dsh\\plugins-data\\aurabot\\modules\\douyin-bridge\\
```

目录里现在有 `index.mjs`（桥接本体）和 `module.json`（模块清单，Aurabot 靠它认出这个模块），缺了清单模块可能列不出来，别只拷一个文件。

在 Aurabot「已安装」页启用模块，并配置：

- `sharedSecret`：与 DSH 设置页的 Aurabot 桥接密钥完全一致
- `dshBaseUrl`：DSH 本机设置服务地址，默认 `http://127.0.0.1:8765`
- `dshToken`：DSH 数据目录的 `settings-token.txt`
- `allowProactive`：Aurabot 侧主动联系开关

在 DSH 设置页填写 Aurabot Web Server Origin（协议、主机、端口），启用桥接和需要的自动回复/主动联系开关，然后点“测试 Aurabot 连接”。连接测试只访问 health，不发送消息。

## 安全行为

- Aurabot 使用 `api.think()`，沿用它自身的人格和记忆；DSH 负责抖音浏览器会话和发送。
- Aurabot 主动私信工具仅主人私聊可用；DSH 仍会再次检查已授权联系人和每日额度。
- 明确的“别联系我 / 不要再私信 / 停止联系”等拒绝联系语句会写入 DSH 本地 `blocked.json`，优先于白名单拒绝后续发送。
- 同一联系人发送串行化，避免并发调用越过每日额度；对发送结果不确定的事件不自动重发；不绕过验证码或平台风控。

## 尚未完成

**自动收件监听仍未完成。** 当前浏览器层只能读取会话列表和发送消息；尚未基于用户真实抖音登录页验证未读状态、消息正文、发送者和消息级稳定 ID，也没有持续轮询。当前 `dy_dm_inspect` 已改为在已打开 `/im` 页面时保留当前会话，并增加消息/发送者语义属性、ID 存在性与长度等脱敏结构线索，但这仍不是消息解析器，也不能代替真实页面诊断。DSH 新增的 `dy_dm_inspect` 只读工具可返回脱敏 DOM 结构（不包含昵称、消息正文、Cookie 和原始会话 ID），用于下一步按真实 DOM 实现监听。未经 Windows + Edge + 已登录抖音实机验收，不得把本分支当作稳定正式版。
