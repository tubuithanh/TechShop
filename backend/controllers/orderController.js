const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const Notification = require('../models/Notification');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');
const { emailOrderPlaced, emailOrderStatus } = require('../utils/notifyEmail');
const { searchFilter } = require('../utils/search');
const { hasPermission, getScopedStoreId } = require('../middlewares/authMiddleware');
const { releaseVoucher } = require('../utils/voucherUsage');
const { withTransaction, BusinessError } = require('../utils/transaction');
const { validatePhone } = require('../utils/customerValidation');

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


// Lọc theo khoảng ngày tạo: from/to dạng YYYY-MM-DD (to tính tới hết ngày đó)
function dateRange(from, to) {
  const range = {};
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(new Date(to).getTime() + 24 * 3600 * 1000 - 1);
  return Object.keys(range).length ? range : null;
}

// Đơn có thuộc phạm vi chi nhánh của tài khoản đang thao tác không (admin/staff không gắn chi nhánh: luôn đúng)
function inScope(req, order) {
  const scopedStoreId = getScopedStoreId(req);
  return !scopedStoreId || String(order.storeId?._id || order.storeId) === scopedStoreId;
}

function generateOrderCode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `DH${Date.now().toString().slice(-6)}${rand}`;
}

async function restoreCartItems(userId, items) {
  if (!items || !items.length) return;
  // Gộp lại theo productId thay vì $push thẳng snapshot cũ vào - nếu khách đã lỡ thêm lại đúng sản
  // phẩm đó vào giỏ (đang rỗng) trong lúc đơn hàng trước đó bị từ chối (hết hàng/voucher hết lượt),
  // tránh tạo ra 2 dòng riêng biệt cho cùng 1 sản phẩm trong giỏ hàng.
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    await Cart.create({ userId, items });
    return;
  }
  for (const restored of items) {
    const existing = cart.items.find(
      (i) =>
        i.productId.toString() === restored.productId.toString() &&
        String(i.variantId) === String(restored.variantId)
    );
    if (existing) {
      existing.quantity += restored.quantity;
    } else {
      cart.items.push({
        productId: restored.productId,
        variantId: restored.variantId,
        variantLabel: restored.variantLabel,
        name: restored.name,
        image: restored.image,
        unitPrice: restored.unitPrice,
        quantity: restored.quantity
      });
    }
  }
  await cart.save();
}

// Hoàn kho đúng phiên bản đã bán. Đơn hàng cũ (trước khi có phiên bản) đã được migration gán variantId
// (seed/migrateVariants.js); nếu vẫn thiếu thì KHÔNG đoán bừa phiên bản nào để cộng kho.
async function restoreStock(storeId, items, session = null) {
  for (const item of items) {
    if (!item.variantId) {
      console.warn(`[restoreStock] Bỏ qua dòng hàng thiếu variantId (sản phẩm ${item.productId})`);
      continue;
    }
    await StoreInventory.findOneAndUpdate(
      { productId: item.productId, variantId: item.variantId, storeId },
      { $inc: { stock: item.quantity }, lastUpdated: new Date() },
      { session }
    );
  }
}

// Cộng / trừ số lượng "đã bán" của sản phẩm (sign = 1 | -1). Không bao giờ để âm. Chỉ phục vụ hiển thị
// và thống kê bán chạy, nên lỗi ở đây chỉ ghi log, không làm hỏng việc đổi trạng thái đơn đã thành công.
async function adjustSoldCount(items, sign, session = null) {
  for (const item of items) {
    try {
      await Product.updateOne({ _id: item.productId }, [
        { $set: { soldCount: { $max: [0, { $add: [{ $ifNull: ['$soldCount', 0] }, sign * item.quantity] }] } } }
      ], { session });
    } catch (err) {
      if (session) throw err; // trong transaction: để cả khối hủy
      console.error(`Lỗi cập nhật soldCount cho sản phẩm ${item.productId}:`, err.message);
    }
  }
}

