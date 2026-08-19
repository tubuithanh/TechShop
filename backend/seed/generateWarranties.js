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
      images: [],
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
