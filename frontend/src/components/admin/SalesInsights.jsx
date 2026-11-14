// PHÂN TÍCH BÁN HÀNG CHI TIẾT (khối bổ sung trong "Báo cáo của tôi" / quản lý xem 1 nhân viên):
// chỉ tiêu tháng, khung giờ bán, cơ cấu doanh thu, khách hàng, chất lượng bán, đơn gần đây, xuất CSV.
import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { Card, Row, Col, Button, Form, Badge, ProgressBar, Table, Alert, Spinner, InputGroup } from 'react-bootstrap';
import { Bullseye, Clock, PieChart as PieIcon, People, ShieldCheck, ListUl, Download, PencilSquare } from 'react-bootstrap-icons';
import { staffReportService } from '../../services/staffReportService';
import { downloadCsv } from '../../utils/csvExport';
const money = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const shortMoney = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${Math.round(v / 1e6)} tr` : (v || 0).toLocaleString('vi-VN'));

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // $dayOfWeek: 1 = Chủ nhật
const COLORS = ['#0d6efd', '#20c997', '#fd7e14', '#6f42c1', '#dc3545', '#ffc107', '#0dcaf0', '#6c757d'];
const STATUS = { delivered: ['Hoàn tất', 'success'], cancelled: ['Đã hủy', 'danger'], returned: ['Đã trả', 'secondary'], returning: ['Đang trả', 'warning'] };
const time = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

// Thẻ chỉ số nhỏ
function Stat({ label, value, sub, tone }) {
  return (
    <div className={`border rounded-3 p-2 h-100 ${tone ? `border-${tone}-subtle bg-${tone}-subtle` : ''}`}>
      <div className="small text-muted">{label}</div>
      <div className="fw-bold fs-5 lh-sm">{value}</div>
      {sub && <div className="small text-muted">{sub}</div>}
    </div>
  );
}

// Chỉ tiêu tháng: thanh tiến độ + dự báo; quản lý sửa được chỉ tiêu
function TargetCard({ t, staffId, canSetTarget, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [orders, setOrders] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const open = () => { setAmount(t.target ? String(t.target.amount) : ''); setOrders(t.target?.orders ? String(t.target.orders) : ''); setMsg(''); setEditing(true); };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      const r = await staffReportService.setTarget(staffId, { amount: Number(amount.replace(/\D/g, '')) || 0, orders: Number(orders) || 0 });
      onSaved(r.data); setEditing(false);
    } catch (err) { setMsg(err.response?.data?.message || 'Không lưu được chỉ tiêu'); } finally { setSaving(false); }
  };
  const pct = t.percent ?? 0;
  const tone = pct >= 100 ? 'success' : t.forecastPercent >= 100 ? 'info' : t.forecastPercent >= 80 ? 'warning' : 'danger';
  return (
    <Card className="shadow-sm h-100"><Card.Body>
      <div className="d-flex align-items-center mb-2">
        <div className="fw-semibold flex-grow-1"><Bullseye className="me-1 text-danger" />Chỉ tiêu tháng {t.month.slice(5)}/{t.month.slice(0, 4)}</div>
        {canSetTarget && !editing && <Button size="sm" variant="outline-primary" onClick={open}><PencilSquare className="me-1" />{t.target ? 'Sửa' : 'Đặt chỉ tiêu'}</Button>}
      </div>
      {editing ? (
        <Form onSubmit={save}>
          <InputGroup size="sm" className="mb-2"><InputGroup.Text>Doanh thu</InputGroup.Text><Form.Control inputMode="numeric" value={amount ? Number(amount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setAmount(e.target.value)} placeholder="VD 150.000.000" autoFocus /><InputGroup.Text>đ</InputGroup.Text></InputGroup>
          <InputGroup size="sm" className="mb-2"><InputGroup.Text>Số đơn</InputGroup.Text><Form.Control type="number" min={0} value={orders} onChange={(e) => setOrders(e.target.value)} placeholder="không bắt buộc" /></InputGroup>
          {msg && <div className="small text-danger mb-2">{msg}</div>}
          <div className="d-flex gap-2"><Button size="sm" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</Button><Button size="sm" variant="light" onClick={() => setEditing(false)}>Hủy</Button><span className="small text-muted align-self-center">Nhập 0 để bỏ chỉ tiêu</span></div>
        </Form>
      ) : t.target ? (
        <>
          <div className="d-flex justify-content-between small mb-1"><span><b className="fs-5">{money(t.revenue)}</b> / {money(t.target.amount)}</span><b className={`text-${tone}`}>{pct}%</b></div>
          <ProgressBar className="mb-2" style={{ height: 10 }}>
            <ProgressBar variant={tone} now={Math.min(100, pct)} key="done" />
          </ProgressBar>
          <Row xs={2} className="g-2 small">
            <Col><Stat label="Dự báo cuối tháng" value={shortMoney(t.forecast)} sub={`${t.forecastPercent}% chỉ tiêu`} tone={t.forecastPercent >= 100 ? 'success' : 'warning'} /></Col>
            <Col><Stat label="Cần bán mỗi ngày" value={t.needPerDay ? shortMoney(t.needPerDay) : 'Đã đạt 🎉'} sub={`còn ${t.daysLeft + 1} ngày (gồm hôm nay)`} /></Col>
            {t.target.orders > 0 && <Col xs={12}><Stat label="Số đơn" value={`${t.orders} / ${t.target.orders}`} sub={`${Math.round((t.orders / t.target.orders) * 100)}%`} /></Col>}
          </Row>
          <div className="small text-muted mt-2">Ngày {t.daysElapsed}/{t.daysInMonth} · đặt bởi {t.target.setByName || 'quản lý'}</div>
        </>
      ) : (
        <div className="small text-muted">
          Chưa có chỉ tiêu tháng này. Doanh thu đã bán: <b>{money(t.revenue)}</b> ({t.orders} đơn) · dự báo cuối tháng <b>{shortMoney(t.forecast)}</b>.
          {!canSetTarget && <div className="mt-1">Quản lý của bạn sẽ đặt chỉ tiêu.</div>}
        </div>
      )}
    </Card.Body></Card>
  );
}

// Bản đồ nhiệt thứ × giờ (7h - 22h): màu đậm = nhiều doanh thu
function Heatmap({ cells }) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 7);
  const map = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c]));
  const max = Math.max(1, ...cells.map((c) => c.revenue));
  return (
    <div className="table-responsive">
      <table className="small text-center" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
        <thead><tr><th />{hours.map((h) => <th key={h} className="fw-normal text-muted" style={{ minWidth: 26 }}>{h}h</th>)}</tr></thead>
        <tbody>
          {[2, 3, 4, 5, 6, 7, 1].map((d) => (
            <tr key={d}>
              <th className="fw-normal text-muted pe-1">{DAYS[d - 1]}</th>
              {hours.map((h) => {
                const c = map.get(`${d}-${h}`);
                const a = c ? 0.12 + (c.revenue / max) * 0.88 : 0;
                return <td key={h} title={c ? `${DAYS[d - 1]} ${h}h: ${c.orders} đơn · ${money(c.revenue)}` : ''} style={{ width: 26, height: 22, borderRadius: 4, background: c ? `rgba(13,110,253,${a})` : 'var(--bs-tertiary-bg)' }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesInsights({ loadSales, staffId, canSetTarget, range, staffName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    loadSales({ from: range.from || undefined, to: range.to || undefined })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.response?.data?.message || 'Không tải được phân tích bán hàng'));
    return () => { live = false; };
  }, [loadSales, range]);

  if (error) return <Alert variant="warning" className="small">{error}</Alert>;
  if (!data) return <div className="text-center py-3"><Spinner size="sm" /></div>;
  const q = data.quality; const c = data.customers;

  // Xuất CSV: đơn gần đây + tóm tắt
  const exportCsv = () => downloadCsv(
    `bao-cao-ban-hang-${(staffName || 'nhan-vien').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Mã đơn', 'Thời gian', 'Khách', 'Số SP', 'Thanh toán', 'Mã giảm giá', 'Tổng tiền', 'Trạng thái'],
    data.recent.map((o) => [o.orderCode, new Date(o.createdAt).toLocaleString('vi-VN'), o.customer, o.units, o.payment, o.voucherCode, o.grandTotal, STATUS[o.status]?.[0] || o.status])
  );

  return (
    <div className="mt-3">
      <Row className="g-3 mb-3">
        <Col lg={5}><TargetCard t={data.target} staffId={staffId} canSetTarget={canSetTarget} onSaved={(t) => setData((d) => ({ ...d, target: t }))} /></Col>
        <Col lg={7}>
          <Card className="shadow-sm h-100"><Card.Body>
            <div className="fw-semibold mb-2"><ShieldCheck className="me-1 text-success" />Chất lượng bán hàng</div>
            <Row xs={2} md={4} className="g-2">
              <Col><Stat label="Đơn hủy / trả" value={`${q.cancelRate}%`} sub={`${q.cancelled + q.returned}/${q.total} đơn`} tone={q.cancelRate > 10 ? 'danger' : undefined} /></Col>
              <Col><Stat label="Giảm giá đã cho" value={`${q.discountRate}%`} sub={shortMoney(q.discount)} tone={q.discountRate > 15 ? 'warning' : undefined} /></Col>
              <Col><Stat label="Đơn dùng mã" value={`${q.voucherRate}%`} sub={`${q.voucherOrders} đơn`} /></Col>
              <Col><Stat label="Khách thành viên" value={c.members} sub={`${c.newMembers} mới · ${c.returning} quay lại`} /></Col>
            </Row>
            <div className="small text-muted mt-2">
              {q.cancelRate > 10 && <div>• Tỷ lệ hủy / trả cao - kiểm tra lại tư vấn sản phẩm & kiểm tra máy trước khi giao.</div>}
              {q.discountRate > 15 && <div>• Giảm giá chiếm nhiều - ưu tiên bán theo giá niêm yết, dùng mã khi thật cần.</div>}
              {c.guestOrders > 0 && <div>• {c.guestOrders} đơn khách lẻ ({shortMoney(c.guestRevenue)}) - mời khách tạo thẻ thành viên để tích điểm & quay lại.</div>}
              {q.cancelRate <= 10 && q.discountRate <= 15 && !c.guestOrders && <div>• Chỉ số chất lượng tốt, tiếp tục phát huy.</div>}
            </div>
          </Card.Body></Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={7}>
          <Card className="shadow-sm h-100"><Card.Body>
            <div className="fw-semibold mb-1"><Clock className="me-1" />Khung giờ bán</div>
            <div className="small text-muted mb-2">
              {data.peak.hour != null ? <>Bán tốt nhất lúc <b>{data.peak.hour}h - {data.peak.hour + 1}h</b>, ngày <b>{DAYS[data.peak.day - 1]}</b>. Rảnh vào giờ thấp điểm: gọi lại khách cũ, chăm sóc khách chờ.</> : 'Chưa có đơn trong kỳ'}
            </div>
            <Heatmap cells={data.heatmap} />
          </Card.Body></Card>
        </Col>
        <Col lg={5}>
          <Card className="shadow-sm h-100"><Card.Body>
            <div className="fw-semibold mb-2"><PieIcon className="me-1" />Cơ cấu doanh thu</div>
            {data.category.length ? (
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={data.category} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={shortMoney} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={90} fontSize={11} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#20c997" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="small text-muted">Chưa có dữ liệu</div>}
            {data.payment.length > 0 && (
              <div className="d-flex align-items-center gap-2 mt-2">
                <ResponsiveContainer width={90} height={90}>
                  <PieChart><Pie data={data.payment} dataKey="revenue" nameKey="label" innerRadius={24} outerRadius={42}>{data.payment.map((p, i) => <Cell key={p.mode} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart>
                </ResponsiveContainer>
                <div className="small flex-grow-1">
                  {data.payment.map((p, i) => (
                    <div key={p.mode} className="d-flex gap-2"><span style={{ color: COLORS[i % COLORS.length] }}>●</span><span className="flex-grow-1">{p.label}</span><span className="text-muted">{p.orders} đơn</span><b>{shortMoney(p.revenue)}</b></div>
                  ))}
                </div>
              </div>
            )}
          </Card.Body></Card>
        </Col>
      </Row>

      <Row className="g-3">
        <Col lg={5}>
          <Card className="shadow-sm h-100"><Card.Body>
            <div className="fw-semibold mb-2"><People className="me-1" />Khách mua nhiều nhất</div>
            {c.top.length ? (
              <Table size="sm" className="small mb-0"><tbody>
                {c.top.map((k, i) => <tr key={k._id}><td className="text-muted">{i + 1}</td><td>{k.name}<div className="text-muted">{k.phone}</div></td><td className="text-end">{k.orders} đơn</td><td className="text-end fw-medium">{shortMoney(k.revenue)}</td></tr>)}
              </tbody></Table>
            ) : <div className="small text-muted">Chưa có khách thành viên trong kỳ</div>}
          </Card.Body></Card>
        </Col>
        <Col lg={7}>
          <Card className="shadow-sm h-100"><Card.Body>
            <div className="d-flex align-items-center mb-2">
              <div className="fw-semibold flex-grow-1"><ListUl className="me-1" />Đơn gần đây</div>
              {data.recent.length > 0 && <Button size="sm" variant="outline-secondary" onClick={exportCsv}><Download className="me-1" />Xuất CSV</Button>}
            </div>
            {data.recent.length ? (
              <div className="table-responsive"><Table size="sm" hover className="small mb-0 align-middle">
                <thead><tr><th>Mã đơn</th><th>Lúc</th><th>Khách</th><th className="text-end">Tổng</th><th /></tr></thead>
                <tbody>
                  {data.recent.map((o) => (
                    <tr key={o._id}>
                      <td className="fw-medium">{o.orderCode}</td>
                      <td className="text-nowrap">{time(o.createdAt)}</td>
                      <td className="text-truncate" style={{ maxWidth: 120 }}>{o.customer}<div className="text-muted">{o.units} SP · {o.payment}{o.voucherCode && ` · ${o.voucherCode}`}</div></td>
                      <td className="text-end fw-medium">{shortMoney(o.grandTotal)}</td>
                      <td>{STATUS[o.status] && <Badge bg={STATUS[o.status][1]}>{STATUS[o.status][0]}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table></div>
            ) : <div className="small text-muted">Chưa có đơn trong kỳ</div>}
          </Card.Body></Card>
        </Col>
      </Row>
    </div>
  );
}
