# dsh-douyin-gonzalez — DSH 抖音独立插件（v0.4.0）

## v0.4.0：对外互动每日总额度改为执行前强制拦截

- 新增 `lib/outward-gate.mjs`，统一统计当天成功执行的点赞、评论、@、分享、收藏、表情、续火花和回自己评论。
- `caps.totalOutwardPerDay` 不再只是体检提示；在写操作入口执行前强制检查，达到上限后拒绝新动作。
- 多人分享和批量回复自己的评论，在每个实际发送动作前再次检查总额度，防止一次工具调用内越过总闸。
- 只统计 `status: sent` 的成功动作；失败、未确认和 planned 不计入成功额度。
- 新增保守型广告/购物文案过滤：识别明确品牌合作、广告赞助和直接购买 CTA；普通开箱、测评、使用体验默认保留。该过滤只分析当前视频可读取的文案，不声称能识别画面中所有隐性广告。
- 浏览过程中检测到验证码、安全验证、频繁操作、账号异常等提示时，立即停止本轮浏览并持久化风控暂停；互动入口也会在浏览器页面再次检查，拒绝继续写操作。
- 新增自检覆盖：混合动作计数、planned 不计数、达到总额后拦截，广告/购物文案过滤、非商业测评保留及平台验证/限流信号识别。
- 原版 `main` 保持不变；本版本在 `release/v0.4.0-douyin-enhanced` 分支开发。

> 本次版本先落实可验证的安全闸门修复。抖音页面选择器和浏览器互动仍受抖音网页 DOM 变化影响，未完成真实账号实机验证前，不应把它视为已通过实机验收。

刷抖音 + 回私信 + 互动 + 发现 + 发片 + 安全，**5 个包分开装、各自一个总开关**。好友许可名单用真实勾选 + 显式保存，按抖音好友 id 匹配。这是为了解决 LockyBee `dsh-douyin-browser-local` 1.4.7 上用户遇到的问题：私信列表读得到，但点选不了 / 选完不保存。

> 第三方插件，不是 DeepSeek 官方发行版。抖音登录只留在本机 Edge 里，本插件不读、不存、不发任何 Cookie / 密码。

## v0.3.4：设置服务自动起，不用手动跑 npm run settings

插件加载时自动在 127.0.0.1:8765 起设置服务，DSH 设置里的面板一打开就有数据。端口已被占（服务已在跑）时不报错，直接用现成的。`DSH_DOUYIN_AUTO_SETTINGS=0` 可关掉自动起，关掉后还是手动跑 `npm run settings`。

## v0.3.3：原生面板真挂上了（v0.3.2 的挂接写法是错的）

v0.3.2 的面板挂接调了 DSH 里不存在的方法，设置里什么都没出现，不是你装错了。v0.3.4 按已上线插件同款写法重做了 `client.js`：经典脚本 + `__ModuleLoader__.load`，factory 返回 `{ apply, inject: ['slots', 'locale'] }`，用 `ctx.slots.inject('settings.section', …)` 注册 React 组件；`package.json` 的 `dsh.client.inject` 改成 slots/locale/runtime/settings。面板里有 5 个包开关、今天回复数和登录状态、登录/体检/刷新/完整设置页四个按钮，面板通过 fetch 跟本地设置服务说话（设置服务已加 CORS）。**面板要显示内容，得先跑设置服务**（`npm run settings`）。

## v0.3.3：用户提的 6 个问题，逐条落地

