const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const Voucher = require('../models/Voucher');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

const SHIPPING_FEE_DEFAULT = 30000;

function generateOrderCode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `DH${Date.now().toString().slice(-6)}${rand}`;
}

// @route POST /api/orders
// @desc  Tạo đơn hàng từ giỏ hàng hiện tại - BẮT BUỘC chọn storeId (mô hình multi-store)
const createOrder = asyncHandler(async (req, res) => {
  const { storeId, deliveryAddress, deliveryMethod = 'home_delivery', paymentMode = 'cod', voucherCode, note } =
    req.body;

  if (!storeId) {
    return res.status(400).json({ message: 'Vui lòng chọn cửa hàng xử lý đơn hàng (mô hình đa chi nhánh)' });
  }

  const cart = await Cart.findOne({ userId: req.account._id });
  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ message: 'Giỏ hàng đang trống' });
  }

  // Kiểm tra tồn kho THEO ĐÚNG CỬA HÀNG đã chọn trước khi tạo đơn
  for (const item of cart.items) {
    const inventory = await StoreInventory.findOne({ productId: item.productId, storeId });
    if (!inventory || inventory.stock < item.quantity) {
      return res.status(400).json({
        message: `Sản phẩm "${item.name}" không đủ tồn kho tại cửa hàng đã chọn`
      });
    }
  }

  const itemsTotal = cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const shippingFee = deliveryMethod === 'store_pickup' ? 0 : SHIPPING_FEE_DEFAULT;

  let discountAmount = 0;
  if (voucherCode) {
    const voucher = await Voucher.findOne({ code: voucherCode.toUpperCase() });
    if (!voucher || !voucher.isValidNow()) {
      return res.status(400).json({ message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' });
    }
    if (itemsTotal < voucher.minOrderValue) {
      return res.status(400).json({ message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã` });
    }
    discountAmount =
      voucher.discountType === 'percent'
        ? Math.min((itemsTotal * voucher.discountValue) / 100, voucher.maxDiscountAmount || Infinity)
        : voucher.discountValue;
    voucher.usedCount += 1;
    await voucher.save();
  }

  const grandTotal = Math.max(itemsTotal + shippingFee - discountAmount, 0);

  const order = await Order.create({
    orderCode: generateOrderCode(),
    userId: req.account._id,
    storeId,
    items: cart.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      name: i.name,
      image: i.image
    })),
    deliveryAddress,
    deliveryMethod,
    paymentMode,
    itemsTotal,
    shippingFee,
    discountAmount,
    voucherCode: voucherCode || null,
    grandTotal,
    note,
    statusHistory: [{ status: 'pending', note: 'Đơn hàng được tạo', changedBy: req.account._id }]
  });

  // Trừ tồn kho ĐÚNG THEO CỬA HÀNG đã bán (mô hình multi-store)
  for (const item of cart.items) {
    await StoreInventory.findOneAndUpdate(
      { productId: item.productId, storeId },
      { $inc: { stock: -item.quantity }, lastUpdated: new Date() }
    );
    await Product.findByIdAndUpdate(item.productId, { $inc: { soldCount: item.quantity } });
  }

  cart.items = [];
  await cart.save();

  await Notification.create({
    userId: req.account._id,
    type: 'order',
    title: 'Đặt hàng thành công',
    message: `Đơn hàng ${order.orderCode} đã được tiếp nhận`,
    link: `/orders/${order._id}`
  });

  const io = req.app.get('io');
  if (io) io.to(`user_${req.account._id}`).emit('order:created', { orderId: order._id, orderCode: order.orderCode });

  res.status(201).json({ data: order });
});

// @route GET /api/orders
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.account._id }).populate('storeId', 'name city').sort({ createdAt: -1 });
  res.json({ data: orders });
});

// @route GET /api/orders/:id
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('storeId', 'name city address phoneNumber');
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

  const isOwner = order.userId.toString() === req.account._id.toString();
  const isStaffOrAdmin = ['staff', 'admin'].includes(req.accountRole);
  if (!isOwner && !isStaffOrAdmin) {
    return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này' });
  }
  res.json({ data: order });
});

// @route PUT /api/orders/:id/cancel
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (order.userId.toString() !== req.account._id.toString()) {
    return res.status(403).json({ message: 'Bạn không có quyền hủy đơn hàng này' });
  }
  if (!['pending', 'confirmed'].includes(order.status)) {
    return res.status(400).json({ message: 'Đơn hàng đã được xử lý, không thể hủy' });
  }

  // Hoàn lại tồn kho về đúng cửa hàng đã bán
  for (const item of order.items) {
    await StoreInventory.findOneAndUpdate(
      { productId: item.productId, storeId: order.storeId },
      { $inc: { stock: item.quantity }, lastUpdated: new Date() }
    );
  }

  order.status = 'cancelled';
  order.cancelReason = req.body.reason || 'Khách hàng yêu cầu hủy';
  order.statusHistory.push({ status: 'cancelled', note: order.cancelReason, changedBy: req.account._id });
  await order.save();
  res.json({ data: order });
});

// ---------- ADMIN/STAFF ----------

// @route GET /api/orders/admin/all?storeId=
const getAllOrders = asyncHandler(async (req, res) => {
  const { status, storeId, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (storeId) filter.storeId = storeId;

  const orders = await Order.find(filter)
    .populate('userId', 'displayName email phoneNumber')
    .populate('storeId', 'name city')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Order.countDocuments(filter);
  res.json({ data: orders, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// @route PUT /api/orders/:id/status
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled', 'returned'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

  order.status = status;
  order.statusHistory.push({ status, note, changedBy: req.account._id });
  if (status === 'delivered') order.paymentStatus = order.paymentMode === 'cod' ? 'paid' : order.paymentStatus;
  await order.save();

  await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Cập nhật đơn hàng',
    message: `Đơn hàng ${order.orderCode} đã chuyển sang trạng thái "${status}"`,
    link: `/orders/${order._id}`
  });

  const io = req.app.get('io');
  if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status });

  res.json({ data: order });
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus
};
