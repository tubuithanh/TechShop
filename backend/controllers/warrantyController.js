const Warranty = require('../models/Warranty');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

function generateTicketCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BH${Date.now().toString().slice(-6)}${rand}`;
}

const MAX_WARRANTY_IMAGES = 10;

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

  res.status(201).json({ data: warranty });
});

const getMyWarranties = asyncHandler(async (req, res) => {
  const warranties = await Warranty.find({ userId: req.account._id }).sort({ createdAt: -1 });
  res.json({ data: warranties });
});

const trackWarranty = asyncHandler(async (req, res) => {
  const warranty = await Warranty.findOne({ ticketCode: req.params.code }).populate('productId', 'title featuredImage');
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  res.json({ data: warranty });
});

const submitWarrantyFeedback = asyncHandler(async (req, res) => {
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  if (warranty.userId.toString() !== req.account._id.toString()) {
    return res.status(403).json({ message: 'Không có quyền thao tác' });
  }
  warranty.customerRating = req.body.rating;
  warranty.customerFeedback = req.body.feedback;
  await warranty.save();
  res.json({ data: warranty });
});

const getAllWarranties = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = status ? { status } : {};
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
