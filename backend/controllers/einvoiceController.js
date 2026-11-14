// HÓA ĐƠN ĐIỆN TỬ GIẢ LẬP: phát hành (1 đơn / hàng loạt), xem, gửi email, hủy, lập hóa đơn thay thế, tra cứu công khai.
const mongoose = require('mongoose');
const EInvoice = require('../models/EInvoice'); // hóa đơn đã phát hành
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId, isStoreAllowed, hasPermission } = require('../middlewares/authMiddleware');
const { issueForOrder, verifySignature, draftForOrder } = require('../utils/einvoice'); // phát hành / kiểm chữ ký / bản nháp
const { searchFilter } = require('../utils/search');

const isId = (v) => mongoose.isValidObjectId(String(v ?? '')); // chuỗi ObjectId hợp lệ?
// Chỉ phát hành cho đơn đã hoàn tất + đã thu tiền (POS / COD đã giao / online đã thanh toán)
function issueBlocker(order) {
  if (order.status !== 'delivered') return 'Chỉ xuất hóa đơn cho đơn đã giao / đã bàn giao cho khách'; // chưa giao -> chưa xuất
  if (order.paymentStatus === 'refunded' || order.refundStatus === 'completed') return 'Đơn đã hoàn tiền, không xuất hóa đơn'; // đã hoàn tiền -> không xuất
  if (['vnpay', 'momo', 'bank_transfer'].includes(order.paymentMode) && order.paymentStatus !== 'paid') return 'Đơn chưa thanh toán'; // chưa thu tiền
  return null;
}
const loadOrder = (id) => Order.findById(id).populate('userId', 'displayName email').populate('storeId', 'name'); // đơn + tên/email khách + tên chi nhánh

function sendInvoiceEmail(inv) {
  const to = inv.buyer?.email;
  if (!to) return false; // người mua không có email -> không gửi
  require('../utils/notifyEmail').emailEInvoice?.(inv); // gửi nền (không chờ)
  return true;
}

// @route POST /api/einvoices/orders/:orderId/issue { sendEmail, buyer? }
const issue = asyncHandler(async (req, res) => {
  const order = isId(req.params.orderId) ? await loadOrder(req.params.orderId) : null;
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!isStoreAllowed(req, order.storeId)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' });
  const block = issueBlocker(order);
  if (block) return res.status(400).json({ message: block });
  if (await EInvoice.exists({ orderId: order._id, status: 'issued' })) return res.status(409).json({ message: 'Đơn này đã có hóa đơn điện tử' }); // mỗi đơn 1 hóa đơn hiệu lực
  let inv;
  try { inv = await issueForOrder(order, { actor: req.account, buyer: req.body?.buyer }); } // phát hành (có thể sửa thông tin người mua)
  catch (err) { if (err.code === 11000) return res.status(409).json({ message: 'Đơn này vừa được xuất hóa đơn' }); throw err; } // chỉ số duy nhất chặn 2 request cùng lúc
  // Email gửi nền - chỉ ghi "đã gửi" khi gửi thành công (utils/notifyEmail.js); phản hồi báo "đang gửi tới"
  const queued = req.body?.sendEmail !== false && sendInvoiceEmail(inv) ? inv.buyer.email : null; // mặc định gửi email
  res.status(201).json({ data: { ...inv.toObject(), emailQueuedTo: queued } });
});

// @route POST /api/einvoices/orders/:orderId/preview { buyer? } - XEM TRƯỚC hóa đơn (bản nháp, không lưu, không cấp số)
const preview = asyncHandler(async (req, res) => {
  const order = isId(req.params.orderId) ? await loadOrder(req.params.orderId) : null;
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!isStoreAllowed(req, order.storeId)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' });
  const existing = await EInvoice.findOne({ orderId: order._id, status: 'issued' }).select('_id number series template').lean(); // hóa đơn đã có (nếu có)
  res.json({ data: { ...(await draftForOrder(order, { buyer: req.body?.buyer })), blocker: issueBlocker(order), existing } }); // bản nháp + lý do chưa xuất được
});

