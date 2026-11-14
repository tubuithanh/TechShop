// =====================================================================================================
// controllers/orderController.js - ĐƠN HÀNG
//   Phần 1 (giai đoạn 2 - mua hàng): placeOrder (lõi tạo đơn), quoteOrder (xem trước tổng tiền), createOrder (đặt hàng)
//   Phần 2 (giai đoạn 4 - xử lý đơn): đổi trạng thái, hủy, trả hàng, danh sách / chi tiết đơn...
// =====================================================================================================
const { historyEntry, enrichHistory } = require('../utils/orderHistory'); // tạo 1 dòng lịch sử trạng thái
const { activeShipment, shipmentGuard } = require('../utils/deliveryRouting'); // vận đơn đang hoạt động (GHN...)
const mongoose = require('mongoose');
const Order = require('../models/Order'); // đơn hàng
const Cart = require('../models/Cart'); // giỏ hàng
const Product = require('../models/Product'); // sản phẩm
const StoreInventory = require('../models/StoreInventory'); // tồn kho theo chi nhánh
const Store = require('../models/Store'); // chi nhánh
const Voucher = require('../models/Voucher'); // mã giảm giá
const Notification = require('../models/Notification'); // thông báo trong web
const Setting = require('../models/Setting'); // cấu hình (phí ship, ngưỡng miễn phí ship...)
const User = require('../models/User'); // khách hàng
const asyncHandler = require('../utils/asyncHandler');
const { emailOrderPlaced, emailOrderStatus } = require('../utils/notifyEmail'); // email đặt hàng / đổi trạng thái
const { searchFilter } = require('../utils/search'); // tạo điều kiện tìm kiếm
const { hasPermission, getScopedStoreId, isStoreAllowed } = require('../middlewares/authMiddleware'); // phân quyền + phạm vi chi nhánh
const { releaseVoucher } = require('../utils/voucherUsage'); // trả lại lượt mã khi hủy đơn
const { withTransaction, BusinessError } = require('../utils/transaction'); // giao dịch MongoDB + lỗi nghiệp vụ
const { validatePhone } = require('../utils/customerValidation');
const { orderVat, allocateAmount } = require('../utils/vat'); // tính VAT, chia tiền giảm theo tỷ lệ
const { createCardsForOrder, voidCardsForOrder } = require('../utils/warrantyCards'); // phiếu bảo hành điện tử
const { customerTier, activePromotions, applyPromotions, voucherScope, claimPromotions } = require('../utils/promotions'); // khuyến mãi tự động
const { pointsForOrder, getLoyaltyConfig } = require('../utils/loyalty'); // điểm thành viên

const SHIPPING_FEE_DEFAULT = 30000; // phí ship mặc định khi chưa cấu hình (30.000đ)
const MAX_NOTE_LENGTH = 500; // ghi chú đơn hàng tối đa 500 ký tự

// Sơ đồ trạng thái đơn hàng hợp lệ - chặn các bước nhảy trạng thái vô lý (VD: đơn đã "delivered"
// bị chuyển thẳng sang "cancelled" sẽ hoàn kho nhầm cho hàng đã giao; đơn "cancelled"/"returned" là
// trạng thái CUỐI, không có đường quay lại để tránh bán trùng số hàng đã được hoàn kho).
const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'], // chờ xác nhận -> xác nhận / hủy
  confirmed: ['processing', 'cancelled'], // đã xác nhận -> đang chuẩn bị / hủy
  processing: ['shipping', 'ready_for_pickup', 'cancelled'], // đang chuẩn bị -> giao đi / chờ khách tới lấy / hủy
  ready_for_pickup: ['delivered', 'cancelled'], // chờ lấy tại cửa hàng -> đã nhận / hủy
  shipping: ['delivered', 'returning'], // đang giao -> giao xong / hoàn về
  delivered: ['returning'], // đã giao -> khách trả hàng
  returning: ['returned'], // đang hoàn -> đã nhận hàng hoàn
  cancelled: [], // trạng thái cuối
  returned: [] // trạng thái cuối
};
// Tab "Đơn hàng của tôi" phía khách
const MY_ORDER_GROUPS = {
  processing: ['pending', 'confirmed', 'processing'],
  shipping: ['shipping', 'ready_for_pickup'],
  delivered: ['delivered'],
  closed: ['cancelled', 'returning', 'returned']
};
const RESTOCK_STATUSES = ['cancelled', 'returned']; // chuyển sang các trạng thái này thì cộng lại tồn kho


// Lọc theo khoảng ngày tạo: from/to dạng YYYY-MM-DD theo giờ Việt Nam (to tính tới hết ngày đó)
const { dateRange } = require('../utils/dateRange');

// Đơn có thuộc phạm vi chi nhánh của tài khoản đang thao tác không (admin/staff không gắn chi nhánh: luôn đúng)
// Đơn thuộc phạm vi nhân viên: chi nhánh đang làm việc hoặc chi nhánh quản lý thêm (utils/staffScope.js)
function inScope(req, order) {
  return isStoreAllowed(req, order.storeId);
}

// Mã đơn: "DH" + 6 số cuối của thời gian (ms) + 6 số ngẫu nhiên -> VD DH123456789012 (orderCode là duy nhất trong DB)
function generateOrderCode() {
  const rand = Math.floor(100000 + Math.random() * 900000); // số ngẫu nhiên 100000..999999
  return `DH${Date.now().toString().slice(-6)}${rand}`;
}

