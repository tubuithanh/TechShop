import { Link } from 'react-router-dom';
import { Table } from 'react-bootstrap';
import LegalPage from '../components/LegalPage';
import { useSettings } from '../store/SettingsContext';

export default function PrivacyPage() {
  const { settings } = useSettings();
  const shop = settings.siteName || 'TechShop';

  const sections = [
    {
      id: 'muc-dich',
      title: 'Mục đích và phạm vi',
      content: (
        <>
          <p>
            {shop} tôn trọng và cam kết bảo vệ thông tin cá nhân của khách hàng. Chính sách bảo mật này giải thích{' '}
            <strong>thông tin nào được thu thập, dùng để làm gì, chia sẻ với ai, lưu trong bao lâu</strong> và{' '}
            <strong>các quyền của Quý khách</strong> đối với dữ liệu của mình khi sử dụng website và dịch vụ của {shop}.
          </p>
          <p className="mb-0">
            Chính sách được xây dựng theo quy định của pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, trong đó có Nghị
            định 13/2023/NĐ-CP, và áp dụng cùng với <Link to="/terms">Điều khoản sử dụng</Link> của {shop}.
          </p>
        </>
      )
    },
    {
      id: 'thong-tin-thu-thap',
      title: 'Thông tin chúng tôi thu thập',
      content: (
        <>
          <p>{shop} chỉ thu thập những thông tin cần thiết để cung cấp dịch vụ:</p>
          <Table bordered size="sm" responsive className="small align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ width: '28%' }}>Nhóm thông tin</th>
                <th>Chi tiết</th>
                <th style={{ width: '24%' }}>Thời điểm thu thập</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Thông tin tài khoản</td>
                <td>Họ tên, email, số điện thoại, mật khẩu (chỉ lưu dạng đã mã hóa một chiều, không ai đọc được, kể cả nhân viên {shop})</td>
                <td>Khi đăng ký, cập nhật hồ sơ</td>
              </tr>
              <tr>
                <td>Địa chỉ nhận hàng</td>
                <td>Các địa chỉ Quý khách lưu trong sổ địa chỉ (nhà riêng, công ty...), ghi chú giao hàng</td>
                <td>Khi đăng ký, đặt hàng, sửa sổ địa chỉ</td>
              </tr>
              <tr>
                <td>Thông tin đơn hàng</td>
                <td>Sản phẩm đã mua, giá trị đơn, chi nhánh xử lý, hình thức nhận hàng, trạng thái thanh toán, mã giảm giá đã dùng</td>
                <td>Khi đặt hàng, thanh toán</td>
              </tr>
              <tr>
                <td>Thông tin thanh toán</td>
                <td>Mã giao dịch, ngân hàng, kết quả giao dịch do VNPay trả về. <strong>{shop} không thu thập và không lưu số thẻ, mã CVV hay mật khẩu ngân hàng.</strong></td>
                <td>Khi thanh toán online</td>
              </tr>
              <tr>
                <td>Nội dung Quý khách tạo</td>
                <td>Đánh giá và hình ảnh đính kèm, câu hỏi về sản phẩm, tin nhắn với nhân viên tư vấn, yêu cầu bảo hành</td>
                <td>Khi Quý khách sử dụng các tính năng này</td>
              </tr>
              <tr>
                <td>Đăng nhập bằng Zalo</td>
                <td>Mã định danh và tên hiển thị trên Zalo (chỉ khi Quý khách chọn đăng nhập bằng Zalo)</td>
                <td>Khi đăng nhập bằng Zalo</td>
              </tr>
              <tr>
                <td>Thông tin kỹ thuật</td>
                <td>Thời điểm đăng nhập gần nhất, địa chỉ IP khi tạo giao dịch thanh toán (theo yêu cầu của cổng thanh toán)</td>
                <td>Khi đăng nhập, thanh toán</td>
              </tr>
            </tbody>
          </Table>
        </>
      )
    },
    {
      id: 'muc-dich-su-dung',
      title: 'Mục đích sử dụng thông tin',
      content: (
        <ul className="mb-0">
          <li>Tạo và quản lý tài khoản, xác thực email bằng mã OTP, bảo vệ tài khoản khỏi truy cập trái phép;</li>
          <li>Xử lý đơn hàng: xác nhận đơn, chuẩn bị hàng tại chi nhánh, giao hàng, thu tiền và hoàn tiền;</li>
          <li>Gửi thông báo về trạng thái đơn hàng, thanh toán và yêu cầu bảo hành;</li>
          <li>Tiếp nhận, xử lý bảo hành, đổi trả, khiếu nại và hỗ trợ khách hàng qua chat, tổng đài;</li>
          <li>Hiển thị đánh giá, hỏi đáp để hỗ trợ khách hàng khác tham khảo trước khi mua;</li>
          <li>Thống kê nội bộ (doanh thu, sản phẩm bán chạy) nhằm cải thiện sản phẩm và dịch vụ;</li>
          <li>Phát hiện, ngăn chặn gian lận và thực hiện nghĩa vụ theo quy định của pháp luật.</li>
        </ul>
      )
    },
    {
      id: 'chia-se',
      title: 'Chia sẻ thông tin với bên thứ ba',
      content: (
        <>
          <p>
            <strong>{shop} không bán, cho thuê hay trao đổi thông tin cá nhân của khách hàng.</strong> Thông tin chỉ được
            chia sẻ ở mức cần thiết trong các trường hợp:
          </p>
          <ul>
            <li><strong>Chi nhánh và nhân viên {shop}</strong> được phân công xử lý đơn hàng của Quý khách (nhân viên chỉ truy cập được dữ liệu thuộc phạm vi công việc và chi nhánh của mình);</li>
            <li><strong>Đơn vị vận chuyển:</strong> họ tên, số điện thoại, địa chỉ nhận hàng để giao hàng;</li>
            <li><strong>Cổng thanh toán VNPay:</strong> mã đơn hàng và số tiền để thực hiện giao dịch;</li>
            <li><strong>Nhà cung cấp hạ tầng</strong> (máy chủ, cơ sở dữ liệu, lưu trữ hình ảnh) hoạt động theo thỏa thuận bảo mật với {shop};</li>
            <li><strong>Cơ quan nhà nước có thẩm quyền</strong> khi có yêu cầu theo quy định của pháp luật.</li>
          </ul>
          <p className="mb-0">Tên hiển thị và nội dung đánh giá, hỏi đáp của Quý khách được hiển thị công khai trên trang sản phẩm; email và số điện thoại không bao giờ được hiển thị công khai.</p>
        </>
      )
    },
    {
      id: 'cookie',
      title: 'Cookie và dữ liệu lưu trên trình duyệt',
      content: (
        <>
          <p>
            Website chỉ sử dụng <strong>một cookie cần thiết</strong> để duy trì trạng thái đăng nhập của Quý khách (tối
            đa 7 ngày). Cookie này được đánh dấu <em>httpOnly</em> nên các đoạn mã trên trang không thể đọc được, giúp
            giảm nguy cơ bị đánh cắp phiên đăng nhập.
          </p>
          <p className="mb-0">
            {shop} không sử dụng cookie quảng cáo hay công cụ theo dõi của bên thứ ba. Quý khách có thể xóa cookie trong
            cài đặt trình duyệt bất kỳ lúc nào; khi đó Quý khách cần đăng nhập lại.
          </p>
        </>
      )
    },
    {
      id: 'bao-mat',
      title: 'Biện pháp bảo vệ thông tin',
      content: (
        <ul className="mb-0">
          <li>Dữ liệu truyền giữa trình duyệt và máy chủ được mã hóa qua giao thức HTTPS;</li>
          <li>Mật khẩu được mã hóa một chiều (bcrypt) trước khi lưu; mã OTP chỉ lưu dạng mã hóa và tự động hết hạn;</li>
          <li>Giới hạn số lần đăng nhập sai để chống dò mật khẩu;</li>
          <li>Kết quả thanh toán được kiểm tra chữ ký điện tử của VNPay trước khi ghi nhận;</li>
          <li>Nhân viên được phân quyền theo chức năng và chi nhánh; mọi thao tác thêm, sửa, xóa trong trang quản trị đều được ghi nhật ký.</li>
        </ul>
      )
    },
    {
      id: 'thoi-gian-luu',
      title: 'Thời gian lưu trữ',
      content: (
        <ul className="mb-0">
          <li>Thông tin tài khoản và sổ địa chỉ: lưu trong suốt thời gian tài khoản còn hoạt động, hoặc đến khi Quý khách yêu cầu xóa;</li>
          <li>Thông tin đơn hàng, thanh toán, bảo hành: lưu trong thời hạn cần thiết để bảo hành, giải quyết khiếu nại và theo thời hạn lưu trữ chứng từ mà pháp luật yêu cầu;</li>
          <li>Mã OTP: tự động xóa sau khi hết hạn hoặc sau khi đăng ký thành công.</li>
        </ul>
      )
    },
    {
      id: 'quyen-khach-hang',
      title: 'Quyền của khách hàng',
      content: (
        <>
          <p>Đối với dữ liệu cá nhân của mình, Quý khách có quyền:</p>
          <ul>
            <li><strong>Xem và chỉnh sửa</strong> họ tên, số điện thoại, mật khẩu, sổ địa chỉ trong mục <Link to="/account/profile">Tài khoản của tôi</Link>;</li>
            <li><strong>Yêu cầu cung cấp</strong> bản sao dữ liệu cá nhân mà {shop} đang lưu giữ;</li>
            <li><strong>Rút lại sự đồng ý</strong> hoặc <strong>yêu cầu xóa tài khoản</strong> và dữ liệu cá nhân (trừ dữ liệu {shop} phải lưu theo quy định pháp luật);</li>
            <li><strong>Phản đối, khiếu nại</strong> về việc xử lý dữ liệu cá nhân không đúng với chính sách này.</li>
          </ul>
          <p className="mb-0">
            Để thực hiện các quyền trên, vui lòng gửi yêu cầu tới {settings.contactEmail} hoặc tổng đài {settings.hotline}.
            {shop} sẽ xác minh danh tính người yêu cầu và phản hồi trong thời hạn theo quy định của pháp luật.
          </p>
        </>
      )
    },
    {
      id: 'tre-em',
      title: 'Thông tin của trẻ em',
      content: (
        <p className="mb-0">
          Dịch vụ của {shop} hướng tới người đã thành niên. Người chưa đủ 16 tuổi chỉ nên đăng ký tài khoản và mua hàng
          khi có sự đồng ý và giám sát của cha mẹ hoặc người giám hộ. Nếu phát hiện đã thu thập dữ liệu của trẻ em mà
          không có sự đồng ý phù hợp, {shop} sẽ xóa dữ liệu đó.
        </p>
      )
    },
    {
      id: 'thay-doi',
      title: 'Thay đổi chính sách',
      content: (
        <p className="mb-0">
          Chính sách này có thể được cập nhật khi {shop} bổ sung tính năng mới hoặc khi quy định pháp luật thay đổi. Ngày
          cập nhật gần nhất luôn được ghi ở đầu trang. Với những thay đổi ảnh hưởng đến quyền lợi của khách hàng, {shop}{' '}
          sẽ thông báo trên website trước khi áp dụng.
        </p>
      )
    }
  ];

  return (
    <LegalPage
      title="Chính sách bảo mật"
      subtitle={`Cam kết của ${shop} về việc thu thập, sử dụng và bảo vệ thông tin cá nhân`}
      effectiveDate="26/09/2026"
      updatedDate="26/09/2026"
      sections={sections}
      related={{ to: '/terms', label: 'Điều khoản sử dụng' }}
    />
  );
}
