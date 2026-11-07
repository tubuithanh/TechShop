require('./setup');
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const PermissionGroup = require('../models/PermissionGroup');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const { migrateChat } = require('../utils/migrateChat');
const { staffIdentity } = require('../services/chatSupport');

const auth = (r, token) => r.set('Authorization', `Bearer ${token}`);
const guest = (r, token) => r.set('X-Chat-Token', token);
const payload = { name: 'Nguyễn An', phone: '0912345678', email: '', gender: '', content: 'Tôi cần tư vấn' };
async function start(overrides = {}, token = crypto.randomBytes(32).toString('hex')) {
  const response = await guest(request(app).post('/api/chat/guest/start'), token).send({ ...payload, ...overrides });
  return { response, token, id: response.body.data?._id };
}
async function staff({ role = 'staff', support = true, withCode = true } = {}) {
  let group;
  if (support) group = await PermissionGroup.findOneAndUpdate({ name: withCode ? 'Chăm sóc khách hàng' : 'Nhóm khác' },
    { $setOnInsert: { ...(withCode ? { code: 'customer_support' } : {}), permissions: ['chat.support'] } }, { upsert: true, new: true });
  const account = await Admin.create({ name: 'Nhân viên thử', email: `${crypto.randomUUID()}@example.com`, password: 'test12345', role,
    groupIds: group ? [group._id] : [] });
  return { account, group, token: jwt.sign({ id: String(account._id), role, tv: 0 }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' }) };
}
const sendGuest = (token, content = 'Tin tiếp theo', clientMessageId = crypto.randomUUID()) =>
  guest(request(app).post('/api/chat/guest/messages'), token).send({ content, clientMessageId });

describe('Chat: phiên khách, hàng chờ và phân quyền', () => {
  beforeAll(async () => { await ChatConversation.init(); await ChatMessage.init(); });

  test('Khách chưa đăng nhập bắt đầu/khôi phục phiên; chỉ bắt buộc tên và điện thoại', async () => {
    const { response, token, id } = await start();
    expect(response.statusCode).toBe(201);
    expect(response.body.data.status).toBe('waiting');
    expect(response.body.data.sessionHash).toBeUndefined();
    expect(response.body.data.initialContent).toBeUndefined();
    expect((await guest(request(app).get('/api/chat/guest/session'), token)).body.data._id).toBe(id);
    expect((await guest(request(app).get('/api/chat/guest/messages'), token)).body.data[0].content).toBe(payload.content);
    expect((await start({ content: '' })).response.statusCode).toBe(201);
  });

  test('Kiểm tra tên, số điện thoại, email, giới tính và độ dài tin', async () => {
    for (const input of [{ name: ' ' }, { phone: 'abc' }, { email: 'sai' }, { gender: 'invalid' }, { content: 'x'.repeat(2001) }]) {
      expect((await start(input)).response.statusCode).toBe(400);
    }
    const ok = await start({ phone: '+84 912 345 678', email: ' AN@EXAMPLE.COM ', gender: 'female' });
    expect(ok.response.body.data.customer).toMatchObject({ phone: '0912345678', email: 'an@example.com', gender: 'female' });
  });

  test('Bắt đầu đồng thời hoặc gửi lại không tạo trùng hội thoại/tin đầu tiên', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const results = await Promise.all([start({}, token), start({}, token)]);
    expect(results.map((r) => r.response.statusCode)).toEqual([201, 201]);
    expect(results[0].id).toBe(results[1].id);
    expect(await ChatConversation.countDocuments()).toBe(1);
    await start({ content: 'Không được chèn tin khác' }, token);
    expect(await ChatMessage.countDocuments()).toBe(1);
  });

  test('Thông tin liên hệ không cấp quyền xem chat khác; phiên hết hạn bị chặn', async () => {
    const first = await start(); const second = await start({ content: 'Tin riêng khách 2' });
    const history = await guest(request(app).get(`/api/chat/guest/messages?conversationId=${first.id}`), second.token);
    expect(history.body.data.map((m) => m.content)).toEqual(['Tin riêng khách 2']);
    expect((await guest(request(app).get('/api/chat/guest/session'), 'a'.repeat(64))).statusCode).toBe(401);
    expect((await request(app).get('/api/chat/guest/messages')).statusCode).toBe(401);
    await ChatConversation.updateOne({ _id: first.id }, { sessionExpiresAt: new Date(0) });
    expect((await sendGuest(first.token)).statusCode).toBe(401);
  });

  test('Phải thuộc đúng nhóm CSKH; quyền chat của nhóm khác không đủ; admin có toàn quyền', async () => {
    const other = await staff({ withCode: false }); const noPermission = await staff({ support: false });
    const support = await staff(); const admin = await staff({ role: 'admin', support: false });
    expect((await auth(request(app).get('/api/chat'), other.token)).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/chat'), noPermission.token)).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/chat'), support.token)).statusCode).toBe(200);
    expect((await auth(request(app).get('/api/chat'), admin.token)).statusCode).toBe(200);
    await expect(staffIdentity(other.token)).rejects.toThrow();
  });

  test('Nhận đồng thời: một người thành công; người khác không xem/gửi tin', async () => {
    const { id } = await start(); const a = await staff(); const b = await staff();
    const results = await Promise.all([a, b].map((s) => auth(request(app).post(`/api/chat/${id}/claim`), s.token)));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const owner = results[0].statusCode === 200 ? a : b; const other = owner === a ? b : a;
    expect((await auth(request(app).get(`/api/chat/${id}/messages`), other.token)).statusCode).toBe(403);
    expect((await auth(request(app).post(`/api/chat/${id}/messages`), other.token).send({ content: 'Sai người', clientMessageId: crypto.randomUUID() })).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/chat?status=active'), owner.token)).body.data[0]._id).toBe(id);
    expect((await auth(request(app).get('/api/chat?status=active'), other.token)).body.data).toEqual([]);
  });

  test('Nhận trước khi trả lời; gửi lại không trùng; số tin chưa đọc cập nhật đúng', async () => {
    const { id, token } = await start(); const agent = await staff();
    const body = { content: 'Chào bạn!', clientMessageId: crypto.randomUUID() };
    expect((await auth(request(app).post(`/api/chat/${id}/messages`), agent.token).send(body)).statusCode).toBe(409);
    await auth(request(app).post(`/api/chat/${id}/claim`), agent.token);
    const first = await auth(request(app).post(`/api/chat/${id}/messages`), agent.token).send(body);
    const retry = await auth(request(app).post(`/api/chat/${id}/messages`), agent.token).send(body);
    expect(first.statusCode).toBe(201); expect(retry.body.data._id).toBe(first.body.data._id);
    expect((await guest(request(app).get('/api/chat/guest/session'), token)).body.data.customerUnread).toBe(1);
    expect((await guest(request(app).post('/api/chat/guest/read'), token)).body.data.customerUnread).toBe(0);
    expect((await auth(request(app).post(`/api/chat/${id}/read`), agent.token)).body.data.staffUnread).toBe(0);
    const uuid = crypto.randomUUID();
    const results = await Promise.all([sendGuest(token, 'Tin mới', uuid), sendGuest(token, 'Tin mới', uuid)]);
    expect(results[0].body.data._id).toBe(results[1].body.data._id);
    expect(await ChatMessage.countDocuments({ conversationId: id })).toBe(3);
    expect((await ChatConversation.findById(id)).staffUnread).toBe(1);
  });

  test('Kết thúc giữ lịch sử, chặn tin mới và cho tạo cuộc mới', async () => {
    const { id, token } = await start(); const agent = await staff();
    await auth(request(app).post(`/api/chat/${id}/claim`), agent.token);
    expect((await auth(request(app).patch(`/api/chat/${id}`), agent.token).send({ action: 'close' })).body.data.status).toBe('closed');
    expect((await sendGuest(token)).statusCode).toBe(409);
    expect((await guest(request(app).get('/api/chat/guest/messages'), token)).body.data).toHaveLength(1);
    expect((await start()).id).not.toBe(id);
  });

  test('Admin chuyển/đưa về hàng chờ; staff không được chuyển; chặn chuyển cho người đã khóa', async () => {
    const { id } = await start(); const a = await staff(); const b = await staff(); const admin = await staff({ role: 'admin', support: false });
    await auth(request(app).post(`/api/chat/${id}/claim`), a.token);
    expect((await auth(request(app).patch(`/api/chat/${id}`), a.token).send({ action: 'release' })).statusCode).toBe(403);
    const transfer = await auth(request(app).patch(`/api/chat/${id}`), admin.token).send({ action: 'transfer', assignedTo: b.account._id });
    expect(transfer.body.data.assignedTo._id).toBe(String(b.account._id));
    expect((await auth(request(app).get(`/api/chat/${id}/messages`), a.token)).statusCode).toBe(403);
    await Admin.updateOne({ _id: a.account._id }, { isActive: false });
    expect((await auth(request(app).patch(`/api/chat/${id}`), admin.token).send({ action: 'transfer', assignedTo: a.account._id })).statusCode).toBe(400);
    expect((await auth(request(app).patch(`/api/chat/${id}`), admin.token).send({ action: 'release' })).body.data).toMatchObject({ status: 'waiting', assignedTo: null });
  });

  test('Thu hồi quyền/đổi mật khẩu/hạ quyền có hiệu lực cả HTTP và xác thực socket', async () => {
    const agent = await staff();
    await PermissionGroup.updateOne({ _id: agent.group._id }, { permissions: [] });
    expect((await auth(request(app).get('/api/chat'), agent.token)).statusCode).toBe(403);
    await expect(staffIdentity(agent.token)).rejects.toThrow();
    const admin = await staff({ role: 'admin', support: false });
    await Admin.updateOne({ _id: admin.account._id }, { role: 'staff' });
    await expect(staffIdentity(admin.token)).rejects.toThrow();
    await Admin.updateOne({ _id: admin.account._id }, { role: 'admin', tokenVersion: 1 });
    expect((await auth(request(app).get('/api/chat'), admin.token)).statusCode).toBe(401);
    await expect(staffIdentity(admin.token)).rejects.toThrow();
  });

  test('Phân trang lấy tin mới nhất và tải tiếp tin cũ', async () => {
    const { id, token } = await start({ content: '' });
    await ChatMessage.insertMany(Array.from({ length: 105 }, (_, i) => ({ conversationId: id, senderRole: 'customer', content: String(i) })));
    const latest = await guest(request(app).get('/api/chat/guest/messages'), token);
    expect(latest.body.hasMore).toBe(true); expect(latest.body.data).toHaveLength(100); expect(latest.body.data[99].content).toBe('104');
    const older = await guest(request(app).get(`/api/chat/guest/messages?before=${latest.body.data[0]._id}`), token);
    expect(older.body.hasMore).toBe(false); expect(older.body.data).toHaveLength(5);
    expect((await guest(request(app).get('/api/chat/guest/messages?before=invalid'), token)).statusCode).toBe(400);
  });

  test('Chuyển dữ liệu cũ không mất lịch sử; chạy lại không trùng; đổi tên nhóm vẫn giữ quyền', async () => {
    const oldGroup = await PermissionGroup.create({ name: 'Chăm sóc khách hàng', permissions: ['chat.support'] });
    const user = await User.create({ displayName: 'Khách cũ', email: 'legacy@example.com', phoneNumber: '0912345678', password: 'test12345' });
    await ChatMessage.create({ conversationId: String(user._id), senderId: user._id, senderRole: 'customer', content: 'Lịch sử cũ' });
    await migrateChat(); await migrateChat();
    expect(await ChatConversation.countDocuments()).toBe(1); expect(await ChatMessage.countDocuments()).toBe(1);
    expect((await ChatConversation.findById(user._id)).lastMessage).toBe('Lịch sử cũ');
    expect((await PermissionGroup.findById(oldGroup._id)).code).toBe('customer_support');
    await PermissionGroup.updateOne({ _id: oldGroup._id }, { name: 'CSKH đổi tên' }); await migrateChat();
    expect(await PermissionGroup.countDocuments()).toBe(1);
    const agent = await Admin.create({ name: 'Nhân viên', email: 'legacy-staff@example.com', password: 'test12345', groupIds: [oldGroup._id] });
    const token = jwt.sign({ id: String(agent._id), role: 'staff' }, process.env.JWT_ACCESS_SECRET);
    expect((await auth(request(app).get('/api/chat'), token)).statusCode).toBe(200);
    expect((await auth(request(app).get('/api/auth/me'), token)).body.user.groupIds[0].code).toBe('customer_support');
  });
});
