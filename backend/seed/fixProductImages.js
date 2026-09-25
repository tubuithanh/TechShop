/**
 * Cập nhật lại ảnh sản phẩm của dữ liệu đang có theo bộ ảnh mới trong generateProducts.buildImages (ảnh
 * theo đúng LOẠI sản phẩm cho tai nghe/loa và phụ kiện, bỏ các ảnh lỗi/sai loại). Không xóa dữ liệu nào:
 *   - featuredImage, imageURLs, và ảnh riêng của từng phiên bản (xoay vòng theo bộ ảnh mới)
 *   - ảnh trong đánh giá của khách: ảnh nào không còn thuộc bộ ảnh mới thì thay bằng ảnh mới (giữ số lượng)
 * Chạy lại nhiều lần an toàn (kết quả giống nhau). Sản phẩm admin tự nhập ảnh (không phải ảnh Unsplash
 * seed) được giữ nguyên.
 *
 * Chạy:        node seed/fixProductImages.js
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/fixProductImages.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { buildImages } = require('./generateProducts');

const isSeedImage = (url) => !url || url.startsWith('https://images.unsplash.com/photo-');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log('Đã kết nối MongoDB:', db.databaseName);

  const catSlug = new Map((await db.collection('categories').find({}, { projection: { slug: 1 } }).toArray()).map((c) => [String(c._id), c.slug]));
  const products = await db.collection('products').find({}, { projection: { title: 1, categoryId: 1, featuredImage: 1, imageURLs: 1, variants: 1 } }).toArray();

  const productOps = [];
  const newPhotos = new Map(); // productId -> ảnh mới (để sửa ảnh đánh giá)
  let skipped = 0;
  for (const p of products) {
    if (![p.featuredImage, ...(p.imageURLs || [])].every(isSeedImage)) {
      skipped++;
      continue;
    }
    const { featuredImage, imageURLs } = buildImages({ title: p.title, categorySlug: catSlug.get(String(p.categoryId)) });
    // Mỗi MÀU 1 ảnh đại diện (các dung lượng cùng màu dùng chung ảnh), giống cách generateProducts tạo
    const colors = [...new Set((p.variants || []).map((v) => v.color))];
    const variants = (p.variants || []).map((v) => ({
      ...v,
      image: isSeedImage(v.image) ? imageURLs[colors.indexOf(v.color) % imageURLs.length] : v.image
    }));
    newPhotos.set(String(p._id), imageURLs);
    const changed =
      featuredImage !== p.featuredImage ||
      JSON.stringify(imageURLs) !== JSON.stringify(p.imageURLs) ||
      variants.some((v, i) => v.image !== p.variants[i].image);
    if (changed) productOps.push({ updateOne: { filter: { _id: p._id }, update: { $set: { featuredImage, imageURLs, variants } } } });
  }
  if (productOps.length) await db.collection('products').bulkWrite(productOps);
  console.log(`1. Đã cập nhật ảnh cho ${productOps.length}/${products.length} sản phẩm (giữ nguyên ${skipped} sản phẩm có ảnh tự nhập)`);

  // Ảnh đánh giá: thay những ảnh không còn thuộc bộ ảnh của sản phẩm
  const reviews = await db.collection('reviews').find({ 'images.0': { $exists: true } }, { projection: { productId: 1, images: 1 } }).toArray();
  const reviewOps = [];
  for (const r of reviews) {
    const photos = newPhotos.get(String(r.productId));
    if (!photos || r.images.every((img) => photos.includes(img) || !isSeedImage(img))) continue;
    const available = photos.filter((ph) => !r.images.includes(ph));
    const images = r.images.map((img) => (photos.includes(img) || !isSeedImage(img) ? img : available.splice(Math.floor(Math.random() * available.length), 1)[0] || photos[0]));
    reviewOps.push({ updateOne: { filter: { _id: r._id }, update: { $set: { images } } } });
  }
  for (let i = 0; i < reviewOps.length; i += 2000) await db.collection('reviews').bulkWrite(reviewOps.slice(i, i + 2000));
  console.log(`2. Đã cập nhật ảnh cho ${reviewOps.length}/${reviews.length} đánh giá có ảnh`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy fixProductImages:', err);
  process.exit(1);
});
