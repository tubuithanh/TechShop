// Tạo / hủy sổ bảo hành điện tử (models/WarrantyCard.js) theo vòng đời đơn hàng.
const crypto = require('crypto');
const WarrantyCard = require('../models/WarrantyCard');
const Product = require('../models/Product');
const Brand = require('../models/Brand');

const ACTIVATION_WINDOW_DAYS = 30; // khách có 30 ngày kể từ ngày mua để kích hoạt
const MAX_UNITS_PER_LINE = 50; // chặn dữ liệu bất thường tạo hàng nghìn sổ

const newCode = () => `SBH${Date.now().toString(36).toUpperCase().slice(-5)}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

function deliveredDate(order) {
  const entry = [...(order.statusHistory || [])].reverse().find((h) => h.status === 'delivered' && h.eventType !== 'activity');
  return entry?.changedAt || order.handover?.at || order.createdAt || new Date();
}

// Tạo sổ cho mọi máy của đơn đã giao (bỏ qua nếu đơn đã có sổ - gọi lại nhiều lần vẫn an toàn)
async function createCardsForOrder(order, session = null, purchaseDate = null) {
  if (await WarrantyCard.exists({ orderId: order._id }).session(session)) return [];
  const productIds = [...new Set((order.items || []).map((i) => String(i.productId)))];
  const products = await Product.find({ _id: { $in: productIds } }, 'warrantyMonths warrantyStartFrom warrantyProvider brandId', { session }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const brandIds = products.filter((p) => p.warrantyProvider === 'manufacturer' && p.brandId).map((p) => p.brandId);
  const brands = brandIds.length ? await Brand.find({ _id: { $in: brandIds } }, 'name warrantyCenter', { session }).lean() : [];
  const brandMap = new Map(brands.map((b) => [String(b._id), b]));
  const bought = purchaseDate || deliveredDate(order);

  const docs = [];
  for (const item of order.items || []) {
    const product = productMap.get(String(item.productId));
    const months = product?.warrantyMonths ?? 12;
    const startFrom = product?.warrantyStartFrom || 'purchase';
    const provider = product?.warrantyProvider || 'store';
    const brand = provider === 'manufacturer' ? brandMap.get(String(product.brandId)) : null;
    const center = brand?.warrantyCenter || {};
    const units = Math.min(Number(item.quantity) || 1, MAX_UNITS_PER_LINE);
    for (let u = 0; u < units; u++) {
      docs.push({
        code: newCode(),
        orderId: order._id,
        orderCode: order.orderCode,
        unitIndex: u,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.name,
        variantLabel: item.variantLabel || '',
        unitPrice: item.unitPrice,
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
        activationDeadline: startFrom === 'activation' ? new Date(new Date(bought).getTime() + ACTIVATION_WINDOW_DAYS * 86400000) : undefined,
        baseMonths: months
      });
    }
  }
  if (!docs.length) return [];
  return WarrantyCard.insertMany(docs, { session });
}

// Đơn đã giao bị trả hàng -> sổ bảo hành hết hiệu lực
async function voidCardsForOrder(orderId, reason, session = null) {
  await WarrantyCard.updateMany({ orderId, status: 'active' }, { $set: { status: 'void', voidReason: reason } }, { session });
}

// Đơn giao TRƯỚC khi có tính năng sổ bảo hành: tạo bù khi khách / nhân viên tra cứu
async function ensureCardsForOrders(orders) {
  for (const order of orders) {
    if (order.status === 'delivered') {
      try {
        await createCardsForOrder(order);
      } catch (err) {
        if (err.code !== 11000) throw err; // trùng mã (cực hiếm) / 2 request cùng tạo -> bỏ qua
      }
    }
  }
}

module.exports = { createCardsForOrder, voidCardsForOrder, ensureCardsForOrders, deliveredDate, ACTIVATION_WINDOW_DAYS };
