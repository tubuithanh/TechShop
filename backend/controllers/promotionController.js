// Quản lý chương trình khuyến mãi tự động (chiến dịch marketing) - xem models/Promotion.js
const Promotion = require('../models/Promotion');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');
const { parseScopeLists } = require('../utils/promotions');
const { getLoyaltyConfig } = require('../utils/loyalty');

const SCOPE_FIELD = { categories: 'categoryIds', brands: 'brandIds', products: 'productIds' };

// Kiểm tra dữ liệu gửi lên. current = chương trình đang sửa (gửi trường nào đổi trường đó)
async function parsePromotion(body, current = null) {
  const merged = { ...(current ? current.toObject() : {}), ...body };
  const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
  const data = {};
  data.name = String(merged.name ?? '').trim();
  if (data.name.length < 3 || data.name.length > 120) return { error: 'Tên chương trình từ 3 - 120 ký tự' };
  data.campaign = String(merged.campaign ?? '').trim().slice(0, 60);
  data.description = String(merged.description ?? '').trim().slice(0, 300);
  if (!['percent', 'fixed'].includes(merged.discountType)) return { error: 'Loại giảm giá không hợp lệ' };
  data.discountType = merged.discountType;
  const value = num(merged.discountValue);
  if (!Number.isInteger(value) || value <= 0) return { error: 'Mức giảm phải là số nguyên lớn hơn 0' };
  if (data.discountType === 'percent' && value > 90) return { error: 'Giảm theo % tối đa 90%' };
  data.discountValue = value;
  const cap = num(merged.maxDiscountPerItem);
  if (data.discountType === 'percent' && cap !== undefined) {
    if (!Number.isInteger(cap) || cap <= 0) return { error: 'Mức giảm tối đa mỗi sản phẩm phải là số nguyên > 0' };
    data.maxDiscountPerItem = cap;
  } else {
    data.maxDiscountPerItem = undefined;
  }
  for (const [field, label] of [['usageLimit', 'Số suất'], ['budget', 'Ngân sách']]) {
    const v = num(merged[field]) ?? 0;
    if (!Number.isInteger(v) || v < 0) return { error: `${label} phải là số nguyên ≥ 0 (0 = không giới hạn)` };
    data[field] = v;
  }
  if (current && data.usageLimit > 0 && data.usageLimit < current.usedCount) {
    return { error: `Chương trình đã dùng ${current.usedCount} suất, số suất không được nhỏ hơn` };
  }
  if (!['all', 'categories', 'brands', 'products'].includes(merged.scope)) return { error: 'Phạm vi áp dụng không hợp lệ' };
  data.scope = merged.scope;

  const lists = parseScopeLists(merged, ['categoryIds', 'brandIds', 'productIds', 'storeIds']);
  if (lists.error) return { error: lists.error };
  Object.assign(data, lists.data);
  // Chỉ giữ danh sách đúng với phạm vi đã chọn, tránh dữ liệu thừa gây hiểu nhầm
  for (const [scope, field] of Object.entries(SCOPE_FIELD)) {
    if (data.scope !== scope) data[field] = [];
    else if (!data[field].length) return { error: 'Vui lòng chọn ít nhất 1 mục trong phạm vi áp dụng' };
  }
  if (data.tierKeys.length) {
    const config = await getLoyaltyConfig();
    const known = new Set(config.tiers.map((t) => t.key));
    if (data.tierKeys.some((k) => !known.has(k))) return { error: 'Hạng thành viên không tồn tại' };
  }

  const start = merged.startDate ? new Date(merged.startDate) : new Date();
  const end = merged.endDate ? new Date(merged.endDate) : null;
  if (Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return { error: 'Ngày bắt đầu / kết thúc không hợp lệ' };
  if (end <= start) return { error: 'Ngày kết thúc phải sau ngày bắt đầu' };
  data.startDate = start;
  data.endDate = end;
  if (merged.isActive !== undefined && typeof merged.isActive !== 'boolean') return { error: 'Trạng thái không hợp lệ' };
  data.isActive = merged.isActive !== false;
  return { data };
}

// ?q= tên/chiến dịch (không dấu); ?state=running|upcoming|expired|disabled
const getPromotions = asyncHandler(async (req, res) => {
  const { q, state } = req.query;
  const now = new Date();
  const filter = { ...searchFilter(q) };
  if (state === 'running') Object.assign(filter, { isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
  if (state === 'upcoming') Object.assign(filter, { isActive: true, startDate: { $gt: now } });
  if (state === 'expired') filter.endDate = { $lt: now };
  if (state === 'disabled') filter.isActive = false;
  const promotions = await Promotion.find(filter)
    .sort({ createdAt: -1 })
    .populate('categoryIds brandIds storeIds', 'name')
    .populate('productIds', 'title featuredImage')
    .lean();

  // Hiệu quả từng chương trình: số đơn đã giao + tổng tiền đã giảm
  const stats = await Order.aggregate([
    { $match: { status: 'delivered', 'promotions.0': { $exists: true } } },
    { $unwind: '$promotions' },
    { $group: { _id: '$promotions.promotionId', orders: { $sum: 1 }, discount: { $sum: '$promotions.amount' } } }
  ]);
  const statMap = new Map(stats.map((s) => [String(s._id), s]));
  res.json({
    data: promotions.map((p) => ({ ...p, stats: { orders: statMap.get(String(p._id))?.orders || 0, discount: statMap.get(String(p._id))?.discount || 0 } }))
  });
});

// Công khai: chương trình đang chạy cho mọi khách (không giới hạn hạng) - để trang bán hàng hiển thị
const getActivePromotions = asyncHandler(async (req, res) => {
  const now = new Date();
  const promotions = await Promotion.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    // Ẩn chương trình đã hết suất / hết ngân sách
    $and: [
      { $or: [{ usageLimit: { $in: [0, null] } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
      { $or: [{ budget: { $in: [0, null] } }, { $expr: { $lt: ['$usedAmount', '$budget'] } }] }
    ]
  })
    .select('name campaign description discountType discountValue maxDiscountPerItem scope categoryIds brandIds productIds storeIds tierKeys endDate usageLimit usedCount')
    .populate('categoryIds brandIds storeIds', 'name')
    .populate('productIds', 'title slug')
    .sort({ endDate: 1 })
    .lean();
  // Tên hạng để khách hiểu chương trình dành cho ai
  const config = await getLoyaltyConfig();
  const tierName = Object.fromEntries(config.tiers.map((t) => [t.key, t.name]));
  promotions.forEach((p) => { p.tierNames = (p.tierKeys || []).map((k) => tierName[k] || k); });
  res.json({ data: promotions });
});

const createPromotion = asyncHandler(async (req, res) => {
  const { data, error } = await parsePromotion(req.body);
  if (error) return res.status(400).json({ message: error });
  const promotion = await Promotion.create(data);
  res.status(201).json({ data: promotion });
});

const updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ message: 'Không tìm thấy chương trình khuyến mãi' });
  const { data, error } = await parsePromotion(req.body, promotion);
  if (error) return res.status(400).json({ message: error });
  Object.assign(promotion, data);
  await promotion.save();
  res.json({ data: promotion });
});

// Không xóa hẳn (đơn cũ vẫn tham chiếu tới chương trình) - chỉ tắt
const deletePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ message: 'Không tìm thấy chương trình khuyến mãi' });
  promotion.isActive = false;
  await promotion.save();
  res.json({ message: 'Đã tắt chương trình khuyến mãi' });
});

module.exports = { getPromotions, getActivePromotions, createPromotion, updatePromotion, deletePromotion };
