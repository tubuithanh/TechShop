// Dữ liệu mẫu cho BÁO CÁO NHÂN VIÊN (Admin -> Báo cáo nhân viên / Báo cáo của tôi):
//  1. Tuyến báo cáo: nhân viên -> quản lý chi nhánh -> admin (chỉ gán cho người CHƯA có quản lý trực tiếp)
//  2. Đơn bán tại quầy của nhân viên bán hàng: lấp các tháng còn mỏng trong 12 tháng gần nhất (kể cả tháng này),
//     có xu hướng tăng dần + mùa cao điểm, ~30% đơn có khách đánh giá
//  3. Phiếu bảo hành / sửa chữa cho kỹ thuật viên: tiếp nhận -> kiểm tra -> sửa -> hoàn tất, thời gian xử lý, đánh giá của khách
// CHỈ THÊM / GÁN dữ liệu, không xóa. Chạy lại nhiều lần an toàn (chỉ lấp tháng còn thiếu).
//   node seed/generateStaffReportData.js
//   MONGO_URI=<atlas> node seed/generateStaffReportData.js --allow-remote
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveMongoUri } = require('../config/db');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Warranty = require('../models/Warranty');

const DAY = 86400000;
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const clamp = (n) => Math.max(1, Math.min(5, Math.round(n)));
const kindOf = (t = '') => (/quản lý/i.test(t) ? 'manager' : /giao hàng/i.test(t) ? 'delivery' : /bảo hành|kỹ thuật/i.test(t) ? 'warranty' : /bán hàng|thu ngân|tư vấn/i.test(t) ? 'sales' : 'other');
// Mùa mua sắm: cao điểm tháng 1-2 (Tết), 9 (iPhone mới), 11-12 (Black Friday, cuối năm)
const SEASON = { 1: 1.35, 2: 1.2, 3: 0.85, 4: 0.9, 5: 0.95, 6: 1, 7: 0.9, 8: 0.95, 9: 1.25, 10: 1.05, 11: 1.3, 12: 1.4 };
const vnMonthStart = (y, m) => new Date(Date.UTC(y, m, 1) - 7 * 3600000);

const ISSUES = [
  ['Máy sập nguồn liên tục, không lên màn hình', 'loi_nha_san_xuat'], ['Pin tụt nhanh, nóng máy khi sạc', 'loi_nha_san_xuat'],
  ['Loa ngoài rè, mic thu âm nhỏ', 'loi_nha_san_xuat'], ['Màn hình xuất hiện sọc xanh', 'loi_nha_san_xuat'],
  ['Không nhận sạc, cổng sạc lỏng', 'loi_nha_san_xuat'], ['Camera sau bị mờ, không lấy nét', 'loi_nha_san_xuat'],
  ['Bàn phím laptop liệt vài phím', 'loi_nha_san_xuat'], ['Wifi chập chờn, mất sóng', 'loi_nha_san_xuat'],
  ['Rơi vỡ màn hình, cần thay (dịch vụ)', 'khac'], ['Vào nước, máy không khởi động (dịch vụ)', 'khac']
];
const FEEDBACK = {
  5: ['Kỹ thuật viên tư vấn kỹ, sửa nhanh hơn hẹn. Rất hài lòng!', 'Máy về như mới, cảm ơn anh kỹ thuật nhiệt tình.', 'Xử lý chuyên nghiệp, có báo tình trạng từng bước.'],
  4: ['Sửa ổn, chỉ hơi lâu một chút.', 'Nhân viên thân thiện, máy đã hoạt động bình thường.'],
  3: ['Sửa được nhưng phải chờ linh kiện khá lâu.', 'Tạm được, cần báo tiến độ thường xuyên hơn.'],
  2: ['Hẹn 3 ngày mà gần 2 tuần mới xong.', 'Máy sửa xong vẫn còn lỗi nhẹ, phải mang lại.'],
  1: ['Rất chậm, gọi hỏi nhiều lần không ai trả lời.']
};
const POS_COMMENTS = {
  good: ['Bạn tư vấn rất có tâm, giải thích kỹ cấu hình.', 'Nhân viên nhiệt tình, hỗ trợ cài đặt máy tận tình.', 'Mua tại cửa hàng nhanh gọn, được dán cường lực miễn phí.'],
  mid: ['Tư vấn ổn nhưng chờ thanh toán hơi lâu.', 'Nhân viên được, cửa hàng đông nên phục vụ hơi chậm.'],
  bad: ['Nhân viên tư vấn chưa nắm rõ sản phẩm.', 'Chờ lâu, thái độ chưa thân thiện.']
};