// Trả hàng về giỏ (dùng khi tạo đơn thất bại mà không có transaction tự hoàn tác)
async function restoreCartItems(userId, items) {
  if (!items || !items.length) return;
  // Gộp lại theo productId thay vì $push thẳng snapshot cũ vào - nếu khách đã lỡ thêm lại đúng sản
  // phẩm đó vào giỏ (đang rỗng) trong lúc đơn hàng trước đó bị từ chối (hết hàng/voucher hết lượt),
  // tránh tạo ra 2 dòng riêng biệt cho cùng 1 sản phẩm trong giỏ hàng.
  let cart = await Cart.findOne({ userId });
  if (!cart) { // chưa có giỏ -> tạo giỏ chứa lại các món
    await Cart.create({ userId, items });
    return;
  }
  for (const restored of items) {
    const existing = cart.items.find( // món đã có trong giỏ (cùng sản phẩm + phiên bản)?
      (i) =>
        i.productId.toString() === restored.productId.toString() &&
        String(i.variantId) === String(restored.variantId)
    );
    if (existing) {
      existing.quantity += restored.quantity; // có -> cộng dồn
    } else {
      cart.items.push({ // chưa có -> thêm dòng
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
      { productId: item.productId, variantId: item.variantId, storeId }, // đúng sản phẩm + phiên bản + chi nhánh
      { $inc: { stock: item.quantity }, lastUpdated: new Date() }, // cộng lại số lượng ($inc là phép cộng nguyên tử)
      { session } // nằm trong transaction (nếu có)
    );
  }
}

// Cộng / trừ số lượng "đã bán" của sản phẩm (sign = 1 | -1). Không bao giờ để âm. Chỉ phục vụ hiển thị
// và thống kê bán chạy, nên lỗi ở đây chỉ ghi log, không làm hỏng việc đổi trạng thái đơn đã thành công.
async function adjustSoldCount(items, sign, session = null) {
  for (const item of items) {
    try {
      await Product.updateOne({ _id: item.productId }, [ // cập nhật dạng pipeline để dùng được $max
        { $set: { soldCount: { $max: [0, { $add: [{ $ifNull: ['$soldCount', 0] }, sign * item.quantity] }] } } } // max(0, cũ ± số lượng)
      ], { session });
    } catch (err) {
      if (session) throw err; // trong transaction: để cả khối hủy
      console.error(`Lỗi cập nhật soldCount cho sản phẩm ${item.productId}:`, err.message);
    }
  }
}

const DELIVERY_METHODS = ['home_delivery', 'store_pickup']; // giao tận nơi | nhận tại cửa hàng
const text = (v) => (typeof v === 'string' ? v.trim() : ''); // lấy chuỗi đã bỏ khoảng trắng, không phải chuỗi -> ''
// Kiểm tra thông tin người nhận; trả về câu báo lỗi hoặc null nếu hợp lệ
function validateDeliveryAddress(address, deliveryMethod) {
  if (!address || typeof address !== 'object') return 'Vui lòng nhập thông tin người nhận';
  if (!text(address.fullName)) return 'Vui lòng nhập họ tên người nhận';
  const phoneError = validatePhone(address.phone); // số điện thoại VN hợp lệ
  if (phoneError) return phoneError;
  if (deliveryMethod === 'home_delivery' && (!text(address.addressLine1) || !text(address.city))) { // giao tận nơi cần địa chỉ
    return 'Giao tận nơi cần có số nhà / đường và tỉnh / thành phố';
  }
  return null;
}

// Thông tin xuất hóa đơn công ty (không bắt buộc). Mã số thuế VN: 10 số (doanh nghiệp), 10 số + "-" + 3 số
// (chi nhánh / đơn vị phụ thuộc) hoặc 12 số (cá nhân dùng số CCCD làm MST từ 01/07/2025).
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;
function validateInvoiceInfo(raw) {
  if (!raw || typeof raw !== 'object') return { value: undefined }; // không gửi -> không xuất hóa đơn công ty
  const v = { // chuẩn hóa từng trường
    companyName: String(raw.companyName || '').trim(),
    taxCode: String(raw.taxCode || '').replace(/\s/g, ''), // bỏ mọi khoảng trắng trong MST
    address: String(raw.address || '').trim(),
    email: String(raw.email || '').trim().toLowerCase()
  };
  if (!v.companyName && !v.taxCode && !v.address && !v.email) return { value: undefined }; // để trống hết = không xuất
  if (!v.companyName) return { error: 'Vui lòng nhập tên công ty để xuất hóa đơn' };
  if (!TAX_CODE_RE.test(v.taxCode)) return { error: 'Mã số thuế không hợp lệ (10 số, 10 số-3 số hoặc 12 số)' };
  if (!v.address) return { error: 'Vui lòng nhập địa chỉ công ty để xuất hóa đơn' };
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { error: 'Email nhận hóa đơn không hợp lệ' };
  if (v.companyName.length > 200 || v.address.length > 300 || v.email.length > 120) return { error: 'Thông tin xuất hóa đơn quá dài' };
  return { value: v };
}

// Các bước tạo đơn: lấy giỏ, tính tiền theo giá hiện tại, kiểm tra mã giảm giá, trừ kho, giữ lượt mã, tạo đơn.
// Chạy trong transaction (session): lỗi ở BẤT KỲ bước nào MongoDB tự hủy mọi thao tác đã ghi, kể cả khi máy
// chủ dừng đột ngột giữa chừng. Không có transaction (MongoDB đơn lẻ lúc lập trình) thì hoàn tác thủ công
// theo danh sách `undo`. Lỗi nghiệp vụ ném BusinessError (mã HTTP + thông báo cho khách).
// Dùng chung cho 3 nơi: đặt hàng online (createOrder), xem trước tổng tiền (quote: true), bán tại quầy (posItems).
async function placeOrder(userId, input, session) {
  const { storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode, note, invoiceInfo } = input;
  const undo = []; // danh sách việc cần hoàn tác (chỉ dùng khi KHÔNG có transaction)
  const rollback = async () => {
    if (session) return; // transaction tự hủy
    for (const step of undo.reverse()) await step(); // hoàn tác theo thứ tự ngược
  };
  const fail = async (status, message) => { // dừng tạo đơn: hoàn tác + ném lỗi nghiệp vụ
    await rollback();
    throw new BusinessError(status, message);
  };

  try {
    // "Nhận" giỏ hàng bằng 1 lệnh có điều kiện: chỉ request lấy được giỏ KHÔNG rỗng và dọn nó về rỗng mới
    // được tạo đơn - bấm "Đặt hàng" 2 lần (hoặc gửi trùng do mất mạng) không tạo 2 đơn.
    const claimedCart = input.posItems ? { items: input.posItems } : await Cart.findOneAndUpdate( // POS / xem trước: dùng danh sách truyền vào
      { userId, 'items.0': { $exists: true } }, // giỏ có ít nhất 1 dòng
      { $set: { items: [] } }, // làm rỗng giỏ
      { new: false, session } // new:false -> trả về giỏ TRƯỚC khi làm rỗng (để lấy danh sách món)
    );
    if (!claimedCart) throw new BusinessError(400, 'Giỏ hàng đang trống'); // request trùng: giỏ đã bị request kia lấy
    const cartItemsSnapshot = claimedCart.items; // bản chụp các món
    if (!input.posItems) undo.push(() => restoreCartItems(userId, cartItemsSnapshot)); // lỗi thì trả hàng về giỏ

    // Giá HIỆN TẠI của từng phiên bản, không tin giá đã lưu trong giỏ (giá có thể đã đổi)
    const products = await Product.find({ _id: { $in: cartItemsSnapshot.map((i) => i.productId) } }, null, { session });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const orderItems = []; // các dòng của đơn hàng
    for (const item of cartItemsSnapshot) {
      const product = productMap.get(item.productId.toString());
      const variant = product?.variants.id(item.variantId);
      if (!product || !product.isActive || !variant || !variant.isActive) { // đã ngừng bán
        const label = item.variantLabel ? ` (${item.variantLabel})` : '';
        return await fail(400, `Sản phẩm "${item.name}${label}" không còn kinh doanh`);
      }
      orderItems.push({ // lưu bản chụp thông tin sản phẩm vào đơn (sau này sản phẩm đổi tên/giá, đơn vẫn đúng)
        productId: item.productId,
        variantId: variant._id,
        variantLabel: variant.label,
        quantity: item.quantity,
        unitPrice: variant.effectivePrice, // giá hiện tại
        vatRate: product.vatRate ?? 10, // thuế suất (tạm, xóa sau khi tính VAT)
        name: product.title,
        image: variant.image || product.featuredImage
      });
    }
    const itemsTotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0); // tổng tiền hàng

    // Phí ship và ngưỡng miễn phí ship theo cấu hình hệ thống
    const settings = await Setting.findOne({}, null, { session });
    const shippingFeeConfig = settings?.defaultShippingFee ?? SHIPPING_FEE_DEFAULT; // ?? : chỉ dùng mặc định khi null/undefined (0 vẫn giữ)
    const freeShippingThreshold = settings?.freeShippingThreshold ?? 0;
    const qualifiesFreeShipping = freeShippingThreshold > 0 && itemsTotal >= freeShippingThreshold; // đủ ngưỡng miễn ship
    // Phụ phí hỏa tốc cộng thêm vào phí ship (không được miễn theo ngưỡng miễn phí ship)
    const shippingFee = (deliveryMethod === 'store_pickup' || qualifiesFreeShipping ? 0 : shippingFeeConfig) + (deliveryMethod === 'home_delivery' && input.expressFee > 0 ? input.expressFee : 0);

    // ----- Khuyến mãi tự động (theo danh mục / thương hiệu / sản phẩm / chiến dịch / chi nhánh / hạng khách)
    const tier = await customerTier(userId, session); // hạng thành viên của khách (Bạc, Vàng...)
    const ctx = { storeId, tierKey: tier?.key || null }; // ngữ cảnh để lọc khuyến mãi áp dụng được
    const promo = applyPromotions(orderItems, productMap, await activePromotions(session), ctx); // { total, lineDiscounts[], applied[] }
    const lineAfterPromo = orderItems.map((it, i) => it.unitPrice * it.quantity - promo.lineDiscounts[i]); // tiền từng dòng sau khuyến mãi
    const afterPromoTotal = itemsTotal - promo.total; // tổng tiền hàng sau khuyến mãi

    // ----- Mã giảm giá: tính trên tiền hàng SAU khuyến mãi, chỉ trên các sản phẩm thuộc phạm vi của mã
    let voucher = null;
    let voucherDiscount = 0; // số tiền mã giảm
    const voucherLines = orderItems.map(() => 0); // phần giảm của mã chia cho từng dòng (để tính VAT đúng)
    if (voucherCode) {
      voucher = await Voucher.findOne({ code: String(voucherCode).toUpperCase() }, null, { session }); // mã lưu chữ hoa
      if (!voucher || !voucher.isValidNow()) return await fail(400, 'Mã giảm giá không hợp lệ hoặc đã hết hạn'); // còn hoạt động + trong thời hạn
      if (afterPromoTotal < voucher.minOrderValue) { // chưa đủ giá trị đơn tối thiểu
        return await fail(400, `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã`);
      }
      const scope = voucherScope(voucher, orderItems, productMap, lineAfterPromo, ctx); // dòng nào thuộc phạm vi mã
      if (scope.error) return await fail(400, scope.error);
      if (voucher.perCustomerLimit > 0 && userId) { // mã giới hạn số lần mỗi khách
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
          ? Math.round(Math.min((scope.eligibleTotal * voucher.discountValue) / 100, maxDiscount)) // giảm % trên phần hợp lệ, có trần
          // Mã giới hạn sản phẩm: không giảm quá tiền các sản phẩm đó; mã chung: được trừ cả phí ship như trước
          : Math.round(Math.min(voucher.discountValue, scope.limited ? scope.eligibleTotal : afterPromoTotal + shippingFee));
      const itemPart = Math.min(voucherDiscount, scope.eligibleTotal); // phần giảm rơi vào tiền hàng (phần dư rơi vào phí ship)
      const shares = allocateAmount(itemPart, scope.eligibleIndexes.map((i) => lineAfterPromo[i])); // chia theo tỷ lệ tiền từng dòng
      scope.eligibleIndexes.forEach((idx, k) => { voucherLines[idx] = shares[k]; });
    }
    const discountAmount = promo.total + voucherDiscount; // tổng giảm = khuyến mãi + mã
    const lineDiscounts = orderItems.map((_, i) => promo.lineDiscounts[i] + voucherLines[i]); // tổng giảm từng dòng
    const grandTotal = Math.round(Math.max(itemsTotal + shippingFee - discountAmount, 0)); // khách phải trả (không âm)
    // VAT: tách thuế ra từ giá đã gồm thuế, theo từng dòng (thuế suất có thể khác nhau) + VAT phí ship
    const { vat, lines, shippingVat } = orderVat(orderItems, shippingFee, discountAmount, settings?.shippingVatRate ?? 10, lineDiscounts);
    orderItems.forEach((item,i)=>{ item.vat=lines[i].vat; item.discountAmount=lines[i].discountAmount; delete item.vatRate; }); // gắn VAT + giảm giá vào từng dòng
    // "Dấu vân tay" VAT: băm SHA-256 phần thuế từng dòng -> POS so sánh để biết thuế có đổi giữa lúc xem và lúc thanh toán
    const vatFingerprint = require('crypto').createHash('sha256').update(JSON.stringify({ lines:orderItems.map(i=>({ productId:String(i.productId),variantId:String(i.variantId),vat:i.vat,discountAmount:i.discountAmount })),shippingVat })).digest('hex');
    // Chế độ xem trước: trả kết quả tính tiền, KHÔNG trừ kho / không tạo đơn
    if (input.quote) return { items: orderItems, itemsTotal, shippingFee, discountAmount, promotionDiscount: promo.total, voucherDiscount, promotions: promo.applied, tier, grandTotal, vat, shippingVat, vatFingerprint };
    // POS: thuế hoặc tổng tiền khác với số nhân viên vừa báo cho khách -> bắt tính lại
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
        { productId: item.productId, variantId: item.variantId, storeId, stock: { $gte: item.quantity } }, // còn đủ hàng
        { $inc: { stock: -item.quantity }, lastUpdated: new Date() }, // trừ kho
        { new: true, session }
      );
      if (!updated) return await fail(400, `Sản phẩm "${item.name} (${item.variantLabel})" không đủ tồn kho tại cửa hàng đã chọn`);
      undo.push(() => restoreStock(storeId, [item])); // lỗi sau đó -> cộng lại
    }

    // Giữ suất / ngân sách chương trình khuyến mãi
    const exhausted = await claimPromotions(promo.applied, session, session ? null : undo); // trả về tên chương trình đã hết suất (nếu có)
    if (exhausted) return await fail(409, `Chương trình "${exhausted}" vừa hết suất, vui lòng tải lại trang để xem giá mới`);

    // Giữ 1 lượt mã bằng lệnh có điều kiện "còn lượt": 2 đơn tranh lượt cuối chỉ 1 đơn được
    if (voucher) {
      const claimedVoucher = await Voucher.findOneAndUpdate(
        { _id: voucher._id, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] }, // usageLimit 0 = không giới hạn
        { $inc: { usedCount: 1 } }, // tăng số lượt đã dùng
        { new: true, session }
      );
      if (!claimedVoucher) return await fail(400, 'Mã giảm giá vừa hết lượt sử dụng, vui lòng thử lại');
      undo.push(() => Voucher.updateOne({ _id: voucher._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } })); // hoàn lượt nếu lỗi
    }

    const [order] = await Order.create( // create với mảng + session (cú pháp bắt buộc khi dùng transaction)
      [
        {
          orderCode: generateOrderCode(),
          userId,
          source: input.posItems ? 'pos' : 'online', // nguồn đơn: bán tại quầy / đặt online
          createdBy: input.createdBy, // nhân viên tạo (POS)
          createdByName: input.createdByName,
          clientRequestId: input.clientRequestId, // mã yêu cầu của POS (chống gửi trùng)
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
          promotions: promo.applied, // các chương trình đã áp dụng (để hoàn suất khi hủy)
          grandTotal,
          vat,
          shippingVat,
          note,
          invoiceInfo,
          // Dòng lịch sử đầu tiên: "Đơn hàng được tạo"
          statusHistory: [{ status: 'pending', eventType: 'status', storeId, note: 'Đơn hàng được tạo', changedBy: input.createdBy || userId, actorName: input.createdByName || input.actorName, actorRole: input.posItems ? 'staff' : 'customer' }]
        }
      ],
      { session }
    );
    return order;
  } catch (err) {
    if (!(err instanceof BusinessError)) await rollback(); // lỗi bất ngờ (VD lưu đơn thất bại)
    throw err; // ném tiếp cho nơi gọi xử lý
  }
}

