# DSH ↔ Aurabot 私信桥接（实验性）

DSH 保持独立插件；Aurabot 通过独立用户模块提供人格化回复。两个项目不合并。

## 已加入的代码

- `lib/aurabot-bridge.mjs`：DSH 调用 Aurabot 的 API 客户端，支持健康检查、消息回复和主动消息生成。
- `lib/aurabot-send.mjs`：DSH 侧发送适配，复用现有私信发送门控；主动发送事件使用持久化 eventId 去重。
- `POST /api/aurabot/send`：本机设置服务的认证发送入口。
- `GET /api/aurabot/contacts`：向经过本机 Token 认证的 Aurabot 模块返回 DSH 已授权联系人。
- `integrations/aurabot-module/index.mjs`：Aurabot 用户模块样例，提供 `/health`、`/message`、`/proactive` API，并在主人私聊中提供联系人查询和发送工具。

## 连接协议

Aurabot 扩展 API 基址为：

`<Aurabot本机地址>/aurabot/api/ext/douyin-bridge`

- `GET /health`
- `POST /message`：请求体含 `eventId`、`conversationId`、`senderName`、`text`、`recentMessages`，返回 `{ ok, replyText }`
- `POST /proactive`：请求体含 `goal`、`senderName`、`context`，返回 `{ ok, replyText }`

使用 `Authorization: Bearer <sharedSecret>`。远程 Aurabot 地址必须使用 HTTPS；HTTP 仅允许本机回环地址。

## Aurabot 模块安装

把 `integrations/aurabot-module/index.mjs` 复制到：

`%USERPROFILE%\.dsh\plugins-data\aurabot\modules\douyin-bridge\index.mjs`

在 Aurabot「已安装」页配置：
- 启用桥接
- 共享密钥
- DSH 地址（默认 `http://127.0.0.1:8765`）
- DSH 设置服务 Token（DSH 数据目录中的 `settings-token.txt`）
- 是否允许主动私信

Aurabot 模块的主动发送工具仅在主人私聊且本轮发言者均为主人时可用；发送时 DSH 再次执行白名单、每日额度和 eventId 去重校验。

## 当前尚未完成的部分

DSH 浏览器当前实现能读取私信会话列表并向指定会话发送，但尚未实现经过实机验证的未读消息正文、消息唯一 ID 提取和持续监听。因此，虽然 API 和 AI 生成/发送适配器已加入，**不能宣称无人值守的自动收件回复已经完成**。下一步必须在用户当前抖音登录环境验证消息 DOM、未读状态和消息 ID，再实现可靠监听；不能凭空猜选择器。

此外，当前分支的 DSH 设置页尚未加入 Aurabot 图形化配置表单；桥接参数仍由现有配置结构承载。不要把这份实验集成当作稳定版。