async function main() {
  const uri = resolveMongoUri();
  const remote = !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
  if (remote && !process.argv.includes('--allow-remote')) throw new Error('Đây là database online. Thêm --allow-remote nếu thật sự muốn ghi dữ liệu mẫu lên đó.');
  if (remote) console.log('[!] Đang ghi lên database ONLINE:', uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@').replace(/\?.*$/, ''));
  await mongoose.connect(uri);

  const now = new Date();
  const staff = await Admin.find({ role: 'staff', isActive: { $ne: false } }).select('name title storeId managedStoreIds managerId createdAt').lean();
  const admin = await Admin.findOne({ role: 'admin', isActive: { $ne: false } }).sort({ createdAt: 1 }).select('_id name').lean();
  const stores = await Store.find({ isActive: true }).select('name').lean();
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));

  // ---------- 1. Tuyến báo cáo ----------
  const managerOf = new Map(); // storeId -> quản lý
  for (const s of staff.filter((x) => kindOf(x.title) === 'manager')) {
    for (const id of [s.storeId, ...(s.managedStoreIds || [])].filter(Boolean)) if (!managerOf.has(String(id))) managerOf.set(String(id), s);
  }
  let linked = 0;
  for (const s of staff) {
    if (s.managerId) continue;
    const boss = kindOf(s.title) === 'manager' ? admin : managerOf.get(String(s.storeId));
    if (!boss || String(boss._id) === String(s._id)) continue;
    await Admin.updateOne({ _id: s._id, managerId: null }, { $set: { managerId: boss._id } });
    s.managerId = boss._id;
    linked += 1;
  }
  console.log(`1. Tuyến báo cáo: gán quản lý trực tiếp cho ${linked} người (${managerOf.size} chi nhánh có quản lý, quản lý báo cáo cho ${admin?.name || '—'})`);

  const customers = await User.find({}).select('_id displayName phoneNumber').limit(3000).lean();
  const products = await Product.find({ isActive: true, 'variants.0': { $exists: true } }).select('title variants featuredImage price').lean();
  if (!customers.length || !products.length) throw new Error('Cần có khách hàng và sản phẩm trước');
  const months = Array.from({ length: 12 }, (_, i) => {
    const vn = new Date(now.getTime() + 7 * 3600000);
    const from = vnMonthStart(vn.getUTCFullYear(), vn.getUTCMonth() - (11 - i));
    const to = vnMonthStart(vn.getUTCFullYear(), vn.getUTCMonth() - (11 - i) + 1);
    return { from, to: to > now ? now : to, month: new Date(from.getTime() + 7 * 3600000).getUTCMonth() + 1, idx: i, partial: to > now };
  });
  const randomAt = (m, joined) => {
    const start = Math.max(m.from.getTime(), joined ? new Date(joined).getTime() : 0);
    if (start >= m.to.getTime()) return null;
    const d = new Date(start + Math.random() * (m.to.getTime() - start));
    const vnHour = (d.getUTCHours() + 7) % 24;
    if (vnHour < 8 || vnHour > 21) d.setTime(d.getTime() + (12 - vnHour) * 3600000); // giờ mở cửa
    return d > now ? new Date(now.getTime() - rand(1, 5) * 3600000) : d;
  };

  // ---------- 2. Bán tại quầy ----------
  const sellers = staff.filter((s) => kindOf(s.title) === 'sales' && s.storeId);
  let posMade = 0; let posReviews = 0;
  for (const s of sellers) {
    const skill = 0.6 + Math.random() * 0.9; // phong độ riêng từng người
    const rating = pick([4.8, 4.6, 4.4, 4.1, 3.7, 3.2]);
    for (const m of months) {
      const target = Math.round((6 + m.idx * 0.6) * SEASON[m.month] * skill * (m.partial ? Math.min(1, (now - m.from) / (30 * DAY)) : 1));
      const have = await Order.countDocuments({ source: 'pos', createdBy: s._id, createdAt: { $gte: m.from, $lt: m.to } });
      for (let k = have; k < target; k++) {
        const at = randomAt(m, s.createdAt > m.to ? null : null);
        if (!at) continue;
        const p = pick(products);
        const v = pick(p.variants.filter((x) => x.isActive !== false)) || p.variants[0];
        const qty = chance(0.85) ? 1 : 2;
        const price = v.effectivePrice ?? v.salePrice ?? v.price ?? p.price ?? 1000000;
        const total = price * qty;
        const customer = chance(0.6) ? pick(customers) : null;
        const order = await Order.create({
          orderCode: `RPTPOS${at.getTime().toString(36).toUpperCase()}${rand(100, 999)}`,
          source: 'pos', createdBy: s._id, createdByName: s.name, storeId: s.storeId, userId: customer?._id,
          deliveryMethod: 'store_pickup', paymentMode: chance(0.55) ? 'cash' : 'bank_transfer', status: 'delivered', paymentStatus: 'paid',
          deliveryAddress: { fullName: customer?.displayName || pick(['Khách lẻ', 'Anh Tuấn', 'Chị Hoa', 'Anh Dũng', 'Chị Vy']), phone: customer?.phoneNumber || `09${rand(10000000, 99999999)}` },
          items: [{ productId: p._id, variantId: v._id, variantLabel: [v.color, v.storage].filter(Boolean).join(' - '), quantity: qty, unitPrice: price, name: p.title, image: v.image || p.featuredImage }],
          itemsTotal: total, shippingFee: 0, discountAmount: 0, grandTotal: total,
          handover: { recipientName: customer?.displayName || 'Khách', at, by: s._id },
          receipt: { amount: total, at, by: s._id, channel: 'counter' },
          statusHistory: [{ status: 'delivered', note: 'Bán tại quầy: đã thu tiền và bàn giao', changedBy: s._id, actorName: s.name, changedAt: at, storeName: storeName.get(String(s.storeId)) }]
        });
        await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: at } });
        posMade += 1;
        // Khách (có tài khoản) đánh giá sản phẩm mua tại quầy
        if (customer && chance(0.45)) {
          const key = `${customer._id}:${p._id}`;
          if (!(await Review.exists({ reviewKey: key }))) {
            const service = clamp(rating + (Math.random() - 0.5) * 1.5);
            const r = clamp((service + 4.6 * 2) / 3 + (Math.random() - 0.5) * 0.6);
            const tone = r >= 4 ? 'good' : r === 3 ? 'mid' : 'bad';
            const tags = [service >= 5 && chance(0.6) ? 'Nhân viên nhiệt tình' : null, r >= 5 && chance(0.4) ? 'Hàng chính hãng' : null, r >= 4 && chance(0.3) ? 'Đáng tiền' : null].filter(Boolean);
            const rv = await Review.create({
              userId: customer._id, productId: p._id, orderId: order._id, reviewKey: key, displayName: customer.displayName || 'Khách hàng',
              rating: r, message: chance(0.8) ? pick(POS_COMMENTS[tone]) : '', isVerifiedPurchase: true, variantLabel: order.items[0].variantLabel,
              criteria: { quality: clamp(4.6 + (Math.random() - 0.5)), accuracy: clamp(4.7 + (Math.random() - 0.5)), service }, tags
            });
            await Review.collection.updateOne({ _id: rv._id }, { $set: { createdAt: new Date(Math.min(at.getTime() + rand(1, 72) * 3600000, Date.now() - 60000)) } });
            posReviews += 1;
          }
        }
      }
    }
  }
  console.log(`2. Bán tại quầy: thêm ${posMade} đơn cho ${sellers.length} nhân viên bán hàng, ${posReviews} đánh giá của khách`);

  // ---------- 3. Bảo hành / sửa chữa ----------
  const techs = staff.filter((s) => kindOf(s.title) === 'warranty' && s.storeId);
  let tickets = 0;
  for (const t of techs) {
    const skill = pick([{ speed: 2, rating: 4.8 }, { speed: 3, rating: 4.5 }, { speed: 4, rating: 4.1 }, { speed: 6, rating: 3.6 }, { speed: 9, rating: 3 }]);
    const orders = await Order.find({ storeId: t.storeId, status: 'delivered' }).select('_id userId items deliveryAddress').sort({ createdAt: -1 }).limit(400).lean();
    if (!orders.length) continue;
    for (const m of months) {
      const target = Math.round(rand(7, 13) * SEASON[m.month] * (m.partial ? Math.min(1, (now - m.from) / (30 * DAY)) : 1));
      const have = await Warranty.countDocuments({ assignedTo: t._id, createdAt: { $gte: m.from, $lt: m.to } });
      for (let k = have; k < target; k++) {
        const at = randomAt(m);
        if (!at) continue;
        const o = pick(orders);
        const item = pick(o.items);
        const [issue, reason] = pick(ISSUES);
        const paid = reason === 'khac';
        const days = Math.max(0.3, skill.speed * (0.4 + Math.random() * 1.2) + (chance(0.15) ? rand(4, 10) : 0)); // đôi khi chờ linh kiện
        const doneAt = new Date(at.getTime() + days * DAY);
        const finished = doneAt < now;
        const waiting = !finished && chance(0.3);
        const status = finished ? (chance(0.7) ? 'returned' : 'done') : waiting ? 'waiting_parts' : pick(['received', 'checking', 'repairing']);
        const step = (st, frac, note) => ({ status: st, note, changedBy: t._id, changedAt: new Date(at.getTime() + frac * days * DAY) });
        const history = [step('received', 0, 'Tiếp nhận máy tại quầy'), step('checking', 0.1, 'Kiểm tra lỗi')];
        if (['repairing', 'waiting_parts', 'done', 'returned'].includes(status)) history.push(step('repairing', 0.3, 'Đang sửa chữa'));
        if (status === 'waiting_parts' || (finished && days > skill.speed * 1.5)) history.push(step('waiting_parts', 0.4, 'Chờ linh kiện từ hãng'));
        if (finished) history.push(step('done', 1, 'Sửa xong, đã kiểm tra lại'));
        if (status === 'returned') history.push(step('returned', 1.05, 'Đã trả máy cho khách'));
        const rated = finished && chance(0.7);
        const score = rated ? clamp(skill.rating + (Math.random() - 0.5) * 1.4 - (days > 7 ? 1 : 0)) : undefined;
        const w = await Warranty.create({
          ticketCode: `BHRPT${at.getTime().toString(36).toUpperCase()}${rand(10, 99)}`,
          userId: o.userId || null, customerName: o.deliveryAddress?.fullName, customerPhone: o.deliveryAddress?.phone,
          orderId: o._id, productId: item.productId, productName: item.name,
          issueDescription: issue, returnReason: reason, method: 'bring_to_store',
          coverage: { type: paid ? 'out_of_warranty' : 'in_warranty', checkedAt: at },
          status, statusHistory: history, assignedTo: t._id,
          cost: paid ? pick([350000, 650000, 1200000, 1850000, 2900000]) : 0,
          customerRating: score, customerFeedback: rated && chance(0.75) ? pick(FEEDBACK[score]) : undefined
        });
        await Warranty.collection.updateOne({ _id: w._id }, { $set: { createdAt: at, updatedAt: history[history.length - 1].changedAt } });
        tickets += 1;
      }
    }
  }
  console.log(`3. Bảo hành: thêm ${tickets} phiếu cho ${techs.length} kỹ thuật viên`);

  const noManager = stores.filter((s) => !managerOf.has(String(s._id))).map((s) => s.name);
  if (noManager.length) console.log(`   (Chi nhánh chưa có quản lý: ${noManager.join(', ')})`);
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error(e.message); await mongoose.disconnect(); process.exit(1); });
