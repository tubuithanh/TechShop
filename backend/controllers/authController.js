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
const { sendPasswordResetCode, sendChangeEmailCode } = require('../utils/notifyEmail');
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

  const accessToken = generateAccessToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });
  const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });
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

      const accessToken = generateAccessToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });
      const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });
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

      const accessToken = generateAccessToken({ _id: admin._id, role: admin.role, tokenVersion: admin.tokenVersion });
      const refreshToken = generateRefreshToken({ _id: admin._id, role: admin.role, tokenVersion: admin.tokenVersion });
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

  const accessToken = generateAccessToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });
  const refreshToken = generateRefreshToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });
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
    if ((decoded.tv || 0) !== (account.tokenVersion || 0)) return res.status(401).json({ message: 'Phiên đăng nhập đã hết hiệu lực (mật khẩu vừa được thay đổi), vui lòng đăng nhập lại' });

    const accessToken = generateAccessToken({ _id: account._id, role, tokenVersion: account.tokenVersion });
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
  // Đăng xuất mọi thiết bị khác (token cũ hết hiệu lực); thiết bị đang thao tác nhận token mới để ở lại
  account.tokenVersion = (account.tokenVersion || 0) + 1;
  await account.save();
  const role = req.accountRole;
  res.cookie('refreshToken', generateRefreshToken({ _id: account._id, role, tokenVersion: account.tokenVersion }), REFRESH_COOKIE_OPTIONS);
  res.json({
    message: 'Đổi mật khẩu thành công. Các thiết bị khác đã được đăng xuất.',
    accessToken: generateAccessToken({ _id: account._id, role, tokenVersion: account.tokenVersion })
  });
});

// ================== QUÊN MẬT KHẨU (khách hàng) ==================

// Thông báo CHUNG cho mọi trường hợp (email có hay không có tài khoản) - không để người khác dùng form này
// dò xem email nào đã đăng ký.
const RESET_GENERIC_MESSAGE = 'Nếu email này đã đăng ký tài khoản, mã đặt lại mật khẩu đã được gửi tới hộp thư (có hiệu lực 5 phút).';

// @route POST /api/auth/password/request-otp { email }
const requestPasswordReset = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Vui lòng nhập email hợp lệ' });

  const user = await User.findOne({ email, isActive: true }).select('_id').lean();
  if (!user) return res.json({ message: RESET_GENERIC_MESSAGE });

  await Otp.deleteMany({ email, purpose: 'reset_password' });
  const code = Otp.generateCode();
  await Otp.create({
    email,
    codeHash: await bcrypt.hash(code, 10),
    purpose: 'reset_password',
    expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000)
  });
  try {
    await sendPasswordResetCode(email, code, { expiresMinutes: OTP_EXPIRES_MINUTES });
  } catch (err) {
    console.error('[RESET] Gửi email thất bại:', err.message);
    await Otp.deleteMany({ email, purpose: 'reset_password' });
    return res.status(502).json({ message: 'Không gửi được email, vui lòng thử lại sau ít phút' });
  }
  res.json({
    message: RESET_GENERIC_MESSAGE,
    // Giống đăng ký: chưa cấu hình gửi email (chế độ demo) hoặc chạy ở máy lập trình thì hiện mã trên màn hình
    devOtpPreview: !(await isMailConfigured()) || process.env.NODE_ENV !== 'production' ? code : undefined
  });
});

// @route POST /api/auth/password/reset { email, code, newPassword, confirmPassword }
const resetPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { code, newPassword, confirmPassword } = req.body;
  const otp = await Otp.findOne({ email, purpose: 'reset_password' }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) {
    return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn, vui lòng yêu cầu mã mới' });
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ message: 'Bạn đã nhập sai quá nhiều lần, vui lòng yêu cầu mã mới' });
  }
  if (!(await otp.compareCode(String(code || '')))) {
    otp.attempts += 1;
    await otp.save();
    return res.status(400).json({ message: 'Mã xác thực không đúng' });
  }
  const passwordError =
    validatePassword(newPassword) || (confirmPassword !== undefined && confirmPassword !== newPassword ? 'Mật khẩu nhập lại không khớp' : null);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const user = await User.findOne({ email, isActive: true });
  if (!user) return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn, vui lòng yêu cầu mã mới' });
  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // đăng xuất mọi thiết bị đang dùng mật khẩu cũ
  await user.save();
  await Otp.deleteMany({ email, purpose: 'reset_password' }); // mã chỉ dùng được một lần
  res.json({ message: 'Đặt lại mật khẩu thành công, vui lòng đăng nhập bằng mật khẩu mới' });
});