// @route POST /api/orders/quote
// @desc  Xem trước tổng tiền của giỏ hàng hiện tại (khuyến mãi tự động + mã giảm giá + VAT) - KHÔNG tạo đơn,
//        không trừ kho, không làm rỗng giỏ. Trang thanh toán dùng để hiển thị đúng số tiền backend sẽ tính.
const quoteOrder = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ tài khoản khách hàng' });
  const { storeId, deliveryMethod = 'home_delivery', voucherCode } = req.body;
  let expressFee = 0; // phụ phí hỏa tốc (nếu khách chọn khung hỏa tốc)
  if (req.body.expressWindowId && mongoose.isValidObjectId(req.body.expressWindowId) && deliveryMethod === 'home_delivery') {
    expressFee = (await require('../models/ExpressWindow').findById(req.body.expressWindowId).select('fee').lean())?.fee || 0;
  }
  if (storeId && !mongoose.isValidObjectId(storeId)) return res.status(400).json({ message: 'Cửa hàng không hợp lệ' });
  if (!DELIVERY_METHODS.includes(deliveryMethod)) return res.status(400).json({ message: 'Hình thức nhận hàng không hợp lệ' });
  const cart = await Cart.findOne({ userId: req.account._id }).lean(); // ĐỌC giỏ (không làm rỗng)
  if (!cart?.items?.length) return res.status(400).json({ message: 'Giỏ hàng đang trống' });
  try {
    const quote = await placeOrder(req.account._id, {
      storeId: storeId || null, deliveryMethod, voucherCode: typeof voucherCode === 'string' && voucherCode.trim() ? voucherCode.trim() : undefined,
      posItems: cart.items, quote: true, expressFee // truyền giỏ như posItems để placeOrder không "nhận" (làm rỗng) giỏ thật
    }, null);
    res.json({ data: quote });
  } catch (err) {
    if (err instanceof BusinessError) return res.status(err.status).json({ message: err.message }); // lỗi nghiệp vụ -> báo khách
    throw err;
  }
});