const DELIVERY_METHODS = ['home_delivery', 'store_pickup'];
const text = (v) => (typeof v === 'string' ? v.trim() : '');
function validateDeliveryAddress(address, deliveryMethod) {
  if (!address || typeof address !== 'object') return 'Vui lòng nhập thông tin người nhận';
  if (!text(address.fullName)) return 'Vui lòng nhập họ tên người nhận';
  const phoneError = validatePhone(address.phone);
  if (phoneError) return phoneError;
  if (deliveryMethod === 'home_delivery' && (!text(address.addressLine1) || !text(address.city))) {
    return 'Giao tận nơi cần có số nhà / đường và tỉnh / thành phố';
  }
  return null;
}

// Các bước tạo đơn: lấy giỏ, tính tiền theo giá hiện tại, kiểm tra mã giảm giá, trừ kho, giữ lượt mã, tạo đơn.
// Chạy trong transaction (session): lỗi ở BẤT KỲ bước nào MongoDB tự hủy mọi thao tác đã ghi, kể cả khi máy
// chủ dừng đột ngột giữa chừng. Không có transaction (MongoDB đơn lẻ lúc lập trình) thì hoàn tác thủ công
// theo danh sách `undo`. Lỗi nghiệp vụ ném BusinessError (mã HTTP + thông báo cho khách).
async function placeOrder(userId, input, session) {
  const { storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode, note } = input;
  const undo = [];
  const rollback = async () => {
    if (session) return; // transaction tự hủy
    for (const step of undo.reverse()) await step();
  };
  const fail = async (status, message) => {
    await rollback();
    throw new BusinessError(status, message);
  };

  try {
    // "Nhận" giỏ hàng bằng 1 lệnh có điều kiện: chỉ request lấy được giỏ KHÔNG rỗng và dọn nó về rỗng mới
    // được tạo đơn - bấm "Đặt hàng" 2 lần (hoặc gửi trùng do mất mạng) không tạo 2 đơn.
    const claimedCart = await Cart.findOneAndUpdate(
      { userId, 'items.0': { $exists: true } },
      { $set: { items: [] } },
      { new: false, session }
    );
    if (!claimedCart) throw new BusinessError(400, 'Giỏ hàng đang trống');
    const cartItemsSnapshot = claimedCart.items;
    undo.push(() => restoreCartItems(userId, cartItemsSnapshot));

    // Giá HIỆN TẠI của từng phiên bản, không tin giá đã lưu trong giỏ (giá có thể đã đổi)
    const products = await Product.find({ _id: { $in: cartItemsSnapshot.map((i) => i.productId) } }, null, { session });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const orderItems = [];
    for (const item of cartItemsSnapshot) {
      const product = productMap.get(item.productId.toString());
      const variant = product?.variants.id(item.variantId);
      if (!product || !product.isActive || !variant || !variant.isActive) {
        const label = item.variantLabel ? ` (${item.variantLabel})` : '';
        return await fail(400, `Sản phẩm "${item.name}${label}" không còn kinh doanh`);
      }
      orderItems.push({
        productId: item.productId,
        variantId: variant._id,
        variantLabel: variant.label,
        quantity: item.quantity,
        unitPrice: variant.effectivePrice,
        name: product.title,
        image: variant.image || product.featuredImage
      });
    }
    const itemsTotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    // Phí ship và ngưỡng miễn phí ship theo cấu hình hệ thống
    const settings = await Setting.findOne({}, null, { session });
    const shippingFeeConfig = settings?.defaultShippingFee ?? SHIPPING_FEE_DEFAULT;
    const freeShippingThreshold = settings?.freeShippingThreshold ?? 0;
    const qualifiesFreeShipping = freeShippingThreshold > 0 && itemsTotal >= freeShippingThreshold;
    const shippingFee = deliveryMethod === 'store_pickup' || qualifiesFreeShipping ? 0 : shippingFeeConfig;

    let voucher = null;
    let discountAmount = 0;
    if (voucherCode) {
      voucher = await Voucher.findOne({ code: String(voucherCode).toUpperCase() }, null, { session });
      if (!voucher || !voucher.isValidNow()) return await fail(400, 'Mã giảm giá không hợp lệ hoặc đã hết hạn');
      if (itemsTotal < voucher.minOrderValue) {
        return await fail(400, `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã`);
      }
      if (voucher.perCustomerLimit > 0) {
        // Đơn đã hủy / trả hàng không tính lượt (khách không thật sự hưởng giảm giá)
        const usedByCustomer = await Order.countDocuments(
          { userId, voucherCode: voucher.code, status: { $nin: ['cancelled', 'returned'] } },
          { session }
        );
        if (usedByCustomer >= voucher.perCustomerLimit) return await fail(400, 'Bạn đã sử dụng hết lượt cho mã giảm giá này');
      }
      // maxDiscountAmount = 0 là cố ý đặt trần 0đ, khác "chưa đặt" (không giới hạn)
      const maxDiscount = typeof voucher.maxDiscountAmount === 'number' ? voucher.maxDiscountAmount : Infinity;
      discountAmount =
        voucher.discountType === 'percent'
          ? Math.round(Math.min((itemsTotal * voucher.discountValue) / 100, maxDiscount))
          : Math.round(Math.min(voucher.discountValue, itemsTotal + shippingFee));
    }
    const grandTotal = Math.round(Math.max(itemsTotal + shippingFee - discountAmount, 0));

    // Trừ kho đúng chi nhánh bằng lệnh có điều kiện (stock >= số lượng): 2 đơn tranh món cuối chỉ 1 đơn được
    for (const item of orderItems) {
      const updated = await StoreInventory.findOneAndUpdate(
        { productId: item.productId, variantId: item.variantId, storeId, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity }, lastUpdated: new Date() },
        { new: true, session }
      );
      if (!updated) return await fail(400, `Sản phẩm "${item.name} (${item.variantLabel})" không đủ tồn kho tại cửa hàng đã chọn`);
      undo.push(() => restoreStock(storeId, [item]));
    }

    // Giữ 1 lượt mã bằng lệnh có điều kiện "còn lượt": 2 đơn tranh lượt cuối chỉ 1 đơn được
    if (voucher) {
      const claimedVoucher = await Voucher.findOneAndUpdate(
        { _id: voucher._id, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
        { $inc: { usedCount: 1 } },
        { new: true, session }
      );
      if (!claimedVoucher) return await fail(400, 'Mã giảm giá vừa hết lượt sử dụng, vui lòng thử lại');
      undo.push(() => Voucher.updateOne({ _id: voucher._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }));
    }

    const [order] = await Order.create(
      [
        {
          orderCode: generateOrderCode(),
          userId,
          storeId,
          items: orderItems,
          deliveryAddress,
          deliveryMethod,
          paymentMode,
          itemsTotal,
          shippingFee,
          discountAmount,
          voucherCode: voucher ? voucher.code : null,
          grandTotal,
          note,
          statusHistory: [{ status: 'pending', note: 'Đơn hàng được tạo', changedBy: userId }]
        }
      ],
      { session }
    );
    return order;
  } catch (err) {
    if (!(err instanceof BusinessError)) await rollback(); // lỗi bất ngờ (VD lưu đơn thất bại)
    throw err;
  }
}

