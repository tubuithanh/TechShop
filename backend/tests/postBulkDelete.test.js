require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Post = require('../models/Post');
const AuditLog = require('../models/AuditLog');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function login(role, email) {
  await Admin.create({ name: role, email, password: 'admin123', role });
  return (await request(app).post('/api/auth/login').send({ email, password: 'admin123' })).body.accessToken;
}
const makePosts = (n) =>
  Post.insertMany(Array.from({ length: n }, (_, i) => ({ title: `Bài ${i + 1}`, slug: `bai-${i + 1}`, content: 'Nội dung' })));

describe('Xóa bài viết hàng loạt / xóa tất cả', () => {
  test('TC-104: Xóa các bài đã chọn - chỉ xóa đúng bài chọn; danh sách sai bị từ chối; được ghi nhật ký', async () => {
    const token = await login('admin', 'admin-bulk@example.com');
    const posts = await makePosts(5);
    const res = await auth(request(app).post('/api/posts/bulk-delete'), token).send({ ids: [posts[0]._id, posts[2]._id, posts[2]._id] });
    expect(res.statusCode).toBe(200);
    expect(res.body.deletedCount).toBe(2);
    expect((await Post.find().sort({ title: 1 })).map((p) => p.title)).toEqual(['Bài 2', 'Bài 4', 'Bài 5']);

    expect((await auth(request(app).post('/api/posts/bulk-delete'), token).send({ ids: [] })).statusCode).toBe(400);
    expect((await auth(request(app).post('/api/posts/bulk-delete'), token).send({ ids: ['abc'] })).statusCode).toBe(400);
    expect((await auth(request(app).post('/api/posts/bulk-delete'), token).send({ ids: { $ne: null } })).statusCode).toBe(400);
    expect(await Post.countDocuments()).toBe(3);

    await new Promise((r) => setTimeout(r, 150));
    expect(await AuditLog.exists({ path: '/api/posts/bulk-delete' })).toBeTruthy();
  });

  test('TC-105: Xóa tất cả phải gõ đúng "XOA TAT CA"; nhân viên và khách hàng không được xóa', async () => {
    const admin = await login('admin', 'admin-all@example.com');
    const staff = await login('staff', 'staff-all@example.com');
    await makePosts(4);
    const customer = (await registerUser()).body.accessToken;

    expect((await auth(request(app).delete('/api/posts'), staff).send({ confirm: 'XOA TAT CA' })).statusCode).toBe(403);
    expect((await auth(request(app).delete('/api/posts'), customer).send({ confirm: 'XOA TAT CA' })).statusCode).toBe(403);
    expect((await auth(request(app).post('/api/posts/bulk-delete'), staff).send({ ids: [] })).statusCode).toBe(403);
    expect((await auth(request(app).delete('/api/posts'), admin).send({})).statusCode).toBe(400);
    expect((await auth(request(app).delete('/api/posts'), admin).send({ confirm: 'xoa tat ca' })).statusCode).toBe(400);
    expect(await Post.countDocuments()).toBe(4);

    const res = await auth(request(app).delete('/api/posts'), admin).send({ confirm: 'XOA TAT CA' });
    expect(res.statusCode).toBe(200);
    expect(res.body.deletedCount).toBe(4);
    expect(await Post.countDocuments()).toBe(0);
  });
});
