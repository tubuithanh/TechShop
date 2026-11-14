// Hóa đơn điện tử giả lập: phát hành, đánh số liên tục, số tiền khớp đơn, bằng chữ, chữ ký, hủy, thay thế, tra cứu
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const { numberToWords } = require('../utils/einvoice');
const { flushEmails } = require('../utils/notifyEmail');

afterEach(flushEmails);
const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);

test('EINV-0: Đọc số tiền bằng chữ', () => {
  expect(numberToWords(1810000)).toBe('Một triệu tám trăm mười nghìn đồng chẵn');
  expect(numberToWords(31130000)).toBe('Ba mươi mốt triệu một trăm ba mươi nghìn đồng chẵn');
  expect(numberToWords(1005)).toBe('Một nghìn không trăm lẻ năm đồng chẵn');
  expect(numberToWords(25000)).toBe('Hai mươi lăm nghìn đồng chẵn');
});

test('EINV-1: Phát hành, số liên tục, khớp tiền; chặn đơn chưa giao / trùng; hủy, thay thế, tra cứu', async () => {
  const admin = await Admin.create({ name: 'Kế toán', email: `kt-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const auth = (r) => r.set('Authorization', `Bearer ${token(admin)}`);
  const store = await Store.create({ name: 'Q1' });
  const mk = (extra) => Order.create({ orderCode: `E-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', status: 'delivered',
    deliveryAddress: { fullName: 'Nguyễn Văn A', phone: '0912345678', addressLine1: '1 Lê Lợi', city: 'HCM' },
    items: [{ productId: new mongoose.Types.ObjectId(), name: 'iPhone 15', variantLabel: 'Đen', quantity: 2, unitPrice: 1100000, vat: { rate: 10, included: true, taxableTotal: 2200000, netAmount: 2000000, amount: 200000 } }],
    shippingFee: 33000, shippingVat: { rate: 10, included: true, taxableTotal: 33000, netAmount: 30000, amount: 3000 },
    itemsTotal: 2200000, grandTotal: 2233000, ...extra });
  const o1 = await mk({ invoiceInfo: { companyName: 'Công ty ABC', taxCode: '0312345678', address: '9 Nguyễn Huệ', email: 'ketoan@abc.vn' } });
  const o2 = await mk({});
  const pending = await mk({ status: 'shipping' });

  const r1 = await auth(request(app).post(`/api/einvoices/orders/${o1._id}/issue`)).send({});
  expect(r1.status).toBe(201);
  const inv1 = r1.body.data;
  expect(inv1).toMatchObject({ series: expect.stringMatching(/^C\d{2}TTS$/), number: 1, status: 'issued', buyer: { companyName: 'Công ty ABC', taxCode: '0312345678' }, emailQueuedTo: 'ketoan@abc.vn' });
  expect(inv1.totals).toMatchObject({ net: 2030000, vat: 203000, total: 2233000 });
  expect(inv1.lines.map((l) => l.kind)).toEqual(['goods', 'shipping']);
  expect(inv1.amountInWords).toBe('Hai triệu hai trăm ba mươi ba nghìn đồng chẵn');
  expect(inv1.taxAuthorityCode).toMatch(/^M1-\d{2}-/);

  expect((await auth(request(app).post(`/api/einvoices/orders/${o1._id}/issue`)).send({})).status).toBe(409); // trùng
  expect((await auth(request(app).post(`/api/einvoices/orders/${pending._id}/issue`)).send({})).status).toBe(400); // chưa giao

  const bulk = (await auth(request(app).post('/api/einvoices/bulk-issue')).send({})).body.data;
  expect(bulk.issued).toBe(1); // chỉ o2
  const list = (await auth(request(app).get('/api/einvoices'))).body;
  expect(list.data.map((x) => x.number).sort()).toEqual([1, 2]);
  expect(list.summary).toMatchObject({ issued: 2, issuedTotal: 4466000, pendingOrders: 0 });

  // Tra cứu công khai + chữ ký hợp lệ
  const pub = await request(app).get(`/api/einvoices/lookup/${inv1.lookupCode}`);
  expect(pub.body.data).toMatchObject({ number: 1, signatureValid: true });

  // Thay thế: sửa MST, hóa đơn cũ bị thay thế, hóa đơn mới số 3
  const rep = await auth(request(app).post(`/api/einvoices/${inv1._id}/replace`)).send({ reason: 'Sai mã số thuế người mua', buyer: { taxCode: '0399999999' } });
  expect(rep.status).toBe(201);
  expect(rep.body.data).toMatchObject({ number: 3, type: 'replacement', buyer: { taxCode: '0399999999', companyName: 'Công ty ABC' } });
  const old = (await auth(request(app).get(`/api/einvoices/${inv1._id}`))).body.data;
  expect(old).toMatchObject({ status: 'replaced', replacedById: rep.body.data._id });

  // Hủy
  expect((await auth(request(app).post(`/api/einvoices/${rep.body.data._id}/cancel`)).send({ reason: 'x' })).status).toBe(400);
  const c = await auth(request(app).post(`/api/einvoices/${rep.body.data._id}/cancel`)).send({ reason: 'Khách trả hàng toàn bộ' });
  expect(c.body.data.status).toBe('cancelled');
  // Sau khi hủy được phát hành lại cho đơn đó
  expect((await auth(request(app).post(`/api/einvoices/orders/${o1._id}/issue`)).send({})).body.data.number).toBe(4);
});

