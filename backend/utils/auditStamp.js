// ĐÓNG DẤU NGƯỜI THAO TÁC lên bản ghi: ai tạo, ai sửa / ẩn gần nhất, lúc nào (trường `audit` trên mọi bảng chính).
//
// Cách hoạt động:
//   1. requestContext (AsyncLocalStorage): mỗi request có 1 vùng nhớ riêng; middleware protect ghi người đang thao
//      tác (chỉ admin / nhân viên - khách hàng không đóng dấu).
//   2. Plugin Mongoose (đăng ký TOÀN CỤC trước khi nạp model, xem app.js) tự gắn dấu khi save() / update.
//   3. Chỉ đóng dấu ĐÚNG đối tượng của trang đang thao tác (RESOURCE_MODELS theo đường dẫn API) - VD giao hàng xong
//      làm tăng "đã bán" của sản phẩm thì KHÔNG bị coi là "nhân viên giao hàng đã sửa sản phẩm".
// Thao tác XÓA HẲN (không còn bản ghi để đóng dấu) vẫn được ghi ở Nhật ký thao tác (middlewares/auditLogger.js).
const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const storage = new AsyncLocalStorage();

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
  const segment = (req.path.match(/^\/api\/([^/?]+)/) || [])[1];
  storage.run({ models: new Set(RESOURCE_MODELS[segment] || []), actor: null }, next);
}

// Gọi trong protect sau khi xác thực: chỉ admin / nhân viên mới được ghi là người thao tác
function setActor(account, role) {
  const store = storage.getStore();
  if (store && (role === 'admin' || role === 'staff')) {
    store.actor = { id: account._id, name: account.name || account.email || 'Nhân viên', role };
  }
}

// Người thao tác nếu model này thuộc trang đang thao tác
function actorFor(modelName) {
  const store = storage.getStore();
  if (!store?.actor || !store.models.has(modelName)) return null;
  return store.actor;
}

function auditPlugin(schema) {
  if (schema.path('audit')) return;
  const ObjectId = mongoose.Schema.Types.ObjectId;
  schema.add({
    audit: {
      createdBy: { type: ObjectId, ref: 'Admin' },
      createdByName: String,
      createdAt: Date,
      updatedBy: { type: ObjectId, ref: 'Admin' },
      updatedByName: String,
      updatedAt: Date,
      action: { type: String } // create | update | deactivate | activate
    }
  });

  schema.pre('save', function () {
    const a = actorFor(this.constructor.modelName);
    if (!a) return;
    const now = new Date();
    if (this.isNew) {
      this.set('audit.createdBy', a.id);
      this.set('audit.createdByName', a.name);
      this.set('audit.createdAt', now);
    }
    let action = this.isNew ? 'create' : 'update';
    if (!this.isNew && this.isModified('isActive') && schema.path('isActive')) action = this.get('isActive') === false ? 'deactivate' : 'activate';
    this.set('audit.updatedBy', a.id);
    this.set('audit.updatedByName', a.name);
    this.set('audit.updatedAt', now);
    this.set('audit.action', action);
  });

  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
    const a = actorFor(this.model.modelName);
    if (!a) return;
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return; // cập nhật dạng pipeline: bỏ qua
    const $set = update.$set || {};
    const activeVal = $set.isActive !== undefined ? $set.isActive : update.isActive;
    const action = activeVal === false ? 'deactivate' : activeVal === true ? 'activate' : 'update';
    const now = new Date();
    const next = {
      ...update,
      $set: { ...$set, 'audit.updatedBy': a.id, 'audit.updatedByName': a.name, 'audit.updatedAt': now, 'audit.action': action }
    };
    if (this.getOptions().upsert) {
      next.$setOnInsert = { ...(update.$setOnInsert || {}), 'audit.createdBy': a.id, 'audit.createdByName': a.name, 'audit.createdAt': now };
    }
    this.setUpdate(next);
  });

  // insertMany (VD: tạo nhiều bản ghi cùng lúc)
  schema.pre('insertMany', function (next, docs) {
    const a = actorFor(this.modelName);
    if (a && Array.isArray(docs)) {
      const now = new Date();
      for (const d of docs) {
        d.audit = { createdBy: a.id, createdByName: a.name, createdAt: now, updatedBy: a.id, updatedByName: a.name, updatedAt: now, action: 'create' };
      }
    }
    next();
  });
}

module.exports = { requestContext, setActor, actorFor, auditPlugin, RESOURCE_MODELS };
