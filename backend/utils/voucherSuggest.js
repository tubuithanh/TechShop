// Gợi ý mã giảm giá cho 1 khách + 1 giỏ hàng (dùng chung cho POS tại quầy và trang Thanh toán online).
// Tính giống hệt lúc đặt hàng: trừ khuyến mãi tự động trước, rồi xét phạm vi (sản phẩm / danh mục / chi nhánh / hạng),
// đơn tối thiểu, lượt dùng của khách. Trả về TOP 3 mã có lợi nhất + tối đa 2 mã "mua thêm X để dùng".
const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { customerTier, voucherScope, activePromotions, applyPromotions } = require('./promotions');

const TOP = 3;

async function suggestVouchers({ userId, storeId, items }) {
  const valid = (v) => mongoose.isValidObjectId(String(v ?? ''));
  const list = (items || []).slice(0, 50).filter((i) => valid(i.productId) && valid(i.variantId) && Number.isInteger(i.quantity) && i.quantity > 0);
  if (!valid(userId) || !list.length) return { eligible: [], nearly: [], total: 0 };
  const products = await Product.find({ _id: { $in: list.map((i) => i.productId) } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const orderItems = list.map((i) => {
    const variant = productMap.get(String(i.productId))?.variants?.find((v) => String(v._id) === String(i.variantId));
    return { productId: i.productId, quantity: i.quantity, unitPrice: variant?.effectivePrice ?? 0 };
  });
  const tier = await customerTier(userId);
  const ctx = { storeId: storeId || undefined, tierKey: tier?.key || null };
  const promo = applyPromotions(orderItems, productMap, await activePromotions(), ctx);
  const lines = orderItems.map((it, i) => it.unitPrice * it.quantity - promo.lineDiscounts[i]);
  const afterPromo = lines.reduce((a, b) => a + b, 0);

  const now = new Date();
  const vouchers = await Voucher.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now }, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] }).lean();
  const used = await Order.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), voucherCode: { $in: vouchers.map((v) => v.code) }, status: { $nin: ['cancelled', 'returned'] } } },
    { $group: { _id: '$voucherCode', n: { $sum: 1 } } }
  ]);
  const usedBy = new Map(used.map((u) => [u._id, u.n]));
  const eligible = []; const nearly = [];
  for (const v of vouchers) {
    if (v.perCustomerLimit > 0 && (usedBy.get(v.code) || 0) >= v.perCustomerLimit) continue; // khách đã dùng hết lượt
    // Chưa chọn chi nhánh -> mã giới hạn chi nhánh chưa xét được, bỏ qua (tránh gợi ý rồi báo lỗi)
    const scope = voucherScope(v, orderItems, productMap, lines, ctx);
    if (scope.error) continue;
    const info = {
      code: v.code, description: v.description, discountType: v.discountType, discountValue: v.discountValue,
      maxDiscountAmount: v.maxDiscountAmount, minOrderValue: v.minOrderValue, endDate: v.endDate,
      limited: scope.limited, forTier: (v.tierKeys || []).length > 0,
      remaining: v.usageLimit > 0 ? v.usageLimit - v.usedCount : null
    };
    if (afterPromo < v.minOrderValue) { nearly.push({ ...info, missing: v.minOrderValue - afterPromo }); continue; }
    const max = typeof v.maxDiscountAmount === 'number' ? v.maxDiscountAmount : Infinity;
    const amount = v.discountType === 'percent'
      ? Math.round(Math.min((scope.eligibleTotal * v.discountValue) / 100, max))
      : Math.round(Math.min(v.discountValue, scope.limited ? scope.eligibleTotal : afterPromo));
    if (amount > 0) eligible.push({ ...info, amount });
  }
  // Có lợi nhất trước; bằng tiền thì ưu tiên mã sắp hết hạn
  eligible.sort((a, b) => b.amount - a.amount || new Date(a.endDate) - new Date(b.endDate));
  // "Mua thêm" chỉ gợi ý khi lợi hơn mã tốt nhất hiện có
  const bestNow = eligible[0]?.amount || 0;
  const worth = nearly.filter((v) => (v.discountType === 'fixed' ? v.discountValue : Math.min(((afterPromo + v.missing) * v.discountValue) / 100, v.maxDiscountAmount ?? Infinity)) > bestNow);
  worth.sort((a, b) => a.missing - b.missing);
  return { eligible: eligible.slice(0, TOP), total: eligible.length, nearly: worth.slice(0, 2), tier: tier ? { key: tier.key, name: tier.name } : null, afterPromo };
}

module.exports = { suggestVouchers, TOP };
