// =====================================================================================================
// middlewares/authMiddleware.js - XÁC THỰC (bạn là ai?) và PHÂN QUYỀN (bạn được làm gì?)
//   protect          : bắt buộc có access token hợp lệ, nạp tài khoản vào req.account
//   authorize(...)   : chỉ cho các vai trò liệt kê (VD authorize('admin'))
//   can('x.y')       : cần quyền chi tiết (VD can('orders.manage')) - admin luôn có, staff theo nhóm quyền
//   getScopedStoreId : chi nhánh mà nhân viên đang bị giới hạn thao tác
//   isStoreAllowed   : nhân viên có được đụng tới dữ liệu của chi nhánh X không
// Cách dùng trong route: router.get('/x', protect, can('orders.manage'), controller)
// =====================================================================================================
const jwt = require('jsonwebtoken'); // kiểm tra chữ ký + hạn của token
const User = require('../models/User'); // collection users (khách hàng)
const Admin = require('../models/Admin'); // collection admins (admin + nhân viên)

// Middleware xác thực: yêu cầu có access token hợp lệ
// Hỗ trợ 2 collection riêng biệt (users / admins) theo đúng thiết kế database mới.
// Sau khi xác thực, gắn req.account (bản ghi User hoặc Admin) và req.accountRole
// ('customer' | 'staff' | 'admin') để middleware/controller phía sau dùng thống nhất.
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization; // header dạng "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) { // không có header hoặc sai định dạng
      return res.status(401).json({ message: 'Chưa đăng nhập hoặc thiếu token' }); // 401 = chưa xác thực
    }
    const token = authHeader.split(' ')[1]; // tách lấy phần token sau chữ "Bearer "
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET); // sai chữ ký / hết hạn -> ném lỗi -> xuống catch

    let account; // bản ghi tài khoản lấy từ DB
    let accountRole; // vai trò thực tế
    if (decoded.role === 'customer') { // token của khách hàng
      account = await User.findById(decoded.id); // tìm trong users
      accountRole = 'customer';
    } else { // token của admin / nhân viên
      // Nạp sẵn quyền của các nhóm mà staff này thuộc về - để middleware `can()` bên dưới kiểm tra
      // ngay trong bộ nhớ (không phải query DB lại ở mỗi route riêng lẻ). Nạp thêm tên chi nhánh
      // (storeId) để Frontend hiển thị được, dù bản thân việc so sánh giới hạn chi nhánh (getScopedStoreId)
      // chỉ cần đúng ObjectId, không cần populate. Luôn populate cho cả admin lẫn staff, vì role có
      // thể vừa đổi (xem giải thích accountRole bên dưới) và trở thành staff ngay trong request này.
      account = await Admin.findById(decoded.id)
        .populate('groupIds', 'name code permissions') // nhóm quyền -> danh sách permission
        .populate('storeId', 'name city isActive') // chi nhánh chính
        .populate('managedStoreIds', 'name city isActive'); // các chi nhánh quản lý thêm
      // LẤY role TỪ DATABASE (account.role), KHÔNG dùng decoded.role (giá trị cũ lưu trong access
      // token lúc đăng nhập/làm mới gần nhất). Nếu chỉ dùng decoded.role, một admin vừa bị hạ xuống
      // staff (hoặc ngược lại) vẫn giữ nguyên quyền CŨ cho tới khi access token hết hạn (tối đa 15
      // phút) - isActive đã được kiểm tra tức thời như dưới đây, nhưng role thì không, tạo ra 1
      // khoảng hở giữ quyền admin sau khi đã bị hạ quyền.
      accountRole = account?.role;
    }

    if (!account || !account.isActive) { // tài khoản đã bị xóa hoặc bị khóa
      return res.status(401).json({ message: 'Tài khoản không hợp lệ hoặc đã bị khóa' });
    }
    // Token cấp trước lần đổi/đặt lại mật khẩu gần nhất -> không còn hiệu lực
    // (mỗi lần đổi mật khẩu, tokenVersion trong DB tăng 1 -> mọi token cũ mang "tv" cũ bị từ chối)
    if ((decoded.tv || 0) !== (account.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Phiên đăng nhập đã hết hiệu lực (mật khẩu vừa được thay đổi), vui lòng đăng nhập lại' });
    }

    req.account = account; // controller phía sau dùng req.account
    req.accountRole = accountRole; // 'customer' | 'staff' | 'admin' - LUÔN lấy tươi từ DB, không tin token
    require('../utils/auditStamp').setActor(account, accountRole); // ghi nhận người thao tác (đóng dấu ai thêm / sửa)
    // Phạm vi chi nhánh của nhân viên (điều chuyển tạm thời, quản lý nhiều chi nhánh) - xem utils/staffScope.js.
    // getScopedStoreId / isStoreAllowed bên dưới đọc từ đây thay vì req.account.storeId.
    if (accountRole === 'staff') {
      // header X-Store-Id: chi nhánh nhân viên đang chọn ở ô "Chi nhánh" trên trang quản trị
      req.storeScope = await require('../utils/staffScope').computeStoreScope(account, req.headers['x-store-id']);
    }
    next(); // hợp lệ -> cho đi tiếp
  } catch (err) { // token giả / hết hạn / lỗi DB
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' }); // frontend nhận 401 sẽ tự gọi /refresh
  }
};

