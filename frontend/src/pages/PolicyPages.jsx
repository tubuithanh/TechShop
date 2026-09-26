import { Link } from 'react-router-dom';
import { Table } from 'react-bootstrap';
import LegalPage from '../components/LegalPage';
import { useSettings } from '../store/SettingsContext';

// Các trang chính sách / hỗ trợ khách hàng liên kết từ footer. Nội dung khớp với cách hệ thống đang hoạt
// động và với Điều khoản sử dụng (đổi trả 30 ngày, bảo hành tính từ ngày giao, COD/VNPay...).
const EFFECTIVE = '26/09/2026';
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
const useShop = () => {
  const { settings } = useSettings();
  return { settings, shop: settings.siteName || 'TechShop' };
};

export function ReturnPolicyPage() {
  const { settings, shop } = useShop();
  const sections = [
    {
      id: 'dieu-kien',
      title: 'Điều kiện đổi trả',
      content: (
        <>
          <p>{shop} hỗ trợ đổi sản phẩm mới <strong>miễn phí trong 30 ngày</strong> kể từ ngày nhận hàng khi sản phẩm gặp một trong các trường hợp:</p>
          <ul>
            <li>Lỗi kỹ thuật do nhà sản xuất (không lên nguồn, lỗi màn hình, loa, camera, pin phồng...);</li>
            <li>Hư hỏng, móp méo do quá trình vận chuyển (phát hiện khi nhận hàng);</li>
            <li>Giao sai sản phẩm, sai phiên bản (màu sắc, dung lượng) hoặc thiếu phụ kiện so với đơn hàng.</li>
          </ul>
          <p className="mb-0">Sản phẩm đổi trả cần còn đầy đủ hộp, phụ kiện, quà tặng kèm (nếu có), không trầy xước, móp méo, không có dấu hiệu rơi vỡ, vào nước hoặc đã sửa chữa.</p>
        </>
      )
    },
    {
      id: 'muc-ho-tro',
      title: 'Mức hỗ trợ theo thời gian',
      content: (
        <Table bordered size="sm" responsive className="small align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Thời gian kể từ khi nhận hàng</th>
              <th>Sản phẩm lỗi do nhà sản xuất</th>
              <th>Không lỗi (đổi ý)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Trong 30 ngày</td>
              <td>Đổi sản phẩm mới cùng phiên bản, miễn phí. Nếu hết hàng: đổi sản phẩm khác hoặc hoàn tiền 100%</td>
              <td>Không áp dụng đổi trả; Quý khách có thể mang đến cửa hàng để được tư vấn thu cũ đổi mới</td>
            </tr>
            <tr>
              <td>Sau 30 ngày</td>
              <td>Bảo hành theo <Link to="/chinh-sach-bao-hanh">Chính sách bảo hành</Link></td>
              <td>Không áp dụng</td>
            </tr>
          </tbody>
        </Table>
      )
    },
    {
      id: 'cach-thuc',
      title: 'Cách gửi yêu cầu đổi trả',
      content: (
        <ol className="mb-0">
          <li>Vào <Link to="/account/orders">Đơn hàng của tôi</Link>, mở đơn hàng đã giao, dùng mục "Gửi yêu cầu bảo hành" và chọn lý do đổi trả; hoặc gọi tổng đài {settings.hotline};</li>
          <li>Chọn sản phẩm, lý do (lỗi nhà sản xuất, giao nhầm, thiếu phụ kiện...), mô tả tình trạng và đính kèm hình ảnh;</li>
          <li>Chọn hình thức: mang đến cửa hàng gần nhất, nhân viên đến lấy tại nhà hoặc gửi qua bưu điện;</li>
          <li>Theo dõi tiến độ tại mục <Link to="/account/warranties">Bảo hành</Link> hoặc trang <Link to="/tra-cuu-bao-hanh">Tra cứu bảo hành</Link>.</li>
        </ol>
      )
    },
    {
      id: 'hoan-tien',
      title: 'Hoàn tiền',
      content: (
        <ul className="mb-0">
          <li>Đơn thanh toán khi nhận hàng (COD): hoàn tiền mặt tại cửa hàng hoặc chuyển khoản vào tài khoản Quý khách cung cấp;</li>
          <li>Đơn thanh toán qua VNPay: hoàn về đúng thẻ/tài khoản đã thanh toán, thời gian tiền về thông thường từ 7 đến 15 ngày làm việc tùy ngân hàng;</li>
          <li>Giá trị hoàn là số tiền thực trả của sản phẩm (sau khi trừ mã giảm giá đã áp dụng cho sản phẩm đó).</li>
        </ul>
      )
    }
  ];
  return <LegalPage title="Chính sách đổi trả" subtitle={`Đổi mới miễn phí trong 30 ngày nếu sản phẩm lỗi do nhà sản xuất`} effectiveDate={EFFECTIVE} updatedDate={EFFECTIVE} sections={sections} related={{ to: '/chinh-sach-bao-hanh', label: 'Chính sách bảo hành' }} />;
}

