const { historyEntry, enrichHistory } = require('../utils/orderHistory');
const { activeShipment, shipmentGuard } = require('../utils/deliveryRouting');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const Notification = require('../models/Notification');
const Setting = require('../models/Setting');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { emailOrderPlaced, emailOrderStatus } = require('../utils/notifyEmail');
const { searchFilter } = require('../utils/search');
const { hasPermission, getScopedStoreId, isStoreAllowed } = require('../middlewares/authMiddleware');
const { releaseVoucher } = require('../utils/voucherUsage');
const { withTransaction, BusinessError } = require('../utils/transaction');
const { validatePhone } = require('../utils/customerValidation');
const { orderVat, allocateAmount } = require('../utils/vat');
const { createCardsForOrder, voidCardsForOrder } = require('../utils/warrantyCards');
const { customerTier, activePromotions, applyPromotions, voucherScope, claimPromotions } = require('../utils/promotions');
const { pointsForOrder, getLoyaltyConfig } = require('../utils/loyalty');

const SHIPPING_FEE_DEFAULT = 30000;

// Sơ đồ trạng thái đơn hàng hợp lệ - chặn các bước nhảy trạng thái vô lý (VD: đơn đã "delivered"
// bị chuyển thẳng sang "cancelled" sẽ hoàn kho nhầm cho hàng đã giao; đơn "cancelled"/"returned" là
// trạng thái CUỐI, không có đường quay lại để tránh bán trùng số hàng đã được hoàn kho).
const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipping', 'ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['delivered', 'cancelled'],
  shipping: ['delivered', 'returning'],
  delivered: ['returning'],
  returning: ['returned'],
  cancelled: [],
  returned: []
};
// Tab "Đơn hàng của tôi" phía khách
const MY_ORDER_GROUPS = {
  processing: ['pending', 'confirmed', 'processing'],
  shipping: ['shipping', 'ready_for_pickup'],
  delivered: ['delivered'],
  closed: ['cancelled', 'returning', 'returned']
};
const RESTOCK_STATUSES = ['cancelled', 'returned'];


// Lọc theo khoảng ngày tạo: from/to dạng YYYY-MM-DD theo giờ Việt Nam (to tính tới hết ngày đó)
const { dateRange } = require('../utils/dateRange');

