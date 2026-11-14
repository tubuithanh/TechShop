// Sổ bảo hành điện tử: tra cứu còn bảo hành không, kích hoạt, mua thêm thời gian bảo hành.
const mongoose = require('mongoose');
const WarrantyCard = require('../models/WarrantyCard');
const WarrantyPlan = require('../models/WarrantyPlan');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { normalizePhone } = require('../utils/customerValidation');
const { ensureCardsForOrders } = require('../utils/warrantyCards');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // thoát ký tự đặc biệt để tìm đúng chữ
const MAX_PENDING_EXTENSIONS = 1; // mỗi sổ tối đa 1 gói chờ thanh toán

// Dữ liệu trả cho khách (tra cứu công khai chỉ cần thông tin bảo hành - ẩn bớt SĐT)
function publicView(card, { full = false } = {}) {
  const s = card.summary(); // tình trạng: còn bảo hành?, hạn cuối, tổng tháng
  const phone = card.customerPhone || '';
  return {
    _id: card._id,
    code: card.code,
    productId: card.productId?._id || card.productId,
    productName: card.productName,
    productImage: card.productId?.featuredImage || '',
    variantLabel: card.variantLabel,
    orderCode: card.orderCode,
    orderId: full ? card.orderId : undefined, // chỉ chủ sổ / nhân viên thấy
    serial: card.serial,
    provider: card.provider,
    providerInfo: card.providerInfo,
    purchaseDate: card.purchaseDate,
    startFrom: card.startFrom,
    activatedAt: card.activatedAt,
    activationDeadline: card.activationDeadline,
    ...s, // gộp tình trạng bảo hành vào kết quả
    extensions: (card.extensions || []).filter((e) => full || e.status === 'paid').map((e) => ({ // công khai: chỉ gói đã trả tiền
      _id: e._id, planName: e.planName, months: e.months, price: e.price, status: e.status, channel: e.channel, requestedAt: e.requestedAt, paidAt: e.paidAt
    })),
    customerName: full ? card.customerName : undefined,
    customerPhone: full ? phone : phone.replace(/^(\d{3})\d+(\d{3})$/, '$1****$2'), // công khai: che giữa SĐT 090****123
    voidReason: card.voidReason,
    audit: full ? card.audit : undefined // người thao tác cuối (nhập IMEI, bán gói...) - chỉ cho nhân viên / chủ sổ
  };
}

// ---------- Khách hàng / công khai ----------

// @route GET /api/warranty-cards/lookup?q=&phone=
// q: mã sổ bảo hành, số serial/IMEI hoặc mã đơn hàng. Bắt buộc SĐT mua hàng để người lạ không tra được.
const lookup = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim(); // mã sổ / IMEI / mã đơn
  const phone = normalizePhone(req.query.phone); // SĐT mua hàng (bắt buộc)
  if (!q || !phone) return res.status(400).json({ message: 'Vui lòng nhập mã bảo hành / IMEI / mã đơn hàng và số điện thoại mua hàng' });
  if (q.length > 60) return res.status(400).json({ message: 'Mã tra cứu quá dài' }); // chặn chuỗi quá dài

  // Đơn giao trước khi có sổ bảo hành -> tạo bù
  const upper = q.toUpperCase();
  const order = await Order.findOne({ orderCode: { $in: [q, upper] } }); // nếu là mã đơn
  if (order) await ensureCardsForOrders([order]); // đơn cũ chưa có sổ -> tạo bù

  const cards = await WarrantyCard.find({ $or: [{ code: upper }, { serial: q }, { orderCode: { $in: [q, upper] } }] }) // tìm theo 1 trong 3 cách
    .populate('productId', 'featuredImage')
    .sort({ purchaseDate: -1 })
    .limit(50);
  const mine = cards.filter((c) => normalizePhone(c.customerPhone) === phone); // chỉ giữ sổ đúng SĐT
  if (!mine.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm khớp mã tra cứu và số điện thoại' }); // không khớp -> cùng 1 thông báo (không lộ mã có tồn tại)
  res.json({ data: mine.map((c) => publicView(c)) });
});

