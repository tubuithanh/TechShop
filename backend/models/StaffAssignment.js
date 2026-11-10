const mongoose = require('mongoose');

// Quá trình làm việc của nhân viên tại các chi nhánh - mỗi bản ghi là 1 giai đoạn:
//   home:     chi nhánh chính (tự ghi khi admin đổi chi nhánh của nhân viên)
//   transfer: điều chuyển / biệt phái TẠM THỜI (VD: 6 tháng) - trong thời gian này nhân viên làm việc ở chi nhánh
//             mới thay cho chi nhánh chính; hết endDate tự quay về chi nhánh chính (không cần thao tác)
//   manage:   phụ trách quản lý thêm 1 chi nhánh
// Dùng cho thống kê, tính thưởng, đánh giá cuối năm (số ngày làm ở từng chi nhánh, doanh số theo giai đoạn).
const staffAssignmentSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    kind: { type: String, enum: ['home', 'transfer', 'manage'], required: true },
    title: { type: String, trim: true, default: '' }, // chức danh trong giai đoạn này
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }, // null = chưa kết thúc
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    cancelled: { type: Boolean, default: false }, // hủy điều chuyển trước khi bắt đầu
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    endNote: { type: String, trim: true, maxlength: 300, default: '' }
  },
  { timestamps: true, collection: 'staff_assignments' }
);

staffAssignmentSchema.index({ staffId: 1, startDate: -1 });
staffAssignmentSchema.index({ storeId: 1, kind: 1 });

// Trạng thái tại thời điểm now
staffAssignmentSchema.methods.stateAt = function (now = new Date()) {
  if (this.cancelled) return 'cancelled';
  if (this.startDate > now) return 'upcoming';
  if (this.endDate && this.endDate <= now) return 'ended';
  return 'active';
};

module.exports = mongoose.model('StaffAssignment', staffAssignmentSchema);
