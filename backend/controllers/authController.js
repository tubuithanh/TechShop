const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Otp = require('../models/Otp');
const asyncHandler = require('../utils/asyncHandler');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const { sendOtp } = require('../utils/sendOtp');
const { buildAuthUrl, exchangeCodeForToken, fetchZaloProfile } = require('../utils/zaloAuth');

const OTP_EXPIRES_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

function getPasswordStrength(password) {
  if (!password || password.length < 6) return { valid: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' };
  return { valid: true };
}

// ================== ĐĂNG KÝ KHÁCH HÀNG (collection: users) ==================

const requestRegisterOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });

  const existed = await User.findOne({ email: email.toLowerCase() });
  if (existed) return res.status(409).json({ message: 'Email đã được sử dụng' });

  await Otp.deleteMany({ email: email.toLowerCase(), purpose: 'register' });
  const code = Otp.generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await Otp.create({
    email: email.toLowerCase(),
    codeHash,
    purpose: 'register',
    expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000)
  });
  await sendOtp(email, code, 'register');

  res.json({
    message: `Mã OTP đã được gửi tới ${email} (có hiệu lực ${OTP_EXPIRES_MINUTES} phút)`,
    devOtpPreview: process.env.NODE_ENV !== 'production' ? code : undefined
  });
});

const verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const otp = await Otp.findOne({ email: email?.toLowerCase(), purpose: 'register' }).sort({ createdAt: -1 });

  if (!otp) return res.status(400).json({ message: 'Không tìm thấy mã OTP, vui lòng yêu cầu gửi lại' });
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ message: 'Bạn đã nhập sai quá nhiều lần, vui lòng yêu cầu gửi lại mã mới' });
  }
  const isMatch = await otp.compareCode(code || '');
  if (!isMatch) {
    otp.attempts += 1;
    await otp.save();
    return res.status(400).json({ message: 'Mã OTP không đúng' });
  }
  otp.verified = true;
  await otp.save();
  res.json({ message: 'Xác thực OTP thành công, vui lòng hoàn tất đăng ký' });
});

const register = asyncHandler(async (req, res) => {
  const { displayName, email, phoneNumber, password, acceptTerms } = req.body;

  if (!displayName || !email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email, mật khẩu' });
  }
  if (!acceptTerms) {
    return res.status(400).json({ message: 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật' });
  }
  const strength = getPasswordStrength(password);
  if (!strength.valid) return res.status(400).json({ message: strength.message });

  const existed = await User.findOne({ email: email.toLowerCase() });
  if (existed) return res.status(409).json({ message: 'Email đã được sử dụng' });

  const verifiedOtp = await Otp.findOne({ email: email.toLowerCase(), purpose: 'register', verified: true }).sort({
    createdAt: -1
  });
  if (!verifiedOtp) return res.status(400).json({ message: 'Vui lòng xác thực OTP trước khi đăng ký' });

  const user = await User.create({
    displayName,
    email,
    phoneNumber,
    password,
    isEmailVerified: true,
    termsAcceptedAt: new Date()
  });
  await Otp.deleteMany({ email: email.toLowerCase(), purpose: 'register' });

  const accessToken = generateAccessToken({ _id: user._id, role: 'customer' });
  const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer' });
  res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

  res.status(201).json({ message: 'Đăng ký thành công', user: user.toSafeObject(), accessToken });
});

// ================== ĐĂNG NHẬP (thử User trước, nếu không có thì thử Admin) ==================

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });

  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (user) {
    if (!user.isActive) return res.status(401).json({ message: 'Tài khoản đã bị khóa' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });

    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = generateAccessToken({ _id: user._id, role: 'customer' });
    const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer' });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json({ message: 'Đăng nhập thành công', user: user.toSafeObject(), accessToken });
  }

  const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
  if (admin) {
    if (!admin.isActive) return res.status(401).json({ message: 'Tài khoản đã bị khóa' });
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });

    admin.lastLoginAt = new Date();
    await admin.save();

    const accessToken = generateAccessToken({ _id: admin._id, role: admin.role });
    const refreshToken = generateRefreshToken({ _id: admin._id, role: admin.role });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json({ message: 'Đăng nhập thành công', user: admin.toSafeObject(), accessToken });
  }

  return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
});

