// Dữ liệu mẫu GIAO HỎA TỐC: mỗi chi nhánh 1 khung đang mở (tới 21:00 hôm nay), 1 khung sắp mở (sáng mai), 1 khung đã kết thúc
// (hôm qua) với các sản phẩm bán chạy CÒN HÀNG tại chi nhánh. Chi nhánh chưa có tọa độ thì gán tọa độ trung tâm quận
// (chỉ khi đang trống). CHỈ THÊM, không xóa. Chạy lại: khung đã có cùng tên + cùng ngày thì bỏ qua.
//   node seed/generateExpressWindows.js
//   MONGO_URI=<atlas> node seed/generateExpressWindows.js --allow-remote
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveMongoUri } = require('../config/db');
const Store = require('../models/Store');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const ExpressWindow = require('../models/ExpressWindow');
const Admin = require('../models/Admin');

// Tọa độ trung tâm quận để gán cho chi nhánh chưa có tọa độ (khớp theo tên)
const KNOWN = [
  [/quận 1|q1/i, 10.7769, 106.7009], [/cầu giấy/i, 21.0362, 105.7906], [/hải châu|đà nẵng/i, 16.0678, 108.2208],
  [/cà mau/i, 9.1769, 105.1524], [/thủ đức/i, 10.8494, 106.7537], [/hoàn kiếm/i, 21.0285, 105.8542], [/cần thơ|ninh kiều/i, 10.0341, 105.7880]
];
// Giờ Việt Nam: hôm nay + offsetDays, lúc h:m
const vnAt = (offsetDays, h, m = 0) => {
  const vn = new Date(Date.now() + 7 * 3600000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + offsetDays, h, m) - 7 * 3600000);
};

async function main() {
  const uri = resolveMongoUri();
  const remote = !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
  if (remote && !process.argv.includes('--allow-remote')) throw new Error('Đây là database online. Thêm --allow-remote nếu thật sự muốn ghi dữ liệu mẫu lên đó.');
  if (remote) console.log('[!] Đang ghi lên database ONLINE:', uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@').replace(/\?.*$/, ''));
  await mongoose.connect(uri);

  const now = new Date();
  const stores = await Store.find({ isActive: { $ne: false } }).lean();
  let made = 0;
  for (const store of stores) {
    // 1. Tọa độ chi nhánh
    let { lat, lng } = store;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const k = KNOWN.find(([re]) => re.test(`${store.name} ${store.address || ''} ${store.city || ''}`));
      if (!k) { console.log(`- ${store.name}: chưa có tọa độ và không đoán được -> bỏ qua (cập nhật trong Quản lý chi nhánh)`); continue; }
      [, lat, lng] = k;
      await Store.updateOne({ _id: store._id, lat: { $in: [null] } }, { $set: { lat, lng } });
      console.log(`- ${store.name}: gán tọa độ ${lat}, ${lng}`);
    }
    // 2. Sản phẩm bán chạy còn hàng tại chi nhánh
    const inv = await StoreInventory.find({ storeId: store._id, stock: { $gte: 3 } }).select('productId').lean();
    const ids = [...new Set(inv.map((i) => String(i.productId)))];
    const top = await Product.find({ _id: { $in: ids }, isActive: true }).sort({ soldCount: -1 }).select('_id title').limit(30).lean();
    if (top.length < 4) { console.log(`- ${store.name}: quá ít sản phẩm còn hàng -> bỏ qua`); continue; }
    const manager = await Admin.findOne({ $or: [{ storeId: store._id }, { managedStoreIds: store._id }], title: /quản lý/i }).select('_id name').lean();
    const by = { createdBy: manager?._id, createdByName: manager?.name || 'Dữ liệu mẫu' };
    const pick = (from, n) => top.slice(from, from + n).map((p) => p._id);

    const endToday = vnAt(0, 21);
    const plans = [
      // Đang mở: từ 30 phút trước tới 21:00 (nếu đã quá 20:00 thì kéo dài 4 giờ để còn thử được)
      { title: 'Hỏa tốc 2 giờ - Điện thoại & phụ kiện bán chạy', startAt: new Date(now.getTime() - 30 * 60000), endAt: endToday - now < 3600000 ? new Date(now.getTime() + 4 * 3600000) : endToday,
        radiusKm: 10, fee: 30000, slaMinutes: 120, maxOrders: 30, productIds: pick(0, 15), note: 'Ưu tiên khách nội thành, gọi trước khi giao' },
      { title: 'Hỏa tốc 90 phút - Laptop & máy tính bảng', startAt: new Date(now.getTime() - 10 * 60000), endAt: new Date(Math.min(endToday.getTime(), now.getTime() + 3 * 3600000) > now.getTime() + 3600000 ? Math.min(endToday.getTime(), now.getTime() + 3 * 3600000) : now.getTime() + 3 * 3600000),
        radiusKm: 6, fee: 50000, slaMinutes: 90, maxOrders: 10, productIds: pick(15, 15).length ? pick(15, 15) : pick(0, 8), note: 'Hàng giá trị cao: kiểm tra CCCD khi giao' },
      // Sắp mở: sáng mai 9:00 - 12:00
      { title: 'Hỏa tốc buổi sáng', startAt: vnAt(1, 9), endAt: vnAt(1, 12), radiusKm: 15, fee: 25000, slaMinutes: 120, maxOrders: 20, productIds: pick(0, 20) },
      // Đã kết thúc: hôm qua 14:00 - 20:00
      { title: 'Hỏa tốc cuối ngày (hôm qua)', startAt: vnAt(-1, 14), endAt: vnAt(-1, 20), radiusKm: 10, fee: 30000, slaMinutes: 120, maxOrders: 25, productIds: pick(0, 12) }
    ];
    for (const p of plans) {
      const dayStart = vnAt(0, 0); const sameDay = { $gte: new Date(p.startAt.getTime() - 86400000), $lte: new Date(p.startAt.getTime() + 86400000) };
      if (await ExpressWindow.exists({ storeId: store._id, title: p.title, startAt: sameDay })) continue;
      void dayStart;
      await ExpressWindow.create({ storeId: store._id, ...p, ...by });
      made += 1;
    }
    console.log(`- ${store.name}: khung hỏa tốc với ${top.length} sản phẩm bán chạy còn hàng`);
  }
  console.log(`Đã tạo ${made} khung giờ hỏa tốc.`);
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error(e.message); await mongoose.disconnect(); process.exit(1); });
