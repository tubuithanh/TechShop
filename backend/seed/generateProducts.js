const slugify = require('slugify');

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundPrice(value) {
  return Math.round(value / 10000) * 10000;
}

const TAG_POOL = ['Hàng mới', 'Giảm sốc', 'Trả góp 0%', 'Sinh viên', 'Bán chạy', 'Hàng chính hãng', 'Freeship', 'Quà tặng kèm'];

const SHORT_DESC_TEMPLATES = {
  'dien-thoai': [
    'Hiệu năng mạnh mẽ, camera sắc nét trong mọi điều kiện',
    'Thiết kế sang trọng, thời lượng pin cả ngày dài',
    'Chụp ảnh đẹp, chơi game mượt mà không giật lag',
    'Màn hình sắc nét, hỗ trợ sạc nhanh tiện lợi'
  ],
  laptop: [
    'Mỏng nhẹ, hiệu năng ổn định cho công việc văn phòng',
    'Cấu hình mạnh mẽ, phù hợp thiết kế đồ họa - lập trình',
    'Thiết kế bền bỉ, lý tưởng cho học tập và làm việc',
    'Hiệu năng chơi game mượt mà, tản nhiệt hiệu quả'
  ],
  'may-tinh-bang': [
    'Màn hình lớn sắc nét, lý tưởng để giải trí và học tập',
    'Nhẹ nhàng, thời lượng pin bền bỉ cả ngày sử dụng',
    'Hỗ trợ bút cảm ứng, tiện lợi cho công việc sáng tạo'
  ],
  'dong-ho-thong-minh': [
    'Theo dõi sức khỏe toàn diện, thiết kế thời trang',
    'Pin bền bỉ nhiều ngày, chống nước tiện lợi khi vận động',
    'Tích hợp GPS, đo nhịp tim và giấc ngủ chính xác'
  ],
  'tai-nghe-loa': [
    'Âm thanh sống động, chống ồn chủ động hiệu quả',
    'Kết nối ổn định, thời lượng pin nghe nhạc cả ngày',
    'Thiết kế nhỏ gọn, đeo êm ái trong thời gian dài'
  ],
  'man-hinh': [
    'Màu sắc chân thực, tần số quét cao mượt mà',
    'Thiết kế viền mỏng hiện đại, phù hợp làm việc đa nhiệm',
    'Tấm nền cao cấp, bảo vệ mắt khi sử dụng lâu dài'
  ],
  'phu-kien': [
    'Chất liệu bền bỉ, thiết kế nhỏ gọn tiện mang theo',
    'Hiệu suất ổn định, tương thích đa dạng thiết bị',
    'Giải pháp tiện lợi cho nhu cầu sử dụng hằng ngày'
  ]
};

