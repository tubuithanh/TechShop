import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Form, Table, Badge, Spinner, Card, Row, Col } from 'react-bootstrap';
import { ArrowLeft, StarFill, Trophy } from 'react-bootstrap-icons';
import { staffService } from '../../services/staffService';

const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const SORTS = {
  posRevenue: 'Doanh số quầy',
  ordersHandled: 'Đơn đã xử lý',
  deliveriesDone: 'Giao thành công',
  repairTickets: 'Phiếu sửa chữa',
  extensionRevenue: 'Gói bảo hành'
};
const MEDAL = ['#f59e0b', '#94a3b8', '#b45309'];

// Bảng hiệu suất cả năm của toàn bộ nhân viên - căn cứ tính thưởng & đánh giá cuối năm
export default function AdminStaffPerformancePage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [sort, setSort] = useState('posRevenue');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    setRows(null);
    staffService.performanceSummary(year).then(setRows).catch(() => setRows([]));
  }, [year]);

  const sorted = useMemo(() => [...(rows || [])].sort((a, b) => (b.totals[sort] || 0) - (a.totals[sort] || 0)), [rows, sort]);
  const reviewed = (rows || []).filter((r) => r.review);
  const totalBonus = reviewed.reduce((s, r) => s + (r.review.bonus || 0), 0);

  return (
    <Container fluid>
      <Link to="/admin/staff" className="small text-decoration-none d-inline-flex align-items-center gap-1 mb-2"><ArrowLeft /> Nhân viên</Link>
      <div className="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Hiệu suất & thưởng nhân viên</h1>
          <p className="small text-muted mb-0">Số liệu cả năm từ đơn hàng, giao hàng, sửa chữa, gói bảo hành. Bấm tên nhân viên để xem chi tiết và đánh giá.</p>
        </div>
        <div className="d-flex gap-2">
          <Form.Select size="sm" style={{ width: 110 }} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm">
            {Array.from({ length: 5 }, (_, i) => thisYear - i).map((y) => <option key={y}>{y}</option>)}
          </Form.Select>
          <Form.Select size="sm" style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Xếp hạng theo">
            {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>Xếp theo: {l}</option>)}
          </Form.Select>
        </div>
      </div>

      <Row className="g-2 mb-3">
        <Col xs={6} md={3}><Card className="border-0 shadow-sm"><Card.Body className="py-2"><div className="small text-muted">Nhân viên</div><div className="fs-5 fw-bold">{rows?.length ?? '…'}</div></Card.Body></Card></Col>
        <Col xs={6} md={3}><Card className="border-0 shadow-sm"><Card.Body className="py-2"><div className="small text-muted">Đã đánh giá {year}</div><div className="fs-5 fw-bold">{reviewed.length}</div></Card.Body></Card></Col>
        <Col xs={12} md={6}><Card className="border-0 shadow-sm"><Card.Body className="py-2"><div className="small text-muted">Tổng tiền thưởng đã duyệt</div><div className="fs-5 fw-bold text-primary">{formatVND(totalBonus)}</div></Card.Body></Card></Col>
      </Row>

      <div className="bg-white rounded-3 shadow-sm">
        <Table hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted small">
              <th>#</th><th>Nhân viên</th>
              <th className="text-end">Doanh số quầy</th><th className="text-end">Đơn xử lý</th><th className="text-end">Giao thành công</th>
              <th className="text-end">Sửa chữa</th><th className="text-end">Gói BH</th><th>Đánh giá</th><th className="text-end">Thưởng</th>
            </tr>
          </thead>
          <tbody>
            {!rows && <tr><td colSpan={9} className="text-center py-4"><Spinner size="sm" /></td></tr>}
            {sorted.map((r, i) => (
              <tr key={r._id} className={r.isActive ? '' : 'opacity-50'}>
                <td>{i < 3 && r.totals[sort] > 0 ? <Trophy style={{ color: MEDAL[i] }} /> : i + 1}</td>
                <td>
                  <Link to={`/admin/staff/${r._id}`} className="fw-medium text-decoration-none">{r.name}</Link>
                  <div className="small text-muted">{r.title || 'Nhân viên'}{r.store ? ` · ${r.store}` : ''}{r.managedStores ? ` · +${r.managedStores} CN` : ''}</div>
                </td>
                <td className="text-end fw-medium">{formatVND(r.totals.posRevenue)}</td>
                <td className="text-end">{r.totals.ordersHandled}</td>
                <td className="text-end">{r.totals.deliveriesDone}{r.totals.deliveriesAssigned ? <span className="text-muted small">/{r.totals.deliveriesAssigned}</span> : ''}</td>
                <td className="text-end">{r.totals.repairTickets}{r.totals.repairRating ? <span className="text-muted small"> ({r.totals.repairRating}★)</span> : ''}</td>
                <td className="text-end">{r.totals.extensionsSold}</td>
                <td>
                  {r.review ? (
                    <span className="d-inline-flex align-items-center gap-1 text-warning">
                      {Array.from({ length: r.review.rating }, (_, k) => <StarFill key={k} size={12} />)}
                    </span>
                  ) : <Badge bg="light" text="dark" className="border fw-normal">Chưa đánh giá</Badge>}
                </td>
                <td className="text-end">{r.review ? formatVND(r.review.bonus) : '—'}</td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={9} className="text-center text-muted py-4">Chưa có nhân viên</td></tr>}
          </tbody>
        </Table>
      </div>
    </Container>
  );
}
