const mongoose = require('mongoose');
const { themeSchemaDefinition } = require('../utils/themes');

// Template màu sắc giao diện lưu sẵn để admin chọn nhanh (Cấu hình hệ thống -> Màu sắc giao diện)
const themeTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', trim: true, maxlength: 200 },
    // Template có sẵn của hệ thống: 'default' | 'christmas' | 'tet' | 'autumn'; template admin tự tạo để null
    builtInKey: { type: String, default: null },
    theme: themeSchemaDefinition,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'theme_templates' }
);

themeTemplateSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('ThemeTemplate', themeTemplateSchema);
