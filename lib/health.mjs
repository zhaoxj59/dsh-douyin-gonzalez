// v0.3.2 一键体检 (dy_health_check / POST /api/health)，13 项。
// Really runs the checks against local state — no faked passes:
//   - Edge 登录：真的去专用 Edge 里探一次（dy_login_status 同款）。
//     在没有 Edge 的机器上（例如这台 Linux 自检机）报 unknown，
//     绝不假装已登录。调用方可以注入 probeLogin 做测试。
//   - 看片层：插件测不到 DSH 主模型是否支持看图（那是 DSH 侧的
//     模型），这里只查本机 OCR / 转写层是否就绪（lib/watching.mjs
//     同款口径），并在原因里写明这一点。
//   - 白名单 / 保存读回：只读 allowed.json，不改任何文件。
//   - 续火花到期：按 spark-log / reply-log 里最后一次联系时间算，
//     chats.json 里没有时间字段，没有记录的人算 unknown，不瞎报。
// 每项 status: pass | fail | unknown。ok = 没有 fail。
import fs from 'node:fs';
import { dataPaths } from './paths.mjs';
import { loadConfig } from './config.mjs';
import { loadAllowed, readJson, readJsonl } from './store.mjs';
import { analyzeVideo } from './watching.mjs';
import { riskState, patrolState } from './safety.mjs';
import { astrbotEnabled } from './astrbot.mjs';

// 对外动作（危险动作）清单：开关字段 → 显示名 → 每日次数来源。
export const DANGEROUS_ACTIONS = [
  { key: 'autoLike', label: '自行点赞', perDay: (c) => c.autoLike.perDay },
  { key: 'autoComment', label: '自行评论', perDay: (c) => c.autoComment.perDay },
  { key: 'commentMention', label: '评论 @ 人', perDay: (c) => c.commentMention.perDay },
  { key: 'share', label: '自行分享', perDay: (c) => c.caps.sharePerDay },
  { key: 'favorite', label: '自动收藏', perDay: (c) => c.favorite.perDay },
  { key: 'sticker', label: '私信发表情包', perDay: (c) => c.sticker.perDay },
  { key: 'spark', label: '自动续火花', perDay: (c) => c.spark.perDay },
  { key: 'replyOwn', label: '回自己视频评论', perDay: (c) => c.replyOwn.perDay },
  { key: 'strangerReply', label: '回复陌生人私信', perDay: (c) => c.strangerReply.perDay },
];

function check(id, name, status, detail) {
  return { id, name, status, detail };
}

// 默认登录探针：真去 Edge 里查，失败/没 Edge 都报 unknown，不抛错。
// v0.3.2: playwright 没装时，browser.mjs 抛出来的已经是中文原因 +
// 修法，这里原样透传，不再只剩英文原文。
async function defaultProbeLogin(dataDir) {
  try {
    const { checkLoginStatus } = await import('./browser.mjs');
    const res = await checkLoginStatus(dataDir);
    return { loggedIn: Boolean(res.loggedIn), needsCaptcha: Boolean(res.needsCaptcha), message: res.message ?? '' };
  } catch (e) {
    const { isPlaywrightMissingError, PLAYWRIGHT_FIX } = await import('./browser.mjs').catch(() => ({}));
    const msg = `探不到 Edge / 抖音登录状态：${e.message}`;
    return { loggedIn: null, needsCaptcha: false, message: isPlaywrightMissingError?.(e) ? `${msg}\n${PLAYWRIGHT_FIX}` : msg };
  }
}

