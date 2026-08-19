const VN_LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const VN_MIDDLE_MALE = ['Văn', 'Hữu', 'Đức', 'Minh', 'Quốc', 'Thành', 'Công', 'Anh'];
const VN_MIDDLE_FEMALE = ['Thị', 'Ngọc', 'Thu', 'Kim', 'Hồng', 'Thanh', 'Diệu'];
const VN_FIRST_MALE = ['An', 'Bình', 'Cường', 'Dũng', 'Đạt', 'Giang', 'Hải', 'Huy', 'Khang', 'Long', 'Minh', 'Nam', 'Phong', 'Quân', 'Sơn', 'Tài', 'Thắng', 'Tuấn', 'Việt', 'Vinh'];
const VN_FIRST_FEMALE = ['Anh', 'Chi', 'Dung', 'Giang', 'Hà', 'Hoa', 'Huyền', 'Lan', 'Linh', 'Mai', 'Ngọc', 'Nhung', 'Phương', 'Quỳnh', 'Thảo', 'Thu', 'Trang', 'Trâm', 'Vy', 'Yến'];

const CITIES = [
  { city: 'TP. Hồ Chí Minh', state: 'TP. Hồ Chí Minh', pincode: '700000' },
  { city: 'Hà Nội', state: 'Hà Nội', pincode: '100000' },
  { city: 'Đà Nẵng', state: 'Đà Nẵng', pincode: '550000' }
];
const STREET_NAMES = [
  'Lê Lợi', 'Nguyễn Huệ', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Xuân Thủy',
  'Cầu Giấy', 'Nguyễn Trãi', 'Điện Biên Phủ', 'Lý Thường Kiệt', 'Bạch Đằng'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function removeDiacritics(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Sinh danh sách khách hàng mẫu. `passwordHash` phải là mật khẩu ĐÃ băm sẵn (bcrypt) vì
 * insertMany() không chạy middleware pre('save') của Mongoose (nơi User model tự băm mật khẩu).
 */
function generateCustomers(count, passwordHash) {
  const customers = [];
  for (let i = 1; i <= count; i++) {
    const isMale = Math.random() < 0.5;
    const last = pick(VN_LAST_NAMES);
    const middle = pick(isMale ? VN_MIDDLE_MALE : VN_MIDDLE_FEMALE);
    const first = pick(isMale ? VN_FIRST_MALE : VN_FIRST_FEMALE);
    const displayName = `${last} ${middle} ${first}`;
    const emailBase = removeDiacritics(`${first}${last}`).toLowerCase().replace(/[^a-z]/g, '');
    const cityInfo = pick(CITIES);

    customers.push({
      displayName,
      email: `${emailBase}${i}@example.com`,
      password: passwordHash,
      phoneNumber: `09${randInt(10000000, 99999999)}`,
      isEmailVerified: true,
      termsAcceptedAt: new Date(),
      addresses: [
        {
          addressLine1: `${randInt(1, 300)} Đường ${pick(STREET_NAMES)}`,
          addressLine2: '',
          city: cityInfo.city,
          state: cityInfo.state,
          pincode: cityInfo.pincode,
          orderNote: ''
        }
      ]
    });
  }
  return customers;
}

module.exports = { generateCustomers };
