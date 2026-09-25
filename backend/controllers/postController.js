const slugify = require('slugify');
const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');

const getPosts = asyncHandler(async (req, res) => {
  const { category, keyword, limit = 12 } = req.query;
  const filter = { isPublished: true };
  if (category) filter.category = category;
  if (keyword) filter.$text = { $search: keyword };

  const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).select('-content -comments');
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
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });

  post.comments.push({
    userId: req.account._id,
    displayName: req.account.displayName || req.account.name,
    photoURL: req.account.avatar,
    message: req.body.message
  });
  await post.save();
  res.status(201).json({ data: post.comments[post.comments.length - 1] });
});

// ---------- ADMIN (CMS) ----------

const getPostsAdmin = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const posts = await Post.find()
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Post.countDocuments();
  res.json({ data: posts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

const createPost = asyncHandler(async (req, res) => {
  const { title } = req.body;
  const slug = slugify(title, { lower: true, locale: 'vi', remove: /[:?!,.;'"()]/g }) + '-' + Date.now().toString().slice(-5);
  const post = await Post.create({ ...req.body, slug, userId: req.account._id, nameAuthor: req.account.name });
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
  if (title !== undefined && title !== post.title) {
    post.title = title;
    // Đổi tiêu đề thì tạo lại slug (URL bài viết) để khớp tiêu đề mới - trước đây title đổi nhưng
    // slug giữ nguyên vĩnh viễn, khiến URL không còn phản ánh đúng nội dung.
    post.slug = slugify(title, { lower: true, locale: 'vi', remove: /[:?!,.;'"()]/g }) + '-' + post._id.toString().slice(-5);
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

module.exports = { getPosts, getPostBySlug, addComment, getPostsAdmin, createPost, updatePost, deletePost };
