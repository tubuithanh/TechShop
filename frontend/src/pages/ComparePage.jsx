import { Fragment, useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Form } from 'react-bootstrap';
import { productService } from '../services/productService';
import { buildCompareGroups, getBestSpecValue } from '../utils/specs';
import ProductImage from '../components/ProductImage';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function ComparePage() {
  const [allProducts, setAllProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareResult, setCompareResult] = useState([]);
  // Tìm theo tên (API tìm không dấu): trước đây chỉ chọn được trong 50 sản phẩm mới nhất
  const [keyword, setKeyword] = useState('');
  const [selectedNames, setSelectedNames] = useState({}); // giữ tên sản phẩm đã chọn khi đổi từ khóa
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      productService
        .getProducts({ keyword, limit: 24 })
        .then((res) => !ignore && setAllProducts(res.data))
        .catch(() => !ignore && setError('Không tải được danh sách sản phẩm'));
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [keyword]);

  const toggleSelect = (p) => {
    setSelectedIds((prev) => (prev.includes(p._id) ? prev.filter((x) => x !== p._id) : [...prev, p._id].slice(0, 4)));
    setSelectedNames((prev) => ({ ...prev, [p._id]: p.title }));
  };

  const handleCompare = async () => {
    setError('');
    try {
      // Cột theo đúng thứ tự khách chọn (API trả theo thứ tự trong cơ sở dữ liệu)
      const result = await productService.compare(selectedIds);
      setCompareResult(selectedIds.map((id) => result.find((p) => p._id === id)).filter(Boolean));
    } catch (err) {
      setError(err.response?.data?.message || 'Không so sánh được, vui lòng thử lại');
    }
  };

  const compareGroups = buildCompareGroups(compareResult);

  return (
    <Container fluid="xl" style={{ maxWidth: '72rem' }} className="py-4">
      <h1 className="fs-3 fw-bold mb-4">So sánh sản phẩm</h1>
      <p className="small text-muted mb-3">Chọn tối đa 4 sản phẩm để so sánh song song thông số kỹ thuật</p>

      <Form.Control
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="Tìm sản phẩm để thêm vào so sánh..."
        className="mb-2"
        style={{ maxWidth: '24rem' }}
      />
      {selectedIds.length > 0 && (
        <div className="small mb-3">
          Đã chọn:{' '}
          {selectedIds.map((id) => (
            <Button key={id} size="sm" variant="outline-primary" className="me-1 mb-1 py-0" onClick={() => toggleSelect({ _id: id })}>
              {selectedNames[id]} ✕
            </Button>
          ))}
        </div>
      )}
      <Row className="g-3 mb-4">
        {allProducts.map((p) => (
          <Col key={p._id} xs={6} md={3}>
            <Form.Check
              type="checkbox"
              id={`compare-${p._id}`}
              className={`border rounded p-2 small ${selectedIds.includes(p._id) ? 'border-primary bg-primary bg-opacity-10' : ''}`}
              label={p.title}
              checked={selectedIds.includes(p._id)}
              onChange={() => toggleSelect(p)}
            />
          </Col>
        ))}
      </Row>

      <Button variant="primary" disabled={selectedIds.length < 2} className="mb-4" onClick={handleCompare}>
        So sánh ({selectedIds.length})
      </Button>
      {error && <div className="alert alert-warning small py-2">{error}</div>}

      {compareResult.length > 0 && (
        <div className="table-responsive">
          <Table bordered className="small align-middle">
            <thead>
              <tr>
                <th className="bg-light text-start">Thông số</th>
                {compareResult.map((p) => (
                  <th key={p._id} className="bg-light text-center">
                    <ProductImage src={p.featuredImage} alt={p.title} size={160} className="mx-auto mb-1 rounded" style={{ width: '5rem' }} />
                    {p.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="fw-medium">Giá</td>
                {compareResult.map((p) => (
                  <td key={p._id} className="text-center text-primary fw-bold">
                    {formatVND(p.effectivePrice ?? (p.salePrice || p.price))}
                  </td>
                ))}
              </tr>
              {compareGroups.map((g) => (
                <Fragment key={g.group}>
                  <tr>
                    <td
                      colSpan={compareResult.length + 1}
                      className="bg-light fw-bold text-uppercase"
                      style={{ fontSize: '0.8rem', letterSpacing: '0.03em' }}
                    >
                      {g.group}
                    </td>
                  </tr>
                  {g.keys.map((key) => {
                    const best = getBestSpecValue(compareResult, key);
                    return (
                      <tr key={key}>
                        <td className="fw-medium">{key}</td>
                        {compareResult.map((p) => {
                          const isBest = best !== null && p.specNumbers?.[key] === best;
                          return (
                            <td key={p._id} className={`text-center ${isBest ? 'text-success fw-bold' : ''}`}>
                              {p.specifications?.[key] || '-'}
                              {isBest && ' ✓'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Container>
  );
}
