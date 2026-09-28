require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const AuditLog = require('../models/AuditLog');
const { clearRetentionCache, purgeOldAuditLogs } = require('../utils/auditRetention');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function adminToken(role = 'admin') {
  const email = `${role}-audit@example.com`;
  await Admin.create({ name: `Quản trị ${role}`, email, password: 'admin123', role });
  return (await request(app).post('/api/auth/login').send({ email, password: 'admin123' })).body.accessToken;
}

// Nhật ký được ghi sau khi phản hồi đã gửi đi -> chờ một chút cho việc ghi hoàn tất
const settle = () => new Promise((r) => setTimeout(r, 150));
const setRetention = (token, days) =>
  auth(request(app).put('/api/settings'), token).send({ auditLogRetentionDays: days });

beforeEach(() => clearRetentionCache());

describe('Nhật ký thao tác: số ngày lưu, tìm kiếm, xóa tất cả', () => {
  test('TC-78: Số ngày lưu = 0 -> không ghi nhật ký; đặt lại > 0 -> ghi bình thường', async () => {
    const token = await adminToken();
    expect((await setRetention(token, 0)).statusCode).toBe(200);
    await settle();
    await AuditLog.deleteMany({});

    await auth(request(app).put('/api/settings'), token).send({ siteName: 'Không ghi' });
    await settle();
    expect(await AuditLog.countDocuments()).toBe(0);

    await setRetention(token, 2);
    await auth(request(app).put('/api/settings'), token).send({ siteName: 'Có ghi' });
    await settle();
    expect(await AuditLog.countDocuments()).toBeGreaterThanOrEqual(1);
  });

  test('TC-79: Số ngày lưu = 2 -> nhật ký cũ hơn 2 ngày bị tự động xóa, trong 2 ngày được giữ', async () => {
    const token = await adminToken();
    const admin = await Admin.findOne();
    const day = 24 * 60 * 60 * 1000;
    const make = (ageDays) =>
      AuditLog.create({ adminId: admin._id, action: `CU_${ageDays}`, createdAt: new Date(Date.now() - ageDays * day) });
    await make(1);
    await make(3);
    await make(10);

    // Lưu cấu hình -> dọn ngay lập tức
    expect((await setRetention(token, 2)).statusCode).toBe(200);
    const actions = (await AuditLog.find()).map((l) => l.action);
    expect(actions).toContain('CU_1');
    expect(actions).not.toContain('CU_3');
    expect(actions).not.toContain('CU_10');

    // Tác vụ định kỳ cũng xóa được
    await make(5);
    expect(await purgeOldAuditLogs()).toBe(1);

    // Giá trị không hợp lệ bị từ chối
    expect((await setRetention(token, -1)).statusCode).toBeGreaterThanOrEqual(400);
  });

  test('TC-80: Tìm kiếm nhật ký theo từ khóa, phương thức, khoảng ngày', async () => {
    const token = await adminToken();
    const admin = await Admin.findOne();
    await AuditLog.create([
      { adminId: admin._id, adminName: 'Nguyễn Văn A', action: 'XOA [/api/products/1]', method: 'DELETE', path: '/api/products/1' },
      { adminId: admin._id, adminName: 'Trần Thị B', action: 'CAP_NHAT [/api/orders/2]', method: 'PUT', path: '/api/orders/2' },
      { adminId: admin._id, adminName: 'Lê C', action: 'TAO_MOI [/api/news]', method: 'POST', path: '/api/news', createdAt: new Date('2020-01-05') }
    ]);
    const get = (query) => auth(request(app).get('/api/audit-logs').query(query), token);

    const byName = await get({ q: 'trần thị' });
    expect(byName.body.data.map((l) => l.adminName)).toEqual(['Trần Thị B']);
    expect((await get({ q: 'products' })).body.total).toBe(1);
    expect((await get({ method: 'delete' })).body.total).toBe(1);
    expect((await get({ from: '2020-01-01', to: '2020-01-05' })).body.data[0].adminName).toBe('Lê C');
    // Ký tự đặc biệt không gây lỗi
    expect((await get({ q: '(.*[' })).statusCode).toBe(200);
  });

  test('TC-81: Xóa tất cả nhật ký - chỉ admin; thao tác xóa được ghi lại', async () => {
    const token = await adminToken();
    const admin = await Admin.findOne();
    await AuditLog.create([{ adminId: admin._id, action: 'A' }, { adminId: admin._id, action: 'B' }]);

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).delete('/api/audit-logs'), customer)).statusCode).toBe(403);

    const res = await auth(request(app).delete('/api/audit-logs'), token);
    expect(res.statusCode).toBe(200);
    expect(res.body.deletedCount).toBe(2);
    await settle();
    const left = await AuditLog.find();
    expect(left).toHaveLength(1);
    expect(left[0].action).toMatch(/^XOA \[\/api\/audit-logs/);
  });
});
