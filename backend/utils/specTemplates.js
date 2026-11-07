// Mẫu thông số kỹ thuật theo từng danh mục: danh sách NHÓM (Màn hình, Hiệu năng, Camera...) và các
// trường trong mỗi nhóm. "key" chính là tên hiển thị và cũng là khóa lưu trong Product.specifications -
// cố ý trùng với các khóa dữ liệu cũ đang có (VD: 'Màn hình', 'Chip xử lý', 'RAM') để sản phẩm hiện có
// hiển thị đúng nhóm ngay mà không cần chuyển đổi dữ liệu. Khóa KHÔNG được chứa dấu "." (giới hạn của
// kiểu Map trong Mongoose). "hint" là gợi ý định dạng hiển thị ở ô nhập của trang quản trị.
const SPEC_TEMPLATES = {
  'dien-thoai': [
    {
      group: 'Màn hình',
      fields: [
        { key: 'Màn hình', hint: '6.7 inch Dynamic AMOLED 2X' },
        { key: 'Độ phân giải', hint: '1440 x 3120 pixels (QHD+)' },
        { key: 'Tần số quét', hint: '120Hz' },
        { key: 'Độ sáng tối đa', hint: '2600 nits' },
        { key: 'Kính bảo vệ', hint: 'Corning Gorilla Glass Victus 2' }
      ]
    },
    {
      group: 'Hiệu năng',
      fields: [
        { key: 'Chip xử lý', hint: 'Snapdragon 8 Gen 3' },
        { key: 'Số nhân CPU', hint: '8 nhân, tối đa 3.39 GHz' },
        { key: 'GPU', hint: 'Adreno 750' },
        { key: 'RAM', hint: '12GB' },
        { key: 'Bộ nhớ trong', hint: '256GB' },
        { key: 'Thẻ nhớ ngoài', hint: 'Không hỗ trợ' }
      ]
    },
    {
      group: 'Camera',
      fields: [
        { key: 'Camera sau', hint: '200MP chính + 12MP góc siêu rộng + 50MP tele' },
        { key: 'Quay video', hint: '8K@30fps, 4K@60fps' },
        { key: 'Camera trước', hint: '12MP' },
        { key: 'Tính năng camera', hint: 'Chống rung OIS, Zoom quang 5x, Chụp đêm' }
      ]
    },
    {
      group: 'Pin & Sạc',
      fields: [
        { key: 'Pin', hint: '5000 mAh' },
        { key: 'Sạc nhanh', hint: '45W' },
        { key: 'Sạc không dây', hint: '15W' }
      ]
    },
    {
      group: 'Kết nối',
      fields: [
        { key: 'Mạng di động', hint: '5G' },
        { key: 'SIM', hint: '2 Nano SIM + eSIM' },
        { key: 'Wifi', hint: 'Wi-Fi 7' },
        { key: 'Bluetooth', hint: 'v5.3' },
        { key: 'NFC', hint: 'Có' },
        { key: 'Cổng sạc', hint: 'USB Type-C' }
      ]
    },
    {
      group: 'Hệ điều hành & Bảo mật',
      fields: [
        { key: 'Hệ điều hành', hint: 'Android 14' },
        { key: 'Bảo mật', hint: 'Vân tay siêu âm dưới màn hình, Nhận diện khuôn mặt' }
      ]
    },
    {
      group: 'Thiết kế & Trọng lượng',
      fields: [
        { key: 'Kháng nước', hint: 'IP68' },
        { key: 'Chất liệu', hint: 'Khung Titan, mặt lưng kính' },
        { key: 'Kích thước', hint: '162.3 x 79 x 8.6 mm' },
        { key: 'Trọng lượng', hint: '232g' }
      ]
    }
  ],
  laptop: [
    {
      group: 'Bộ xử lý',
      fields: [
        { key: 'Chip xử lý', hint: 'Intel Core i7-13700H' },
        { key: 'Số nhân/Số luồng', hint: '14 nhân / 20 luồng' },
        { key: 'Tốc độ CPU', hint: '2.4 GHz, tối đa 5.0 GHz' }
      ]
    },
    {
      group: 'Bộ nhớ & Lưu trữ',
      fields: [
        { key: 'RAM', hint: '16GB' },
        { key: 'Loại RAM', hint: 'DDR5 5200MHz' },
        { key: 'Hỗ trợ RAM tối đa', hint: '64GB' },
        { key: 'Ổ cứng', hint: '512GB SSD NVMe PCIe 4.0' }
      ]
    },
    {
      group: 'Đồ họa',
      fields: [{ key: 'Card đồ họa', hint: 'NVIDIA GeForce RTX 4060 8GB' }]
    },
    {
      group: 'Màn hình',
      fields: [
        { key: 'Màn hình', hint: '15.6 inch' },
        { key: 'Độ phân giải', hint: 'Full HD (1920 x 1080)' },
        { key: 'Tần số quét', hint: '144Hz' },
        { key: 'Tấm nền', hint: 'IPS' },
        { key: 'Độ phủ màu', hint: '100% sRGB' }
      ]
    },
    {
      group: 'Kết nối & Cổng giao tiếp',
      fields: [
        { key: 'Cổng kết nối', hint: '2x USB-C, 2x USB-A, HDMI 2.1, Jack 3.5mm' },
        { key: 'Wifi', hint: 'Wi-Fi 6E' },
        { key: 'Bluetooth', hint: 'v5.3' },
        { key: 'Webcam', hint: 'FHD 1080p' }
      ]
    },
    {
      group: 'Pin & Nguồn',
      fields: [
        { key: 'Pin', hint: '70Wh' },
        { key: 'Công suất sạc', hint: '140W' }
      ]
    },
    {
      group: 'Thiết kế & Trọng lượng',
      fields: [
        { key: 'Chất liệu', hint: 'Vỏ nhôm' },
        { key: 'Bàn phím', hint: 'Có đèn nền, có phím số' },
        { key: 'Kích thước', hint: '357 x 250 x 19.9 mm' },
        { key: 'Trọng lượng', hint: '1.8 kg' }
      ]
    },
    {
      group: 'Phần mềm',
      fields: [{ key: 'Hệ điều hành', hint: 'Windows 11 Home' }]
    }
  ],
  'may-tinh-bang': [
    {
      group: 'Màn hình',
      fields: [
        { key: 'Màn hình', hint: '11 inch Liquid Retina' },
        { key: 'Độ phân giải', hint: '2360 x 1640 pixels' },
        { key: 'Tần số quét', hint: '120Hz' }
      ]
    },
    {
      group: 'Hiệu năng',
      fields: [
        { key: 'Chip xử lý', hint: 'Apple M2' },
        { key: 'RAM', hint: '8GB' },
        { key: 'Bộ nhớ trong', hint: '128GB' }
      ]
    },
    {
      group: 'Camera',
      fields: [
        { key: 'Camera', hint: '12MP' },
        { key: 'Camera trước', hint: '12MP góc siêu rộng' }
      ]
    },
    {
      group: 'Pin & Sạc',
      fields: [
        { key: 'Pin', hint: '8160 mAh' },
        { key: 'Sạc nhanh', hint: '20W' }
      ]
    },
    {
      group: 'Kết nối',
      fields: [
        { key: 'Mạng di động', hint: 'Chỉ Wifi' },
        { key: 'Wifi', hint: 'Wi-Fi 6E' },
        { key: 'Bluetooth', hint: 'v5.3' },
        { key: 'Cổng sạc', hint: 'USB Type-C' }
      ]
    },
    {
      group: 'Tiện ích & Phần mềm',
      fields: [
        { key: 'Bút cảm ứng', hint: 'Có (bán riêng)' },
        { key: 'Hệ điều hành', hint: 'iPadOS 17' }
      ]
    },
    {
      group: 'Thiết kế & Trọng lượng',
      fields: [
        { key: 'Kích thước', hint: '247.6 x 178.5 x 6.1 mm' },
        { key: 'Trọng lượng', hint: '462g' }
      ]
    }
  ],
  'dong-ho-thong-minh': [
    {
      group: 'Màn hình',
      fields: [
        { key: 'Màn hình', hint: 'AMOLED luôn hiển thị' },
        { key: 'Kích thước màn hình', hint: '1.9 inch' }
      ]
    },
    {
      group: 'Thiết kế',
      fields: [
        { key: 'Chất liệu dây/Kích thước', hint: 'Dây Silicone - 45mm' },
        { key: 'Chất liệu mặt', hint: 'Kính Sapphire' },
        { key: 'Kháng nước', hint: '5ATM' }
      ]
    },
    {
      group: 'Sức khỏe & Thể thao',
      fields: [
        { key: 'Cảm biến sức khỏe', hint: 'Nhịp tim, SpO2, ECG, giấc ngủ' },
        { key: 'Chế độ luyện tập', hint: 'Hơn 100 chế độ' },
        { key: 'GPS', hint: 'GPS băng tần kép' }
      ]
    },
    {
      group: 'Pin',
      fields: [
        { key: 'Thời lượng pin', hint: '14 ngày' },
        { key: 'Thời gian sạc', hint: 'Khoảng 2 giờ' }
      ]
    },
    {
      group: 'Kết nối',
      fields: [
        { key: 'Kết nối', hint: 'Bluetooth 5.3, Wifi' },
        { key: 'Nghe gọi', hint: 'Có (qua Bluetooth)' },
        { key: 'Tương thích', hint: 'iOS & Android' }
      ]
    }
  ],
  'tai-nghe-loa': [
    {
      group: 'Tổng quan',
      fields: [
        { key: 'Loại', hint: 'Tai nghe True Wireless' },
        { key: 'Màu sắc', hint: 'Đen' }
      ]
    },
    {
      group: 'Âm thanh',
      fields: [
        { key: 'Driver', hint: '11mm' },
        { key: 'Chống ồn chủ động (ANC)', hint: 'Có' },
        { key: 'Dải tần', hint: '20Hz - 20kHz' },
        { key: 'Codec hỗ trợ', hint: 'AAC, SBC, LDAC' }
      ]
    },
    {
      group: 'Pin & Sạc',
      fields: [
        { key: 'Thời lượng pin', hint: '6 giờ (30 giờ với hộp sạc)' },
        { key: 'Thời gian sạc', hint: 'Khoảng 1.5 giờ' },
        { key: 'Cổng sạc', hint: 'USB Type-C' }
      ]
    },
    {
      group: 'Kết nối',
      fields: [
        { key: 'Kết nối', hint: 'Bluetooth 5.3' },
        { key: 'Kết nối đa điểm', hint: 'Có' },
        { key: 'Micro đàm thoại', hint: 'Có, lọc tiếng ồn' }
      ]
    },
    {
      group: 'Thiết kế',
      fields: [
        { key: 'Kháng nước', hint: 'IPX4' },
        { key: 'Trọng lượng', hint: '5.3g mỗi bên tai' }
      ]
    }
  ],
  'man-hinh': [
    {
      group: 'Màn hình',
      fields: [
        { key: 'Kích thước', hint: '27 inch' },
        { key: 'Độ phân giải', hint: 'QHD 2560x1440' },
        { key: 'Tấm nền', hint: 'IPS' },
        { key: 'Tần số quét', hint: '165Hz' },
        { key: 'Thời gian phản hồi', hint: '1ms' }
      ]
    },
    {
      group: 'Màu sắc & Hình ảnh',
      fields: [
        { key: 'Độ phủ màu', hint: '95% DCI-P3' },
        { key: 'Độ sáng', hint: '400 nits' },
        { key: 'Độ tương phản', hint: '1000:1' },
        { key: 'HDR', hint: 'HDR10' }
      ]
    },
    {
      group: 'Kết nối',
      fields: [{ key: 'Cổng kết nối', hint: 'HDMI 2.0, DisplayPort 1.4, USB-C' }]
    },
    {
      group: 'Thiết kế & Tiện ích',
      fields: [
        { key: 'Chân đế', hint: 'Điều chỉnh độ cao, xoay, nghiêng' },
        { key: 'Treo tường VESA', hint: '100 x 100 mm' },
        { key: 'Công nghệ bảo vệ mắt', hint: 'Chống nháy (Flicker-free), Lọc ánh sáng xanh' }
      ]
    }
  ],
  'phu-kien': [
    {
      group: 'Thông số chính',
      fields: [
        { key: 'Công suất/Dung lượng', hint: '65W' },
        { key: 'Tương thích', hint: 'Universal (đa thiết bị)' },
        { key: 'Kích thước/Chiều dài', hint: '1m' }
      ]
    },
    {
      group: 'Thiết kế',
      fields: [
        { key: 'Chất liệu', hint: 'Nhựa ABS chống cháy' },
        { key: 'Màu sắc', hint: 'Đen' }
      ]
    },
    {
      group: 'Bảo hành',
      fields: [{ key: 'Bảo hành đổi mới', hint: '30 ngày đầu nếu lỗi NSX' }]
    }
  ]
};

