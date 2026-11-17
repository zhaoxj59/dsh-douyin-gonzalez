import path from 'node:path';
import { dataPaths } from './paths.mjs';
import { replyTo, handleContactOptOut } from './dm.mjs';
import { loadConfig } from './config.mjs';
import { appendJsonl, canReply, isAllowed, readJsonl } from './store.mjs';
import { generateAurabotReply } from './aurabot-bridge.mjs';

const activeOutbound = new Set();
const activeInbound = new Set();

function eventRows(file, eventId) {
  return readJsonl(file).filter((entry) => entry?.eventId === String(eventId));
}
function appendState(file, eventId, conversationId, status, extra = {}) {
  appendJsonl(file, {
    at: new Date().toISOString(),
    eventId: String(eventId),
    conversationId: String(conversationId),
    status,
    ...extra,
  });
}
function alreadySentOrAmbiguous(rows) {
  const last = rows.at(-1);
  return last && ['sent', 'uncertain', 'sending', 'contact-opted-out', 'duplicate'].includes(last.status)
    ? last
    : null;
}

export async function sendFromAurabot(dataDir, payload = {}) {
  const eventId = String(payload.eventId ?? '').trim();
  const conversationId = String(payload.conversationId ?? '').trim();
  const text = String(payload.text ?? '').trim();
  const config = loadConfig(dataDir);
  if (!config.aurabotBridge?.enabled || !config.aurabotBridge?.autoProactive) {
    return { ok: false, error: 'aurabot-proactive-disabled', message: 'DSH 未启用 Aurabot 主动联系开关。' };
  }
  if (!eventId || !conversationId || !text) return { ok: false, error: 'missing-args', message: 'eventId、conversationId 和 text 均为必填项。' };
  if (eventId.length > 160 || conversationId.length > 200 || text.length > 2000) return { ok: false, error: 'invalid-size', message: '请求字段超过允许长度。' };
  if (activeOutbound.has(eventId)) return { ok: false, duplicate: true, error: 'duplicate-in-flight', message: '该发送事件正在处理。' };

  const dir = dataPaths(dataDir).dir;
  const file = path.join(dir, 'aurabot-outbound.jsonl');
  const previous = alreadySentOrAmbiguous(eventRows(file, eventId));
  if (previous) return { ok: false, duplicate: true, error: 'duplicate-event', message: '该 eventId 已发送、发送中或结果不确定，不会重复发送。', previous: previous.status };

  activeOutbound.add(eventId);
  try {
    appendState(file, eventId, conversationId, 'processing');
    // replyTo is the final DSH permission + quota + blocklist + send gate.
    const result = await replyTo(dataDir, { conversationId, text, eventId });
    appendState(file, eventId, conversationId,
      result.sent ? 'sent' : result.uncertain ? 'uncertain' : result.duplicate ? 'duplicate' : 'failed',
      { result });
    return result;
  } catch (error) {
    // A thrown error during a browser send is ambiguous; do not auto-retry.
    appendState(file, eventId, conversationId, 'uncertain', { error: String(error?.message ?? error).slice(0, 300) });
    return { ok: false, sent: false, uncertain: true, message: '发送流程异常，结果无法确认；已熔断本事件，不会自动重发。' };
  } finally {
    activeOutbound.delete(eventId);
  }
}

