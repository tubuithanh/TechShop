const { cloudinaryConfig } = require('../controllers/uploadController');

describe('Cấu hình Cloudinary', () => {
  test('TC-121: Đọc CLOUDINARY_URL (dòng Cloudinary cung cấp) hoặc 3 biến riêng; chuỗi còn chỗ giữ chỗ coi như chưa cấu hình', () => {
    expect(cloudinaryConfig({ CLOUDINARY_URL: 'cloudinary://123456789012345:AbC-dEf_123@szzrzozn' })).toEqual({
      apiKey: '123456789012345',
      apiSecret: 'AbC-dEf_123',
      cloudName: 'szzrzozn'
    });
    // Còn "<your_api_key>" như mẫu trên Dashboard -> chưa cấu hình
    expect(cloudinaryConfig({ CLOUDINARY_URL: 'cloudinary://<your_api_key>:<your_api_secret>@szzrzozn' })).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_URL: 'khong-hop-le' })).toBeNull();
    // 3 biến riêng (cách cũ) vẫn dùng được
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' })).toEqual({
      cloudName: 'demo',
      apiKey: 'k',
      apiSecret: 's'
    });
    expect(cloudinaryConfig({})).toBeNull();
  });
});
