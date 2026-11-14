// =====================================================================================================
// controllers/warrantyController.js - PHIẾU BẢO HÀNH / SỬA CHỮA
//   Khách: gửi yêu cầu bảo hành cho máy đã nhận, xem phiếu của mình, đánh giá sau khi xong, tra cứu công khai
//   Nhân viên: tiếp nhận tại quầy (theo sổ bảo hành / IMEI), xem danh sách, cập nhật trạng thái, chi phí, người phụ trách
// =====================================================================================================
const mongoose = require('mongoose');
const Warranty = require('../models/Warranty'); // phiếu bảo hành
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { emailWarranty } = require('../utils/notifyEmail'); // email báo tiến độ bảo hành
const { searchFilter } = require('../utils/search');
const { normalizePhone } = require('../utils/customerValidation');
const WarrantyCard = require('../models/WarrantyCard'); // sổ bảo hành điện tử của từng máy
const { ensureCardsForOrders } = require('../utils/warrantyCards'); // tạo bù sổ cho đơn cũ
const { hasPermission, getScopedStoreId } = require('../middlewares/authMiddleware');
const { inScope } = require('./orderController');

// Mã phiếu: "BH" + 6 số cuối thời gian + 4 số ngẫu nhiên
function generateTicketCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BH${Date.now().toString().slice(-6)}${rand}`;
}

const MAX_WARRANTY_IMAGES = 10; // tối đa 10 ảnh mỗi phiếu
const MAX_TEXT = 2000; // mô tả lỗi / lý do tối đa 2000 ký tự
const MAX_NOTE = 1000; // ghi chú xử lý tối đa 1000 ký tự

// Quy trình phiếu bảo hành: tiếp nhận -> kiểm tra -> sửa chữa / chờ linh kiện -> hoàn tất -> trả máy cho khách.
// Kiểm tra xong không có lỗi thì "hoàn tất" luôn. Trước đây không có quy tắc nào: phiếu đã trả máy có thể bị
// chuyển ngược về "tiếp nhận", hoặc nhảy thẳng từ "tiếp nhận" sang "hoàn tất".
const WARRANTY_TRANSITIONS = {
  received: ['checking'], // tiếp nhận -> kiểm tra
  checking: ['repairing', 'waiting_parts', 'done'], // kiểm tra -> sửa / chờ linh kiện / xong (không lỗi)
  repairing: ['waiting_parts', 'done'],
  waiting_parts: ['repairing', 'done'],
  done: ['returned'], // xong -> đã trả máy
  returned: [] // trạng thái cuối
};
const FINISHED = ['done', 'returned']; // phiếu đã xử lý xong

// Kiểm tra dữ liệu chữ: không gửi -> bỏ qua; gửi -> phải là chuỗi, không quá max ký tự. Trả câu lỗi hoặc null.
function textError(value, max, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${label} không hợp lệ`;
  if (value.length > max) return `${label} tối đa ${max} ký tự`;
  return null;
}
// Danh sách ảnh: mảng tối đa 10 đường dẫn (chuỗi)
function imagesError(images) {
  if (images === undefined) return null;
  if (!Array.isArray(images) || images.some((u) => typeof u !== 'string' || u.length > 1000)) return 'Danh sách ảnh không hợp lệ';
  if (images.length > MAX_WARRANTY_IMAGES) return `Chỉ được đính kèm tối đa ${MAX_WARRANTY_IMAGES} ảnh`;
  return null;
}

// Kiểm tra các trường nhân viên gửi lên khi cập nhật phiếu; trả về thông báo lỗi hoặc null
async function validateWarrantyUpdate(warranty, { status, cost, assignedTo }) {
  if (status !== undefined && status !== warranty.status && !(WARRANTY_TRANSITIONS[warranty.status] || []).includes(status)) { // sai quy trình
    return `Không thể chuyển phiếu từ "${warranty.status}" sang "${status}"`;
  }
  if (cost !== undefined && !(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0)) return 'Chi phí phải là số >= 0';
  if (assignedTo) {
    // Người phụ trách phải là tài khoản quản trị còn hoạt động có quyền xử lý bảo hành
    const staff = mongoose.isValidObjectId(assignedTo)
      ? await Admin.findOne({ _id: assignedTo, isActive: true }).populate('groupIds', 'permissions')
      : null;
    const canHandle = staff && (staff.role === 'admin' || (staff.groupIds || []).some((g) => g.permissions?.includes('warranties.manage')));
    if (!canHandle) return 'Người phụ trách phải là nhân viên có quyền xử lý bảo hành';
  }
  return null;
}

