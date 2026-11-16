// DM reply logic: allowlist gate + daily caps + no-resend on uncertainty.
// The model drafts the reply text; this module decides WHETHER it may
// be sent at all. Nothing here calls the model.
//
// v0.2.0: two separate gates.
//   - Allowed-list replies: replyTo() — unchanged from v0.1.0.
//   - Stranger replies: replyToStranger() — a SEPARATE switch
//     (config.strangerReply.enabled, default OFF) with its own daily
//     cap (config.strangerReply.perDay, default 3). Strangers are
//     NEVER replied to unless the user explicitly turns this on in
//     settings. Stranger counts are tracked separately from
//     allowed-list counts (reply-log entries carry stranger: true).
import { canReply, logReply, readJsonl, blockContact } from './store.mjs';
import { dataPaths } from './paths.mjs';
import { loadConfig } from './config.mjs';
import { sendDm } from './browser.mjs';

// Clear opt-out language is handled before any model call or send.
// Conservative matching intentionally prefers stopping contact over risking
// another unwanted message. The same helper is intended for the future poller.
const CONTACT_OPTOUT_PATTERNS = [
  /别再(?:给我)?发(?:私信|消息)/i,
  /不要再(?:联系|私信|给我发消息)/i,
  /请勿(?:再)?(?:联系|私信|发消息)/i,
  /停止(?:联系|私信|发消息)/i,
  /不想再收到(?:你)?(?:的)?(?:私信|消息)/i,
  /以后(?:别|不要)再联系/i,
  /别联系我/i,
  /do not (?:contact|message) me again/i,
  /stop (?:messaging|contacting) me/i,
  /please (?:do not|don't) (?:message|contact) me/i,
];
export function detectContactOptOut(text = '') {
  const value = String(text ?? '').trim();
  return CONTACT_OPTOUT_PATTERNS.some((pattern) => pattern.test(value));
}
export function handleContactOptOut(dataDir, { conversationId, text } = {}) {
  if (!detectContactOptOut(text)) return null;
  return blockContact(dataDir, conversationId, 'explicit-contact-opt-out');
}

// One poll cycle: list unread DMs (via the browser module), and for
// each unread message from an ALLOWED conversation, return a draft
// request for the model. Sending itself happens only through replyTo().
// Strangers are dropped here unless stranger reply is explicitly on.
export function filterReplyCandidates(dataDir, unread) {
  const config = loadConfig(dataDir);
  return (unread ?? []).filter((m) => {
    if (canReply(dataDir, m.conversationId).ok) return true;
    if (config.strangerReply.enabled) {
      return canReply(dataDir, m.conversationId, { stranger: true }).ok;
    }
    return false;
  });
}

export function hasProcessedDmEvent(dataDir, eventId) {
  if (!eventId) return false;
  return readJsonl(dataPaths(dataDir).replyLogFile).some((entry) =>
    entry?.eventId === String(eventId) && ['sent', 'uncertain'].includes(entry.status));
}

export async function replyTo(dataDir, { conversationId, text, eventId }) {
  if (hasProcessedDmEvent(dataDir, eventId)) return { ok: false, duplicate: true, reason: 'duplicate-event', message: '该私信事件已经发送或发送结果不确定，不重复发送。' };
  const gate = canReply(dataDir, conversationId);
  if (!gate.ok) return { ok: false, ...gate };
  const result = await sendDm(dataDir, { conversationId, text });
  if (result.sent) {
    logReply(dataDir, { conversationId, ...(eventId ? { eventId: String(eventId) } : {}), status: 'sent', text: String(text).slice(0, 200) });
    return { ok: true, sent: true, conversationId };
  }
  // Uncertain OR failed: log it, do NOT retry automatically.
  logReply(dataDir, {
    conversationId,
    ...(eventId ? { eventId: String(eventId) } : {}),
    status: result.uncertain ? 'uncertain' : 'failed',
    error: result.message ?? result.error ?? 'unknown',
    text: String(text).slice(0, 200),
  });
  return {
    ok: false,
    sent: false,
    uncertain: Boolean(result.uncertain),
    message: result.message ?? '发送失败，且未自动重发。',
  };
}

export async function replyToStranger(dataDir, { conversationId, text, eventId }) {
  if (hasProcessedDmEvent(dataDir, eventId)) return { ok: false, duplicate: true, reason: 'duplicate-event', message: '该私信事件已经发送或发送结果不确定，不重复发送。' };
  const config = loadConfig(dataDir);
  if (!config.strangerReply.enabled) {
    return { ok: false, reason: 'stranger-disabled', message: '陌生人私信回复未开启（默认关闭）。想回陌生人，先在设置页打开“陌生人私信回复”开关并设好每日条数。' };
  }
  const gate = canReply(dataDir, conversationId, { stranger: true });
  if (!gate.ok) return { ok: false, ...gate };
  const result = await sendDm(dataDir, { conversationId, text });
  if (result.sent) {
    logReply(dataDir, { conversationId, ...(eventId ? { eventId: String(eventId) } : {}), stranger: true, status: 'sent', text: String(text).slice(0, 200) });
    return { ok: true, sent: true, stranger: true, conversationId };
  }
  logReply(dataDir, {
    conversationId, ...(eventId ? { eventId: String(eventId) } : {}), stranger: true,
    status: result.uncertain ? 'uncertain' : 'failed',
    error: result.message ?? result.error ?? 'unknown',
    text: String(text).slice(0, 200),
  });
  return {
    ok: false, sent: false, stranger: true,
    uncertain: Boolean(result.uncertain),
    message: result.message ?? '发送失败，且未自动重发。',
  };
}
