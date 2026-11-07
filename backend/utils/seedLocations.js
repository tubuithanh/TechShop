const Province = require('../models/Province');
const Ward = require('../models/Ward');
const { buildSearchTokens } = require('./search');
const DEFAULT_DATA = require('../data/vn-locations.json');

// Nạp dữ liệu tỉnh/thành, phường/xã mặc định (34 tỉnh, 3.321 phường/xã - nguồn provinces.open-api.vn v2).
// Chỉ THÊM những mục còn thiếu (so theo tên), không sửa/xóa dữ liệu admin đã chỉnh -> chạy lại nhiều lần an toàn.
// Trả về { provinces, wards } = số mục mới thêm.
async function seedDefaultLocations() {
  let addedProvinces = 0;
  let addedWards = 0;
  for (const [index, p] of DEFAULT_DATA.entries()) {
    let province = await Province.findOne({ name: p.name });
    if (!province) {
      province = await Province.create({ name: p.name, code: p.code, sortOrder: index + 1 });
      addedProvinces++;
    }
    const existing = new Set((await Ward.find({ provinceId: province._id }).select('name').lean()).map((w) => w.name));
    const missing = p.wards.filter((w) => !existing.has(w.name));
    if (missing.length) {
      // insertMany không chạy hook validate của plugin -> tự tính searchTokens
      await Ward.insertMany(
        missing.map((w) => ({ provinceId: province._id, name: w.name, code: w.code, searchTokens: buildSearchTokens([w.name]) })),
        { ordered: false }
      );
      addedWards += missing.length;
    }
  }
  return { provinces: addedProvinces, wards: addedWards };
}

// Gọi khi khởi động server: nếu chưa có tỉnh nào thì nạp dữ liệu mặc định
async function ensureLocationsSeeded() {
  if (await Province.estimatedDocumentCount()) return null;
  return seedDefaultLocations();
}

module.exports = { seedDefaultLocations, ensureLocationsSeeded };