// Đơn có thuộc phạm vi chi nhánh của tài khoản đang thao tác không (admin/staff không gắn chi nhánh: luôn đúng)
// Đơn thuộc phạm vi nhân viên: chi nhánh đang làm việc hoặc chi nhánh quản lý thêm (utils/staffScope.js)
function inScope(req, order) {
  return isStoreAllowed(req, order.storeId);
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
// Thông tin xuất hóa đơn công ty (không bắt buộc). Mã số thuế VN: 10 số (doanh nghiệp), 10 số + "-" + 3 số
// (chi nhánh / đơn vị phụ thuộc) hoặc 12 số (cá nhân dùng số CCCD làm MST từ 01/07/2025).
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;
function validateInvoiceInfo(raw) {
  if (!raw || typeof raw !== 'object') return { value: undefined };
  const v = {
    companyName: String(raw.companyName || '').trim(),
    taxCode: String(raw.taxCode || '').replace(/\s/g, ''),
    address: String(raw.address || '').trim(),
    email: String(raw.email || '').trim().toLowerCase()
  };
  if (!v.companyName && !v.taxCode && !v.address && !v.email) return { value: undefined };
  if (!v.companyName) return { error: 'Vui lòng nhập tên công ty để xuất hóa đơn' };
  if (!TAX_CODE_RE.test(v.taxCode)) return { error: 'Mã số thuế không hợp lệ (10 số, 10 số-3 số hoặc 12 số)' };
  if (!v.address) return { error: 'Vui lòng nhập địa chỉ công ty để xuất hóa đơn' };
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { error: 'Email nhận hóa đơn không hợp lệ' };
  if (v.companyName.length > 200 || v.address.length > 300 || v.email.length > 120) return { error: 'Thông tin xuất hóa đơn quá dài' };
  return { value: v };
}

async function placeOrder(userId, input, session) {
  const { storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode, note, invoiceInfo } = input;
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
    const claimedCart = input.posItems ? { items: input.posItems } : await Cart.findOneAndUpdate(
      { userId, 'items.0': { $exists: true } },
      { $set: { items: [] } },
      { new: false, session }
    );
    if (!claimedCart) throw new BusinessError(400, 'Giỏ hàng đang trống');
    const cartItemsSnapshot = claimedCart.items;
    if (!input.posItems) undo.push(() => restoreCartItems(userId, cartItemsSnapshot));

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
        vatRate: product.vatRate ?? 10,
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
    // Phụ phí hỏa tốc cộng thêm vào phí ship (không được miễn theo ngưỡng miễn phí ship)
    const shippingFee = (deliveryMethod === 'store_pickup' || qualifiesFreeShipping ? 0 : shippingFeeConfig) + (deliveryMethod === 'home_delivery' && input.expressFee > 0 ? input.expressFee : 0);

    // ----- Khuyến mãi tự động (theo danh mục / thương hiệu / sản phẩm / chiến dịch / chi nhánh / hạng khách)
    const tier = await customerTier(userId, session);
    const ctx = { storeId, tierKey: tier?.key || null };
    const promo = applyPromotions(orderItems, productMap, await activePromotions(session), ctx);
    const lineAfterPromo = orderItems.map((it, i) => it.unitPrice * it.quantity - promo.lineDiscounts[i]);
    const afterPromoTotal = itemsTotal - promo.total;

    // ----- Mã giảm giá: tính trên tiền hàng SAU khuyến mãi, chỉ trên các sản phẩm thuộc phạm vi của mã
    let voucher = null;
    let voucherDiscount = 0;
    const voucherLines = orderItems.map(() => 0);
    if (voucherCode) {
      voucher = await Voucher.findOne({ code: String(voucherCode).toUpperCase() }, null, { session });
      if (!voucher || !voucher.isValidNow()) return await fail(400, 'Mã giảm giá không hợp lệ hoặc đã hết hạn');
      if (afterPromoTotal < voucher.minOrderValue) {
        return await fail(400, `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã`);
      }
      const scope = voucherScope(voucher, orderItems, productMap, lineAfterPromo, ctx);
      if (scope.error) return await fail(400, scope.error);
      if (voucher.perCustomerLimit > 0 && userId) {
        // Đơn đã hủy / trả hàng không tính lượt (khách không thật sự hưởng giảm giá)
        const usedByCustomer = await Order.countDocuments(
          { userId, voucherCode: voucher.code, status: { $nin: ['cancelled', 'returned'] } },
          { session }
        );
        if (usedByCustomer >= voucher.perCustomerLimit) return await fail(400, 'Bạn đã sử dụng hết lượt cho mã giảm giá này');
      }
      // maxDiscountAmount = 0 là cố ý đặt trần 0đ, khác "chưa đặt" (không giới hạn)
      const maxDiscount = typeof voucher.maxDiscountAmount === 'number' ? voucher.maxDiscountAmount : Infinity;
      voucherDiscount =
        voucher.discountType === 'percent'
          ? Math.round(Math.min((scope.eligibleTotal * voucher.discountValue) / 100, maxDiscount))
          // Mã giới hạn sản phẩm: không giảm quá tiền các sản phẩm đó; mã chung: được trừ cả phí ship như trước
          : Math.round(Math.min(voucher.discountValue, scope.limited ? scope.eligibleTotal : afterPromoTotal + shippingFee));
      const itemPart = Math.min(voucherDiscount, scope.eligibleTotal);
      const shares = allocateAmount(itemPart, scope.eligibleIndexes.map((i) => lineAfterPromo[i]));
      scope.eligibleIndexes.forEach((idx, k) => { voucherLines[idx] = shares[k]; });
    }
    const discountAmount = promo.total + voucherDiscount;
    const lineDiscounts = orderItems.map((_, i) => promo.lineDiscounts[i] + voucherLines[i]);
    const grandTotal = Math.round(Math.max(itemsTotal + shippingFee - discountAmount, 0));
    const { vat, lines, shippingVat } = orderVat(orderItems, shippingFee, discountAmount, settings?.shippingVatRate ?? 10, lineDiscounts);
    orderItems.forEach((item,i)=>{ item.vat=lines[i].vat; item.discountAmount=lines[i].discountAmount; delete item.vatRate; });
    const vatFingerprint = require('crypto').createHash('sha256').update(JSON.stringify({ lines:orderItems.map(i=>({ productId:String(i.productId),variantId:String(i.variantId),vat:i.vat,discountAmount:i.discountAmount })),shippingVat })).digest('hex');
    if (input.quote) return { items: orderItems, itemsTotal, shippingFee, discountAmount, promotionDiscount: promo.total, voucherDiscount, promotions: promo.applied, tier, grandTotal, vat, shippingVat, vatFingerprint };
    if (input.posItems && (input.expectedVatFingerprint ? input.expectedVatFingerprint !== vatFingerprint : input.expectedVatRate !== vat.rate)) return await fail(400, 'Thuế suất đã thay đổi, vui lòng tính lại tổng tiền trước khi hoàn tất');
    if (input.posItems && input.expectedTotal !== grandTotal) return await fail(400, 'Giá hoặc khuyến mãi đã thay đổi, vui lòng tính lại tổng tiền');
    // Đặt hàng online: trang thanh toán gửi kèm tổng tiền khách đã nhìn thấy. Nếu trong lúc đó khuyến mãi vừa
    // bắt đầu / kết thúc hoặc giá đổi thì từ chối, không để khách bị tính số tiền khác với số đã xem.
    if (!input.posItems && input.expectedTotal !== undefined && input.expectedTotal !== grandTotal) {
      return await fail(409, `Tổng tiền đã thay đổi thành ${grandTotal.toLocaleString('vi-VN')}đ (giá hoặc khuyến mãi vừa cập nhật). Vui lòng kiểm tra lại trước khi đặt hàng.`);
    }

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

    // Giữ suất / ngân sách chương trình khuyến mãi
    const exhausted = await claimPromotions(promo.applied, session, session ? null : undo);
    if (exhausted) return await fail(409, `Chương trình "${exhausted}" vừa hết suất, vui lòng tải lại trang để xem giá mới`);

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
          source: input.posItems ? 'pos' : 'online',
          createdBy: input.createdBy,
          createdByName: input.createdByName,
          clientRequestId: input.clientRequestId,
          requestFingerprint: input.requestFingerprint,
          storeId,
          items: orderItems,
          deliveryAddress,
          deliveryMethod,
          paymentMode,
          itemsTotal,
          shippingFee,
          discountAmount,
          voucherCode: voucher ? voucher.code : null,
          voucherDiscount,
          promotionDiscount: promo.total,
          promotions: promo.applied,
          grandTotal,
          vat,
          shippingVat,
          note,
          invoiceInfo,
          statusHistory: [{ status: 'pending', eventType: 'status', storeId, note: 'Đơn hàng được tạo', changedBy: input.createdBy || userId, actorName: input.createdByName || input.actorName, actorRole: input.posItems ? 'staff' : 'customer' }]
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

// @route POST /api/orders/quote
// @desc  Xem trước tổng tiền của giỏ hàng hiện tại (khuyến mãi tự động + mã giảm giá + VAT) - KHÔNG tạo đơn,
//        không trừ kho, không làm rỗng giỏ. Trang thanh toán dùng để hiển thị đúng số tiền backend sẽ tính.
const quoteOrder = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ tài khoản khách hàng' });
  const { storeId, deliveryMethod = 'home_delivery', voucherCode } = req.body;
  let expressFee = 0;
  if (req.body.expressWindowId && mongoose.isValidObjectId(req.body.expressWindowId) && deliveryMethod === 'home_delivery') {
    expressFee = (await require('../models/ExpressWindow').findById(req.body.expressWindowId).select('fee').lean())?.fee || 0;
  }
  if (storeId && !mongoose.isValidObjectId(storeId)) return res.status(400).json({ message: 'Cửa hàng không hợp lệ' });
  if (!DELIVERY_METHODS.includes(deliveryMethod)) return res.status(400).json({ message: 'Hình thức nhận hàng không hợp lệ' });
  const cart = await Cart.findOne({ userId: req.account._id }).lean();
  if (!cart?.items?.length) return res.status(400).json({ message: 'Giỏ hàng đang trống' });
  try {
    const quote = await placeOrder(req.account._id, {
      storeId: storeId || null, deliveryMethod, voucherCode: typeof voucherCode === 'string' && voucherCode.trim() ? voucherCode.trim() : undefined,
      posItems: cart.items, quote: true, expressFee
    }, null);
    res.json({ data: quote });
  } catch (err) {
    if (err instanceof BusinessError) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});

// @route POST /api/orders
// @desc  Tạo đơn hàng từ giỏ hàng hiện tại - BẮT BUỘC chọn storeId (mô hình multi-store)
const createOrder = asyncHandler(async (req, res) => {
  const { deliveryAddress, deliveryMethod = 'home_delivery', paymentMode = 'cod', voucherCode, note } =
    req.body;
  let storeId = req.body.storeId;
  const expectedTotal = req.body.expectedTotal === undefined || req.body.expectedTotal === null ? undefined : Number(req.body.expectedTotal);
  if (expectedTotal !== undefined && !Number.isFinite(expectedTotal)) return res.status(400).json({ message: 'Tổng tiền không hợp lệ' });
  const { error: invoiceError, value: invoiceInfo } = validateInvoiceInfo(req.body.invoiceInfo);
  if (invoiceError) return res.status(400).json({ message: invoiceError });

  if (req.accountRole !== 'customer') {
    return res.status(403).json({ message: 'Chỉ tài khoản khách hàng mới đặt hàng được' });
  }
  // ĐƠN HỎA TỐC: kiểm tra lại (khung giờ còn mở, đúng sản phẩm, còn hàng, trong bán kính) -> chi nhánh của khung giờ xử lý đơn
  let express = null;
  if (req.body.express && req.accountRole === 'customer') {
    if (deliveryMethod !== 'home_delivery') return res.status(400).json({ message: 'Giao hỏa tốc chỉ áp dụng giao tận nơi' });
    const cart = await Cart.findOne({ userId: req.account._id }).lean();
    const items = (cart?.items || []).map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }));
    const ex = require('../utils/express');
    express = await ex.checkExpress({ items, point: req.body.express, windowId: req.body.express.windowId });
    if (!express.ok) return res.status(400).json({ message: 'Không giao hỏa tốc được: ' + express.reason });
    storeId = String(express.store._id);
    // Giữ suất (khung giới hạn số đơn): cập nhật có điều kiện, nhiều khách đặt cùng lúc không vượt maxOrders
    const slot = await require('../models/ExpressWindow').updateOne({ _id: express.window._id, ...ex.openFilter() }, { $inc: { ordersCount: 1 } });
    if (!slot.modifiedCount) return res.status(409).json({ message: 'Khung giờ hỏa tốc vừa hết suất, vui lòng chọn giao thường' });
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
  if (!['cod', 'bank_transfer', 'vnpay', 'momo'].includes(paymentMode)) return res.status(400).json({ message: 'Hình thức thanh toán không hợp lệ' });
  // Người nhận (tên + SĐT) luôn bắt buộc; giao tận nơi cần thêm địa chỉ và tỉnh/thành. Trước đây không
  // kiểm tra gì - gọi thẳng API vẫn tạo được đơn giao tận nơi không có địa chỉ.
  const addressError = validateDeliveryAddress(deliveryAddress, deliveryMethod);
  if (addressError) return res.status(400).json({ message: addressError });

  let order;
  try {
    order = await withTransaction((session) =>
      placeOrder(req.account._id, { actorName: req.account.displayName, storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode, note, invoiceInfo, expectedTotal, expressFee: express ? express.window.fee : 0 }, session)
    );
  } catch (err) {
    if (express) await require('../models/ExpressWindow').updateOne({ _id: express.window._id }, { $inc: { ordersCount: -1 } }); // trả suất
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
    link: `/account/orders/${order._id}`
  });

  emailOrderPlaced(order); // email xác nhận đơn (chạy nền)
  if (express) order = await startExpressOrder(req, order, express);

  const io = req.app.get('io');
  if (io) io.to(`user_${req.account._id}`).emit('order:created', { orderId: order._id, orderCode: order.orderCode });

  res.status(201).json({ data: order });
});