1. **报错说人话**：playwright 没装时，以前只扔一句英文 `Cannot find package 'playwright'`。现在 `lib/browser.mjs` 里 import 失败就换成中文原因 + 一步一步的修法（进 `C:\dsh-douyin-gonzalez` 跑 `pnpm install`，装不上就开全局/TUN 再跑或改跑 `npm install`，装完看 `node_modules\playwright` 文件夹在不在）。体检里 Edge 登录那项、设置页 `/api/login/open`、工具 `dy_login_status` 都透传这份中文办法，设置页登录失败时也直接显示出来。
2. **在线下载**：代码已按 npm 发布要求准备好（`package.json` 有 name/version/files/engines/license，加了 repository/homepage/bugs）。**但还没真的发布到 npm**——发布要用户自己的 npm 账号登录一次、跑 `npm publish`，这一步我做不了（没有用户的 npm 账号/Token），也没假装已发布。发布后的安装命令会是 `dsh plugin --profile web add dsh-douyin-gonzalez@0.4.0`。现在能在线装的办法是 GitHub clone（见“安装”一节），仓库：https://github.com/zhaoxj59/dsh-douyin-gonzalez 。打 Release 的办法也写在“安装”一节了（`git tag v0.3.4` + `gh release create`）。
3. **内置到 DSH 里？做不到，但常用项收进了 DSH 原生面板**：DSH 本体是第三方的，改不了、塞不进去，这个没法假装。能做的上限是 DSH 客户端提供的设置注入点（`client.js`）：在 DSH 设置里挂一个“刷抖音（自写）”分区，放最常用的几项（核心包、危险动作总开关、白名单人数、一键体检、登录抖音）和完整设置页地址。5 个包的全部设置（几十个开关 + 数字 + 选人勾选）放不进原生面板，只能留在本地网页设置页（`http://127.0.0.1:8765/`）。所以：原生面板 = 快捷入口 + 常用开关；网页页 = 完整设置。`client.js` 里所有挂接都先判运行时有没有这个能力，没有就静默跳过，绝不拖垮插件本体。
4. **登录放第一页**：设置页核心包最上面加了“🔑 登录抖音”一节：登录状态 + “打开 Edge 登录抖音”按钮 + 登录失败时显示第 1 条的中文修法。吸顶目录条里也加了“🔑 登录抖音”，一点就跳过去。安全包里原来的“重新扫码登录”保留，两处调同一个接口。
5. **设置自动保存**：开关/数字/勾选一改就自动保存（500ms 防抖，调已有的 `POST /api/config` + `/api/allowed`），存成功顶部写“已自动保存 HH:MM:SS”，失败写红字原因；“保存全部设置”按钮还留着，当手动兜底。选人勾选也一样，勾完自动保存读回核对。
6. **和大肥鱼互通（包括记忆）**：新工具 `dy_fish_share`（核心包）+ `lib/fish.mjs`。把当天日报摘要写两份：① 抖音专属记忆 `memory/YYYY-MM.md`；② 大肥鱼家里的 `~/.dsh-fish/inbox.md`，只追加一行，绝不改它原有内容、不碰 `events.jsonl`。体检加了第 13 项“大肥鱼记忆互通”，只读检查 inbox.md 能不能写、最近一次分享是什么时候。**说清楚：这只是单向分享记录，不是双向实时对话**——大肥鱼不会因为 inbox 里多了一条就主动来聊抖音，想让它聊，得在它的会话里问它。

## v0.3.1：模版确认的 4 项落地

1. **吸顶目录条**：设置页顶上 `position: sticky` 的目录条（核心 / 互动·点赞评论 / 发现 / 发片 / 安全 + 🩺 一键体检），翻到点赞那块也能一点跳回。
2. **危险动作默认全关 + 预算单独放大**：点赞、评论、@人、分享、收藏、表情包、续火花、回自己评论、回陌生人私信，9 个开关默认全关；**分享从默认开改成默认关**（见下方升级说明）。每日次数全挪进互动包里单独的黄色「每日预算」区，数字 24px 粗体，不跟口吻、收藏夹等普通设置混在一起；开关关着，对应的次数框置灰点不动。新增每日总闸 `caps.totalOutwardPerDay`（默认 20 次/天），只在体检里算，不在工具里硬拦。
3. **每包开头一句话**：5 个包各在开头写一句“这个包会干什么”，一句话。
4. **一键体检**：新工具 `dy_health_check`（核心包）+ 设置页核心包里的体检栏 + 设置服务 `POST /api/health`。真跑 13 项检查（见下一节），跑完写通过几项、不通过哪几项，每项不通过都写原因；Edge 探不到时那项报 unknown，不假装通过。

### 一键体检的 13 项

| # | 检查 | 不通过是什么意思 |
|---|---|---|
| 1 | Edge 已启动并登录抖音 | 未登录：去核心包点“打开 Edge 登录抖音”扫码；Edge 没起来则报 unknown。playwright 没装时这一项会写中文原因 + 一步一步的修法 |
| 2 | 看片层（OCR / 转写） | OCR/转写开了但本机没有：依赖内容的动作先跳过。插件测不到 DSH 主模型是否支持看图，那是 DSH 侧的模型配置 |
| 3 | 许可名单保存读回一致 | allowed.json 读不出来 / 读回人数对不上：重新勾选保存 |
| 4 | 白名单不为空 | 白名单是空的：先勾人并保存 |
| 5 | 危险动作默认全关 | 有危险开关开着：列出来，确认是你亲手开的再留着 |
| 6 | 每日预算不超总闸 | 开着的对外动作每日合计超过总闸 20 次：调小某个次数或调大总闸 |
| 7 | 续火花没有人快到期 | 有人超过预警天数没联系：火花快断了 |
| 8 | 陌生人私信开关状态 | 开着：陌生人也能收到回复，确认再留着 |
| 9 | 发片状态 | 开关开了但每天 0 次：发不出去，改次数或关掉 |
| 10 | AstrBot 互通状态 | 桥开了但没填 token：启动会被拒绝 |
| 11 | 定时巡检状态 | 只报状态，不判不通过 |
| 12 | 风控状态 | 暂停中：所有写动作已停手，去 Edge 确认后解除 |
| 13 | 大肥鱼记忆互通 | inbox.md 写不进去：检查 `~/.dsh-fish/` 权限；还没分享过报 unknown，不算失败 |

## v0.3.0：5 个包（全部 20 项建议都做进去了）

