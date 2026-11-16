// Conservative caption-only commercial-content filter.
// It skips explicit ad/sales signals, but deliberately preserves ordinary
// un-sponsored reviews, unboxings and hands-on experience captions.
const EXPLICIT_SPONSOR = [
  /广告合作/, /商业推广/, /品牌合作/, /赞助内容/, /推广合作/, /付费推广/,
  /广告植入/, /商务合作/, /品牌赞助/,
];
const PURCHASE_CTA = [
  /点击购买/, /立即购买/, /马上下单/, /去下单/, /下单链接/,
  /购物车/, /小黄车/, /商品橱窗/, /进店购买/, /店铺链接/,
  /领券购买/, /优惠券.*购买/, /直播间.*(?:拍|买|下单)/,
  /限时秒杀/, /全网最低价/, /拍一发三/, /私信.*(?:购买|下单|领券)/,
];
const REVIEW_CONTEXT = [
  /测评/, /评测/, /开箱/, /使用体验/, /真实体验/, /实测/,
  /优缺点/, /横向对比/, /值不值得买/, /长期使用/,
];

export function classifyCommercialCaption(caption = '') {
  const text = String(caption ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { skip: false, reason: 'empty-caption', confidence: 'low' };
  const sponsor = EXPLICIT_SPONSOR.find((re) => re.test(text));
  if (sponsor) return { skip: true, reason: 'explicit-sponsored-content', confidence: 'high' };
  const cta = PURCHASE_CTA.find((re) => re.test(text));
  if (cta) return { skip: true, reason: 'direct-shopping-call-to-action', confidence: 'high' };
  // Product mentions alone are not enough to classify an item as an ad.
  const review = REVIEW_CONTEXT.some((re) => re.test(text));
  if (review) return { skip: false, reason: 'review-or-experience-preserved', confidence: 'medium' };
  return { skip: false, reason: 'no-explicit-commercial-signal', confidence: 'low' };
}