// @route POST /api/orders
// @desc  Tạo đơn hàng từ giỏ hàng hiện tại - BẮT BUỘC chọn storeId (mô hình multi-store)
const createOrder = asyncHandler(async (req, res) => {
  const { deliveryAddress, deliveryMethod = 'home_delivery', paymentMode = 'cod', voucherCode } =
    req.body;
  let storeId = req.body.storeId; // let: đơn hỏa tốc sẽ đổi sang chi nhánh của khung giờ
  // SỬA LỖI: ghi chú trước đây không kiểm tra kiểu / độ dài -> gửi được ghi chú vài MB lưu thẳng vào đơn
  if (req.body.note !== undefined && req.body.note !== null && typeof req.body.note !== 'string') return res.status(400).json({ message: 'Ghi chú không hợp lệ' });
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : undefined;
  if (note && note.length > MAX_NOTE_LENGTH) return res.status(400).json({ message: `Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự` });
  // Tổng tiền khách đã thấy ở trang thanh toán (để phát hiện giá thay đổi)
  const expectedTotal = req.body.expectedTotal === undefined || req.body.expectedTotal === null ? undefined : Number(req.body.expectedTotal);
  if (expectedTotal !== undefined && !Number.isFinite(expectedTotal)) return res.status(400).json({ message: 'Tổng tiền không hợp lệ' });
  const { error: invoiceError, value: invoiceInfo } = validateInvoiceInfo(req.body.invoiceInfo);
  if (invoiceError) return res.status(400).json({ message: invoiceError });

  if (req.accountRole !== 'customer') { // nhân viên bán hàng dùng POS, không đặt qua đây
    return res.status(403).json({ message: 'Chỉ tài khoản khách hàng mới đặt hàng được' });
  }
  // ĐƠN HỎA TỐC: kiểm tra lại (khung giờ còn mở, đúng sản phẩm, còn hàng, trong bán kính) -> chi nhánh của khung giờ xử lý đơn
  let express = null;
  if (req.body.express && req.accountRole === 'customer') {
    if (deliveryMethod !== 'home_delivery') return res.status(400).json({ message: 'Giao hỏa tốc chỉ áp dụng giao tận nơi' });
    const cart = await Cart.findOne({ userId: req.account._id }).lean();
    const items = (cart?.items || []).map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }));
    const ex = require('../utils/express');
    express = await ex.checkExpress({ items, point: req.body.express, windowId: req.body.express.windowId }); // point = tọa độ khách
    if (!express.ok) return res.status(400).json({ message: 'Không giao hỏa tốc được: ' + express.reason });
    storeId = String(express.store._id); // chi nhánh mở khung hỏa tốc xử lý đơn
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
  if (!['cod', 'bank_transfer', 'vnpay', 'momo'].includes(paymentMode)) return res.status(400).json({ message: 'Hình thức thanh toán không hợp lệ' }); // COD / chuyển khoản / VNPay / MoMo
  // Người nhận (tên + SĐT) luôn bắt buộc; giao tận nơi cần thêm địa chỉ và tỉnh/thành. Trước đây không
  // kiểm tra gì - gọi thẳng API vẫn tạo được đơn giao tận nơi không có địa chỉ.
  const addressError = validateDeliveryAddress(deliveryAddress, deliveryMethod);
  if (addressError) return res.status(400).json({ message: addressError });

  let order;
  try {
    order = await withTransaction((session) => // chạy placeOrder trong transaction (tự thử lại khi xung đột tạm thời)
      placeOrder(req.account._id, { actorName: req.account.displayName, storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode, note, invoiceInfo, expectedTotal, expressFee: express ? express.window.fee : 0 }, session)
    );
  } catch (err) {
    if (express) await require('../models/ExpressWindow').updateOne({ _id: express.window._id }, { $inc: { ordersCount: -1 } }); // trả suất
    if (err instanceof BusinessError) return res.status(err.status).json({ message: err.message });
    throw err; // lỗi hệ thống -> errorHandler
  }

  // soldCount KHÔNG tăng ở đây: đơn mới đặt chưa phải đã bán (có thể bị hủy, tự hủy vì quá hạn thanh
  // toán) - chỉ tính khi đơn chuyển sang "delivered" (xem updateOrderStatus / adjustSoldCount).

  await Notification.create({ // thông báo trong web cho khách
    userId: req.account._id,
    type: 'order',
    title: 'Đặt hàng thành công',
    message: `Đơn hàng ${order.orderCode} đã được tiếp nhận`,
    link: `/account/orders/${order._id}`
  });

  emailOrderPlaced(order); // email xác nhận đơn (chạy nền)
  if (express) order = await startExpressOrder(req, order, express); // hỏa tốc: tự xác nhận + phân công shipper

  const io = req.app.get('io');
  if (io) io.to(`user_${req.account._id}`).emit('order:created', { orderId: order._id, orderCode: order.orderCode }); // báo real-time

  res.status(201).json({ data: order }); // 201 = đã tạo
});