// @route GET /api/warranty-cards/mine - sổ bảo hành của khách đang đăng nhập
const getMine = asyncHandler(async (req, res) => {
  const delivered = await Order.find({ userId: req.account._id, status: 'delivered' }).select('orderCode items userId deliveryAddress storeId statusHistory handover createdAt status'); // đơn đã nhận của khách
  await ensureCardsForOrders(delivered); // tạo bù sổ còn thiếu
  const cards = await WarrantyCard.find({ userId: req.account._id }).populate('productId', 'featuredImage').sort({ purchaseDate: -1 });
  // Khách xem sổ của mình: không cần biết nhân viên nào đã thao tác
  res.json({ data: cards.map((c) => ({ ...publicView(c, { full: true }), audit: undefined })) });
});

async function ownCard(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: 'Không tìm thấy sổ bảo hành' }); return null; }
  const card = await WarrantyCard.findOne({ _id: req.params.id, userId: req.account._id }); // chỉ sổ của chính khách
  if (!card) { res.status(404).json({ message: 'Không tìm thấy sổ bảo hành' }); return null; }
  return card;
}

// @route POST /api/warranty-cards/:id/activate - khách kích hoạt bảo hành (sản phẩm tính từ ngày kích hoạt)
const activate = asyncHandler(async (req, res) => {
  const card = await ownCard(req, res);
  if (!card) return;
  if (card.startFrom !== 'activation') return res.status(400).json({ message: 'Sản phẩm này bảo hành tính từ ngày mua, không cần kích hoạt' }); // sản phẩm tính từ ngày mua thì không cần kích hoạt
  if (card.status !== 'active') return res.status(400).json({ message: 'Sổ bảo hành không còn hiệu lực' }); // sổ đã hủy
  const now = new Date();
  if (card.activationDeadline && now > card.activationDeadline) { // quá 30 ngày
    return res.status(400).json({ message: 'Đã quá hạn kích hoạt - bảo hành được tính từ ngày mua' });
  }
  // Điều kiện activatedAt chưa có: bấm 2 lần không đổi ngày kích hoạt
  const updated = await WarrantyCard.findOneAndUpdate({ _id: card._id, activatedAt: null }, { $set: { activatedAt: now } }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Sản phẩm đã được kích hoạt bảo hành trước đó' });
  res.json({ data: publicView(updated, { full: true }) });
});

// Gói gia hạn áp dụng được cho 1 sổ (đúng danh mục), kèm giá theo giá máy
async function plansForCard(card) {
  const product = await Product.findById(card.productId).select('categoryId').lean(); // danh mục của máy
  const plans = await WarrantyPlan.find({
    isActive: true,
    $or: [{ categoryIds: { $size: 0 } }, { categoryIds: product?.categoryId || null }] // gói chung (không giới hạn danh mục) hoặc đúng danh mục
  }).sort({ months: 1 });
  return plans.map((p) => ({ _id: p._id, name: p.name, description: p.description, months: p.months, price: p.priceFor(card.unitPrice), plan: p })); // giá gói tính theo giá máy
}

// @route GET /api/warranty-cards/:id/plans
const getPlans = asyncHandler(async (req, res) => {
  const card = await ownCard(req, res);
  if (!card) return;
  res.json({ data: (await plansForCard(card)).map(({ plan, ...rest }) => rest) });
});

// Kiểm tra sổ còn mua gia hạn được không; trả về { error } hoặc { option }
async function checkExtension(card, planId) {
  const s = card.summary();
  if (card.status !== 'active') return { error: 'Sổ bảo hành không còn hiệu lực' };
  // Chỉ bán gói cho máy CÒN bảo hành: máy hết bảo hành cần kiểm tra tình trạng trước, không bán online
  if (!s.inWarranty) return { error: 'Sản phẩm đã hết bảo hành, vui lòng mang máy tới cửa hàng để được kiểm tra' };
  if (card.provider === 'manufacturer') return { error: 'Sản phẩm bảo hành do hãng quản lý, vui lòng mua gói gia hạn tại trung tâm bảo hành của hãng' };
  if (!mongoose.isValidObjectId(planId)) return { error: 'Gói bảo hành không hợp lệ' };
  const option = (await plansForCard(card)).find((p) => String(p._id) === String(planId));
  if (!option) return { error: 'Gói bảo hành không áp dụng cho sản phẩm này' };
  return { option };
}

// @route POST /api/warranty-cards/:id/extensions { planId, channel } - khách đăng ký mua gói (chờ thanh toán)
const requestExtension = asyncHandler(async (req, res) => {
  const card = await ownCard(req, res);
  if (!card) return;
  const channel = req.body.channel === 'bank_transfer' ? 'bank_transfer' : 'store'; // chuyển khoản hoặc trả tại cửa hàng
  const { error, option } = await checkExtension(card, req.body.planId);
  if (error) return res.status(400).json({ message: error });
  const pending = card.extensions.filter((e) => e.status === 'pending').length; // số gói đang chờ trả tiền
  if (pending >= MAX_PENDING_EXTENSIONS) return res.status(409).json({ message: 'Bạn đang có 1 gói chờ thanh toán cho sản phẩm này' });
  const updated = await WarrantyCard.findOneAndUpdate(
    { _id: card._id, 'extensions.status': { $ne: 'pending' } }, // điều kiện: chưa có gói chờ (chống 2 request cùng lúc)
    { $push: { extensions: { planId: option._id, planName: option.name, months: option.months, price: option.price, channel, requestedBy: req.account._id } } },
    { new: true }
  );
  if (!updated) return res.status(409).json({ message: 'Bạn đang có 1 gói chờ thanh toán cho sản phẩm này' });
  res.status(201).json({ data: publicView(updated, { full: true }) });
});

// @route DELETE /api/warranty-cards/:id/extensions/:extId - khách hủy gói chưa thanh toán
const cancelMyExtension = asyncHandler(async (req, res) => {
  const card = await ownCard(req, res);
  if (!card) return;
  const updated = await WarrantyCard.findOneAndUpdate(
    { _id: card._id, extensions: { $elemMatch: { _id: req.params.extId, status: 'pending' } } }, // đúng gói đang chờ
    { $set: { 'extensions.$.status': 'cancelled' } }, // $ = phần tử vừa khớp trong mảng
    { new: true }
  );
  if (!updated) return res.status(400).json({ message: 'Chỉ hủy được gói đang chờ thanh toán' });
  res.json({ data: publicView(updated, { full: true }) });
});

// ---------- Quản trị (quyền warranties.manage) ----------

const scopeFilter = (req) => {
  const storeId = getScopedStoreId(req);
  return storeId ? { storeId: new mongoose.Types.ObjectId(String(storeId)) } : {}; // nhân viên chỉ thấy sổ của chi nhánh mình
};

// @route GET /api/warranty-cards/admin?q=&state=pending_payment|expiring
const adminList = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { ...scopeFilter(req) }; // giới hạn chi nhánh
  if (q) {
    const order = await Order.findOne({ orderCode: { $in: [q, q.toUpperCase()] } });
    if (order) await ensureCardsForOrders([order]);
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ code: q.toUpperCase() }, { orderCode: { $in: [q, q.toUpperCase()] } }, { serial: rx }, { customerPhone: rx }, { customerName: rx }, { productName: rx }]; // tìm theo mã sổ, mã đơn, IMEI, SĐT, tên khách, tên máy
  }
  if (req.query.state === 'pending_payment') filter['extensions.status'] = 'pending'; // lọc sổ có gói chờ thu tiền
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [cards, total] = await Promise.all([
    WarrantyCard.find(filter).populate('productId', 'featuredImage').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    WarrantyCard.countDocuments(filter)
  ]);
  res.json({ data: cards.map((c) => publicView(c, { full: true })), total, page, totalPages: Math.ceil(total / limit) || 1 });
});