// Các trường dạng SỐ (dùng để lọc theo khoảng và so sánh "tốt hơn" ở trang so sánh). Giá trị vẫn nhập
// dạng chữ như cũ ("8GB", "5000 mAh"), hệ thống tự tách số ra - xem utils/specNumbers.js. `unit` là đơn
// vị đã chuẩn hóa (dung lượng quy về GB, khối lượng quy về gram); `better`: 'higher' | 'lower' | bỏ trống
// nếu không có khái niệm "tốt hơn" (VD: kích thước màn hình tùy nhu cầu).
const HZ = { unit: 'Hz', better: 'higher' };
const GB = { unit: 'GB', better: 'higher' };
const GRAM = { unit: 'g', better: 'lower' };
const NUMERIC_FIELDS = {
  'dien-thoai': {
    'Màn hình': { unit: 'inch' },
    'Tần số quét': HZ,
    'Độ sáng tối đa': { unit: 'nits', better: 'higher' },
    RAM: GB,
    'Bộ nhớ trong': GB,
    Pin: { unit: 'mAh', better: 'higher' },
    'Sạc nhanh': { unit: 'W', better: 'higher' },
    'Trọng lượng': GRAM
  },
  laptop: {
    RAM: GB,
    'Ổ cứng': GB,
    'Màn hình': { unit: 'inch' },
    'Tần số quét': HZ,
    Pin: { unit: 'Wh', better: 'higher' },
    'Công suất sạc': { unit: 'W', better: 'higher' },
    'Trọng lượng': GRAM
  },
  'may-tinh-bang': {
    'Màn hình': { unit: 'inch' },
    'Tần số quét': HZ,
    RAM: GB,
    'Bộ nhớ trong': GB,
    Pin: { unit: 'mAh', better: 'higher' },
    'Sạc nhanh': { unit: 'W', better: 'higher' },
    'Trọng lượng': GRAM
  },
  'dong-ho-thong-minh': {
    'Kích thước màn hình': { unit: 'inch' }
  },
  'man-hinh': {
    'Kích thước': { unit: 'inch' },
    'Tần số quét': HZ,
    'Thời gian phản hồi': { unit: 'ms', better: 'lower' },
    'Độ sáng': { unit: 'nits', better: 'higher' }
  }
};

for (const [slug, fields] of Object.entries(NUMERIC_FIELDS)) {
  for (const group of SPEC_TEMPLATES[slug]) {
    for (const field of group.fields) {
      if (fields[field.key]) field.numeric = { ...fields[field.key] };
    }
  }
}

module.exports = { SPEC_TEMPLATES };