const CATEGORY_DEFS = [
  {
    slug: 'dien-thoai',
    count: 200,
    warrantyMonths: () => pick([12, 18, 24]),
    priceRange: [3000000, 45000000],
    brands: {
      Apple: ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max', 'iPhone 14', 'iPhone 14 Plus', 'iPhone SE 2024'],
      Samsung: ['Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy A55', 'Galaxy A35', 'Galaxy A15', 'Galaxy Z Fold5', 'Galaxy Z Flip5'],
      Xiaomi: ['Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13', 'Redmi 13C', 'Xiaomi 14', 'Xiaomi 14 Ultra', 'POCO X6 Pro', 'POCO M6'],
      OPPO: ['Reno11 5G', 'Reno11 F', 'A79', 'A18', 'Find X7', 'Find N3 Flip'],
      Vivo: ['V30', 'V30e', 'Y36', 'Y18', 'X100'],
      Realme: ['12 Pro+', '12 Pro', 'C67', 'C55', '11x 5G'],
      Nokia: ['G42 5G', 'C32', 'X30 5G']
    },
    variants: ['64GB', '128GB', '256GB', '512GB', '1TB'],
    buildSpecs: (ctx) => ({
      'Màn hình': pick(['6.1 inch OLED', '6.5 inch AMOLED', '6.7 inch Dynamic AMOLED', '6.8 inch LTPO AMOLED', '6.4 inch Super AMOLED']),
      'Chip xử lý': pick(['Apple A17 Pro', 'Apple A16 Bionic', 'Snapdragon 8 Gen 3', 'Snapdragon 7s Gen 2', 'Dimensity 8200', 'Exynos 2400', 'Dimensity 7050']),
      RAM: pick(['4GB', '6GB', '8GB', '12GB', '16GB']),
      'Bộ nhớ trong': ctx.variant,
      'Camera sau': pick(['48MP chính + 12MP góc rộng', '50MP chính + 8MP góc rộng + 2MP macro', '200MP chính + 8MP góc rộng', '108MP chính + 8MP góc rộng']),
      'Camera trước': pick(['12MP', '16MP', '32MP', '8MP']),
      Pin: pick(['4000 mAh', '4500 mAh', '5000 mAh', '5100 mAh', '4422 mAh']),
      'Sạc nhanh': pick(['20W', '25W', '33W', '45W', '67W', '120W']),
      'Hệ điều hành': ctx.brand === 'Apple' ? 'iOS' : 'Android',
      'Kháng nước': pick(['IP68', 'IP67', 'Không hỗ trợ']),
      'Trọng lượng': `${randInt(160, 230)}g`
    })
  },
  {
    slug: 'laptop',
    count: 200,
    warrantyMonths: () => pick([12, 24, 36]),
    priceRange: [8000000, 70000000],
    brands: {
      Apple: ['MacBook Air M2 13 inch', 'MacBook Air M3 13 inch', 'MacBook Air M3 15 inch', 'MacBook Pro 14 M3', 'MacBook Pro 16 M3 Pro'],
      ASUS: ['Vivobook 15', 'Vivobook Pro 15 OLED', 'Zenbook 14 OLED', 'TUF Gaming F15', 'ROG Strix G16'],
      Dell: ['Inspiron 15 3520', 'Inspiron 14 Plus 7440', 'XPS 13 9340', 'Vostro 3510', 'Latitude 5440'],
      HP: ['Pavilion 15', 'Envy x360 14', 'ProBook 450 G9', 'Omen 16'],
      Lenovo: ['ThinkPad E14 Gen 5', 'IdeaPad Slim 5', 'Legion 5 Pro', 'Yoga 7i 14'],
      Acer: ['Aspire 5', 'Swift Go 14', 'Nitro 5', 'Predator Helios 300'],
      MSI: ['Modern 14', 'Katana 15', 'Stealth 16']
    },
    variants: ['8GB/256GB SSD', '16GB/512GB SSD', '16GB/1TB SSD', '32GB/1TB SSD'],
    buildSpecs: (ctx) => {
      const [ram, storage] = ctx.variant.split('/');
      return {
        'Chip xử lý': ctx.brand === 'Apple'
          ? pick(['Apple M2', 'Apple M3', 'Apple M3 Pro'])
          : pick(['Intel Core i3-1215U', 'Intel Core i5-1235U', 'Intel Core i5-13500H', 'Intel Core i7-13700H', 'AMD Ryzen 5 7530U', 'AMD Ryzen 7 7735HS']),
        RAM: ram,
        'Ổ cứng': storage,
        'Card đồ họa': pick(['Intel Iris Xe', 'Tích hợp (Onboard)', 'NVIDIA RTX 4050 6GB', 'NVIDIA RTX 4060 8GB', 'AMD Radeon Graphics']),
        'Màn hình': pick(['14 inch FHD+', '15.6 inch FHD', '13.3 inch Retina', '16 inch QHD+', '14 inch 2.8K OLED']),
        Pin: pick(['50Wh', '56Wh', '70Wh', '99.6Wh']),
        'Hệ điều hành': ctx.brand === 'Apple' ? 'macOS' : pick(['Windows 11 Home', 'Windows 11 Pro']),
        'Cổng kết nối': pick(['2x USB-C, 1x USB-A, HDMI', 'USB-C Thunderbolt, USB-A, HDMI, Jack tai nghe']),
        'Trọng lượng': `${(randInt(12, 22) / 10).toFixed(1)} kg`,
        'Chất liệu': pick(['Nhôm nguyên khối', 'Nhựa cao cấp', 'Hợp kim Magie - Nhôm'])
      };
    }
  },
  {
    slug: 'may-tinh-bang',
    count: 100,
    warrantyMonths: () => pick([12, 18]),
    priceRange: [3500000, 32000000],
    brands: {
      Apple: ['iPad 10th Gen', 'iPad Air M2', 'iPad Pro 11 M4', 'iPad Pro 13 M4', 'iPad mini 6'],
      Samsung: ['Galaxy Tab S9', 'Galaxy Tab S9+', 'Galaxy Tab A9', 'Galaxy Tab A9+'],
      Xiaomi: ['Xiaomi Pad 6', 'Redmi Pad SE'],
      Lenovo: ['Tab M10 Plus', 'Tab P11']
    },
    variants: ['64GB Wifi', '128GB Wifi', '256GB Wifi', '128GB 5G'],
    buildSpecs: (ctx) => ({
      'Màn hình': pick(['10.9 inch Liquid Retina', '11 inch LCD', '12.9 inch Liquid Retina XDR', '11 inch AMOLED', '10.4 inch TFT']),
      'Chip xử lý': pick(['Apple M2', 'Apple A14 Bionic', 'Snapdragon 870', 'Snapdragon 685', 'Dimensity 6300']),
      RAM: pick(['4GB', '6GB', '8GB', '12GB']),
      'Bộ nhớ trong': ctx.variant,
      Camera: pick(['8MP', '12MP', '13MP']),
      Pin: pick(['7040 mAh', '8160 mAh', '10090 mAh']),
      'Hệ điều hành': ctx.brand === 'Apple' ? 'iPadOS' : 'Android',
      'Bút cảm ứng': pick(['Có (bán kèm)', 'Có (bán riêng)', 'Không hỗ trợ'])
    })
  },
  {
    slug: 'dong-ho-thong-minh',
    count: 100,
    warrantyMonths: () => pick([12]),
    priceRange: [700000, 22000000],
    brands: {
      Apple: ['Apple Watch SE 2', 'Apple Watch Series 9', 'Apple Watch Ultra 2'],
      Samsung: ['Galaxy Watch6', 'Galaxy Watch6 Classic', 'Galaxy Watch FE'],
      Xiaomi: ['Mi Band 8', 'Watch S3', 'Redmi Watch 4'],
      Amazfit: ['GTS 4', 'GTR 4', 'Bip 5'],
      Garmin: ['Venu 3', 'Forerunner 265', 'Vivoactive 5']
    },
    variants: ['Dây Silicone - 41mm', 'Dây Silicone - 45mm', 'Dây Da - 41mm', 'Dây Thép - 45mm'],
    buildSpecs: (ctx) => ({
      'Màn hình': pick(['AMOLED cảm ứng', 'OLED luôn hiển thị', 'LCD màu']),
      'Chất liệu dây/Kích thước': ctx.variant,
      'Kháng nước': pick(['5ATM', 'IP68', '10ATM']),
      'Thời lượng pin': pick(['18 giờ (sạc mỗi ngày)', '7 ngày', '14 ngày', '2 ngày (dùng GPS liên tục)']),
      'Cảm biến sức khỏe': pick(['Nhịp tim, SpO2, giấc ngủ', 'Nhịp tim, SpO2, ECG, giấc ngủ', 'Nhịp tim, giấc ngủ']),
      'Kết nối': pick(['Bluetooth 5.0', 'Bluetooth 5.3, Wifi', 'Bluetooth, GPS']),
      'Tương thích': 'iOS & Android'
    })
  },
  {
    slug: 'tai-nghe-loa',
    count: 150,
    warrantyMonths: () => pick([6, 12]),
    priceRange: [350000, 12000000],
    brands: {
      Apple: ['AirPods Pro 2', 'AirPods 3', 'AirPods Max'],
      Sony: ['WH-1000XM5', 'WF-1000XM5', 'SRS-XB13'],
      JBL: ['Tune 510BT', 'Flip 6', 'Charge 5', 'Clip 4'],
      Marshall: ['Emberton II', 'Major V', 'Acton III'],
      Anker: ['Soundcore Life Q30', 'Soundcore Space One'],
      Xiaomi: ['Redmi Buds 5', 'Mi True Wireless Earbuds 3'],
      Samsung: ['Galaxy Buds2 Pro', 'Galaxy Buds FE']
    },
    variants: ['Đen', 'Trắng', 'Xanh Dương', 'Xám'],
    buildSpecs: (ctx) => ({
      'Loại': ctx.model.toLowerCase().includes('loa') || ['Flip 6', 'Charge 5', 'Clip 4', 'Emberton II', 'Acton III', 'SRS-XB13'].includes(ctx.model)
        ? 'Loa Bluetooth di động'
        : pick(['Tai nghe True Wireless', 'Tai nghe chụp tai (Over-ear)']),
      'Màu sắc': ctx.variant,
      'Chống ồn chủ động (ANC)': pick(['Có', 'Không']),
      'Thời lượng pin': pick(['5 giờ (30 giờ với hộp sạc)', '6 giờ (24 giờ với hộp sạc)', '20 giờ', '12 giờ']),
      'Kết nối': pick(['Bluetooth 5.0', 'Bluetooth 5.2', 'Bluetooth 5.3']),
      'Driver': pick(['10mm', '11mm', '40mm', '6mm x 2']),
      'Kháng nước': pick(['IPX4', 'IPX5', 'IPX7', 'Không hỗ trợ'])
    })
  },
  {
    slug: 'man-hinh',
    count: 100,
    warrantyMonths: () => pick([24, 36]),
    priceRange: [2200000, 18000000],
    brands: {
      LG: ['24MP400', '27GP850', 'UltraGear 27GN800'],
      Samsung: ['Odyssey G5', 'ViewFinity S6', 'Odyssey G7'],
      Dell: ['S2721Q', 'P2422H', 'Alienware AW2725DF'],
      ASUS: ['TUF Gaming VG27AQ', 'ProArt PA278CV'],
      MSI: ['Optix G274', 'MAG 271QP']
    },
    variants: ['24 inch', '27 inch', '32 inch'],
    buildSpecs: (ctx) => ({
      'Kích thước': ctx.variant,
      'Độ phân giải': pick(['FHD 1920x1080', 'QHD 2560x1440', '4K UHD 3840x2160']),
      'Tần số quét': pick(['75Hz', '100Hz', '144Hz', '165Hz', '240Hz']),
      'Tấm nền': pick(['IPS', 'VA', 'OLED', 'TN']),
      'Thời gian phản hồi': pick(['1ms', '4ms', '5ms']),
      'Cổng kết nối': pick(['HDMI, DisplayPort', 'HDMI, DisplayPort, USB-C', 'HDMI x2, DisplayPort']),
      'Độ phủ màu': pick(['99% sRGB', '95% DCI-P3', '120% sRGB'])
    })
  },
  {
    slug: 'phu-kien',
    count: 150,
    warrantyMonths: () => pick([3, 6, 12]),
    priceRange: [99000, 3500000],
    brands: {
      Anker: ['PowerCore 10000', 'PowerCore 20000', 'Sạc nhanh 65W GaN', 'Cáp USB-C to Lightning'],
      Baseus: ['Cáp sạc nhanh 100W', 'Sạc dự phòng 20000mAh', 'Đế sạc không dây 3-in-1'],
      Logitech: ['Chuột MX Master 3S', 'Bàn phím MX Keys', 'Chuột M331'],
      Xiaomi: ['Sạc dự phòng 20000mAh', 'Cân điện tử Mi Smart Scale'],
      ASUS: ['Balo laptop ASUS', 'Chuột gaming ROG Gladius III']
    },
    variants: ['Đen', 'Trắng', 'Xám'],
    buildSpecs: (ctx) => ({
      'Chất liệu': pick(['Nhựa ABS chống cháy', 'Nhôm nguyên khối', 'Vải Polyester chống thấm', 'Silicone cao cấp']),
      'Màu sắc': ctx.variant,
      'Công suất/Dung lượng': pick(['65W', '100W', '20000mAh', '10000mAh', '18W']),
      'Kích thước/Chiều dài': pick(['1m', '2m', 'Nhỏ gọn cầm tay']),
      'Tương thích': pick(['Universal (đa thiết bị)', 'iPhone/iPad', 'Laptop/Điện thoại Android']),
      'Bảo hành đổi mới': '30 ngày đầu nếu lỗi NSX'
    })
  }
];

