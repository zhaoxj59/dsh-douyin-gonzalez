// Hard enforcement for the daily combined outward-action budget.
// Only successfully sent actions count (actionCounts reads status === 'sent').
// DMs and publishing are intentionally outside this budget; they have their
// own independent controls. This gate is checked before each actual action.
import { actionCounts } from './store.mjs';

export const OUTWARD_ACTION_TYPES = Object.freeze([
  'like', 'comment', 'mention', 'share',
  'favorite', 'sticker', 'spark', 'reply-own',
]);

export function outwardActionCount(counts) {
  return OUTWARD_ACTION_TYPES.reduce((sum, type) => sum + Number(counts?.byType?.[type] ?? 0), 0);
}

export function outwardBudgetGate(dataDir, config) {
  const raw = Number(config?.caps?.totalOutwardPerDay ?? 20);
  const cap = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 20;
  const counts = actionCounts(dataDir);
  const used = outwardActionCount(counts);
  if (used >= cap) {
    return {
      ok: false,
      reason: 'total-outward-cap',
      used,
      cap,
      message: `今日对外互动总额度已达到上限 ${cap} 次（已成功执行 ${used} 次）。点赞、评论、@、分享、收藏、表情和续火花等操作均已停止；额度不会因重启清零。`,
    };
  }
  return { ok: true, used, cap, remaining: cap - used };
}
