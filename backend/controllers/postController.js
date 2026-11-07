const mongoose = require('mongoose');
const { makeSlug } = require('../utils/slug');
const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');

const getPosts = asyncHandler(async (req, res) => {
  const { category, keyword } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50); // trước đây limit tùy ý (VD 100000)
  const filter = { isPublished: true };
  if (category) filter.category = category;
  Object.assign(filter, searchFilter(keyword)); // tìm không dấu theo tiêu đề, mô tả

  const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(limit).select('-content -comments');
  res.json({ data: posts });
});

const getPostBySlug = asyncHandler(async (req, res) => {
  const post = await Post.findOneAndUpdate(
    { slug: req.params.slug, isPublished: true },
    { $inc: { viewCount: 1 } },
    { new: true }
  ).populate('relatedProductIds', 'title slug featuredImage price');
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
  res.json({ data: post });
});

// @route POST /api/posts/:id/comments - bình luận bài viết (nhúng trong post.comments)
const addComment = asyncHandler(async (req, res) => {
  // Trước đây nhận bình luận rỗng / dài tùy ý, cả vào bài chưa đăng; mã bài sai thành lỗi 500
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 1000) return res.status(400).json({ message: 'Bình luận từ 1 đến 1000 ký tự' });
  const post = mongoose.isValidObjectId(req.params.id) ? await Post.findOne({ _id: req.params.id, isPublished: true }) : null;
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });

  post.comments.push({
    userId: req.account._id,
    displayName: req.account.displayName || req.account.name,
    photoURL: req.account.avatar,
    message
  });
  await post.save();
  res.status(201).json({ data: post.comments[post.comments.length - 1] });
});

// ---------- ADMIN (CMS) ----------

const getPostsAdmin = asyncHandler(async (req, res) => {
  const { q, category, published, page = 1, limit = 20 } = req.query;
  const filter = { ...searchFilter(q) };
  if (category) filter.category = category;
  if (published === 'true' || published === 'false') filter.isPublished = published === 'true';
  const posts = await Post.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Post.countDocuments(filter);
  res.json({ data: posts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

const createPost = asyncHandler(async (req, res) => {
  // Chỉ nhận các trường nội dung (giống updatePost) - trước đây { ...req.body } cho phép tự đặt lượt xem,
  // chèn bình luận giả hay ngày đăng
  const { title, category, shortDescription, content, featuredImage, relatedProductIds, isPublished, isFeatured } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) return res.status(400).json({ message: 'Tiêu đề từ 1 đến 200 ký tự' });
  const slug = makeSlug(title) + '-' + Date.now().toString().slice(-5);
  const post = await Post.create({
    title, category, shortDescription, content, featuredImage, relatedProductIds, isPublished, isFeatured,
    slug, userId: req.account._id, nameAuthor: req.account.name
  });
  res.status(201).json({ data: post });
});

const updatePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });

  // Chỉ cho phép sửa đúng các field nội dung - Object.assign(post, req.body) trước đây chấp nhận
  // BẤT KỲ field nào client gửi lên, kể cả userId/nameAuthor (tác giả) hay viewCount (lượt xem).
  const { title, category, shortDescription, content, featuredImage, relatedProductIds, isPublished, isFeatured } =
    req.body;
  if (category !== undefined) post.category = category;
  if (shortDescription !== undefined) post.shortDescription = shortDescription;
  if (content !== undefined) post.content = content;
  if (featuredImage !== undefined) post.featuredImage = featuredImage;
  if (relatedProductIds !== undefined) post.relatedProductIds = relatedProductIds;
  if (isPublished !== undefined) post.isPublished = isPublished;
  if (isFeatured !== undefined) post.isFeatured = isFeatured;
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.trim().length > 200)) {
    return res.status(400).json({ message: 'Tiêu đề từ 1 đến 200 ký tự' });
  }
  if (title !== undefined && title !== post.title) {
    post.title = title;
    // Đổi tiêu đề thì tạo lại slug (URL bài viết) để khớp tiêu đề mới - trước đây title đổi nhưng
    // slug giữ nguyên vĩnh viễn, khiến URL không còn phản ánh đúng nội dung.
    post.slug = makeSlug(title) + '-' + post._id.toString().slice(-5);
  }

  try {
    await post.save();
    res.json({ data: post });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Tiêu đề bài viết trùng với bài viết khác, vui lòng đổi tiêu đề' });
    throw err;
  }
});

const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
  await post.deleteOne();
  res.json({ message: 'Đã xóa bài viết' });
});

const MAX_BULK = 500;
// Chuỗi admin phải gõ đúng khi xóa TẤT CẢ bài viết (chặn bấm nhầm / gọi API vô tình)
const DELETE_ALL_CONFIRM = 'XOA TAT CA';

// @route POST /api/posts/bulk-delete { ids: [...] } - xóa nhiều bài đã chọn (chỉ admin)
const bulkDeletePosts = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(String))] : [];
  if (!ids.length) return res.status(400).json({ message: 'Chưa chọn bài viết nào' });
  if (ids.length > MAX_BULK) return res.status(400).json({ message: `Mỗi lần xóa tối đa ${MAX_BULK} bài` });
  if (!ids.every((id) => mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Danh sách bài viết không hợp lệ' });
  const { deletedCount } = await Post.deleteMany({ _id: { $in: ids } });
  res.json({ message: `Đã xóa ${deletedCount} bài viết`, deletedCount });
});

// @route DELETE /api/posts { confirm: 'XOA TAT CA' } - xóa TOÀN BỘ bài viết (chỉ admin)
const deleteAllPosts = asyncHandler(async (req, res) => {
  if (req.body?.confirm !== DELETE_ALL_CONFIRM) {
    return res.status(400).json({ message: `Vui lòng xác nhận bằng cách gõ "${DELETE_ALL_CONFIRM}"` });
  }
  const { deletedCount } = await Post.deleteMany({});
  res.json({ message: `Đã xóa toàn bộ ${deletedCount} bài viết`, deletedCount });
});

module.exports = {
  getPosts,
  getPostBySlug,
  addComment,
  getPostsAdmin,
  createPost,
  updatePost,
  deletePost,
  bulkDeletePosts,
  deleteAllPosts,
  DELETE_ALL_CONFIRM
};
