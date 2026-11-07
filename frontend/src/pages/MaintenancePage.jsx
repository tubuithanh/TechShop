import { Container } from 'react-bootstrap';
import { Tools } from 'react-bootstrap-icons';

export default function MaintenancePage({ message }) {
  return (
    <Container className="d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: '100vh' }}>
      <div className="icon-circle bg-warning-subtle mb-4" style={{ width: '5rem', height: '5rem' }}>
        <Tools size={36} className="text-warning-emphasis" />
      </div>
      <h1 className="fs-3 fw-bold mb-2">Website đang bảo trì</h1>
      <p className="text-muted" style={{ maxWidth: '32rem' }}>
        {message || 'Website đang được bảo trì để nâng cấp trải nghiệm. Vui lòng quay lại sau ít phút.'}
      </p>
    </Container>
  );
}
