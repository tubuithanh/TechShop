const crypto = require('crypto');

// Mã hóa bí mật (mật khẩu SMTP, API key) trước khi lưu database - AES-256-GCM (vừa mã hóa vừa chống sửa).
// Khóa lấy từ biến môi trường SETTINGS_SECRET (nên đặt riêng); chưa có thì tạm dùng JWT_ACCESS_SECRET.
// Lưu ý: đổi khóa thì các bí mật đã lưu không giải mã được nữa -> admin cần nhập lại.
function keySource() {
  return process.env.SETTINGS_SECRET ? 'SETTINGS_SECRET' : process.env.JWT_ACCESS_SECRET ? 'JWT_ACCESS_SECRET' : null;
}
function getKey() {
  const source = keySource();
  if (!source) throw new Error('Chưa cấu hình SETTINGS_SECRET trên máy chủ, không thể lưu bí mật');
  return crypto.createHash('sha256').update(String(process.env[source])).digest();
}

// -> "v1:<iv>:<tag>:<dữ liệu>" (base64)
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

// Trả về null nếu không giải mã được (sai khóa / dữ liệu hỏng) - nơi gọi coi như chưa có bí mật
function decrypt(box) {
  if (!box) return null;
  try {
    const [version, iv, tag, data] = String(box).split(':');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt, keySource };
