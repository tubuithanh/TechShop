// Cập nhật lại toàn bộ hình ảnh (featuredImage + imageURLs) của các sản phẩm ĐÃ TỒN TẠI trong DB
// cho phù hợp với từng sản phẩm cụ thể (dùng logic minh họa nhiều góc chụp mới trong generateProducts.js),
// mà KHÔNG đụng đến _id/giá/thống kê/đơn hàng - đảm bảo không phá vỡ liên kết với Order/Review/Warranty
// đã sinh trước đó. Chạy: node scripts/updateProductImages.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const { buildImages } = require('../seed/generateProducts');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB');

  const categories = await Category.find();
  const categorySlugById = {};
  categories.forEach((c) => (categorySlugById[c._id.toString()] = c.slug));

  const brands = await Brand.find();
  const brandNameById = {};
  brands.forEach((b) => (brandNameById[b._id.toString()] = b.name));

  const products = await Product.find().select('title categoryId brandId specifications');
  console.log('Tổng số sản phẩm cần cập nhật ảnh:', products.length);

  const bulkOps = [];
  for (const p of products) {
    const categorySlug = categorySlugById[p.categoryId?.toString()] || 'phu-kien';
    const brand = brandNameById[p.brandId?.toString()] || '';
    const specs = p.specifications instanceof Map ? Object.fromEntries(p.specifications) : p.specifications || {};
    const variant = specs['Màu sắc'] || '';

    const { featuredImage, imageURLs } = buildImages({ title: p.title, categorySlug, brand, variant, specs });

    bulkOps.push({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { featuredImage, imageURLs } }
      }
    });
  }

  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < bulkOps.length; i += BATCH) {
    const batch = bulkOps.slice(i, i + BATCH);
    const res = await Product.bulkWrite(batch);
    updated += res.modifiedCount || 0;
    console.log(`Đã cập nhật ${Math.min(i + BATCH, bulkOps.length)}/${bulkOps.length}`);
  }

  console.log('Hoàn tất. Số sản phẩm đã cập nhật ảnh:', updated);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
