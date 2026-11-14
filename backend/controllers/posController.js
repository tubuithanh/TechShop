const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const Store = require('../models/Store');
const Inventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');
const { searchFilter } = require('../utils/search');
const { withTransaction, transactionsSupported, BusinessError } = require('../utils/transaction');
const { placeOrder, adjustSoldCount } = require('./orderController');
const { validatePhone } = require('../utils/customerValidation');
const { emailOrderPlaced } = require('../utils/notifyEmail');
const Notification = require('../models/Notification');
const validId = v => typeof v === 'string' && mongoose.isValidObjectId(v);
const { lookupPhone, createCounterAccount, linkPosOrders } = require('../utils/posCustomer');
const { pointsForOrder, getLoyaltyConfig } = require('../utils/loyalty');
const clean = v => typeof v === 'string' ? v.trim() : '';
const locks = new Map();
async function serial(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  let unlock;
  const pending = new Promise(resolve => { unlock = resolve; });
  const tail = previous.catch(() => {}).then(() => pending);
  locks.set(key, tail);
  await previous.catch(() => {});
  try { return await work(); } finally { unlock(); if (locks.get(key) === tail) locks.delete(key); }
}
const catalog = asyncHandler(async (req, res) => {
  const storeId = getScopedStoreId(req) || req.query.storeId;
  if (!validId(storeId)) return res.status(400).json({ message: 'Chọn chi nhánh bán hàng' });
  const rows = await Inventory.find({ storeId, stock: { $gt: 0 } }).populate({ path: 'productId', match: { isActive: true, ...searchFilter(req.query.q) }, select: 'title variants featuredImage vatRate categoryId soldCount', populate: { path: 'categoryId', select: 'name' } }).limit(500);
  const data = rows.flatMap(row => {
    const product = row.productId;
    const variant = product?.variants.id(row.variantId);
    return product && variant?.isActive ? [{
      productId: product._id, variantId: variant._id, title: product.title, label: variant.label, price: variant.effectivePrice,
      originalPrice: variant.price > variant.effectivePrice ? variant.price : null, // giá gốc khi đang giảm giá
      image: variant.image || product.featuredImage || '', category: product.categoryId?.name || '', categoryId: product.categoryId?._id || null,
      soldCount: product.soldCount || 0, vatRate: product.vatRate ?? 10, stock: row.stock
    }] : [];
  });
  // Bán chạy lên đầu (thu ngân tìm nhanh), cùng sản phẩm thì giữ thứ tự phiên bản
  data.sort((a, b) => b.soldCount - a.soldCount || a.title.localeCompare(b.title));
  res.json({ data: data.slice(0, 150) });
});
const customers = asyncHandler(async (req, res) => {
  const q = clean(req.query.q);
  if (q.length < 3) return res.json({ data: [] });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const data = await User.find({ isActive: true, $or: [{ phoneNumber: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }, { displayName: new RegExp(escaped, 'i') }] }).select('displayName phoneNumber email avatar').limit(10).lean();
  // Số đơn đã mua + lần mua gần nhất (nhận diện khách quen)
  const stats = await Order.aggregate([{ $match: { userId: { $in: data.map((u) => u._id) }, status: 'delivered' } }, { $group: { _id: '$userId', orders: { $sum: 1 }, spent: { $sum: '$grandTotal' }, last: { $max: '$createdAt' } } }]);
  const byId = new Map(stats.map((x) => [String(x._id), x]));
  res.json({ data: data.map((u) => ({ ...u, orders: byId.get(String(u._id))?.orders || 0, spent: byId.get(String(u._id))?.spent || 0, lastOrderAt: byId.get(String(u._id))?.last || null })) });
});
const create = asyncHandler(async (req, res) => {
  const storeId = getScopedStoreId(req) || req.body.storeId;
  const { items, paymentMode, paymentConfirmed, clientRequestId } = req.body;
  const fullName = clean(req.body.fullName) || 'Khách lẻ', phone = clean(req.body.phone);
  let userId = req.body.userId || null;
  if (!validId(storeId) || !(await Store.exists({ _id: storeId, isActive: { $ne: false } }))) return res.status(400).json({ message: 'Chi nhánh không hợp lệ' });
  // Tính tạm (quote) cho phép chưa nhập tên/SĐT để thu ngân thấy tổng tiền ngay khi thêm hàng
  // Khách lẻ có thể không để lại tên/SĐT (ghi "Khách lẻ"); có nhập SĐT, có tài khoản hoặc tạo thẻ thành viên thì SĐT phải hợp lệ
  if (!req.posQuote) {
    if (fullName.length > 120) return res.status(400).json({ message: 'Tên khách quá dài' });
    const needPhone = Boolean(phone || req.body.userId || req.body.createAccount);
    if (needPhone && validatePhone(phone)) return res.status(400).json({ message: 'Số điện thoại khách không hợp lệ' });
  }
  if (!['cash', 'bank_transfer'].includes(paymentMode) || (!req.posQuote && paymentConfirmed !== true)) return res.status(400).json({ message: 'Xác nhận đã nhận đủ tiền mặt hoặc chuyển khoản' });
  if (typeof clientRequestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientRequestId)) return res.status(400).json({ message: 'Mã yêu cầu không hợp lệ' });
  if (!Array.isArray(items) || !items.length || items.length > 50 || items.some(i => !validId(i.productId) || !validId(i.variantId) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100)) return res.status(400).json({ message: 'Danh sách sản phẩm không hợp lệ' });
  if (new Set(items.map(i => `${i.productId}:${i.variantId}`)).size !== items.length) return res.status(400).json({ message: 'Sản phẩm bị trùng, hãy gộp số lượng' });
  if (userId && (!validId(userId) || !(await User.exists({ _id: userId, isActive: true })))) return res.status(400).json({ message: 'Khách hàng không hợp lệ' });
  // Khách mới: tạo thẻ thành viên tại quầy (đã hỏi ý khách) -> tích điểm + sổ bảo hành theo tài khoản ngay đơn đầu tiên.
  // Tạo TRƯỚC khi tính dấu vân tay yêu cầu: bấm thử lại tìm lại đúng tài khoản theo SĐT -> cùng userId, không tạo trùng.
  let newAccount = null;
  if (!req.posQuote && !userId && req.body.createAccount === true) {
    if (req.body.accountConsent !== true) return res.status(400).json({ message: 'Cần hỏi ý khách trước khi tạo tài khoản thành viên' });
    const acc = await createCounterAccount({ fullName, phone, email: req.body.email, staffId: req.account._id });
    if (acc.error) return res.status(400).json({ message: acc.error });
    userId = String(acc.user._id);
    if (acc.created) newAccount = acc.user;
  }
  const voucherCode = clean(req.body.voucherCode).toUpperCase();
  if (voucherCode && !userId) return res.status(400).json({ message: 'Chọn tài khoản khách hàng trước khi dùng voucher' });
  const note = clean(req.body.note).slice(0, 1000);
  const normalized = { storeId, userId, fullName, phone, paymentMode, voucherCode, note, items: items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })).sort((a,b) => a.variantId.localeCompare(b.variantId)) };
  if (req.posQuote) {
    try {
      const quote = await placeOrder(userId, { storeId, deliveryMethod: 'store_pickup', posItems: normalized.items, voucherCode, quote: true }, null);
      return res.json({ data: quote });
    } catch (err) { if (err instanceof BusinessError) return res.status(err.status).json({ message: err.message }); throw err; }
  }
  if (!Number.isFinite(req.body.expectedTotal) || req.body.expectedTotal < 0) return res.status(400).json({ message: 'Cần tính tổng tiền trước khi thu tiền' });
  if (!(typeof req.body.expectedVatFingerprint === 'string' && /^[a-f0-9]{64}$/.test(req.body.expectedVatFingerprint)) && !Number.isFinite(req.body.expectedVatRate)) return res.status(400).json({ message: 'Cần tính lại tổng tiền để xác nhận VAT' });
  normalized.expectedTotal = req.body.expectedTotal;
  normalized.expectedVatRate = req.body.expectedVatRate;
  normalized.expectedVatFingerprint = req.body.expectedVatFingerprint;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const filter = { createdBy: req.account._id, clientRequestId };
  const replay = async () => {
    const existing = await Order.findOne(filter).select('+requestFingerprint').populate('createdBy', 'name');
    if (!existing) return null;
    if (existing.requestFingerprint !== fingerprint) throw new BusinessError(409, 'Mã yêu cầu đã dùng cho nội dung khác');
    const data = existing.toObject(); delete data.requestFingerprint;
    return data;
  };
  try {
    const outcome = await serial(`${req.account._id}:${clientRequestId}`, async () => {
      const existing = await replay(); if (existing) return { order: existing, replay: true };
      // POS collects payment and completes stock/sales together. Never partially save a sale.
      if (!(await transactionsSupported())) throw new BusinessError(503, 'Bán tại quầy cần MongoDB replica set để bảo đảm giao dịch');
      const order = await withTransaction(async session => {
        const saved = await placeOrder(userId, { storeId, deliveryAddress: { fullName, phone }, deliveryMethod: 'store_pickup', paymentMode, voucherCode, note, posItems: normalized.items, expectedTotal: req.body.expectedTotal, expectedVatRate: req.body.expectedVatRate, expectedVatFingerprint:req.body.expectedVatFingerprint, createdBy: req.account._id, createdByName: req.account.name, clientRequestId, requestFingerprint: fingerprint }, session);
        const at = new Date();
        saved.status = 'delivered'; saved.paymentStatus = 'paid';
        saved.handover = { recipientName: fullName, note, at, by: req.account._id };
        saved.receipt = { amount: saved.grandTotal, at, by: req.account._id, channel: 'counter' };
        saved.statusHistory.push(require('../utils/orderHistory').historyEntry(req, 'delivered', 'Bán tại quầy: đã thu tiền và bàn giao', undefined, undefined, 'status', saved.storeId));
        await saved.save({ session });
        // Khách có tài khoản: cộng điểm thưởng ngay (đơn tại quầy giao xong tức thì)
        if (saved.userId) {
          saved.loyaltyPoints = pointsForOrder(saved, await getLoyaltyConfig());
          await saved.save({ session });
          if (saved.loyaltyPoints > 0) await User.updateOne({ _id: saved.userId }, { $inc: { loyaltyPoints: saved.loyaltyPoints } }, { session });
        }
        await adjustSoldCount(saved.items, 1, session);
        await require('../utils/warrantyCards').createCardsForOrder(saved, session, at); // sổ bảo hành điện tử
        const data = saved.toObject(); delete data.requestFingerprint; return data;
      });
      return { order, replay: false };
    });
    // Thẻ mới tạo: gắn luôn các đơn tại quầy trước đây cùng SĐT (khách có mặt tại quầy, đọc SĐT của mình)
    if (!outcome.replay && newAccount) {
      const linked = await linkPosOrders(newAccount._id, phone, { exceptOrderId: outcome.order._id });
      outcome.order.newAccount = { created: true, linkedOrders: linked.orders, linkedPoints: linked.points, hasEmail: Boolean(newAccount.email) };
      if (newAccount.email) require('../utils/notifyEmail').emailCounterWelcome(newAccount, outcome.order);
    }
    if (!outcome.replay) require('../utils/einvoice').autoIssueIfEnabled(outcome.order._id); // tự xuất hóa đơn nếu bật
    if (!outcome.replay && userId) {
      await Notification.create({ userId, type: 'order', title: 'Mua hàng tại cửa hàng', message: `Đơn ${outcome.order.orderCode} đã hoàn tất`, link: `/account/orders/${outcome.order._id}` });
      emailOrderPlaced(outcome.order);
    }
    res.status(outcome.replay ? 200 : 201).json({ data: outcome.order });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await replay(); if (existing) return res.json({ data: existing });
    }
    if (err instanceof BusinessError) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});
