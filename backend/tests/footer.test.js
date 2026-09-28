require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const { DEFAULT_FOOTER } = require('../utils/footer');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-footer@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-footer@example.com', password: 'admin123' })).body.accessToken;
}

describe('Chỉnh sửa chân trang (footer)', () => {
  test('TC-99: Mặc định giữ đúng nội dung footer cũ; admin sửa chữ, tiêu đề, liên kết -> trang công khai nhận ngay', async () => {
    const token = await adminToken();
    const before = (await request(app).get('/api/settings')).body.data.footer;
    expect(before).toEqual(DEFAULT_FOOTER);

    const footer = {
      aboutText: 'Hệ thống bán lẻ thiết bị công nghệ',
      columns: [
        { title: 'Hỗ trợ', links: [{ label: 'Cửa hàng', url: '/stores' }, { label: '', url: '' }, { label: 'Fanpage', url: 'https://facebook.com/techshop' }] },
        { title: 'Chính sách', links: [{ label: 'Đổi trả', url: '/chinh-sach-doi-tra' }] }
      ],
      contactTitle: 'Liên hệ chúng tôi',
      copyright: '© {year} {siteName}. Bảo lưu mọi quyền.'
    };
    const res = await auth(request(app).put('/api/settings'), token).send({ footer });
    expect(res.statusCode).toBe(200);
    const after = (await request(app).get('/api/settings')).body.data.footer;
    expect(after.aboutText).toBe('Hệ thống bán lẻ thiết bị công nghệ');
    expect(after.columns[0].links).toEqual([
      { label: 'Cửa hàng', url: '/stores' },
      { label: 'Fanpage', url: 'https://facebook.com/techshop' }
    ]); // dòng trống bị bỏ
    expect(after.contactTitle).toBe('Liên hệ chúng tôi');

    // Sửa cấu hình khác không làm mất footer
    await auth(request(app).put('/api/settings'), token).send({ siteName: 'Shop Mới' });
    expect((await request(app).get('/api/settings')).body.data.footer.copyright).toBe('© {year} {siteName}. Bảo lưu mọi quyền.');
  });

  test('TC-100: Chặn đường dẫn nguy hiểm (javascript:, //evil), thiếu tiêu đề, quá nhiều cột; khách hàng không sửa được', async () => {
    const token = await adminToken();
    const put = (footer) => auth(request(app).put('/api/settings'), token).send({ footer });
    const col = (links) => ({ title: 'Cột', links });
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'evil.com']) {
      const res = await put({ ...DEFAULT_FOOTER, columns: [col([{ label: 'X', url }])] });
      expect(res.statusCode).toBe(400);
    }
    expect((await put({ ...DEFAULT_FOOTER, columns: [{ title: '', links: [] }] })).statusCode).toBe(400);
    expect((await put({ ...DEFAULT_FOOTER, columns: [col([]), col([]), col([])] })).statusCode).toBe(400);
    expect((await put({ ...DEFAULT_FOOTER, columns: [col([{ label: 'Có chữ', url: '' }])] })).statusCode).toBe(400);
    expect((await put('abc')).statusCode).toBe(400);
    expect((await request(app).get('/api/settings')).body.data.footer).toEqual(DEFAULT_FOOTER); // không ghi dở

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).put('/api/settings'), customer).send({ footer: DEFAULT_FOOTER })).statusCode).toBe(403);
  });
});
