/**
 * Migration một lần: chuyển dữ liệu từ mô hình cũ (mỗi sản phẩm 1 giá, tồn kho theo sản phẩm) sang mô
 * hình phiên bản (Product.variants, tồn kho theo phiên bản). An toàn khi chạy lại nhiều lần.
 *   1. Xóa index unique cũ { storeId, productId } của store_inventories (chặn 2 phiên bản/cùng cửa hàng)
 *   2. Sản phẩm chưa có phiên bản -> tạo 1 phiên bản mặc định từ giá hiện tại (nhận màu từ tên nếu có)
 *   3. Gán variantId cho tồn kho, dòng hàng trong đơn hàng và giỏ hàng cũ = phiên bản mặc định đó
 *   4. (--demo-colors) Thêm 1-2 phiên bản màu khác cùng giá + tồn kho ngẫu nhiên cho sản phẩm chỉ có 1
 *      phiên bản - CHỈ dùng cho dữ liệu mẫu, để trang chi tiết có ô chọn màu khi demo.
 *
 * Chạy:        node seed/migrateVariants.js [--demo-colors]
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/migrateVariants.js [--demo-colors]
 */
require('dotenv').config();
const mongoose = require('mongoose');

const COLORS = [
  { color: 'Đen', colorHex: '#1f2937' },
  { color: 'Trắng', colorHex: '#f3f4f6' },
  { color: 'Xanh Dương', colorHex: '#2563eb' },
  { color: 'Xám', colorHex: '#6b7280' },
  { color: 'Bạc', colorHex: '#cbd5e1' },
  { color: 'Vàng', colorHex: '#eab308' },
  { color: 'Tím', colorHex: '#8b5cf6' },
  { color: 'Hồng', colorHex: '#ec4899' }
];

function detectColor(title) {
  const lower = title.toLowerCase();
  return COLORS.find((c) => lower.endsWith(' ' + c.color.toLowerCase())) || { color: 'Tiêu chuẩn', colorHex: '#9ca3af' };
}

const label = (v) => (v.storage ? `${v.color} - ${v.storage}` : v.color);
const effective = (v) => (v.salePrice != null ? v.salePrice : v.price);

async function run() {
  const demoColors = process.argv.includes('--demo-colors');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log('Đã kết nối MongoDB:', db.databaseName);

  // 1. Index cũ
  const invCol = db.collection('store_inventories');
  const indexes = await invCol.indexes();
  if (indexes.some((i) => i.name === 'storeId_1_productId_1')) {
    await invCol.dropIndex('storeId_1_productId_1');
    console.log('1. Đã xóa index cũ storeId_1_productId_1');
  } else console.log('1. Không còn index cũ');

  // 2. Phiên bản mặc định
  const products = await db.collection('products').find({}).toArray();
  const defaultVariant = new Map(); // productId -> phiên bản đầu tiên
  let created = 0;
  for (const p of products) {
    if (Array.isArray(p.variants) && p.variants.length) {
      defaultVariant.set(String(p._id), p.variants[0]);
      continue;
    }
    const { color, colorHex } = detectColor(p.title);
    const v = {
      _id: new mongoose.Types.ObjectId(),
      color,
      colorHex,
      storage: '',
      price: p.price,
      ...(p.salePrice != null ? { salePrice: p.salePrice } : {}),
      image: '',
      isActive: true
    };
    v.effectivePrice = effective(v);
    await db.collection('products').updateOne({ _id: p._id }, { $set: { variants: [v], effectivePrice: v.effectivePrice } });
    defaultVariant.set(String(p._id), v);
    created++;
  }
  console.log(`2. Đã tạo phiên bản mặc định cho ${created}/${products.length} sản phẩm`);

  // 3. Gán variantId cho dữ liệu cũ
  let invFixed = 0;
  for (const [pid, v] of defaultVariant) {
    const r = await invCol.updateMany(
      { productId: new mongoose.Types.ObjectId(pid), variantId: { $exists: false } },
      { $set: { variantId: v._id } }
    );
    invFixed += r.modifiedCount;
  }
  console.log(`3a. Đã gán phiên bản cho ${invFixed} bản ghi tồn kho`);

  for (const colName of ['orders', 'carts']) {
    const col = db.collection(colName);
    const docs = await col.find({ 'items.variantId': { $exists: false }, 'items.0': { $exists: true } }).toArray();
    let fixed = 0;
    for (const doc of docs) {
      const items = doc.items.map((item) => {
        if (item.variantId) return item;
        const v = defaultVariant.get(String(item.productId));
        return v ? { ...item, variantId: v._id, variantLabel: label(v) } : item;
      });
      await col.updateOne({ _id: doc._id }, { $set: { items } });
      fixed++;
    }
    console.log(`3${colName === 'orders' ? 'b' : 'c'}. Đã gán phiên bản cho dòng hàng của ${fixed} ${colName === 'orders' ? 'đơn hàng' : 'giỏ hàng'}`);
  }

  // 4. Màu mẫu cho demo
  if (demoColors) {
    const stores = await db.collection('stores').find({}, { projection: { _id: 1 } }).toArray();
    const fresh = await db.collection('products').find({ 'variants.1': { $exists: false } }).toArray();
    let added = 0;
    for (const p of fresh) {
      const base = p.variants[0];
      const extra = COLORS.filter((c) => c.color !== base.color)
        .sort(() => Math.random() - 0.5)
        .slice(0, 1 + Math.floor(Math.random() * 2))
        .map((c, i) => ({
          _id: new mongoose.Types.ObjectId(),
          ...c,
          storage: base.storage || '',
          price: base.price,
          ...(base.salePrice != null ? { salePrice: base.salePrice } : {}),
          effectivePrice: base.effectivePrice ?? effective(base),
          image: (p.imageURLs || [])[(i + 1) % Math.max(1, (p.imageURLs || []).length)] || '',
          isActive: true
        }));
      await db.collection('products').updateOne({ _id: p._id }, { $push: { variants: { $each: extra } } });
      await invCol.insertMany(
        extra.flatMap((v) =>
          stores.map((s) => ({
            storeId: s._id,
            productId: p._id,
            variantId: v._id,
            stock: 5 + Math.floor(Math.random() * 25),
            lowStockThreshold: 5,
            lastUpdated: new Date()
          }))
        )
      );
      added += extra.length;
    }
    console.log(`4. Đã thêm ${added} phiên bản màu mẫu cho ${fresh.length} sản phẩm`);
  }

  // Tạo index mới (unique theo phiên bản)
  await invCol.createIndex({ storeId: 1, productId: 1, variantId: 1 }, { unique: true });
  console.log('Hoàn tất. Index mới { storeId, productId, variantId } đã sẵn sàng.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy migrateVariants:', err);
  process.exit(1);
});
