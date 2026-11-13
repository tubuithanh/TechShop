// Dữ liệu mẫu: bộ VOUCHER đa dạng để thử gợi ý mã tại quầy (POS) và trang thanh toán:
//  giảm % có trần / giảm tiền cố định, đơn tối thiểu (để có gợi ý "mua thêm"), theo danh mục, theo sản phẩm,
//  theo chi nhánh, theo hạng thành viên, giới hạn lượt, sắp hết hạn, sắp diễn ra, đã hết hạn, đang tắt.
// CHỈ THÊM mã chưa có (trùng mã -> bỏ qua), không sửa / xóa mã cũ. Chạy lại an toàn.
//   node seed/generateVouchers.js
//   MONGO_URI=<atlas> node seed/generateVouchers.js --allow-remote
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveMongoUri } = require('../config/db');
const Voucher = require('../models/Voucher');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const { getLoyaltyConfig } = require('../utils/loyalty');

const DAY = 86400000;
const days = (n) => new Date(Date.now() + n * DAY);

async function main() {
  const uri = resolveMongoUri();
  const remote = !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
  if (remote && !process.argv.includes('--allow-remote')) throw new Error('Đây là database online. Thêm --allow-remote nếu thật sự muốn ghi dữ liệu mẫu lên đó.');
  if (remote) console.log('[!] Đang ghi lên database ONLINE:', uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@').replace(/\?.*$/, ''));
  await mongoose.connect(uri);

  const cats = await Category.find({}).select('name').lean();
  const cat = (re) => cats.filter((c) => re.test(c.name)).map((c) => c._id);
  const phones = cat(/điện thoại|phone/i); const laptops = cat(/laptop|máy tính xách tay/i);
  const tablets = cat(/máy tính bảng|tablet/i); const watches = cat(/đồng hồ|watch/i); const accessories = cat(/phụ kiện|tai nghe|sạc/i);
  const prod = async (re, n = 3) => (await Product.find({ title: re, isActive: true }).select('_id').limit(n).lean()).map((p) => p._id);
  const stores = await Store.find({ isActive: true }).select('name').lean();
  const store = (re) => stores.filter((s) => re.test(s.name)).map((s) => s._id);
  const tiers = (await getLoyaltyConfig()).tiers.map((t) => t.key); // dong, bac, vang, kim_cuong
  const upper = tiers.slice(1); const top = tiers.slice(-2);

  const pct = (code, value, max, extra) => ({ code, discountType: 'percent', discountValue: value, maxDiscountAmount: max, ...extra });
  const fix = (code, value, extra) => ({ code, discountType: 'fixed', discountValue: value, ...extra });
  const list = [
    // --- Toàn shop
    pct('CHAOBAN5', 5, 300000, { description: 'Chào bạn mới: giảm 5% tối đa 300K', perCustomerLimit: 1 }),
    fix('GIAM100K', 100000, { description: 'Giảm 100K cho đơn từ 2 triệu', minOrderValue: 2000000, perCustomerLimit: 3 }),
    fix('GIAM300K', 300000, { description: 'Giảm 300K cho đơn từ 10 triệu', minOrderValue: 10000000 }),
    fix('GIAM1TR', 1000000, { description: 'Giảm 1 triệu cho đơn từ 40 triệu', minOrderValue: 40000000 }),
    pct('SALE8', 8, 800000, { description: 'Giảm 8% tối đa 800K, đơn từ 15 triệu', minOrderValue: 15000000, perCustomerLimit: 2 }),
    pct('CUOITUAN3', 3, 500000, { description: 'Cuối tuần giảm 3% tối đa 500K', perCustomerLimit: 0 }),
    // --- Theo danh mục
    phones.length && pct('DIENTHOAI7', 7, 1500000, { description: 'Điện thoại giảm 7% tối đa 1,5 triệu', categoryIds: phones, minOrderValue: 5000000 }),
    laptops.length && fix('LAPTOP500', 500000, { description: 'Laptop giảm 500K, đơn từ 15 triệu', categoryIds: laptops, minOrderValue: 15000000 }),
    laptops.length && pct('SINHVIEN6', 6, 1200000, { description: 'Laptop cho sinh viên: giảm 6% tối đa 1,2 triệu', categoryIds: laptops, perCustomerLimit: 1 }),
    tablets.length && pct('TABLET10', 10, 1000000, { description: 'Máy tính bảng giảm 10% tối đa 1 triệu', categoryIds: tablets }),
    watches.length && fix('DONGHO400', 400000, { description: 'Đồng hồ thông minh giảm 400K', categoryIds: watches, minOrderValue: 5000000 }),
    accessories.length && pct('PHUKIEN15', 15, 200000, { description: 'Phụ kiện giảm 15% tối đa 200K', categoryIds: accessories, perCustomerLimit: 0 }),
    // --- Theo sản phẩm
    fix('IPHONE15GIAM', 700000, { description: 'iPhone 15 giảm thêm 700K', productIds: await prod(/iphone 15/i, 4) }),
    pct('MACBOOK5', 5, 2000000, { description: 'MacBook giảm 5% tối đa 2 triệu', productIds: await prod(/macbook/i, 6) }),
    fix('GALAXYTAB', 600000, { description: 'Galaxy Tab giảm 600K', productIds: await prod(/galaxy tab/i, 4) }),
    // --- Theo chi nhánh
    store(/quận 1/i).length && fix('Q1KHAITRUONG', 250000, { description: 'Chỉ tại TechShop Quận 1: giảm 250K đơn từ 3 triệu', storeIds: store(/quận 1/i), minOrderValue: 3000000 }),
    store(/cầu giấy/i).length && pct('CAUGIAY5', 5, 600000, { description: 'Chỉ tại TechShop Cầu Giấy: giảm 5% tối đa 600K', storeIds: store(/cầu giấy/i) }),
    store(/hải châu|đà nẵng/i).length && fix('DANANG200', 200000, { description: 'Chi nhánh Đà Nẵng giảm 200K', storeIds: store(/hải châu|đà nẵng/i), minOrderValue: 2000000 }),
    // --- Theo hạng thành viên
    upper.length && pct('THANHVIEN5', 5, 1000000, { description: 'Thành viên Bạc trở lên giảm 5% tối đa 1 triệu', tierKeys: upper, perCustomerLimit: 2 }),
    top.length && pct('VIP10', 10, 3000000, { description: 'Hạng Vàng / Kim cương giảm 10% tối đa 3 triệu', tierKeys: top, minOrderValue: 10000000 }),
    tiers.length && fix('KIMCUONG2TR', 2000000, { description: 'Riêng hạng Kim cương: giảm 2 triệu đơn từ 30 triệu', tierKeys: tiers.slice(-1), minOrderValue: 30000000 }),
    // --- Giới hạn lượt / thời gian
    fix('FLASH500', 500000, { description: 'Flash sale: 20 lượt đầu tiên giảm 500K', usageLimit: 20, usedCount: 14, minOrderValue: 5000000 }),
    pct('SAPHET12', 12, 1000000, { description: 'Sắp hết hạn: giảm 12% tối đa 1 triệu', endDate: days(2) }),
    fix('BLACKFRIDAY', 1500000, { description: 'Black Friday (sắp diễn ra) giảm 1,5 triệu', startDate: days(10), endDate: days(14), minOrderValue: 20000000 }),
    fix('TET2026', 800000, { description: 'Mã Tết đã hết hạn', startDate: days(-300), endDate: days(-250) }),
    pct('TAMNGUNG', 20, 2000000, { description: 'Mã đang tạm ngưng (admin tắt)', isActive: false }),
    fix('HETLUOT', 300000, { description: 'Mã đã dùng hết lượt', usageLimit: 50, usedCount: 50 })
  ].filter(Boolean).filter((v) => !('productIds' in v) || v.productIds.length);

  let made = 0; const skipped = [];
  for (const v of list) {
    if (await Voucher.exists({ code: v.code })) { skipped.push(v.code); continue; }
    await Voucher.create({ startDate: days(-3), endDate: days(60), minOrderValue: 0, usageLimit: 0, perCustomerLimit: 1, isActive: true, ...v });
    made += 1;
  }
  console.log(`Đã tạo ${made} voucher mới${skipped.length ? `, bỏ qua ${skipped.length} mã đã có (${skipped.join(', ')})` : ''}.`);
  console.log(`Danh mục tìm thấy: điện thoại ${phones.length}, laptop ${laptops.length}, máy tính bảng ${tablets.length}, đồng hồ ${watches.length}, phụ kiện ${accessories.length}. Chi nhánh: ${stores.length}. Hạng: ${tiers.join(', ')}`);
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error(e.message); await mongoose.disconnect(); process.exit(1); });
