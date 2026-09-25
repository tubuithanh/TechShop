const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const Voucher = require('../models/Voucher');
const Notification = require('../models/Notification');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');

const SHIPPING_FEE_DEFAULT = 30000;

// Sơ đồ trạng thái đơn hàng hợp lệ - chặn các bước nhảy trạng thái vô lý (VD: đơn đã "delivered"
// bị chuyển thẳng sang "cancelled" sẽ hoàn kho nhầm cho hàng đã giao; đơn "cancelled"/"returned" là
// trạng thái CUỐI, không có đường quay lại để tránh bán trùng số hàng đã được hoàn kho).
const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipping', 'cancelled'],
  shipping: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: []
};
const RESTOCK_STATUSES = ['cancelled', 'returned'];

function generateOrderCode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `DH${Date.now().toString().slice(-6)}${rand}`;
}

async function restoreCartItems(userId, items) {
  if (!items || !items.length) return;
  // $push ở đầu mảng thay vì ghi đè toàn bộ items - tránh xoá mất sản phẩm mà người dùng có thể đã
  // thêm vào giỏ trong lúc đơn hàng trước đó đang được xử lý.
  await Cart.findOneAndUpdate(
    { userId },
    { $push: { items: { $each: items, $position: 0 } } },
    { upsert: true }
  );
}

async function restoreStock(storeId, items) {
  for (const item of items) {
    await StoreInventory.findOneAndUpdate(
      { productId: item.productId, storeId },
      { $inc: { stock: item.quantity }, lastUpdated: new Date() }
    );
  }
}

