const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Otp = require('../models/Otp');
const asyncHandler = require('../utils/asyncHandler');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const { sendOtp } = require('../utils/sendOtp');
const { isMailConfigured } = require('../utils/mailer');
const Setting = require('../models/Setting');
const { buildAuthUrl, exchangeCodeForToken } = require('../utils/zaloAuth');
const {
  normalizeName,
  validateName,
  normalizePhone,
  validatePhone,
  validatePassword,
  normalizeAddresses
} = require('../utils/customerValidation');

const OTP_EXPIRES_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

// Frontend/backend triển khai trên 2 domain khác nhau (VD: Render) là cross-site, nên cookie phải
// dùng sameSite: 'none' + secure: true mới được trình duyệt gửi kèm ở request cross-origin. Lúc dev
// local (cùng origin qua Vite proxy) vẫn cần sameSite: 'lax' vì 'none' bắt buộc https (secure).
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

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
  // Cũng kiểm tra trùng với collection "admins" - tránh gửi OTP đăng ký cho email của 1 admin thật.
  const existedAdmin = await Admin.findOne({ email: email.toLowerCase() });
  if (existedAdmin) return res.status(409).json({ message: 'Email đã được sử dụng' });

  await Otp.deleteMany({ email: email.toLowerCase(), purpose: 'register' });
  const code = Otp.generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await Otp.create({
    email: email.toLowerCase(),
    codeHash,
    purpose: 'register',
    expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000)
  });
  try {
    const setting = await Setting.findOne().select('siteName').lean();
    await sendOtp(email, code, 'register', { expiresMinutes: OTP_EXPIRES_MINUTES, shopName: setting?.siteName || 'TechShop' });
  } catch (err) {
    // Gửi email thất bại: xóa mã vừa tạo và báo lỗi rõ ràng (không để khách chờ một email không bao giờ tới)
    console.error('[OTP] Gửi email thất bại:', err.message);
    await Otp.deleteMany({ email: email.toLowerCase(), purpose: 'register' });
    return res.status(502).json({ message: 'Không gửi được email xác thực, vui lòng thử lại sau ít phút' });
  }

  res.json({
    message: `Mã OTP đã được gửi tới ${email} (có hiệu lực ${OTP_EXPIRES_MINUTES} phút)`,
    // Hiện mã ngay trên màn hình khi CHƯA cấu hình gửi email (chế độ demo - nếu không, không ai đăng ký
    // được) hoặc khi chạy ở máy lập trình. Đã cấu hình email ở production thì chỉ gửi qua email.
    devOtpPreview: !(await isMailConfigured()) || process.env.NODE_ENV !== 'production' ? code : undefined
  });
});

const verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const otp = await Otp.findOne({ email: email?.toLowerCase(), purpose: 'register' }).sort({ createdAt: -1 });

  if (!otp) return res.status(400).json({ message: 'Không tìm thấy mã OTP, vui lòng yêu cầu gửi lại' });
  // Trước đây chỉ dựa vào TTL index của MongoDB (quét nền, không chạy đúng ngay tại thời điểm hết
  // hạn) để tự xoá OTP hết hạn - kiểm tra tường minh tại đây để đảm bảo hạn dùng được áp dụng NGAY,
  // không có khoảng hở vài chục giây giữa lúc hết hạn và lúc MongoDB thực sự quét xoá.
  if (otp.expiresAt < new Date()) {
    return res.status(400).json({ message: 'Mã OTP đã hết hạn, vui lòng yêu cầu gửi lại' });
  }
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
  const { email, password, confirmPassword, acceptTerms } = req.body;

  if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });
  // Kiểm tra đầy đủ ở backend (giao diện cũng kiểm tra, nhưng request có thể gửi thẳng tới API)
  const fieldError =
    validateName(req.body.displayName) ||
    validatePhone(req.body.phoneNumber) ||
    validatePassword(password) ||
    (confirmPassword !== undefined && confirmPassword !== password ? 'Mật khẩu nhập lại không khớp' : null);
  if (fieldError) return res.status(400).json({ message: fieldError });
  if (!acceptTerms) {
    return res.status(400).json({ message: 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật' });
  }
  const { addresses, error: addressError } = normalizeAddresses(req.body.addresses);
  if (addressError) return res.status(400).json({ message: addressError });

  const displayName = normalizeName(req.body.displayName);
  const phoneNumber = normalizePhone(req.body.phoneNumber);
  // Mỗi số điện thoại chỉ gắn với 1 tài khoản (dùng để gọi xác nhận đơn, tra cứu bảo hành)
  if (await User.exists({ phoneNumber })) {
    return res.status(409).json({ message: 'Số điện thoại đã được sử dụng cho tài khoản khác' });
  }

  const existed = await User.findOne({ email: email.toLowerCase() });
  if (existed) return res.status(409).json({ message: 'Email đã được sử dụng' });
  // Cũng phải kiểm tra trùng với collection "admins" - nếu không, ai đó có thể tự đăng ký tài khoản
  // khách hàng bằng đúng email của 1 admin thật, khiến admin đó gặp khó khăn khi đăng nhập lại
  // (login() phải thử cả 2 collection - xem sửa đổi ở login() bên dưới để phòng vệ thêm 1 lớp nữa).
  const existedAdmin = await Admin.findOne({ email: email.toLowerCase() });
  if (existedAdmin) return res.status(409).json({ message: 'Email đã được sử dụng' });

  const verifiedOtp = await Otp.findOne({ email: email.toLowerCase(), purpose: 'register', verified: true }).sort({
    createdAt: -1
  });
  if (!verifiedOtp) return res.status(400).json({ message: 'Vui lòng xác thực OTP trước khi đăng ký' });

  const user = await User.create({
    displayName,
    email,
    phoneNumber,
    password,
    addresses,
    isEmailVerified: true,
    termsAcceptedAt: new Date()
  });
  await Otp.deleteMany({ email: email.toLowerCase(), purpose: 'register' });

  const accessToken = generateAccessToken({ _id: user._id, role: 'customer' });
  const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer' });
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

  res.status(201).json({ message: 'Đăng ký thành công', user: user.toSafeObject(), accessToken });
});

// ================== ĐĂNG NHẬP (thử User trước, nếu không có thì thử Admin) ==================

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });

  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (user && user.isActive) {
    const isMatch = await user.comparePassword(password);
    if (isMatch) {
      user.lastLoginAt = new Date();
      await user.save();

      const accessToken = generateAccessToken({ _id: user._id, role: 'customer' });
      const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer' });
      res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
      return res.json({ message: 'Đăng nhập thành công', user: user.toSafeObject(), accessToken });
    }
  }

  // Email không khớp (hoặc sai mật khẩu/bị khóa) ở collection "users" - THỬ TIẾP collection
  // "admins" thay vì dừng lại ngay ở trên. Trước đây chỉ cần tìm thấy email ở "users" là dừng luôn
  // (kể cả khi sai mật khẩu), nên nếu ai đó tự đăng ký tài khoản khách hàng trùng email với 1 admin
  // thật, admin đó sẽ không bao giờ đăng nhập được nữa dù nhập đúng mật khẩu admin của mình.
  const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
  if (admin && admin.isActive) {
    const isMatch = await admin.comparePassword(password);
    if (isMatch) {
      admin.lastLoginAt = new Date();
      await admin.save();

      const accessToken = generateAccessToken({ _id: admin._id, role: admin.role });
      const refreshToken = generateRefreshToken({ _id: admin._id, role: admin.role });
      res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
      // Nạp sẵn permissions của các nhóm quyền (giống hệt protect() cho các request sau) - để
      // Frontend có ngay danh sách quyền để lọc menu/route NGAY SAU KHI đăng nhập, không phải đợi
      // tới lần gọi /auth/me hoặc /auth/refresh kế tiếp mới có (tránh 1 khoảng hở hiển thị sai).
      await admin.populate('groupIds', 'name permissions');
      await admin.populate('storeId', 'name city');
      return res.json({ message: 'Đăng nhập thành công', user: admin.toSafeObject(), accessToken });
    }
  }

  if ((user && !user.isActive) || (admin && !admin.isActive)) {
    return res.status(401).json({ message: 'Tài khoản đã bị khóa' });
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

    // KHÔNG gọi lấy hồ sơ (graph.zalo.me) ngay tại đây - Zalo chặn trả về thông tin cá nhân nếu
    // request xuất phát từ server đặt ngoài Việt Nam (VD: Render). Thay vào đó, chuyển access_token
    // cho trình duyệt của chính người dùng để TRÌNH DUYỆT tự gọi Zalo (mang đúng IP thật của họ) -
    // xem zaloComplete() bên dưới, được gọi từ trang ZaloFinishPage ở frontend.
    //
    // access_token KHÔNG được gửi thẳng - nó được BỌC trong 1 JWT ký bởi chính server (hết hạn sau 3
    // phút). Đây là bằng chứng KHÔNG THỂ GIẢ MẠO rằng zaloComplete() đang được gọi ngay sau một lượt
    // đổi code->token THẬT với Zalo vừa xảy ra, chặn kiểu tấn công "POST thẳng { id, name, picture }
    // vào /api/auth/zalo/complete mà chưa từng đăng nhập Zalo" để chiếm đoạt tài khoản của người khác.
    // Đặt sau dấu "#" (URL fragment) vì phần này KHÔNG được trình duyệt gửi lên server ở bất kỳ
    // request nào tiếp theo, giảm rủi ro lọt vào access log.
    const zaloSession = jwt.sign({ zaloAccessToken: tokenData.access_token }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: '3m'
    });
    res.redirect(`${clientUrl}/zalo-finish#session=${encodeURIComponent(zaloSession)}`);
  } catch (err) {
    console.error('Lỗi đăng nhập Zalo:', err.message);
    res.redirect(`${clientUrl}/login?error=zalo_failed`);
  }
});

