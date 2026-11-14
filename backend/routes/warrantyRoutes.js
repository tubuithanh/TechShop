// routes/warrantyRoutes.js - URL phiếu bảo hành, gắn tại /api/warranties
const express = require('express');
const router = express.Router();
const {
  createWarrantyRequest,
  getMyWarranties,
  trackWarranty,
  submitWarrantyFeedback,
  getAllWarranties,
  updateWarrantyStatus,
  updateWarranty
} = require('../controllers/warrantyController');
const { protect, can } = require('../middlewares/authMiddleware');

router.get('/track/:code', trackWarranty); // công khai: tra cứu (mã phiếu + SĐT)
router.use(protect); // bên dưới cần đăng nhập
router.get('/admin/order', can('warranties.manage'), require('../utils/asyncHandler')(async (req, res) => { // tìm đơn đã giao theo mã để tiếp nhận tại quầy
  const order = await require('../models/Order').findOne({ orderCode: String(req.query.code || '').trim(), status: 'delivered' }).select('orderCode items deliveryAddress storeId');
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn đã bàn giao' }); // chỉ đơn đã giao
  if (!require('../controllers/orderController').inScope(req, order)) return res.status(403).json({ message: 'Đơn thuộc chi nhánh khác' }); // đơn chi nhánh khác
  res.json({ data: order });
}));
router.post('/', createWarrantyRequest); // gửi yêu cầu (khách) / tiếp nhận (nhân viên)
router.get('/', getMyWarranties); // phiếu của tôi
router.put('/:id/feedback', submitWarrantyFeedback); // đánh giá dịch vụ

router.get('/admin/all', can('warranties.manage'), getAllWarranties); // danh sách (giới hạn chi nhánh)
router.put('/:id/status', can('warranties.manage'), updateWarrantyStatus); // đổi trạng thái
router.put('/:id', can('warranties.manage'), updateWarranty); // sửa toàn bộ phiếu

module.exports = router;
