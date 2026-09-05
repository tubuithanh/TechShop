// Nhãn dùng chung cho toàn bộ khu vực bảo hành (form gửi yêu cầu của khách hàng +
// trang quản trị) để đảm bảo nhất quán, chỉ cần sửa 1 nơi.
export const RETURN_REASON_LABEL = {
  loi_nha_san_xuat: 'Lỗi từ nhà sản xuất',
  hu_hong_van_chuyen: 'Hư hỏng trong quá trình vận chuyển',
  khong_dung_mo_ta: 'Sản phẩm không đúng mô tả',
  giao_nham_san_pham: 'Giao nhầm sản phẩm',
  thieu_phu_kien: 'Thiếu phụ kiện đi kèm',
  doi_y: 'Đổi ý, không muốn sử dụng nữa',
  khac: 'Lý do khác'
};

export const RETURN_REASON_OPTIONS = Object.entries(RETURN_REASON_LABEL).map(([value, label]) => ({ value, label }));

export const WARRANTY_METHOD_LABEL = {
  bring_to_store: 'Mang đến cửa hàng',
  pickup_at_home: 'Lấy tại nhà',
  send_by_post: 'Gửi qua bưu điện'
};

export const WARRANTY_STATUS_LABEL = {
  received: 'Đã tiếp nhận',
  checking: 'Đang kiểm tra',
  repairing: 'Đang sửa chữa',
  waiting_parts: 'Chờ linh kiện',
  done: 'Đã sửa xong',
  returned: 'Đã trả máy'
};

export const WARRANTY_STATUS_VARIANT = {
  received: 'info',
  checking: 'info',
  repairing: 'warning',
  waiting_parts: 'warning',
  done: 'success',
  returned: 'secondary'
};

export const WARRANTY_STATUS_OPTIONS = Object.keys(WARRANTY_STATUS_LABEL);

// Số ảnh minh chứng tối đa cho mỗi phiếu bảo hành (khách gửi kèm khi tạo yêu cầu,
// hoặc admin thêm/sửa khi xử lý) - độc lập với "Số ảnh tối đa mỗi sản phẩm" trong
// Cấu hình hệ thống vì đây là ảnh minh chứng lỗi, không phải ảnh catalog sản phẩm.
export const MAX_WARRANTY_IMAGES = 10;