// SỬA LỖI (phân quyền chi nhánh): phiếu bảo hành thuộc chi nhánh của ĐƠN HÀNG gốc. Trước đây nhân viên chi nhánh A
// xem và sửa được phiếu của chi nhánh B (danh sách đơn hàng thì đã giới hạn đúng). Nay kiểm tra qua đơn gốc.
async function warrantyInScope(req, warranty) {
  if (req.accountRole !== 'staff') return true; // admin: mọi chi nhánh
  const order = await Order.findById(warranty.orderId).select('storeId').lean();
  return !order || inScope(req, order); // phiếu không còn đơn gốc (dữ liệu cũ) -> không chặn
}

// @route POST /api/warranties - khách gửi yêu cầu / nhân viên tiếp nhận tại quầy
const createWarrantyRequest = asyncHandler(async (req, res) => {
  const { orderId, issueDescription, returnReason, images, method } = req.body;

  const inputError = imagesError(images) || textError(issueDescription, MAX_TEXT, 'Mô tả lỗi') || textError(returnReason, MAX_TEXT, 'Lý do');
  if (inputError) return res.status(400).json({ message: inputError });

  const staff = hasPermission(req, 'warranties.manage'); // người gửi là nhân viên bảo hành?
  // Nhân viên tiếp nhận tại quầy có thể chọn thẳng 1 sổ bảo hành (tìm bằng IMEI / SĐT / mã bảo hành) thay vì đơn hàng
  let card = null;
  let productId = req.body.productId;
  let order;
  if (staff && req.body.cardId) { // tiếp nhận theo sổ bảo hành
    card = mongoose.isValidObjectId(req.body.cardId) ? await WarrantyCard.findById(req.body.cardId) : null;
    if (!card) return res.status(404).json({ message: 'Không tìm thấy sổ bảo hành' });
    if (card.status === 'void') return res.status(400).json({ message: `Sổ bảo hành không còn hiệu lực (${card.voidReason || 'đơn đã trả hàng'})` }); // sổ bị hủy (đơn trả hàng)
    order = await Order.findOne({ _id: card.orderId, status: 'delivered' });
    productId = String(card.productId);
  } else { // theo đơn hàng: khách chỉ chọn được đơn của chính mình
    order = await Order.findOne({ _id: orderId, ...(!staff ? { userId: req.account._id } : {}), status: 'delivered' });
  }
  if (!order) {
    return res.status(400).json({ message: 'Không tìm thấy đơn hàng đã giao thành công để yêu cầu bảo hành' });
  }
  if (staff && !inScope(req, order)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' });
  const item = order.items.find((i) => i.productId.toString() === String(productId)); // sản phẩm phải có trong đơn
  if (!item) {
    return res.status(400).json({ message: 'Sản phẩm này không có trong đơn hàng đã chọn' });
  }

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  // 1 máy chỉ có 1 phiếu đang xử lý: trước đây gửi lại nhiều lần tạo nhiều phiếu trùng. Chọn theo sổ thì xét
  // đúng máy đó (mua 2 máy cùng loại vẫn gửi sửa được cả 2).
  const open = await Warranty.findOne({
    ...(card ? { warrantyCardId: card._id } : { orderId: order._id, productId }),
    status: { $nin: FINISHED }
  });
  if (open) return res.status(409).json({ message: `Sản phẩm này đang có phiếu bảo hành ${open.ticketCode} chưa xử lý xong` });

  // Hạn bảo hành lấy từ sổ bảo hành điện tử (đã gồm ngày kích hoạt + các gói gia hạn đã mua). Đơn giao trước khi
  // có sổ thì tạo bù. Không chọn sổ cụ thể mà mua nhiều máy cùng loại: lấy sổ còn hạn lâu nhất.
  if (!card) {
    await ensureCardsForOrders([order]);
    const cards = await WarrantyCard.find({ orderId: order._id, productId, status: 'active' });
    card = cards.sort((x, y) => y.summary().endDate - x.summary().endDate)[0] || null; // hạn xa nhất trước
  }
  const s = card?.summary(); // { inWarranty, endDate, totalMonths }
  const inWarranty = Boolean(s?.inWarranty);
  if (!inWarranty) { // hết hạn / không có bảo hành
    const why = !card
      ? 'Sản phẩm không còn sổ bảo hành hợp lệ (đơn đã trả hàng)'
      : s.totalMonths <= 0
        ? 'Sản phẩm không kèm bảo hành'
        : `Sản phẩm đã hết hạn bảo hành (${s.totalMonths} tháng, hết hạn ngày ${s.endDate.toLocaleDateString('vi-VN')})`;
    // Khách tự gửi: chặn. Nhân viên tại quầy: vẫn nhận sửa nếu xác nhận là SỬA DỊCH VỤ CÓ TÍNH PHÍ
    if (!staff) return res.status(400).json({ message: why });
    if (req.body.paidService !== true) {
      return res.status(400).json({ code: 'OUT_OF_WARRANTY', message: `${why}. Chọn "Sửa dịch vụ có tính phí" để tiếp nhận.` });
    }
  }
  const coverage = { // ảnh chụp tình trạng bảo hành tại lúc tiếp nhận
    type: !inWarranty ? 'out_of_warranty' : card.provider === 'manufacturer' ? 'manufacturer' : 'in_warranty', // ngoài BH / hãng BH / shop BH
    cardId: card?._id,
    cardCode: card?.code,
    serial: card?.serial || '', // IMEI / số máy
    endDate: s?.endDate,
    totalMonths: s?.totalMonths,
    providerName: card?.provider === 'manufacturer' ? card.providerInfo?.name : undefined, // trung tâm bảo hành hãng
    providerPhone: card?.provider === 'manufacturer' ? card.providerInfo?.phone : undefined,
    checkedAt: new Date()
  };

  const warranty = await Warranty.create({
    ticketCode: generateTicketCode(),
    userId: order.userId,
    customerName: order.deliveryAddress?.fullName,
    customerPhone: order.deliveryAddress?.phone,
    orderId: order._id,
    productId,
    productName: item.name,
    coverage,
    warrantyCardId: card?._id || null,
    issueDescription,
    returnReason,
    images,
    method: method || 'bring_to_store', // mang tới cửa hàng (mặc định)
    statusHistory: [{
      status: 'received',
      note: coverage.type === 'out_of_warranty' ? 'Tiếp nhận sửa dịch vụ (ngoài bảo hành, có tính phí)' : 'Tiếp nhận yêu cầu bảo hành',
      changedBy: req.account._id
    }]
  });

  emailWarranty(warranty, { created: true }); // email xác nhận tiếp nhận kèm mã phiếu (chạy nền)
  res.status(201).json({ data: warranty });
});

// @route GET /api/warranties - phiếu của chính khách
const getMyWarranties = asyncHandler(async (req, res) => {
  const warranties = await Warranty.find({ userId: req.account._id }).sort({ createdAt: -1 });
  res.json({ data: warranties });
});

// @route GET /api/warranties/track/:code?phone= - tra cứu công khai (trang "Tra cứu bảo hành", không cần
// đăng nhập). Bắt buộc kèm số điện thoại của đơn hàng/tài khoản để người khác đoán được mã phiếu cũng không
// xem được; chỉ trả về thông tin cần cho khách theo dõi (không lộ mô tả lỗi, ảnh, mã nội bộ, nhân viên xử lý).
const trackWarranty = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const phone = normalizePhone(req.query.phone);
  const notFound = () => res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành khớp mã phiếu và số điện thoại' });
  if (!code || !phone) return res.status(400).json({ message: 'Vui lòng nhập mã phiếu bảo hành và số điện thoại' });

  const warranty = await Warranty.findOne({ ticketCode: code })
    .populate('productId', 'title featuredImage')
    .populate('orderId', 'orderCode deliveryAddress.phone')
    .populate('userId', 'phoneNumber');
  if (!warranty) return notFound();
  const phones = [warranty.orderId?.deliveryAddress?.phone, warranty.userId?.phoneNumber].map(normalizePhone).filter(Boolean); // SĐT hợp lệ của phiếu
  if (!phones.includes(phone)) return notFound(); // cùng thông báo - không tiết lộ mã phiếu có tồn tại hay không

  res.json({
    data: {
      ticketCode: warranty.ticketCode,
      productName: warranty.productId?.title || warranty.productName,
      productImage: warranty.productId?.featuredImage || '',
      orderCode: warranty.orderId?.orderCode,
      method: warranty.method,
      status: warranty.status,
      cost: warranty.cost,
      createdAt: warranty.createdAt,
      updatedAt: warranty.updatedAt,
      timeline: (warranty.statusHistory || []).map((h) => ({ status: h.status, note: h.note, changedAt: h.changedAt })) // không lộ nhân viên
    }
  });
});

