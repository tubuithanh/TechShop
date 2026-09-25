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
      // ngay trong bộ nhớ (không phải query DB lại ở mỗi route riêng lẻ). Nạp thêm tên chi nhánh
      // (storeId) để Frontend hiển thị được, dù bản thân việc so sánh giới hạn chi nhánh (getScopedStoreId)
      // chỉ cần đúng ObjectId, không cần populate.
      account = await Admin.findById(decoded.id)
        .populate('groupIds', 'name permissions')
        .populate('storeId', 'name city');
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

// Kiểm tra quyền CHI TIẾT (VD: 'orders.manage') cho request hiện tại - dùng ở CẢ middleware `can()`
// bên dưới LẪN trực tiếp trong controller, cho các route công khai chấp nhận nhiều loại người dùng
// (VD: "xem đơn hàng" cho phép chủ đơn HOẶC admin HOẶC staff có quyền orders.manage) mà không thể
// diễn đạt chỉ bằng 1 middleware chặn ở đầu route. Admin LUÔN có quyền; staff cần thuộc ít nhất 1
// nhóm có quyền tương ứng; vai trò khác (customer) không bao giờ có quyền quản trị.
function hasPermission(req, permission) {
  if (req.accountRole === 'admin') return true;
  if (req.accountRole !== 'staff') return false;
  const groups = req.account?.groupIds || [];
  return groups.some((g) => g.permissions?.includes(permission));
}

// Middleware phân quyền CHI TIẾT theo permission key - dùng cho các thao tác quản trị mà staff có
// thể được cấp quyền riêng lẻ, khác với authorize() vốn chỉ phân theo vai trò cố định (admin/staff).
const can = (permission) => {
  return (req, res, next) => {
    if (!hasPermission(req, permission)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này (thiếu quyền: ' + permission + ')' });
    }
    next();
  };
};

// Trả về storeId (dạng string) mà staff này bị giới hạn thao tác trong phạm vi đó, hoặc null nếu
// không bị giới hạn theo chi nhánh (admin, hoặc staff không được gán chi nhánh cụ thể). Dùng ở các
// controller cần thêm 1 lớp giới hạn "chỉ chi nhánh của mình" bên trên permission thông thường (VD:
// quyền inventory.manage vẫn có, nhưng chỉ áp dụng được cho đúng 1 cửa hàng - xem storeInventoryController.js).
function getScopedStoreId(req) {
  if (req.accountRole !== 'staff') return null;
  const storeId = req.account?.storeId;
  if (!storeId) return null;
  // req.account.storeId có thể là ObjectId thô HOẶC document đã populate ({_id, name, city}) tùy nơi
  // gọi protect() - lấy đúng ._id nếu đã populate, tránh so sánh nhầm bằng .toString() của cả object.
  return (storeId._id || storeId).toString();
}

module.exports = { protect, authorize, can, hasPermission, getScopedStoreId };