async function scopedCard(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: 'Không tìm thấy sổ bảo hành' }); return null; }
  const card = await WarrantyCard.findOne({ _id: req.params.id, ...scopeFilter(req) }); // sổ khác chi nhánh -> coi như không có
  if (!card) { res.status(404).json({ message: 'Không tìm thấy sổ bảo hành' }); return null; }
  return card;
}

// @route PUT /api/warranty-cards/admin/:id { serial } - nhập số serial / IMEI khi bàn giao máy
const adminUpdate = asyncHandler(async (req, res) => {
  const card = await scopedCard(req, res);
  if (!card) return;
  const serial = String(req.body.serial ?? '').trim(); // IMEI / số máy
  if (serial.length > 40 || (serial && !/^[A-Za-z0-9-]+$/.test(serial))) { // chỉ chữ, số, "-"; tối đa 40 ký tự
    return res.status(400).json({ message: 'Serial / IMEI chỉ gồm chữ, số, dấu "-" (tối đa 40 ký tự)' });
  }
  if (serial && (await WarrantyCard.exists({ serial, _id: { $ne: card._id }, status: 'active' }))) { // 1 IMEI chỉ gắn 1 sổ đang hiệu lực
    return res.status(409).json({ message: 'Serial / IMEI này đã gắn với một sổ bảo hành khác' });
  }
  card.serial = serial;
  await card.save();
  res.json({ data: publicView(card, { full: true }) });
});