export async function replyWithAurabot(dataDir, config, payload = {}) {
  const eventId = String(payload.eventId ?? '').trim();
  const conversationId = String(payload.conversationId ?? '').trim();
  const message = String(payload.text ?? '').trim();
  if (!config?.aurabotBridge?.enabled || !config?.aurabotBridge?.autoReply) {
    return { ok: false, error: 'aurabot-auto-reply-disabled', message: 'DSH 未启用 Aurabot 桥接和自动回复。' };
  }
  if (!eventId || !conversationId || !message) {
    return { ok: false, error: 'missing-args', message: '自动回复必须提供 eventId、conversationId 和非空消息正文。' };
  }
  if (eventId.length > 160 || conversationId.length > 200 || message.length > 4000) {
    return { ok: false, error: 'invalid-size', message: 'eventId、conversationId 或消息正文超过允许长度。' };
  }
  if (activeInbound.has(eventId)) {
    return { ok: false, duplicate: true, error: 'duplicate-in-flight', message: '该私信事件正在处理，不会并发生成或发送。' };
  }

  const dir = dataPaths(dataDir).dir;
  const file = path.join(dir, 'aurabot-inbound.jsonl');
  activeInbound.add(eventId);
  let phase = 'processing';
  try {
    // A refusal must be persisted before any model call, even if this event
    // is delivered again by the browser poller.
    const optOut = handleContactOptOut(dataDir, { conversationId, text: message });
    if (optOut?.blocked) {
      appendState(file, eventId, conversationId, 'contact-opted-out', { reason: 'explicit-contact-opt-out' });
      return { ok: false, error: 'contact-opted-out', message: '检测到联系人明确拒绝继续联系，已加入永久拒绝联系名单，不生成或发送回复。' };
    }

    const previous = alreadySentOrAmbiguous(eventRows(file, eventId));
    if (previous) {
      return { ok: false, duplicate: true, error: 'duplicate-event', message: '该私信事件已发送、发送中或结果不确定，不会重复回复。', previous: previous.status };
    }

    // Do not send unapproved message content to Aurabot. Strangers are only
    // eligible when the separate DSH stranger-reply switch is explicitly on.
    const stranger = !isAllowed(dataDir, conversationId);
    if (stranger && !config.strangerReply?.enabled) {
      appendState(file, eventId, conversationId, 'permission-denied', { reason: 'not-allowed' });
      return { ok: false, error: 'not-allowed', message: '该会话不在 DSH 许可名单里；陌生人自动回复开关未开启，消息不会交给 Aurabot。' };
    }
    const gate = canReply(dataDir, conversationId, { stranger });
    if (!gate.ok) {
      appendState(file, eventId, conversationId, 'permission-denied', { reason: gate.reason });
      return { ok: false, ...gate };
    }

    appendState(file, eventId, conversationId, 'processing', { stranger });
    const recentMessages = Array.isArray(payload.recentMessages)
      ? payload.recentMessages.slice(-12).map((value) => String(value ?? '').trim().slice(0, 1000)).filter(Boolean)
      : [];
    phase = 'generation';
    const generated = await generateAurabotReply(config, {
      eventId,
      conversationId,
      senderId: String(payload.senderId ?? '').slice(0, 160),
      senderName: String(payload.senderName ?? '').slice(0, 80),
      text: message,
      recentMessages,
    });
    if (!generated?.ok || !String(generated.replyText ?? '').trim()) {
      appendState(file, eventId, conversationId, 'generation-failed', {
        error: String(generated?.message ?? 'Aurabot reply empty').slice(0, 300),
      });
      return generated?.ok === false
        ? generated
        : { ok: false, error: 'empty-reply', message: 'Aurabot 未生成有效回复。' };
    }

    phase = 'sending';
    appendState(file, eventId, conversationId, 'sending', { stranger });
    const sent = await replyTo(dataDir, {
      conversationId,
      text: generated.replyText,
      eventId,
      stranger,
    });
    const status = sent.sent ? 'sent' : sent.uncertain ? 'uncertain' : sent.duplicate ? 'duplicate' : 'send-failed';
    appendState(file, eventId, conversationId, status, {
      stranger,
      replyPreview: String(generated.replyText).slice(0, 200),
      result: sent,
    });
    return { ...sent, replyText: generated.replyText };
  } catch (error) {
    const uncertain = phase === 'sending';
    appendState(file, eventId, conversationId, uncertain ? 'uncertain' : 'generation-failed', {
      error: String(error?.message ?? error).slice(0, 300),
    });
    return {
      ok: false,
      sent: false,
      ...(uncertain ? { uncertain: true } : {}),
      error: uncertain ? 'send-result-uncertain' : 'aurabot-generation-failed',
      message: uncertain
        ? '浏览器发送阶段异常，结果无法确认；该事件已熔断，不会自动重发。'
        : 'Aurabot 生成阶段失败；没有发送私信，可在修复连接后重新处理该事件。',
    };
  } finally {
    activeInbound.delete(eventId);
  }
}
