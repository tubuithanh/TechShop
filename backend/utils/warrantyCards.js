// Tạo / hủy sổ bảo hành điện tử (models/WarrantyCard.js) theo vòng đời đơn hàng.
const crypto = require('crypto'); // sinh phần ngẫu nhiên của mã sổ
const WarrantyCard = require('../models/WarrantyCard'); // sổ bảo hành (mỗi máy 1 sổ)
const Product = require('../models/Product'); // thời hạn / cách tính bảo hành theo sản phẩm
const Brand = require('../models/Brand'); // trung tâm bảo hành của hãng

const ACTIVATION_WINDOW_DAYS = 30; // khách có 30 ngày kể từ ngày mua để kích hoạt
const MAX_UNITS_PER_LINE = 50; // chặn dữ liệu bất thường tạo hàng nghìn sổ

const newCode = () => `SBH${Date.now().toString(36).toUpperCase().slice(-5)}${crypto.randomBytes(3).toString('hex').toUpperCase()}`; // mã sổ: "SBH" + thời gian (cơ số 36) + 6 ký tự hex ngẫu nhiên

function deliveredDate(order) {
  const entry = [...(order.statusHistory || [])].reverse().find((h) => h.status === 'delivered' && h.eventType !== 'activity'); // lần chuyển "delivered" gần nhất
  return entry?.changedAt || order.handover?.at || order.createdAt || new Date(); // không có thì lấy lúc bàn giao / lúc đặt
}

// Tạo sổ cho mọi máy của đơn đã giao (bỏ qua nếu đơn đã có sổ - gọi lại nhiều lần vẫn an toàn)
async function createCardsForOrder(order, session = null, purchaseDate = null) {
  if (await WarrantyCard.exists({ orderId: order._id }).session(session)) return []; // đơn đã có sổ -> không tạo lại
  const productIds = [...new Set((order.items || []).map((i) => String(i.productId)))]; // các sản phẩm trong đơn (bỏ trùng)
  const products = await Product.find({ _id: { $in: productIds } }, 'warrantyMonths warrantyStartFrom warrantyProvider brandId', { session }).lean(); // chỉ lấy trường bảo hành
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const brandIds = products.filter((p) => p.warrantyProvider === 'manufacturer' && p.brandId).map((p) => p.brandId); // sản phẩm do hãng bảo hành -> cần thông tin hãng
  const brands = brandIds.length ? await Brand.find({ _id: { $in: brandIds } }, 'name warrantyCenter', { session }).lean() : [];
  const brandMap = new Map(brands.map((b) => [String(b._id), b]));
  const bought = purchaseDate || deliveredDate(order); // ngày mua = ngày nhận hàng

  const docs = [];
  for (const item of order.items || []) {
    const product = productMap.get(String(item.productId));
    const months = product?.warrantyMonths ?? 12; // mặc định 12 tháng
    const startFrom = product?.warrantyStartFrom || 'purchase'; // tính từ ngày mua hoặc ngày kích hoạt
    const provider = product?.warrantyProvider || 'store'; // cửa hàng hay hãng bảo hành
    const brand = provider === 'manufacturer' ? brandMap.get(String(product.brandId)) : null;
    const center = brand?.warrantyCenter || {};
    const units = Math.min(Number(item.quantity) || 1, MAX_UNITS_PER_LINE); // mua 3 máy -> 3 sổ
    for (let u = 0; u < units; u++) { // mỗi máy 1 sổ
      docs.push({
        code: newCode(),
        orderId: order._id,
        orderCode: order.orderCode,
        unitIndex: u, // máy thứ mấy trong dòng hàng
        productId: item.productId,
        variantId: item.variantId,
        productName: item.name,
        variantLabel: item.variantLabel || '',
        unitPrice: item.unitPrice, // giá máy (tính giá gói gia hạn theo %)
        userId: order.userId || null,
        customerName: order.deliveryAddress?.fullName || '',
        customerPhone: order.deliveryAddress?.phone || '',
        storeId: order.storeId,
        provider,
        providerInfo: provider === 'manufacturer'
          ? { name: center.name || `Trung tâm bảo hành ${brand?.name || 'hãng'}`, phone: center.phone || '', website: center.website || '', address: center.address || '', lookupUrl: center.lookupUrl || '' }
          : undefined,
        purchaseDate: bought,
        startFrom,
        activationDeadline: startFrom === 'activation' ? new Date(new Date(bought).getTime() + ACTIVATION_WINDOW_DAYS * 86400000) : undefined, // hạn kích hoạt = ngày mua + 30 ngày
        baseMonths: months // số tháng gốc (chưa gồm gia hạn)
      });
    }
  }
  if (!docs.length) return [];
  return WarrantyCard.insertMany(docs, { session }); // tạo nhiều sổ 1 lần
}

// Đơn đã giao bị trả hàng -> sổ bảo hành hết hiệu lực
async function voidCardsForOrder(orderId, reason, session = null) {
  await WarrantyCard.updateMany({ orderId, status: 'active' }, { $set: { status: 'void', voidReason: reason } }, { session }); // mọi sổ của đơn -> hủy
}

// Đơn giao TRƯỚC khi có tính năng sổ bảo hành: tạo bù khi khách / nhân viên tra cứu
async function ensureCardsForOrders(orders) {
  for (const order of orders) {
    if (order.status === 'delivered') { // chỉ đơn đã giao mới có sổ
      try {
        await createCardsForOrder(order);
      } catch (err) {
        if (err.code !== 11000) throw err; // trùng mã (cực hiếm) / 2 request cùng tạo -> bỏ qua
      }
    }
  }
}

module.exports = { createCardsForOrder, voidCardsForOrder, ensureCardsForOrders, deliveredDate, ACTIVATION_WINDOW_DAYS };