// @route POST /api/orders
// @desc  Tạo đơn hàng từ giỏ hàng hiện tại - BẮT BUỘC chọn storeId (mô hình multi-store)
const createOrder = asyncHandler(async (req, res) => {
  const { storeId, deliveryAddress, deliveryMethod = 'home_delivery', paymentMode = 'cod', voucherCode, note } =
    req.body;

  if (!storeId) {
    return res.status(400).json({ message: 'Vui lòng chọn cửa hàng xử lý đơn hàng (mô hình đa chi nhánh)' });
  }

  // "Nhận" (claim) giỏ hàng bằng 1 update có điều kiện nguyên tử: chỉ request nào lấy giỏ hàng
  // KHÔNG rỗng và dọn nó về rỗng mới được tiếp tục tạo đơn. Nhờ vậy, bấm "Đặt hàng" 2 lần liên tiếp
  // (double-click) hoặc request bị gửi trùng do mất mạng/thử lại sẽ không tạo ra 2 đơn hàng trùng
  // nhau cho cùng 1 giỏ hàng - request thứ 2 sẽ thấy giỏ hàng đã rỗng và dừng lại ngay.
  const claimedCart = await Cart.findOneAndUpdate(
    { userId: req.account._id, 'items.0': { $exists: true } },
    { $set: { items: [] } },
    { new: false }
  );
  if (!claimedCart) {
    return res.status(400).json({ message: 'Giỏ hàng đang trống' });
  }
  const cartItemsSnapshot = claimedCart.items;

  // Lấy giá HIỆN TẠI của sản phẩm từ database thay vì tin vào unitPrice đã cache trong giỏ hàng -
  // giá sản phẩm có thể đã được admin đổi kể từ lúc khách thêm vào giỏ (giỏ hàng không tự làm mới
  // giá). Đơn hàng luôn tính theo giá thật tại thời điểm đặt hàng.
  const productIds = cartItemsSnapshot.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const orderItems = [];
  for (const item of cartItemsSnapshot) {
    const product = productMap.get(item.productId.toString());
    if (!product || !product.isActive) {
      await restoreCartItems(req.account._id, cartItemsSnapshot);
      return res.status(400).json({ message: `Sản phẩm "${item.name}" không còn kinh doanh` });
    }
    orderItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: product.effectivePrice,
      name: product.title,
      image: product.featuredImage
    });
  }

  const itemsTotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  // Phí ship & ngưỡng miễn phí ship lấy từ cấu hình hệ thống (Admin > Cấu hình hệ thống),
  // fallback về giá trị mặc định nếu admin chưa thiết lập.
  const settings = await Setting.findOne();
  const shippingFeeConfig = settings?.defaultShippingFee ?? SHIPPING_FEE_DEFAULT;
  const freeShippingThreshold = settings?.freeShippingThreshold ?? 0;
  const qualifiesFreeShipping = freeShippingThreshold > 0 && itemsTotal >= freeShippingThreshold;
  const shippingFee = deliveryMethod === 'store_pickup' || qualifiesFreeShipping ? 0 : shippingFeeConfig;

  let voucher = null;
  let discountAmount = 0;
  if (voucherCode) {
    voucher = await Voucher.findOne({ code: voucherCode.toUpperCase() });
    if (!voucher || !voucher.isValidNow()) {
      await restoreCartItems(req.account._id, cartItemsSnapshot);
      return res.status(400).json({ message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' });
    }
    if (itemsTotal < voucher.minOrderValue) {
      await restoreCartItems(req.account._id, cartItemsSnapshot);
      return res.status(400).json({ message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã` });
    }
    if (voucher.perCustomerLimit > 0) {
      const usedByCustomer = await Order.countDocuments({
        userId: req.account._id,
        voucherCode: voucher.code,
        status: { $ne: 'cancelled' }
      });
      if (usedByCustomer >= voucher.perCustomerLimit) {
        await restoreCartItems(req.account._id, cartItemsSnapshot);
        return res.status(400).json({ message: 'Bạn đã sử dụng hết lượt cho mã giảm giá này' });
      }
    }
    // maxDiscountAmount = 0 là admin CHỦ Ý đặt mức trần 0đ (không cho giảm), khác với "chưa thiết
    // lập" (undefined/null = không giới hạn) - dùng kiểm tra kiểu number thay vì `|| Infinity`
    // (0 là falsy nên `0 || Infinity` sẽ SAI thành "không giới hạn").
    const maxDiscount = typeof voucher.maxDiscountAmount === 'number' ? voucher.maxDiscountAmount : Infinity;
    discountAmount =
      voucher.discountType === 'percent'
        ? Math.round(Math.min((itemsTotal * voucher.discountValue) / 100, maxDiscount))
        : Math.round(Math.min(voucher.discountValue, itemsTotal + shippingFee));
  }

  const grandTotal = Math.round(Math.max(itemsTotal + shippingFee - discountAmount, 0));

  // Trừ tồn kho ĐÚNG THEO CỬA HÀNG đã bán, dùng update có điều kiện (stock >= quantity)
  // để tránh race condition khi nhiều đơn cùng tranh chấp đơn vị tồn kho cuối cùng.
  // Nếu một sản phẩm không đủ hàng, hoàn lại các sản phẩm đã trừ trước đó rồi báo lỗi.
  const decremented = [];
  for (const item of orderItems) {
    const updated = await StoreInventory.findOneAndUpdate(
      { productId: item.productId, storeId, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity }, lastUpdated: new Date() },
      { new: true }
    );
    if (!updated) {
      await restoreStock(storeId, decremented);
      await restoreCartItems(req.account._id, cartItemsSnapshot);
      return res.status(400).json({
        message: `Sản phẩm "${item.name}" không đủ tồn kho tại cửa hàng đã chọn`
      });
    }
    decremented.push(item);
  }

  // Trừ lượt dùng voucher bằng update có điều kiện nguyên tử (chỉ thành công nếu vẫn còn lượt tại
  // đúng thời điểm ghi) - 2 đơn hàng tranh chấp lượt dùng cuối cùng của cùng 1 mã giảm giá sẽ không
  // thể cùng lúc "vượt rào" usageLimit như khi đọc-rồi-ghi (read-then-write) không nguyên tử.
  if (voucher) {
    const claimedVoucher = await Voucher.findOneAndUpdate(
      {
        _id: voucher._id,
        $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }]
      },
      { $inc: { usedCount: 1 } },
      { new: true }
    );
    if (!claimedVoucher) {
      await restoreStock(storeId, decremented);
      await restoreCartItems(req.account._id, cartItemsSnapshot);
      return res.status(400).json({ message: 'Mã giảm giá vừa hết lượt sử dụng, vui lòng thử lại' });
    }
  }

  let order;
  try {
    order = await Order.create({
      orderCode: generateOrderCode(),
      userId: req.account._id,
      storeId,
      items: orderItems,
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
  } catch (err) {
    // Tạo đơn thất bại: hoàn lại tồn kho + lượt dùng voucher + giỏ hàng đã trừ/dùng ở trên
    await restoreStock(storeId, decremented);
    if (voucher) await Voucher.findByIdAndUpdate(voucher._id, { $inc: { usedCount: -1 } });
    await restoreCartItems(req.account._id, cartItemsSnapshot);
    throw err;
  }

  for (const item of orderItems) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { soldCount: item.quantity } });
  }

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
  if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes('cancelled')) {
    return res.status(400).json({ message: 'Đơn hàng đã được xử lý, không thể hủy' });
  }

  const cancelReason = req.body.reason || 'Khách hàng yêu cầu hủy';

  // Update có điều kiện: chỉ thắng nếu status ĐÚNG BẰNG status vừa đọc ở trên - nếu 1 request khác
  // (double-click, tab khác) đã hủy đơn này trước, request này sẽ nhận null và dừng lại, tránh hoàn
  // kho 2 lần cho cùng 1 đơn hàng.
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: { status: 'cancelled', cancelReason },
      $push: { statusHistory: { status: 'cancelled', note: cancelReason, changedBy: req.account._id } }
    },
    { new: true }
  );
  if (!updated) {
    return res.status(409).json({ message: 'Đơn hàng vừa được cập nhật, vui lòng tải lại trang' });
  }

  await restoreStock(order.storeId, order.items);
  res.json({ data: updated });
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

  const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(400).json({
      message: `Không thể chuyển đơn hàng từ trạng thái "${order.status}" sang "${status}"`
    });
  }

  // Update có điều kiện (status hiện tại phải khớp đúng status vừa đọc) - đảm bảo 2 request cập
  // nhật trạng thái đồng thời không thể cùng vượt qua kiểm tra rồi cùng hoàn kho / cùng ghi đè
  // trạng thái của nhau.
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: {
        status,
        ...(status === 'delivered' && order.paymentMode === 'cod' ? { paymentStatus: 'paid' } : {})
      },
      $push: { statusHistory: { status, note, changedBy: req.account._id } }
    },
    { new: true }
  );
  if (!updated) {
    return res.status(409).json({ message: 'Đơn hàng vừa được cập nhật bởi người khác, vui lòng tải lại' });
  }

  if (RESTOCK_STATUSES.includes(status)) {
    await restoreStock(order.storeId, order.items);
  }

  await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Cập nhật đơn hàng',
    message: `Đơn hàng ${order.orderCode} đã chuyển sang trạng thái "${status}"`,
    link: `/orders/${order._id}`
  });

  const io = req.app.get('io');
  if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status });

  res.json({ data: updated });
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus
};
