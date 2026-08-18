const Warranty = require('../models/Warranty');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

function generateTicketCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BH${Date.now().toString().slice(-6)}${rand}`;
}

const createWarrantyRequest = asyncHandler(async (req, res) => {
  const { orderId, productId, issueDescription, images, method } = req.body;

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
  const { status } = req.query;
  const filter = status ? { status } : {};
  const warranties = await Warranty.find(filter)
    .populate('userId', 'displayName phoneNumber email')
    .populate('productId', 'title')
    .sort({ createdAt: -1 });
  res.json({ data: warranties });
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

module.exports = {
  createWarrantyRequest,
  getMyWarranties,
  trackWarranty,
  submitWarrantyFeedback,
  getAllWarranties,
  updateWarrantyStatus
};