// Đơn hỏa tốc vừa đặt: gắn phương án giao 'express', tự xác nhận (COD / chuyển khoản), phân công shipper rảnh nhất
// của chi nhánh và báo ngay cho shipper qua socket. Thanh toán online: chờ thanh toán xong, shipper vẫn được giữ trước.
async function startExpressOrder(req, order, express) {
  const { addressKey } = require('../utils/deliveryRouting'); // khóa địa chỉ (nhóm đơn cùng địa chỉ)
  const { pickShipper } = require('../utils/express'); // chọn shipper đang ít đơn nhất
  const now = new Date();
  const shipper = await pickShipper(express.store._id); // có thể null nếu chi nhánh không còn shipper rảnh
  const base = order.toObject ? order.toObject() : order; // document -> object thường
  const plan = { // phương án giao hàng: hỏa tốc, đã có tọa độ + khoảng cách
    storeId: express.store._id, addressKey: addressKey({ ...base, storeId: express.store._id }), sameProvince: true,
    lat: Number(req.body.express.lat), lng: Number(req.body.express.lng), distanceMeters: express.distanceMeters, durationSeconds: express.durationSeconds,
    routingProvider: express.provider, calculatedAt: now, mode: 'express', verifiedAt: now
  };
  const deadlineText = express.deadline.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }); // "14:30"
  const sys = { account: { name: 'Hệ thống' }, accountRole: 'system' }; // "người thao tác" giả cho lịch sử
  const set = { deliveryPlan: plan, express: { windowId: express.window._id, fee: express.window.fee, deadline: express.deadline, distanceMeters: express.distanceMeters, assignedAt: shipper ? now : undefined } };
  const history = [historyEntry(sys, order.status, 'Đơn HỎA TỐC: giao trước ' + deadlineText + ' (' + (express.distanceMeters / 1000).toFixed(1) + ' km)', undefined, express.store.name, 'activity', express.store._id)];
  if (['cod', 'bank_transfer'].includes(order.paymentMode) && order.status === 'pending') { // không chờ thanh toán online -> xác nhận luôn
    set.status = 'confirmed';
    history.push(historyEntry(sys, 'confirmed', 'Tự xác nhận đơn hỏa tốc', undefined, express.store.name, 'status', express.store._id));
  }
  const push = { statusHistory: { $each: history } }; // thêm nhiều dòng lịch sử cùng lúc
  if (shipper) { // có shipper -> phân công ngay
    Object.assign(set, { shipperId: shipper._id, assignedAt: now, assignedByName: 'Hệ thống (hỏa tốc)' });
    push.assignmentLog = { action: 'assign', method: 'internal', shipperId: shipper._id, shipperName: shipper.name, byName: 'Hệ thống (hỏa tốc)', at: now, note: 'Tự phân công đơn hỏa tốc' };
  }
  const updated = await Order.findOneAndUpdate({ _id: order._id }, { $set: set, $push: push }, { new: true });
  const io = req.app.get('io');
  if (io && shipper) io.to('user_' + shipper._id).emit('express:assigned', { orderId: order._id, orderCode: order.orderCode, deadline: express.deadline, address: order.deliveryAddress }); // báo shipper
  return updated || order;
}

// @route GET /api/orders - "Đơn hàng của tôi" (khách): lọc theo trạng thái / nhóm tab / từ khóa + số đếm từng tab
const getMyOrders = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ dành cho tài khoản khách hàng' });
  const page = Math.min(1000000, Math.max(1, Math.floor(Number(req.query.page) || 1))); // trang >= 1
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 10))); // 1..100 đơn / trang, mặc định 10
  const base = { userId: req.account._id }; // CHỈ đơn của chính khách
  const status = req.query.status;
  if (status && !Order.schema.path('status').enumValues.includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' }); // trạng thái phải có trong danh sách
  // Nhóm tab theo góc nhìn khách: gom các trạng thái kỹ thuật
  const group = MY_ORDER_GROUPS[req.query.group];
  if (req.query.group && !group) return res.status(400).json({ message: 'Nhóm đơn không hợp lệ' });
  const filter = { ...base, ...(status ? { status } : group ? { status: { $in: group } } : {}) }; // ưu tiên status, sau đó nhóm
  const q = String(req.query.q || '').trim().slice(0, 100); // từ khóa tối đa 100 ký tự
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // thoát ký tự đặc biệt -> tìm đúng chữ (chống ReDoS)
    filter.$or = [{ orderCode: rx }, { 'items.name': rx }]; // tìm theo mã đơn hoặc tên sản phẩm
  }
  const Review = require('../models/Review');
  const [orders, total, counts, reviewed, deliveredItems] = await Promise.all([ // chạy song song 5 truy vấn
    Order.find(filter).populate('storeId', 'name city').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), // trang hiện tại
    Order.countDocuments(filter), // tổng số đơn khớp lọc
    Order.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]), // đếm theo trạng thái (mọi đơn của khách)
    Review.distinct('productId', { userId: req.account._id }), // sản phẩm khách đã đánh giá
    Order.distinct('items.productId', { ...base, status: 'delivered' }) // sản phẩm khách đã nhận
  ]);
  const reviewedSet = new Set(reviewed.map(String));
  const data = (await enrichHistory(orders)).map((o) => { // enrichHistory: bổ sung tên người thao tác trong lịch sử
    const obj = o.toObject ? o.toObject() : o;
    // Sản phẩm trong đơn đã giao mà khách chưa đánh giá -> hiện nút "Đánh giá"
    obj.toReview = obj.status === 'delivered' ? [...new Set(obj.items.map((i) => String(i.productId)).filter((id) => !reviewedSet.has(id)))] : [];
    return obj;
  });
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.count])); // { pending: 2, delivered: 5, ... }
  const groupCounts = Object.fromEntries(Object.entries(MY_ORDER_GROUPS).map(([k, sts]) => [k, sts.reduce((n, st) => n + (countMap[st] || 0), 0)])); // cộng theo nhóm tab
  // Đơn online chưa thanh toán (hiện nhắc "Thanh toán ngay")
  const unpaid = await Order.countDocuments({ ...base, status: 'pending', paymentMode: { $in: ['vnpay', 'momo'] }, paymentStatus: { $in: ['pending', 'failed'] } });
  res.json({
    data, total, page, totalPages: Math.ceil(total / limit), counts: countMap, groupCounts,
    todo: { toReview: deliveredItems.filter((id) => !reviewedSet.has(String(id))).length, shipping: groupCounts.shipping, unpaid } // "việc cần làm" của khách
  });
});