| 包 | 总开关默认 | 里面有什么 |
|---|---|---|
| 🎯 **核心**（常驻，不能关） | 开 | 刷抖音、回白名单私信、自主选片、日报、陌生人私信（单独开关）、AstrBot 桥（单独开关） |
| 💬 **互动** | 关 | 点赞、评论、评论 @ 人（@评论独立计数）、分享（按兴趣挑人）、收藏视频、表情包/贴纸、续火花、回自己视频评论 |
| 🔍 **发现** | 关 | 热榜、关键词搜索、关注列表、指定博主、来源多选、创作者诊断（基础版）、我的作品/数据总览 |
| 🎬 **发片** | 关 | 发视频、默认存草稿、标题模板 `{date}` 替换、默认话题、接 ComfyUI 取最新成片 |
| 🛡️ **安全** | 关 | 谷时自动刷（中午 12–14 / 夜间 00:30–08:30）、定时巡检（30 分钟 ±20% 抖动）、风控提醒（限流/验证码立刻停手）、登录状态、**一键清理**、抖音专属记忆 |

另外补齐的：看片 OCR（Windows 自带思路）+ 音轨转写（Whisper 本地，失败跳过不假装看完）、长视频阈值（超 60 分钟划走、超 5 分钟跳着看）、静默观看（持续静音、可最小化）、动作轮转（同一视频一天内点赞/评论/分享/收藏只做其一）。

**包关了 = 那个包的工具直接拒绝（`package-disabled`），不加载、不跑定时器。** 想用哪个包，先在设置页打开它的总开关，再开里面的小开关。

## 功能（33 个工具）

| 包 | 工具 | 说明 |
|---|---|---|
| 核心 | `dy_watch` | 专用 Edge 刷抖音一轮（默认 10 分钟），大肥鱼自己选片，记录到 `watch-log.jsonl` |
| 核心 | `dy_list_chats` | 读私信会话，写入 `chats.json`（选人页的勾选来源） |
| 核心 | `dy_dm_reply` / `dy_dm_reply_stranger` | 只回 `allowed.json` 里勾选过的会话 / 回陌生人（单独开关，独立上限） |
| 核心 | `dy_daily_report` | 从本地记录生成 Markdown 日报，不额外调模型 |
| 核心 | `dy_astrbot_status` | 查看 AstrBot 桥的状态和今日计数 |
| 核心 | `dy_health_check` | 一键体检：真跑 13 项检查，返回通过几项、不通过哪几项及原因 |
| 核心 | `dy_fish_share` | 把当天日报摘要分享给大肥鱼：往 `~/.dsh-fish/inbox.md` 追加一行（只追加），同时记进抖音专属记忆。单向分享，不是实时对话 |
| 互动 | `dy_like` / `dy_comment` | 点赞 / 评论当前视频；同一视频只做一次，动作轮转 |
| 互动 | `dy_comment_mention` | 发一条带 @ 的评论（@设置页里填的那个人），@评论独立计数 |
| 互动 | `dy_share` | 按兴趣把当前视频分享给白名单里的具体人；不群发；同一视频 + 同一人只分享一次 |
| 互动 | `dy_favorite` | 收藏当前视频；同一视频只收藏一次 |
| 互动 | `dy_sticker` | 按关键词从收藏的表情包里挑；没有收藏就发兜底文字，绝不假装发表了贴纸 |
| 互动 | `dy_collect_sticker` | 收藏一个表情包到本地 `stickers.json`（名字 + 关键词） |
| 互动 | `dy_spark` | 给白名单好友续火花，发一句一言随机文案；快断会预警 |
| 互动 | `dy_reply_own_comments` | 回自己视频下的新评论（只看最近 N 天、每次几条、随机/顺序、同人只回一次） |
| 发现 | `dy_hot` / `dy_search` / `dy_following` / `dy_creator_videos` | 热榜 / 关键词搜视频 / 关注列表 / 指定博主（给主页链接） |
| 发现 | `dy_watch_sources` | 按设置页勾的来源（推荐流/热榜/搜索/关注/指定博主）刷一轮 |
| 发现 | `dy_diagnose_creator` | 创作者诊断（基础版）：摆播放/点赞/评论/完播 + 可能原因，不编流量池、不编账号分 |
| 发现 | `dy_my_posts` | 看我自己发的作品和每条数据（读不到的数记 null，不编） |
| 发片 | `dy_post` | 发一条抖音视频；必须给本地视频文件（mp4 / mov / webm / mkv / avi，< 2 GB） |
| 发片 | `dy_publish_draft` | 记为草稿：标题按模板 `{date}` 替换、带默认话题；只记草稿不上传，正式发布去创作者中心 |
| 发片 | `dy_comfyui_latest` | 取 ComfyUI 输出目录里最新的 `.mp4` 成片 |
| 安全 | `dy_patrol` | 跑一次定时巡检：看谷时窗口、记一次巡检、返回下次间隔 |
| 安全 | `dy_login_status` | 查抖音登录状态：已登录 / 未登录 / 要验证码 |
| 安全 | `dy_cleanup` | 一键清理：删 30 天前的缩略图 / 音轨 / 老日报（天数可设） |
| 安全 | `dy_memory` | 抖音专属记忆（`memory/YYYY-MM.md`）：记一句 / 读最近的 |
| 安全 | `dy_risk_status` | 看风控状态；`clear=true` 解除暂停（先去 Edge 里人工确认没事） |
| 安全 | `dy_analyze_video` | 看片分析：长视频阈值、静默/最小化、OCR 与转写是否可用 |

