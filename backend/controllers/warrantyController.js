const mongoose = require('mongoose');
const Warranty = require('../models/Warranty');
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { emailWarranty } = require('../utils/notifyEmail');
const { searchFilter } = require('../utils/search');
const { normalizePhone } = require('../utils/customerValidation');

function generateTicketCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BH${Date.now().toString().slice(-6)}${rand}`;
}

const MAX_WARRANTY_IMAGES = 10;

// Quy trình phiếu bảo hành: tiếp nhận -> kiểm tra -> sửa chữa / chờ linh kiện -> hoàn tất -> trả máy cho khách.
// Kiểm tra xong không có lỗi thì "hoàn tất" luôn. Trước đây không có quy tắc nào: phiếu đã trả máy có thể bị
// chuyển ngược về "tiếp nhận", hoặc nhảy thẳng từ "tiếp nhận" sang "hoàn tất".
const WARRANTY_TRANSITIONS = {
  received: ['checking'],
  checking: ['repairing', 'waiting_parts', 'done'],
  repairing: ['waiting_parts', 'done'],
  waiting_parts: ['repairing', 'done'],
  done: ['returned'],
  returned: []
};
const FINISHED = ['done', 'returned'];

// Kiểm tra các trường nhân viên gửi lên khi cập nhật phiếu; trả về thông báo lỗi hoặc null
async function validateWarrantyUpdate(warranty, { status, cost, assignedTo }) {
  if (status !== undefined && status !== warranty.status && !(WARRANTY_TRANSITIONS[warranty.status] || []).includes(status)) {
    return `Không thể chuyển phiếu từ "${warranty.status}" sang "${status}"`;
  }
  if (cost !== undefined && !(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0)) return 'Chi phí phải là số >= 0';
  if (assignedTo) {
    // Người phụ trách phải là tài khoản quản trị còn hoạt động có quyền xử lý bảo hành
    const staff = mongoose.isValidObjectId(assignedTo)
      ? await Admin.findOne({ _id: assignedTo, isActive: true }).populate('groupIds', 'permissions')
      : null;
    const canHandle = staff && (staff.role === 'admin' || (staff.groupIds || []).some((g) => g.permissions?.includes('warranties.manage')));
    if (!canHandle) return 'Người phụ trách phải là nhân viên có quyền xử lý bảo hành';
  }
  return null;
}

const createWarrantyRequest = asyncHandler(async (req, res) => {
  const { orderId, productId, issueDescription, returnReason, images, method } = req.body;

  if (images && images.length > MAX_WARRANTY_IMAGES) {
    return res.status(400).json({ message: `Chỉ được đính kèm tối đa ${MAX_WARRANTY_IMAGES} ảnh` });
  }

  const order = await Order.findOne({ _id: orderId, userId: req.account._id, status: 'delivered' });
  if (!order) {
    return res.status(400).json({ message: 'Không tìm thấy đơn hàng đã giao thành công để yêu cầu bảo hành' });
  }
  const item = order.items.find((i) => i.productId.toString() === productId);
  if (!item) {
    return res.status(400).json({ message: 'Sản phẩm này không có trong đơn hàng đã chọn' });
  }

  // Kiểm tra sản phẩm còn trong thời hạn bảo hành (warrantyMonths tính từ ngày đơn hàng chuyển sang
  // "delivered") - trước đây chỉ kiểm tra đơn hàng ĐÃ giao mà không kiểm tra ĐÃ GIAO BAO LÂU, nên
  // đơn giao từ nhiều năm trước vẫn tạo được yêu cầu bảo hành hợp lệ.
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  // 1 sản phẩm của 1 đơn chỉ có 1 phiếu đang xử lý: trước đây gửi lại nhiều lần tạo nhiều phiếu trùng
  const open = await Warranty.findOne({ orderId, productId, userId: req.account._id, status: { $nin: FINISHED } });
  if (open) return res.status(409).json({ message: `Sản phẩm này đang có phiếu bảo hành ${open.ticketCode} chưa xử lý xong` });
  const deliveredEntry = [...order.statusHistory].reverse().find((h) => h.status === 'delivered');
  const deliveredAt = deliveredEntry?.changedAt || order.createdAt;
  const warrantyMonths = product.warrantyMonths ?? 12;
  const expiryDate = new Date(deliveredAt);
  expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
  if (warrantyMonths > 0 && new Date() > expiryDate) {
    return res.status(400).json({
      message: `Sản phẩm đã hết hạn bảo hành (${warrantyMonths} tháng kể từ ngày giao hàng ${deliveredAt.toLocaleDateString('vi-VN')})`
    });
  }

  const warranty = await Warranty.create({
    ticketCode: generateTicketCode(),
    userId: req.account._id,
    orderId,
    productId,
    productName: item.name,
    issueDescription,
    returnReason,
    images,
    method: method || 'bring_to_store',
    statusHistory: [{ status: 'received', note: 'Tiếp nhận yêu cầu bảo hành', changedBy: req.account._id }]
  });

  emailWarranty(warranty, { created: true }); // email xác nhận tiếp nhận kèm mã phiếu (chạy nền)
  res.status(201).json({ data: warranty });
});

const getMyWarranties = asyncHandler(async (req, res) => {
  const warranties = await Warranty.find({ userId: req.account._id }).sort({ createdAt: -1 });
  res.json({ data: warranties });
});

// @route GET /api/warranties/track/:code?phone= - tra cứu công khai (trang "Tra cứu bảo hành", không cần
// đăng nhập). Bắt buộc kèm số điện thoại của đơn hàng/tài khoản để người khác đoán được mã phiếu cũng không
// xem được; chỉ trả về thông tin cần cho khách theo dõi (không lộ mô tả lỗi, ảnh, mã nội bộ, nhân viên xử lý).
const trackWarranty = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const phone = normalizePhone(req.query.phone);
  const notFound = () => res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành khớp mã phiếu và số điện thoại' });
  if (!code || !phone) return res.status(400).json({ message: 'Vui lòng nhập mã phiếu bảo hành và số điện thoại' });

  const warranty = await Warranty.findOne({ ticketCode: code })
    .populate('productId', 'title featuredImage')
    .populate('orderId', 'orderCode deliveryAddress.phone')
    .populate('userId', 'phoneNumber');
  if (!warranty) return notFound();
  const phones = [warranty.orderId?.deliveryAddress?.phone, warranty.userId?.phoneNumber].map(normalizePhone).filter(Boolean);
  if (!phones.includes(phone)) return notFound(); // cùng thông báo - không tiết lộ mã phiếu có tồn tại hay không

  res.json({
    data: {
      ticketCode: warranty.ticketCode,
      productName: warranty.productId?.title || warranty.productName,
      productImage: warranty.productId?.featuredImage || '',
      orderCode: warranty.orderId?.orderCode,
      method: warranty.method,
      status: warranty.status,
      cost: warranty.cost,
      createdAt: warranty.createdAt,
      updatedAt: warranty.updatedAt,
      timeline: (warranty.statusHistory || []).map((h) => ({ status: h.status, note: h.note, changedAt: h.changedAt }))
    }
  });
});

const submitWarrantyFeedback = asyncHandler(async (req, res) => {
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  if (warranty.userId.toString() !== req.account._id.toString()) {
    return res.status(403).json({ message: 'Không có quyền thao tác' });
  }
  // Chỉ đánh giá được khi phiếu đã xử lý xong (trước đây đánh giá được cả khi máy còn đang sửa); 1 – 5 sao
  if (!FINISHED.includes(warranty.status)) {
    return res.status(400).json({ message: 'Chỉ đánh giá được khi phiếu bảo hành đã xử lý xong' });
  }
  const { rating } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Số sao từ 1 đến 5' });
  const feedback = typeof req.body.feedback === 'string' ? req.body.feedback.trim().slice(0, 1000) : '';
  warranty.customerRating = rating;
  warranty.customerFeedback = feedback;
  await warranty.save();
  res.json({ data: warranty });
});

const getAllWarranties = asyncHandler(async (req, res) => {
  const { status, method, q, page = 1, limit = 20 } = req.query;
  const filter = status ? { status } : {};
  if (method) filter.method = method;
  Object.assign(filter, searchFilter(q)); // mã phiếu, mã đơn, SĐT, tên sản phẩm (không dấu)
  const warranties = await Warranty.find(filter)
    .populate('userId', 'displayName phoneNumber email')
    .populate('productId', 'title')
    .populate('statusHistory.changedBy', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Warranty.countDocuments(filter);
  res.json({ data: warranties, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

const updateWarrantyStatus = asyncHandler(async (req, res) => {
  const { status, note, cost, assignedTo } = req.body;
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  if (status === undefined) return res.status(400).json({ message: 'Vui lòng chọn trạng thái' });
  const invalid = await validateWarrantyUpdate(warranty, { status, cost, assignedTo });
  if (invalid) return res.status(400).json({ message: invalid });

  warranty.status = status;
  if (cost !== undefined) warranty.cost = cost;
  if (assignedTo) warranty.assignedTo = assignedTo;
  warranty.statusHistory.push({ status, note, changedBy: req.account._id });
  await warranty.save();

  await Notification.create({
    userId: warranty.userId,
    type: 'warranty',
    title: 'Cập nhật bảo hành',
    message: `Phiếu bảo hành ${warranty.ticketCode} đã chuyển sang trạng thái "${status}"`,
    link: `/warranties/${warranty._id}`
  });
  emailWarranty(warranty, { note });

  const io = req.app.get('io');
  if (io) io.to(`user_${warranty.userId}`).emit('warranty:statusUpdated', { warrantyId: warranty._id, status });

  res.json({ data: warranty });
});

// @route PUT /api/warranties/:id - chỉnh sửa toàn diện phiếu bảo hành (chỉ admin/staff):
// mô tả lỗi, lý do trả hàng, trạng thái, ghi chú xử lý, chi phí sửa chữa - dùng cho modal
// "Sửa" ở trang quản trị, khác với /:id/status chỉ đổi nhanh trạng thái ngay trong bảng.
const updateWarranty = asyncHandler(async (req, res) => {
  const { issueDescription, returnReason, status, note, cost, assignedTo, images } = req.body;
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  const invalid = await validateWarrantyUpdate(warranty, { status, cost, assignedTo });
  if (invalid) return res.status(400).json({ message: invalid });

  if (images !== undefined) {
    if (images.length > MAX_WARRANTY_IMAGES) {
      return res.status(400).json({ message: `Chỉ được đính kèm tối đa ${MAX_WARRANTY_IMAGES} ảnh` });
    }
    warranty.images = images;
  }
  if (issueDescription !== undefined) warranty.issueDescription = issueDescription;
  if (returnReason !== undefined) warranty.returnReason = returnReason;
  if (cost !== undefined) warranty.cost = cost;
  if (assignedTo !== undefined) warranty.assignedTo = assignedTo || null;

  const statusChanged = status !== undefined && status !== warranty.status;
  if (statusChanged) warranty.status = status;
  if (statusChanged || (note && note.trim())) {
    warranty.statusHistory.push({ status: warranty.status, note, changedBy: req.account._id });
  }
  await warranty.save();

  if (statusChanged) {
    await Notification.create({
      userId: warranty.userId,
      type: 'warranty',
      title: 'Cập nhật bảo hành',
      message: `Phiếu bảo hành ${warranty.ticketCode} đã chuyển sang trạng thái "${status}"`,
      link: `/warranties/${warranty._id}`
    });
    emailWarranty(warranty, { note });
    const io = req.app.get('io');
    if (io) io.to(`user_${warranty.userId}`).emit('warranty:statusUpdated', { warrantyId: warranty._id, status });
  }

  res.json({ data: warranty });
});

module.exports = {
  createWarrantyRequest,
  getMyWarranties,
  trackWarranty,
  submitWarrantyFeedback,
  getAllWarranties,
  updateWarrantyStatus,
  updateWarranty
};
