import { Link } from 'react-router-dom';
import LegalPage from '../components/LegalPage';
import { useSettings } from '../store/SettingsContext';

const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

export default function TermsPage() {
  const { settings } = useSettings();
  const shop = settings.siteName || 'TechShop';

  const sections = [
    {
      id: 'gioi-thieu',
      title: 'Giới thiệu và phạm vi áp dụng',
      content: (
        <>
          <p>
            Chào mừng Quý khách đến với website thương mại điện tử <strong>{shop}</strong> - hệ thống bán lẻ điện thoại,
            máy tính, thiết bị và phụ kiện công nghệ với nhiều chi nhánh trên toàn quốc.
          </p>
          <p>
            Điều khoản sử dụng này (sau đây gọi là "Điều khoản") quy định quyền và nghĩa vụ của {shop} và khách hàng khi
            truy cập website, đăng ký tài khoản, đặt hàng, thanh toán, nhận hàng, đổi trả và bảo hành sản phẩm. Bằng việc
            truy cập hoặc sử dụng website, Quý khách xác nhận đã đọc, hiểu và đồng ý với toàn bộ Điều khoản này cùng{' '}
            <Link to="/privacy">Chính sách bảo mật</Link> của {shop}.
          </p>
          <p className="mb-0">
            Nếu không đồng ý với bất kỳ nội dung nào, Quý khách vui lòng ngừng sử dụng website và liên hệ với chúng tôi
            để được giải đáp.
          </p>
        </>
      )
    },
    {
      id: 'dinh-nghia',
      title: 'Giải thích từ ngữ',
      content: (
        <ul className="mb-0">
          <li>
            <strong>"{shop}", "chúng tôi"</strong>: đơn vị sở hữu và vận hành website cùng hệ thống cửa hàng {shop}.
          </li>
          <li>
            <strong>"Khách hàng", "Quý khách"</strong>: cá nhân, tổ chức truy cập website hoặc mua hàng tại {shop}.
          </li>
          <li>
            <strong>"Tài khoản"</strong>: tài khoản khách hàng được tạo trên website, đăng nhập bằng email và mật khẩu
            (hoặc tài khoản Zalo liên kết).
          </li>
          <li>
            <strong>"Đơn hàng"</strong>: yêu cầu mua hàng khách hàng gửi qua website và được {shop} tiếp nhận.
          </li>
          <li>
            <strong>"Phiên bản sản phẩm"</strong>: từng lựa chọn cụ thể của một sản phẩm theo màu sắc và dung lượng/kích
            thước, có giá và tồn kho riêng.
          </li>
          <li>
            <strong>"Chi nhánh xử lý"</strong>: cửa hàng {shop} được khách hàng chọn khi đặt hàng, chịu trách nhiệm chuẩn
            bị, giao hàng hoặc bàn giao hàng tại cửa hàng.
          </li>
        </ul>
      )
    },
    {
      id: 'tai-khoan',
      title: 'Tài khoản khách hàng',
      content: (
        <>
          <p>Khách hàng có thể xem sản phẩm mà không cần tài khoản. Để đặt hàng, theo dõi đơn, đánh giá sản phẩm và yêu cầu bảo hành, khách hàng cần đăng ký tài khoản:</p>
          <ul>
            <li>Email đăng ký được xác thực bằng mã OTP gồm 6 chữ số; mã có hiệu lực trong thời gian ngắn và chỉ dùng một lần.</li>
            <li>
              Khách hàng cung cấp họ tên và số điện thoại di động chính xác, đang sử dụng. Mỗi số điện thoại chỉ được gắn
              với một tài khoản. {shop} sử dụng số điện thoại để xác nhận đơn hàng và liên hệ giao hàng.
            </li>
            <li>Mật khẩu có tối thiểu 8 ký tự, gồm cả chữ và số. Khách hàng tự bảo mật mật khẩu và không chia sẻ tài khoản cho người khác.</li>
            <li>
              Khách hàng chịu trách nhiệm về mọi hoạt động phát sinh từ tài khoản của mình. Nếu phát hiện tài khoản bị sử
              dụng trái phép, vui lòng đổi mật khẩu ngay và thông báo cho {shop}.
            </li>
          </ul>
          <p className="mb-0">
            {shop} có quyền tạm khóa hoặc chấm dứt tài khoản cung cấp thông tin giả mạo, đặt hàng ảo nhiều lần, lợi dụng
            chương trình khuyến mãi hoặc vi phạm Điều khoản này, sau khi đã thông báo cho khách hàng (trừ trường hợp khẩn
            cấp để ngăn chặn thiệt hại).
          </p>
        </>
      )
    },
    {
      id: 'san-pham-gia',
      title: 'Thông tin sản phẩm và giá bán',
      content: (
        <>
          <ul>
            <li>
              Giá niêm yết trên website bằng Việt Nam đồng (VNĐ). Với sản phẩm có nhiều phiên bản, giá hiển thị trên danh
              sách là giá thấp nhất ("Từ ..."); giá chính xác là giá của phiên bản Quý khách chọn.
            </li>
            <li>
              Giá áp dụng cho đơn hàng là giá tại thời điểm đặt hàng thành công. Giá trong giỏ hàng tự động cập nhật nếu
              có thay đổi trước khi Quý khách đặt hàng.
            </li>
            <li>
              Hình ảnh sản phẩm mang tính minh họa; màu sắc thực tế có thể chênh lệch nhẹ do ánh sáng và thiết bị hiển
              thị. Thông số kỹ thuật được cung cấp theo công bố của nhà sản xuất.
            </li>
            <li>
              Tình trạng còn hàng được hiển thị theo từng chi nhánh và từng phiên bản, cập nhật liên tục nhưng có thể thay
              đổi trong thời gian ngắn khi nhiều khách cùng đặt.
            </li>
          </ul>
          <p className="mb-0">
            Trường hợp có sai sót rõ ràng về giá hoặc thông tin sản phẩm (ví dụ lỗi nhập liệu), {shop} sẽ liên hệ để
            Quý khách lựa chọn tiếp tục mua theo thông tin đúng hoặc hủy đơn và được hoàn tiền đầy đủ (nếu đã thanh toán).
          </p>
        </>
      )
    },
    {
      id: 'dat-hang',
      title: 'Đặt hàng và xác nhận đơn hàng',
      content: (
        <>
          <ol>
            <li>Chọn sản phẩm và phiên bản (màu sắc, dung lượng), thêm vào giỏ hàng.</li>
            <li>Chọn chi nhánh xử lý đơn hàng, hình thức nhận hàng (giao tận nơi hoặc nhận tại cửa hàng) và địa chỉ nhận hàng.</li>
            <li>Áp dụng mã giảm giá (nếu có), chọn phương thức thanh toán và bấm "Đặt hàng".</li>
          </ol>
          <p>
            Đơn hàng được ghi nhận khi hệ thống hiển thị mã đơn hàng. Hệ thống kiểm tra và giữ hàng theo tồn kho của
            đúng chi nhánh đã chọn; nếu chi nhánh không đủ hàng, đơn hàng sẽ không được tạo và Quý khách có thể chọn chi
            nhánh khác.
          </p>
          <p className="mb-0">
            Quý khách theo dõi trạng thái đơn hàng (Chờ xác nhận → Đã xác nhận → Đang xử lý → Đang giao hàng → Đã giao
            hàng) trong mục <Link to="/account/orders">Đơn hàng của tôi</Link> và nhận thông báo mỗi khi trạng thái thay
            đổi. {shop} có quyền từ chối hoặc hủy đơn hàng có dấu hiệu gian lận, thông tin liên hệ không chính xác hoặc
            không liên lạc được với người nhận.
          </p>
        </>
      )
    },
    {
      id: 'thanh-toan',
      title: 'Phương thức thanh toán',
      content: (
        <>
          <ul>
            <li>
              <strong>Thanh toán khi nhận hàng (COD):</strong> Quý khách thanh toán tiền mặt hoặc chuyển khoản cho nhân
              viên giao hàng/nhân viên cửa hàng khi nhận hàng.
            </li>
            <li>
              <strong>Thanh toán online qua VNPay:</strong> thẻ ATM nội địa, thẻ quốc tế Visa/Mastercard/JCB và quét mã
              QR qua ứng dụng ngân hàng. Việc nhập thông tin thẻ được thực hiện trên cổng thanh toán của VNPay; {shop}{' '}
              <strong>không lưu trữ</strong> thông tin thẻ của Quý khách.
            </li>
          </ul>
          <p>
            Với đơn hàng chọn VNPay, đơn chỉ được xác nhận và chuẩn bị hàng sau khi giao dịch thanh toán thành công.
            Nếu thanh toán chưa thành công, Quý khách có thể thanh toán lại trong trang chi tiết đơn hàng hoặc hủy đơn.
          </p>
          <p className="mb-0">
            Khi đơn hàng đã thanh toán online bị hủy hoặc trả hàng, {shop} hoàn tiền về đúng tài khoản/thẻ đã thanh
            toán. Thời gian tiền về tài khoản phụ thuộc vào ngân hàng phát hành, thông thường từ 7 đến 15 ngày làm việc.
          </p>
        </>
      )
    },
    {
      id: 'giao-hang',
      title: 'Giao hàng và nhận hàng tại cửa hàng',
      content: (
        <>
          <ul>
            <li>
              <strong>Giao tận nơi:</strong> phí giao hàng {vnd(settings.defaultShippingFee)}/đơn
              {settings.freeShippingThreshold > 0 && <> (miễn phí cho đơn từ {vnd(settings.freeShippingThreshold)})</>}.
              Phí được hiển thị rõ tại bước thanh toán trước khi Quý khách đặt hàng.
            </li>
            <li>
              <strong>Nhận tại cửa hàng:</strong> miễn phí. Quý khách đến chi nhánh đã chọn, xuất trình mã đơn hàng và số
              điện thoại đặt hàng để nhận sản phẩm.
            </li>
          </ul>
          <p className="mb-0">
            Khi nhận hàng, Quý khách vui lòng kiểm tra tình trạng bên ngoài, số lượng và đúng phiên bản sản phẩm trước
            khi ký nhận. Nếu phát hiện sản phẩm bị móp méo, sai mẫu hoặc thiếu phụ kiện, Quý khách có quyền từ chối nhận
            hàng và liên hệ ngay tổng đài {settings.hotline} để được hỗ trợ.
          </p>
        </>
      )
    },
    {
      id: 'huy-don',
      title: 'Hủy đơn hàng',
      content: (
        <>
          <p>
            Quý khách có thể tự hủy đơn hàng trong mục <Link to="/account/orders">Đơn hàng của tôi</Link> khi đơn đang ở
            trạng thái <em>Chờ xác nhận</em>, <em>Đã xác nhận</em> hoặc <em>Đang xử lý</em>. Khi đơn đã chuyển sang{' '}
            <em>Đang giao hàng</em>, việc hủy đơn không còn thực hiện trực tuyến được; Quý khách vui lòng liên hệ tổng đài
            để được hướng dẫn.
          </p>
          <p className="mb-0">
            Mã giảm giá đã dùng cho đơn hàng bị hủy có thể không được hoàn lại lượt sử dụng, tùy điều kiện của từng
            chương trình. Tiền đã thanh toán online được hoàn theo mục Phương thức thanh toán.
          </p>
        </>
      )
    },
    {
      id: 'doi-tra-bao-hanh',
      title: 'Đổi trả và bảo hành',
      content: (
        <>
          <h3 className="fs-6 fw-semibold text-body">Đổi trả</h3>
          <p>
            Sản phẩm lỗi do nhà sản xuất được <strong>đổi mới miễn phí trong 30 ngày</strong> kể từ ngày nhận hàng. Sản
            phẩm đổi trả cần còn đầy đủ hộp, phụ kiện, quà tặng kèm (nếu có), không trầy xước, móp méo hoặc có dấu hiệu
            can thiệp phần cứng.
          </p>
          <h3 className="fs-6 fw-semibold text-body">Bảo hành</h3>
          <ul>
            <li>
              Sản phẩm được bảo hành chính hãng theo thời hạn ghi trên trang chi tiết sản phẩm, tính từ ngày đơn hàng được
              giao thành công.
            </li>
            <li>
              Quý khách gửi yêu cầu bảo hành trực tuyến trong mục <Link to="/account/warranties">Bảo hành</Link> (chọn đơn
              hàng, sản phẩm và mô tả lỗi, có thể đính kèm hình ảnh) hoặc mang sản phẩm đến bất kỳ chi nhánh nào của{' '}
              {shop}, và theo dõi tiến độ xử lý ngay trên website.
            </li>
          </ul>
          <p className="mb-2">Không áp dụng bảo hành miễn phí trong các trường hợp:</p>
          <ul className="mb-0">
            <li>Sản phẩm hết thời hạn bảo hành hoặc không xác định được thông tin mua hàng tại {shop};</li>
            <li>Hư hỏng do rơi vỡ, va đập, vào nước, cháy nổ, côn trùng hoặc sử dụng sai hướng dẫn của nhà sản xuất;</li>
            <li>Sản phẩm đã bị tháo mở, sửa chữa bởi đơn vị không được ủy quyền, hoặc can thiệp phần mềm trái phép.</li>
          </ul>
        </>
      )
    },
    {
      id: 'khuyen-mai',
      title: 'Chương trình khuyến mãi và mã giảm giá',
      content: (
        <ul className="mb-0">
          <li>Mỗi chương trình có điều kiện riêng (thời gian, giá trị đơn tối thiểu, mức giảm tối đa, số lượt sử dụng) được công bố tại trang <Link to="/promotions">Khuyến mãi</Link>.</li>
          <li>Mỗi đơn hàng áp dụng một mã giảm giá. Một số mã giới hạn số lần sử dụng trên mỗi khách hàng.</li>
          <li>Mã giảm giá không có giá trị quy đổi thành tiền mặt và không áp dụng cho phí đã phát sinh ngoài đơn hàng.</li>
          <li>{shop} có quyền hủy ưu đãi hoặc đơn hàng nếu phát hiện hành vi gian lận, tạo nhiều tài khoản để hưởng ưu đãi hoặc mua hàng với mục đích đầu cơ.</li>
        </ul>
      )
    },
    {
      id: 'noi-dung-khach-hang',
      title: 'Đánh giá, hỏi đáp và nội dung do khách hàng đăng tải',
      content: (
        <>
          <p>Khách hàng có thể đánh giá sản phẩm (kèm tối đa 3 hình ảnh thực tế), đặt câu hỏi và trò chuyện với nhân viên tư vấn. Khi đăng tải nội dung, Quý khách cam kết:</p>
          <ul>
            <li>Nội dung trung thực, phản ánh trải nghiệm thực tế; hình ảnh do Quý khách chụp hoặc có quyền sử dụng;</li>
            <li>Không đăng nội dung vi phạm pháp luật, xúc phạm, quảng cáo, spam, hoặc chứa thông tin cá nhân của người khác.</li>
          </ul>
          <p className="mb-0">
            Quý khách đồng ý cho {shop} hiển thị nội dung này trên website. {shop} có quyền ẩn nội dung vi phạm mà không
            cần báo trước. Đánh giá từ khách đã mua và nhận hàng được gắn nhãn "Đã mua hàng".
          </p>
        </>
      )
    },
    {
      id: 'so-huu-tri-tue',
      title: 'Quyền sở hữu trí tuệ',
      content: (
        <p className="mb-0">
          Tên thương hiệu, logo, giao diện, bài viết, hình ảnh và các nội dung khác trên website thuộc quyền sở hữu của{' '}
          {shop} hoặc đối tác đã cấp phép. Nghiêm cấm sao chép, phân phối, thu thập dữ liệu tự động hoặc sử dụng cho mục
          đích thương mại khi chưa có sự đồng ý bằng văn bản của {shop}. Tên và nhãn hiệu sản phẩm thuộc về các nhà sản
          xuất tương ứng.
        </p>
      )
    },
    {
      id: 'trach-nhiem',
      title: 'Giới hạn trách nhiệm',
      content: (
        <ul className="mb-0">
          <li>{shop} nỗ lực đảm bảo website hoạt động ổn định và thông tin chính xác, nhưng không cam kết website không bao giờ gián đoạn do bảo trì, sự cố kỹ thuật hoặc nguyên nhân bất khả kháng.</li>
          <li>{shop} không chịu trách nhiệm về thiệt hại phát sinh từ việc khách hàng để lộ mật khẩu, mã OTP hoặc sử dụng thiết bị không an toàn.</li>
          <li>Trách nhiệm của {shop} đối với mỗi đơn hàng không vượt quá giá trị đơn hàng đó, trừ trường hợp pháp luật quy định khác.</li>
        </ul>
      )
    },
    {
      id: 'khieu-nai',
      title: 'Giải quyết khiếu nại và tranh chấp',
      content: (
        <>
          <p>
            Mọi khiếu nại vui lòng gửi qua tổng đài {settings.hotline}, email {settings.contactEmail} hoặc trực tiếp tại cửa hàng.
            {shop} tiếp nhận và phản hồi trong vòng 24 giờ làm việc, giải quyết khiếu nại trong thời gian sớm nhất.
          </p>
          <p className="mb-0">
            Tranh chấp phát sinh được ưu tiên giải quyết bằng thương lượng. Trường hợp không thương lượng được, các bên
            có quyền yêu cầu cơ quan có thẩm quyền giải quyết theo quy định của pháp luật Việt Nam về bảo vệ quyền lợi
            người tiêu dùng và thương mại điện tử.
          </p>
        </>
      )
    },
    {
      id: 'sua-doi',
      title: 'Sửa đổi Điều khoản',
      content: (
        <p className="mb-0">
          {shop} có thể cập nhật Điều khoản này để phù hợp với quy định pháp luật và chính sách kinh doanh. Phiên bản mới
          có hiệu lực kể từ ngày đăng tải, ngày cập nhật được ghi ở đầu trang. Những thay đổi quan trọng sẽ được thông báo
          trên website trước khi áp dụng. Việc Quý khách tiếp tục sử dụng website sau thời điểm đó được hiểu là đồng ý với
          Điều khoản đã sửa đổi. Đơn hàng đặt trước thời điểm sửa đổi tiếp tục áp dụng Điều khoản tại thời điểm đặt hàng.
        </p>
      )
    }
  ];

  return (
    <LegalPage
      title="Điều khoản sử dụng"
      subtitle={`Quy định khi mua sắm và sử dụng dịch vụ tại ${shop}`}
      effectiveDate="26/09/2026"
      updatedDate="26/09/2026"
      sections={sections}
      related={{ to: '/privacy', label: 'Chính sách bảo mật thông tin cá nhân' }}
    />
  );
}