// @route POST /api/warranty-cards/admin/:id/extensions { planId, channel } - bán gói tại quầy (thu tiền ngay)
const adminSellExtension = asyncHandler(async (req, res) => {
  const card = await scopedCard(req, res);
  if (!card) return;
  const channel = req.body.channel === 'bank_transfer' ? 'bank_transfer' : 'cash'; // tiền mặt hoặc chuyển khoản
  if (req.body.paymentConfirmed !== true) return res.status(400).json({ message: 'Xác nhận đã thu đủ tiền gói bảo hành' }); // phải tick đã thu tiền
  const { error, option } = await checkExtension(card, req.body.planId);
  if (error) return res.status(400).json({ message: error });
  const now = new Date();
  card.extensions.push({ planId: option._id, planName: option.name, months: option.months, price: option.price, channel, status: 'paid', requestedBy: req.account._id, paidAt: now, paidBy: req.account._id }); // bán tại quầy = trả tiền ngay (paid)
  await card.save();
  res.status(201).json({ data: publicView(card, { full: true }) });
});

// @route POST /api/warranty-cards/admin/:id/extensions/:extId/confirm - xác nhận đã thu tiền gói khách đăng ký
const adminConfirmExtension = asyncHandler(async (req, res) => {
  const card = await scopedCard(req, res);
  if (!card) return;
  const ext = card.extensions.id(req.params.extId); // gói khách đã đăng ký
  if (!ext || ext.status !== 'pending') return res.status(400).json({ message: 'Chỉ xác nhận được gói đang chờ thanh toán' });
  // Đăng ký khi máy còn bảo hành; nếu chờ quá lâu tới lúc hết hạn thì không xác nhận được nữa
  if (!card.summary().inWarranty) return res.status(400).json({ message: 'Sản phẩm đã hết bảo hành trước khi thanh toán, vui lòng hủy gói và kiểm tra máy' }); // chờ quá lâu tới lúc hết bảo hành -> không xác nhận
  const updated = await WarrantyCard.findOneAndUpdate(
    { _id: card._id, extensions: { $elemMatch: { _id: ext._id, status: 'pending' } } },
    { $set: { 'extensions.$.status': 'paid', 'extensions.$.paidAt': new Date(), 'extensions.$.paidBy': req.account._id, 'extensions.$.note': String(req.body.note || '').slice(0, 200) } }, // xác nhận đã thu tiền -> cộng thêm tháng
    { new: true }
  );
  if (!updated) return res.status(409).json({ message: 'Gói vừa được cập nhật bởi người khác, vui lòng tải lại' });
  if (updated.userId) {
    await Notification.create({
      userId: updated.userId, type: 'warranty', title: 'Đã gia hạn bảo hành',
      message: `${updated.productName}: đã cộng thêm ${ext.months} tháng bảo hành`, link: '/account/warranties'
    }).catch(() => {});
  }
  res.json({ data: publicView(updated, { full: true }) });
});

// @route POST /api/warranty-cards/admin/:id/extensions/:extId/cancel
const adminCancelExtension = asyncHandler(async (req, res) => {
  const card = await scopedCard(req, res);
  if (!card) return;
  const updated = await WarrantyCard.findOneAndUpdate(
    { _id: card._id, extensions: { $elemMatch: { _id: req.params.extId, status: 'pending' } } },
    { $set: { 'extensions.$.status': 'cancelled', 'extensions.$.note': String(req.body.note || '').slice(0, 200) } },
    { new: true }
  );
  if (!updated) return res.status(400).json({ message: 'Chỉ hủy được gói đang chờ thanh toán' });
  res.json({ data: publicView(updated, { full: true }) });
});

// @route GET /api/warranty-cards/admin/:id/plans - gói bán được cho sổ này (nhân viên bán tại quầy)
const adminPlans = asyncHandler(async (req, res) => {
  const card = await scopedCard(req, res);
  if (!card) return;
  res.json({ data: (await plansForCard(card)).map(({ plan, ...rest }) => rest) });
});

// ---------- Gói bảo hành mở rộng (chỉ admin) ----------

