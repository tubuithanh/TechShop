// Cấu hình hóa đơn điện tử: giả lập mặc định, Bkav (bí mật mã hóa, thiếu trường không cho bật), người bán, tự xuất
process.env.ROUTING_API_URL = 'http://127.0.0.1:9';
require('./setup');
const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const EInvoice = require('../models/EInvoice');
const EInvoiceConfig = require('../models/EInvoiceConfig');
const { bkavEncode, bkavDecode } = require('../utils/einvoiceProviders');
const { autoIssueIfEnabled } = require('../utils/einvoice');
const { flushEmails } = require('../utils/notifyEmail');

afterEach(flushEmails);
const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);
const TOKEN = `${crypto.randomBytes(32).toString('base64')}:${crypto.randomBytes(16).toString('base64')}`;

test('EIC-1: Mã hóa / giải mã dữ liệu kiểu Bkav (GZip + AES-256-CBC) khớp 2 chiều', () => {
  const obj = { CmdType: 112, CommandObject: [{ Invoice: { BuyerName: 'Nguyễn Văn A' } }] };
  expect(bkavDecode(bkavEncode(obj, TOKEN), TOKEN)).toEqual(obj);
  expect(() => bkavEncode(obj, 'sai')).toThrow(/KEY:IV/);
});

test('EIC-2: Mặc định giả lập; lưu cấu hình người bán + Bkav (bí mật mã hóa); Bkav lỗi -> không tạo hóa đơn; tự xuất khi giao', async () => {
  const admin = await Admin.create({ name: 'Admin', email: `a-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const auth = (r) => r.set('Authorization', `Bearer ${token(admin)}`);
  const got = (await auth(request(app).get('/api/settings/einvoice'))).body.data;
  expect(got.config.activeProvider).toBe('simulation');
  expect(got.providers.map((p) => p.id)).toEqual(['simulation', 'bkav']);

  // Bật Bkav mà thiếu PartnerGUID / Token -> từ chối
  expect((await auth(request(app).put('/api/settings/einvoice')).send({ activeProvider: 'bkav' })).status).toBe(400);
  // Người bán: MST sai -> từ chối; ký hiệu sai -> từ chối
  expect((await auth(request(app).put('/api/settings/einvoice')).send({ seller: { taxCode: '123' } })).status).toBe(400);
  expect((await auth(request(app).put('/api/settings/einvoice')).send({ series: 'ABC' })).status).toBe(400);

  const saved = await auth(request(app).put('/api/settings/einvoice')).send({
    activeProvider: 'bkav', seller: { companyName: 'CÔNG TY TNHH DEMO', taxCode: '0312345678', address: '1 Lê Lợi' }, series: 'C26TAB', autoIssue: true,
    providers: { bkav: { values: { partnerGUID: 'guid-demo', partnerToken: TOKEN, apiUrl: 'http://127.0.0.1:9/ws' } } }
  });
  expect(saved.status).toBe(200);
  expect(JSON.stringify(saved.body)).not.toContain(TOKEN); // bí mật không trả về
  expect(saved.body.data.config.providers.bkav.secretsSet.partnerToken).toBe(true);
  expect((await EInvoiceConfig.findOne().lean()).providers.bkav.partnerTokenEnc).toMatch(/^v1:/);

  const store = await Store.create({ name: 'Q1' });
  const order = await Order.create({ orderCode: `C-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', status: 'delivered',
    deliveryAddress: { fullName: 'K', phone: '0912345678', addressLine1: 'x', city: 'HCM' }, items: [{ productId: new mongoose.Types.ObjectId(), name: 'SP', quantity: 1, unitPrice: 110000 }], itemsTotal: 110000, grandTotal: 110000 });
  // Bkav không kết nối được -> báo lỗi rõ ràng, KHÔNG lưu hóa đơn
  const fail = await auth(request(app).post(`/api/einvoices/orders/${order._id}/issue`)).send({});
  expect(fail.status).toBe(502);
  expect(fail.body.message).toMatch(/Bkav eHoadon/);
  expect(await EInvoice.countDocuments({ orderId: order._id })).toBe(0);

  // Quay về giả lập: tự xuất khi giao, đúng người bán + ký hiệu đã cấu hình
  await auth(request(app).put('/api/settings/einvoice')).send({ activeProvider: 'simulation' });
  const inv = await autoIssueIfEnabled(order._id);
  expect(inv).toMatchObject({ provider: 'simulation', series: 'C26TAB', seller: { name: 'CÔNG TY TNHH DEMO', taxCode: '0312345678' } });
  expect(await autoIssueIfEnabled(order._id)).toBeNull(); // không xuất trùng
});