// Điều kiện ĐƯỢC xuất hóa đơn (khớp issueBlocker): đã giao, chưa hoàn tiền, đã thu tiền (COD/tiền mặt hoặc online đã thanh toán)
const ELIGIBLE = { status: 'delivered', paymentStatus: { $ne: 'refunded' }, refundStatus: { $ne: 'completed' }, $or: [{ paymentMode: { $in: ['cod', 'cash'] } }, { paymentStatus: 'paid' }] }; // điều kiện lọc đơn đủ điều kiện (dạng truy vấn MongoDB)
const storeScope = (req, from) => { const scoped = getScopedStoreId(req); return scoped ? { storeId: new mongoose.Types.ObjectId(String(scoped)) } : isId(from?.storeId) ? { storeId: new mongoose.Types.ObjectId(String(from.storeId)) } : {}; }; // nhân viên: chi nhánh mình; admin: chi nhánh chọn (nếu có)
const dayRange = (q) => {
  const r = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) r.$gte = new Date(`${q.from}T00:00:00+07:00`); // từ 0 giờ ngày from (giờ VN)
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) r.$lt = new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 86400000); // tới hết ngày to
  return Object.keys(r).length ? r : null;
};
const issuedOrderIds = () => EInvoice.distinct('orderId', { status: 'issued' }); // id các đơn đã có hóa đơn hiệu lực
// Hóa đơn còn hiệu lực nhưng đơn đã trả hàng / hoàn tiền -> kế toán cần hủy hoặc thay thế
const attentionOrderIds = async (scope) => Order.distinct('_id', { ...scope, _id: { $in: await issuedOrderIds() }, $or: [{ status: { $in: ['returning', 'returned'] } }, { refundStatus: 'completed' }, { paymentStatus: 'refunded' }] });

// @route POST /api/einvoices/bulk-issue { orderIds?, sendEmail } - không truyền orderIds: mọi đơn ĐỦ ĐIỀU KIỆN chưa có hóa đơn (tối đa 200)
const bulkIssue = asyncHandler(async (req, res) => {
  const filter = { ...ELIGIBLE, ...storeScope(req, req.body), _id: { $nin: await issuedOrderIds() } }; // đơn đủ điều kiện, chưa có hóa đơn
  if (Array.isArray(req.body?.orderIds)) filter._id.$in = req.body.orderIds.filter(isId).slice(0, 200).map((x) => new mongoose.Types.ObjectId(String(x))); // chọn cụ thể: tối đa 200 id hợp lệ
  const orders = await Order.find(filter).populate('userId', 'displayName email').sort({ createdAt: 1 }).limit(200); // đơn cũ trước, tối đa 200 / lượt
  let ok = 0; let emailed = 0; const fails = [];
  for (const o of orders) { // phát hành lần lượt (số hóa đơn liên tục)
    const block = issueBlocker(o);
    if (block) { fails.push(`${o.orderCode}: ${block}`); continue; }
    try {
      const inv = await issueForOrder(o, { actor: req.account }); ok += 1;
      if (req.body?.sendEmail && sendInvoiceEmail(inv)) emailed += 1;
    } catch (err) { fails.push(`${o.orderCode}: ${err.code === 11000 ? 'đã có hóa đơn' : err.message}`); } // lỗi 1 đơn không dừng cả lượt
  }
  res.json({ data: { issued: ok, emailed, failed: fails.length, errors: fails.slice(0, 20), remaining: orders.length === 200 } }); // remaining = còn đơn cho lượt sau
});

// @route GET /api/einvoices/pending-orders?q&page&from&to&storeId - đơn ĐỦ ĐIỀU KIỆN nhưng chưa có hóa đơn
const pendingOrders = asyncHandler(async (req, res) => {
  const filter = { ...ELIGIBLE, ...storeScope(req, req.query), _id: { $nin: await issuedOrderIds() } };
  const range = dayRange(req.query);
  if (range) filter.createdAt = range;
  const q = String(req.query.q || '').trim();
  if (q) Object.assign(filter, { $and: [{ $or: ELIGIBLE.$or }, searchFilter(q)] }), delete filter.$or; // gộp điều kiện vào $and
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [data, total, sum] = await Promise.all([
    Order.find(filter).select('orderCode createdAt grandTotal paymentMode deliveryAddress invoiceInfo storeId userId source').populate('storeId', 'name').populate('userId', 'email').sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]) // tổng tiền các đơn chờ xuất
  ]);
  res.json({ data: data.map((o) => ({ ...o, buyerEmail: o.invoiceInfo?.email || o.userId?.email || '' })), total, page, totalPages: Math.ceil(total / limit), amount: sum[0]?.total || 0 });
});