function parsePlan(body, current) {
  const merged = { ...(current ? current.toObject() : {}), ...body }; // dữ liệu cũ + mới
  const num = (v, def = 0) => (v === '' || v === null || v === undefined ? def : Number(v)); // ô trống -> giá trị mặc định
  const data = {
    name: String(merged.name ?? '').trim(),
    description: String(merged.description ?? '').trim().slice(0, 300),
    months: num(merged.months, NaN),
    pricePercent: num(merged.pricePercent),
    fixedPrice: num(merged.fixedPrice),
    minPrice: num(merged.minPrice),
    isActive: merged.isActive !== false
  };
  if (data.name.length < 2 || data.name.length > 80) return { error: 'Tên gói từ 2 - 80 ký tự' }; // tên 2-80 ký tự
  if (!Number.isInteger(data.months) || data.months < 1 || data.months > 60) return { error: 'Số tháng gia hạn từ 1 - 60' }; // gia hạn 1-60 tháng
  if (!Number.isFinite(data.pricePercent) || data.pricePercent < 0 || data.pricePercent > 100) return { error: '% giá máy từ 0 - 100' }; // % giá máy 0-100
  for (const k of ['fixedPrice', 'minPrice']) if (!Number.isInteger(data[k]) || data[k] < 0) return { error: 'Giá phải là số nguyên ≥ 0' };
  if (!data.pricePercent && !data.fixedPrice && !data.minPrice) return { error: 'Gói phải có giá (theo % giá máy hoặc số tiền cố định)' }; // gói phải có giá
  const cats = merged.categoryIds ?? [];
  if (!Array.isArray(cats) || cats.some((c) => !mongoose.isValidObjectId(String(c?._id ?? c)))) return { error: 'Danh mục không hợp lệ' };
  data.categoryIds = [...new Set(cats.map((c) => String(c?._id ?? c)))]; // danh mục áp dụng (bỏ trùng)
  return { data };
}

const listPlans = asyncHandler(async (req, res) => {
  res.json({ data: await WarrantyPlan.find().populate('categoryIds', 'name').sort({ isActive: -1, months: 1 }) }); // gói đang bật trước, ít tháng trước
});
const createPlan = asyncHandler(async (req, res) => {
  const { data, error } = parsePlan(req.body);
  if (error) return res.status(400).json({ message: error });
  res.status(201).json({ data: await WarrantyPlan.create(data) });
});
const updatePlan = asyncHandler(async (req, res) => {
  const plan = mongoose.isValidObjectId(req.params.id) ? await WarrantyPlan.findById(req.params.id) : null;
  if (!plan) return res.status(404).json({ message: 'Không tìm thấy gói bảo hành' });
  const { data, error } = parsePlan(req.body, plan);
  if (error) return res.status(400).json({ message: error });
  Object.assign(plan, data);
  await plan.save();
  res.json({ data: plan });
});

// ---------- Trung tâm bảo hành của hãng (chỉ admin) ----------
const updateBrandWarrantyCenter = asyncHandler(async (req, res) => {
  const brand = mongoose.isValidObjectId(req.params.brandId) ? await Brand.findById(req.params.brandId) : null;
  if (!brand) return res.status(404).json({ message: 'Không tìm thấy thương hiệu' });
  const center = {};
  for (const k of ['name', 'phone', 'website', 'address', 'lookupUrl']) center[k] = String(req.body[k] ?? '').trim().slice(0, 300); // mỗi trường tối đa 300 ký tự
  for (const k of ['website', 'lookupUrl']) {
    if (center[k] && !/^https?:\/\/[^\s]+$/i.test(center[k])) return res.status(400).json({ message: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://' }); // đường dẫn phải là http(s)
  }
  brand.warrantyCenter = center;
  await brand.save();
  // Sổ bảo hành do hãng quản lý đã tạo trước đó cũng cập nhật thông tin liên hệ mới
  const productIds = await Product.find({ brandId: brand._id }).distinct('_id'); // sản phẩm của hãng
  await WarrantyCard.updateMany( // cập nhật liên hệ hãng trên mọi sổ đã tạo
    { productId: { $in: productIds }, provider: 'manufacturer' },
    { $set: { providerInfo: { ...center, name: center.name || `Trung tâm bảo hành ${brand.name}` } } }
  );
  res.json({ data: brand });
});

module.exports = {
  lookup, getMine, activate, getPlans, requestExtension, cancelMyExtension,
  adminList, adminUpdate, adminSellExtension, adminConfirmExtension, adminCancelExtension, adminPlans,
  listPlans, createPlan, updatePlan, updateBrandWarrantyCenter, publicView
};