// @route GET /api/orders/:id - chi tiết 1 đơn (chủ đơn, hoặc nhân viên có quyền + đúng chi nhánh)
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('storeId', 'name city address phoneNumber').populate('createdBy handover.by receipt.by', 'name');
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

  // Trước đây cho phép BẤT KỲ staff nào xem chi tiết đơn hàng bất kỳ, bất kể có quyền 'orders.manage'
  // hay không - lộ dữ liệu đơn hàng (địa chỉ, SĐT, giá trị mua) cho staff không được cấp quyền quản
  // lý đơn hàng, trong khi danh sách đơn hàng (getAllOrders) đã được chặn đúng theo quyền này.
  const isOwner = String(order.userId) === String(req.account._id); // chủ đơn?
  if (!isOwner && !hasPermission(req, 'orders.manage')) {
    return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này' });
  }
  if (!isOwner && !inScope(req, order)) { // nhân viên chi nhánh khác
    return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác, bạn không có quyền xem' });
  }
  const data = (await enrichHistory([order]))[0];
  // Khách xem đơn của mình: không cần chi tiết kỹ thuật các lần thử hoàn tiền qua cổng thanh toán
  if (req.accountRole === 'customer' && data?.refundInfo) {
    const { attempts, requestId, ...rest } = data.refundInfo.toObject ? data.refundInfo.toObject() : data.refundInfo; // bỏ 2 trường kỹ thuật
    data.refundInfo = rest;
  }
  res.json({ data });
});

// @route PUT /api/orders/:id/cancel - KHÁCH tự hủy đơn
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (String(order.userId) !== String(req.account._id)) { // chỉ chủ đơn
    return res.status(403).json({ message: 'Bạn không có quyền hủy đơn hàng này' });
  }
  if (order.activeTransferId) return res.status(409).json({ message: 'Đơn đang chờ điều phối, vui lòng chờ hoặc liên hệ cửa hàng hủy yêu cầu điều phối' }); // đang chuyển sang chi nhánh khác
  if (activeShipment(order)) return res.status(409).json({ message: 'Cần cửa hàng hủy/xác minh vận đơn GHN trước khi hủy đơn hàng' }); // đã gửi cho đơn vị vận chuyển
  // Khách chỉ tự hủy khi cửa hàng CHƯA chuẩn bị hàng (chờ xác nhận / đã xác nhận). Đang chuẩn bị / sẵn sàng nhận
  // thì liên hệ cửa hàng (nhân viên vẫn hủy được) - trước đây API cho khách hủy cả đơn đã đóng gói xong.
  if (!['pending', 'confirmed'].includes(order.status)) {
    return res.status(400).json({ message: order.status === 'processing' || order.status === 'ready_for_pickup' ? 'Cửa hàng đã chuẩn bị hàng, vui lòng liên hệ cửa hàng để hủy đơn' : 'Đơn hàng đã được xử lý, không thể hủy' });
  }
  // (2) Lý do hủy: chỉ nhận chuỗi, tối đa 300 ký tự
  const cancelReason = (typeof req.body.reason === 'string' && req.body.reason.trim().slice(0, 300)) || 'Khách hàng yêu cầu hủy';

  // Update có điều kiện: chỉ thắng nếu status ĐÚNG BẰNG status vừa đọc ở trên - nếu 1 request khác
  // (double-click, tab khác) đã hủy đơn này trước, request này sẽ nhận null và dừng lại, tránh hoàn
  // kho 2 lần cho cùng 1 đơn hàng.
  // Điều kiện kèm cả paymentStatus: nếu kết quả thanh toán vừa về đúng lúc khách bấm hủy thì nhận 409
  // (tải lại rồi hủy), không để đơn "đã hủy" mà vẫn "đã thanh toán" thay vì "đã hoàn tiền".
  // Đổi trạng thái + hoàn kho + trả lượt mã chạy chung 1 transaction: không bao giờ hủy rồi mà chưa hoàn kho.
  const updated = await withTransaction(async (session) => {
    const changed = await Order.findOneAndUpdate(
      { _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, paymentStatus: order.paymentStatus, ...shipmentGuard(order) }, // đơn chưa bị ai đổi
      {
        $set: {
          status: 'cancelled',
          cancelReason,
          // Đơn đã thanh toán online bị hủy -> chờ nhân viên hoàn tiền
          ...(order.paymentStatus === 'paid' ? { refundStatus: 'pending' } : {})
        },
        $push: { statusHistory: historyEntry(req, 'cancelled', cancelReason, { status: { from: order.status, to: 'cancelled' } }, undefined, 'status', order.storeId) }
      },
      { new: true, session }
    );
    if (!changed) return null; // thua cuộc đua -> không làm gì thêm
    await restoreStock(order.storeId, order.items, session); // cộng lại tồn kho
    await releaseVoucher(order, session); // trả lượt mã + suất khuyến mãi + suất hỏa tốc
    return changed;
  });
  if (!updated) {
    return res.status(409).json({ message: 'Đơn hàng vừa được cập nhật, vui lòng tải lại trang' });
  }

  emailOrderStatus(updated, 'cancelled'); // email báo hủy (chạy nền)
  res.json({ data: updated });
});

// ---------- ADMIN/STAFF ----------

