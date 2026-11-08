require('./setup');
const Order = require('../models/Order');
const { validateInvoiceInfo } = require('../controllers/orderController');

// Thông tin xuất hóa đơn công ty gửi kèm khi đặt hàng (trang thanh toán -> "Xuất hóa đơn công ty")
describe('Thông tin xuất hóa đơn điện tử', () => {
  const valid = { companyName: 'Công ty TNHH ABC', taxCode: '0101234567', address: '1 Tràng Tiền, Hà Nội', email: 'KeToan@ABC.vn' };

  test('Không gửi / gửi toàn ô trống -> không lưu thông tin hóa đơn', () => {
    expect(validateInvoiceInfo(undefined)).toEqual({ value: undefined });
    expect(validateInvoiceInfo({ companyName: ' ', taxCode: '', address: '' })).toEqual({ value: undefined });
  });

  test('Hợp lệ -> chuẩn hóa (bỏ khoảng trắng MST, email chữ thường)', () => {
    const { error, value } = validateInvoiceInfo({ ...valid, taxCode: '0101 234 567' });
    expect(error).toBeUndefined();
    expect(value).toEqual({ ...valid, taxCode: '0101234567', email: 'ketoan@abc.vn' });
  });

  test.each(['0101234567', '0101234567-001', '001099012345'])('Mã số thuế hợp lệ: %s', (taxCode) => {
    expect(validateInvoiceInfo({ ...valid, taxCode }).error).toBeUndefined();
  });

  test.each(['12345', '0101234567-1', 'abcdefghij', '01012345678'])('Mã số thuế sai: %s', (taxCode) => {
    expect(validateInvoiceInfo({ ...valid, taxCode }).error).toMatch(/Mã số thuế/);
  });

  test('Thiếu tên công ty / địa chỉ, email sai -> báo lỗi', () => {
    expect(validateInvoiceInfo({ ...valid, companyName: '' }).error).toMatch(/tên công ty/);
    expect(validateInvoiceInfo({ ...valid, address: '' }).error).toMatch(/địa chỉ/);
    expect(validateInvoiceInfo({ ...valid, email: 'khong-phai-email' }).error).toMatch(/Email/);
  });

  test('Không nhận kiểu dữ liệu lạ (chống chèn toán tử MongoDB)', () => {
    const { value } = validateInvoiceInfo({ ...valid, companyName: { $ne: null } });
    expect(value?.companyName).toBe('[object Object]');
  });

  test('Lưu được vào đơn hàng', () => {
    const order = new Order({ invoiceInfo: validateInvoiceInfo(valid).value });
    expect(order.invoiceInfo.taxCode).toBe('0101234567');
    expect(new Order({}).invoiceInfo).toBeUndefined();
  });
});
