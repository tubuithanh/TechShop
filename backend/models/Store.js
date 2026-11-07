const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    // Trường mở rộng thêm để giữ tính năng bản đồ/chỉ đường đã làm trước đó
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    openHours: { type: String, default: '8:00 - 21:30' }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'stores' }
);

module.exports = mongoose.model('Store', storeSchema);
