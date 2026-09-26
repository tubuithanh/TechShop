const PAYMENT_MODES = ['cod', 'bank_transfer', 'vnpay', 'momo'];
// Lặp lại 'delivered' nhiều lần để đơn hàng lịch sử thiên về đã hoàn tất (giống dữ liệu thực tế)
const STATUS_WEIGHTED = [
  'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
  'shipping', 'processing', 'confirmed', 'pending', 'cancelled', 'returned'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(daysBack = 120) {
  return new Date(Date.now() - randInt(0, daysBack) * 86400000 - randInt(0, 86400000));
}

function orderCode(index) {
  return `DH${String(index).padStart(6, '0')}`;
}

// COD: thu tiền khi giao. Thanh toán online (VNPay/MoMo/chuyển khoản): phải trả xong mới được xác nhận đơn,
// nên đơn đã qua bước "chờ xác nhận" luôn là "đã thanh toán", đơn hủy/trả hàng sau khi trả là "đã hoàn tiền".
function paymentStatusFor(status, paymentMode) {
  if (paymentMode === 'cod') {
    if (status === 'delivered') return 'paid';
    if (status === 'cancelled' || status === 'returned') return 'failed';
    return 'pending';
  }
  if (status === 'pending') return 'pending';
  if (status === 'cancelled' || status === 'returned') return 'refunded';
  return 'paid';
}

/**
 * Sinh danh sách đơn hàng mẫu, lấy ngẫu nhiên khách hàng/sản phẩm/cửa hàng đã có sẵn trong DB.
 */
function generateOrders(count, { customers, products, stores }) {
  const orders = [];
  for (let i = 1; i <= count; i++) {
    const customer = pick(customers);
    const store = pick(stores);
    const itemCount = randInt(1, 3);
    const items = [];
    for (let k = 0; k < itemCount; k++) {
      const product = pick(products);
      const variant = pick(product.variants);
      items.push({
        productId: product._id,
        variantId: variant._id,
        variantLabel: variant.label,
        quantity: randInt(1, 2),
        unitPrice: variant.effectivePrice,
        name: product.title,
        image: variant.image || product.featuredImage
      });
    }
    const itemsTotal = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const deliveryMethod = Math.random() < 0.85 ? 'home_delivery' : 'store_pickup';
    const shippingFee = deliveryMethod === 'store_pickup' ? 0 : 30000;
    const hasVoucher = Math.random() < 0.3;
    const discountAmount = hasVoucher ? Math.min(500000, Math.round((itemsTotal * 0.1) / 10000) * 10000) : 0;
    const grandTotal = Math.max(itemsTotal + shippingFee - discountAmount, 0);
    const status = pick(STATUS_WEIGHTED);
    const paymentMode = pick(PAYMENT_MODES);
    const createdAt = randomPastDate();
    const address = customer.addresses?.[0];

    orders.push({
      orderCode: orderCode(i),
      userId: customer._id,
      storeId: store._id,
      deliveryAddress: {
        addressLine1: address?.addressLine1 || '',
        addressLine2: address?.addressLine2 || '',
        city: address?.city || '',
        state: address?.state || '',
        pincode: address?.pincode || '',
        fullName: customer.displayName,
        phone: customer.phoneNumber
      },
      paymentMode,
      status,
      items,
      deliveryMethod,
      itemsTotal,
      shippingFee,
      discountAmount,
      voucherCode: hasVoucher ? 'WELCOME10' : null,
      grandTotal,
      paymentStatus: paymentStatusFor(status, paymentMode),
      statusHistory: [{ status, note: 'Khởi tạo dữ liệu mẫu', changedAt: createdAt }],
      note: '',
      createdAt
    });
  }
  return orders;
}

module.exports = { generateOrders };
