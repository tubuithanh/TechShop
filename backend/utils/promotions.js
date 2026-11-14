// Tính khuyến mãi tự động (Promotion) và phạm vi mã giảm giá (Voucher) cho 1 giỏ / đơn hàng.
// Dùng chung cho: đặt hàng online, xem trước tổng tiền (quote), bán tại quầy (POS), kiểm tra mã.
// Khác nhau: Promotion tự áp dụng (không cần nhập mã), Voucher khách phải nhập / chọn mã.
const Promotion = require('../models/Promotion');
const User = require('../models/User');
const { getLoyaltyConfig, tierFor } = require('./loyalty'); // cấu hình + cách tính hạng thành viên

const ids = (list) => (list || []).map(String); // mảng ObjectId -> mảng chuỗi để so sánh
const hasAny = (list) => Array.isArray(list) && list.length > 0; // mảng có phần tử?

// Hạng thành viên hiện tại của khách (null = khách vãng lai / không có tài khoản)
async function customerTier(userId, session) {
  if (!userId) return null;
  const user = await User.findById(userId, 'loyaltyPoints', { session }).lean(); // chỉ lấy điểm
  if (!user) return null;
  const config = await getLoyaltyConfig();
  // Tắt chương trình thành viên thì không còn khái niệm hạng -> ưu đãi theo hạng không áp dụng
  if (!config.enabled) return null;
  const tier = tierFor(user.loyaltyPoints, config); // điểm -> hạng
  return { key: tier.key, name: tier.name };
}

// Sản phẩm có thuộc phạm vi danh mục / thương hiệu / sản phẩm của chương trình không
function productInScope(rule, product) {
  if (!product) return false;
  switch (rule.scope) {
    case 'categories': return ids(rule.categoryIds).includes(String(product.categoryId)); // theo danh mục
    case 'brands': return ids(rule.brandIds).includes(String(product.brandId)); // theo thương hiệu
    case 'products': return ids(rule.productIds).includes(String(product._id)); // theo sản phẩm cụ thể
    default: return true; // 'all': mọi sản phẩm
  }
}

// Điều kiện chung: chi nhánh + hạng khách
function audienceMatches(rule, { storeId, tierKey }) {
  if (hasAny(rule.storeIds) && !ids(rule.storeIds).includes(String(storeId))) return false; // giới hạn chi nhánh
  if (hasAny(rule.tierKeys) && !(tierKey && rule.tierKeys.includes(tierKey))) return false; // giới hạn hạng
  return true;
}

// Số tiền giảm của 1 chương trình cho 1 dòng hàng (đơn giá × số lượng)
function promotionAmount(promo, unitPrice, quantity) {
  let perUnit = promo.discountType === 'percent'
    ? (unitPrice * promo.discountValue) / 100 // giảm % trên mỗi sản phẩm
    : promo.discountValue; // giảm số tiền cố định mỗi sản phẩm
  if (promo.discountType === 'percent' && typeof promo.maxDiscountPerItem === 'number') {
    perUnit = Math.min(perUnit, promo.maxDiscountPerItem); // trần giảm mỗi sản phẩm
  }
  return Math.round(Math.min(perUnit, unitPrice) * quantity); // không giảm quá giá sản phẩm
}

