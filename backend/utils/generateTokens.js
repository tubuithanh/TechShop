const jwt = require('jsonwebtoken');

// user: { _id, role, tokenVersion } - tokenVersion để thu hồi token cũ khi đổi mật khẩu; role có thể là 'customer' (collection users) hoặc 'admin'/'staff' (collection admins)
function generateAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion || 0 }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m'
  });
}

function generateRefreshToken(user) {
  return jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion || 0 }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d'
  });
}

module.exports = { generateAccessToken, generateRefreshToken };
