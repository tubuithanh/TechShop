/**
 * Script tạo dữ liệu mẫu (seed data) - đã cập nhật khớp 100% với thiết kế
 * database "ecommerce_multistore_db" (multi-store, admins tách riêng users).
 * Chạy: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generateProducts } = require('./generateProducts');
const { generateCustomers } = require('./generateCustomers');
const { generateOrders } = require('./generateOrders');
const { generateReviews } = require('./generateReviews');
const { generateWarranties } = require('./generateWarranties');
const { generatePosts } = require('./generatePosts');

const User = require('../models/User');
const Admin = require('../models/Admin');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const ProductCollection = require('../models/ProductCollection');
const Voucher = require('../models/Voucher');
const Post = require('../models/Post');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Warranty = require('../models/Warranty');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecommerce_multistore_db');
  console.log('[Seed] Đã kết nối DB, bắt đầu xóa dữ liệu cũ...');

  await Promise.all([
    User.deleteMany({}),
    Admin.deleteMany({}),
    Brand.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Store.deleteMany({}),
    StoreInventory.deleteMany({}),
    ProductCollection.deleteMany({}),
    Voucher.deleteMany({}),
    Post.deleteMany({}),
    Order.deleteMany({}),
    Review.deleteMany({}),
    Warranty.deleteMany({})
  ]);

  // ----- Admins (collection riêng biệt) -----
  const admin = await Admin.create({
    name: 'Quản trị viên',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin'
  });
  const staff = await Admin.create({
    name: 'Nhân viên bán hàng',
    email: 'staff@example.com',
    password: 'staff123',
    role: 'staff'
  });
  console.log('[Seed] Đã tạo admin:', admin.email, '| staff:', staff.email);

  // ----- Users (khách hàng) -----
  const customer = await User.create({
    displayName: 'Nguyễn Văn A',
    email: 'customer@example.com',
    phoneNumber: '0900000003',
    password: 'customer123',
    addresses: [
      {
        addressLine1: '123 Đường Lê Lợi',
        addressLine2: 'Phường Bến Nghé',
        city: 'TP. Hồ Chí Minh',
        state: 'TP. Hồ Chí Minh',
        pincode: '700000',
        orderNote: ''
      }
    ]
  });
  console.log('[Seed] Đã tạo customer:', customer.email);

  // ----- 1000 khách hàng mẫu -----
  // insertMany() không chạy middleware pre('save') của User (nơi tự băm mật khẩu), nên băm
  // sẵn 1 lần rồi dùng chung cho toàn bộ 1000 khách hàng mẫu (đều đăng nhập được bằng "customer123").
  const sampleCustomerPasswordHash = await bcrypt.hash('customer123', 8);
  const customerDefs = generateCustomers(1000, sampleCustomerPasswordHash);
  const sampleCustomers = await User.insertMany(customerDefs);
  const allCustomers = [customer, ...sampleCustomers];
  console.log(`[Seed] Đã tạo ${sampleCustomers.length} khách hàng mẫu`);

  // ----- Brands (đủ thương hiệu cho mọi danh mục sản phẩm mẫu) -----
  const BRAND_NAMES = [
    'Apple', 'Samsung', 'Xiaomi', 'ASUS', 'OPPO', 'Vivo', 'Realme', 'Nokia',
    'Dell', 'HP', 'Lenovo', 'Acer', 'MSI', 'LG', 'Sony', 'JBL', 'Marshall',
    'Anker', 'Baseus', 'Logitech', 'Amazfit', 'Garmin'
  ];
  const brandDocs = await Brand.insertMany(BRAND_NAMES.map((name) => ({ name, image: '' })));
  const brandIdByName = {};
  brandDocs.forEach((b) => (brandIdByName[b.name] = b._id));
  console.log(`[Seed] Đã tạo ${brandDocs.length} thương hiệu`);

  // ----- Categories -----
  const CATEGORY_LIST = [
    { name: 'Điện thoại', slug: 'dien-thoai' },
    { name: 'Laptop', slug: 'laptop' },
    { name: 'Máy tính bảng', slug: 'may-tinh-bang' },
    { name: 'Đồng hồ thông minh', slug: 'dong-ho-thong-minh' },
    { name: 'Tai nghe - Loa', slug: 'tai-nghe-loa' },
    { name: 'Màn hình', slug: 'man-hinh' },
    { name: 'Phụ kiện', slug: 'phu-kien' }
  ];
  const categoryDocs = await Category.insertMany(CATEGORY_LIST);
  const categoryIdBySlug = {};
  const categoryLabelBySlug = {};
  categoryDocs.forEach((c) => {
    categoryIdBySlug[c.slug] = c._id;
    categoryLabelBySlug[c.slug] = c.name;
  });
  console.log(`[Seed] Đã tạo ${categoryDocs.length} danh mục`);

  // ----- Stores (đa chi nhánh) -----
  const store1 = await Store.create({
    name: 'TechShop Quận 1',
    phoneNumber: '028.1234.5678',
    email: 'q1@techshop.demo',
    address: '123 Đường Lê Lợi, Phường Bến Nghé, Quận 1',
    city: 'TP. Hồ Chí Minh',
    state: 'TP. Hồ Chí Minh',
    lat: 10.7769,
    lng: 106.7009
  });
  const store2 = await Store.create({
    name: 'TechShop Cầu Giấy',
    phoneNumber: '024.3456.7890',
    email: 'cg@techshop.demo',
    address: '88 Đường Xuân Thủy, Phường Dịch Vọng, Quận Cầu Giấy',
    city: 'Hà Nội',
    state: 'Hà Nội',
    lat: 21.0368,
    lng: 105.7827
  });
  const store3 = await Store.create({
    name: 'TechShop Hải Châu',
    phoneNumber: '0236.1234.567',
    email: 'dn@techshop.demo',
    address: '12 Đường Trần Phú, Quận Hải Châu',
    city: 'Đà Nẵng',
    state: 'Đà Nẵng',
    lat: 16.0678,
    lng: 108.2208
  });
  console.log('[Seed] Đã tạo 3 cửa hàng (multi-store)');

  // ----- Products (1000 sản phẩm mẫu, đa danh mục/thương hiệu, nhiều ảnh + thông số chi tiết) -----
  const productDefs = generateProducts({ brandIdByName, categoryIdBySlug, categoryLabelBySlug });
  const productsToInsert = productDefs.map(({ _brandName, _categorySlug, ...rest }) => rest);
  const createdProducts = await Product.insertMany(productsToInsert);
  console.log(`[Seed] Đã tạo ${createdProducts.length} sản phẩm`);

  // Tra cứu nhanh theo (thương hiệu, danh mục) để gán vào collection/bài viết bên dưới,
  // dựa vào việc insertMany giữ nguyên thứ tự của mảng đầu vào.
  function findProductIndex(brandName, categorySlug) {
    return productDefs.findIndex((p) => p._brandName === brandName && p._categorySlug === categorySlug);
  }
  const idxAppleFirstPhone = findProductIndex('Apple', 'dien-thoai');
  const idxSamsungFirstPhone = findProductIndex('Samsung', 'dien-thoai');
  const idxXiaomiFirstPhone = findProductIndex('Xiaomi', 'dien-thoai');
  const idxAsusFirstLaptop = findProductIndex('ASUS', 'laptop');

  // ----- Store Inventories (tồn kho riêng theo từng cửa hàng - mô hình multi-store) -----
  const stores = [store1, store2, store3];
  const inventoryDocs = [];
  for (const product of createdProducts) {
    for (const store of stores) {
      inventoryDocs.push({
        storeId: store._id,
        productId: product._id,
        stock: Math.floor(Math.random() * 30) + 5, // 5-34 sản phẩm mỗi cửa hàng
        lowStockThreshold: 5,
        lastUpdated: new Date()
      });
    }
  }
  await StoreInventory.insertMany(inventoryDocs);
  console.log(`[Seed] Đã tạo ${inventoryDocs.length} bản ghi tồn kho (${createdProducts.length} sản phẩm × ${stores.length} cửa hàng)`);

  // ----- 1000 đơn hàng mẫu -----
  const orderDefs = generateOrders(1000, { customers: allCustomers, products: createdProducts, stores });
  const createdOrders = await Order.insertMany(orderDefs);
  console.log(`[Seed] Đã tạo ${createdOrders.length} đơn hàng`);

  // ----- 1000 đánh giá sản phẩm mẫu -----
  const reviewDefs = generateReviews(1000, { customers: allCustomers, products: createdProducts });
  const createdReviews = await Review.insertMany(reviewDefs);
  console.log(`[Seed] Đã tạo ${createdReviews.length} đánh giá sản phẩm`);

  // ----- 1000 phiếu bảo hành mẫu (luôn gắn với 1 đơn hàng + sản phẩm có thật trong đơn) -----
  const warrantyDefs = generateWarranties(1000, { orders: createdOrders, admins: [admin, staff] });
  const createdWarranties = await Warranty.insertMany(warrantyDefs);
  console.log(`[Seed] Đã tạo ${createdWarranties.length} phiếu bảo hành`);

  // ----- Đồng bộ soldCount/ratingAverage/ratingCount trên Product theo đúng Order/Review vừa tạo -----
  // (trước đây 3 trường này là số ngẫu nhiên độc lập, không khớp với dữ liệu đơn hàng/đánh giá thật)
  const soldCountByProduct = new Map();
  for (const order of createdOrders) {
    for (const item of order.items) {
      const key = String(item.productId);
      soldCountByProduct.set(key, (soldCountByProduct.get(key) || 0) + item.quantity);
    }
  }
  const ratingStatsByProduct = new Map();
  for (const review of createdReviews) {
    if (review.status !== 'visible') continue; // chỉ tính đánh giá đang hiển thị công khai
    const key = String(review.productId);
    const stat = ratingStatsByProduct.get(key) || { sum: 0, count: 0 };
    stat.sum += review.rating;
    stat.count += 1;
    ratingStatsByProduct.set(key, stat);
  }
  const productStatsBulkOps = createdProducts.map((p) => {
    const key = String(p._id);
    const soldCount = soldCountByProduct.get(key) || 0;
    const stat = ratingStatsByProduct.get(key);
    const ratingCount = stat ? stat.count : 0;
    const ratingAverage = stat ? Number((stat.sum / stat.count).toFixed(1)) : 0;
    return {
      updateOne: { filter: { _id: p._id }, update: { $set: { soldCount, ratingAverage, ratingCount } } }
    };
  });
  await Product.bulkWrite(productStatsBulkOps);
  console.log(`[Seed] Đã đồng bộ soldCount/ratingAverage/ratingCount cho ${productStatsBulkOps.length} sản phẩm theo đơn hàng & đánh giá thực tế`);

  // ----- Collections (bộ sưu tập sản phẩm) -----
  const featuredProductIds = createdProducts.filter((p) => p.isFeatured).slice(0, 12).map((p) => p._id);
  await ProductCollection.create([
    {
      title: 'Flagship nổi bật',
      subTitle: 'Những sản phẩm cao cấp được yêu thích nhất',
      image: '',
      productIds: [createdProducts[idxAppleFirstPhone]._id, createdProducts[idxSamsungFirstPhone]._id]
    },
    {
      title: 'Giá tốt cho sinh viên',
      subTitle: 'Cấu hình ổn, giá hợp lý',
      image: '',
      productIds: [createdProducts[idxXiaomiFirstPhone]._id, createdProducts[idxAsusFirstLaptop]._id]
    },
    {
      title: 'Được yêu thích nhất',
      subTitle: 'Tổng hợp sản phẩm nổi bật do TechShop tuyển chọn',
      image: '',
      productIds: featuredProductIds
    }
  ]);
  console.log('[Seed] Đã tạo bộ sưu tập sản phẩm mẫu');

  // ----- Vouchers -----
  await Voucher.create([
    {
      code: 'WELCOME10',
      description: 'Giảm 10% cho đơn hàng đầu tiên, tối đa 500.000đ',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountAmount: 500000,
      minOrderValue: 1000000,
      usageLimit: 1000,
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    },
    {
      code: 'FREESHIP',
      description: 'Giảm 30.000đ phí vận chuyển',
      discountType: 'fixed',
      discountValue: 30000,
      minOrderValue: 0,
      usageLimit: 0,
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }
  ]);
  console.log('[Seed] Đã tạo voucher mẫu');

  // ----- Posts (tin tức/cẩm nang) -----
  await Post.create([
    {
      userId: admin._id,
      title: 'Nên chọn iPhone 15 Pro Max hay Samsung Galaxy S24 Ultra?',
      slug: 'nen-chon-iphone-15-pro-max-hay-samsung-galaxy-s24-ultra',
      category: 'tu_van',
      nameAuthor: admin.name,
      shortDescription: 'So sánh chi tiết hai flagship hàng đầu 2024.',
      content:
        'Cả hai sản phẩm đều là flagship cao cấp với camera mạnh mẽ, hiệu năng vượt trội. iPhone nổi bật với hệ sinh thái Apple mượt mà, trong khi Samsung Galaxy ghi điểm nhờ bút S Pen và tính năng AI.',
      relatedProductIds: [createdProducts[idxAppleFirstPhone]._id, createdProducts[idxSamsungFirstPhone]._id],
      isPublished: true,
      isFeatured: true
    },
    {
      userId: admin._id,
      title: '5 mẹo giúp tăng thời lượng pin điện thoại hiệu quả',
      slug: '5-meo-tang-thoi-luong-pin-dien-thoai',
      category: 'thu_thuat',
      nameAuthor: admin.name,
      shortDescription: 'Những thủ thuật đơn giản giúp máy dùng lâu hơn.',
      content:
        '1. Giảm độ sáng màn hình. 2. Tắt ứng dụng chạy ngầm. 3. Bật chế độ tiết kiệm pin khi cần. 4. Tắt GPS khi không dùng. 5. Cập nhật phần mềm thường xuyên.',
      isPublished: true
    }
  ]);

  // ----- 1000 bài viết tin tức/cẩm nang mẫu -----
  const postDefs = generatePosts(1000, {
    admins: [admin, staff],
    products: createdProducts,
    categoryNames: categoryDocs.map((c) => c.name),
    brandNames: brandDocs.map((b) => b.name)
  });
  const createdPosts = await Post.insertMany(postDefs);
  console.log(`[Seed] Đã tạo ${createdPosts.length + 2} bài viết (2 mẫu cố định + ${createdPosts.length} sinh tự động)`);

  console.log('\n===== TÀI KHOẢN DEMO =====');
  console.log('Admin (collection admins):    admin@example.com    / admin123');
  console.log('Staff (collection admins):    staff@example.com    / staff123');
  console.log('Customer (collection users):  customer@example.com / customer123');
  console.log('1000 khách hàng mẫu:           <email trong DB>     / customer123 (mật khẩu dùng chung)');
  console.log('===========================\n');

  await mongoose.disconnect();
  console.log('[Seed] Hoàn tất, đã đóng kết nối DB');
}

run().catch((err) => {
  console.error('[Seed] Lỗi:', err);
  process.exit(1);
});
