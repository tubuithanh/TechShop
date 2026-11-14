// ĐÓNG DẤU NGƯỜI THAO TÁC lên bản ghi: ai tạo, ai sửa / ẩn gần nhất, lúc nào (trường `audit` trên mọi bảng chính).
//
// Cách hoạt động:
//   1. requestContext (AsyncLocalStorage): mỗi request có 1 vùng nhớ riêng; middleware protect ghi người đang thao
//      tác (chỉ admin / nhân viên - khách hàng không đóng dấu).
//   2. Plugin Mongoose (đăng ký TOÀN CỤC trước khi nạp model, xem app.js) tự gắn dấu khi save() / update.
//   3. Chỉ đóng dấu ĐÚNG đối tượng của trang đang thao tác (RESOURCE_MODELS theo đường dẫn API) - VD giao hàng xong
//      làm tăng "đã bán" của sản phẩm thì KHÔNG bị coi là "nhân viên giao hàng đã sửa sản phẩm".
// Thao tác XÓA HẲN (không còn bản ghi để đóng dấu) vẫn được ghi ở Nhật ký thao tác (middlewares/auditLogger.js).
const { AsyncLocalStorage } = require('async_hooks'); // "vùng nhớ theo luồng bất đồng bộ": mỗi request thấy dữ liệu riêng của nó
const mongoose = require('mongoose');

const storage = new AsyncLocalStorage(); // kho chứa ngữ cảnh của từng request

// Đường dẫn API -> các bảng thuộc trang quản trị đó
const RESOURCE_MODELS = {
  products: ['Product', 'Question'],
  categories: ['Category'],
  brands: ['Brand'],
  collections: ['ProductCollection'],
  'store-inventories': ['StoreInventory'],
  orders: ['Order', 'OrderTransfer', 'Warranty'],
  deliveries: ['Order'],
  warranties: ['Warranty'],
  'warranty-cards': ['WarrantyCard', 'WarrantyPlan', 'Brand'],
  vouchers: ['Voucher'],
  promotions: ['Promotion'],
  posts: ['Post'],
  slides: ['Slide'],
  stores: ['Store', 'Admin'],
  staff: ['Admin', 'StaffAssignment', 'StaffReview'],
  'permission-groups': ['PermissionGroup'],
  users: ['User'],
  reviews: ['Review'],
  locations: ['Province', 'Ward'],
  settings: ['Setting', 'PaymentConfig', 'ShippingConfig', 'MailConfig', 'ThemeTemplate']
};

// Middleware đặt ĐẦU chuỗi xử lý: mở vùng nhớ cho request, ghi nhận đang ở trang nào
function requestContext(req, res, next) {
  const segment = (req.path.match(/^\/api\/([^/?]+)/) || [])[1]; // "/api/products/123" -> "products"
  // Mọi code chạy bên trong next() (kể cả hàm async gọi sau) đều đọc được vùng nhớ này qua storage.getStore()
  storage.run({ models: new Set(RESOURCE_MODELS[segment] || []), actor: null }, next);
}

// Gọi trong protect sau khi xác thực: chỉ admin / nhân viên mới được ghi là người thao tác
function setActor(account, role) {
  const store = storage.getStore(); // vùng nhớ của request hiện tại
  if (store && (role === 'admin' || role === 'staff')) {
    store.actor = { id: account._id, name: account.name || account.email || 'Nhân viên', role }; // lưu người thao tác
  }
}

// Người thao tác nếu model này thuộc trang đang thao tác
function actorFor(modelName) {
  const store = storage.getStore();
  if (!store?.actor || !store.models.has(modelName)) return null; // không có người thao tác / model không thuộc trang -> không đóng dấu
  return store.actor;
}

// Plugin Mongoose: thêm trường `audit` và các hook tự đóng dấu
function auditPlugin(schema) {
  if (schema.path('audit')) return; // schema đã có audit (gắn 2 lần) -> bỏ qua
  const ObjectId = mongoose.Schema.Types.ObjectId;
  schema.add({ // thêm trường audit vào schema
    audit: {
      createdBy: { type: ObjectId, ref: 'Admin' }, // ai tạo
      createdByName: String, // tên người tạo (lưu sẵn để không phải tra cứu)
      createdAt: Date, // lúc tạo
      updatedBy: { type: ObjectId, ref: 'Admin' }, // ai sửa gần nhất
      updatedByName: String,
      updatedAt: Date, // lúc sửa gần nhất
      action: { type: String } // create | update | deactivate | activate
    }
  });

  // Trường hợp 1: doc.save()
  schema.pre('save', function () {
    const a = actorFor(this.constructor.modelName); // người thao tác (nếu được đóng dấu)
    if (!a) return;
    const now = new Date();
    if (this.isNew) { // bản ghi mới -> ghi người tạo
      this.set('audit.createdBy', a.id);
      this.set('audit.createdByName', a.name);
      this.set('audit.createdAt', now);
    }
    let action = this.isNew ? 'create' : 'update'; // loại thao tác
    // Đổi trường isActive -> ghi rõ là "ẩn" hay "hiện lại"
    if (!this.isNew && this.isModified('isActive') && schema.path('isActive')) action = this.get('isActive') === false ? 'deactivate' : 'activate';
    this.set('audit.updatedBy', a.id); // người sửa gần nhất
    this.set('audit.updatedByName', a.name);
    this.set('audit.updatedAt', now);
    this.set('audit.action', action);
  });

  // Trường hợp 2: Model.findOneAndUpdate / updateOne / updateMany
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
    const a = actorFor(this.model.modelName);
    if (!a) return;
    const update = this.getUpdate(); // nội dung cập nhật
    if (!update || Array.isArray(update)) return; // cập nhật dạng pipeline: bỏ qua
    const $set = update.$set || {};
    const activeVal = $set.isActive !== undefined ? $set.isActive : update.isActive; // isActive có thể nằm trong $set hoặc ngoài
    const action = activeVal === false ? 'deactivate' : activeVal === true ? 'activate' : 'update';
    const now = new Date();
    const next = { // nội dung cập nhật mới = cũ + dấu người sửa
      ...update,
      $set: { ...$set, 'audit.updatedBy': a.id, 'audit.updatedByName': a.name, 'audit.updatedAt': now, 'audit.action': action }
    };
    if (this.getOptions().upsert) { // upsert (chưa có thì tạo mới) -> ghi người tạo khi chèn mới
      next.$setOnInsert = { ...(update.$setOnInsert || {}), 'audit.createdBy': a.id, 'audit.createdByName': a.name, 'audit.createdAt': now };
    }
    this.setUpdate(next); // thay nội dung cập nhật
  });

  // Trường hợp 3: insertMany (VD: tạo nhiều bản ghi cùng lúc)
  schema.pre('insertMany', function (next, docs) {
    const a = actorFor(this.modelName);
    if (a && Array.isArray(docs)) {
      const now = new Date();
      for (const d of docs) { // gắn dấu cho từng bản ghi
        d.audit = { createdBy: a.id, createdByName: a.name, createdAt: now, updatedBy: a.id, updatedByName: a.name, updatedAt: now, action: 'create' };
      }
    }
    next();
  });
}

module.exports = { requestContext, setActor, actorFor, auditPlugin, RESOURCE_MODELS };
