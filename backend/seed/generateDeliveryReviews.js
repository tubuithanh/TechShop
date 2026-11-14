// Dữ liệu mẫu: đơn GIAO TẬN NƠI đã giao thành công (do nhân viên giao hàng của chi nhánh hoặc đơn vị vận chuyển GHN giả lập)
// + đánh giá nhiều tiêu chí của khách cho các đơn đó. Dùng để xem thống kê "Đánh giá giao hàng" trong Admin -> Đánh giá.
// CHỈ THÊM dữ liệu (không xóa / sửa dữ liệu cũ), chỉ chạy trên MongoDB local.
//   node seed/generateDeliveryReviews.js            (mặc định 200 đơn)
//   node seed/generateDeliveryReviews.js --orders=400 --days=60
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveMongoUri } = require('../config/db');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const PermissionGroup = require('../models/PermissionGroup');
const { TAGS } = require('../utils/reviewCriteria');

const arg = (name, def) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : def; };
const ORDERS = Math.max(1, Math.min(2000, Number(arg('orders', 200)) || 200));
const CARRIER_RATE = 0.25;
const DAYS = Math.max(4, Math.min(720, Number(arg('days', 360)) || 360)); // --days=60: chỉ tạo đơn trong 60 ngày gần đây // 25% đơn gửi qua GHN (giả lập)

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n) => Math.max(1, Math.min(5, Math.round(n)));
const chance = (p) => Math.random() < p;

const COMMENTS = {
  good: ['Giao nhanh hơn dự kiến, shipper gọi trước rất lịch sự.', 'Hàng đóng gói kỹ, máy nguyên seal. Rất hài lòng!', 'Anh giao hàng thân thiện, hỗ trợ kiểm tra máy tận nơi.', 'Đặt sáng chiều đã có hàng, quá tuyệt.', 'Sản phẩm chính hãng, giao đúng hẹn, sẽ ủng hộ tiếp.'],
  mid: ['Hàng ổn nhưng giao trễ một ngày so với hẹn.', 'Sản phẩm tốt, shipper hơi vội không cho kiểm hàng kỹ.', 'Máy dùng ổn, hộp ngoài hơi móp.', 'Giao hàng bình thường, không có gì đặc biệt.'],
  bad: ['Giao chậm 3 ngày, gọi mãi mới thấy shipper bắt máy.', 'Hộp bị móp méo, đóng gói quá sơ sài.', 'Shipper thái độ không tốt, giao không báo trước.', 'Hẹn giao buổi sáng nhưng tối mới tới, rất mất thời gian.']
};

