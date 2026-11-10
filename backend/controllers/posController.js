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
  const rows = await Inventory.find({ storeId, stock: { $gt: 0 } }).populate({ path: 'productId', match: { isActive: true, ...searchFilter(req.query.q) }, select: 'title variants featuredImage vatRate' }).limit(500);
  const data = rows.flatMap(row => {
    const product = row.productId;
    const variant = product?.variants.id(row.variantId);
    return product && variant?.isActive ? [{ productId: product._id, variantId: variant._id, title: product.title, label: variant.label, price: variant.effectivePrice, vatRate:product.vatRate ?? 10, stock: row.stock }] : [];
  });
  res.json({ data: data.slice(0, 100) });
});
const customers = asyncHandler(async (req, res) => {
  const q = clean(req.query.q);
  if (q.length < 3) return res.json({ data: [] });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const data = await User.find({ isActive: true, $or: [{ phoneNumber: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }] }).select('displayName phoneNumber email').limit(10);
  res.json({ data });
});
const create = asyncHandler(async (req, res) => {
  const storeId = getScopedStoreId(req) || req.body.storeId;
  const { items, paymentMode, paymentConfirmed, clientRequestId } = req.body;
  const fullName = clean(req.body.fullName), phone = clean(req.body.phone), userId = req.body.userId || null;
  if (!validId(storeId) || !(await Store.exists({ _id: storeId, isActive: { $ne: false } }))) return res.status(400).json({ message: 'Chi nhánh không hợp lệ' });
  if (!fullName || fullName.length > 120 || validatePhone(phone)) return res.status(400).json({ message: 'Nhập tên và số điện thoại khách hợp lệ' });
  if (!['cash', 'bank_transfer'].includes(paymentMode) || (!req.posQuote && paymentConfirmed !== true)) return res.status(400).json({ message: 'Xác nhận đã nhận đủ tiền mặt hoặc chuyển khoản' });
  if (typeof clientRequestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientRequestId)) return res.status(400).json({ message: 'Mã yêu cầu không hợp lệ' });
  if (!Array.isArray(items) || !items.length || items.length > 50 || items.some(i => !validId(i.productId) || !validId(i.variantId) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100)) return res.status(400).json({ message: 'Danh sách sản phẩm không hợp lệ' });
  if (new Set(items.map(i => `${i.productId}:${i.variantId}`)).size !== items.length) return res.status(400).json({ message: 'Sản phẩm bị trùng, hãy gộp số lượng' });
  if (userId && (!validId(userId) || !(await User.exists({ _id: userId, isActive: true })))) return res.status(400).json({ message: 'Khách hàng không hợp lệ' });
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
        saved.statusHistory = [{ status: 'delivered', note: 'Bán tại quầy: đã thu tiền và bàn giao', changedBy: req.account._id, changedAt: at }];
        await saved.save({ session });
        await adjustSoldCount(saved.items, 1, session);
        await require('../utils/warrantyCards').createCardsForOrder(saved, session, at); // sổ bảo hành điện tử
        const data = saved.toObject(); delete data.requestFingerprint; return data;
      });
      return { order, replay: false };
    });
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
module.exports = { catalog, customers, create };
