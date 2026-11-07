// Isolated manual UI verification: never reads .env and never connects to application data.
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.JWT_ACCESS_SECRET = 'isolated-chat-preview-access';
process.env.JWT_REFRESH_SECRET = 'isolated-chat-preview-refresh';
process.env.CLIENT_URL = 'http://127.0.0.1:5178';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Server } = require('socket.io');
const http = require('http');
const app = require('../app');
const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const { migrateChat } = require('../utils/migrateChat');
const socketAuth = require('../middlewares/socketAuth');
const { registerChatSockets } = require('../services/chatSupport');

(async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await migrateChat();
  await Promise.all([ChatConversation.init(), ChatMessage.init()]);
  const group = await PermissionGroup.findOne({ code: 'customer_support' });
  await Admin.create({ name: 'Nhân viên QA', email: 'support@chat.test', password: 'qa123456', groupIds: [group._id] });
  await Admin.create({ name: 'Admin QA', email: 'admin@chat.test', password: 'qa123456', role: 'admin' });
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: process.env.CLIENT_URL, credentials: true } });
  io.use(socketAuth); registerChatSockets(io); app.set('io', io);
  server.listen(5098, '127.0.0.1', () => console.log('Isolated chat preview: http://127.0.0.1:5098/api'));
  const stop = async () => { await io.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch((err) => { console.error(err.message); process.exit(1); });
