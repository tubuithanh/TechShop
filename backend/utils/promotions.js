// Tính khuyến mãi tự động (Promotion) và phạm vi mã giảm giá (Voucher) cho 1 giỏ / đơn hàng.
// Dùng chung cho: đặt hàng online, xem trước tổng tiền (quote), bán tại quầy (POS), kiểm tra mã.
const Promotion = require('../models/Promotion');
const User = require('../models/User');
const { getLoyaltyConfig, tierFor } = require('./loyalty');

const ids = (list) => (list || []).map(String);
const hasAny = (list) => Array.isArray(list) && list.length > 0;

// Hạng thành viên hiện tại của khách (null = khách vãng lai / không có tài khoản)
async function customerTier(userId, session) {
  if (!userId) return null;
  const user = await User.findById(userId, 'loyaltyPoints', { session }).lean();
  if (!user) return null;
  const config = await getLoyaltyConfig();
  // Tắt chương trình thành viên thì không còn khái niệm hạng -> ưu đãi theo hạng không áp dụng
  if (!config.enabled) return null;
  const tier = tierFor(user.loyaltyPoints, config);
  return { key: tier.key, name: tier.name };
}

// Sản phẩm có thuộc phạm vi danh mục / thương hiệu / sản phẩm của chương trình không
function productInScope(rule, product) {
  if (!product) return false;
  switch (rule.scope) {
    case 'categories': return ids(rule.categoryIds).includes(String(product.categoryId));
    case 'brands': return ids(rule.brandIds).includes(String(product.brandId));
    case 'products': return ids(rule.productIds).includes(String(product._id));
    default: return true;
  }
}

// Điều kiện chung: chi nhánh + hạng khách
function audienceMatches(rule, { storeId, tierKey }) {
  if (hasAny(rule.storeIds) && !ids(rule.storeIds).includes(String(storeId))) return false;
  if (hasAny(rule.tierKeys) && !(tierKey && rule.tierKeys.includes(tierKey))) return false;
  return true;
}

// Số tiền giảm của 1 chương trình cho 1 dòng hàng (đơn giá × số lượng)
function promotionAmount(promo, unitPrice, quantity) {
  let perUnit = promo.discountType === 'percent'
    ? (unitPrice * promo.discountValue) / 100
    : promo.discountValue;
  if (promo.discountType === 'percent' && typeof promo.maxDiscountPerItem === 'number') {
    perUnit = Math.min(perUnit, promo.maxDiscountPerItem);
  }
  return Math.round(Math.min(perUnit, unitPrice) * quantity);
}