// @route POST /api/orders
// @desc  Tạo đơn hàng từ giỏ hàng hiện tại - BẮT BUỘC chọn storeId (mô hình multi-store)
const createOrder = asyncHandler(async (req, res) => {
  const { storeId, deliveryAddress, deliveryMethod = 'home_delivery', paymentMode = 'cod', voucherCode, note } =
    req.body;

  if (req.accountRole !== 'customer') {
    return res.status(403).json({ message: 'Chỉ tài khoản khách hàng mới đặt hàng được' });
  }
  if (!storeId) {
    return res.status(400).json({ message: 'Vui lòng chọn cửa hàng xử lý đơn hàng (mô hình đa chi nhánh)' });
  }
  // Trang thanh toán chỉ liệt kê cửa hàng đang hoạt động, nhưng API phải tự kiểm tra: trước đây vẫn đặt
  // được đơn vào chi nhánh đã đóng (nếu còn dòng tồn kho) - đơn đó không ai xử lý.
  if (!mongoose.isValidObjectId(storeId) || !(await Store.exists({ _id: storeId, isActive: { $ne: false } }))) {
    return res.status(400).json({ message: 'Cửa hàng đã chọn không tồn tại hoặc đã ngừng hoạt động' });
  }
  if (!DELIVERY_METHODS.includes(deliveryMethod)) {
    return res.status(400).json({ message: 'Hình thức nhận hàng không hợp lệ' });
  }
  // Người nhận (tên + SĐT) luôn bắt buộc; giao tận nơi cần thêm địa chỉ và tỉnh/thành. Trước đây không
  // kiểm tra gì - gọi thẳng API vẫn tạo được đơn giao tận nơi không có địa chỉ.
  const addressError = validateDeliveryAddress(deliveryAddress, deliveryMethod);
  if (addressError) return res.status(400).json({ message: addressError });

  let order;
  try {
    order = await withTransaction((session) =>
      placeOrder(req.account._id, { storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode, note }, session)
    );
  } catch (err) {
    if (err instanceof BusinessError) return res.status(err.status).json({ message: err.message });
    throw err;
  }

  // soldCount KHÔNG tăng ở đây: đơn mới đặt chưa phải đã bán (có thể bị hủy, tự hủy vì quá hạn thanh
  // toán) - chỉ tính khi đơn chuyển sang "delivered" (xem updateOrderStatus / adjustSoldCount).

  await Notification.create({
    userId: req.account._id,
    type: 'order',
    title: 'Đặt hàng thành công',
    message: `Đơn hàng ${order.orderCode} đã được tiếp nhận`,
    link: `/orders/${order._id}`
  });

  emailOrderPlaced(order); // email xác nhận đơn (chạy nền)

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

  // Trước đây cho phép BẤT KỲ staff nào xem chi tiết đơn hàng bất kỳ, bất kể có quyền 'orders.manage'
  // hay không - lộ dữ liệu đơn hàng (địa chỉ, SĐT, giá trị mua) cho staff không được cấp quyền quản
  // lý đơn hàng, trong khi danh sách đơn hàng (getAllOrders) đã được chặn đúng theo quyền này.
  const isOwner = order.userId.toString() === req.account._id.toString();
  if (!isOwner && !hasPermission(req, 'orders.manage')) {
    return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này' });
  }
  if (!isOwner && !inScope(req, order)) {
    return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác, bạn không có quyền xem' });
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
  // Điều kiện kèm cả paymentStatus: nếu kết quả thanh toán vừa về đúng lúc khách bấm hủy thì nhận 409
  // (tải lại rồi hủy), không để đơn "đã hủy" mà vẫn "đã thanh toán" thay vì "đã hoàn tiền".
  // Đổi trạng thái + hoàn kho + trả lượt mã chạy chung 1 transaction: không bao giờ hủy rồi mà chưa hoàn kho.
  const updated = await withTransaction(async (session) => {
    const changed = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status, paymentStatus: order.paymentStatus },
      {
        $set: {
          status: 'cancelled',
          cancelReason,
          // Đơn đã thanh toán online bị hủy -> chuyển sang "đã hoàn tiền" (bản demo mô phỏng việc hoàn tiền)
          ...(order.paymentStatus === 'paid' && order.paymentMode !== 'cod' ? { paymentStatus: 'refunded' } : {})
        },
        $push: { statusHistory: { status: 'cancelled', note: cancelReason, changedBy: req.account._id } }
      },
      { new: true, session }
    );
    if (!changed) return null;
    await restoreStock(order.storeId, order.items, session);
    await releaseVoucher(order, session);
    return changed;
  });
  if (!updated) {
    return res.status(409).json({ message: 'Đơn hàng vừa được cập nhật, vui lòng tải lại trang' });
  }

  emailOrderStatus(updated, 'cancelled');
  res.json({ data: updated });
});