test('EINV-2: Xem trước hóa đơn (bản nháp): không cấp số, không lưu; đơn chưa giao vẫn xem được kèm lý do', async () => {
  const EInvoice = require('../models/EInvoice');
  const admin = await Admin.create({ name: 'KT2', email: `kt2-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const auth = (r) => r.set('Authorization', `Bearer ${token(admin)}`);
  const store = await Store.create({ name: 'Q3' });
  const order = await Order.create({ orderCode: `P-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', status: 'shipping',
    deliveryAddress: { fullName: 'Khách B', phone: '0912345678', addressLine1: '2 Lê Lợi', city: 'HCM' },
    items: [{ productId: new mongoose.Types.ObjectId(), name: 'Tai nghe', quantity: 1, unitPrice: 550000 }], itemsTotal: 550000, grandTotal: 550000 });
  const r = await auth(request(app).post(`/api/einvoices/orders/${order._id}/preview`)).send({ buyer: { companyName: 'Cty XYZ', taxCode: '0101010101' } });
  expect(r.status).toBe(200);
  expect(r.body.data).toMatchObject({ draft: true, number: null, status: 'draft', buyer: { name: 'Khách B', companyName: 'Cty XYZ', taxCode: '0101010101' }, totals: { total: 550000, vat: 50000 } });
  expect(r.body.data.blocker).toMatch(/đã giao/);
  expect(r.body.data.amountInWords).toBe('Năm trăm năm mươi nghìn đồng chẵn');
  expect(await EInvoice.countDocuments({ orderId: order._id })).toBe(0);
});

