import { Container } from 'react-bootstrap';

export default function TermsPage() {
  return (
    <Container fluid="xl" style={{ maxWidth: '48rem' }} className="py-5 small">
      <h1 className="fs-3 fw-bold mb-4">Điều khoản sử dụng</h1>
      <p className="mb-3">
        Đây là trang điều khoản sử dụng mẫu phục vụ mục đích minh họa cho đồ án tốt nghiệp. Khi sử dụng website
        TechShop, bạn đồng ý tuân thủ các quy định về đặt hàng, thanh toán, bảo hành và đổi trả được công bố công
        khai trên hệ thống.
      </p>
      <p className="mb-3">
        TechShop có quyền thay đổi nội dung điều khoản để phù hợp với quy định pháp luật hiện hành và chính sách kinh
        doanh của công ty.
      </p>
    </Container>
  );
}
