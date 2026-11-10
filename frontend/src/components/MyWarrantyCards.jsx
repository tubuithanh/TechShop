import { useEffect, useMemo, useState } from 'react';
import { Stack, Button, Modal, Form, Alert, Spinner } from 'react-bootstrap';
import { warrantyCardService } from '../services/warrantyCardService';
import WarrantyCardView, { formatVND, fmtDay } from './WarrantyCardView';

// "Sổ bảo hành của tôi": mỗi máy đã mua 1 sổ - kích hoạt bảo hành, mua thêm thời gian bảo hành
// Bộ lọc nhanh trong tab sổ bảo hành
const FILTERS = [
  { key: 'all', label: 'Tất cả', test: () => true },
  { key: 'active', label: 'Còn bảo hành', test: (c) => c.inWarranty },
  { key: 'expiring', label: 'Sắp hết hạn', test: (c) => c.inWarranty && c.daysLeft <= 60 },
  { key: 'activation', label: 'Chờ kích hoạt', test: (c) => c.canActivate },
  { key: 'pending', label: 'Gói chờ thanh toán', test: (c) => c.extensions?.some((e) => e.status === 'pending') },
  { key: 'expired', label: 'Hết bảo hành', test: (c) => !c.inWarranty }
];

// onLoaded(cards): báo danh sách cho trang cha (đếm số trên tab); onRequestRepair(card): mở form yêu cầu sửa chữa
export default function MyWarrantyCards({ onLoaded, onRequestRepair }) {
  const [filter, setFilter] = useState('all');
  const [cards, setCards] = useState(null);
  const [error, setError] = useState('');
  const [buying, setBuying] = useState(null); // sổ đang chọn mua gói
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [channel, setChannel] = useState('store');
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = () => warrantyCardService.mine().then((list) => { setCards(list); onLoaded?.(list); }).catch((err) => {
    setCards([]);
    setError(err.response?.data?.message || 'Không tải được sổ bảo hành');
  });
  useEffect(() => { load(); }, []);

  const replace = (updated) => setCards((list) => {
    const next = list.map((c) => (c._id === updated._id ? updated : c));
    onLoaded?.(next);
    return next;
  });
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, (cards || []).filter(f.test).length])), [cards]);

  const activate = async (card) => {
    if (!window.confirm(`Kích hoạt bảo hành "${card.productName}" từ hôm nay?`)) return;
    try {
      replace(await warrantyCardService.activate(card._id));
    } catch (err) {
      alert(err.response?.data?.message || 'Không kích hoạt được');
    }
  };

  const openBuy = async (card) => {
    setBuying(card);
    setModalError('');
    setPlans([]);
    setPlanId('');
    try {
      const list = await warrantyCardService.plans(card._id);
      setPlans(list);
      setPlanId(list[0]?._id || '');
    } catch (err) {
      setModalError(err.response?.data?.message || 'Không tải được gói bảo hành');
    }
  };

  const submitBuy = async () => {
    setBusy(true);
    setModalError('');
    try {
      replace(await warrantyCardService.requestExtension(buying._id, planId, channel));
      setBuying(null);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Không đăng ký được gói');
    } finally {
      setBusy(false);
    }
  };

  const cancelExt = async (card, ext) => {
    if (!window.confirm(`Hủy đăng ký gói "${ext.planName}"?`)) return;
    try {
      replace(await warrantyCardService.cancelExtension(card._id, ext._id));
    } catch (err) {
      alert(err.response?.data?.message || 'Không hủy được');
    }
  };

  if (!cards) return <div className="text-center py-3"><Spinner size="sm" /></div>;
  const selected = plans.find((p) => p._id === planId);
  const newEnd = buying && selected ? new Date(new Date(buying.endDate).setMonth(new Date(buying.endDate).getMonth() + selected.months)) : null;

  return (
    <>
      {error && <Alert variant="warning">{error}</Alert>}
      {cards.length === 0 ? (
        <div className="text-center text-muted py-5 border rounded-3 bg-body">
          <div className="fs-1 mb-2">🛡️</div>
          Chưa có sản phẩm nào - sổ bảo hành được tạo tự động khi bạn nhận hàng thành công.
        </div>
      ) : (
        <>
          {/* Tổng quan nhanh */}
          <div className="warranty-stats mb-3">
            {[
              { key: 'active', label: 'Còn bảo hành', cls: 'text-success' },
              { key: 'expiring', label: 'Sắp hết hạn (≤ 60 ngày)', cls: 'text-warning' },
              { key: 'expired', label: 'Hết bảo hành', cls: 'text-secondary' }
            ].map((s) => (
              <button key={s.key} type="button" className={`warranty-stat${filter === s.key ? ' active' : ''}`} onClick={() => setFilter(filter === s.key ? 'all' : s.key)}>
                <span className={`fs-4 fw-bold ${s.cls}`}>{counts[s.key]}</span>
                <span className="small text-muted">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="d-flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Lọc sổ bảo hành">
            {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
                className={`btn btn-sm rounded-pill ${filter === f.key ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFilter(f.key)}>
                {f.label} <span className="opacity-75">({counts[f.key]})</span>
              </button>
            ))}
          </div>
        <Stack gap={2} className="mb-4">
          {cards.filter(FILTERS.find((f) => f.key === filter).test).length === 0 && (
            <div className="text-muted small text-center py-4">Không có sổ bảo hành nào ở mục này</div>
          )}
          {cards.filter(FILTERS.find((f) => f.key === filter).test).map((card) => {
            const pending = card.extensions?.find((e) => e.status === 'pending');
            const canBuy = card.inWarranty && card.provider !== 'manufacturer' && !pending;
            return (
              <WarrantyCardView
                key={card._id}
                card={{ ...card, extensions: (card.extensions || []).filter((e) => e.status !== 'cancelled') }}
                actions={(card.canActivate || canBuy || pending || card.inWarranty) && (
                  <>
                    {card.inWarranty && onRequestRepair && (
                      <Button size="sm" variant="primary" onClick={() => onRequestRepair(card)}>Yêu cầu sửa chữa</Button>
                    )}
                    {card.canActivate && <Button size="sm" variant="info" onClick={() => activate(card)}>Kích hoạt bảo hành</Button>}
                    {canBuy && <Button size="sm" variant="outline-primary" onClick={() => openBuy(card)}>Mua thêm thời gian bảo hành</Button>}
                    {pending && (
                      <Button size="sm" variant="outline-secondary" onClick={() => cancelExt(card, pending)}>Hủy gói chờ thanh toán</Button>
                    )}
                  </>
                )}
              />
            );
          })}
        </Stack>
        </>
      )}

      <Modal show={Boolean(buying)} onHide={() => setBuying(null)} centered>
        <Modal.Header closeButton><Modal.Title className="fs-5">Mua thêm thời gian bảo hành</Modal.Title></Modal.Header>
        <Modal.Body>
          {buying && <div className="small mb-3"><strong>{buying.productName}</strong> · bảo hành hiện tại đến {fmtDay(buying.endDate)}</div>}
          {modalError && <Alert variant="danger" className="small py-2">{modalError}</Alert>}
          {plans.length === 0 && !modalError && <div className="small text-muted">Hiện chưa có gói gia hạn cho sản phẩm này.</div>}
          {plans.map((p) => (
            <Form.Check key={p._id} type="radio" id={`plan-${p._id}`} name="plan" className="mb-2"
              checked={planId === p._id} onChange={() => setPlanId(p._id)}
              label={<><strong>{p.name}</strong> (+{p.months} tháng) - <span className="text-primary fw-medium">{formatVND(p.price)}</span>{p.description && <div className="small text-muted">{p.description}</div>}</>} />
          ))}
          {plans.length > 0 && (
            <>
              <Form.Label className="small fw-medium mt-2">Thanh toán</Form.Label>
              <Form.Select size="sm" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="store">Thanh toán tại cửa hàng</option>
                <option value="bank_transfer">Chuyển khoản (cửa hàng xác nhận sau khi nhận tiền)</option>
              </Form.Select>
              {newEnd && <div className="small mt-3">Sau khi thanh toán, bảo hành kéo dài đến <strong>{fmtDay(newEnd)}</strong>.</div>}
              <div className="small text-muted mt-1">Thời gian chỉ được cộng sau khi cửa hàng xác nhận đã nhận tiền.</div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setBuying(null)}>Đóng</Button>
          <Button disabled={!planId || busy} onClick={submitBuy}>{busy ? 'Đang gửi...' : 'Đăng ký gói'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
