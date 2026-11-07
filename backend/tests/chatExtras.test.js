require('./setup');
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const ChatAttachment = require('../models/ChatAttachment');
const guest = (req, token) => req.set('X-Chat-Token', token);
const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5K0AAAAASUVORK5CYII=', 'base64');
async function start() {
  const token = crypto.randomBytes(32).toString('hex');
  const response = await guest(request(app).post('/api/chat/guest/start'), token).send({ name: 'Khách thử', phone: '0912345678' });
  expect(response.status).toBe(201);
  return { token, id: response.body.data._id };
}
async function staff(role = 'staff') {
  const group = await PermissionGroup.findOneAndUpdate({ code: 'customer_support' },
    { $setOnInsert: { name: 'Chăm sóc khách hàng', permissions: ['chat.support'] } }, { upsert: true, new: true });
  const account = await Admin.create({ name: `Nhân viên ${role}`, email: `${crypto.randomUUID()}@chat.test`, password: 'test12345', role, groupIds: [group._id] });
  return { account, token: jwt.sign({ id: String(account._id), role }, process.env.JWT_ACCESS_SECRET) };
}
function upload(token, id = crypto.randomUUID(), data = png, name = 'anh.png', contentType = 'image/png') {
  return guest(request(app).post('/api/chat/guest/attachments'), token).field('clientFileIds', JSON.stringify([id])).attach('files', data, { filename: name, contentType });
}
const send = (token, body) => guest(request(app).post('/api/chat/guest/messages'), token).send({ clientMessageId: crypto.randomUUID(), ...body });
const rate = (token, body) => guest(request(app).post('/api/chat/guest/rating'), token).send(body);
const close = (id, token) => auth(request(app).patch(`/api/chat/${id}`), token).send({ action: 'close' });

