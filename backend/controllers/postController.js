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
  const posts = await Post.find().sort({ createdAt: -1 });
  res.json({ data: posts });
});

const createPost = asyncHandler(async (req, res) => {
  const { title } = req.body;
  const slug = slugify(title, { lower: true, locale: 'vi' }) + '-' + Date.now().toString().slice(-5);
  const post = await Post.create({ ...req.body, slug, userId: req.account._id, nameAuthor: req.account.name });
  res.status(201).json({ data: post });
});

const updatePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
  Object.assign(post, req.body);
  await post.save();
  res.json({ data: post });
});

const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
  await post.deleteOne();
  res.json({ message: 'Đã xóa bài viết' });
});

module.exports = { getPosts, getPostBySlug, addComment, getPostsAdmin, createPost, updatePost, deletePost };
