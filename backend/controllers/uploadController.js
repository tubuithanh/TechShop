const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');

// Thư mục lưu ảnh khi KHÔNG cấu hình Cloudinary (chạy local/demo). Lưu ý: trên Render ổ đĩa không bền -
// ảnh lưu kiểu này mất sau mỗi lần deploy/khởi động lại, nên môi trường production cần cấu hình Cloudinary.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const cloudinaryConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Upload có ký (signed upload) qua REST API của Cloudinary - không cần cài SDK
async function uploadToCloudinary(file, folder) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
    .digest('hex');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  form.append('api_key', process.env.CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Upload Cloudinary thất bại');
  return data.secure_url;
}

async function saveLocally(file, req) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.buffer);
  // Sau proxy HTTPS (VD: Render) req.protocol là "http" - lấy giao thức gốc từ header proxy gửi kèm
  const protocol = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${protocol}://${req.get('host')}/uploads/${name}`;
}

// @route POST /api/uploads (multipart, field "images", tối đa 5 ảnh x 5MB) -> { data: { urls: [...] } }
const uploadImages = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ message: 'Chưa chọn ảnh nào' });
  // Phân thư mục theo loại tài khoản cho dễ quản lý trên Cloudinary
  const folder = req.accountRole === 'customer' ? 'techshop/reviews' : 'techshop/products';
  const urls = [];
  for (const file of files) {
    urls.push(cloudinaryConfigured() ? await uploadToCloudinary(file, folder) : await saveLocally(file, req));
  }
  res.status(201).json({ data: { urls } });
});

module.exports = { uploadImages, UPLOAD_DIR, EXT };