// Chương trình đang chạy và CÒN suất / còn ngân sách
async function activePromotions(session) {
  const now = new Date();
  return Promotion.find({
    isActive: true,
    startDate: { $lte: now }, // đã bắt đầu
    endDate: { $gte: now }, // chưa kết thúc
    $and: [
      { $or: [{ usageLimit: { $in: [0, null] } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] }, // còn suất (0 = không giới hạn)
      { $or: [{ budget: { $in: [0, null] } }, { $expr: { $lt: ['$usedAmount', '$budget'] } }] } // còn ngân sách
    ]
  }, null, { session }).lean();
}

const remainingBudget = (p) => (p.budget > 0 ? p.budget - (p.usedAmount || 0) : Infinity); // ngân sách còn lại

// items: [{ productId, unitPrice, quantity }]; productMap: Map(id -> product có categoryId/brandId)
// Trả về: lineDiscounts (mảng số tiền giảm từng dòng), applied (tổng theo từng chương trình), total
function applyPromotions(items, productMap, promotions, ctx) {
  let usable = promotions.filter((p) => audienceMatches(p, ctx)); // chương trình áp dụng được cho khách + chi nhánh
  // Chương trình mà tổng giảm của đơn này vượt ngân sách còn lại -> không áp dụng, tính lại với các chương trình khác
  for (;;) { // lặp tới khi không còn chương trình vượt ngân sách (mỗi vòng bớt 1 -> chắc chắn dừng)
    const result = computeBest(items, productMap, usable);
    const over = result.applied.find((a) => a.amount > remainingBudget(usable.find((p) => String(p._id) === String(a.promotionId))));
    if (!over) return result;
    usable = usable.filter((p) => String(p._id) !== String(over.promotionId)); // loại chương trình vượt ngân sách
  }
}

// Mỗi dòng hàng chỉ nhận 1 chương trình - chương trình giảm NHIỀU NHẤT cho dòng đó (không cộng dồn)
function computeBest(items, productMap, usable) {
  const appliedMap = new Map(); // promotionId -> tổng tiền giảm của chương trình trong đơn
  const lineDiscounts = items.map((item) => {
    const product = productMap.get(String(item.productId));
    let best = null;
    let bestAmount = 0;
    for (const promo of usable) { // thử từng chương trình
      if (!productInScope(promo, product)) continue;
      const amount = promotionAmount(promo, item.unitPrice, item.quantity);
      if (amount > bestAmount) { best = promo; bestAmount = amount; } // giữ chương trình có lợi nhất
    }
    if (best) { // cộng dồn vào tổng của chương trình
      const cur = appliedMap.get(String(best._id)) || { promotionId: best._id, name: best.name, campaign: best.campaign || '', amount: 0 };
      cur.amount += bestAmount;
      appliedMap.set(String(best._id), cur);
    }
    return bestAmount; // số tiền giảm của dòng
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
          { $or: [{ usageLimit: { $in: [0, null] } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] }, // còn suất
          { $or: [{ budget: { $in: [0, null] } }, { $expr: { $lte: [{ $add: [{ $ifNull: ['$usedAmount', 0] }, a.amount] }, '$budget'] } }] } // cộng thêm vẫn không vượt ngân sách
        ]
      },
      { $inc: { usedCount: 1, usedAmount: a.amount } }, // giữ 1 suất + trừ ngân sách
      { session }
    );
    if (!updated) return a.name; // hết suất / hết ngân sách
    if (undo) undo.push(() => Promotion.updateOne({ _id: a.promotionId }, { $inc: { usedCount: -1, usedAmount: -a.amount } })); // hoàn tác thủ công (không có transaction)
  }
  return null; // giữ được hết
}

// Trả lại suất / ngân sách khi đơn bị hủy / trả hàng
async function releasePromotions(order, session = null) {
  for (const a of order?.promotions || []) {
    if (!a.promotionId || !a.amount) continue;
    await Promotion.updateOne(
      { _id: a.promotionId, usedCount: { $gt: 0 } },
      [{ $set: { usedCount: { $subtract: ['$usedCount', 1] }, usedAmount: { $max: [0, { $subtract: [{ $ifNull: ['$usedAmount', 0] }, a.amount] }] } } }], // không để ngân sách đã dùng âm
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
  const limited = hasAny(voucher.categoryIds) || hasAny(voucher.productIds); // mã chỉ cho 1 số sản phẩm / danh mục
  const eligibleIndexes = []; // vị trí các dòng được giảm
  items.forEach((item, i) => {
    const product = productMap.get(String(item.productId));
    const ok = !limited // mã chung: mọi dòng
      || ids(voucher.productIds).includes(String(item.productId)) // đúng sản phẩm
      || (product && ids(voucher.categoryIds).includes(String(product.categoryId))); // đúng danh mục
    if (ok) eligibleIndexes.push(i);
  });
  if (!eligibleIndexes.length) return { error: 'Giỏ hàng không có sản phẩm thuộc phạm vi áp dụng của mã này' };
  const eligibleTotal = eligibleIndexes.reduce((s, i) => s + lineTotals[i], 0); // tổng tiền các dòng được giảm
  return { eligibleIndexes, eligibleTotal, limited };
}

// Đọc các danh sách phạm vi từ dữ liệu gửi lên: mảng ObjectId hợp lệ (bỏ trùng) + tierKeys (chuỗi)
function parseScopeLists(body, idFields) {
  const mongoose = require('mongoose');
  const data = {};
  for (const field of idFields) { // VD ['categoryIds', 'productIds', 'storeIds']
    const raw = body[field] ?? [];
    if (!Array.isArray(raw) || raw.length > 500) return { error: `Danh sách ${field} không hợp lệ` }; // tối đa 500 phần tử
    const list = [...new Set(raw.map((v) => String(v?._id ?? v)))]; // nhận cả id lẫn object {_id}; Set để bỏ trùng
    if (list.some((v) => !mongoose.isValidObjectId(v))) return { error: `Danh sách ${field} có giá trị không hợp lệ` };
    data[field] = list;
  }
  const tiers = body.tierKeys ?? [];
  // Khóa hạng: chữ thường, số, gạch dưới, tối đa 40 ký tự; tối đa 20 hạng
  if (!Array.isArray(tiers) || tiers.length > 20 || tiers.some((t) => typeof t !== 'string' || !/^[a-z0-9_]{1,40}$/.test(t))) {
    return { error: 'Danh sách hạng thành viên không hợp lệ' };
  }
  data.tierKeys = [...new Set(tiers)];
  return { data };
}

module.exports = { claimPromotions, releasePromotions, parseScopeLists, customerTier, activePromotions, applyPromotions, voucherScope, productInScope, audienceMatches, promotionAmount };
