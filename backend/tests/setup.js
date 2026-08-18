const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Chạy trước toàn bộ test suite: khởi tạo MongoDB in-memory (không cần cài MongoDB thật)
beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.NODE_ENV = 'test';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Dọn dữ liệu giữa các test để không ảnh hưởng lẫn nhau
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