// @route PUT /api/warranties/:id/feedback - khách đánh giá dịch vụ bảo hành
const submitWarrantyFeedback = asyncHandler(async (req, res) => {
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  if (String(warranty.userId) !== String(req.account._id)) { // chỉ chủ phiếu
    return res.status(403).json({ message: 'Không có quyền thao tác' });
  }
  // Chỉ đánh giá được khi phiếu đã xử lý xong (trước đây đánh giá được cả khi máy còn đang sửa); 1 – 5 sao
  if (!FINISHED.includes(warranty.status)) {
    return res.status(400).json({ message: 'Chỉ đánh giá được khi phiếu bảo hành đã xử lý xong' });
  }
  const { rating } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Số sao từ 1 đến 5' });
  const feedback = typeof req.body.feedback === 'string' ? req.body.feedback.trim().slice(0, 1000) : '';
  warranty.customerRating = rating;
  warranty.customerFeedback = feedback;
  await warranty.save();
  res.json({ data: warranty });
});

// @route GET /api/warranties/admin/all - danh sách phiếu cho nhân viên
const getAllWarranties = asyncHandler(async (req, res) => {
  const { status, method, q, coverage, page = 1, limit = 20 } = req.query;
  const filter = status ? { status } : {};
  if (method) filter.method = method;
  if (['in_warranty', 'manufacturer', 'out_of_warranty'].includes(coverage)) filter['coverage.type'] = coverage; // lọc loại bảo hành
  Object.assign(filter, searchFilter(q)); // mã phiếu, mã đơn, SĐT, tên sản phẩm (không dấu)
  // Nhân viên bị giới hạn chi nhánh -> chỉ phiếu có đơn gốc thuộc chi nhánh đang chọn
  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId) filter.orderId = { $in: await Order.distinct('_id', { storeId: scopedStoreId }) };
  const warranties = await Warranty.find(filter)
    .populate('userId', 'displayName phoneNumber email')
    .populate('productId', 'title')
    .populate('statusHistory.changedBy', 'name') // tên nhân viên trong lịch sử
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Warranty.countDocuments(filter);
  res.json({ data: warranties, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// @route PUT /api/warranties/:id/status - đổi nhanh trạng thái ngay trong bảng
const updateWarrantyStatus = asyncHandler(async (req, res) => {
  const { status, note, cost, assignedTo } = req.body;
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  if (!(await warrantyInScope(req, warranty))) return res.status(403).json({ message: 'Phiếu bảo hành thuộc chi nhánh khác' });
  if (status === undefined) return res.status(400).json({ message: 'Vui lòng chọn trạng thái' });
  const noteError = textError(note, MAX_NOTE, 'Ghi chú');
  if (noteError) return res.status(400).json({ message: noteError });
  const invalid = await validateWarrantyUpdate(warranty, { status, cost, assignedTo });
  if (invalid) return res.status(400).json({ message: invalid });

  warranty.status = status;
  if (cost !== undefined) warranty.cost = cost;
  if (assignedTo) warranty.assignedTo = assignedTo;
  warranty.statusHistory.push({ status, note, changedBy: req.account._id }); // ghi lịch sử
  await warranty.save();

  if (warranty.userId) await Notification.create({ // báo khách (phiếu có tài khoản)
    userId: warranty.userId,
    type: 'warranty',
    title: 'Cập nhật bảo hành',
    message: `Phiếu bảo hành ${warranty.ticketCode} đã chuyển sang trạng thái "${status}"`,
    link: '/account/warranties'
  });
  emailWarranty(warranty, { note });

  const io = req.app.get('io');
  if (io && warranty.userId) io.to(`user_${warranty.userId}`).emit('warranty:statusUpdated', { warrantyId: warranty._id, status }); // real-time

  res.json({ data: warranty });
});

// @route PUT /api/warranties/:id - chỉnh sửa toàn diện phiếu bảo hành (chỉ admin/staff):
// mô tả lỗi, lý do trả hàng, trạng thái, ghi chú xử lý, chi phí sửa chữa - dùng cho modal
// "Sửa" ở trang quản trị, khác với /:id/status chỉ đổi nhanh trạng thái ngay trong bảng.
const updateWarranty = asyncHandler(async (req, res) => {
  const { issueDescription, returnReason, status, note, cost, assignedTo, images } = req.body;
  const warranty = await Warranty.findById(req.params.id);
  if (!warranty) return res.status(404).json({ message: 'Không tìm thấy phiếu bảo hành' });
  if (!(await warrantyInScope(req, warranty))) return res.status(403).json({ message: 'Phiếu bảo hành thuộc chi nhánh khác' });
  const inputError = imagesError(images) || textError(issueDescription, MAX_TEXT, 'Mô tả lỗi') || textError(returnReason, MAX_TEXT, 'Lý do') || textError(note, MAX_NOTE, 'Ghi chú');
  if (inputError) return res.status(400).json({ message: inputError });
  const invalid = await validateWarrantyUpdate(warranty, { status, cost, assignedTo });
  if (invalid) return res.status(400).json({ message: invalid });

  if (images !== undefined) warranty.images = images; // chỉ đổi trường có gửi lên
  if (issueDescription !== undefined) warranty.issueDescription = issueDescription;
  if (returnReason !== undefined) warranty.returnReason = returnReason;
  if (cost !== undefined) warranty.cost = cost;
  if (assignedTo !== undefined) warranty.assignedTo = assignedTo || null; // rỗng = bỏ người phụ trách

  const statusChanged = status !== undefined && status !== warranty.status;
  if (statusChanged) warranty.status = status;
  if (statusChanged || (note && note.trim())) { // đổi trạng thái hoặc có ghi chú -> thêm lịch sử
    warranty.statusHistory.push({ status: warranty.status, note, changedBy: req.account._id });
  }
  await warranty.save();

  if (statusChanged) { // chỉ báo khách khi trạng thái đổi
    if (warranty.userId) await Notification.create({
      userId: warranty.userId,
      type: 'warranty',
      title: 'Cập nhật bảo hành',
      message: `Phiếu bảo hành ${warranty.ticketCode} đã chuyển sang trạng thái "${status}"`,
      link: '/account/warranties'
    });
    emailWarranty(warranty, { note });
    const io = req.app.get('io');
    if (io && warranty.userId) io.to(`user_${warranty.userId}`).emit('warranty:statusUpdated', { warrantyId: warranty._id, status });
  }

  res.json({ data: warranty });
});

module.exports = {
  createWarrantyRequest,
  getMyWarranties,
  trackWarranty,
  submitWarrantyFeedback,
  getAllWarranties,
  updateWarrantyStatus,
  updateWarranty
};
