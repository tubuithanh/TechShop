// Sinh thêm các thông số kỹ thuật CHI TIẾT (các trường mới trong mẫu utils/specTemplates.js) cho dữ
// liệu mẫu. Dùng chung cho seed.js (sản phẩm mới) và seed/backfillSpecTemplates.js (bổ sung cho sản
// phẩm đã có - chỉ điền trường còn thiếu, không ghi đè giá trị cũ). Giá trị được chọn có xét theo
// thương hiệu/thông số sẵn có để không mâu thuẫn (VD: iPhone không có thẻ nhớ ngoài, có Face ID).
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const EXTRA_BUILDERS = {
  'dien-thoai': ({ brand, specs }) => {
    const isApple = brand === 'Apple';
    const chip = specs['Chip xử lý'] || '';
    const isFlagship = /A17|A16|8 Gen 3|Exynos 2400|8200/.test(chip);
    return {
      'Độ phân giải': pick(['1080 x 2400 pixels (FHD+)', '1179 x 2556 pixels', '1440 x 3120 pixels (QHD+)', '1290 x 2796 pixels']),
      'Tần số quét': isFlagship ? pick(['120Hz', '120Hz LTPO']) : pick(['60Hz', '90Hz', '120Hz']),
      'Độ sáng tối đa': pick(['1000 nits', '1600 nits', '2000 nits', '2600 nits']),
      'Kính bảo vệ': isApple ? 'Ceramic Shield' : pick(['Corning Gorilla Glass Victus 2', 'Corning Gorilla Glass 5', 'Kính cường lực Panda']),
      'Số nhân CPU': pick(['6 nhân', '8 nhân']),
      GPU: isApple ? 'Apple GPU 6 nhân' : pick(['Adreno 750', 'Adreno 710', 'Mali-G610 MC6', 'Xclipse 940', 'Mali-G68']),
      'Thẻ nhớ ngoài': isApple ? 'Không hỗ trợ' : pick(['MicroSD, tối đa 1TB', 'Không hỗ trợ']),
      'Quay video': isFlagship ? pick(['4K@60fps', '8K@30fps, 4K@60fps']) : pick(['4K@30fps', 'FullHD@60fps']),
      'Tính năng camera': pick(['Chống rung OIS, Chụp đêm, HDR', 'Chụp chân dung xóa phông, Chụp đêm', 'Zoom quang 3x, Chống rung OIS, AI Camera']),
      'Sạc không dây': isFlagship ? pick(['15W', 'MagSafe 15W']) : 'Không hỗ trợ',
      'Mạng di động': pick(['4G', '5G']),
      SIM: isApple ? '1 Nano SIM + eSIM' : pick(['2 Nano SIM', '2 Nano SIM + eSIM']),
      Wifi: pick(['Wi-Fi 6', 'Wi-Fi 6E', 'Wi-Fi 7', 'Wi-Fi 5']),
      Bluetooth: pick(['v5.0', 'v5.2', 'v5.3']),
      NFC: isApple || isFlagship ? 'Có' : pick(['Có', 'Không']),
      'Cổng sạc': isApple ? pick(['Lightning', 'USB Type-C']) : 'USB Type-C',
      'Bảo mật': isApple ? 'Face ID' : pick(['Vân tay dưới màn hình, Nhận diện khuôn mặt', 'Vân tay cạnh viền, Nhận diện khuôn mặt']),
      'Chất liệu': isFlagship ? pick(['Khung Titan, mặt lưng kính', 'Khung nhôm, mặt lưng kính']) : pick(['Khung nhựa, mặt lưng nhựa', 'Khung nhôm, mặt lưng kính']),
      'Kích thước': `${randInt(146, 164)}.${randInt(0, 9)} x ${randInt(70, 78)}.${randInt(0, 9)} x ${randInt(7, 9)}.${randInt(0, 9)} mm`
    };
  },
  laptop: ({ brand, specs }) => {
    const isApple = brand === 'Apple';
    const hasDedicatedGpu = /RTX|Radeon RX/.test(specs['Card đồ họa'] || '');
    return {
      'Số nhân/Số luồng': isApple ? pick(['8 nhân CPU', '11 nhân CPU', '12 nhân CPU']) : pick(['6 nhân / 8 luồng', '10 nhân / 12 luồng', '14 nhân / 20 luồng', '8 nhân / 16 luồng']),
      'Tốc độ CPU': isApple ? 'Tùy nhân hiệu năng/tiết kiệm' : pick(['1.3 GHz, tối đa 4.4 GHz', '2.1 GHz, tối đa 4.6 GHz', '2.4 GHz, tối đa 5.0 GHz']),
      'Loại RAM': isApple ? 'Unified Memory' : pick(['DDR4 3200MHz', 'DDR5 4800MHz', 'LPDDR5 6400MHz']),
      'Hỗ trợ RAM tối đa': isApple ? 'Không nâng cấp được' : pick(['16GB', '32GB', '64GB', 'Không nâng cấp được (RAM hàn)']),
      'Độ phân giải': pick(['Full HD (1920 x 1080)', 'WUXGA (1920 x 1200)', '2.8K (2880 x 1800)', 'QHD+ (2560 x 1600)']),
      'Tần số quét': hasDedicatedGpu ? pick(['144Hz', '165Hz', '240Hz']) : pick(['60Hz', '90Hz', '120Hz']),
      'Tấm nền': pick(['IPS', 'OLED', 'Liquid Retina']),
      'Độ phủ màu': pick(['45% NTSC', '100% sRGB', '100% DCI-P3']),
      Wifi: pick(['Wi-Fi 6', 'Wi-Fi 6E']),
      Bluetooth: pick(['v5.1', 'v5.2', 'v5.3']),
      Webcam: pick(['HD 720p', 'FHD 1080p', 'FHD 1080p, hỗ trợ Windows Hello']),
      'Công suất sạc': pick(['45W', '65W', '100W', '140W', '240W']),
      'Bàn phím': pick(['Có đèn nền', 'Có đèn nền, có phím số', 'Đèn nền RGB 4 vùng', 'Không đèn nền']),
      'Kích thước': `${randInt(300, 360)} x ${randInt(210, 260)} x ${randInt(14, 24)}.${randInt(0, 9)} mm`
    };
  },
  'may-tinh-bang': ({ brand, variant }) => {
    const isApple = brand === 'Apple';
    return {
      'Độ phân giải': pick(['2360 x 1640 pixels', '2560 x 1600 pixels', '2800 x 1752 pixels', '1920 x 1200 pixels']),
      'Tần số quét': pick(['60Hz', '90Hz', '120Hz']),
      'Camera trước': pick(['8MP', '12MP góc siêu rộng', '5MP']),
      'Sạc nhanh': pick(['18W', '20W', '33W', '45W']),
      'Mạng di động': /5G/.test(variant || '') ? '5G' : 'Chỉ Wifi',
      Wifi: pick(['Wi-Fi 6', 'Wi-Fi 6E']),
      Bluetooth: pick(['v5.0', 'v5.3']),
      'Cổng sạc': isApple ? 'USB Type-C' : 'USB Type-C',
      'Kích thước': `${randInt(240, 285)}.${randInt(0, 9)} x ${randInt(160, 215)}.${randInt(0, 9)} x ${randInt(5, 8)}.${randInt(0, 9)} mm`,
      'Trọng lượng': `${randInt(290, 680)}g`
    };
  },
  'dong-ho-thong-minh': ({ brand }) => ({
    'Kích thước màn hình': pick(['1.43 inch', '1.5 inch', '1.9 inch', '1.3 inch']),
    'Chất liệu mặt': pick(['Kính cường lực', 'Kính Sapphire', 'Ion-X Glass']),
    'Chế độ luyện tập': pick(['Hơn 100 chế độ', 'Hơn 150 chế độ', '30 chế độ']),
    GPS: pick(['GPS tích hợp', 'GPS băng tần kép', 'Dùng GPS của điện thoại']),
    'Thời gian sạc': pick(['Khoảng 1 giờ', 'Khoảng 1.5 giờ', 'Khoảng 2 giờ']),
    'Nghe gọi': brand === 'Apple' ? 'Có (hỗ trợ eSIM trên bản LTE)' : pick(['Có (qua Bluetooth)', 'Không'])
  }),
  'tai-nghe-loa': ({ specs }) => {
    const isSpeaker = /Loa/.test(specs['Loại'] || '');
    return {
      'Dải tần': pick(['20Hz - 20kHz', '10Hz - 40kHz', '60Hz - 20kHz']),
      'Codec hỗ trợ': pick(['SBC, AAC', 'SBC, AAC, LDAC', 'SBC, aptX Adaptive']),
      'Thời gian sạc': pick(['Khoảng 1 giờ', 'Khoảng 1.5 giờ', 'Khoảng 2.5 giờ']),
      'Cổng sạc': 'USB Type-C',
      'Kết nối đa điểm': pick(['Có', 'Không']),
      'Micro đàm thoại': isSpeaker ? pick(['Có', 'Không']) : pick(['Có, lọc tiếng ồn', 'Có']),
      'Trọng lượng': isSpeaker ? `${randInt(250, 1500)}g` : pick(['4.5g mỗi bên tai', '5.3g mỗi bên tai', '250g', '385g'])
    };
  },
  'man-hinh': ({ specs }) => {
    const panel = specs['Tấm nền'] || '';
    return {
      'Độ sáng': pick(['250 nits', '300 nits', '350 nits', '400 nits']),
      'Độ tương phản': panel === 'VA' ? '3000:1' : panel === 'OLED' ? '1.500.000:1' : '1000:1',
      HDR: pick(['HDR10', 'DisplayHDR 400', 'Không hỗ trợ']),
      'Chân đế': pick(['Điều chỉnh độ nghiêng', 'Điều chỉnh độ cao, xoay, nghiêng']),
      'Treo tường VESA': pick(['75 x 75 mm', '100 x 100 mm']),
      'Công nghệ bảo vệ mắt': pick(['Chống nháy (Flicker-free), Lọc ánh sáng xanh', 'Lọc ánh sáng xanh'])
    };
  },
  'phu-kien': () => ({})
};

// Trả về các thông số bổ sung cho 1 sản phẩm. `specs` là thông số đã có, để suy ra giá trị hợp lý.
function buildExtraSpecs(categorySlug, { brand, model, variant, specs = {} }) {
  const builder = EXTRA_BUILDERS[categorySlug];
  return builder ? builder({ brand, model, variant, specs }) : {};
}

module.exports = { buildExtraSpecs };
