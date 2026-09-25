import { Fragment, useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Form } from 'react-bootstrap';
import { productService } from '../services/productService';
import { buildCompareGroups } from '../utils/specs';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function ComparePage() {
  const [allProducts, setAllProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareResult, setCompareResult] = useState([]);

  useEffect(() => {
    productService.getProducts({ limit: 50 }).then((res) => setAllProducts(res.data));
  }, []);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)));
  };

  const handleCompare = async () => {
    const result = await productService.compare(selectedIds);
    setCompareResult(result);
  };

  const compareGroups = buildCompareGroups(compareResult);

  return (
    <Container fluid="xl" style={{ maxWidth: '72rem' }} className="py-4">
      <h1 className="fs-3 fw-bold mb-4">So sánh sản phẩm</h1>
      <p className="small text-muted mb-3">Chọn tối đa 4 sản phẩm để so sánh song song thông số kỹ thuật</p>

      <Row className="g-3 mb-4">
        {allProducts.map((p) => (
          <Col key={p._id} xs={6} md={3}>
            <Form.Check
              type="checkbox"
              id={`compare-${p._id}`}
              className={`border rounded p-2 small ${selectedIds.includes(p._id) ? 'border-primary bg-primary bg-opacity-10' : ''}`}
              label={p.title}
              checked={selectedIds.includes(p._id)}
              onChange={() => toggleSelect(p._id)}
            />
          </Col>
        ))}
      </Row>

      <Button variant="primary" disabled={selectedIds.length < 2} className="mb-4" onClick={handleCompare}>
        So sánh ({selectedIds.length})
      </Button>

      {compareResult.length > 0 && (
        <div className="table-responsive">
          <Table bordered className="small align-middle">
            <thead>
              <tr>
                <th className="bg-light text-start">Thông số</th>
                {compareResult.map((p) => (
                  <th key={p._id} className="bg-light text-center">
                    <img src={p.featuredImage} alt={p.title} className="mx-auto mb-1 d-block" style={{ width: '5rem', height: '5rem', objectFit: 'contain' }} />
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
                  {g.keys.map((key) => (
                    <tr key={key}>
                      <td className="fw-medium">{key}</td>
                      {compareResult.map((p) => (
                        <td key={p._id} className="text-center">
                          {p.specifications?.[key] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Container>
  );
}