export function WarrantyPolicyPage() {
  const { settings, shop } = useShop();
  const sections = [
    {
      id: 'thoi-han',
      title: 'Thời hạn bảo hành',
      content: (
        <>
          <p>
            Sản phẩm được bảo hành chính hãng theo thời hạn ghi trên trang chi tiết của từng sản phẩm (thông thường 12–36
            tháng với điện thoại, laptop, máy tính bảng; 6–12 tháng với phụ kiện).
          </p>
          <p className="mb-0">Thời hạn bảo hành được tính <strong>từ ngày đơn hàng được giao thành công</strong>. Hệ thống tự kiểm tra thời hạn khi Quý khách gửi yêu cầu, nên Quý khách không cần giữ phiếu bảo hành giấy.</p>
        </>
      )
    },
    {
      id: 'dieu-kien',
      title: 'Điều kiện bảo hành miễn phí',
      content: (
        <ul className="mb-0">
          <li>Sản phẩm còn trong thời hạn bảo hành và được mua tại {shop};</li>
          <li>Lỗi kỹ thuật do nhà sản xuất, phát sinh trong quá trình sử dụng bình thường;</li>
          <li>Tem bảo hành, số IMEI/serial còn nguyên vẹn, trùng khớp với thông tin đơn hàng.</li>
        </ul>
      )
    },
    {
      id: 'khong-ap-dung',
      title: 'Trường hợp không được bảo hành miễn phí',
      content: (
        <>
          <ul>
            <li>Hết thời hạn bảo hành;</li>
            <li>Hư hỏng do rơi vỡ, va đập, vào nước, ẩm mốc, cháy nổ, côn trùng xâm nhập;</li>
            <li>Tự ý tháo mở, sửa chữa tại nơi không được ủy quyền, can thiệp phần mềm trái phép;</li>
            <li>Hao mòn tự nhiên trong quá trình sử dụng (trầy xước vỏ, bong tróc sơn...).</li>
          </ul>
          <p className="mb-0">Với các trường hợp trên, {shop} vẫn hỗ trợ sửa chữa có tính phí; chi phí được báo trước và chỉ thực hiện khi Quý khách đồng ý.</p>
        </>
      )
    },
    {
      id: 'quy-trinh',
      title: 'Quy trình bảo hành',
      content: (
        <>
          <ol>
            <li>Gửi yêu cầu trong mục <Link to="/account/warranties">Bảo hành</Link> (chọn đơn hàng, sản phẩm, mô tả lỗi, đính kèm tối đa 10 ảnh) hoặc mang sản phẩm đến bất kỳ chi nhánh nào của {shop};</li>
            <li>{shop} tiếp nhận và cấp <strong>mã phiếu bảo hành</strong>;</li>
            <li>Kỹ thuật viên kiểm tra, sửa chữa hoặc gửi hãng (thời gian xử lý thông thường 7–15 ngày làm việc, có thể lâu hơn nếu phải chờ linh kiện);</li>
            <li>Nhận lại sản phẩm tại cửa hàng hoặc tại nhà, đánh giá chất lượng dịch vụ.</li>
          </ol>
          <p className="mb-0">Theo dõi tiến độ bất kỳ lúc nào tại trang <Link to="/tra-cuu-bao-hanh">Tra cứu bảo hành</Link> bằng mã phiếu và số điện thoại, hoặc gọi {settings.hotline}.</p>
        </>
      )
    }
  ];
  return <LegalPage title="Chính sách bảo hành" subtitle="Bảo hành chính hãng, tính từ ngày giao hàng thành công" effectiveDate={EFFECTIVE} updatedDate={EFFECTIVE} sections={sections} related={{ to: '/chinh-sach-doi-tra', label: 'Chính sách đổi trả' }} />;
}