// ================== ĐỔI EMAIL (khách hàng đã đăng nhập) ==================
// Tài khoản Zalo đang dùng email tạm -> không cần mật khẩu (chưa từng đặt). Tài khoản thường -> phải nhập mật
// khẩu hiện tại (lấy được phiên đăng nhập cũng không chiếm được tài khoản). Luôn xác thực bằng mã gửi tới
// email MỚI để chắc chắn email đó là của khách.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @route POST /api/auth/email/request-otp { email, currentPassword? }
const requestEmailChange = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chức năng dành cho khách hàng' });
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ message: 'Vui lòng nhập email hợp lệ' });
  if (User.isPlaceholderEmail(email)) return res.status(400).json({ message: 'Email không hợp lệ' });

  const user = await User.findById(req.account._id).select('+password');
  if (email === user.email) return res.status(400).json({ message: 'Đây là email hiện tại của bạn' });
  if (!User.isPlaceholderEmail(user.email)) {
    const ok = typeof req.body.currentPassword === 'string' && (await user.comparePassword(req.body.currentPassword));
    if (!ok) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
  }
  if (await User.exists({ email, _id: { $ne: user._id } })) {
    return res.status(409).json({ message: 'Email này đã được dùng cho tài khoản khác' });
  }

  await Otp.deleteMany({ userId: user._id, purpose: 'change_email' });
  const code = Otp.generateCode();
  await Otp.create({
    email,
    userId: user._id,
    codeHash: await bcrypt.hash(code, 10),
    purpose: 'change_email',
    expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000)
  });
  try {
    await sendChangeEmailCode(email, code, { expiresMinutes: OTP_EXPIRES_MINUTES });
  } catch (err) {
    console.error('[CHANGE-EMAIL] Gửi email thất bại:', err.message);
    await Otp.deleteMany({ userId: user._id, purpose: 'change_email' });
    return res.status(502).json({ message: 'Không gửi được email, vui lòng kiểm tra lại địa chỉ hoặc thử lại sau' });
  }
  res.json({
    message: `Đã gửi mã xác nhận tới ${email} (có hiệu lực ${OTP_EXPIRES_MINUTES} phút)`,
    devOtpPreview: !(await isMailConfigured()) || process.env.NODE_ENV !== 'production' ? code : undefined
  });
});

// @route POST /api/auth/email/verify { email, code }
const verifyEmailChange = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chức năng dành cho khách hàng' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = await Otp.findOne({ userId: req.account._id, email, purpose: 'change_email' }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) {
    return res.status(400).json({ message: 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng yêu cầu mã mới' });
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ message: 'Bạn đã nhập sai quá nhiều lần, vui lòng yêu cầu mã mới' });
  }
  if (!(await otp.compareCode(String(req.body.code || '')))) {
    otp.attempts += 1;
    await otp.save();
    return res.status(400).json({ message: 'Mã xác nhận không đúng' });
  }
  // Kiểm tra lại: trong lúc chờ mã, email có thể đã bị tài khoản khác đăng ký
  if (await User.exists({ email, _id: { $ne: req.account._id } })) {
    await Otp.deleteMany({ userId: req.account._id, purpose: 'change_email' });
    return res.status(409).json({ message: 'Email này đã được dùng cho tài khoản khác' });
  }
  const user = await User.findById(req.account._id);
  user.email = email;
  await user.save();
  await Otp.deleteMany({ userId: user._id, purpose: 'change_email' });
  res.json({ message: 'Đã cập nhật email thành công', user: user.toSafeObject() });
});

module.exports = {
  requestEmailChange,
  verifyEmailChange,
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
  changePassword,
  requestPasswordReset,
  resetPassword
};