// @route POST /api/auth/zalo/complete - nhận hồ sơ Zalo mà FRONTEND đã tự lấy trực tiếp từ
// graph.zalo.me (bằng chính IP trình duyệt người dùng), hoàn tất tạo/tìm user và đăng nhập.
const zaloComplete = asyncHandler(async (req, res) => {
  const { id, name, picture, session } = req.body;

  // Bắt buộc "session" hợp lệ (JWT do chính backend ký ở zaloCallback ngay sau khi đổi code lấy
  // access_token THẬT với Zalo) - chứng minh request bắt nguồn từ một lượt đăng nhập Zalo vừa hoàn
  // tất, không phải một request giả mạo tự chế { id, name, picture } gửi thẳng tới endpoint này.
  try {
    jwt.verify(session, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Phiên đăng nhập Zalo không hợp lệ hoặc đã hết hạn' });
  }

  // "id" phải là chuỗi (không phải object) - chặn NoSQL injection kiểu gửi { "$ne": null } khiến
  // truy vấn Mongo bên dưới khớp với BẤT KỲ user nào đã liên kết Zalo thay vì đúng 1 user.
  if (typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ message: 'Thiếu thông tin định danh Zalo' });
  }

  const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'Người dùng Zalo';
  const safeAvatar = typeof picture?.data?.url === 'string' ? picture.data.url : '';

  let user = await User.findOne({ zaloId: id });
  if (!user) {
    // Zalo Social API mặc định không trả về email, nên tạo email "giả" duy nhất để thỏa schema
    // (không dùng để liên hệ/gửi mail) - tài khoản này chỉ đăng nhập lại được qua Zalo.
    user = await User.create({
      displayName: safeName,
      email: `zalo${id}@zalo.techshop.local`,
      avatar: safeAvatar,
      zaloId: id,
      password: crypto.randomBytes(24).toString('hex'),
      termsAcceptedAt: new Date()
    });
  }
  if (!user.isActive) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = generateAccessToken({ _id: user._id, role: 'customer' });
  const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer' });
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({ message: 'Đăng nhập thành công', user: user.toSafeObject(), accessToken });
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

  // Khách hàng áp quy tắc mật khẩu mới (8 ký tự, có chữ và số); tài khoản quản trị giữ quy tắc cũ
  const passwordError = req.accountRole === 'customer' ? validatePassword(newPassword) : getPasswordStrength(newPassword).message;
  if (passwordError) return res.status(400).json({ message: passwordError });

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
  zaloComplete,
  refresh,
  logout,
  getMe,
  changePassword
};