export function ShippingPolicyPage() {
  const { settings, shop } = useShop();
  const sections = [
    {
      id: 'hinh-thuc',
      title: 'Hình thức nhận hàng',
      content: (
        <Table bordered size="sm" responsive className="small align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Hình thức</th>
              <th>Phí</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Giao hàng tận nơi</td>
              <td>
                {vnd(settings.defaultShippingFee)}/đơn
                {settings.freeShippingThreshold > 0 && <><br />Miễn phí cho đơn từ {vnd(settings.freeShippingThreshold)}</>}
              </td>
              <td>Giao từ chi nhánh Quý khách chọn khi đặt hàng</td>
            </tr>
            <tr>
              <td>Nhận tại cửa hàng</td>
              <td>Miễn phí</td>
              <td>Nhận tại đúng chi nhánh đã chọn, xuất trình mã đơn hàng và số điện thoại đặt hàng</td>
            </tr>
          </tbody>
        </Table>
      )
    },
    {
      id: 'thoi-gian',
      title: 'Thời gian giao hàng',
      content: (
        <ul className="mb-0">
          <li>Nội thành các tỉnh/thành có chi nhánh {shop}: giao trong 1–2 ngày làm việc kể từ khi đơn được xác nhận;</li>
          <li>Các khu vực khác: 3–5 ngày làm việc;</li>
          <li>Đơn thanh toán qua VNPay được xử lý sau khi thanh toán thành công; thời gian có thể kéo dài vào dịp lễ, Tết hoặc do thời tiết.</li>
        </ul>
      )
    },
    {
      id: 'theo-doi',
      title: 'Theo dõi đơn hàng',
      content: (
        <p className="mb-0">
          Quý khách theo dõi trạng thái đơn (Chờ xác nhận → Đã xác nhận → Đang xử lý → Đang giao hàng → Đã giao hàng) trong mục{' '}
          <Link to="/account/orders">Đơn hàng của tôi</Link> và nhận thông báo mỗi khi trạng thái thay đổi.
        </p>
      )
    },
    {
      id: 'kiem-tra',
      title: 'Kiểm tra khi nhận hàng',
      content: (
        <p className="mb-0">
          Quý khách vui lòng kiểm tra tình trạng bên ngoài, đúng sản phẩm, đúng phiên bản và đủ phụ kiện trước khi ký nhận.
          Nếu có vấn đề, Quý khách có quyền từ chối nhận hàng và liên hệ ngay tổng đài {settings.hotline} để được giao lại
          hoặc đổi sản phẩm theo <Link to="/chinh-sach-doi-tra">Chính sách đổi trả</Link>.
        </p>
      )
    }
  ];
  return <LegalPage title="Chính sách giao hàng" subtitle="Giao tận nơi hoặc nhận miễn phí tại cửa hàng" effectiveDate={EFFECTIVE} updatedDate={EFFECTIVE} sections={sections} related={{ to: '/huong-dan-mua-hang', label: 'Hướng dẫn mua hàng' }} />;
}

export function PaymentPolicyPage() {
  const { shop } = useShop();
  const sections = [
    {
      id: 'phuong-thuc',
      title: 'Phương thức thanh toán',
      content: (
        <ul className="mb-0">
          <li><strong>Thanh toán khi nhận hàng (COD):</strong> tiền mặt hoặc chuyển khoản cho nhân viên giao hàng/nhân viên cửa hàng;</li>
          <li><strong>Thanh toán online qua VNPay:</strong> thẻ ATM nội địa (có Internet Banking), thẻ quốc tế Visa/Mastercard/JCB, hoặc quét mã QR bằng ứng dụng ngân hàng.</li>
        </ul>
      )
    },
    {
      id: 'vnpay',
      title: 'Thanh toán qua VNPay',
      content: (
        <>
          <ol>
            <li>Chọn "Thanh toán online qua VNPay" ở bước thanh toán và bấm "Đặt hàng";</li>
            <li>Hệ thống chuyển sang cổng VNPay, Quý khách chọn ngân hàng/thẻ và xác thực bằng mã OTP;</li>
            <li>Sau khi thanh toán, Quý khách được đưa về trang kết quả của {shop}; đơn hàng chuyển sang "Đã thanh toán".</li>
          </ol>
          <p className="mb-0">
            Nếu giao dịch chưa thành công (hết thời gian, hủy giao dịch...), Quý khách có thể <strong>thanh toán lại</strong> ngay
            trong trang chi tiết đơn hàng. Đơn chưa thanh toán sẽ chưa được xử lý.
          </p>
        </>
      )
    },
    {
      id: 'an-toan',
      title: 'An toàn thanh toán',
      content: (
        <ul className="mb-0">
          <li>Thông tin thẻ được nhập trực tiếp trên cổng thanh toán VNPay; {shop} <strong>không lưu</strong> số thẻ, mã CVV hay mật khẩu ngân hàng;</li>
          <li>Mọi kết quả thanh toán được kiểm tra chữ ký điện tử của VNPay và đối chiếu đúng số tiền trước khi ghi nhận;</li>
          <li>{shop} không bao giờ yêu cầu Quý khách cung cấp mã OTP qua điện thoại, tin nhắn hay mạng xã hội.</li>
        </ul>
      )
    },
    {
      id: 'hoan-tien',
      title: 'Hoàn tiền',
      content: (
        <p className="mb-0">
          Khi đơn đã thanh toán online bị hủy hoặc trả hàng, tiền được hoàn về đúng thẻ/tài khoản đã thanh toán, thông
          thường từ 7 đến 15 ngày làm việc tùy ngân hàng. Xem thêm <Link to="/chinh-sach-doi-tra">Chính sách đổi trả</Link>.
        </p>
      )
    }
  ];
  return <LegalPage title="Chính sách thanh toán" subtitle="Thanh toán khi nhận hàng hoặc online qua VNPay" effectiveDate={EFFECTIVE} updatedDate={EFFECTIVE} sections={sections} related={{ to: '/chinh-sach-giao-hang', label: 'Chính sách giao hàng' }} />;
}