// @route GET /api/orders/admin/all?storeId= - danh sách đơn cho trang quản trị (nhiều bộ lọc + số đếm từng trạng thái)
const getAllOrders = asyncHandler(async (req, res) => {
  const { status, storeId, paymentStatus, paymentMode, from, to, q, page = 1, limit = 20 } = req.query; // page/limit đã chuẩn hóa ở paginationGuard
  const filter = {};
  if (req.query.source === 'pos') filter.source = 'pos'; // đơn bán tại quầy
  if (req.query.source === 'online') filter.source = { $ne: 'pos' }; // đơn online (gồm đơn cũ chưa có trường source)
  if (DELIVERY_METHODS.includes(req.query.deliveryMethod)) filter.deliveryMethod = req.query.deliveryMethod;
  if (status) filter.status = status;
  if (storeId) filter.storeId = storeId;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  // Lọc khoản hoàn tiền: chờ hoàn (gồm đang gửi lệnh hoàn) / đã hoàn
  if (req.query.refundStatus === 'pending') filter.refundStatus = { $in: ['pending', 'processing'] };
  if (req.query.refundStatus === 'completed') filter.refundStatus = 'completed';
  if (paymentMode) filter.paymentMode = paymentMode;
  const created = dateRange(from, to); // khoảng ngày đặt
  if (created) filter.createdAt = created;
  Object.assign(filter, searchFilter(q)); // mã đơn, người nhận, SĐT, sản phẩm (không dấu)
  // Quản lý chi nhánh chỉ thấy đơn của chi nhánh mình (bỏ qua storeId gửi lên nếu khác)
  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId) filter.storeId = scopedStoreId;

  const orders = await Order.find(filter)
    .populate('userId', 'displayName email phoneNumber') // thông tin khách
    .populate('storeId', 'name city')
    .populate('createdBy handover.by receipt.by', 'name') // người tạo / bàn giao / nhận hàng trả
    .sort({ createdAt: -1 }) // mới nhất trước
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
  // Hóa đơn điện tử đang hiệu lực của các đơn trong trang (nút "Xuất hóa đơn" / "HĐ số..." ngay trên dòng đơn)
  const invs = await require('../models/EInvoice').find({ orderId: { $in: orders.map((o) => o._id) }, status: 'issued' }).select('orderId template series number lookupCode').lean();
  const invMap = new Map(invs.map((i) => [String(i.orderId), i]));
  const data = (await enrichHistory(orders)).map((o) => { const x = o.toObject ? o.toObject() : o; const i = invMap.get(String(x._id)); x.einvoice = i ? { _id: i._id, template: i.template, series: i.series, number: i.number, lookupCode: i.lookupCode } : null; return x; }); // gắn hóa đơn (nếu có) vào từng đơn
  res.json({ data, total, page: Number(page), totalPages: Math.ceil(total / limit), statusCounts });
});

// @route PUT /api/orders/:id/status - nhân viên đổi trạng thái (xác nhận, chuẩn bị, sẵn sàng nhận, hủy, trả hàng)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  // SỬA LỖI: ghi chú trước đây không kiểm tra kiểu / độ dài (object làm lỗi lưu; chuỗi vài MB lưu thẳng vào lịch sử + email)
  if (req.body.note !== undefined && req.body.note !== null && typeof req.body.note !== 'string') return res.status(400).json({ message: 'Ghi chú không hợp lệ' });
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : undefined;
  if (note && note.length > MAX_NOTE_LENGTH) return res.status(400).json({ message: `Ghi chú / lý do tối đa ${MAX_NOTE_LENGTH} ký tự` });
  const validStatuses = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping', 'returning', 'delivered', 'cancelled', 'returned'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!inScope(req, order)) { // đơn chi nhánh khác
    return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác, bạn không có quyền xử lý' });
  }

  // 3 trạng thái này cần bằng chứng (lấy hàng / bàn giao / nhận hàng trả) -> phải đi qua API giao hàng riêng
  if (['shipping', 'delivered', 'returned'].includes(status)) return res.status(400).json({ message: 'Vui lòng dùng thao tác lấy hàng, bàn giao hoặc nhận hàng trả tương ứng' });
  const result = await transitionOrder(req, order, status, { note });
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});