describe('Chat: tệp riêng, sticker và đánh giá', () => {
  beforeAll(async () => { await Promise.all([ChatAttachment.init(), ChatConversation.init(), ChatMessage.init()]); });
  test('Upload/gửi lại dùng cùng ID; gửi chỉ tệp; dữ liệu nhị phân không lộ trong lịch sử', async () => {
    const session = await start(), fileId = crypto.randomUUID();
    const first = await upload(session.token, fileId), retry = await upload(session.token, fileId);
    expect(first.status).toBe(201); expect(retry.body.data).toEqual(first.body.data);
    expect(await ChatAttachment.countDocuments()).toBe(1);
    const attachmentId = first.body.data[0].attachmentId, clientMessageId = crypto.randomUUID();
    const body = { attachmentIds: [attachmentId], clientMessageId };
    const message = await send(session.token, body), resent = await send(session.token, body);
    expect(message.status).toBe(201); expect(resent.body.data._id).toBe(message.body.data._id);
    expect(message.body.data.attachments[0]).toEqual({ attachmentId, name: 'anh.png', mimeType: 'image/png', size: png.length });
    expect((await ChatAttachment.findById(attachmentId)).expiresAt).toBeUndefined();
    expect(await ChatMessage.countDocuments()).toBe(1);
    expect((await send(session.token, { attachmentIds: [attachmentId] })).status).toBe(400);
    expect((await upload(session.token, fileId, Buffer.concat([png, Buffer.from('changed')]))).status).toBe(409);
  });
  test('Đúng phiên/người phụ trách mới tải được tệp; bản nháp chỉ chủ upload đọc được', async () => {
    const a = await start(), b = await start(), owner = await staff(), other = await staff(), admin = await staff('admin');
    const attachmentId = (await upload(a.token)).body.data[0].attachmentId;
    const path = `/api/chat/guest/attachments/${attachmentId}`, staffPath = `/api/chat/${a.id}/attachments/${attachmentId}`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await guest(request(app).get(path), b.token)).status).toBe(404);
    expect((await auth(request(app).get(staffPath), admin.token)).status).toBe(404);
    await send(a.token, { attachmentIds: [attachmentId] });
    await auth(request(app).post(`/api/chat/${a.id}/claim`), owner.token);
    const file = await guest(request(app).get(path), a.token);
    expect(file.status).toBe(200); expect(file.body).toEqual(png);
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await auth(request(app).get(staffPath), owner.token)).status).toBe(200);
    expect((await auth(request(app).get(staffPath), other.token)).status).toBe(403);
    expect((await auth(request(app).get(staffPath), admin.token)).status).toBe(200);
    expect((await send(b.token, { attachmentIds: [attachmentId] })).status).toBe(400);
    await close(a.id, owner.token);
    expect((await guest(request(app).get(path), a.token)).status).toBe(200);
    expect((await upload(a.token)).status).toBe(409);
    await PermissionGroup.updateOne({ code: 'customer_support' }, { permissions: [] });
    expect((await auth(request(app).get(staffPath), owner.token)).status).toBe(403);
  });
  test('Kiểm tra chữ ký tệp, loại tệp, 5 MB/tệp và 5 tệp; từ chối upload chưa xác thực', async () => {
    const { token } = await start();
    expect((await upload(token, crypto.randomUUID(), Buffer.from('<script>alert(1)</script>'))).status).toBe(400);
    expect((await upload(token, crypto.randomUUID(), png, 'a.pdf', 'application/pdf')).status).toBe(400);
    expect((await upload(token, crypto.randomUUID(), Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]))).status).toBe(400);
    let req = guest(request(app).post('/api/chat/guest/attachments'), token).field('clientFileIds', JSON.stringify(Array.from({ length: 6 }, () => crypto.randomUUID())));
    for (let i = 0; i < 6; i++) req = req.attach('files', png, { filename: `${i}.png`, contentType: 'image/png' });
    expect((await req).status).toBe(400);
    expect((await request(app).post('/api/chat/guest/attachments').attach('files', png, 'x.png')).status).toBe(401);
    expect((await upload(token, crypto.randomUUID(), Buffer.from('%PDF-1.4\n%%EOF'), 'hoa-don.pdf', 'application/pdf')).status).toBe(201);
    expect(await ChatAttachment.countDocuments()).toBe(1);
  });
  test('Nhân viên upload sau tiếp nhận; khách xem tệp từ nhân viên; không lấy nháp của nhau', async () => {
    const session = await start(), agent = await staff();
    const doUpload = () => auth(request(app).post(`/api/chat/${session.id}/attachments`), agent.token)
      .field('clientFileIds', JSON.stringify([crypto.randomUUID()])).attach('files', png, { filename: 'staff.png', contentType: 'image/png' });
    expect((await doUpload()).status).toBe(409);
    await auth(request(app).post(`/api/chat/${session.id}/claim`), agent.token);
    const attachmentId = (await doUpload()).body.data[0].attachmentId;
    expect((await send(session.token, { attachmentIds: [attachmentId] })).status).toBe(400);
    const message = await auth(request(app).post(`/api/chat/${session.id}/messages`), agent.token).send({ attachmentIds: [attachmentId], clientMessageId: crypto.randomUUID() });
    expect(message.status).toBe(201);
    expect((await guest(request(app).get(`/api/chat/guest/attachments/${attachmentId}`), session.token)).body).toEqual(png);
  });
  test('Sticker-only hợp lệ; chống URL tùy ý, tệp lặp và tin trống', async () => {
    const { token, id } = await start();
    expect((await send(token, { stickerId: 'thanks' })).body.data.stickerId).toBe('thanks');
    expect((await ChatConversation.findById(id)).lastMessage).toContain('[Sticker]');
    for (const body of [{}, { stickerId: 'https://evil.test/a.svg' }, { attachmentIds: 'invalid' }, { content: {} }, { attachmentIds: Array(6).fill('123') }]) expect((await send(token, body)).status).toBe(400);
  });
  test('Đánh giá sau kết thúc, đúng phiên, 1–5 sao và nhận xét ≤1000; gửi lại không đổi đánh giá', async () => {
    const session = await start(), other = await start(), agent = await staff();
    expect((await rate(session.token, { stars: 5 })).status).toBe(409);
    await auth(request(app).post(`/api/chat/${session.id}/claim`), agent.token); await close(session.id, agent.token);
    expect((await rate(other.token, { stars: 5, conversationId: session.id })).status).toBe(409);
    for (const body of [{ stars: 0 }, { stars: 6 }, { stars: 2.5 }, { stars: '5' }, { stars: 5, comment: 'x'.repeat(1001) }, { stars: 5, comment: {} }]) expect((await rate(session.token, body)).status).toBe(400);
    const body = { stars: 5, comment: ' Nhân viên nhiệt tình ' };
    const results = await Promise.all([rate(session.token, body), rate(session.token, body)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body.data.rating).toEqual(results[1].body.data.rating);
    expect(results[0].body.data.rating.comment).toBe('Nhân viên nhiệt tình');
    expect((await rate(session.token, { stars: 1 })).status).toBe(409);
    expect((await guest(request(app).get('/api/chat/guest/session'), session.token)).body.data.rating.stars).toBe(5);
    expect((await request(app).post('/api/chat/guest/rating').send(body)).status).toBe(401);
    await ChatConversation.updateOne({ _id: session.id }, { sessionExpiresAt: new Date(0) });
    expect((await rate(session.token, body)).status).toBe(401);
  });
  test('Đánh giá gắn nhân viên lúc đóng, lưu người đóng; lọc/thống kê đúng phạm vi quyền', async () => {
    const a = await start(), b = await start(), c = await start(), owner = await staff(), closer = await staff('admin'), other = await staff();
    await auth(request(app).post(`/api/chat/${a.id}/claim`), owner.token);
    const closed = await close(a.id, closer.token);
    expect(closed.body.data.closedBy.agentId).toBe(String(closer.account._id));
    expect(closed.body.data.agentAtClose.agentId).toBe(String(owner.account._id));
    await rate(a.token, { stars: 5, comment: 'Tốt' });
    await auth(request(app).post(`/api/chat/${b.id}/claim`), other.token); await close(b.id, other.token); await rate(b.token, { stars: 3 });
    await close(c.id, closer.token);
    await Admin.updateOne({ _id: owner.account._id }, { name: 'Tên đã thay đổi' });
    const all = await auth(request(app).get('/api/chat?status=closed'), closer.token);
    expect(all.body.ratingSummary).toEqual({ average: 4, count: 2 });
    const filtered = await auth(request(app).get(`/api/chat?status=closed&agent=${owner.account._id}&stars=5`), closer.token);
    expect(filtered.body.total).toBe(1); expect(filtered.body.ratingSummary).toEqual({ average: 5, count: 1 });
    expect(filtered.body.data[0].agentAtClose.name).toBe(owner.account.name);
    expect((await auth(request(app).get('/api/chat?status=closed'), other.token)).body.ratingSummary).toEqual({ average: 3, count: 1 });
    expect((await auth(request(app).get('/api/chat?status=closed&stars=unrated'), closer.token)).body.total).toBe(1);
    expect((await auth(request(app).get('/api/chat?status=closed&from=2099-01-01T00:00:00Z'), closer.token)).body.total).toBe(0);
    for (const query of ['stars=6', 'agent=bad', 'from=bad', 'from=2099-01-01&to=2000-01-01']) expect((await auth(request(app).get(`/api/chat?status=closed&${query}`), closer.token)).status).toBe(400);
  });
});