// Đơn hỏa tốc vừa đặt: gắn phương án giao 'express', tự xác nhận (COD / chuyển khoản), phân công shipper rảnh nhất
// của chi nhánh và báo ngay cho shipper qua socket. Thanh toán online: chờ thanh toán xong, shipper vẫn được giữ trước.
async function startExpressOrder(req, order, express) {
  const { addressKey } = require('../utils/deliveryRouting');
  const { pickShipper } = require('../utils/express');
  const now = new Date();
  const shipper = await pickShipper(express.store._id);
  const base = order.toObject ? order.toObject() : order;
  const plan = {
    storeId: express.store._id, addressKey: addressKey({ ...base, storeId: express.store._id }), sameProvince: true,
    lat: Number(req.body.express.lat), lng: Number(req.body.express.lng), distanceMeters: express.distanceMeters, durationSeconds: express.durationSeconds,
    routingProvider: express.provider, calculatedAt: now, mode: 'express', verifiedAt: now
  };
  const deadlineText = express.deadline.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const sys = { account: { name: 'Hệ thống' }, accountRole: 'system' };
  const set = { deliveryPlan: plan, express: { windowId: express.window._id, fee: express.window.fee, deadline: express.deadline, distanceMeters: express.distanceMeters, assignedAt: shipper ? now : undefined } };
  const history = [historyEntry(sys, order.status, 'Đơn HỎA TỐC: giao trước ' + deadlineText + ' (' + (express.distanceMeters / 1000).toFixed(1) + ' km)', undefined, express.store.name, 'activity', express.store._id)];
  if (['cod', 'bank_transfer'].includes(order.paymentMode) && order.status === 'pending') {
    set.status = 'confirmed';
    history.push(historyEntry(sys, 'confirmed', 'Tự xác nhận đơn hỏa tốc', undefined, express.store.name, 'status', express.store._id));
  }
  const push = { statusHistory: { $each: history } };
  if (shipper) {
    Object.assign(set, { shipperId: shipper._id, assignedAt: now, assignedByName: 'Hệ thống (hỏa tốc)' });
    push.assignmentLog = { action: 'assign', method: 'internal', shipperId: shipper._id, shipperName: shipper.name, byName: 'Hệ thống (hỏa tốc)', at: now, note: 'Tự phân công đơn hỏa tốc' };
  }
  const updated = await Order.findOneAndUpdate({ _id: order._id }, { $set: set, $push: push }, { new: true });
  const io = req.app.get('io');
  if (io && shipper) io.to('user_' + shipper._id).emit('express:assigned', { orderId: order._id, orderCode: order.orderCode, deadline: express.deadline, address: order.deliveryAddress });
  return updated || order;
}