// ================== ĐĂNG NHẬP BẰNG ZALO (OAuth 2.0 + PKCE) ==================

const zaloLoginRedirect = asyncHandler(async (req, res) => {
  if (!process.env.ZALO_APP_ID || !process.env.ZALO_REDIRECT_URI) {
    return res.status(500).json({ message: 'Đăng nhập Zalo chưa được cấu hình (thiếu ZALO_APP_ID/ZALO_REDIRECT_URI)' });
  }
  const url = buildAuthUrl({ appId: process.env.ZALO_APP_ID, redirectUri: process.env.ZALO_REDIRECT_URI });
  res.redirect(url);
});

const zaloCallback = asyncHandler(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(`${clientUrl}/login?error=zalo_failed`);
  }

  try {
    const tokenData = await exchangeCodeForToken({
      appId: process.env.ZALO_APP_ID,
      appSecret: process.env.ZALO_APP_SECRET,
      code,
      codeVerifier: state
    });
    const profile = await fetchZaloProfile(tokenData.access_token);

    let user = await User.findOne({ zaloId: profile.id });
    if (!user) {
      // Zalo Social API mặc định không trả về email, nên tạo email "giả" duy nhất để thỏa schema
      // (không dùng để liên hệ/gửi mail) - tài khoản này chỉ đăng nhập lại được qua Zalo.
      user = await User.create({
        displayName: profile.name || 'Người dùng Zalo',
        email: `zalo${profile.id}@zalo.techshop.local`,
        avatar: profile.picture?.data?.url || '',
        zaloId: profile.id,
        password: crypto.randomBytes(24).toString('hex'),
        termsAcceptedAt: new Date()
      });
    }
    if (!user.isActive) {
      return res.redirect(`${clientUrl}/login?error=account_locked`);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer' });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    // Không thể trả JSON trực tiếp vì đây là điều hướng cả trang (Zalo redirect trình duyệt, không
    // phải gọi API bằng axios) - dùng cookie refreshToken vừa set để trang chủ tự khôi phục phiên
    // đăng nhập qua flow "/auth/refresh" đã có sẵn khi App.jsx load lại.
    res.redirect(clientUrl);
  } catch (err) {
    console.error('Lỗi đăng nhập Zalo:', err.message);
    res.redirect(`${clientUrl}/login?error=zalo_failed`);
  }
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ message: 'Không tìm thấy refresh token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    let account, role;
    if (decoded.role === 'customer') {
      account = await User.findById(decoded.id);
      role = 'customer';
    } else {
      account = await Admin.findById(decoded.id);
      role = account?.role;
    }
    if (!account || !account.isActive) return res.status(401).json({ message: 'Tài khoản không hợp lệ' });

    const accessToken = generateAccessToken({ _id: account._id, role });
    res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
  }
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Đăng xuất thành công' });
});

const getMe = asyncHandler(async (req, res) => {
  res.json({ user: req.account.toSafeObject() });
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const Model = req.accountRole === 'customer' ? User : Admin;
  const account = await Model.findById(req.account._id).select('+password');

  const isMatch = await account.comparePassword(oldPassword);
  if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });

  const strength = getPasswordStrength(newPassword);
  if (!strength.valid) return res.status(400).json({ message: strength.message });

  account.password = newPassword;
  await account.save();
  res.json({ message: 'Đổi mật khẩu thành công' });
});

module.exports = {
  requestRegisterOtp,
  verifyRegisterOtp,
  register,
  login,
  zaloLoginRedirect,
  zaloCallback,
  refresh,
  logout,
  getMe,
  changePassword
};
