const mongoose = require('mongoose');

// Đánh giá hiệu suất cuối năm + tiền thưởng của 1 nhân viên (mỗi năm 1 bản ghi)
const staffReviewSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    year: { type: Number, required: true },
    rating: { type: Number, min: 1, max: 5, required: true }, // 1 = chưa đạt ... 5 = xuất sắc
    bonus: { type: Number, min: 0, default: 0 },
    strengths: { type: String, trim: true, maxlength: 1000, default: '' },
    improvements: { type: String, trim: true, maxlength: 1000, default: '' },
    // Số liệu hiệu suất chụp lại lúc đánh giá (để sau này dữ liệu đổi vẫn biết căn cứ chấm)
    metricsSnapshot: { type: mongoose.Schema.Types.Mixed },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'staff_reviews' }
);

staffReviewSchema.index({ staffId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('StaffReview', staffReviewSchema);
