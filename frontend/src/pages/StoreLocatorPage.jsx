import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Nav, Spinner } from 'react-bootstrap';
import { storeService } from '../services/storeService';

export default function StoreLocatorPage() {
  const [stores, setStores] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storeService.getCities().then(setCities);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    storeService
      .getStores(selectedCity)
      .then((data) => {
        if (!ignore) setStores(data);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedCity]);

  return (
    <Container fluid="xl" style={{ maxWidth: '64rem' }} className="py-4">
      <h1 className="fs-3 fw-bold mb-2">Hệ thống cửa hàng</h1>
      <p className="small text-muted mb-4">Tìm cửa hàng TechShop gần bạn nhất để trải nghiệm và nhận hàng</p>

      <Nav variant="pills" className="gap-2 mb-4 flex-wrap">
        <Nav.Item>
          <Nav.Link
            onClick={() => setSelectedCity('')}
            active={!selectedCity}
            className="small rounded-pill border"
          >
            Tất cả
          </Nav.Link>
        </Nav.Item>
        {cities.map((c) => (
          <Nav.Item key={c}>
            <Nav.Link
              onClick={() => setSelectedCity(c)}
              active={selectedCity === c}
              className="small rounded-pill border"
            >
              {c}
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : (
        <Row className="g-4">
          {stores.map((s) => (
            <Col key={s._id} xs={12} md={6}>
              <Card className="h-100">
                <Card.Body>
                  <Card.Title className="fw-bold mb-2">{s.name}</Card.Title>
                  <p className="small text-muted mb-1">📍 {s.address}</p>
                  <p className="small text-muted mb-1">📞 {s.phoneNumber}</p>
                  <p className="small text-muted mb-0">🕒 {s.openHours}</p>
                  {s.lat && s.lng && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="d-inline-block mt-2 small text-primary"
                    >
                      Chỉ đường trên Google Maps →
                    </a>
                  )}
                </Card.Body>
              </Card>
            </Col>
          ))}
          {stores.length === 0 && (
            <Col xs={12} className="text-muted text-center py-5">
              Không có cửa hàng phù hợp
            </Col>
          )}
        </Row>
      )}
    </Container>
  );
}
