import { useState } from 'react';
import { Card, Form, Button, Row, Col, Alert, Stack } from 'react-bootstrap';
import { warrantyCardService } from '../services/warrantyCardService';
import WarrantyCardView from './WarrantyCardView';

// Kiểm tra sản phẩm còn bảo hành không (không cần đăng nhập): mã sổ bảo hành / IMEI / mã đơn hàng + SĐT mua hàng
export default function WarrantyCoverageCheck() {
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState('');
  const [cards, setCards] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setCards(null);
    setLoading(true);
    try {
      setCards(await warrantyCardService.lookup(q.trim(), phone.trim()));
    } catch (err) {
      setError(err.response?.data?.message || 'Không tra cứu được, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-sm mb-3">
        <Card.Body className="p-4">
          <Form onSubmit={submit}>
            <Row className="g-3 align-items-end">
              <Col md={5}>
                <Form.Group controlId="coverage-q">
                  <Form.Label className="small fw-medium">Mã bảo hành, IMEI/Serial hoặc mã đơn hàng</Form.Label>
                  <Form.Control required maxLength={60} placeholder="VD: SBH..., 3567..., DH..." value={q} onChange={(e) => setQ(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="coverage-phone">
                  <Form.Label className="small fw-medium">Số điện thoại mua hàng</Form.Label>
                  <Form.Control required type="tel" inputMode="tel" placeholder="VD: 0912345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Button type="submit" className="w-100" disabled={loading}>{loading ? 'Đang kiểm tra...' : 'Kiểm tra'}</Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>
      {error && <Alert variant="warning">{error}</Alert>}
      {cards && (
        <Stack gap={2} className="mb-4">
          {cards.map((c) => <WarrantyCardView key={c._id} card={c} />)}
        </Stack>
      )}
    </>
  );
}