// Ảnh sản phẩm dùng ẢNH THẬT (ảnh chụp thiết bị công nghệ thật, không phải minh họa vector) lấy từ
// Unsplash - kho ảnh miễn phí bản quyền, license cho phép dùng thương mại không cần ghi nguồn. Vì
// không có kho ảnh chính hãng theo từng model cụ thể offline sẵn trong dự án, mỗi danh mục dùng chung
// một bộ ảnh chụp thiết bị thật tiêu biểu cho danh mục đó (điện thoại/laptop/tai nghe...), xoay vòng
// theo từng sản phẩm để tránh trùng lặp thứ tự. Mọi photo ID dưới đây ĐÃ được xác minh tải thành công
// (HTTP 200) trực tiếp từ CDN images.unsplash.com trước khi đưa vào — tránh lặp lại sự cố ảnh chết đã
// gặp trước đây với via.placeholder.com/placehold.co. Lưu ý: khác với SVG data-URI trước đó, ảnh này
// CẦN kết nối mạng để tải (đánh đổi đã được xác nhận với người dùng khi chuyển sang dùng ảnh thật).
const PRODUCT_IMAGE_COUNT = 10;

const CATEGORY_PHOTO_IDS = {
  'dien-thoai': [
    '1592890288564-76628a30a657', '1511707171634-5f897ff02aa9', '1598327105666-5b89351aff97',
    '1634403665481-74948d815f03', '1523206489230-c012c64b2b48', '1580910051074-3eb694886505',
    '1423784346385-c1d4dac9893a', '1573152143286-0c422b4d2175', '1512428559087-560fa5ceab42',
    '1488509082528-cefbba5ad692', '1522125670776-3c7abb882bc2', '1572016047668-5b5e909e1605',
    '1585060544812-6b45742d762f', '1512941937669-90a1b58e7e9c'
  ],
  laptop: [
    '1773332598414-44a45e364d85', '1541807084-5c52b6b3adef', '1496181133206-80ce9b88a853',
    '1525547719571-a2d4ac8945e2', '1486312338219-ce68d2c6f44d', '1649972904349-6e44c42644a7',
    '1499914485622-a88fac536970', '1484788984921-03950022c9ef', '1531297484001-80022131f5a1',
    '1611186871348-b1ce696e52c9', '1779896412244-aed1d2f8bed2', '1515378791036-0648a3ef77b2',
    '1515378960530-7c0da6231fb1', '1508780709619-79562169bc64', '1522199755839-a2bacb67c546'
  ],
  'may-tinh-bang': [
    '1561154464-82e9adf32764', '1623126908029-58cb08a2b272', '1542751110-97427bbecf20',
    '1625864667534-aa5208d45a87', '1557825835-70d97c4aa567', '1521633286323-05b17f47cb74',
    '1604399852419-f67ee7d5f2ef', '1585790050230-5dd28404ccb9', '1612367990403-73ef3e67bc4f',
    '1527698266440-12104e498b76', '1587033411391-5d9e51cce126', '1568918460973-fe7f54f82482',
    '1637152736123-8a027366b07a', '1589739900266-43b2843f4c12', '1611495464137-6bbcccfa996e'
  ],
  'dong-ho-thong-minh': [
    '1579586337278-3befd40fd17a', '1660844817855-3ecc7ef21f12', '1508685096489-7aacd43bd3b1',
    '1546868871-7041f2a55e12', '1637160151663-a410315e4e75', '1624096104992-9b4fa3a279dd',
    '1434493789847-2f02dc6ca35d', '1551816230-ef5deaed4a26', '1617043983671-adaadcaa2460',
    '1609096458733-95b38583ac4e', '1617625802912-cde586faf331', '1632794716789-42d9995fb5b6',
    '1461141346587-763ab02bced9', '1517420879524-86d64ac2f339', '1544117519-31a4b719223d'
  ],
  'tai-nghe-loa': [
    '1505740420928-5e560c06d30e', '1618366712010-f4ae9c647dcb', '1545127398-14699f92334b',
    '1546435770-a3e426bf472b', '1613040809024-b4ef7ba99bc3', '1590658268037-6bf12165a8df',
    '1641048930621-ab5d225ae5b0', '1628202926206-c63a34b1618f', '1585298723682-7115561c51b7',
    '1491927570842-0261e477d937', '1606741965326-cb990ae01bb2', '1487215078519-e21cc028cb29',
    '1606220945770-b5b6c2c55bf1', '1612858249937-1cc0852093dd', '1567928513899-997d98489fbd'
  ],
  'man-hinh': [
    '1484788984921-03950022c9ef', '1527443224154-c4a3942d3acf', '1551739440-5dd934d3a94a',
    '1585792180666-f7347c490ee2', '1547658718-1cdaa0852790', '1494173853739-c21f58b16055',
    '1611648694931-1aeda329f9da', '1587831990711-23ca6441447b', '1527443195645-1133f7f28990',
    '1666771410140-0573b232426e', '1517059224940-d4af9eec41b7', '1560131914-2e469a0e8607',
    '1570485071395-29b575ea3b4e', '1534972195531-d756b9bfa9f2', '1579765754037-5bfef757251a'
  ],
  'phu-kien': [
    '1504610926078-a1611febcad3', '1566793474285-2decf0fc182a', '1624823183493-ed5832f48f18',
    '1677145503731-87bfe49e5c67', '1515940175183-6798529cb860', '1596207891316-23851be3cc20',
    '1498049794561-7780e7231661', '1491933382434-500287f9b54b', '1678852524356-08188528aed9',
    '1693279504914-d08266ecbe66', '1468495244123-6c6c332eeece', '1428223501723-d821c5d00ca3',
    '1593259037198-c720f4420d7f', '1647334864689-e140efbfd51f'
  ]
};