## 默认值（全部存在 `config.json`，设置页可改）

```json
{
  "version": 4,
  "packages": { "core": { "enabled": true }, "interact": { "enabled": false }, "discover": { "enabled": false }, "publish": { "enabled": false }, "safety": { "enabled": false } },
  "autoComment": { "enabled": false, "perDay": 3 },
  "autoLike": { "enabled": false, "perDay": 10 },
  "strangerReply": { "enabled": false, "perDay": 3 },
  "caps": { "dmReplyPerDay": 5, "dmReplyPerContactPerDay": 1, "sharePerDay": 3, "likePerDay": 10, "commentPerDay": 3, "postPerDay": 0, "favoritePerDay": 5, "stickerPerDay": 5, "sparkPerDay": 3, "replyOwnPerDay": 10, "replyOwnPerRun": 3, "mentionPerDay": 3, "totalOutwardPerDay": 20 },
  "share": { "enabled": false },
  "autoPost": { "enabled": false, "perDay": 0 },
  "watch": { "autoChoose": true, "minutesPerRound": 10, "silent": true, "minimize": false, "skipOverMin": 60, "skimOverMin": 5, "ocr": false, "transcript": false, "watchBeforeAct": true },
  "astrbot": { "enabled": false, "port": 8766, "token": "", "webhookUrl": "" },
  "commentMention": { "enabled": false, "perDay": 3, "mentionName": "" },
  "favorite": { "enabled": false, "perDay": 5 },
  "sticker": { "enabled": false, "perDay": 5 },
  "spark": { "enabled": false, "perDay": 3, "times": ["08:00"], "warnDays": 1, "messages": ["在呢", "今天看了个好玩的", "火花别断呀"] },
  "replyOwn": { "enabled": false, "perDay": 10, "perRun": 3, "days": 3, "random": true, "oncePerUser": false },
  "discover": { "sources": { "feed": true, "hot": false, "search": false, "following": false, "creators": false }, "keywords": [], "creators": [] },
  "publish": { "draftDefault": true, "titleTemplate": "大肥鱼的日常 {date}", "defaultTags": "" },
  "comfyui": { "enabled": false, "url": "http://127.0.0.1:8188", "outputDir": "" },
  "valley": { "enabled": false, "noon": true, "night": true, "perDay": 5, "pickPerRound": 2 },
  "patrol": { "enabled": false, "intervalMin": 30, "jitterPct": 20 },
  "risk": { "enabled": true, "paused": false, "lastRisk": null },
  "cleanup": { "enabled": true, "retentionDays": 30 },
  "memory": { "enabled": false }
}
```

注意：除核心包外，所有写动作**默认全是关的**，想用必须先开包总开关、再开小开关。开关在代码里也强制执行——只改页面不改配置没用。分享在 v0.3.1 起也是默认关（原来是默认开）。

## 要求

- Windows（本插件 `os` 声明为 `win32`，Edge + 抖音电脑版只在 Windows 上验证过思路）
- Microsoft Edge（系统自带，用 `channel: 'msedge'`，不用另外下载浏览器）
- Node.js ≥ 22.13，DSH `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.2 <0.3.0-0`（与 LockyBee 1.4.7 相同的范围；DSH 0.2.2-rc.2 不在官方验证表里，见“未验证”）
- 一个支持看图的模型（刷视频要看画面才有意义）

## 安装 / 更新到 v0.4.0（预发布分支）

### 办法一：GitHub clone（现在就能在线装）

```powershell
git clone -b release/v0.4.0-douyin-enhanced --single-branch https://github.com/zhaoxj59/dsh-douyin-gonzalez.git C:\dsh-douyin-gonzalez-v040
cd C:\dsh-douyin-gonzalez-v040
npm install
npm test
dsh plugin --profile web add link:C:\dsh-douyin-gonzalez-v040
```

更新：进入该目录执行 `git pull origin release/v0.4.0-douyin-enhanced`，再运行 `npm install` 和 `npm test`。此版本与旧版插件同名，切换前请先备份旧插件目录；不要删除 DSH 的插件数据目录。

### 办法二：npm 在线安装（还没发布，先别跑）

代码已按 npm 发布要求准备好（name/version/files/engines/license/repository/homepage/bugs 齐全），但**还没发布到 npm**：发布要用户自己的 npm 账号登录一次、跑 `npm publish`，没有用户的 npm 账号/Token，这一步做不了。发布后安装命令会是：

