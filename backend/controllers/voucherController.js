const Voucher = require('../models/Voucher');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { customerTier, voucherScope, parseScopeLists, activePromotions, applyPromotions } = require('../utils/promotions');
const { getLoyaltyConfig } = require('../utils/loyalty');

// @route GET /api/vouchers/active - danh sách voucher công khai đang áp dụng (mục 1.1.9)
const getActiveVouchers = asyncHandler(async (req, res) => {
  const now = new Date();
  // Bỏ mã đã hết lượt dùng (trước đây vẫn hiện, khách sao chép về rồi mới bị báo hết hạn)
  const vouchers = await Voucher.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }]
  }).select('code description discountType discountValue maxDiscountAmount minOrderValue endDate categoryIds productIds storeIds tierKeys').populate('categoryIds storeIds', 'name').populate('productIds', 'title slug').lean();
  const config = await getLoyaltyConfig();
  const tierName = Object.fromEntries(config.tiers.map((t) => [t.key, t.name]));
  vouchers.forEach((v) => { v.tierNames = (v.tierKeys || []).map((k) => tierName[k] || k); });
  res.json({ data: vouchers });
});

// @route POST /api/vouchers/validate  (khách hàng kiểm tra mã trước khi áp dụng)
const validateVoucher = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const orderValue = Number(req.body.orderValue);
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ message: 'Vui lòng nhập mã giảm giá' });
  if (!Number.isFinite(orderValue) || orderValue < 0) return res.status(400).json({ message: 'Giá trị đơn hàng không hợp lệ' });
  const voucher = await Voucher.findOne({ code: code.trim().toUpperCase() });
  if (!voucher || !voucher.isValidNow()) {
    return res.status(400).json({ message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' });
  }
  // Tính giống hệt lúc đặt hàng: lấy giỏ hàng thật, trừ khuyến mãi tự động trước, rồi mới xét đơn tối thiểu và
  // phạm vi của mã. Giỏ trống (gọi API trực tiếp) thì dùng orderValue gửi lên như trước.
  const cart = await Cart.findOne({ userId: req.account._id }).lean();
  const cartItems = cart?.items || [];
  let base = orderValue;
  let afterPromo = orderValue;
  if (cartItems.length) {
    const products = await Product.find({ _id: { $in: cartItems.map((i) => i.productId) } }).lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const items = cartItems.map((c) => {
      const product = productMap.get(String(c.productId));
      const variant = product?.variants?.find((v) => String(v._id) === String(c.variantId));
      return { productId: c.productId, quantity: c.quantity, unitPrice: variant?.effectivePrice ?? 0 };
    });
    const tier = await customerTier(req.account._id);
    const storeId = req.body.storeId;
    const ctx = { storeId, tierKey: tier?.key || null };
    const promo = applyPromotions(items, productMap, await activePromotions(), ctx);
    const lineTotals = items.map((i, k) => i.unitPrice * i.quantity - promo.lineDiscounts[k]);
    afterPromo = lineTotals.reduce((a, b) => a + b, 0);
    base = afterPromo;
    // Chưa chọn chi nhánh thì chưa kiểm tra chi nhánh (kiểm tra lại khi đặt hàng)
    const check = voucherScope(storeId ? voucher : { ...voucher.toObject(), storeIds: [] }, items, productMap, lineTotals, ctx);
    if (check.error) return res.status(400).json({ message: check.error });
    if (check.limited) base = check.eligibleTotal;
  } else if (['storeIds', 'tierKeys', 'categoryIds', 'productIds'].some((f) => voucher[f]?.length)) {
    return res.status(400).json({ message: 'Giỏ hàng không có sản phẩm thuộc phạm vi áp dụng của mã này' });
  }
  if (afterPromo < voucher.minOrderValue) {
    return res.status(400).json({ message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã này` });
  }
  if (voucher.perCustomerLimit > 0) {
    const usedByCustomer = await Order.countDocuments({
      userId: req.account._id,
      voucherCode: voucher.code,
      status: { $nin: ['cancelled', 'returned'] }
    });
    if (usedByCustomer >= voucher.perCustomerLimit) {
      return res.status(400).json({ message: 'Bạn đã sử dụng hết lượt cho mã giảm giá này' });
    }
  }
  const maxDiscount = typeof voucher.maxDiscountAmount === 'number' ? voucher.maxDiscountAmount : Infinity;
  const discountAmount =
    voucher.discountType === 'percent'
      ? Math.round(Math.min((base * voucher.discountValue) / 100, maxDiscount))
      : Math.min(voucher.discountValue, base); // không giảm quá tiền hàng

  res.json({ data: { voucher, discountAmount } });
});

// @route GET /api/vouchers/suggest?storeId= - top 3 mã có lợi nhất cho GIỎ HÀNG của khách (trang Thanh toán)
const suggestForCart = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ dành cho khách hàng' });
  const { suggestVouchers } = require('../utils/voucherSuggest');
  const cart = await Cart.findOne({ userId: req.account._id }).lean();
  const items = (cart?.items || []).map((i) => ({ productId: String(i.productId), variantId: String(i.variantId), quantity: i.quantity }));
  const storeId = require('mongoose').isValidObjectId(req.query.storeId) ? req.query.storeId : undefined;
  res.json({ data: await suggestVouchers({ userId: req.account._id, storeId, items }) });
});

// @route GET /api/vouchers/mine - VÍ VOUCHER cá nhân hóa của khách (trang Tài khoản -> Mã giảm giá của tôi):
//  ready: dùng được ngay (đúng hạng, còn lượt của mình) | expiring: hết hạn trong 3 ngày | upcoming: sắp diễn ra
//  locked: dành cho hạng cao hơn (mở khóa khi lên hạng) | used: mã đã dùng + số tiền đã tiết kiệm
const myVouchers = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ dành cho khách hàng' });
  const now = new Date();
  const config = await getLoyaltyConfig();
  const tier = await customerTier(req.account._id);
  const tierRank = Object.fromEntries(config.tiers.map((t, i) => [t.key, i]));
  const tierName = Object.fromEntries(config.tiers.map((t) => [t.key, t.name]));
  const list = await Voucher.find({ isActive: true, endDate: { $gte: now }, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] })
    .populate('categoryIds', 'name slug').populate('productIds', 'title slug').populate('storeIds', 'name').lean();
  const usage = await Order.aggregate([
    { $match: { userId: req.account._id, voucherCode: { $nin: [null, ''] }, status: { $nin: ['cancelled', 'returned'] } } },
    { $group: { _id: '$voucherCode', n: { $sum: 1 }, saved: { $sum: { $ifNull: ['$voucherDiscount', 0] } }, last: { $max: '$createdAt' }, orders: { $push: { _id: '$_id', code: '$orderCode' } } } }
  ]);
  const usedBy = new Map(usage.map((u) => [u._id, u]));
  const soon = new Date(now.getTime() + 3 * 86400000);
  const out = { ready: [], expiring: [], upcoming: [], locked: [], used: [] };
  for (const v of list) {
    const mine = usedBy.get(v.code)?.n || 0;
    const left = v.perCustomerLimit > 0 ? v.perCustomerLimit - mine : null; // null = không giới hạn
    if (left !== null && left <= 0) continue;
    const item = {
      code: v.code, description: v.description, discountType: v.discountType, discountValue: v.discountValue, maxDiscountAmount: v.maxDiscountAmount,
      minOrderValue: v.minOrderValue, startDate: v.startDate, endDate: v.endDate, myUsesLeft: left,
      remaining: v.usageLimit > 0 ? v.usageLimit - v.usedCount : null,
      categories: (v.categoryIds || []).map((c) => ({ _id: c._id, name: c.name })),
      products: (v.productIds || []).map((p) => ({ title: p.title, slug: p.slug })),
      stores: (v.storeIds || []).map((s) => s.name),
      tiers: (v.tierKeys || []).map((k) => tierName[k] || k)
    };
    if (v.tierKeys?.length && !(tier && v.tierKeys.includes(tier.key))) {
      // Chỉ gợi ý "mở khóa" cho hạng CAO HƠN hạng hiện tại
      const lowest = Math.min(...v.tierKeys.map((k) => tierRank[k] ?? 99));
      if (tier && lowest > (tierRank[tier.key] ?? -1)) out.locked.push({ ...item, unlockTier: config.tiers[lowest]?.name });
      continue;
    }
    if (v.startDate > now) out.upcoming.push(item);
    else if (v.endDate <= soon) out.expiring.push(item);
    else out.ready.push(item);
  }
  const value = (v) => (v.discountType === 'fixed' ? v.discountValue : v.maxDiscountAmount || v.discountValue * 100000);
  out.ready.sort((a, b) => value(b) - value(a));
  out.expiring.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  out.upcoming.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  out.used = usage.map((u) => ({ code: u._id, times: u.n, saved: u.saved, lastUsedAt: u.last, orders: u.orders.slice(-3) })).sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt));
  res.json({ data: { ...out, tier, totalSaved: usage.reduce((s, u) => s + u.saved, 0) } });
});

// ---------- ADMIN ----------
// ?q= mã/mô tả (không dấu); ?state=running|upcoming|expired|disabled
const getVouchers = asyncHandler(async (req, res) => {
  const { q, state } = req.query;
  const now = new Date();
  const filter = { ...searchFilter(q) };
  if (state === 'running') Object.assign(filter, { isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
  if (state === 'upcoming') Object.assign(filter, { isActive: true, startDate: { $gt: now } });
  if (state === 'expired') filter.endDate = { $lt: now };
  if (state === 'disabled') filter.isActive = false;
  const vouchers = await Voucher.find(filter).sort({ createdAt: -1 })
    .populate('categoryIds storeIds', 'name')
    .populate('productIds', 'title');
  res.json({ data: vouchers });
});

// Kiểm tra dữ liệu mã giảm giá. Trước đây tạo / sửa nhận nguyên req.body: sửa được cả số lượt đã dùng
// (usedCount), giảm > 100%, giá trị âm, ngày kết thúc trước ngày bắt đầu, lỗi trùng mã thành lỗi 500.
// current = mã đang sửa (gửi trường nào đổi trường đó). Trả về { data } hoặc { error }.
async function parseVoucher(body, current = null) {
  const merged = { ...(current ? current.toObject() : {}), ...body };
  const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
  const data = {};
  const code = String(merged.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: 'Mã gồm 3 - 30 ký tự: chữ không dấu, số, "-" hoặc "_"' };
  data.code = code;
  data.description = String(merged.description ?? '').trim().slice(0, 300);
  if (!['percent', 'fixed'].includes(merged.discountType)) return { error: 'Loại giảm giá không hợp lệ' };
  data.discountType = merged.discountType;
  const value = num(merged.discountValue);
  if (!Number.isInteger(value) || value <= 0) return { error: 'Mức giảm phải là số nguyên lớn hơn 0' };
  if (data.discountType === 'percent' && value > 100) return { error: 'Giảm theo % tối đa 100%' };
  data.discountValue = value;
  const maxDiscount = num(merged.maxDiscountAmount);
  if (data.discountType === 'percent' && maxDiscount !== undefined) {
    if (!Number.isInteger(maxDiscount) || maxDiscount < 0) return { error: 'Mức giảm tối đa phải là số nguyên ≥ 0' };
    data.maxDiscountAmount = maxDiscount;
  } else {
    data.maxDiscountAmount = undefined; // chỉ dùng cho giảm theo %
  }
  for (const [field, label] of [['minOrderValue', 'Giá trị đơn tối thiểu'], ['usageLimit', 'Tổng lượt dùng'], ['perCustomerLimit', 'Lượt dùng mỗi khách']]) {
    const v = num(merged[field]) ?? 0;
    if (!Number.isInteger(v) || v < 0) return { error: `${label} phải là số nguyên ≥ 0` };
    data[field] = v;
  }
  if (current && data.usageLimit > 0 && data.usageLimit < current.usedCount) {
    return { error: `Mã đã được dùng ${current.usedCount} lượt, tổng lượt dùng không được nhỏ hơn số này` };
  }
  const start = merged.startDate ? new Date(merged.startDate) : new Date();
  const end = merged.endDate ? new Date(merged.endDate) : null;
  if (Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return { error: 'Ngày bắt đầu / kết thúc không hợp lệ' };
  if (end <= start) return { error: 'Ngày kết thúc phải sau ngày bắt đầu' };
  data.startDate = start;
  data.endDate = end;
  if (merged.isActive !== undefined && typeof merged.isActive !== 'boolean') return { error: 'Trạng thái không hợp lệ' };
  data.isActive = merged.isActive !== false;
  const lists = parseScopeLists(merged, ['categoryIds', 'productIds', 'storeIds']);
  if (lists.error) return { error: lists.error };
  Object.assign(data, lists.data);
  if (data.tierKeys.length) {
    const config = await getLoyaltyConfig();
    const known = new Set(config.tiers.map((t) => t.key));
    if (data.tierKeys.some((k) => !known.has(k))) return { error: 'Hạng thành viên không tồn tại' };
  }
  return { data };
}

async function codeTaken(code, exceptId) {
  return Voucher.exists({ code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
}

const createVoucher = asyncHandler(async (req, res) => {
  const { data, error } = await parseVoucher(req.body);
  if (error) return res.status(400).json({ message: error });
  if (await codeTaken(data.code)) return res.status(409).json({ message: `Mã ${data.code} đã tồn tại` });
  const voucher = await Voucher.create(data);
  res.status(201).json({ data: voucher });
});

const updateVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) return res.status(404).json({ message: 'Không tìm thấy voucher' });
  const { data, error } = await parseVoucher(req.body, voucher);
  if (error) return res.status(400).json({ message: error });
  // Đổi mã khi đã có đơn dùng mã cũ sẽ làm sai giới hạn lượt / khách (đếm theo voucherCode trên đơn)
  if (data.code !== voucher.code && voucher.usedCount > 0) return res.status(400).json({ message: 'Mã đã có đơn sử dụng, không đổi được tên mã' });
  if (data.code !== voucher.code && (await codeTaken(data.code, voucher._id))) return res.status(409).json({ message: `Mã ${data.code} đã tồn tại` });
  Object.assign(voucher, data);
  await voucher.save();
  res.json({ data: voucher });
});

const deleteVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) return res.status(404).json({ message: 'Không tìm thấy voucher' });
  voucher.isActive = false;
  await voucher.save();
  res.json({ message: 'Đã vô hiệu hóa voucher' });
});

module.exports = {
  myVouchers,
  suggestForCart, validateVoucher, getActiveVouchers, getVouchers, createVoucher, updateVoucher, deleteVoucher };
