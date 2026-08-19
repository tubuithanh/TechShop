import { useEffect, useState } from 'react';
import { Container, Card, Badge, Spinner, Alert, Stack } from 'react-bootstrap';
import { warrantyService } from '../services/warrantyService';

const statusLabel = {
  received: 'Đã tiếp nhận',
  checking: 'Đang kiểm tra',
  repairing: 'Đang sửa chữa',
  waiting_parts: 'Chờ linh kiện',
  done: 'Đã sửa xong',
  returned: 'Đã trả máy'
};

const statusVariant = {
  received: 'info',
  checking: 'info',
  repairing: 'warning',
  waiting_parts: 'warning',
  done: 'success',
  returned: 'secondary'
};

export default function MyWarrantiesPage() {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    warrantyService.getMyWarranties().then(setWarranties).finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  return (
    <Container className="py-4" style={{ maxWidth: '48rem' }}>
      <h1 className="fs-4 fw-bold mb-4">Yêu cầu bảo hành của tôi</h1>
      {warranties.length === 0 ? (
        <Alert variant="light" className="border text-muted mb-0">
          Bạn chưa có yêu cầu bảo hành nào.
        </Alert>
      ) : (
        <Stack gap={3}>
          {warranties.map((w) => (
            <Card key={w._id} className="shadow-sm">
              <Card.Body>
                <div className="d-flex justify-content-between mb-1">
                  <span className="fw-medium">Phiếu #{w.ticketCode}</span>
                  <Badge bg={statusVariant[w.status] || 'secondary'}>{statusLabel[w.status]}</Badge>
                </div>
                <div className="small text-muted">{w.productName}</div>
                <div className="small text-muted mt-1">Mô tả lỗi: {w.issueDescription}</div>
                <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                  Gửi lúc {new Date(w.createdAt).toLocaleString('vi-VN')}
                </div>
              </Card.Body>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
