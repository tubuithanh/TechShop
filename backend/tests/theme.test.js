require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const ThemeTemplate = require('../models/ThemeTemplate');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-theme@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-theme@example.com', password: 'admin123' })).body.accessToken;
}

describe('Màu sắc giao diện và template', () => {
  test('TC-88: Có sẵn 4 template (Mặc định, Noel, Tết, Mùa thu); bộ màu đang dùng trả về công khai', async () => {
    const token = await adminToken();
    const list = await auth(request(app).get('/api/settings/themes'), token);
    expect(list.statusCode).toBe(200);
    expect(list.body.data.map((t) => t.builtInKey)).toEqual(['default', 'christmas', 'tet', 'autumn']);
    expect(list.body.data.find((t) => t.builtInKey === 'tet').theme.effect).toBe('blossom');
    // Gọi lại không tạo trùng
    await auth(request(app).get('/api/settings/themes'), token);
    expect(await ThemeTemplate.countDocuments()).toBe(4);

    const pub = await request(app).get('/api/settings');
    expect(pub.body.data.theme).toMatchObject({ primary: '#dc2626', effect: 'none' });
  });

  test('TC-89: Áp dụng bộ màu Noel -> trang công khai nhận màu mới; mã màu sai bị từ chối, không ghi dở', async () => {
    const token = await adminToken();
    const noel = (await auth(request(app).get('/api/settings/themes'), token)).body.data.find((t) => t.builtInKey === 'christmas');
    const { _id, ...theme } = noel.theme;
    expect((await auth(request(app).put('/api/settings'), token).send({ theme })).statusCode).toBe(200);
    expect((await request(app).get('/api/settings')).body.data.theme).toMatchObject({ headerBg: '#14532d', effect: 'snow' });

    // Chỉ gửi 1 màu -> các màu khác giữ nguyên
    await auth(request(app).put('/api/settings'), token).send({ theme: { primary: '#123456' } });
    expect((await request(app).get('/api/settings')).body.data.theme).toMatchObject({ primary: '#123456', headerBg: '#14532d' });

    const bad = await auth(request(app).put('/api/settings'), token).send({ siteName: 'Không lưu', theme: { primary: 'red' } });
    expect(bad.statusCode).toBe(400);
    const bad2 = await auth(request(app).put('/api/settings'), token).send({ theme: { effect: 'phao-hoa' } });
    expect(bad2.statusCode).toBe(400);
    expect((await request(app).get('/api/settings')).body.data.siteName).not.toBe('Không lưu');

    // Khách hàng không đổi được màu
    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).put('/api/settings'), customer).send({ theme: { primary: '#000000' } })).statusCode).toBe(403);
  });

  test('TC-90: Lưu bộ màu thành template mới, sửa, xóa; bộ Mặc định không sửa/xóa được', async () => {
    const token = await adminToken();
    const list = (await auth(request(app).get('/api/settings/themes'), token)).body.data;
    const def = list.find((t) => t.builtInKey === 'default');

    const theme = { ...def.theme, primary: '#1d4ed8', headerBg: '#1e3a8a' };
    delete theme._id;
    const created = await auth(request(app).post('/api/settings/themes'), token).send({ name: '  Xanh   biển ', theme });
    expect(created.statusCode).toBe(201);
    expect(created.body.data.name).toBe('Xanh biển');
    expect((await auth(request(app).post('/api/settings/themes'), token).send({ name: 'Xanh biển', theme })).statusCode).toBe(400);
    expect((await auth(request(app).post('/api/settings/themes'), token).send({ name: 'Sai', theme: { primary: '#xyz' } })).statusCode).toBe(400);

    // Template mới nhất của admin nằm sau các template có sẵn
    const after = (await auth(request(app).get('/api/settings/themes'), token)).body.data;
    expect(after[4].name).toBe('Xanh biển');

    const id = created.body.data._id;
    const upd = await auth(request(app).put(`/api/settings/themes/${id}`), token).send({ name: 'Xanh đại dương', theme: { ...theme, accent: '#06b6d4' } });
    expect(upd.body.data).toMatchObject({ name: 'Xanh đại dương', theme: { accent: '#06b6d4' } });

    expect((await auth(request(app).put(`/api/settings/themes/${def._id}`), token).send({ name: 'X' })).statusCode).toBe(400);
    expect((await auth(request(app).delete(`/api/settings/themes/${def._id}`), token)).statusCode).toBe(400);
    expect((await auth(request(app).delete(`/api/settings/themes/${id}`), token)).statusCode).toBe(200);

    // Xóa template Noel -> không tự tạo lại
    const noel = after.find((t) => t.builtInKey === 'christmas');
    await auth(request(app).delete(`/api/settings/themes/${noel._id}`), token);
    const final = (await auth(request(app).get('/api/settings/themes'), token)).body.data;
    expect(final.map((t) => t.builtInKey)).toEqual(['default', 'tet', 'autumn']);
  });
});