// @route GET /api/orders
const getMyOrders = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ dành cho tài khoản khách hàng' });
  const page = Math.min(1000000, Math.max(1, Math.floor(Number(req.query.page) || 1)));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 10)));
  const base = { userId: req.account._id };
  const status = req.query.status;
  if (status && !Order.schema.path('status').enumValues.includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  // Nhóm tab theo góc nhìn khách: gom các trạng thái kỹ thuật
  const group = MY_ORDER_GROUPS[req.query.group];
  if (req.query.group && !group) return res.status(400).json({ message: 'Nhóm đơn không hợp lệ' });
  const filter = { ...base, ...(status ? { status } : group ? { status: { $in: group } } : {}) };
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ orderCode: rx }, { 'items.name': rx }];
  }
  const Review = require('../models/Review');
  const [orders, total, counts, reviewed, deliveredItems] = await Promise.all([
    Order.find(filter).populate('storeId', 'name city').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Review.distinct('productId', { userId: req.account._id }),
    Order.distinct('items.productId', { ...base, status: 'delivered' })
  ]);
  const reviewedSet = new Set(reviewed.map(String));
  const data = (await enrichHistory(orders)).map((o) => {
    const obj = o.toObject ? o.toObject() : o;
    // Sản phẩm trong đơn đã giao mà khách chưa đánh giá -> hiện nút "Đánh giá"
    obj.toReview = obj.status === 'delivered' ? [...new Set(obj.items.map((i) => String(i.productId)).filter((id) => !reviewedSet.has(id)))] : [];
    return obj;
  });
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]));
  const groupCounts = Object.fromEntries(Object.entries(MY_ORDER_GROUPS).map(([k, sts]) => [k, sts.reduce((n, st) => n + (countMap[st] || 0), 0)]));
  const unpaid = await Order.countDocuments({ ...base, status: 'pending', paymentMode: { $in: ['vnpay', 'momo'] }, paymentStatus: { $in: ['pending', 'failed'] } });
  res.json({
    data, total, page, totalPages: Math.ceil(total / limit), counts: countMap, groupCounts,
    todo: { toReview: deliveredItems.filter((id) => !reviewedSet.has(String(id))).length, shipping: groupCounts.shipping, unpaid }
  });
});