async function main() {
  const uri = resolveMongoUri();
  // Mặc định chỉ chạy local; muốn ghi lên Atlas phải thêm --allow-remote (chỉ THÊM dữ liệu, không xóa)
  const remote = !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
  if (remote && !process.argv.includes('--allow-remote')) {
    throw new Error('Đây là database online. Thêm --allow-remote nếu thật sự muốn ghi dữ liệu mẫu lên đó.');
  }
  if (remote) console.log('[!] Đang ghi lên database ONLINE:', uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@').replace(/\?.*$/, ''));
  await mongoose.connect(uri);

  // Nhân viên giao hàng = có quyền deliveries.perform (qua nhóm quyền) hoặc chức danh "giao hàng"
  const shipGroups = await PermissionGroup.find({ permissions: 'deliveries.perform' }).select('_id').lean();
  const shippers = await Admin.find({
    role: 'staff', isActive: { $ne: false }, storeId: { $ne: null },
    $or: [{ title: /giao hàng/i }, { groupIds: { $in: shipGroups.map((g) => g._id) } }]
  }).select('_id name storeId').lean();
  if (!shippers.length) throw new Error('Chưa có nhân viên giao hàng. Chạy trước: node seed/generateStaff.js --staff-only');

  const stores = await Store.find({ _id: { $in: [...new Set(shippers.map((s) => String(s.storeId)))] }, isActive: true }).lean();
  const storeById = new Map(stores.map((s) => [String(s._id), s]));
  const shippersByStore = new Map();
  for (const s of shippers) if (storeById.has(String(s.storeId))) shippersByStore.set(String(s.storeId), [...(shippersByStore.get(String(s.storeId)) || []), s]);
  const customers = await User.find({}).select('_id displayName email phoneNumber').limit(2000).lean();
  const products = await Product.find({ isActive: true }).select('_id title featuredImage price variants').limit(500).lean();
  if (!customers.length || !products.length) throw new Error('Cần có khách hàng và sản phẩm (chạy generateCustomers / generateProducts trước)');

  // Mỗi nhân viên có "tay nghề" riêng để bảng xếp hạng có người cao, người thấp
  const skill = new Map(shippers.map((s) => [String(s._id), pick([4.8, 4.6, 4.4, 4.1, 3.6, 3.0, 2.4])]));
  const CARRIER_SKILL = 4.0;

  const reviewed = new Set((await Review.find({}).select('reviewKey').lean()).map((r) => r.reviewKey).filter(Boolean));
  const storeIds = [...shippersByStore.keys()];
  let orderCount = 0; let reviewCount = 0; let carrierCount = 0;
  const touchedProducts = new Set();

  for (let i = 0; i < ORDERS; i++) {
    const storeId = pick(storeIds);
    const store = storeById.get(storeId);
    const customer = pick(customers);
    const viaCarrier = chance(CARRIER_RATE);
    const shipper = viaCarrier ? null : pick(shippersByStore.get(storeId));

    const lines = [...new Set(Array.from({ length: chance(0.25) ? 2 : 1 }, () => pick(products)))].map((p) => {
      const v = p.variants?.length ? pick(p.variants) : null;
      const unitPrice = v?.price || p.price || 1000000;
      return { productId: p._id, variantId: v?._id, variantLabel: [v?.color, v?.storage].filter(Boolean).join(' - '), name: p.title, image: p.featuredImage, quantity: 1, unitPrice };
    });
    const itemsTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const shippingFee = itemsTotal >= 5000000 ? 0 : 30000;

    // Thời gian: trong 12 tháng gần đây; giao sau 1-4 ngày
    const createdAt = new Date(Date.now() - rand(2, DAYS) * 86400000 - rand(0, 86400000));
    const confirmedAt = new Date(createdAt.getTime() + rand(1, 6) * 3600000);
    const shippedAt = new Date(confirmedAt.getTime() + rand(2, 24) * 3600000);
    // Không để mốc thời gian vượt quá hiện tại (đơn đã giao xong thì phải giao trong quá khứ)
    const deliveredAt = new Date(Math.min(shippedAt.getTime() + rand(8, 72) * 3600000, Date.now() - rand(5, 120) * 60000));
    const code = `SEEDGH${Date.now().toString().slice(-6)}${String(i).padStart(4, '0')}`;
    const actor = shipper ? { changedBy: shipper._id, actorName: shipper.name, actorRole: 'staff' } : { actorName: 'GHN', actorRole: 'carrier' };

    const order = await Order.create({
      orderCode: code, userId: customer._id, storeId, source: 'online', status: 'delivered',
      deliveryMethod: 'home_delivery', paymentMode: 'cod', paymentStatus: 'paid',
      items: lines, itemsTotal, shippingFee, grandTotal: itemsTotal + shippingFee,
      deliveryAddress: { fullName: customer.displayName || 'Khách hàng', phone: customer.phoneNumber || `09${rand(10000000, 99999999)}`, addressLine1: `${rand(1, 300)} Đường số ${rand(1, 30)}`, city: store.city || '' },
      shipperId: shipper?._id || null,
      assignedAt: shipper ? confirmedAt : undefined,
      assignedByName: shipper ? 'Dữ liệu mẫu' : undefined,
      assignmentLog: [shipper
        ? { action: 'assign', method: 'internal', shipperId: shipper._id, shipperName: shipper.name, byName: 'Dữ liệu mẫu', at: confirmedAt }
        : { action: 'carrier', method: 'simulation', carrierCode: code, byName: 'Dữ liệu mẫu', at: confirmedAt }],
      ...(viaCarrier ? { shipment: { provider: 'GHN', environment: 'simulation', phase: 'active', code, clientCode: code, status: 'delivered', totalFee: shippingFee || 30000, codAmount: itemsTotal + shippingFee, createdAt: confirmedAt, updatedAt: deliveredAt, events: [{ status: 'ready_to_pick', at: confirmedAt }, { status: 'delivering', at: shippedAt }, { status: 'delivered', at: deliveredAt }] } } : {}),
      statusHistory: [
        { status: 'pending', note: 'Đặt hàng', changedAt: createdAt, eventType: 'status', storeName: store.name },
        { status: 'confirmed', note: 'Xác nhận đơn', changedAt: confirmedAt, eventType: 'status', storeName: store.name },
        { status: 'shipping', note: shipper ? `Giao cho ${shipper.name}` : 'Bàn giao GHN', changedAt: shippedAt, eventType: 'status', storeName: store.name, ...actor },
        { status: 'delivered', note: 'Giao hàng thành công', changedAt: deliveredAt, eventType: 'status', storeName: store.name, ...actor }
      ]
    });
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt, updatedAt: deliveredAt } }); // createdAt là immutable trong Mongoose
    orderCount += 1; if (viaCarrier) carrierCount += 1;

    // ~80% khách đánh giá sau khi nhận hàng
    if (!chance(0.8)) continue;
    const base = shipper ? skill.get(String(shipper._id)) : CARRIER_SKILL;
    for (const line of lines) {
      const key = `${customer._id}:${line.productId}`;
      if (reviewed.has(key)) continue; // mỗi khách chỉ đánh giá 1 lần / sản phẩm
      reviewed.add(key);
      const delivery = clamp(base + (Math.random() - 0.5) * 1.6);
      const service = clamp(base + (Math.random() - 0.5) * 1.4);
      const packaging = clamp(base + 0.3 + (Math.random() - 0.5) * 1.4);
      const quality = clamp(4.5 + (Math.random() - 0.6) * 1.6);
      const accuracy = clamp(4.6 + (Math.random() - 0.6) * 1.2);
      const rating = clamp((quality * 2 + accuracy + delivery + service + packaging) / 6 + (Math.random() - 0.5) * 0.6);
      const tags = new Set();
      if (delivery >= 4 && chance(0.6)) tags.add('Giao hàng nhanh');
      if (packaging >= 4 && chance(0.4)) tags.add('Đóng gói cẩn thận');
      if (service >= 5 && chance(0.4)) tags.add('Nhân viên nhiệt tình');
      if (quality >= 5 && chance(0.4)) tags.add(pick(['Chất lượng tuyệt vời', 'Đáng tiền', 'Hàng chính hãng', 'Hiệu năng mượt']));
      if (accuracy >= 5 && chance(0.3)) tags.add('Đúng mô tả');
      if (delivery <= 2 && chance(0.85)) tags.add('Giao hàng chậm');
      if (packaging <= 2 && chance(0.7)) tags.add('Đóng gói sơ sài');
      if (quality <= 2 && chance(0.5)) tags.add('Có lỗi / trầy xước');
      const tone = rating >= 4 ? 'good' : rating === 3 ? 'mid' : 'bad';
      const at = new Date(Math.min(deliveredAt.getTime() + rand(2, 120) * 3600000, Date.now() - 60000));
      const fullCriteria = chance(0.85); // một số khách chỉ chấm sao chung
      const r = await Review.create({
        userId: customer._id, productId: line.productId, orderId: order._id, reviewKey: key,
        displayName: customer.displayName || 'Khách hàng', rating,
        message: chance(0.85) ? pick(COMMENTS[tone]) : '',
        criteria: fullCriteria ? { quality, accuracy, packaging, delivery, service } : undefined,
        tags: [...tags].filter((t) => TAGS.positive.includes(t) || TAGS.negative.includes(t)).slice(0, 6),
        isAnonymous: chance(0.15), variantLabel: line.variantLabel, isVerifiedPurchase: true,
        helpfulCount: chance(0.3) ? rand(1, 12) : 0,
        reply: chance(tone === 'bad' ? 0.5 : 0.25) ? { content: tone === 'bad' ? 'TechShop xin lỗi vì trải nghiệm chưa tốt, bộ phận CSKH sẽ liên hệ bạn ngay.' : 'Cảm ơn bạn đã tin tưởng TechShop!', repliedAt: new Date(at.getTime() + 86400000) } : undefined
      });
      await Review.collection.updateOne({ _id: r._id }, { $set: { createdAt: at } });
      touchedProducts.add(String(line.productId));
      reviewCount += 1;
    }
  }

  // Cập nhật điểm trung bình hiển thị trên sản phẩm
  for (const id of touchedProducts) {
    const [agg] = await Review.aggregate([{ $match: { productId: new mongoose.Types.ObjectId(id) } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    await Product.updateOne({ _id: id }, { $set: { ratingAverage: Math.round((agg?.avg || 0) * 10) / 10, ratingCount: agg?.n || 0 } });
  }

  console.log(`Đã tạo ${orderCount} đơn giao tận nơi đã giao (${orderCount - carrierCount} do nhân viên, ${carrierCount} qua GHN giả lập) và ${reviewCount} đánh giá.`);
  console.log('Tay nghề giả định của nhân viên giao hàng (điểm giao hàng trung bình mong đợi):');
  for (const s of shippers.filter((x) => shippersByStore.has(String(x.storeId)))) console.log(`  ${skill.get(String(s._id)).toFixed(1)}★  ${s.name} - ${storeById.get(String(s.storeId))?.name}`);
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error(e.message); await mongoose.disconnect(); process.exit(1); });