```powershell
dsh plugin --profile web add dsh-douyin-gonzalez@0.4.0
```

等 DSH 市场收录后，也可以直接在市场里搜 `dsh-douyin-gonzalez` 安装——同样还没收录，别去搜了，搜不到。

### 打 GitHub Release（给仓库打 tag）

```powershell
cd C:\dsh-douyin-gonzalez
git tag v0.4.0
git push origin v0.4.0
gh release create v0.4.0 --title "v0.4.0" --notes "互动总额度强制拦截、商业内容过滤、平台挑战熔断"
```

### 本地自检

```powershell
cd <本插件目录>
pnpm install
node selfcheck.mjs
```

`selfcheck.mjs` 不需要 DSH、不用登录抖音、不用联网（除 `pnpm install` 本身），跑完应全部 PASS。

DSH Desktop：应用 → 桌面插件，填 `dsh-douyin-gonzalez@0.4.0`（未发布到 npm 时用 link 方式，见下），**完全退出 DSH 再重新打开**。

```powershell
dsh plugin --profile web add link:C:\path\to\dsh-douyin-gonzalez
dsh plugin --profile desktop add link:C:\path\to\dsh-douyin-gonzalez
```

从 v0.3.1 升级：直接覆盖目录、`git pull` 或重装即可。`config.json` 不用迁移（还是 v4），所有开关、上限、白名单都保留。新增：登录挪到核心包最上面、改完自动保存、体检多 1 项（大肥鱼记忆互通）、新工具 `dy_fish_share`。

从 v0.3.0 升级：直接覆盖目录、重装即可。`config.json` 会从 v3 读成 v4：**分享改成默认关——之前开着分享的，升级后分享会停掉，要重新在设置页 → 互动包打开“自行分享”开关才能继续用**（次数还是原来的 3 次/天）。其他开关和上限都保留。`allowed.json` v2 不变（兴趣还在）。

从 v0.2.0 升级：直接覆盖目录、重装即可。`allowed.json` v2 不变（兴趣还在）；`config.json` v2 会被读成 v4（原来的开关和上限都保留，5 个包默认除核心外全关——原来开着的点赞/评论/发视频，升级后要先在设置页打开“互动包”/“发片包”总开关才能继续用；分享同样会被改成默认关，要重新打开）。

## 第一次使用 / 设置页

设置页分 5 个标签页（🎯 核心 / 💬 互动 / 🔍 发现 / 🎬 发片 / 🛡️ 安全），顶部有 4 张状态卡：登录状态、今日已用、火花预警、风控状态，一眼看到。

1. 启动选人页（本机服务，只监听 127.0.0.1）：
   ```powershell
   npm run settings
   # 打开 http://127.0.0.1:8765/
   ```
2. 在 DSH 里让大肥鱼调 `dy_list_chats`（或在 Edge 里先打开抖音登录一次），私信列表会写进 `chats.json`，选人页点“刷新列表”就能看到。
3. **在选人页勾选要回的人，每人填兴趣（逗号分隔，例如 `美食,宠物`），再改好开关和次数 → 自动保存**（改完半秒后存，顶部会写“已自动保存 HH:MM:SS”）。保存会同时写 `allowed.json` 和 `config.json`，两个都读回核对。自动保存失败时顶部写红字原因，再点“💾 保存全部设置”手动存一次。
4. 在 Edge 里登录抖音：设置页 → 核心包最上面的“🔑 登录抖音” → 点“打开 Edge 登录抖音”，在 Edge 里扫码 / 过验证码。登录状态只留在本机 Edge 里。登录掉了，设置页会红字提醒；安全包里也有个“重新扫码登录”，同一个接口。
5. 让大肥鱼调 `dy_watch` 开始刷；有新私信时，它只能给已许可的人回；想用互动/发现/发片/安全包的功能，先开包总开关。

## 大肥鱼记忆互通（v0.3.4，单向分享）

大肥鱼 = DSH 里的大肥鱼 dsh-fish，家在 `~/.dsh-fish/`，`events.jsonl` 是它自己的记忆源，**这个插件绝不动它**。

- 工具 `dy_fish_share`（核心包，可带 `date` / `note`）：把当天日报摘要写两份——① 抖音专属记忆 `memory/YYYY-MM.md`；② 大肥鱼家里的 `~/.dsh-fish/inbox.md`，**只追加一行**，原有内容原样保留，不改、不删。内容写清来源是抖音插件、日期、看了几条、回了谁。
- 体检第 13 项“大肥鱼记忆互通”只读检查：inbox.md 能不能写、最近一次抖音分享是什么时候。还没分享过报 unknown，不算失败。
- **这只是单向分享记录，不是双向实时对话**：大肥鱼不会因为 inbox 里多了一条就主动来聊抖音。想让它聊，得在它的会话里问它（它读得到 inbox / 记忆）。

## DSH 原生面板（v0.3.4，真挂上了——v0.3.2 写法是错的）

