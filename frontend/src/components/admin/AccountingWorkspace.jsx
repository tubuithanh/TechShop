// DASHBOARD KẾ TOÁN: việc cần làm với tiền & chứng từ (chuyển khoản chờ xác nhận, COD chờ đối soát, chờ hoàn tiền,
// hóa đơn chờ xuất / cần xử lý), thu hôm nay theo hình thức; kế toán trưởng xem thêm từng chi nhánh + đội kế toán viên.
import { Link } from 'react-router-dom';
import { Card, Col, Row, Table, Badge } from 'react-bootstrap';
import { Bank, Truck, ArrowCounterclockwise, FileEarmarkText, ExclamationTriangleFill, Shop, People, Cash } from 'react-bootstrap-icons';

const vnd = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const short = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} tr` : (v || 0).toLocaleString('vi-VN') + 'đ');
const waited = (m) => (m >= 1440 ? `${Math.floor(m / 1440)} ngày` : m >= 60 ? `${Math.floor(m / 60)} giờ` : `${m} phút`);

// Ô việc cần làm: số lượng + số tiền, bấm để tới đúng trang xử lý
function Todo({ to, allowed, icon: Icon, count, amount, label, sub, tone }) {
  const body = (
    <Card className={`h-100 shadow-sm border-0 ${count ? `bg-${tone}-subtle` : ''}`}>
      <Card.Body className="d-flex gap-3 align-items-center">
        <div className={`rounded-circle d-flex align-items-center justify-content-center text-${count ? tone : 'secondary'}`} style={{ width: 44, height: 44, background: 'var(--bs-body-bg)' }}><Icon size={20} /></div>
        <div className="flex-grow-1">
          <div className="small text-muted">{label}</div>
          <div className="fw-bold fs-4 lh-sm">{count}{amount ? <span className="fs-6 fw-semibold text-body-secondary"> · {short(amount)}</span> : null}</div>
          {sub && <div className="small text-muted">{sub}</div>}
        </div>
      </Card.Body>
    </Card>
  );
  return allowed ? <Link to={to} className="text-decoration-none text-body">{body}</Link> : body;
}

export default function AccountingWorkspace({ a, can }) {
  return (
    <>
      <Row xs={1} sm={2} xl={3} className="g-3 mb-3">
        <Col><Todo to="/admin/orders?view=all&paymentMode=bank_transfer&paymentStatus=pending" allowed={can('/admin/orders')} icon={Bank} count={a.transfer.n} amount={a.transfer.amount} label="Chuyển khoản chờ xác nhận" sub={a.transfer.list[0] ? `chờ lâu nhất ${waited(a.transfer.list[0].waitingMinutes)}` : 'đã xác nhận hết'} tone="warning" /></Col>
        <Col><Todo to="/admin/deliveries" allowed={can('/admin/deliveries')} icon={Truck} count={a.codShipper.n} amount={a.codShipper.amount} label="COD shipper chưa nộp" sub={a.codCarrier.n ? `+ ${a.codCarrier.n} đơn GHN chưa trả (${short(a.codCarrier.amount)})` : 'đơn vị vận chuyển: đã đối soát'} tone="danger" /></Col>
        <Col><Todo to="/admin/orders?view=all&refundStatus=pending" allowed={can('/admin/orders')} icon={ArrowCounterclockwise} count={a.refunds.n} amount={a.refunds.amount} label="Chờ hoàn tiền cho khách" tone="danger" /></Col>
        <Col><Todo to="/admin/einvoices" allowed={can('/admin/einvoices')} icon={FileEarmarkText} count={a.einvoicePending} label="Đơn chờ xuất hóa đơn" tone="info" /></Col>
        <Col><Todo to="/admin/einvoices" allowed={can('/admin/einvoices')} icon={ExclamationTriangleFill} count={a.einvoiceAttention} label="Hóa đơn cần hủy / thay thế" sub="đơn đã trả hàng hoặc hoàn tiền" tone="danger" /></Col>
        <Col>
          <Card className="h-100 shadow-sm border-0"><Card.Body>
            <div className="small text-muted"><Cash className="me-1" />Thu hôm nay (đơn hoàn tất)</div>
            <div className="fw-bold fs-4 lh-sm mb-1">{vnd(a.todayTotal)}</div>
            {a.todayByPayment.length ? a.todayByPayment.map((p) => (
              <div key={p.mode} className="d-flex small"><span className="flex-grow-1">{p.label}</span><span className="text-muted me-2">{p.n} đơn</span><b>{short(p.amount)}</b></div>
            )) : <div className="small text-muted">Chưa có đơn hoàn tất</div>}
          </Card.Body></Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={6}>
          <Card className="h-100 shadow-sm"><Card.Body>
            <div className="fw-semibold mb-2"><Bank className="me-1" />Chuyển khoản cần đối chiếu sao kê</div>
            {a.transfer.list.length ? (
              <Table size="sm" className="small mb-0"><tbody>
                {a.transfer.list.map((o) => <tr key={o._id}><td className="fw-medium">{o.orderCode}</td><td>{o.name}</td><td className="text-end">{vnd(o.grandTotal)}</td><td className="text-end text-muted">{waited(o.waitingMinutes)}</td></tr>)}
              </tbody></Table>
            ) : <div className="small text-muted">Không có khoản chờ xác nhận.</div>}
          </Card.Body></Card>
        </Col>
        <Col lg={6}>
          <Card className="h-100 shadow-sm"><Card.Body>
            <div className="fw-semibold mb-2"><Truck className="me-1" />COD shipper đang giữ</div>
            {a.codShipper.byShipper.length ? (
              <Table size="sm" className="small mb-0"><tbody>
                {a.codShipper.byShipper.map((x) => <tr key={x.shipperId}><td>{x.name}</td><td className="text-end">{x.n} đơn</td><td className="text-end fw-medium">{vnd(x.amount)}</td><td className="text-end">{x.oldestDays >= 2 ? <Badge bg="danger">giữ {x.oldestDays} ngày</Badge> : <span className="text-muted">{x.oldestDays} ngày</span>}</td></tr>)}
              </tbody></Table>
            ) : <div className="small text-muted">Shipper đã nộp đủ tiền.</div>}
          </Card.Body></Card>
        </Col>
      </Row>

      {/* Kế toán trưởng: từng chi nhánh + đội kế toán viên */}
      {a.stores && (
        <Row className="g-3 mb-3">
          <Col lg={8}>
            <Card className="h-100 shadow-sm"><Card.Body>
              <div className="fw-semibold mb-2"><Shop className="me-1" />Tình hình kế toán các chi nhánh</div>
              <div className="table-responsive"><Table size="sm" hover className="small mb-0 align-middle">
                <thead><tr><th>Chi nhánh</th><th className="text-end">Thu hôm nay</th><th className="text-end">CK chờ</th><th className="text-end">COD đang giữ</th><th className="text-end">Chờ hoàn</th><th className="text-end">Chờ hóa đơn</th></tr></thead>
                <tbody>
                  {a.stores.map((st) => (
                    <tr key={st._id}>
                      <td className="fw-medium">{st.name}</td>
                      <td className="text-end">{short(st.revenueToday)}</td>
                      <td className="text-end">{st.transfer ? <Badge bg="warning" text="dark">{st.transfer}</Badge> : 0}</td>
                      <td className="text-end">{st.codHeld ? short(st.codHeld) : '—'}</td>
                      <td className="text-end">{st.refunds ? <Badge bg="danger">{st.refunds}</Badge> : 0}</td>
                      <td className="text-end">{st.einvoicePending || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </Table></div>
            </Card.Body></Card>
          </Col>
          <Col lg={4}>
            <Card className="h-100 shadow-sm"><Card.Body>
              <div className="fw-semibold mb-2"><People className="me-1" />Kế toán viên ({a.team?.length || 0})</div>
              {a.team?.length ? a.team.map((t) => (
                <div key={t._id} className="d-flex align-items-center small py-1 border-bottom">
                  <span className={`me-2 rounded-circle ${t.activeToday ? 'bg-success' : 'bg-secondary'}`} style={{ width: 8, height: 8 }} title={t.activeToday ? 'Đã đăng nhập hôm nay' : 'Chưa đăng nhập hôm nay'} />
                  <span className="flex-grow-1">{t.name}<div className="text-muted">{t.store || 'Chưa gắn chi nhánh'}</div></span>
                  {can('/admin/staff-reports') && <Link to={`/admin/staff-reports/${t._id}`} className="small">Báo cáo</Link>}
                </div>
              )) : <div className="small text-muted">Chưa có kế toán viên báo cáo cho bạn.</div>}
            </Card.Body></Card>
          </Col>
        </Row>
      )}
    </>
  );
}