// @route GET /api/orders/:id
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('storeId', 'name city address phoneNumber').populate('createdBy handover.by receipt.by', 'name');
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

  // Trước đây cho phép BẤT KỲ staff nào xem chi tiết đơn hàng bất kỳ, bất kể có quyền 'orders.manage'
  // hay không - lộ dữ liệu đơn hàng (địa chỉ, SĐT, giá trị mua) cho staff không được cấp quyền quản
  // lý đơn hàng, trong khi danh sách đơn hàng (getAllOrders) đã được chặn đúng theo quyền này.
  const isOwner = String(order.userId) === String(req.account._id);
  if (!isOwner && !hasPermission(req, 'orders.manage')) {
    return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này' });
  }
  if (!isOwner && !inScope(req, order)) {
    return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác, bạn không có quyền xem' });
  }
  const data = (await enrichHistory([order]))[0];
  // Khách xem đơn của mình: không cần chi tiết kỹ thuật các lần thử hoàn tiền qua cổng thanh toán
  if (req.accountRole === 'customer' && data?.refundInfo) {
    const { attempts, requestId, ...rest } = data.refundInfo.toObject ? data.refundInfo.toObject() : data.refundInfo;
    data.refundInfo = rest;
  }
  res.json({ data });
});

// @route PUT /api/orders/:id/cancel
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (String(order.userId) !== String(req.account._id)) {
    return res.status(403).json({ message: 'Bạn không có quyền hủy đơn hàng này' });
  }
  if (order.activeTransferId) return res.status(409).json({ message: 'Đơn đang chờ điều phối, vui lòng chờ hoặc liên hệ cửa hàng hủy yêu cầu điều phối' });
  if (activeShipment(order)) return res.status(409).json({ message: 'Cần cửa hàng hủy/xác minh vận đơn GHN trước khi hủy đơn hàng' });
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
      { _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, paymentStatus: order.paymentStatus, ...shipmentGuard(order) },
      {
        $set: {
          status: 'cancelled',
          cancelReason,
          // Đơn đã thanh toán online bị hủy -> chuyển sang "đã hoàn tiền" (bản demo mô phỏng việc hoàn tiền)
          ...(order.paymentStatus === 'paid' ? { refundStatus: 'pending' } : {})
        },
        $push: { statusHistory: historyEntry(req, 'cancelled', cancelReason, { status: { from: order.status, to: 'cancelled' } }, undefined, 'status', order.storeId) }
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
  if (req.query.source === 'pos') filter.source = 'pos';
  if (req.query.source === 'online') filter.source = { $ne: 'pos' };
  if (DELIVERY_METHODS.includes(req.query.deliveryMethod)) filter.deliveryMethod = req.query.deliveryMethod;
  if (status) filter.status = status;
  if (storeId) filter.storeId = storeId;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  // Lọc khoản hoàn tiền: chờ hoàn (gồm đang gửi lệnh hoàn) / đã hoàn
  if (req.query.refundStatus === 'pending') filter.refundStatus = { $in: ['pending', 'processing'] };
  if (req.query.refundStatus === 'completed') filter.refundStatus = 'completed';
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
    .populate('createdBy handover.by receipt.by', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Order.countDocuments(filter);
  // Số đơn theo từng trạng thái (cùng bộ lọc, KHÔNG tính bộ lọc trạng thái) -> tab lọc nhanh trên trang quản trị
  const { status: _ignored, ...countFilter } = filter;
  // aggregate() không tự ép kiểu như find() -> đổi mã chi nhánh dạng chuỗi sang ObjectId
  if (typeof countFilter.storeId === 'string') {
    if (!mongoose.isValidObjectId(countFilter.storeId)) return res.json({ data: orders, total, page: Number(page), totalPages: Math.ceil(total / limit), statusCounts: {} });
    countFilter.storeId = new mongoose.Types.ObjectId(countFilter.storeId);
  }
  const grouped = await Order.aggregate([{ $match: countFilter }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const statusCounts = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
  res.json({ data: await enrichHistory(orders), total, page: Number(page), totalPages: Math.ceil(total / limit), statusCounts });
});

// @route PUT /api/orders/:id/status
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping', 'returning', 'delivered', 'cancelled', 'returned'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!inScope(req, order)) {
    return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác, bạn không có quyền xử lý' });
  }

  if (['shipping', 'delivered', 'returned'].includes(status)) return res.status(400).json({ message: 'Vui lòng dùng thao tác lấy hàng, bàn giao hoặc nhận hàng trả tương ứng' });
  const result = await transitionOrder(req, order, status, { note });
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});