v0.3.2 的面板挂接用错了 API（调了 DSH 里不存在的方法），所以设置里什么都没出现，**不是你装错了**。v0.3.4 按已上线插件同款写法重做了：`client.js` 是经典脚本、包在 `__ModuleLoader__.load` 里，factory 返回 `{ apply, inject: ['slots', 'locale'] }`，用 `ctx.slots.inject('settings.section', …)` 注册一个 React 组件，DSH 把它当设置页左侧“刷抖音（自写）”一项渲染出来；`package.json` 的 `dsh.client.inject` 也改成了 slots/locale/runtime/settings 四个。

面板里有：5 个包的开/关（核心包常驻）、今天回复数和登录状态、“打开 Edge 登录抖音”“一键体检”“刷新状态”“打开完整设置页”四个按钮。面板通过 fetch 跟本地设置服务说话，设置服务已加 CORS。**面板要显示内容，得先跑设置服务**（`npm run settings`，127.0.0.1:8765）；服务没跑时面板会红字提示，不假装有数据。5 个包的全部设置（几十个开关 + 数字 + 选人勾选）仍在完整网页设置页。原生面板挂不上时静默跳过，插件本体不受影响。

## 逐项测试方法（v0.3.0 新增）

1. **包总开关**：互动包关时调 `dy_like` 应返回 `package-disabled`；打开总开关 + 点赞开关后再调，才能过门。
2. **收藏**：互动包开、收藏开，调 `dy_favorite` 一次；同一视频再调应被去重挡下；日报里收藏数 +1。
3. **表情包**：先调 `dy_collect_sticker` 收藏一个（名字 + 关键词），再调 `dy_sticker` 带这个关键词，应挑中它；没收藏任何表情包时调 `dy_sticker`，应走兜底文字、不假装发表贴纸。
4. **续火花**：互动包开、续火花开，调 `dy_spark` 给一个白名单好友，应发一句随机文案；给不在白名单的人调，应被挡下；`lastContactAt` 给 3 天前，应返回 `warn: true`。
5. **回自己视频评论**：互动包开、回评论开，调 `dy_reply_own_comments`，应只回最近 3 天内的、每次最多 3 条。
6. **评论 @ 人**：互动包开、@ 开关开并填了名字，调 `dy_comment_mention`，应发 `@名字 + 文字`；@ 的计数和普通评论分开。
7. **热榜/搜索/关注/博主**：发现包开，调 `dy_hot` / `dy_search`（带 keyword）/ `dy_following` / `dy_creator_videos`（带博主主页链接），页面读不到就报 `selector-mismatch`，不编数据。
8. **创作者诊断**：调 `dy_diagnose_creator`，给播放 1000 / 点赞 5 / 完播 20%，应列出“点赞率偏低”“完播率偏低”；播放 0 时应提示可能在审核/限流，不编原因。
9. **我的作品**：发现包开，调 `dy_my_posts`，应返回最近发的视频列表，读不到的数是 null。
10. **发视频存草稿**：发片包开、发视频开关开、次数 ≥1，调 `dy_publish_draft` 给一个本地 .mp4，应记一条 `status: 'draft'` 进 post-log，不上传；标题里的 `{date}` 应被替换成当天日期。
11. **ComfyUI**：发片包开、ComfyUI 开并填了输出目录，调 `dy_comfyui_latest`，应返回目录里最新的 .mp4；没填目录应报 `no-output-dir`。
12. **谷时 + 巡检**：安全包开、谷时开，13:00 调 `dy_patrol` 应在谷时内；10:00 调应在谷时外、只记录不刷；返回的下次间隔应在 30 分钟 ±20% 内。
13. **风控**：调 `dy_risk_status` 看状态；风控暂停时调任何写动作（如 `dy_like`）应被 `risk-paused` 挡下；调 `dy_risk_status` 带 `clear: true` 解除后才能继续。
14. **登录状态**：安全包开，调 `dy_login_status`，应返回已登录/未登录/要验证码；未登录时设置页首页红字。
15. **一键清理**：调 `dy_cleanup` 带 `dryRun: true`，应先演练、列出会删的文件数，不真删。
16. **抖音记忆**：安全包开、记忆开，调 `dy_memory`（`mode: 'add'`）记一句，再调 `mode: 'read'` 应读回来。
17. **看片**：调 `dy_analyze_video`（`durationMin: 90`），应返回“超过划走阈值，直接划走”；`durationMin: 10` 应返回“跳着看”；开转写但本机没装 Whisper 时，应报转写不可用、内容未就绪，依赖内容的动作先跳过。
18. **动作轮转**：同一视频今天点赞过，再调评论应被 `rotation` 挡下。
19. **来源多选**：发现包开、勾了热榜 + 搜索，调 `dy_watch_sources`，返回里应列出勾的来源。
20. **AstrBot**：不变，见下。

## 逐项测试方法（v0.3.4 新增）

