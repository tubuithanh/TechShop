require('./setup');
const http = require('http');
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const app = require('../app');
const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const socketAuth = require('../middlewares/socketAuth');
const { registerChatSockets } = require('../services/chatSupport');

let server, io, origin;
const sockets = [];
const waitFor = (socket, event) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timeout: ${event}`)); }, 4000);
  const listener = (value) => { clearTimeout(timeout); resolve(value); };
  socket.once(event, listener);
});
async function connect(auth) {
  const socket = client(origin, { autoConnect: false, auth, transports: ['websocket'], reconnection: false });
  sockets.push(socket); const connected = waitFor(socket, 'connect'); socket.connect(); await connected;
  return socket;
}
async function agent(support = true) {
  let group;
  if (support) group = await PermissionGroup.findOneAndUpdate({ code: 'customer_support' },
    { $setOnInsert: { name: 'Chăm sóc khách hàng', permissions: ['chat.support'] } }, { upsert: true, new: true });
  const account = await Admin.create({ name: 'Agent', email: `${crypto.randomUUID()}@chat.test`, password: 'test12345', groupIds: group ? [group._id] : [] });
  const token = jwt.sign({ id: String(account._id), role: 'staff' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  return { account, token };
}
async function guest() {
  const token = crypto.randomBytes(32).toString('hex');
  const res = await request(app).post('/api/chat/guest/start').set('X-Chat-Token', token).send({ name: 'Khách QA', phone: '0912345678' });
  return { token, id: res.body.data._id };
}
const staffRequest = (r, token) => r.set('Authorization', `Bearer ${token}`);
beforeAll(async () => {
  await Promise.all([ChatConversation.init(), ChatMessage.init()]);
  server = http.createServer(app); io = new Server(server); io.use(socketAuth); registerChatSockets(io); app.set('io', io);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => { sockets.splice(0).forEach((socket) => socket.disconnect()); });
afterAll(async () => { app.set('io', null); await io.close(); });

test('Tin thời gian thực chỉ đến khách của hội thoại và người phụ trách; nhân viên khác chỉ nhận cập nhật hàng chờ', async () => {
  const a = await agent(); const b = await agent(); const first = await guest(); const second = await guest();
  await staffRequest(request(app).post(`/api/chat/${first.id}/claim`), a.token);
  const staffA = await connect({ token: a.token, support: true });
  const staffB = await connect({ token: b.token, support: true });
  const customer = await connect({ chatToken: first.token });
  const unrelated = await connect({ chatToken: second.token });
  const otherMessages = []; const leaked = [];
  staffB.on('chat:message', (m) => otherMessages.push(m)); unrelated.on('chat:message', (m) => leaked.push(m));
  const receive = waitFor(customer, 'chat:message');
  const update = waitFor(staffB, 'chat:changed');
  const response = await staffRequest(request(app).post(`/api/chat/${first.id}/messages`), a.token)
    .send({ content: 'Chào bạn', clientMessageId: crypto.randomUUID() });
  expect(response.statusCode).toBe(201);
  expect((await receive).content).toBe('Chào bạn'); expect((await update).conversationId).toBe(first.id);
  expect(otherMessages).toEqual([]); expect(leaked).toEqual([]);
  const typing = waitFor(staffA, 'chat:typing'); customer.emit('chat:typing', { conversationId: second.id });
  expect((await typing).conversationId).toBe(first.id); // Guest-supplied IDs are ignored.
});

test('Người ngoài nhóm CSKH không kết nối hỗ trợ; socket bị thu hồi quyền bị ngắt trước khi nhận tin', async () => {
  const outside = await agent(false);
  const denied = client(origin, { autoConnect: false, auth: { token: outside.token, support: true }, reconnection: false });
  sockets.push(denied); const rejection = waitFor(denied, 'connect_error'); denied.connect();
  expect((await rejection).message).toContain('Phiên kết nối');
  const a = await agent(); const customer = await guest();
  await staffRequest(request(app).post(`/api/chat/${customer.id}/claim`), a.token);
  const socket = await connect({ token: a.token, support: true });
  const messages = []; socket.on('chat:message', (m) => messages.push(m));
  await Admin.updateOne({ _id: a.account._id }, { groupIds: [] });
  const disconnected = waitFor(socket, 'disconnect');
  await request(app).post('/api/chat/guest/messages').set('X-Chat-Token', customer.token)
    .send({ content: 'Tin riêng', clientMessageId: crypto.randomUUID() });
  await disconnected; expect(messages).toEqual([]);
});

test('Trạng thái trực chỉ tính kết nối có quyền và bật nhận chat', async () => {
  const a = await agent(); const socket = await connect({ token: a.token, support: true });
  expect((await request(app).get('/api/chat/availability')).body.onlineCount).toBe(0);
  await new Promise((resolve) => socket.emit('chat:availability', true, resolve));
  expect((await request(app).get('/api/chat/availability')).body.onlineCount).toBe(1);
  await new Promise((resolve) => socket.emit('chat:availability', false, resolve));
  expect((await request(app).get('/api/chat/availability')).body.onlineCount).toBe(0);
});

test('Đóng chat và đánh giá cập nhật tức thời đúng khách/người phụ trách, không lộ nhận xét cho người khác', async () => {
  const owner = await agent(), other = await agent(), session = await guest(), unrelated = await guest();
  await staffRequest(request(app).post(`/api/chat/${session.id}/claim`), owner.token);
  const staffSocket = await connect({ token: owner.token, support: true });
  const otherSocket = await connect({ token: other.token, support: true });
  const customer = await connect({ chatToken: session.token });
  const unrelatedSocket = await connect({ chatToken: unrelated.token });
  const leaks = [];
  otherSocket.on('chat:conversation', (c) => leaks.push(c)); unrelatedSocket.on('chat:conversation', (c) => leaks.push(c));
  const closing = waitFor(customer, 'chat:conversation');
  await staffRequest(request(app).patch(`/api/chat/${session.id}`), owner.token).send({ action: 'close' });
  expect((await closing).status).toBe('closed');
  const customerRating = waitFor(customer, 'chat:conversation'), staffRating = waitFor(staffSocket, 'chat:conversation');
  const changed = waitFor(otherSocket, 'chat:changed');
  const response = await request(app).post('/api/chat/guest/rating').set('X-Chat-Token', session.token).send({ stars: 4, comment: 'Nhận xét riêng' });
  expect(response.status).toBe(200);
  expect((await customerRating).rating.stars).toBe(4);
  expect((await staffRating).rating.comment).toBe('Nhận xét riêng');
  expect(await changed).toEqual({ conversationId: session.id }); expect(leaks).toEqual([]);
});