// @route GET /api/einvoices?q&status=issued|cancelled|replaced|attention&from&to&storeId&page
const list = asyncHandler(async (req, res) => {
  const scope = storeScope(req, req.query);
  const filter = { ...scope };
  const range = dayRange(req.query);
  if (range) filter.issuedAt = range;
  const q = String(req.query.q || '').trim().replace(/^#/, ''); // cho phép gõ "#123"
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // thoát ký tự đặc biệt
    filter.$or = [{ orderCode: rx }, { lookupCode: rx }, { 'buyer.name': rx }, { 'buyer.companyName': rx }, { 'buyer.taxCode': rx }, { 'buyer.phone': rx }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])]; // tìm theo mã đơn, mã tra cứu, người mua, MST, SĐT, số hóa đơn
  }
  const attentionIds = await attentionOrderIds(scope); // hóa đơn cần xử lý (đơn đã trả / hoàn tiền)
  const base = { ...filter }; // bản lọc chưa gồm trạng thái (cho số đếm từng tab)
  if (['issued', 'cancelled', 'replaced'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.status === 'attention') Object.assign(filter, { status: 'issued', orderId: { $in: attentionIds } });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [data, total, summary, pending] = await Promise.all([
    EInvoice.find(filter).sort({ issuedAt: -1, number: -1 }).skip((page - 1) * limit).limit(limit).select('-lines').lean(), // không trả chi tiết dòng hàng (nhẹ hơn)
    EInvoice.countDocuments(filter),
    EInvoice.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$totals.total' }, vat: { $sum: '$totals.vat' }, net: { $sum: '$totals.net' } } }]), // số lượng + tổng tiền theo trạng thái
    (async () => Order.countDocuments({ ...ELIGIBLE, ...scope, _id: { $nin: await issuedOrderIds() } }))()
  ]);
  const att = new Set(attentionIds.map(String));
  const s = Object.fromEntries(summary.map((x) => [x._id, x]));
  res.json({
    data: data.map((x) => ({ ...x, needsAttention: x.status === 'issued' && att.has(String(x.orderId)) })), total, page, totalPages: Math.ceil(total / limit),
    summary: { issued: s.issued?.n || 0, issuedTotal: s.issued?.total || 0, issuedNet: s.issued?.net || 0, issuedVat: s.issued?.vat || 0, cancelled: s.cancelled?.n || 0, replaced: s.replaced?.n || 0, pendingOrders: pending, attention: attentionIds.length }
  });
});

const loadInvoice = async (req, res) => {
  const inv = isId(req.params.id) ? await EInvoice.findById(req.params.id) : null;
  if (!inv) { res.status(404).json({ message: 'Không tìm thấy hóa đơn' }); return null; }
  if (!isStoreAllowed(req, inv.storeId)) { res.status(403).json({ message: 'Hóa đơn thuộc chi nhánh khác' }); return null; }
  return inv;
};
// Hóa đơn phát hành qua nhà cung cấp thật: hủy / thay thế phải thực hiện trên hệ thống của nhà cung cấp
const providerLocked = (inv) => (inv.provider && inv.provider !== 'simulation' ? `Hóa đơn phát hành qua ${inv.provider.toUpperCase()}: hủy / thay thế thực hiện trên cổng của nhà cung cấp (chưa hỗ trợ tự động)` : null); // hóa đơn của nhà cung cấp thật: không hủy / thay thế tại đây
const withVerify = (inv) => ({ ...(inv.toObject ? inv.toObject() : inv), signatureValid: verifySignature(inv.toObject ? inv.toObject() : inv) }); // kèm kết quả kiểm chữ ký

// @route GET /api/einvoices/:id
const getOne = asyncHandler(async (req, res) => {
  const inv = await loadInvoice(req, res);
  if (inv) res.json({ data: withVerify(inv) });
});

// @route GET /api/einvoices/by-order/:orderId - hóa đơn của đơn (nhân viên hoặc chính chủ đơn)
const byOrder = asyncHandler(async (req, res) => {
  if (!isId(req.params.orderId)) return res.status(404).json({ message: 'Không tìm thấy' });
  const order = await Order.findById(req.params.orderId).select('userId storeId').lean(); // đơn gốc
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  // SỬA LỖI: nhân viên trước đây chỉ cần đúng chi nhánh (VD nhân viên kho) là xem được thông tin người mua -> nay cần thêm quyền quản lý đơn
  if (req.accountRole === 'customer' ? String(order.userId) !== String(req.account._id) : (!hasPermission(req, 'orders.manage') || !isStoreAllowed(req, order.storeId))) return res.status(403).json({ message: 'Không có quyền xem' });
  const list = await EInvoice.find({ orderId: order._id }).sort({ issuedAt: -1 }).lean(); // mọi hóa đơn của đơn (gồm đã hủy / bị thay thế)
  res.json({ data: list.map(withVerify) });
});

// @route POST /api/einvoices/:id/email { email? }
const email = asyncHandler(async (req, res) => {
  const inv = await loadInvoice(req, res);
  if (!inv) return;
  const to = String(req.body?.email || inv.buyer.email || '').trim().toLowerCase(); // email mới hoặc email cũ
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ message: 'Email người mua không hợp lệ' });
  inv.buyer.email = to; // lưu email người mua mới
  await inv.save();
  sendInvoiceEmail(inv);
  res.json({ data: { ...inv.toObject(), emailQueuedTo: to } });
});