test('EINV-3: Chờ xuất chỉ gồm đơn đủ điều kiện; hóa đơn của đơn đã trả hàng được đánh dấu "cần xử lý"', async () => {
  const admin = await Admin.create({ name: 'KT3', email: `kt3-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const auth = (r) => r.set('Authorization', `Bearer ${token(admin)}`);
  const store = await Store.create({ name: 'Q5' });
  const mk = (extra) => Order.create({ orderCode: `A-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', status: 'delivered',
    deliveryAddress: { fullName: 'K', phone: '0912345678', addressLine1: 'x', city: 'HCM' }, items: [{ productId: new mongoose.Types.ObjectId(), name: 'SP', quantity: 1, unitPrice: 110000 }], itemsTotal: 110000, grandTotal: 110000, ...extra });
  const ok = await mk({});
  await mk({ paymentMode: 'vnpay', paymentStatus: 'pending' }); // chưa thanh toán -> không chờ xuất
  await mk({ paymentMode: 'momo', paymentStatus: 'paid' });     // đã thanh toán -> chờ xuất
  const pend = (await auth(request(app).get(`/api/einvoices/pending-orders?storeId=${store._id}`))).body;
  expect(pend.total).toBe(2);
  expect(pend.amount).toBe(220000);

  const inv = (await auth(request(app).post(`/api/einvoices/orders/${ok._id}/issue`)).send({})).body.data;
  await Order.updateOne({ _id: ok._id }, { status: 'returned', refundStatus: 'completed' });
  const res = (await auth(request(app).get(`/api/einvoices?status=attention&storeId=${store._id}`))).body;
  expect(res.summary.attention).toBe(1);
  expect(res.data).toEqual([expect.objectContaining({ _id: inv._id, needsAttention: true })]);
  expect(res.summary.pendingOrders).toBe(1);
});

test('EINV-4: Không nhảy số khi phát hành trùng; tra cứu công khai che SĐT/email; không thay thế HĐ của đơn đã trả; HĐ Bkav không hủy tại chỗ', async () => {
  const EInvoice = require('../models/EInvoice');
  const admin = await Admin.create({ name: 'KT4', email: `kt4-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const auth = (r) => r.set('Authorization', `Bearer ${token(admin)}`);
  const store = await Store.create({ name: 'Q7' });
  const mk = () => Order.create({ orderCode: `N-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', status: 'delivered',
    deliveryAddress: { fullName: 'K', phone: '0912345678', addressLine1: 'x', city: 'HCM' }, invoiceInfo: { email: 'khach@gmail.com' },
    items: [{ productId: new mongoose.Types.ObjectId(), name: 'SP', quantity: 1, unitPrice: 110000 }], itemsTotal: 110000, grandTotal: 110000 });
  const [a, b] = [await mk(), await mk()];
  // Bấm phát hành 2 lần cùng lúc cho 1 đơn -> chỉ 1 hóa đơn, KHÔNG làm nhảy số
  const both = await Promise.all([1, 2].map(() => auth(request(app).post(`/api/einvoices/orders/${a._id}/issue`)).send({ sendEmail: false })));
  expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  const first = both.find((r) => r.status === 201).body.data;
  const second = (await auth(request(app).post(`/api/einvoices/orders/${b._id}/issue`)).send({ sendEmail: false })).body.data;
  expect(second.number).toBe(first.number + 1);
  expect(second.number).toBeGreaterThan(0);

  // Tra cứu công khai: che SĐT + email; chữ ký vẫn hợp lệ sau khi cấp số
  const pub = (await request(app).get(`/api/einvoices/lookup/${first.lookupCode}`)).body.data;
  expect(pub.signatureValid).toBe(true);
  expect(pub.buyer.phone).toBe('091***78');
  expect(pub.buyer.email).toBe('kh***ch@gmail.com');

  // Đơn đã trả hàng: không lập thay thế, phải hủy
  await Order.updateOne({ _id: a._id }, { status: 'returned' });
  const rep = await auth(request(app).post(`/api/einvoices/${first._id}/replace`)).send({ reason: 'Sai thông tin người mua' });
  expect(rep.status).toBe(400);
  expect(rep.body.message).toMatch(/hủy hóa đơn/);

  // Hóa đơn phát hành qua Bkav: không hủy tại chỗ
  await EInvoice.updateOne({ _id: second._id }, { provider: 'bkav' });
  const cancel = await auth(request(app).post(`/api/einvoices/${second._id}/cancel`)).send({ reason: 'Khách trả hàng toàn bộ' });
  expect(cancel.status).toBe(400);
  expect(cancel.body.message).toMatch(/BKAV/);
});
