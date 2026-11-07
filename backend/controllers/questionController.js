const mongoose = require('mongoose');
const Question = require('../models/Question');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { hasPermission } = require('../middlewares/authMiddleware');

const MAX_LENGTH = 1000;
// Nội dung hỏi / đáp: chuỗi, bỏ khoảng trắng thừa, 1 – 1000 ký tự. Trả về chuỗi hợp lệ hoặc null.
const cleanContent = (v) => {
  const text = typeof v === 'string' ? v.trim() : '';
  return text && text.length <= MAX_LENGTH ? text : null;
};

const getQuestions = asyncHandler(async (req, res) => {
  const questions = await Question.find({ productId: req.params.productId })
    .populate('userId', 'displayName avatar')
    .sort({ createdAt: -1 });
  res.json({ data: questions });
});

// Khách hàng đặt câu hỏi cho 1 sản phẩm đang bán. Trước đây không kiểm tra gì: hỏi được cả sản phẩm không tồn
// tại, nội dung rỗng / dài tùy ý, và tài khoản nhân viên cũng đặt được câu hỏi (userId trỏ sai bảng users).
const createQuestion = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng mới đặt câu hỏi' });
  const content = cleanContent(req.body.content);
  if (!content) return res.status(400).json({ message: `Nội dung câu hỏi từ 1 đến ${MAX_LENGTH} ký tự` });
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId, isActive: true }))) {
    return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  }
  const question = await Question.create({ productId, userId: req.account._id, content });
  const populated = await question.populate('userId', 'displayName avatar');
  res.status(201).json({ data: populated });
});

// Trả lời: khách hàng khác được góp ý (câu trả lời thường); câu trả lời mang nhãn "Cửa hàng" chỉ dành cho người
// có quyền reviews.manage (UC29 - duyệt đánh giá, trả lời hỏi đáp). Trước đây MỌI tài khoản nhân viên (kể cả nhân
// viên giao hàng chỉ có quyền giao hàng) đều trả lời được với tư cách cửa hàng.
const answerQuestion = asyncHandler(async (req, res) => {
  const content = cleanContent(req.body.content);
  if (!content) return res.status(400).json({ message: `Nội dung trả lời từ 1 đến ${MAX_LENGTH} ký tự` });
  if (!mongoose.isValidObjectId(req.params.questionId)) return res.status(404).json({ message: 'Không tìm thấy câu hỏi' });
  const question = await Question.findById(req.params.questionId);
  if (!question) return res.status(404).json({ message: 'Không tìm thấy câu hỏi' });

  const isStaffAccount = req.accountRole !== 'customer';
  if (isStaffAccount && !hasPermission(req, 'reviews.manage')) {
    return res.status(403).json({ message: 'Bạn không có quyền trả lời hỏi đáp thay cửa hàng (thiếu quyền: reviews.manage)' });
  }
  question.answers.push({
    content,
    userId: req.account._id,
    userType: isStaffAccount ? 'admin' : 'user',
    isFromShop: isStaffAccount
  });
  await question.save();
  res.status(201).json({ data: question });
});

module.exports = { getQuestions, createQuestion, answerQuestion };
