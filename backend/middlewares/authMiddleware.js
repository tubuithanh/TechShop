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

module.exports = { protect, authorize };