export async function runHealthCheck(dataDir, config, { probeLogin = defaultProbeLogin, fishDir } = {}) {
  const cfg = config ?? loadConfig(dataDir);
  const paths = dataPaths(dataDir);
  const checks = [];

  // 1. Edge 已启动并登录抖音
  {
    let probe;
    try { probe = await probeLogin(dataDir); } catch (e) { probe = { loggedIn: null, message: `探针出错：${e.message}` }; }
    if (probe.loggedIn === true) {
      checks.push(check('edge-login', 'Edge 已启动并登录抖音', 'pass', probe.needsCaptcha ? '已登录，但页面提示要验证码，留意一下。' : '抖音已登录。'));
    } else if (probe.loggedIn === false) {
      checks.push(check('edge-login', 'Edge 已启动并登录抖音', 'fail', '抖音未登录：设置页 → 核心包点“打开 Edge 登录抖音”，在 Edge 里扫码。'));
    } else {
      checks.push(check('edge-login', 'Edge 已启动并登录抖音', 'unknown', probe.message || '没探到登录状态：Edge 可能没起来，打开一次设置页或调 dy_login_status 再体检。'));
    }
  }

  // 2. 看片层（OCR / 转写）是否就绪
  {
    const analyzed = analyzeVideo({ videoId: '', durationMin: 2 }, cfg);
    const note = '插件测不到 DSH 主模型是否支持看图（那是 DSH 侧的模型配置）；这里只查本机 OCR / 转写层。';
    if (analyzed.contentReady) {
      const bits = [];
      if (cfg.watch.ocr) bits.push('OCR 开着（Windows 自带）');
      if (cfg.watch.transcript) bits.push('转写开着');
      checks.push(check('vision', '看片层（OCR / 转写）', 'pass', bits.length ? `看片层就绪：${bits.join('、')}。${note}` : `看片层就绪：OCR 和转写都没开，动手前先真看片的开关是开的。${note}`));
    } else {
      const bad = [];
      if (analyzed.ocr.status === 'not-available') bad.push('OCR 开了但这台机器没有 Windows OCR');
      if (analyzed.transcript.status === 'not-available') bad.push('转写开了但本地 Whisper 没装');
      checks.push(check('vision', '看片层（OCR / 转写）', 'fail', `${bad.join('；')}。依赖内容的评论 / 转发会先跳过，不假装看完。${note}`));
    }
  }

  // 3. allowed.json 勾选 + 保存读回一致（只读，不写文件）
  {
    let raw = null;
    let parseError = null;
    try { raw = JSON.parse(fs.readFileSync(paths.allowedFile, 'utf8')); } catch (e) { parseError = e.message; }
    if (!raw) {
      checks.push(check('allowed-save', '许可名单保存读回一致', 'fail', parseError && fs.existsSync(paths.allowedFile)
        ? `allowed.json 读不出来（${parseError}）：文件可能坏了，先备份再重新勾选保存。`
        : 'allowed.json 还没有：在设置页勾选要回的人，改完会自动保存（半秒后存），保存后会立刻从文件再读一遍核对。'));
    } else if (!Array.isArray(raw.allowed)) {
      checks.push(check('allowed-save', '许可名单保存读回一致', 'fail', 'allowed.json 结构不对（里面没有 allowed 数组）：先备份再重新勾选保存。'));
    } else {
      const loaded = loadAllowed(dataDir);
      const dropped = raw.allowed.length - loaded.allowed.length;
      checks.push(dropped === 0
        ? check('allowed-save', '许可名单保存读回一致', 'pass', `文件里 ${raw.allowed.length} 人，读回 ${loaded.allowed.length} 人，一致。`)
        : check('allowed-save', '许可名单保存读回一致', 'fail', `文件里 ${raw.allowed.length} 人，读回只有 ${loaded.allowed.length} 人（有 ${dropped} 条 id 重复或为空被丢掉了），重新勾选保存一次。`));
    }
  }

  // 4. 白名单是否为空
  {
    const allowed = loadAllowed(dataDir).allowed;
    checks.push(allowed.length > 0
      ? check('whitelist', '白名单不为空', 'pass', `白名单里有 ${allowed.length} 人，回私信和分享都有人可选。`)
      : check('whitelist', '白名单不为空', 'fail', '白名单是空的：回私信和分享都没人可回 / 可分。先在设置页 → 核心包勾人并保存。'));
  }

  // 5. 危险动作是否默认全关
  {
    const on = DANGEROUS_ACTIONS.filter((a) => Boolean(cfg[a.key]?.enabled));
    checks.push(on.length === 0
      ? check('dangerous-off', '危险动作默认全关', 'pass', '点赞、评论、@人、分享、收藏、表情包、续火花、回自己评论、回陌生人私信，9 个危险开关全部关着。')
      : check('dangerous-off', '危险动作默认全关', 'fail', `这些危险动作开着：${on.map((a) => a.label).join('、')}。确认是你亲手开的再留着，否则关掉。`));
  }

  // 6. 每日预算：开着的对外动作次数合计 vs 总闸
  {
    const total = cfg.caps?.totalOutwardPerDay ?? 20;
    const parts = DANGEROUS_ACTIONS
      .filter((a) => a.key !== 'strangerReply' && Boolean(cfg[a.key]?.enabled))
      .map((a) => ({ label: a.label, perDay: Number(a.perDay(cfg)) || 0 }));
    const sum = parts.reduce((s, p) => s + p.perDay, 0);
    checks.push(sum <= total
      ? check('budget', '每日预算不超总闸', 'pass', `开着的对外动作每日合计 ${sum} 次，总闸 ${total} 次/天，没超。${parts.length ? `（${parts.map((p) => `${p.label}${p.perDay}`).join(' + ')}）` : '（一个对外动作都没开，合计 0。）'}`)
      : check('budget', '每日预算不超总闸', 'fail', `开着的对外动作每日合计 ${sum} 次，超过总闸 ${total} 次/天：${parts.map((p) => `${p.label}${p.perDay}`).join(' + ')}。把某个动作的每日次数调小，或把总闸调大。`));
  }

  // 7. 续火花：是否有人快到期了
  {
    if (!cfg.spark?.enabled) {
      checks.push(check('spark-due', '续火花没有人快到期', 'pass', '续火花没开，不用续，没人会断。'));
    } else {
      const allowed = loadAllowed(dataDir).allowed;
      const lastContact = new Map();
      for (const e of [...readJsonl(paths.sparkLogFile), ...readJsonl(paths.replyLogFile)]) {
        if (e?.status !== 'sent' || !e?.conversationId) continue;
        const at = new Date(e.at ?? 0).getTime();
        if (at > (lastContact.get(e.conversationId) ?? 0)) lastContact.set(e.conversationId, at);
      }
      const warnDays = cfg.spark.warnDays ?? 1;
      const due = allowed.filter((a) => {
        const last = lastContact.get(a.id);
        return last !== undefined && (Date.now() - last) / 86400000 >= warnDays;
      });
      const unknown = allowed.filter((a) => !lastContact.has(a.id));
      if (due.length) {
        checks.push(check('spark-due', '续火花没有人快到期', 'fail', `这些人超过 ${warnDays} 天没联系，火花快断了：${due.map((a) => a.name).join('、')}。${unknown.length ? `另有 ${unknown.length} 人没有联系记录，算不出。` : ''}`));
      } else if (unknown.length === allowed.length && allowed.length > 0) {
        checks.push(check('spark-due', '续火花没有人快到期', 'unknown', '白名单里的人都没有联系记录（没续过火花也没回过私信），算不出谁快断了。续一次之后就能算了。'));
      } else {
        checks.push(check('spark-due', '续火花没有人快到期', 'pass', `白名单里 ${allowed.length} 人，最近 ${warnDays} 天内都联系过，没人快断。`));
      }
    }
  }

  // 8. 陌生人私信开关状态
  {
    checks.push(!cfg.strangerReply?.enabled
      ? check('stranger', '陌生人私信开关状态', 'pass', '陌生人私信关着，只回白名单里的人。')
      : check('stranger', '陌生人私信开关状态', 'fail', `陌生人私信开着，每天最多 ${cfg.strangerReply.perDay} 条：陌生人也能收到回复。确认是你想要的再留着，否则关掉。`));
  }

  // 9. 发片状态
  {
    if (!cfg.autoPost?.enabled) {
      checks.push(check('publish', '发片状态', 'pass', '自行发抖音关着（每天 0 次），不会自己发视频。'));
    } else if ((cfg.autoPost.perDay ?? 0) > 0) {
      checks.push(check('publish', '发片状态', 'pass', `自行发抖音开着，每天最多 ${cfg.autoPost.perDay} 条；发片必须给本地视频文件，没文件不发。`));
    } else {
      checks.push(check('publish', '发片状态', 'fail', '发片开关开了，但每天次数是 0 条，发不出去：把次数改成大于 0，或者把开关关掉。'));
    }
  }

  // 10. AstrBot 互通状态
  {
    if (!cfg.astrbot?.enabled) {
      checks.push(check('astrbot', 'AstrBot 互通状态', 'pass', 'AstrBot 桥关着。'));
    } else if (!cfg.astrbot.token) {
      checks.push(check('astrbot', 'AstrBot 互通状态', 'fail', 'AstrBot 桥开了但没填 token，启动会被拒绝（无认证的本地接口比没有更危险）。填一个 token 再开。'));
    } else {
      checks.push(check('astrbot', 'AstrBot 互通状态', 'pass', `AstrBot 桥开着，端口 ${cfg.astrbot.port}，只监听 127.0.0.1 + token。`));
    }
  }

  // 11. 定时巡检
  {
    if (!cfg.patrol?.enabled) {
      checks.push(check('patrol', '定时巡检状态', 'pass', '定时巡检关着，不会自己跑。'));
    } else {
      const state = patrolState(dataDir);
      checks.push(check('patrol', '定时巡检状态', 'pass', `定时巡检开着，每 ${cfg.patrol.intervalMin} 分钟 ±${cfg.patrol.jitterPct}%，今天已跑 ${state.runsToday ?? 0} 次。`));
    }
  }

  // 12. 风控状态
  {
    const state = riskState(dataDir);
    checks.push(!state.paused
      ? check('risk', '风控状态', 'pass', '风控正常，没有暂停。')
      : check('risk', '风控状态', 'fail', `风控暂停中（${state.lastRisk ?? '限流/验证码'}，${state.at ?? ''}）：所有写动作已停手。去 Edge 里人工确认没事后，在设置页 → 安全包点“解除风控暂停”。`));
  }

  // 13. 大肥鱼记忆互通（v0.3.2）：只读检查 inbox.md 能不能写、
  // 最近一次抖音分享是什么时候。还没分享过报 unknown，不算失败。
  {
    const { fishShareStatus } = await import('./fish.mjs');
    const s = fishShareStatus({ fishDir });
    checks.push(check('fish-share', '大肥鱼记忆互通', s.status, s.detail));
  }

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail');
  const unknown = checks.filter((c) => c.status === 'unknown').length;
  const summary = failed.length
    ? `体检：${passed} 项通过、${failed.length} 项不通过${unknown ? `、${unknown} 项没测出来` : ''}。不通过的是：${failed.map((c) => `${c.name}（${c.detail}）`).join('；')}。`
    : `体检：${passed} 项通过${unknown ? `、${unknown} 项没测出来` : ''}，没有不通过的。${unknown ? `没测出来的是：${checks.filter((c) => c.status === 'unknown').map((c) => `${c.name}（${c.detail}）`).join('；')}。` : ''}`;
  return { ok: failed.length === 0, passed, failed: failed.length, unknown, total: checks.length, summary, checks };
}

export function healthSummaryText(result) { return result.summary; }