// Chương trình đang chạy và CÒN suất / còn ngân sách
async function activePromotions(session) {
  const now = new Date();
  return Promotion.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $and: [
      { $or: [{ usageLimit: { $in: [0, null] } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
      { $or: [{ budget: { $in: [0, null] } }, { $expr: { $lt: ['$usedAmount', '$budget'] } }] }
    ]
  }, null, { session }).lean();
}

const remainingBudget = (p) => (p.budget > 0 ? p.budget - (p.usedAmount || 0) : Infinity);

// items: [{ productId, unitPrice, quantity }]; productMap: Map(id -> product có categoryId/brandId)
// Trả về: lineDiscounts (mảng số tiền giảm từng dòng), applied (tổng theo từng chương trình), total
function applyPromotions(items, productMap, promotions, ctx) {
  let usable = promotions.filter((p) => audienceMatches(p, ctx));
  // Chương trình mà tổng giảm của đơn này vượt ngân sách còn lại -> không áp dụng, tính lại với các chương trình khác
  for (;;) {
    const result = computeBest(items, productMap, usable);
    const over = result.applied.find((a) => a.amount > remainingBudget(usable.find((p) => String(p._id) === String(a.promotionId))));
    if (!over) return result;
    usable = usable.filter((p) => String(p._id) !== String(over.promotionId));
  }
}

function computeBest(items, productMap, usable) {
  const appliedMap = new Map();
  const lineDiscounts = items.map((item) => {
    const product = productMap.get(String(item.productId));
    let best = null;
    let bestAmount = 0;
    for (const promo of usable) {
      if (!productInScope(promo, product)) continue;
      const amount = promotionAmount(promo, item.unitPrice, item.quantity);
      if (amount > bestAmount) { best = promo; bestAmount = amount; }
    }
    if (best) {
      const cur = appliedMap.get(String(best._id)) || { promotionId: best._id, name: best.name, campaign: best.campaign || '', amount: 0 };
      cur.amount += bestAmount;
      appliedMap.set(String(best._id), cur);
    }
    return bestAmount;
  });
  return { lineDiscounts, applied: [...appliedMap.values()], total: lineDiscounts.reduce((a, b) => a + b, 0) };
}

// Giữ suất / ngân sách cho các chương trình đơn đã dùng - lệnh có điều kiện: 2 đơn tranh suất cuối chỉ 1 đơn được.
// Trả về tên chương trình vừa hết suất (nếu có) để báo khách tải lại.
async function claimPromotions(applied, session, undo) {
  for (const a of applied) {
    const updated = await Promotion.findOneAndUpdate(
      {
        _id: a.promotionId,
        $and: [
          { $or: [{ usageLimit: { $in: [0, null] } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
          { $or: [{ budget: { $in: [0, null] } }, { $expr: { $lte: [{ $add: [{ $ifNull: ['$usedAmount', 0] }, a.amount] }, '$budget'] } }] }
        ]
      },
      { $inc: { usedCount: 1, usedAmount: a.amount } },
      { session }
    );
    if (!updated) return a.name;
    if (undo) undo.push(() => Promotion.updateOne({ _id: a.promotionId }, { $inc: { usedCount: -1, usedAmount: -a.amount } }));
  }
  return null;
}

// Trả lại suất / ngân sách khi đơn bị hủy / trả hàng
async function releasePromotions(order, session = null) {
  for (const a of order?.promotions || []) {
    if (!a.promotionId || !a.amount) continue;
    await Promotion.updateOne(
      { _id: a.promotionId, usedCount: { $gt: 0 } },
      [{ $set: { usedCount: { $subtract: ['$usedCount', 1] }, usedAmount: { $max: [0, { $subtract: [{ $ifNull: ['$usedAmount', 0] }, a.amount] }] } } }],
      { session }
    );
  }
}

// Kiểm tra phạm vi mã giảm giá. Trả về { error } hoặc { eligibleIndexes, eligibleTotal }
// lineTotals: tiền từng dòng SAU khuyến mãi (mã giảm giá tính trên số tiền khách thực trả)
function voucherScope(voucher, items, productMap, lineTotals, ctx) {
  if (hasAny(voucher.storeIds) && !ids(voucher.storeIds).includes(String(ctx.storeId))) {
    return { error: 'Mã giảm giá không áp dụng tại chi nhánh đã chọn' };
  }
  if (hasAny(voucher.tierKeys) && !(ctx.tierKey && voucher.tierKeys.includes(ctx.tierKey))) {
    return { error: 'Mã giảm giá chỉ dành cho hạng thành viên nhất định' };
  }
  const limited = hasAny(voucher.categoryIds) || hasAny(voucher.productIds);
  const eligibleIndexes = [];
  items.forEach((item, i) => {
    const product = productMap.get(String(item.productId));
    const ok = !limited
      || ids(voucher.productIds).includes(String(item.productId))
      || (product && ids(voucher.categoryIds).includes(String(product.categoryId)));
    if (ok) eligibleIndexes.push(i);
  });
  if (!eligibleIndexes.length) return { error: 'Giỏ hàng không có sản phẩm thuộc phạm vi áp dụng của mã này' };
  const eligibleTotal = eligibleIndexes.reduce((s, i) => s + lineTotals[i], 0);
  return { eligibleIndexes, eligibleTotal, limited };
}

// Đọc các danh sách phạm vi từ dữ liệu gửi lên: mảng ObjectId hợp lệ (bỏ trùng) + tierKeys (chuỗi)
function parseScopeLists(body, idFields) {
  const mongoose = require('mongoose');
  const data = {};
  for (const field of idFields) {
    const raw = body[field] ?? [];
    if (!Array.isArray(raw) || raw.length > 500) return { error: `Danh sách ${field} không hợp lệ` };
    const list = [...new Set(raw.map((v) => String(v?._id ?? v)))];
    if (list.some((v) => !mongoose.isValidObjectId(v))) return { error: `Danh sách ${field} có giá trị không hợp lệ` };
    data[field] = list;
  }
  const tiers = body.tierKeys ?? [];
  if (!Array.isArray(tiers) || tiers.length > 20 || tiers.some((t) => typeof t !== 'string' || !/^[a-z0-9_]{1,40}$/.test(t))) {
    return { error: 'Danh sách hạng thành viên không hợp lệ' };
  }
  data.tierKeys = [...new Set(tiers)];
  return { data };
}

module.exports = { claimPromotions, releasePromotions, parseScopeLists, customerTier, activePromotions, applyPromotions, voucherScope, productInScope, audienceMatches, promotionAmount };