// @route POST /api/orders/pos/vouchers { storeId, userId, items } - mã giảm giá khách DÙNG ĐƯỢC cho giỏ hiện tại + số tiền giảm,
// tính giống hệt lúc đặt hàng (sau khuyến mãi tự động, phạm vi sản phẩm / chi nhánh / hạng, đơn tối thiểu, lượt dùng của khách).
// Mã chỉ còn thiếu đơn tối thiểu -> gợi ý "mua thêm X để dùng" (bán thêm).
const vouchers = asyncHandler(async (req, res) => {
  const { suggestVouchers } = require('../utils/voucherSuggest');
  const storeId = getScopedStoreId(req) || req.body.storeId;
  res.json({ data: await suggestVouchers({ userId: req.body.userId, storeId, items: req.body.items }) });
});

// @route GET /api/orders/pos/lookup-phone?phone= - nhận diện khách theo SĐT: thành viên / khách cũ chưa có tài khoản / khách mới
const lookup = asyncHandler(async (req, res) => {
  res.json({ data: await lookupPhone(req.query.phone) });
});

// @route GET /api/orders/pos/today - ca bán hôm nay của thu ngân: số đơn, doanh thu, 5 đơn gần nhất
const today = asyncHandler(async (req, res) => {
  const vn = new Date(Date.now() + 7 * 3600000);
  const from = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600000);
  const match = { source: 'pos', createdBy: req.account._id, createdAt: { $gte: from }, status: { $nin: ['cancelled', 'returned'] } };
  const [sum] = await Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' }, units: { $sum: { $sum: '$items.quantity' } }, cash: { $sum: { $cond: [{ $eq: ['$paymentMode', 'cash'] }, '$grandTotal', 0] } } } }]);
  const recent = await Order.find(match).sort({ createdAt: -1 }).limit(5).select('orderCode grandTotal createdAt deliveryAddress.fullName items.name paymentMode').lean();
  res.json({ data: { orders: sum?.orders || 0, revenue: sum?.revenue || 0, units: sum?.units || 0, cash: sum?.cash || 0, recent } });
});

module.exports = { catalog, customers, create, today, lookup, vouchers };