export function BuyingGuidePage() {
  const { settings } = useShop();
  const sections = [
    {
      id: 'tim-san-pham',
      title: 'Tìm và chọn sản phẩm',
      content: (
        <ul className="mb-0">
          <li>Tìm theo tên ở ô tìm kiếm, hoặc chọn danh mục; lọc theo hãng, khoảng giá và thông số (RAM, dung lượng, kích thước màn hình...);</li>
          <li>Dùng tính năng <Link to="/compare">So sánh</Link> để đặt tối đa 4 sản phẩm cạnh nhau, giá trị tốt nhất ở mỗi thông số được làm nổi bật;</li>
          <li>Ở trang sản phẩm, chọn <strong>màu sắc</strong> và <strong>dung lượng</strong> - giá, hình ảnh và tồn kho thay đổi theo phiên bản đã chọn.</li>
        </ul>
      )
    },
    {
      id: 'gio-hang',
      title: 'Thêm vào giỏ hàng',
      content: (
        <p className="mb-0">
          Chọn cửa hàng để xem còn hàng, chọn số lượng và bấm "Thêm vào giỏ hàng". Giỏ hàng tự cập nhật giá mới nhất và
          cảnh báo nếu phiên bản đã ngừng bán hoặc không đủ hàng để Quý khách điều chỉnh trước khi thanh toán.
        </p>
      )
    },
    {
      id: 'dat-hang',
      title: 'Đặt hàng',
      content: (
        <ol className="mb-0">
          <li>Đăng nhập hoặc <Link to="/register">đăng ký tài khoản</Link> (xác thực email bằng mã OTP);</li>
          <li>Trong giỏ hàng, bấm "Tiến hành thanh toán";</li>
          <li>Chọn chi nhánh xử lý, hình thức nhận hàng và địa chỉ nhận hàng (có thể chọn từ sổ địa chỉ đã lưu);</li>
          <li>Nhập mã giảm giá (nếu có) - xem các mã đang áp dụng tại <Link to="/promotions">Khuyến mãi</Link>;</li>
          <li>Chọn phương thức thanh toán và bấm "Đặt hàng".</li>
        </ol>
      )
    },
    {
      id: 'sau-dat-hang',
      title: 'Sau khi đặt hàng',
      content: (
        <ul className="mb-0">
          <li>Theo dõi và hủy đơn (trước khi đơn chuyển sang "Đang giao hàng") trong <Link to="/account/orders">Đơn hàng của tôi</Link>;</li>
          <li>Sau khi nhận hàng: đánh giá sản phẩm kèm hình ảnh, gửi yêu cầu bảo hành/đổi trả khi cần;</li>
          <li>Cần hỗ trợ: chat với nhân viên ở góc phải màn hình hoặc gọi tổng đài {settings.hotline}.</li>
        </ul>
      )
    }
  ];
  return <LegalPage title="Hướng dẫn mua hàng" subtitle="Mua sắm trực tuyến dễ dàng chỉ với vài bước" effectiveDate={EFFECTIVE} updatedDate={EFFECTIVE} sections={sections} related={{ to: '/chinh-sach-thanh-toan', label: 'Chính sách thanh toán' }} />;
}
