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

// LƯU Ý: via.placeholder.com đã ngừng hoạt động, và placehold.co (dịch vụ thay thế) cũng không
// tải được ổn định ở một số môi trường mạng/trình duyệt (bị chặn CDN, ad-block chặn query string...).
// Để ảnh LUÔN hiển thị được mà không phụ thuộc mạng/dịch vụ bên thứ ba nào, ta tự sinh ảnh dạng
// SVG nhúng thẳng vào chuỗi "data:" (data URI) — trình duyệt vẽ ảnh này hoàn toàn cục bộ, không
// cần tải từ Internet.
const PRODUCT_IMAGE_COUNT = 10;

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text, maxCharsPerLine = 16, maxLines = 3) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = (current + ' ' + word).trim();
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

// Bảng màu (nền gradient nhạt + màu hình khối) theo từng danh mục, dùng để vẽ minh họa sản phẩm
const CATEGORY_PALETTE = {
  'dien-thoai': { from: '#dbeafe', to: '#eff6ff', shape: '#2563eb', light: '#60a5fa' },
  laptop: { from: '#ede9fe', to: '#f5f3ff', shape: '#7c3aed', light: '#a78bfa' },
  'may-tinh-bang': { from: '#d1fae5', to: '#ecfdf5', shape: '#059669', light: '#34d399' },
  'dong-ho-thong-minh': { from: '#fef3c7', to: '#fffbeb', shape: '#d97706', light: '#fbbf24' },
  'tai-nghe-loa': { from: '#fce7f3', to: '#fdf2f8', shape: '#db2777', light: '#f472b6' },
  'man-hinh': { from: '#cffafe', to: '#ecfeff', shape: '#0891b2', light: '#22d3ee' },
  'phu-kien': { from: '#e5e7eb', to: '#f9fafb', shape: '#4b5563', light: '#9ca3af' }
};

// Hình khối SVG mô phỏng dáng thiết bị theo từng danh mục (hệ tọa độ 0-200), vẽ đơn giản
// theo phong cách flat-icon để không phụ thuộc ảnh chụp thật nhưng vẫn gợi hình rõ ràng.
function categoryIconShape(categorySlug, color, light) {
  switch (categorySlug) {
    case 'dien-thoai':
      return (
        `<rect x="72" y="30" width="56" height="110" rx="12" fill="${color}"/>` +
        `<rect x="79" y="42" width="42" height="80" rx="3" fill="#ffffff" opacity="0.9"/>` +
        `<circle cx="100" cy="132" r="3.5" fill="#ffffff" opacity="0.9"/>`
      );
    case 'laptop':
      return (
        `<rect x="55" y="42" width="90" height="58" rx="4" fill="${color}"/>` +
        `<rect x="61" y="48" width="78" height="46" rx="2" fill="#ffffff" opacity="0.9"/>` +
        `<path d="M40 106 h120 l-8 14 a6 6 0 0 1 -5 3 h-94 a6 6 0 0 1 -5 -3 z" fill="${light}"/>`
      );
    case 'may-tinh-bang':
      return (
        `<rect x="58" y="30" width="84" height="106" rx="10" fill="${color}"/>` +
        `<rect x="65" y="40" width="70" height="82" rx="3" fill="#ffffff" opacity="0.9"/>` +
        `<circle cx="100" cy="129" r="3" fill="#ffffff" opacity="0.9"/>`
      );
    case 'dong-ho-thong-minh':
      return (
        `<rect x="88" y="14" width="24" height="18" rx="4" fill="${light}"/>` +
        `<rect x="88" y="128" width="24" height="18" rx="4" fill="${light}"/>` +
        `<rect x="66" y="42" width="68" height="76" rx="16" fill="${color}"/>` +
        `<circle cx="100" cy="80" r="24" fill="#ffffff" opacity="0.9"/>`
      );
    case 'tai-nghe-loa':
      return (
        `<path d="M50 88 a50 50 0 0 1 100 0" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>` +
        `<rect x="38" y="80" width="26" height="42" rx="13" fill="${color}"/>` +
        `<rect x="136" y="80" width="26" height="42" rx="13" fill="${color}"/>` +
        `<circle cx="51" cy="101" r="7" fill="${light}"/>` +
        `<circle cx="149" cy="101" r="7" fill="${light}"/>`
      );
    case 'man-hinh':
      return (
        `<rect x="40" y="32" width="120" height="76" rx="6" fill="${color}"/>` +
        `<rect x="48" y="40" width="104" height="60" rx="2" fill="#ffffff" opacity="0.9"/>` +
        `<rect x="90" y="108" width="20" height="18" fill="${light}"/>` +
        `<rect x="65" y="126" width="70" height="8" rx="4" fill="${light}"/>`
      );
    case 'phu-kien':
    default:
      return (
        `<rect x="70" y="50" width="60" height="72" rx="10" fill="${color}"/>` +
        `<rect x="86" y="28" width="10" height="26" rx="4" fill="${light}"/>` +
        `<rect x="104" y="28" width="10" height="26" rx="4" fill="${light}"/>` +
        `<path d="M100 122 q0 26 0 34" stroke="${light}" stroke-width="8" fill="none" stroke-linecap="round"/>`
      );
  }
}

function makeProductIllustration(text, categorySlug, index, size = 800) {
  const palette = CATEGORY_PALETTE[categorySlug] || CATEGORY_PALETTE['phu-kien'];
  const shape = categoryIconShape(categorySlug, palette.shape, palette.light);
  const angle = ((index % 5) - 2) * 6; // xoay nhẹ -12°..12° để 10 ảnh trông có góc chụp khác nhau
  const lines = wrapLines(text, 20, 2);
  const captionLines = lines
    .map((line, i) => `<tspan x="100" dy="${i === 0 ? 0 : 11}">${escapeXml(line)}</tspan>`)
    .join('');
  const gradId = `g${categorySlug.replace(/[^a-z]/g, '')}${index}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${palette.from}"/><stop offset="100%" stop-color="${palette.to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="200" height="200" fill="url(#${gradId})"/>` +
    `<circle cx="100" cy="80" r="58" fill="#ffffff" opacity="0.5"/>` +
    `<g transform="rotate(${angle} 100 80)">${shape}</g>` +
    `<text x="100" y="176" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="600" fill="#374151">${captionLines}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildImages(title, categorySlug) {
  const urls = [];
  for (let i = 1; i <= PRODUCT_IMAGE_COUNT; i++) {
    urls.push(makeProductIllustration(title, categorySlug, i));
  }
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
      const { featuredImage, imageURLs } = buildImages(title, catDef.slug);

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

module.exports = { generateProducts, CATEGORY_DEFS };