// Middleware phân quyền theo vai trò
const authorize = (...roles) => { // roles: danh sách vai trò được phép, VD ('admin', 'staff')
  return (req, res, next) => {
    if (!req.accountRole || !roles.includes(req.accountRole)) { // vai trò không nằm trong danh sách
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' }); // 403 = đã đăng nhập nhưng không đủ quyền
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
  if (req.accountRole === 'admin') return true; // admin: toàn quyền
  if (req.accountRole !== 'staff') return false; // khách hàng / chưa đăng nhập: không có quyền quản trị
  const groups = req.account?.groupIds || []; // các nhóm quyền (đã populate ở protect)
  if (permission === 'chat.support') { // quyền chat hỗ trợ: CHỈ nhóm "customer_support" mới được
    return groups.some((g) => g.code === 'customer_support' && g.permissions?.includes(permission));
  }
  return groups.some((g) => g.permissions?.includes(permission)); // chỉ cần 1 nhóm có quyền là đủ
}

// Middleware phân quyền CHI TIẾT theo permission key - dùng cho các thao tác quản trị mà staff có
// thể được cấp quyền riêng lẻ, khác với authorize() vốn chỉ phân theo vai trò cố định (admin/staff).
const can = (permission) => {
  return (req, res, next) => {
    if (!hasPermission(req, permission)) { // thiếu quyền -> 403 kèm tên quyền để dễ cấu hình
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
  if (req.accountRole !== 'staff') return null; // admin: không giới hạn
  if (req.storeScope) return req.storeScope.current; // đã tính ở protect -> chi nhánh đang chọn
  const storeId = req.account?.storeId; // dự phòng (VD test gọi thẳng không qua protect)
  if (!storeId) return null; // không gán chi nhánh -> không giới hạn
  // req.account.storeId có thể là ObjectId thô HOẶC document đã populate ({_id, name, city}) tùy nơi
  // gọi protect() - lấy đúng ._id nếu đã populate, tránh so sánh nhầm bằng .toString() của cả object.
  return (storeId._id || storeId).toString();
}

// Nhân viên được thao tác trên chi nhánh này không (chi nhánh đang làm việc HOẶC chi nhánh quản lý thêm).
// Dùng khi xem 1 bản ghi cụ thể (VD: mở đơn hàng của chi nhánh khác mình cũng quản lý từ thông báo).
function isStoreAllowed(req, storeId) {
  if (req.accountRole !== 'staff') return true; // admin: được tất cả
  const allowed = req.storeScope?.allowed; // danh sách chi nhánh được phép
  if (!allowed) { // không có storeScope (dự phòng) -> so với chi nhánh chính
    const own = getScopedStoreId(req);
    return !own || String(storeId?._id || storeId) === own; // không gán chi nhánh = được tất cả
  }
  return allowed.length === 0 || allowed.includes(String(storeId?._id || storeId)); // rỗng = không giới hạn
}

module.exports = { protect, authorize, can, hasPermission, getScopedStoreId, isStoreAllowed };
