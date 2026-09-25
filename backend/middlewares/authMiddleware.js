const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

// Middleware xác thực: yêu cầu có access token hợp lệ
// Hỗ trợ 2 collection riêng biệt (users / admins) theo đúng thiết kế database mới.
// Sau khi xác thực, gắn req.account (bản ghi User hoặc Admin) và req.accountRole
// ('customer' | 'staff' | 'admin') để middleware/controller phía sau dùng thống nhất.
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Chưa đăng nhập hoặc thiếu token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    let account;
    if (decoded.role === 'customer') {
      account = await User.findById(decoded.id);
    } else if (decoded.role === 'staff') {
      // Nạp sẵn quyền của các nhóm mà staff này thuộc về - để middleware `can()` bên dưới kiểm tra
      // ngay trong bộ nhớ (không phải query DB lại ở mỗi route riêng lẻ).
      account = await Admin.findById(decoded.id).populate('groupIds', 'name permissions');
    } else {
      account = await Admin.findById(decoded.id);
    }

    if (!account || !account.isActive) {
      return res.status(401).json({ message: 'Tài khoản không hợp lệ hoặc đã bị khóa' });
    }

    req.account = account;
    req.accountRole = decoded.role; // 'customer' | 'staff' | 'admin'
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// Middleware phân quyền theo vai trò
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.accountRole || !roles.includes(req.accountRole)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
  };
};

// Middleware phân quyền CHI TIẾT theo permission key (VD: 'orders.manage') - dùng cho các thao tác
// quản trị mà staff có thể được cấp quyền riêng lẻ, khác với authorize() vốn chỉ phân theo vai trò
// cố định (admin/staff). Admin LUÔN được đi qua (toàn quyền), không cần gán nhóm quyền nào.
const can = (permission) => {
  return (req, res, next) => {
    if (req.accountRole === 'admin') return next();
    if (req.accountRole !== 'staff') {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    const groups = req.account.groupIds || [];
    const hasPermission = groups.some((g) => g.permissions?.includes(permission));
    if (!hasPermission) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này (thiếu quyền: ' + permission + ')' });
    }
    next();
  };
};

module.exports = { protect, authorize, can };
