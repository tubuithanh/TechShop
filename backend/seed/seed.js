/**
 * Script tạo dữ liệu mẫu (seed data) - đã cập nhật khớp 100% với thiết kế
 * database "ecommerce_multistore_db" (multi-store, admins tách riêng users).
 * Chạy: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const slugify = require('slugify');

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
    Post.deleteMany({})
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

  // ----- Brands -----
  const brandApple = await Brand.create({ name: 'Apple', image: '' });
  const brandSamsung = await Brand.create({ name: 'Samsung', image: '' });
  const brandXiaomi = await Brand.create({ name: 'Xiaomi', image: '' });
  const brandAsus = await Brand.create({ name: 'ASUS', image: '' });

  // ----- Categories -----
  const catPhone = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const catLaptop = await Category.create({ name: 'Laptop', slug: 'laptop' });
  const catAccessory = await Category.create({ name: 'Phụ kiện', slug: 'phu-kien' });

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

  // ----- Products -----
  const productsData = [
    {
      title: 'iPhone 15 Pro Max',
      brandId: brandApple._id,
      categoryId: catPhone._id,
      shortDescription: 'Chip A17 Pro, khung Titan cao cấp',
      description: 'iPhone 15 Pro Max với chip A17 Pro, khung Titan cao cấp, camera 48MP chuyên nghiệp.',
      specifications: { 'Màn hình': '6.7 inch OLED', CPU: 'A17 Pro', Pin: '4422 mAh', Camera: '48MP' },
      featuredImage: 'https://via.placeholder.com/600x600?text=iPhone+15+Pro+Max',
      imageURLs: ['https://via.placeholder.com/600x600?text=iPhone+15+Pro+Max'],
      price: 34990000,
      salePrice: 29990000,
      isFeatured: true,
      tags: ['Hàng mới', 'Trả góp 0%'],
      warrantyMonths: 12
    },
    {
      title: 'Samsung Galaxy S24 Ultra',
      brandId: brandSamsung._id,
      categoryId: catPhone._id,
      shortDescription: 'Tích hợp AI, bút S Pen, camera 200MP',
      description: 'Galaxy S24 Ultra tích hợp AI, bút S Pen, camera 200MP sắc nét.',
      specifications: { 'Màn hình': '6.8 inch Dynamic AMOLED', CPU: 'Snapdragon 8 Gen 3', Pin: '5000 mAh', Camera: '200MP' },
      featuredImage: 'https://via.placeholder.com/600x600?text=Galaxy+S24+Ultra',
      imageURLs: ['https://via.placeholder.com/600x600?text=Galaxy+S24+Ultra'],
      price: 31990000,
      salePrice: 27990000,
      isFeatured: true,
      tags: ['Giảm sốc'],
      warrantyMonths: 12
    },
    {
      title: 'Xiaomi Redmi Note 13 Pro',
      brandId: brandXiaomi._id,
      categoryId: catPhone._id,
      shortDescription: 'Pin trâu, camera 200MP, giá tốt',
      description: 'Redmi Note 13 Pro pin trâu, camera 200MP, giá tốt cho sinh viên.',
      specifications: { 'Màn hình': '6.67 inch AMOLED', CPU: 'Snapdragon 7s Gen 2', Pin: '5100 mAh', Camera: '200MP' },
      featuredImage: 'https://via.placeholder.com/600x600?text=Redmi+Note+13+Pro',
      imageURLs: ['https://via.placeholder.com/600x600?text=Redmi+Note+13+Pro'],
      price: 8490000,
      salePrice: 6990000,
      isFeatured: false,
      tags: ['Hàng mới', 'Sinh viên'],
      warrantyMonths: 18
    },
    {
      title: 'MacBook Air M3 13 inch',
      brandId: brandApple._id,
      categoryId: catLaptop._id,
      shortDescription: 'Mỏng nhẹ, hiệu năng mạnh mẽ',
      description: 'MacBook Air M3 mỏng nhẹ, hiệu năng mạnh mẽ cho công việc và học tập.',
      specifications: { CPU: 'Apple M3', RAM: '8GB', 'Ổ cứng': '256GB SSD', 'Màn hình': '13.6 inch Liquid Retina' },
      featuredImage: 'https://via.placeholder.com/600x600?text=MacBook+Air+M3',
      imageURLs: ['https://via.placeholder.com/600x600?text=MacBook+Air+M3'],
      price: 29990000,
      salePrice: 27990000,
      isFeatured: true,
      tags: ['Trả góp 0%'],
      warrantyMonths: 12
    },
    {
      title: 'Laptop ASUS Vivobook 15',
      brandId: brandAsus._id,
      categoryId: catLaptop._id,
      shortDescription: 'Laptop văn phòng phổ thông',
      description: 'Laptop văn phòng phổ thông, cấu hình ổn định, giá hợp lý.',
      specifications: { CPU: 'Intel Core i5-1235U', RAM: '16GB', 'Ổ cứng': '512GB SSD', 'Màn hình': '15.6 inch FHD' },
      featuredImage: 'https://via.placeholder.com/600x600?text=Asus+Vivobook+15',
      imageURLs: ['https://via.placeholder.com/600x600?text=Asus+Vivobook+15'],
      price: 18990000,
      salePrice: 15990000,
      isFeatured: false,
      tags: ['Giảm sốc', 'Sinh viên'],
      warrantyMonths: 24
    },
    {
      title: 'Tai nghe AirPods Pro 2',
      brandId: brandApple._id,
      categoryId: catAccessory._id,
      shortDescription: 'Chống ồn chủ động, âm thanh không gian',
      description: 'Tai nghe chống ồn chủ động, âm thanh không gian sống động.',
      specifications: { 'Chống ồn': 'Có (ANC)', Pin: '6 giờ nghe nhạc', 'Kết nối': 'Bluetooth 5.3' },
      featuredImage: 'https://via.placeholder.com/600x600?text=AirPods+Pro+2',
      imageURLs: ['https://via.placeholder.com/600x600?text=AirPods+Pro+2'],
      price: 6190000,
      salePrice: 5490000,
      isFeatured: false,
      tags: ['Hàng mới'],
      warrantyMonths: 12
    }
  ];

  const createdProducts = [];
  for (const p of productsData) {
    const slug = slugify(p.title, { lower: true, locale: 'vi' }) + '-' + Math.floor(Math.random() * 10000);
    const product = await Product.create({ ...p, slug });
    createdProducts.push(product);
  }
  console.log(`[Seed] Đã tạo ${createdProducts.length} sản phẩm`);

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

  // ----- Collections (bộ sưu tập sản phẩm) -----
  await ProductCollection.create([
    {
      title: 'Flagship 2024',
      subTitle: 'Những chiếc điện thoại cao cấp nhất năm',
      image: '',
      productIds: [createdProducts[0]._id, createdProducts[1]._id]
    },
    {
      title: 'Giá tốt cho sinh viên',
      subTitle: 'Cấu hình ổn, giá hợp lý',
      image: '',
      productIds: [createdProducts[2]._id, createdProducts[4]._id]
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
        'Cả hai sản phẩm đều là flagship cao cấp với camera mạnh mẽ, hiệu năng vượt trội. iPhone 15 Pro Max nổi bật với hệ sinh thái Apple mượt mà, trong khi Galaxy S24 Ultra ghi điểm nhờ bút S Pen và tính năng AI.',
      relatedProductIds: [createdProducts[0]._id, createdProducts[1]._id],
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
  console.log('[Seed] Đã tạo bài viết mẫu');

  console.log('\n===== TÀI KHOẢN DEMO =====');
  console.log('Admin (collection admins):    admin@example.com    / admin123');
  console.log('Staff (collection admins):    staff@example.com    / staff123');
  console.log('Customer (collection users):  customer@example.com / customer123');
  console.log('===========================\n');

  await mongoose.disconnect();
  console.log('[Seed] Hoàn tất, đã đóng kết nối DB');
}

run().catch((err) => {
  console.error('[Seed] Lỗi:', err);
  process.exit(1);
});
