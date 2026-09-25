/**
 * Script một lần: gắn mẫu thông số kỹ thuật (utils/specTemplates.js) vào các danh mục đã có trong
 * database, để trang chi tiết/so sánh hiển thị thông số theo nhóm và form quản trị hiện đúng các ô nhập.
 *
 * Tùy chọn --fill-products: bổ sung thêm các thông số chi tiết còn THIẾU cho sản phẩm đã có (sinh theo
 * seed/extraSpecs.js - chỉ phù hợp với dữ liệu mẫu). KHÔNG BAO GIỜ ghi đè giá trị đã có.
 *
 * Chạy:        node seed/backfillSpecTemplates.js [--fill-products]
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/backfillSpecTemplates.js [--fill-products]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
require('../models/Brand');
const { SPEC_TEMPLATES } = require('../utils/specTemplates');
const { buildExtraSpecs } = require('./extraSpecs');

async function run() {
  const fillProducts = process.argv.includes('--fill-products');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.name);

  const categories = await Category.find();
  const slugById = new Map();
  for (const category of categories) {
    slugById.set(category._id.toString(), category.slug);
    const template = SPEC_TEMPLATES[category.slug];
    if (!template) {
      console.log(`- Bỏ qua danh mục "${category.name}" (chưa có mẫu thông số cho slug "${category.slug}")`);
      continue;
    }
    await Category.updateOne({ _id: category._id }, { $set: { specTemplate: template } });
    console.log(`- Đã gắn mẫu thông số cho "${category.name}" (${template.length} nhóm)`);
  }

  if (!fillProducts) {
    console.log('Hoàn tất. (Chạy thêm --fill-products nếu muốn bổ sung thông số chi tiết cho sản phẩm mẫu đã có.)');
    await mongoose.disconnect();
    return;
  }

  const products = await Product.find({}, 'title categoryId brandId specifications').populate('brandId', 'name');
  let updated = 0;
  for (const product of products) {
    const slug = slugById.get(String(product.categoryId));
    if (!slug) continue;
    const current = product.specifications ? Object.fromEntries(product.specifications) : {};
    const extras = buildExtraSpecs(slug, { brand: product.brandId?.name, variant: product.title, specs: current });
    const $set = {};
    for (const [key, value] of Object.entries(extras)) {
      if (current[key] === undefined || current[key] === '') $set[`specifications.${key}`] = value;
    }
    if (Object.keys($set).length) {
      await Product.updateOne({ _id: product._id }, { $set });
      updated++;
    }
  }
  console.log(`Hoàn tất: đã bổ sung thông số chi tiết cho ${updated}/${products.length} sản phẩm.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillSpecTemplates:', err);
  process.exit(1);
});