// ---------- ADMIN/STAFF ----------

// @route GET /api/orders/admin/all?storeId=
const getAllOrders = asyncHandler(async (req, res) => {
  const { status, storeId, paymentStatus, paymentMode, from, to, q, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (storeId) filter.storeId = storeId;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (paymentMode) filter.paymentMode = paymentMode;
  const created = dateRange(from, to);
  if (created) filter.createdAt = created;
  Object.assign(filter, searchFilter(q)); // mã đơn, người nhận, SĐT, sản phẩm (không dấu)
  // Quản lý chi nhánh chỉ thấy đơn của chi nhánh mình (bỏ qua storeId gửi lên nếu khác)
  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId) filter.storeId = scopedStoreId;

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
  if (!inScope(req, order)) {
    return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác, bạn không có quyền xử lý' });
  }

  const result = await transitionOrder(req, order, status, { note });
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});

// Chuyển trạng thái 1 đơn theo đúng quy tắc (bảng chuyển trạng thái, đơn online chưa thanh toán chỉ được hủy),
// trong 1 transaction cùng hoàn kho / trả lượt mã / số "đã bán", rồi báo khách (thông báo, email, Socket.IO).
// Dùng chung cho nhân viên xử lý đơn (updateOrderStatus) và nhân viên giao hàng (deliveryController).
// extraSet / extraPush: trường ghi thêm cùng lệnh (VD lần giao hàng, thời điểm thu COD). Trả { updated } hoặc { error }.
async function transitionOrder(req, order, status, { note, extraSet = {}, extraPush = {} } = {}) {
  // Đơn thanh toán online (VNPay/MoMo) phải thanh toán xong mới được xác nhận/giao - nếu không có thể giao hàng
  // khi chưa nhận được tiền. Đơn chưa thanh toán chỉ có thể hủy (khách/admin) hoặc chờ khách thanh toán lại.
  if (Order.ONLINE_PAYMENT_MODES.includes(order.paymentMode) && order.paymentStatus !== 'paid' && !RESTOCK_STATUSES.includes(status)) {
    const label = Order.PAYMENT_LABELS[order.paymentMode];
    return { error: { status: 400, message: `Đơn thanh toán qua ${label} chưa được thanh toán, chưa thể xử lý tiếp` } };
  }

  const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] || [];
  if (!allowedNext.includes(status)) {
    return { error: { status: 400, message: `Không thể chuyển đơn hàng từ trạng thái "${order.status}" sang "${status}"` } };
  }

  // Update có điều kiện (status hiện tại phải khớp đúng status vừa đọc) - đảm bảo 2 request cập
  // nhật trạng thái đồng thời không thể cùng vượt qua kiểm tra rồi cùng hoàn kho / cùng ghi đè
  // trạng thái của nhau.
  // Kèm paymentStatus trong điều kiện vì giá trị mới của nó tính từ giá trị vừa đọc (giống cancelOrder).
  // Đổi trạng thái + hoàn kho + trả lượt mã + số "đã bán" chạy chung 1 transaction.
  const updated = await withTransaction(async (session) => {
    const changed = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status, paymentStatus: order.paymentStatus },
      {
        $set: {
          status,
          ...extraSet,
          ...(status === 'delivered' && order.paymentMode === 'cod' ? { paymentStatus: 'paid' } : {}),
          ...(RESTOCK_STATUSES.includes(status) && order.paymentStatus === 'paid' && order.paymentMode !== 'cod'
            ? { paymentStatus: 'refunded' }
            : {})
        },
        $push: { statusHistory: { status, note, changedBy: req.account._id }, ...extraPush }
      },
      { new: true, session }
    );
    if (!changed) return null;
    if (RESTOCK_STATUSES.includes(status)) {
      await restoreStock(order.storeId, order.items, session);
      await releaseVoucher(order, session);
    }
    // "Đã bán" = khách đã nhận hàng: cộng khi giao thành công, trừ lại nếu đơn đã giao bị trả hàng.
    // Đơn bị trả khi đang giao (shipping -> returned) chưa từng được cộng nên không trừ.
    if (status === 'delivered') await adjustSoldCount(order.items, 1, session);
    else if (status === 'returned' && order.status === 'delivered') await adjustSoldCount(order.items, -1, session);
    return changed;
  });
  if (!updated) {
    return { error: { status: 409, message: 'Đơn hàng vừa được cập nhật bởi người khác, vui lòng tải lại' } };
  }

  await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Cập nhật đơn hàng',
    message: `Đơn hàng ${order.orderCode} đã chuyển sang trạng thái "${status}"`,
    link: `/orders/${order._id}`
  });
  emailOrderStatus(updated, status, note);

  const io = req.app.get('io');
  if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status });

  return { updated };
}

module.exports = {
  restoreStock,
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  transitionOrder,
  inScope
};
