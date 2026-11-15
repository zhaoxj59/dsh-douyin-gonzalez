// v0.3.2 大肥鱼互通（最小可用，单向分享记录）。
// 机器人 = DSH 里的大肥鱼 dsh-fish，家在 ~/.dsh-fish/，
// events.jsonl 是它自己的记忆源，绝不动。
// 这个插件只做两件事，都是“只追加、不改、不删”：
// 1. 把抖音日报 / 看片 / 私信摘要写进抖音专属记忆
// memory/YYYY-MM.md（复用 lib/safety.mjs 的写法）；
// 2. 再往大肥鱼家里的 inbox.md 追加一条，格式固定，
// 写清来源是抖音插件、日期、看了几条、回了谁。
// 这只是单向分享记录，不是双向实时对话：大肥鱼不会因为
// inbox 里多了一条就主动来聊抖音，想让它聊，得在它的
// 会话里问它（它读得到 inbox / 记忆）。
// fishDir 参数只给自检用（指到临时目录），正常不传就用
// ~/.dsh-fish/。
import fs from 'node:fs';
import path from 'node:path';
import { homedir} from 'node:os';

export const FISH_SHARE_TAG = '\u3010\u6296\u97f3\u5206\u4eab\u3011';

export function fishHomeDir(override) {
if (override) return path.resolve(override);
if (process.env.DSH_FISH_HOME) return path.resolve(process.env.DSH_FISH_HOME);
return path.join(homedir(), '.dsh-fish');
}

export function fishInboxFile(fishDir) {
return path.join(fishHomeDir(fishDir), 'inbox.md');
}

// 只追加：文件不存在就建一个带一句话说明的头，存在就原样保留
// 全部旧内容，只在末尾加一行。绝不重写、不删。
export function shareToFish(dataDir, summary, { fishDir} = {}) {
const home = fishHomeDir(fishDir);
const file = fishInboxFile(fishDir);
const line = `${FISH_SHARE_TAG} ${summary.date?? new Date().toISOString().slice(0, 10)}：今天看了 ${summary.watched?? 0} 条视频，回了 ${summary.replies?? 0} 条私信${summary.replyNames?.length? `（${summary.replyNames.join('、')}）`: ''}，点赞 ${summary.liked?? 0} 次，评论 ${summary.commented?? 0} 条，分享 ${summary.shared?? 0} 次，发视频 ${summary.posted?? 0} 条。来源：抖音插件 dsh-douyin-gonzalez。${summary.note? `备注：${String(summary.note).slice(0, 200)}`: ''}\n`;
fs.mkdirSync(home, { recursive: true});
if (!fs.existsSync(file)) {
fs.writeFileSync(file, '# 大肥鱼的收件箱\n\n（抖音插件往这里追加分享记录，只追加一行，不改旧内容。）\n', 'utf8');
}
fs.appendFileSync(file, line, 'utf8');
return { ok: true, file, line: line.trim(), sharedAt: new Date().toISOString()};
}

// 只读检查（体检用）：inbox.md 能不能写、最近一条抖音分享是什么时候。
// 家目录不存在 = 还没分享过，报 unknown，不算失败。
export function fishShareStatus({ fishDir} = {}) {
const home = fishHomeDir(fishDir);
const file = fishInboxFile(fishDir);
if (!fs.existsSync(home)) {
return { ok: true, status: 'unknown', file, detail: `大肥鱼的家目录 ${home} 不存在（可能这台机器上没跑过大肥鱼）：还没分享过，不算失败。先让大肥鱼跑起来，再用 dy_fish_share 分享一次。`};
}
let writable = false;
try { fs.accessSync(home, fs.constants.W_OK); writable = true;} catch { writable = false;}
if (!writable) {
return { ok: false, status: 'fail', file, detail: `大肥鱼的家目录 ${home} 写不进去（权限问题）：分享写不进去，先检查这个文件夹的权限。`};
}
if (!fs.existsSync(file)) {
return { ok: true, status: 'unknown', file, detail: 'inbox.md 还没有（还没分享过）：用 dy_fish_share 分享一次后，这里会记下最近一次分享的时间。'};
}
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes(FISH_SHARE_TAG));
if (!lines.length) {
return { ok: true, status: 'unknown', file, detail: 'inbox.md 里还没有抖音分享记录：用 dy_fish_share 分享一次后，这里会记下最近一次分享的时间。'};
}
return { ok: true, status: 'pass', file, lastShare: lines[lines.length - 1].trim(), detail: `最近一次抖音分享：${lines[lines.length - 1].trim()}`};
}
