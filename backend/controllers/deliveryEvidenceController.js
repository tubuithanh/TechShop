const multer = require('multer');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Evidence = require('../models/DeliveryEvidence');
const { hasPermission } = require('../middlewares/authMiddleware');
const { inScope } = require('./orderController');
const { detectImageMime } = require('./uploadController');
const asyncHandler = require('../utils/asyncHandler');
const { workingStore, idOf } = require('../utils/shipperScope');
const { activeShipment } = require('../utils/deliveryRouting');
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 5 * 1024 * 1024 } });
const load = async (req, res, next) => {
  try {
    const order = mongoose.isValidObjectId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    const own = hasPermission(req, 'deliveries.perform') && inScope(req, order) && String(order.shipperId) === String(req.account._id);
    const manager = (hasPermission(req, 'orders.manage') || hasPermission(req, 'deliveries.manage')) && inScope(req, order);
    const customer = req.accountRole === 'customer' && String(order.userId) === String(req.account._id);
    if (req.method === 'POST' && (activeShipment(order) || idOf(await workingStore(req.account)) !== idOf(order.storeId))) return res.status(403).json({ message: 'Chỉ nhân viên đang giao tại chi nhánh này được tải bằng chứng' });
    if (req.method === 'POST' ? !own || order.status !== 'shipping' : !(own || manager || customer)) {
      return res.status(403).json({ message: 'Không có quyền truy cập bằng chứng giao hàng' });
    }
    req.deliveryOrder = order;
    next();
  } catch (err) { next(err); }
};
const parse = (req, res, next) => upload.array('images', 5)(req, res, err => err
  ? res.status(400).json({ message: 'Tối đa 5 ảnh JPG/PNG/WEBP, mỗi ảnh tối đa 5MB' }) : next());
const loadCarrier = asyncHandler(async (req, res, next) => {
  const order = mongoose.isValidObjectId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  if (!inScope(req, order)) return res.status(403).json({ message: 'Đơn thuộc chi nhánh khác' });
  const stage = req.params.stage;
  const valid = stage === 'picked' ? order.status === 'processing' && order.shipment?.status === 'ready_to_pick' : stage === 'delivered' && order.status === 'shipping' && order.shipment?.status === 'delivering';
  if (order.shipment?.environment !== 'simulation' || order.shipment?.phase !== 'active' || !valid) return res.status(409).json({ message: 'Đơn chưa ở bước nhận hàng hoặc giao thành công' });
  req.deliveryOrder = order;
  req.carrierEvidence = { carrierCode: order.shipment.code, carrierStage: stage };
  next();
});
const save = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length || files.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(detectImageMime(f.buffer)))) {
    return res.status(400).json({ message: 'Cần ảnh JPG, PNG hoặc WEBP hợp lệ' });
  }
  // Bound abandoned uploads per order as well as per-request size.
  if (await Evidence.countDocuments({ orderId: req.deliveryOrder._id, expiresAt: { $exists: true } }) + files.length > 20) {
    return res.status(429).json({ message: 'Đã đạt giới hạn ảnh tạm cho đơn này, vui lòng dùng ảnh đã tải' });
  }
  const docs = await Evidence.insertMany(files.map(f => ({ orderId: req.deliveryOrder._id, uploadedBy: req.account._id, ...req.carrierEvidence, mimeType: detectImageMime(f.buffer), data: f.buffer, expiresAt: new Date(Date.now() + 86400000) })));
  res.status(201).json({ data: docs.map(d => ({ _id: d._id })) });
});
const download = asyncHandler(async (req, res) => {
  const order = req.deliveryOrder;
  const allowed = [...(order.handover?.evidenceIds || []), ...(order.carrierPickupProof?.evidenceIds || []), ...(order.carrierDeliveryProof?.evidenceIds || [])];
  if (!mongoose.isValidObjectId(req.params.evidenceId) || !allowed.some(id => String(id) === req.params.evidenceId)) {
    return res.status(404).json({ message: 'Không tìm thấy ảnh bàn giao' });
  }
  const doc = await Evidence.findOne({ _id: req.params.evidenceId, orderId: order._id, expiresAt: { $exists: false } }).select('+data');
  if (!doc) return res.status(404).json({ message: 'Không tìm thấy ảnh bàn giao' });
  res.set({ 'Content-Type': doc.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.send(doc.data);
});
module.exports = { load, loadCarrier, parse, save, download };
