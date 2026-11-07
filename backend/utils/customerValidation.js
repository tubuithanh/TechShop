// Kiểm tra dữ liệu tài khoản khách hàng - dùng chung cho đăng ký, đổi mật khẩu... Frontend cũng kiểm tra
// y hệt (frontend/src/utils/customerValidation.js) để báo lỗi ngay khi nhập, nhưng backend PHẢI kiểm tra
// lại vì request có thể được gửi thẳng tới API, bỏ qua giao diện.

const MAX_ADDRESSES = 5;
const ADDRESS_LABEL_MAX = 30;

// Bỏ khoảng trắng thừa ở giữa và 2 đầu: "  Nguyễn   Văn  A " -> "Nguyễn Văn A"
function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

// Họ tên: 2-50 ký tự, chỉ gồm chữ cái (kể cả tiếng Việt có dấu) và khoảng trắng
function validateName(name) {
  const value = normalizeName(name);
  if (!value) return 'Vui lòng nhập họ và tên';
  if (value.length < 2 || value.length > 50) return 'Họ và tên phải từ 2 đến 50 ký tự';
  if (!/^[\p{L}\s]+$/u.test(value)) return 'Họ và tên chỉ được chứa chữ cái và khoảng trắng';
  return null;
}

// Chuẩn hóa số điện thoại về dạng 10 số bắt đầu bằng 0: "+84 912.345.678" -> "0912345678"
function normalizePhone(phone) {
  let value = String(phone || '').replace(/[\s.\-()]/g, '');
  if (value.startsWith('+84')) value = '0' + value.slice(3);
  else if (value.startsWith('84') && value.length === 11) value = '0' + value.slice(2);
  return value;
}

// Số di động Việt Nam: 10 số, đầu số 03/05/07/08/09
function validatePhone(phone) {
  const value = normalizePhone(phone);
  if (!value) return 'Vui lòng nhập số điện thoại';
  if (!/^0(3|5|7|8|9)\d{8}$/.test(value)) return 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09)';
  return null;
}

// Mật khẩu tài khoản khách hàng: tối thiểu 8 ký tự, có cả chữ và số
function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (value.length > 64) return 'Mật khẩu tối đa 64 ký tự';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Mật khẩu phải có cả chữ và số';
  return null;
}

// 1 địa chỉ: chỉ lấy các trường của địa chỉ (bỏ _id, trường lạ), rút gọn khoảng trắng, giới hạn độ dài.
// Dùng chung cho đăng ký và sổ địa chỉ. Trả về { address } hoặc { error }.
function normalizeAddress(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return { error: 'Địa chỉ không hợp lệ' };
  const clean = (v, max = 200) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().replace(/\s+/g, ' ').slice(0, max);
  const address = {
    label: clean(a.label, ADDRESS_LABEL_MAX) || 'Nhà riêng',
    addressLine1: clean(a.addressLine1),
    addressLine2: clean(a.addressLine2),
    city: clean(a.city, 100),
    state: clean(a.city, 100),
    pincode: '',
    orderNote: clean(a.orderNote),
    isDefault: a.isDefault === true
  };
  if (!address.addressLine1) return { error: 'Vui lòng nhập số nhà, tên đường' };
  if (!address.city) return { error: 'Vui lòng nhập tỉnh/thành phố' };
  return { address };
}

// Địa chỉ nhập lúc đăng ký (không bắt buộc, tối đa 5): mỗi địa chỉ đã thêm phải có số nhà/đường và
// tỉnh/thành. Trả về { addresses, error } - addresses đã chuẩn hóa, luôn có đúng 1 địa chỉ mặc định.
function normalizeAddresses(input) {
  if (input === undefined || input === null) return { addresses: [] };
  if (!Array.isArray(input)) return { error: 'Danh sách địa chỉ không hợp lệ' };
  if (input.length > MAX_ADDRESSES) return { error: `Tối đa ${MAX_ADDRESSES} địa chỉ` };

  const addresses = [];
  for (let i = 0; i < input.length; i++) {
    const { address, error } = normalizeAddress({ ...(input[i] || {}), isDefault: Boolean(input[i]?.isDefault) });
    if (error) return { error: `Địa chỉ ${i + 1}: ${error.charAt(0).toLowerCase()}${error.slice(1)}` };
    addresses.push(address);
  }
  // Đúng 1 địa chỉ mặc định: giữ địa chỉ đầu tiên được đánh dấu, nếu không có thì lấy địa chỉ đầu tiên
  const defaultIdx = Math.max(0, addresses.findIndex((a) => a.isDefault));
  addresses.forEach((a, i) => (a.isDefault = i === defaultIdx));
  return { addresses };
}

module.exports = {
  MAX_ADDRESSES,
  normalizeAddress,
  normalizeName,
  validateName,
  normalizePhone,
  validatePhone,
  validatePassword,
  normalizeAddresses
};
