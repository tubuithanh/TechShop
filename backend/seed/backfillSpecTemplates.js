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
const { computeSpecNumbers } = require('../utils/specNumbers');

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

  // specNumbers (giá trị số tách từ thông số, dùng cho bộ lọc/so sánh) LUÔN được tính lại cho mọi sản
  // phẩm - updateOne bỏ qua hook pre('validate') của model nên phải tự tính ở đây. Đây là dữ liệu dẫn
  // xuất, tính lại bao nhiêu lần cũng không làm mất gì.
  const products = await Product.find({}, 'title categoryId brandId specifications').populate('brandId', 'name');
  let filled = 0;
  for (const product of products) {
    const current = product.specifications ? Object.fromEntries(product.specifications) : {};
    const $set = {};
    const slug = slugById.get(String(product.categoryId?._id || product.categoryId));
    if (fillProducts && slug) {
      const extras = buildExtraSpecs(slug, { brand: product.brandId?.name, variant: product.title, specs: current });
      for (const [key, value] of Object.entries(extras)) {
        if (current[key] === undefined || current[key] === '') {
          $set[`specifications.${key}`] = value;
          current[key] = value;
        }
      }
      if (Object.keys($set).length) filled++;
    }
    $set.specNumbers = computeSpecNumbers(current, slug);
    await Product.updateOne({ _id: product._id }, { $set });
  }
  console.log(`Đã tính lại giá trị số (bộ lọc thông số) cho ${products.length} sản phẩm.`);
  if (fillProducts) console.log(`Đã bổ sung thông số chi tiết cho ${filled}/${products.length} sản phẩm.`);
  else console.log('(Chạy thêm --fill-products nếu muốn bổ sung thông số chi tiết cho sản phẩm mẫu đã có.)');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillSpecTemplates:', err);
  process.exit(1);
});