1. **友好报错**：在一台没装 playwright 的机器上调 `dy_login_status` 或在设置页点登录，应返回中文原因 + 一步一步的修法（`pnpm install`、看 `node_modules\playwright`），而不是只有 `Cannot find package 'playwright'` 一句英文。体检 Edge 那项也应带上这份中文办法。
2. **登录在第一页**：打开设置页，核心包最上面就是“🔑 登录抖音”一节；点吸顶目录条里的“🔑 登录抖音”，应跳到这一节。安全包里的“重新扫码登录”还在，点它和点核心包的按钮是一样的。
3. **自动保存**：改一个开关，等半秒，顶部应写“已自动保存 HH:MM:SS”；刷新页面，开关还在。勾一个人也一样。把设置服务停掉再改，应写红字失败，再点“保存全部设置”手动存。
4. **大肥鱼分享**：调 `dy_fish_share`，应往 `~/.dsh-fish/inbox.md` 追加一行 `【抖音分享】…`，旧内容原样还在；再调一次，应再追加一行，不覆盖。体检第 13 项应报最近一次分享的时间。
5. **DSH 原生面板**：完全退出 DSH 再重开，设置左侧应出现“刷抖音（自写）”一项，里面有 5 个包开关、登录/体检/完整设置页按钮；先跑 `npm run settings` 再打开面板，否则面板红字提示服务没跑。

## 逐项测试方法（v0.3.1 新增）

1. **一键体检**：在 DSH 里调 `dy_health_check`，或在设置页 → 核心包点“运行一键体检”，应返回 13 项检查、通过几项、不通过哪几项；默认配置下白名单是空的、allowed.json 还没有，至少这两项应报不通过并写原因。
2. **分享默认关**：新装（没有 config.json）时分享开关是关的，调 `dy_share` 应被挡下；把 v0.3.0 的 config.json（分享开着）放进来再加载，应被读成关的，再打开开关保存后才恢复。
3. **预算总闸**：把点赞 10 + 评论 3 + 分享 3 全打开，合计 16 没超总闸 20，体检预算项应通过；再把收藏 5 也打开，合计 21 超了，体检应报不通过并列出分项。
4. **吸顶目录条**：设置页往下翻到点赞那块，顶上的目录条应一直看得见，点“安全包”应跳到安全包。

## AstrBot 互通（v0.2.0，第 7 项，v0.3.0 不变）

默认关闭，不装 AstrBot 也完全不影响本插件。

### 开启

1. 设置页 → “安全”页 → “AstrBot 互通” → 打开开关，填一个自己编的长 token（例如 `douyin-bridge-xxxx`），端口默认 8766，**没填 token 桥拒绝启动**。
2. 重启 DSH（或重载插件），桥只监听 `127.0.0.1`，外网连不进来。
3. （可选）填 AstrBot 的事件接收地址（webhookUrl），插件会在看了视频 / 回了私信 / 分享 / 发视频后 POST 一个事件过去；webhook 挂了不影响刷和回。

### AstrBot → 本插件（带 token 才能调）

Header：`X-Douyin-Token: <你填的 token>`（或 `?token=…`）。

| 方法 | 地址 | Body | 说明 |
|---|---|---|---|
| GET | `/astrbot/status` | — | 桥状态 + 今日计数 |
| POST | `/astrbot/watch` | `{"minutes": 10}` | 触发 `dy_watch` |
| POST | `/astrbot/dm-reply` | `{"conversationId": "…", "text": "…"}` | 触发 `dy_dm_reply`（同样过白名单 + 上限） |
| POST | `/astrbot/report` | `{"date": "2026-11-15"}` | 触发 `dy_daily_report` |

例如（PowerShell）：

```powershell
$h = @{ "X-Douyin-Token" = "douyin-bridge-xxxx" }
Invoke-RestMethod http://127.0.0.1:8766/astrbot/status -Headers $h
Invoke-RestMethod http://127.0.0.1:8766/astrbot/watch -Method Post -Headers $h -Body '{"minutes":10}' -ContentType 'application/json'
```

### 本插件 → AstrBot（事件推送）

POST 到你填的 webhookUrl，JSON：

```json
{ "source": "dsh-douyin-gonzalez", "at": "2026-11-15T01:00:00.000Z", "type": "dm_replied", "conversationId": "conv-1" }
```

`type` 有：`watched` / `dm_replied` / `shared` / `posted`。推送失败只记日志，不重试、不影响主流程。

## 本地文件（都在数据目录里）