// Chuyển trạng thái 1 đơn theo đúng quy tắc (bảng chuyển trạng thái, đơn online chưa thanh toán chỉ được hủy),
// trong 1 transaction cùng hoàn kho / trả lượt mã / số "đã bán", rồi báo khách (thông báo, email, Socket.IO).
// Dùng chung cho nhân viên xử lý đơn (updateOrderStatus) và nhân viên giao hàng (deliveryController).
// extraSet / extraPush: trường ghi thêm cùng lệnh (VD lần giao hàng, thời điểm thu COD). Trả { updated } hoặc { error }.
// action: thao tác cụ thể gọi tới (shipperPickup, deliverySuccess, storeHandover, carrierPickup, receiveReturn...)
async function transitionOrder(req, order, status, { note, extraSet = {}, extraPush = {}, action } = {}) {
  if (order.activeTransferId) return { error: { status: 409, message: 'Đơn đang chờ điều phối; hãy hoàn tất hoặc hủy yêu cầu điều phối' } };
  const carrier = ['carrierPickup', 'carrierSuccess', 'carrierReturn'].includes(action); // thao tác do đơn vị vận chuyển (GHN) báo về
  if (carrier && order.shipment?.phase !== 'active') return { error: { status: 409, message: 'Không có vận đơn hoạt động' } };
  // Ngoại lệ: vận đơn GIẢ LẬP đang chờ lấy hàng vẫn cho cửa hàng chuyển đơn sang "đang chuẩn bị"
  const preparingAssigned = order.status === 'confirmed' && status === 'processing' && order.shipment?.environment === 'simulation' && order.shipment?.phase === 'active' && order.shipment?.status === 'ready_to_pick';
  // Đơn đã giao cho GHN: nhân viên không tự đổi trạng thái (trạng thái do GHN báo về)
  if (activeShipment(order) && !carrier && action !== 'receiveReturn' && !preparingAssigned) return { error: { status: 409, message: 'Đơn có vận đơn GHN; hãy đồng bộ hoặc hủy vận đơn trước' } };
  if (action === 'receiveReturn' && activeShipment(order) && order.shipment.status !== 'returned') return { error: { status: 409, message: 'GHN chưa xác nhận trả hàng về chi nhánh' } };
  const actorStore = await Store.findById(order.storeId).select('name').lean(); // tên chi nhánh ghi vào lịch sử
  // Ảnh bằng chứng (bàn giao / lấy hàng / giao hàng) phải được "giữ lại" cùng transaction với việc đổi trạng thái
  const proofIds = [...(extraSet.handover?.evidenceIds || []), ...(extraSet.carrierPickupProof?.evidenceIds || []), ...(extraSet.carrierDeliveryProof?.evidenceIds || [])];
  if (proofIds.length && !(await require('../utils/transaction').transactionsSupported())) return { error: { status: 503, message: 'Cần MongoDB replica set để lưu bằng chứng và bàn giao an toàn' } };
  if (status === 'shipping' && order.paymentMode !== 'cod' && order.paymentStatus !== 'paid') return { error: { status: 400, message: 'Cửa hàng cần xác nhận thanh toán trước khi giao' } }; // chuyển khoản chưa nhận tiền -> chưa giao
  // Đơn thanh toán online (VNPay/MoMo) phải thanh toán xong mới được xác nhận/giao - nếu không có thể giao hàng
  // khi chưa nhận được tiền. Đơn chưa thanh toán chỉ có thể hủy (khách/admin) hoặc chờ khách thanh toán lại.
  if (Order.ONLINE_PAYMENT_MODES.includes(order.paymentMode) && order.paymentStatus !== 'paid' && !RESTOCK_STATUSES.includes(status)) {
    const label = Order.PAYMENT_LABELS[order.paymentMode];
    return { error: { status: 400, message: `Đơn thanh toán qua ${label} chưa được thanh toán, chưa thể xử lý tiếp` } };
  }

  // Mỗi trạng thái đặc biệt chỉ đạt được qua đúng thao tác của nó
  if (status === 'shipping' && (!['shipperPickup', 'carrierPickup'].includes(action) || order.deliveryMethod !== 'home_delivery')) return { error: { status: 400, message: 'Cần shipper hoặc GHN xác nhận lấy hàng' } };
  if (status === 'ready_for_pickup' && order.deliveryMethod !== 'store_pickup') return { error: { status: 400, message: 'Chỉ áp dụng cho đơn nhận tại cửa hàng' } };
  if (status === 'delivered' && !['deliverySuccess', 'storeHandover', 'carrierSuccess'].includes(action)) return { error: { status: 400, message: 'Cần xác nhận bàn giao và thanh toán' } };
  if (status === 'returned' && action !== 'receiveReturn') return { error: { status: 400, message: 'Kho phải xác nhận nhận hàng trả' } };
  if (status === 'returning' && !text(note)) return { error: { status: 400, message: 'Cần lý do trả hàng' } };
  if (status === 'cancelled' && (!text(note) || /^Cập nhật trạng thái/.test(text(note)))) return { error: { status: 400, message: 'Cần lý do hủy đơn' } }; // không chấp nhận câu mặc định làm lý do
  // Dữ liệu cũ: đơn nhận tại cửa hàng từng bị đặt "shipping" -> cho phép bàn giao thẳng sang "delivered"
  const legacyPickup = action === 'storeHandover' && order.deliveryMethod === 'store_pickup' && order.status === 'shipping';
  const allowedNext = legacyPickup ? ['delivered'] : (ORDER_STATUS_TRANSITIONS[order.status] || []); // các bước hợp lệ tiếp theo
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
      // Điều kiện: đơn chưa đổi + (GHN: đúng "khóa" vận đơn) + (shipper: vẫn đúng shipper) + (giao thất bại: số lần giao chưa đổi)
      { _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, paymentStatus: order.paymentStatus, ...shipmentGuard(order), ...(carrier ? { 'shipment.lease': order.shipment.lease } : {}), ...(['deliverySuccess', 'deliveryReturn', 'shipperPickup'].includes(action) ? { shipperId: order.shipperId } : {}), ...(action === 'deliveryReturn' ? { $expr: { $eq: [{ $size: { $ifNull: ['$deliveryAttempts', []] } }, order.deliveryAttempts.length] } } : {}) },
      {
        $set: {
          status,
          // Xác nhận đơn: ghi ai xác nhận, lúc nào, ở chi nhánh nào
          ...(status === 'confirmed' ? { confirmedBy: req.account._id, confirmedByName: req.account.name || req.account.displayName, confirmedAt: new Date(), confirmedStoreName: actorStore?.name || '' } : {}),
          ...extraSet,
          ...(status === 'returning' ? { returnRequestedAt: new Date(), returnWasDelivered: order.status === 'delivered' } : {}), // nhớ đơn trả là đã giao hay chưa
          ...(status === 'delivered' && order.paymentMode === 'cod' ? { paymentStatus: 'paid' } : {}), // COD: giao xong = đã thu tiền
          // Đơn bán tại quầy không gắn tài khoản khách -> không tích điểm
          ...(status === 'delivered' ? { loyaltyPoints: order.userId ? pointsForOrder(order, loyaltyConfig) : 0 } : {}),
          // Đơn đã thu tiền bị hủy / trả hàng: chờ nhân viên xác nhận đã hoàn tiền thật (confirm-refund),
          // không tự đánh dấu "đã hoàn tiền" khi tiền chưa thực sự trả lại khách.
          ...(RESTOCK_STATUSES.includes(status) && order.paymentStatus === 'paid'
            ? { refundStatus: 'pending' }
            : {})
        },
        $push: { statusHistory: historyEntry(req, status, note, { status: { from: order.status, to: status } }, actorStore?.name, 'status', order.storeId), ...extraPush } // thêm dòng lịch sử
      },
      { new: true, session }
    );
    if (!changed) return null; // có người khác vừa đổi đơn
    if (proofIds.length) { // ảnh bằng chứng: bỏ hạn tự xóa -> lưu vĩnh viễn (chỉ ảnh do chính người này tải, chưa hết hạn)
      const promoted = await require('../models/DeliveryEvidence').updateMany({ _id: { $in: proofIds }, orderId: order._id, uploadedBy: req.account._id, expiresAt: { $gt: new Date() } }, { $unset: { expiresAt: '' } }, { session });
      if (promoted.modifiedCount !== proofIds.length) throw new BusinessError(409, 'Ảnh đã hết hạn hoặc được sử dụng, vui lòng tải lại'); // ném lỗi -> transaction hủy hết
    }
    if (RESTOCK_STATUSES.includes(status)) { // hủy / đã nhận hàng trả
      await restoreStock(order.storeId, order.items, session); // cộng lại kho
      await releaseVoucher(order, session); // trả lượt mã, suất khuyến mãi, suất hỏa tốc
    }
    // "Đã bán" và điểm thành viên = khách đã nhận hàng: cộng khi giao thành công, trừ lại khi đơn ĐÃ GIAO bị trả
    // hàng. Trả hàng đi qua bước "returning" (kho xác nhận nhận lại hàng) nên dựa vào cờ returnWasDelivered ghi lúc
    // chuyển sang returning; đơn bị trả khi đang giao (shipping -> returning) chưa từng được cộng nên không trừ.
    const wasDelivered = order.status === 'delivered' || (order.status === 'returning' && order.returnWasDelivered === true);
    if (status === 'delivered') {
      await adjustSoldCount(order.items, 1, session); // tăng "đã bán"
      // Sổ bảo hành điện tử cho từng máy, ngày mua = hôm nay (ngày giao thành công)
      await createCardsForOrder(changed, session, new Date());
      if (changed.userId && changed.loyaltyPoints > 0) { // cộng điểm thành viên
        await User.updateOne({ _id: changed.userId }, { $inc: { loyaltyPoints: changed.loyaltyPoints } }, { session });
      }
    } else if (status === 'returned' && wasDelivered) { // trả hàng sau khi đã giao -> đảo ngược mọi thứ đã cộng
      await adjustSoldCount(order.items, -1, session);
      await voidCardsForOrder(order._id, `Đơn ${order.orderCode} đã trả hàng`, session); // hủy phiếu bảo hành
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

  // ----- Sau khi lưu thành công: báo cho khách (đơn tại quầy không có tài khoản thì bỏ qua thông báo)
  if (order.userId) await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Cập nhật đơn hàng',
    message: status === 'ready_for_pickup' ? `Đơn ${order.orderCode} đã sẵn sàng, vui lòng đến cửa hàng nhận hàng` : `Đơn hàng ${order.orderCode} đã cập nhật trạng thái`,
    link: `/account/orders/${order._id}`
  });
  emailOrderStatus(updated, status, note); // email (chạy nền)

  const io = req.app.get('io');
  if (io && order.userId) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status }); // cập nhật real-time trang của khách
  // Tự xuất hóa đơn điện tử khi giao thành công (nếu bật trong cấu hình) - chạy nền, không chặn phản hồi
  if (status === 'delivered') require('../utils/einvoice').autoIssueIfEnabled(order._id);

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
