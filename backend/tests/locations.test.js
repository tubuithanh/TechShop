require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Province = require('../models/Province');
const Ward = require('../models/Ward');
const { seedDefaultLocations, ensureLocationsSeeded } = require('../utils/seedLocations');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-loc@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-loc@example.com', password: 'admin123' })).body
    .accessToken;
}

describe('Tỉnh/thành, phường/xã', () => {
  test('TC-82: Nạp dữ liệu mặc định 34 tỉnh/thành, 3.321 phường/xã; chạy lại không trùng', async () => {
    expect(await ensureLocationsSeeded()).toEqual({ provinces: 34, wards: 3321 });
    expect(await ensureLocationsSeeded()).toBeNull(); // đã có dữ liệu -> bỏ qua
    expect(await seedDefaultLocations()).toEqual({ provinces: 0, wards: 0 });
    expect(await Ward.countDocuments()).toBe(3321);
  }, 60000);

  test('TC-83: Gõ phường/xã -> chỉ ra phường/xã của tỉnh đang chọn, tìm không dấu', async () => {
    const hn = await Province.create({ name: 'Thành phố Hà Nội' });
    const hcm = await Province.create({ name: 'Thành phố Hồ Chí Minh' });
    await Ward.create([
      { provinceId: hn._id, name: 'Phường Ba Đình' },
      { provinceId: hn._id, name: 'Phường Hoàn Kiếm' },
      { provinceId: hn._id, name: 'Xã Ba Vì', isActive: false },
      { provinceId: hcm._id, name: 'Phường Bến Thành' }
    ]);

    const provinces = await request(app).get('/api/locations/provinces');
    expect(provinces.body.data).toHaveLength(2);

    const byName = await request(app).get('/api/locations/wards').query({ province: 'Thành phố Hà Nội' });
    expect(byName.body.data.map((w) => w.name)).toEqual(['Phường Ba Đình', 'Phường Hoàn Kiếm']); // xã đã ẩn không hiện

    const search = await request(app).get('/api/locations/wards').query({ province: String(hn._id), q: 'ba dinh' });
    expect(search.body.data.map((w) => w.name)).toEqual(['Phường Ba Đình']);

    // Phường của tỉnh khác không lọt vào
    const other = await request(app).get('/api/locations/wards').query({ province: String(hn._id), q: 'ben thanh' });
    expect(other.body.data).toHaveLength(0);
    expect((await request(app).get('/api/locations/wards')).body.data).toHaveLength(0);
  });

  test('TC-84: Admin quản lý tỉnh/phường; khách hàng không có quyền', async () => {
    const token = await adminToken();
    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).post('/api/locations/admin/provinces'), customer).send({ name: 'X' })).statusCode).toBe(403);

    const p = await auth(request(app).post('/api/locations/admin/provinces'), token).send({ name: '  Tỉnh   Mới ' });
    expect(p.statusCode).toBe(201);
    expect(p.body.data.name).toBe('Tỉnh Mới');
    expect((await auth(request(app).post('/api/locations/admin/provinces'), token).send({ name: 'Tỉnh Mới' })).statusCode).toBe(400);

    const w = await auth(request(app).post('/api/locations/admin/wards'), token).send({ provinceId: p.body.data._id, name: 'Xã Một' });
    expect(w.statusCode).toBe(201);
    expect((await auth(request(app).post('/api/locations/admin/wards'), token).send({ provinceId: p.body.data._id, name: 'Xã Một' })).statusCode).toBe(400);

    // Sửa tên + ẩn phường -> khách không thấy nữa
    await auth(request(app).put(`/api/locations/admin/wards/${w.body.data._id}`), token).send({ name: 'Xã Hai', isActive: false });
    expect((await request(app).get('/api/locations/wards').query({ province: 'Tỉnh Mới' })).body.data).toHaveLength(0);

    const list = await auth(request(app).get('/api/locations/admin/wards').query({ q: 'xa hai' }), token);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].provinceId.name).toBe('Tỉnh Mới');

    const provinces = await auth(request(app).get('/api/locations/admin/provinces'), token);
    expect(provinces.body.data[0]).toMatchObject({ wardCount: 1, activeWardCount: 0 });

    // Xóa tỉnh xóa luôn phường/xã của tỉnh
    expect((await auth(request(app).delete(`/api/locations/admin/provinces/${p.body.data._id}`), token)).statusCode).toBe(200);
    expect(await Ward.countDocuments()).toBe(0);
  });
});
