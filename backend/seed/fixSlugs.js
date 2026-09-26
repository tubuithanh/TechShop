/**
 * Sửa đường dẫn (slug) chứa ký tự không hợp lệ cho URL (VD "/" trong "32gb/1tb-ssd") của dữ liệu đang có -
 * các link này mở ra trang trắng. Chỉ giữ chữ thường, số, dấu gạch ngang; nếu trùng slug khác thì thêm hậu
 * tố. Không đụng tới bản ghi có slug hợp lệ; chạy lại nhiều lần an toàn.
 *
 * Chạy:        node seed/fixSlugs.js
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/fixSlugs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const COLLECTIONS = ['posts', 'products', 'categories', 'brands'];
const clean = (slug) => slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log('Đã kết nối MongoDB:', db.databaseName);
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const bad = await col.find({ slug: { $type: 'string', $not: /^[a-z0-9-]+$/ } }, { projection: { slug: 1 } }).toArray();
    let fixed = 0;
    for (const doc of bad) {
      const base = clean(doc.slug) || String(doc._id);
      let slug = base;
      for (let n = 2; await col.findOne({ slug, _id: { $ne: doc._id } }); n++) slug = `${base}-${n}`;
      await col.updateOne({ _id: doc._id }, { $set: { slug } });
      fixed++;
    }
    console.log(`- ${name}: sửa ${fixed} đường dẫn`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy fixSlugs:', err);
  process.exit(1);
});
