const ISSUE_TEMPLATES = [
  'Máy tự khởi động lại liên tục khi đang sử dụng.',
  'Pin sụt nhanh bất thường, sạc không vào pin.',
  'Màn hình xuất hiện vệt sọc, ám màu.',
  'Loa bị rè, âm thanh không rõ.',
  'Sản phẩm không lên nguồn sau khi sạc qua đêm.',
  'Cổng sạc lỏng, kết nối chập chờn.',
  'Camera bị mờ, lấy nét chậm.',
  'Một số phím bấm bị liệt, phản hồi kém.',
  'Thiết bị nóng bất thường khi sử dụng.',
  'Kết nối Bluetooth/Wifi chập chờn, hay bị rớt.'
];
const METHODS = ['bring_to_store', 'pickup_at_home', 'send_by_post'];
// 'loi_nha_san_xuat' lặp lại để tăng trọng số vì đây là lý do phổ biến nhất trong thực tế
const RETURN_REASONS = [
  'loi_nha_san_xuat',
  'loi_nha_san_xuat',
  'hu_hong_van_chuyen',
  'khong_dung_mo_ta',
  'giao_nham_san_pham',
  'thieu_phu_kien',
  'doi_y',
  'khac'
];
// Thiên về 'done' vì phần lớn là dữ liệu bảo hành lịch sử đã xử lý xong
const STATUS_WEIGHTED = ['done', 'done', 'done', 'done', 'repairing', 'checking', 'received', 'waiting_parts', 'returned'];
const FEEDBACKS = [
  'Xử lý nhanh, nhân viên nhiệt tình.',
  'Thời gian sửa hơi lâu nhưng kết quả tốt.',
  'Hài lòng với dịch vụ bảo hành.',
  'Nhân viên tư vấn rõ ràng, dễ hiểu.'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(daysBack = 90) {
  return new Date(Date.now() - randInt(0, daysBack) * 86400000);
}

function ticketCode(index) {
  return `BH${String(index).padStart(6, '0')}`;
}

// Ảnh minh chứng lỗi tự sinh dạng SVG nhúng trực tiếp (data URI) - nhất quán với cách làm ảnh
// sản phẩm/bài viết, không phụ thuộc dịch vụ ảnh bên thứ ba nào.
function makeEvidenceImage(index) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 200 200">` +
    `<rect width="200" height="200" fill="#374151"/>` +
    `<rect x="60" y="70" width="80" height="60" rx="6" fill="#6b7280"/>` +
    `<circle cx="100" cy="100" r="18" fill="#9ca3af"/>` +
    `<text x="100" y="150" text-anchor="middle" fill="#d1d5db" font-family="Arial, Helvetica, sans-serif" font-size="11">Ảnh minh chứng ${index}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Sinh danh sách phiếu bảo hành mẫu, luôn gắn với 1 đơn hàng + 1 sản phẩm CÓ THẬT trong đơn đó
 * để đảm bảo tham chiếu hợp lệ (orderId/productId/userId khớp với đơn hàng gốc).
 */
function generateWarranties(count, { orders, admins }) {
  const eligibleOrders = orders.filter((o) => o.items && o.items.length > 0);
  const warranties = [];
  for (let i = 1; i <= count; i++) {
    const order = pick(eligibleOrders);
    const item = pick(order.items);
    const status = pick(STATUS_WEIGHTED);
    const createdAt = randomPastDate();
    const isDone = status === 'done';

    warranties.push({
      ticketCode: ticketCode(i),
      userId: order.userId,
      orderId: order._id,
      productId: item.productId,
      productName: item.name,
      issueDescription: pick(ISSUE_TEMPLATES),
      returnReason: pick(RETURN_REASONS),
      images: Math.random() < 0.4 ? Array.from({ length: randInt(1, 3) }, (_, idx) => makeEvidenceImage(idx + 1)) : [],
      method: pick(METHODS),
      status,
      statusHistory: [{ status, note: 'Khởi tạo dữ liệu mẫu', changedAt: createdAt }],
      cost: isDone && Math.random() < 0.3 ? randInt(1, 20) * 50000 : 0,
      assignedTo: Math.random() < 0.6 ? pick(admins)._id : null,
      customerRating: isDone ? randInt(3, 5) : undefined,
      customerFeedback: isDone && Math.random() < 0.4 ? pick(FEEDBACKS) : undefined,
      createdAt
    });
  }
  return warranties;
}

module.exports = { generateWarranties };