// Chuyển trạng thái 1 đơn theo đúng quy tắc (bảng chuyển trạng thái, đơn online chưa thanh toán chỉ được hủy),
// trong 1 transaction cùng hoàn kho / trả lượt mã / số "đã bán", rồi báo khách (thông báo, email, Socket.IO).
// Dùng chung cho nhân viên xử lý đơn (updateOrderStatus) và nhân viên giao hàng (deliveryController).
// extraSet / extraPush: trường ghi thêm cùng lệnh (VD lần giao hàng, thời điểm thu COD). Trả { updated } hoặc { error }.
async function transitionOrder(req, order, status, { note, extraSet = {}, extraPush = {}, action } = {}) {
  if (order.activeTransferId) return { error: { status: 409, message: 'Đơn đang chờ điều phối; hãy hoàn tất hoặc hủy yêu cầu điều phối' } };
  const carrier = ['carrierPickup', 'carrierSuccess', 'carrierReturn'].includes(action);
  if (carrier && order.shipment?.phase !== 'active') return { error: { status: 409, message: 'Không có vận đơn hoạt động' } };
  const preparingAssigned = order.status === 'confirmed' && status === 'processing' && order.shipment?.environment === 'simulation' && order.shipment?.phase === 'active' && order.shipment?.status === 'ready_to_pick';
  if (activeShipment(order) && !carrier && action !== 'receiveReturn' && !preparingAssigned) return { error: { status: 409, message: 'Đơn có vận đơn GHN; hãy đồng bộ hoặc hủy vận đơn trước' } };
  if (action === 'receiveReturn' && activeShipment(order) && order.shipment.status !== 'returned') return { error: { status: 409, message: 'GHN chưa xác nhận trả hàng về chi nhánh' } };
  const actorStore = await Store.findById(order.storeId).select('name').lean();
  const proofIds = [...(extraSet.handover?.evidenceIds || []), ...(extraSet.carrierPickupProof?.evidenceIds || []), ...(extraSet.carrierDeliveryProof?.evidenceIds || [])];
  if (proofIds.length && !(await require('../utils/transaction').transactionsSupported())) return { error: { status: 503, message: 'Cần MongoDB replica set để lưu bằng chứng và bàn giao an toàn' } };
  if (status === 'shipping' && order.paymentMode !== 'cod' && order.paymentStatus !== 'paid') return { error: { status: 400, message: 'Cửa hàng cần xác nhận thanh toán trước khi giao' } };
  // Đơn thanh toán online (VNPay/MoMo) phải thanh toán xong mới được xác nhận/giao - nếu không có thể giao hàng
  // khi chưa nhận được tiền. Đơn chưa thanh toán chỉ có thể hủy (khách/admin) hoặc chờ khách thanh toán lại.
  if (Order.ONLINE_PAYMENT_MODES.includes(order.paymentMode) && order.paymentStatus !== 'paid' && !RESTOCK_STATUSES.includes(status)) {
    const label = Order.PAYMENT_LABELS[order.paymentMode];
    return { error: { status: 400, message: `Đơn thanh toán qua ${label} chưa được thanh toán, chưa thể xử lý tiếp` } };
  }

  if (status === 'shipping' && (!['shipperPickup', 'carrierPickup'].includes(action) || order.deliveryMethod !== 'home_delivery')) return { error: { status: 400, message: 'Cần shipper hoặc GHN xác nhận lấy hàng' } };
  if (status === 'ready_for_pickup' && order.deliveryMethod !== 'store_pickup') return { error: { status: 400, message: 'Chỉ áp dụng cho đơn nhận tại cửa hàng' } };
  if (status === 'delivered' && !['deliverySuccess', 'storeHandover', 'carrierSuccess'].includes(action)) return { error: { status: 400, message: 'Cần xác nhận bàn giao và thanh toán' } };
  if (status === 'returned' && action !== 'receiveReturn') return { error: { status: 400, message: 'Kho phải xác nhận nhận hàng trả' } };
  if (status === 'returning' && !text(note)) return { error: { status: 400, message: 'Cần lý do trả hàng' } };
  const legacyPickup = action === 'storeHandover' && order.deliveryMethod === 'store_pickup' && order.status === 'shipping';
  const allowedNext = legacyPickup ? ['delivered'] : (ORDER_STATUS_TRANSITIONS[order.status] || []);
  if (!allowedNext.includes(status)) {
    return { error: { status: 400, message: `Không thể chuyển đơn hàng từ trạng thái "${order.status}" sang "${status}"` } };
  }

  // Update có điều kiện (status hiện tại phải khớp đúng status vừa đọc) - đảm bảo 2 request cập
  // nhật trạng thái đồng thời không thể cùng vượt qua kiểm tra rồi cùng hoàn kho / cùng ghi đè
  // trạng thái của nhau.
  // Kèm paymentStatus trong điều kiện vì giá trị mới của nó tính từ giá trị vừa đọc (giống cancelOrder).
  // Đổi trạng thái + hoàn kho + trả lượt mã + số "đã bán" chạy chung 1 transaction.
  // Điểm thành viên theo cấu hình hiện tại (tắt tích điểm -> đơn giao thành công được 0 điểm)
  const loyaltyConfig = status === 'delivered' ? await getLoyaltyConfig() : null;
  const updated = await withTransaction(async (session) => {
    const changed = await Order.findOneAndUpdate(
      { _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, paymentStatus: order.paymentStatus, ...shipmentGuard(order), ...(carrier ? { 'shipment.lease': order.shipment.lease } : {}), ...(['deliverySuccess', 'deliveryReturn', 'shipperPickup'].includes(action) ? { shipperId: order.shipperId } : {}), ...(action === 'deliveryReturn' ? { $expr: { $eq: [{ $size: { $ifNull: ['$deliveryAttempts', []] } }, order.deliveryAttempts.length] } } : {}) },
      {
        $set: {
          status,
          ...(status === 'confirmed' ? { confirmedBy: req.account._id, confirmedByName: req.account.name || req.account.displayName, confirmedAt: new Date(), confirmedStoreName: actorStore?.name || '' } : {}),
          ...extraSet,
          ...(status === 'returning' ? { returnRequestedAt: new Date(), returnWasDelivered: order.status === 'delivered' } : {}),
          ...(status === 'delivered' && order.paymentMode === 'cod' ? { paymentStatus: 'paid' } : {}),
          // Đơn bán tại quầy không gắn tài khoản khách -> không tích điểm
          ...(status === 'delivered' ? { loyaltyPoints: order.userId ? pointsForOrder(order, loyaltyConfig) : 0 } : {}),
          // Đơn đã thu tiền bị hủy / trả hàng: chờ nhân viên xác nhận đã hoàn tiền thật (confirm-refund),
          // không tự đánh dấu "đã hoàn tiền" khi tiền chưa thực sự trả lại khách.
          ...(RESTOCK_STATUSES.includes(status) && order.paymentStatus === 'paid'
            ? { refundStatus: 'pending' }
            : {})
        },
        $push: { statusHistory: historyEntry(req, status, note, { status: { from: order.status, to: status } }, actorStore?.name, 'status', order.storeId), ...extraPush }
      },
      { new: true, session }
    );
    if (!changed) return null;
    if (proofIds.length) {
      const promoted = await require('../models/DeliveryEvidence').updateMany({ _id: { $in: proofIds }, orderId: order._id, uploadedBy: req.account._id, expiresAt: { $gt: new Date() } }, { $unset: { expiresAt: '' } }, { session });
      if (promoted.modifiedCount !== proofIds.length) throw new BusinessError(409, 'Ảnh đã hết hạn hoặc được sử dụng, vui lòng tải lại');
    }
    if (RESTOCK_STATUSES.includes(status)) {
      await restoreStock(order.storeId, order.items, session);
      await releaseVoucher(order, session);
    }
    // "Đã bán" và điểm thành viên = khách đã nhận hàng: cộng khi giao thành công, trừ lại khi đơn ĐÃ GIAO bị trả
    // hàng. Trả hàng đi qua bước "returning" (kho xác nhận nhận lại hàng) nên dựa vào cờ returnWasDelivered ghi lúc
    // chuyển sang returning; đơn bị trả khi đang giao (shipping -> returning) chưa từng được cộng nên không trừ.
    const wasDelivered = order.status === 'delivered' || (order.status === 'returning' && order.returnWasDelivered === true);
    if (status === 'delivered') {
      await adjustSoldCount(order.items, 1, session);
      // Sổ bảo hành điện tử cho từng máy, ngày mua = hôm nay (ngày giao thành công)
      await createCardsForOrder(changed, session, new Date());
      if (changed.userId && changed.loyaltyPoints > 0) {
        await User.updateOne({ _id: changed.userId }, { $inc: { loyaltyPoints: changed.loyaltyPoints } }, { session });
      }
    } else if (status === 'returned' && wasDelivered) {
      await adjustSoldCount(order.items, -1, session);
      await voidCardsForOrder(order._id, `Đơn ${order.orderCode} đã trả hàng`, session);
      if (changed.userId && changed.loyaltyPoints > 0) {
        // Không để âm (dữ liệu cũ có thể đã bị trừ trước đó)
        await User.updateOne({ _id: changed.userId }, [
          { $set: { loyaltyPoints: { $max: [0, { $subtract: [{ $ifNull: ['$loyaltyPoints', 0] }, changed.loyaltyPoints] }] } } }
        ], { session });
      }
    }
    return changed;
  });
  if (!updated) {
    return { error: { status: 409, message: 'Đơn hàng vừa được cập nhật bởi người khác, vui lòng tải lại' } };
  }

  if (order.userId) await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Cập nhật đơn hàng',
    message: status === 'ready_for_pickup' ? `Đơn ${order.orderCode} đã sẵn sàng, vui lòng đến cửa hàng nhận hàng` : `Đơn hàng ${order.orderCode} đã cập nhật trạng thái`,
    link: `/account/orders/${order._id}`
  });
  emailOrderStatus(updated, status, note);

  const io = req.app.get('io');
  if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status });

  return { updated };
}

module.exports = {
  restoreStock,
  quoteOrder,
  validateInvoiceInfo,
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  transitionOrder,
  inScope, placeOrder, adjustSoldCount
};