默认数据目录：`%USERPROFILE%\.dsh\douyin-duty\`（可用环境变量 `DSH_DOUYIN_DATA_DIR` 改）。

- `config.json` — v0.3.1 所有开关和每日上限（唯一权威来源）
- `allowed.json` — 许可名单 v2（按会话 id 匹配，带每人 `interests`）
- `chats.json` — 最近一次读到的私信会话
- `watch-log.jsonl` — 观看记录（含 `choiceScore` / `choiceReason` 选片理由）
- `reply-log.jsonl` — 回复记录（`sent` / `uncertain` / `failed`，陌生人带 `stranger: true`）
- `action-log.jsonl` — 点赞 / 评论 / 分享 / 收藏 / 表情包 / 续火花 / 回自己评论记录（用于每日计数、去重、动作轮转）
- `post-log.jsonl` — 发视频记录（每次发布 / 草稿都有）
- `spark-log.jsonl` — 续火花记录
- `risk-log.jsonl` / `risk-state.json` — 风控记录 / 暂停状态
- `stickers.json` — 收藏的表情包（名字 + 关键词）
- `my-posts.json` — 我的作品缓存
- `memory/YYYY-MM.md` — 抖音专属记忆
- `daily-report.md` — 当天日报
- `edge-profile/` — 专用 Edge 的 profile（登录状态在这里）

## 安全规则（写死在代码里）

- 包总开关：关了的包，工具直接拒绝，不加载、不跑定时器。
- 风控暂停：限流 / 验证码时所有写动作停手，记日志，不自动重发；解除要人工确认。
- 不回陌生人：开关默认关闭；开了也有独立每日上限，和白名单分开计数。
- 评论、点赞、发视频、AstrBot 默认全关；发视频没有本地文件坚决不发。
- 分享只给白名单里兴趣匹配的人，不群发；同一视频 + 同一个人只分享一次，永久去重。
- 同一视频一天内只做一种动作（动作轮转）。
- 每人每天 / 全天 / 各类动作的上限都在代码里按天强制执行，超了就挡下。
- 发送 / 评论 / 分享结果无法确认时只记 `uncertain`，**不自动重发**，人工在 Edge 里核对。
- 看片层（OCR / 转写）不可用时，依赖内容的动作先跳过，不假装看完。
- 不保存、不发送任何账号密码 / Cookie。
- AstrBot 桥只监听 127.0.0.1，必须带 token；没 token 拒绝启动。

## 格式来源

- DSH 官方文档《Package and install a plugin》：`dsh.bundle.patch` + `cordis.patch.yml` + `name` / `inject = ['tools']` / `apply(ctx)` + `ctx.tools.register(defineTool(...))`。
- LockyBee/dsh-douyin-agent 1.4.7 的 `package.json`（`engines.dsh`、`dsh.client.platform: web`、`exports`）和 `cordis.bundle.yml`（`- insert: [{id, name}]`）——只参考了格式，没有复制它的代码。

## 已验证 / 未验证

已验证（本机 Linux，Node v24）：
- `node --check` 全部 JS 文件通过
- `node selfcheck.mjs` 全部通过（见本节末尾的最新数字）：manifest、33 个工具及包归属、设置页（5 个标签页 + 顶部状态卡 + 全部新分区）、config v4 默认值 + 往返 + 越界截断 + v2/v3 迁移、allowed.json v2 带兴趣往返、陌生人门（关时拒绝）、各类上限强制执行、动作轮转、分享按兴趣挑人 + 永久去重、发视频门（无文件 / 非视频 / 找不到文件都拒绝）、收藏/表情包/续火花/回自己评论/@评论各门、发现来源与诊断、标题模板与 ComfyUI 取最新文件、谷时窗口（13:00 在内、10:00 在外）、巡检抖动、风控暂停与解除、抖音记忆写读、看片阈值与转写不可用、AstrBot 默认关闭 + 无 token 拒绝启动、日报含收藏/续火花数、一键体检 13 项真跑、分享默认关
- 设置服务真实跑通过：`GET /` 200；`GET /api/config` → `POST` 改互动包开 / 发现包开 / 点赞 7 条 / 续火花 2 次 → `GET` 读回一致；`POST /api/allowed` 带兴趣保存 → 读回一致；`GET /api/status`（含风控与登录状态）、`/api/memory`、`/api/cleanup`（演练）、`/api/risk/clear` 均返回 200

未验证（这台 Linux 虚拟机做不到，需在用户 Windows 云电脑上做）：
- 真实 DSH Desktop 0.2.2-rc.2 里安装、加载、33 个工具调用
- 真实 Edge 登录抖音、刷视频、私信列表读取、真实回一条私信、评论 / 点赞 / 分享 / 收藏 / 续火花 / 发视频各一次
- 真实 AstrBot 安装并调通桥（AstrBot 本身不在本机）
- 真实 ComfyUI 安装并取最新成片（ComfyUI 不在本机）
- DSH 0.2.2-rc.2 的客户端设置页 API（`client.js` 只做了尽力而为的挂接；能保证工作的选人页是本地 `http://127.0.0.1:8765/`）
- 抖音页面选择器（`lib/browser.mjs` 的 SELECTORS 是按公开页面结构写的 best-effort，页面一变就可能报 `selector-mismatch`，这是有意设计的：宁可报错也不假装成功）
- Windows OCR 与本地 Whisper 转写（本机没有，`dy_analyze_video` 会如实报不可用）