function unsplashUrl(photoId, size = 900) {
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${size}&h=${size}&q=75`;
}

// Băm chuỗi đơn giản (không cần bảo mật) để chọn điểm bắt đầu xoay vòng ảnh khác nhau cho từng
// sản phẩm trong cùng 1 danh mục, tránh mọi sản phẩm hiển thị đúng 1 thứ tự ảnh giống hệt nhau.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function buildImages({ title, categorySlug }) {
  const pool = CATEGORY_PHOTO_IDS[categorySlug] || CATEGORY_PHOTO_IDS['phu-kien'];
  const count = Math.min(PRODUCT_IMAGE_COUNT, pool.length);
  const start = hashString(`${categorySlug}:${title}`) % pool.length;
  const urls = Array.from({ length: count }, (_, i) => unsplashUrl(pool[(start + i) % pool.length]));
  return { featuredImage: urls[0], imageURLs: urls };
}

function buildDescription({ title, brand, categoryLabel, shortDescription, specs }) {
  const entries = Object.entries(specs).slice(0, 5);
  const specLine = entries.map(([k, v]) => `${k}: ${v}`).join(' — ');
  return (
    `${title} thuộc dòng ${categoryLabel.toLowerCase()} chính hãng ${brand}, ${shortDescription.toLowerCase()}. ` +
    `Thông số nổi bật: ${specLine}. ` +
    `Sản phẩm được phân phối chính hãng tại hệ thống TechShop, đầy đủ hóa đơn VAT, hỗ trợ đổi trả trong 7 ngày đầu ` +
    `nếu phát hiện lỗi từ nhà sản xuất, cùng đội ngũ tư vấn kỹ thuật hỗ trợ nhiệt tình trên toàn quốc.`
  );
}

/**
 * Sinh danh sách 1000 sản phẩm mẫu đa dạng danh mục/thương hiệu, đầy đủ ảnh và thông số.
 * @param {Object} params
 * @param {Record<string, mongoose.Types.ObjectId>} params.categoryIdBySlug
 * @param {Record<string, mongoose.Types.ObjectId>} params.brandIdByName
 * @param {Record<string, string>} params.categoryLabelBySlug
 * @returns {Array<Object>} mỗi phần tử là 1 product definition kèm 2 field phụ (_brandName, _categorySlug)
 *   dùng để tra cứu sau khi insertMany (KHÔNG thuộc schema Product, phải loại bỏ trước khi insert).
 */
function generateProducts({ categoryIdBySlug, brandIdByName, categoryLabelBySlug }) {
  const products = [];
  let globalIndex = 0;

  for (const catDef of CATEGORY_DEFS) {
    const brandNames = Object.keys(catDef.brands);
    for (let i = 0; i < catDef.count; i++) {
      globalIndex += 1;
      const brand = pick(brandNames);
      const model = pick(catDef.brands[brand]);
      const variant = pick(catDef.variants);
      const title = `${model} ${variant}`;
      const specs = catDef.buildSpecs({ brand, model, variant });
      const shortDescription = pick(SHORT_DESC_TEMPLATES[catDef.slug]);
      const categoryLabel = categoryLabelBySlug[catDef.slug];
      const description = buildDescription({ title, brand, categoryLabel, shortDescription, specs });
      const { featuredImage, imageURLs } = buildImages({ title, categorySlug: catDef.slug, brand, variant, specs });

      const [minPrice, maxPrice] = catDef.priceRange;
      const price = roundPrice(randInt(minPrice, maxPrice));
      const hasDiscount = Math.random() < 0.6;
      const salePrice = hasDiscount ? roundPrice(price * (1 - randInt(5, 25) / 100)) : undefined;

      const slug = `${slugify(title, { lower: true, locale: 'vi' })}-${String(globalIndex).padStart(4, '0')}`;

      products.push({
        title,
        slug,
        brandId: brandIdByName[brand],
        categoryId: categoryIdBySlug[catDef.slug],
        shortDescription,
        description,
        featuredImage,
        imageURLs,
        price,
        salePrice,
        specifications: specs,
        warrantyMonths: catDef.warrantyMonths(),
        tags: pickMany(TAG_POOL, randInt(1, 3)),
        ratingAverage: Number((randInt(35, 50) / 10).toFixed(1)),
        ratingCount: randInt(0, 800),
        soldCount: randInt(0, 3000),
        isFeatured: Math.random() < 0.04,
        isActive: true,
        _brandName: brand,
        _categorySlug: catDef.slug
      });
    }
  }

  return products;
}

module.exports = { generateProducts, CATEGORY_DEFS, buildImages };
