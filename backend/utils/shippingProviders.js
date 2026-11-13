// DANH SÁCH ĐƠN VỊ GIAO HÀNG mà admin chọn được ở trang Cấu hình -> Đơn vị giao hàng.
//
// Thêm 1 đơn vị mới (VD: Giao Hàng Tiết Kiệm, Viettel Post):
//   1. Thêm 1 phần tử vào PROVIDERS bên dưới: id, tên, các trường cấu hình (fields), có cần Shop ID theo chi nhánh
//      không (storeMapping), hàm test() kiểm tra kết nối.
//   2. Viết bộ điều hợp (adapter) gọi API của đơn vị đó (giống utils/ghn.js) và nối vào luồng tạo vận đơn
//      (routes/deliveryRoutes.js chọn controller theo id đơn vị đang dùng).
// Giao diện quản trị tự vẽ form theo mô tả ở đây - không cần sửa giao diện khi thêm đơn vị.
//
// Mô tả 1 trường (fields):
//   { key, label, type: 'text' | 'password' | 'url' | 'select', secret?: true (lưu mã hóa, không trả về trình duyệt),
//     required?: true, placeholder?, help?, pattern?: RegExp, options?: [{ value, label }] (cho select) }
// storeMapping: { label, help, pattern } - mỗi chi nhánh TechShop ứng với 1 mã cửa hàng bên đơn vị giao hàng.

const PROVIDERS = [
  {
    id: 'simulation',
    name: 'Giao hàng giả lập',
    badge: 'Mặc định',
    description: 'Mô phỏng vận đơn ngay trong TechShop (tạo vận đơn, cập nhật trạng thái, đối soát COD). Không cần tài khoản đơn vị giao hàng - dùng để kiểm thử và demo.',
    fields: [],
    storeMapping: null,
    implemented: true
  },
  {
    id: 'ghn_sandbox',
    name: 'Giao Hàng Nhanh (GHN)',
    badge: 'Sandbox',
    description: 'Tạo vận đơn thật trên môi trường thử nghiệm của GHN (dev-online-gateway.ghn.vn), đồng bộ trạng thái mỗi phút, hủy vận đơn trước khi bàn giao. Không tạo đơn giao hàng thật.',
    docsUrl: 'https://api.ghn.vn/home/docs/detail',
    signupUrl: 'https://5sao.ghn.dev',
    fields: [
      {
        key: 'token', label: 'Token API', type: 'password', secret: true, required: true,
        placeholder: 'Token lấy ở trang quản lý GHN (môi trường dev)',
        help: 'Đăng nhập tài khoản GHN dev -> Chủ cửa hàng -> Xem Token.', pattern: /^[A-Za-z0-9-]{10,80}$/
      }
    ],
    storeMapping: {
      label: 'Shop ID GHN',
      help: 'Mỗi chi nhánh TechShop cần 1 cửa hàng trên GHN (đúng địa chỉ lấy hàng). Chi nhánh để trống sẽ không tạo được vận đơn GHN.',
      pattern: /^\d{1,12}$/
    },
    implemented: true,
    // Kiểm tra kết nối: lấy danh sách cửa hàng GHN bằng token; kiểm tra các Shop ID đã ghép có tồn tại / đang hoạt động
    async test(settings) {
      const ghn = require('./ghn');
      const data = await ghn.call('/v2/shop/all', { query: { offset: 0, limit: 200 }, token: settings.token });
      const shops = data?.shops || [];
      const byId = new Map(shops.map((s) => [String(s._id), s]));
      const problems = Object.entries(settings.shops || {})
        .filter(([, id]) => id)
        .filter(([, id]) => byId.get(String(id))?.status !== 1)
        .map(([, id]) => id);
      const message = `Kết nối GHN thành công - tài khoản có ${shops.length} cửa hàng` +
        (problems.length ? `. Shop ID không tồn tại hoặc chưa hoạt động: ${problems.join(', ')}` : '');
      return { ok: problems.length === 0, message, shops: shops.map((s) => ({ id: String(s._id), name: s.name, address: s.address, active: s.status === 1 })) };
    }
  }
];

const byId = (id) => PROVIDERS.find((p) => p.id === id) || null;

// Mô tả gửi cho trình duyệt (bỏ hàm test, RegExp -> chuỗi)
function publicProviders() {
  return PROVIDERS.map(({ test, fields, storeMapping, ...rest }) => ({
    ...rest,
    testable: typeof test === 'function',
    fields: fields.map(({ pattern, ...f }) => ({ ...f, pattern: pattern ? pattern.source : undefined })),
    storeMapping: storeMapping ? { label: storeMapping.label, help: storeMapping.help } : null
  }));
}

module.exports = { PROVIDERS, byId, publicProviders };
