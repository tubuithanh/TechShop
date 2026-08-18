const Question = require('../models/Question');
const asyncHandler = require('../utils/asyncHandler');

const getQuestions = asyncHandler(async (req, res) => {
  const questions = await Question.find({ productId: req.params.productId })
    .populate('userId', 'displayName avatar')
    .sort({ createdAt: -1 });
  res.json({ data: questions });
});

const createQuestion = asyncHandler(async (req, res) => {
  const question = await Question.create({
    productId: req.params.productId,
    userId: req.account._id,
    content: req.body.content
  });
  const populated = await question.populate('userId', 'displayName avatar');
  res.status(201).json({ data: populated });
});

const answerQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.questionId);
  if (!question) return res.status(404).json({ message: 'Không tìm thấy câu hỏi' });

  const isFromShop = ['admin', 'staff'].includes(req.accountRole);
  question.answers.push({
    content: req.body.content,
    userId: req.account._id,
    userType: isFromShop ? 'admin' : 'user',
    isFromShop
  });
  await question.save();
  res.status(201).json({ data: question });
});

module.exports = { getQuestions, createQuestion, answerQuestion };
