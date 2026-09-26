require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Voucher = require('../models/Voucher');
const { normalizeSearch, buildSearchTokens, searchFilter } = require('../utils/search');
const { ensureStoreManager, STORE_MANAGER_ACCOUNT } = require('../seed/storeManager');

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-search@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-search@example.com', password: 'admin123' })).body.accessToken;
}
const get = (url, token) => request(app).get(url).set('Authorization', `Bearer ${token}`);

async function seedOrders() {
  const storeA = await Store.create({ name: 'Chi nhánh A' });
  const storeB = await Store.create({ name: 'Chi nhánh B' });
  const user = await User.create({ displayName: 'Khách', email: 'khach@example.com', password: 'matkhau123' });
  const base = { userId: user._id, paymentMode: 'cod', itemsTotal: 1, grandTotal: 1 };
  await Order.create([
    { ...base, orderCode: 'DH000123', storeId: storeA._id, deliveryAddress: { fullName: 'Nguyễn Văn Đạt', phone: '0912345678' }, items: [{ productId: user._id, quantity: 1, unitPrice: 1, name: 'iPhone 15 Pro', variantLabel: 'Đen - 256GB' }] },
    { ...base, orderCode: 'DH000456', storeId: storeB._id, deliveryAddress: { fullName: 'Trần Thị Bích', phone: '0987654321' }, items: [{ productId: user._id, quantity: 1, unitPrice: 1, name: 'Galaxy S24', variantLabel: 'Tím' }] }
  ]);
  return { storeA, storeB };
}

describe('Tìm kiếm không dấu trong trang quản trị', () => {
  test('TC-48: Bỏ dấu tiếng Việt, tách từ, tạo tiền tố; từ khóa rỗng không lọc', () => {
    expect(normalizeSearch('Nguyễn Văn ĐẠT')).toBe('nguyen van dat');
    const tokens = buildSearchTokens(['Nguyễn Văn Đạt', 'abc@gmail.com']);
    expect(tokens).toEqual(expect.arrayContaining(['ng', 'nguyen', 'van', 'dat', 'abc', 'gmail', 'com']));
    expect(searchFilter('  Nguyễn  VAN ')).toEqual({ searchTokens: { $all: ['nguyen', 'van'] } });
    expect(searchFilter('   ')).toBeNull();
  });

  test('TC-49: Đơn hàng: tìm theo tên không dấu, SĐT đầu số, mã đơn (cả phần số), tên sản phẩm; kết hợp bộ lọc', async () => {
    await seedOrders();
    const token = await adminToken();
    const codes = async (q, extra = '') => (await get(`/api/orders/admin/all?q=${encodeURIComponent(q)}${extra}`, token)).body.data.map((o) => o.orderCode);
    expect(await codes('nguyen van dat')).toEqual(['DH000123']);
    expect(await codes('NGUYỄN')).toEqual(['DH000123']);
    expect(await codes('0987')).toEqual(['DH000456']);
    expect(await codes('000123')).toEqual(['DH000123']);
    expect(await codes('dh000456')).toEqual(['DH000456']);
    expect(await codes('iphone 256')).toEqual(['DH000123']);
    expect(await codes('bich', '&status=delivered')).toEqual([]); // bộ lọc trạng thái vẫn áp dụng
    expect(await codes('khong ton tai')).toEqual([]);
  });

  test('TC-50: Quản lý chi nhánh tìm kiếm cũng chỉ thấy đơn của chi nhánh mình', async () => {
    const { storeA } = await seedOrders();
    await ensureStoreManager(storeA);
    const token = (await request(app).post('/api/auth/login').send(STORE_MANAGER_ACCOUNT)).body.accessToken;
    const res = await get('/api/orders/admin/all?q=tran thi bich', token); // đơn của chi nhánh B
    expect(res.body.data).toEqual([]);
  });

  test('TC-51: Sản phẩm (trang khách và admin): tìm không dấu theo tên, danh mục, thương hiệu, màu', async () => {
    const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
    const brand = await Brand.create({ name: 'Samsung', slug: 'samsung' });
    await Product.create({ title: 'Điện thoại Galaxy S24', slug: 'galaxy-s24', categoryId: category._id, brandId: brand._id, price: 1, variants: [{ color: 'Tím Oải Hương', price: 1 }] });
    const tablets = await Category.create({ name: 'Máy tính bảng', slug: 'may-tinh-bang' });
    await Product.create({ title: 'Tab P11', slug: 'tab-p11', categoryId: tablets._id, price: 1, variants: [{ color: 'Xám', price: 1 }] });
    const titles = async (q) => (await request(app).get(`/api/products?keyword=${encodeURIComponent(q)}`)).body.data.map((p) => p.title);
    expect(await titles('dien thoai')).toEqual(['Điện thoại Galaxy S24']);
    expect(await titles('samsung')).toEqual(['Điện thoại Galaxy S24']);
    expect(await titles('tim oai')).toEqual(['Điện thoại Galaxy S24']);
    expect(await titles('may tinh')).toEqual(['Tab P11']); // theo tên danh mục
    expect(await titles('dien thoai samsung')).toEqual(['Điện thoại Galaxy S24']);
  });

  test('TC-52: Khách hàng và voucher: tìm không dấu + lọc trạng thái', async () => {
    await User.create({ displayName: 'Lê Hoàng Phúc', email: 'phuc.le@example.com', password: 'matkhau123', phoneNumber: '0977111222', isActive: false });
    await User.create({ displayName: 'Phạm Minh', email: 'minh@example.com', password: 'matkhau123', phoneNumber: '0933444555' });
    const now = Date.now();
    await Voucher.create({ code: 'TETNGUYENDAN', description: 'Ưu đãi Tết Nguyên Đán', discountType: 'percent', discountValue: 10, endDate: new Date(now - 86400000) });
    await Voucher.create({ code: 'SALE50', description: 'Giảm giá cuối tuần', discountType: 'fixed', discountValue: 50000, endDate: new Date(now + 86400000) });
    const token = await adminToken();
    const names = async (qs) => (await get(`/api/users/admin/all?${qs}`, token)).body.data.map((u) => u.displayName);
    expect(await names('q=hoang phuc')).toEqual(['Lê Hoàng Phúc']);
    expect(await names('q=phuc.le')).toEqual(['Lê Hoàng Phúc']); // theo email
    expect(await names('q=phuc&isActive=true')).toEqual([]); // tài khoản đang bị khóa
    const codes = async (qs) => (await get(`/api/vouchers?${qs}`, token)).body.data.map((v) => v.code);
    expect(await codes('q=tet nguyen dan')).toEqual(['TETNGUYENDAN']);
    expect(await codes('state=running')).toEqual(['SALE50']);
    expect(await codes('state=expired')).toEqual(['TETNGUYENDAN']);
  });
});