// @route POST /api/einvoices/:id/cancel { reason } - hủy (giả lập thông báo sai sót mẫu 04/SS-HĐĐT gửi CQT)
const cancel = asyncHandler(async (req, res) => {
  const inv = await loadInvoice(req, res);
  if (!inv) return;
  if (providerLocked(inv)) return res.status(400).json({ message: providerLocked(inv) });
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: 'Nhập lý do hủy hóa đơn (5 - 500 ký tự)' }); // SỬA LỖI: thêm giới hạn tối đa
  const done = await EInvoice.findOneAndUpdate({ _id: inv._id, status: 'issued' }, { $set: { status: 'cancelled', cancelReason: reason, cancelledAt: new Date(), cancelledByName: req.account.name } }, { new: true }); // chỉ hủy hóa đơn đang hiệu lực (1 lần)
  if (!done) return res.status(409).json({ message: 'Hóa đơn đã hủy / đã bị thay thế' });
  res.json({ data: done });
});

// @route POST /api/einvoices/:id/replace { reason, buyer } - lập hóa đơn THAY THẾ (sửa thông tin người mua), hóa đơn cũ chuyển "bị thay thế"
const replace = asyncHandler(async (req, res) => {
  const inv = await loadInvoice(req, res);
  if (!inv) return;
  if (providerLocked(inv)) return res.status(400).json({ message: providerLocked(inv) });
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: 'Nhập lý do lập hóa đơn thay thế (5 - 500 ký tự)' }); // SỬA LỖI: thêm giới hạn tối đa
  const orderNow = await loadOrder(inv.orderId); // tình trạng đơn hiện tại
  const block = orderNow && issueBlocker(orderNow);
  if (block) return res.status(400).json({ message: `Không lập hóa đơn thay thế: ${block}. Hãy hủy hóa đơn này.` }); // đơn đã trả / hoàn tiền -> chỉ được hủy
  const old = await EInvoice.findOneAndUpdate({ _id: inv._id, status: 'issued' }, { $set: { status: 'replaced', cancelReason: reason, cancelledAt: new Date(), cancelledByName: req.account.name } }, { new: true }); // đánh dấu hóa đơn cũ "bị thay thế" trước
  if (!old) return res.status(409).json({ message: 'Chỉ thay thế được hóa đơn đang hiệu lực' });
  const order = await loadOrder(inv.orderId);
  let fresh;
  try { fresh = await issueForOrder(order, { actor: req.account, buyer: { ...old.buyer.toObject(), ...(req.body?.buyer || {}) }, replaces: old }); } // phát hành hóa đơn mới với thông tin đã sửa
  catch (err) { await EInvoice.updateOne({ _id: old._id }, { $set: { status: 'issued' }, $unset: { cancelReason: 1, cancelledAt: 1, cancelledByName: 1 } }); throw err; } // lỗi -> khôi phục hóa đơn cũ
  await EInvoice.updateOne({ _id: old._id }, { replacedById: fresh._id }); // liên kết cũ -> mới
  const queued = req.body?.sendEmail !== false && sendInvoiceEmail(fresh) ? fresh.buyer.email : null;
  res.status(201).json({ data: { ...fresh.toObject(), emailQueuedTo: queued } });
});

// @route GET /api/einvoices/lookup/:code - (công khai) khách tra cứu hóa đơn bằng mã tra cứu
const lookup = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return res.status(400).json({ message: 'Mã tra cứu không hợp lệ' }); // mã tra cứu 6-12 ký tự chữ / số
  const inv = await EInvoice.findOne({ lookupCode: code }).select('-issuedBy -storeId -userId -providerRef').lean(); // bỏ trường nội bộ
  if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn với mã tra cứu này' });
  const verified = withVerify(inv);
  // Ai có mã cũng xem được -> che bớt thông tin liên lạc của người mua
  const mask = (v, keep = 3) => (v ? String(v).slice(0, keep) + '***' + String(v).slice(-2) : v); // "0901234567" -> "090***67"
  verified.buyer = { ...verified.buyer, phone: mask(verified.buyer?.phone), email: verified.buyer?.email ? mask(verified.buyer.email.split('@')[0], 2) + '@' + verified.buyer.email.split('@')[1] : '' };
  res.json({ data: verified });
});

module.exports = { pendingOrders, preview, issue, bulkIssue, list, getOne, byOrder, email, cancel, replace, lookup, issueBlocker };
