import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Stack, Spinner, InputGroup } from 'react-bootstrap';
import { Search, ShieldCheck, ShieldX, Building } from 'react-bootstrap-icons';
import api from '../../services/api';
import { warrantyCardService } from '../../services/warrantyCardService';
import { CARD_STATE, fmtDay } from '../WarrantyCardView';
import { WARRANTY_METHOD_LABEL } from '../../constants/warranty';

// Tiếp nhận máy khách mang tới quầy: tìm sổ bảo hành bằng IMEI / mã bảo hành / SĐT / mã đơn -> thấy NGAY máy còn
// bảo hành không (trước khi tạo phiếu) -> chọn đúng máy -> tạo phiếu. Máy hết hạn vẫn nhận nếu là sửa dịch vụ có phí.
export default function CreateCounterWarranty({ onHide, onDone }) {
  const [q, setQ] = useState('');
  const [cards, setCards] = useState(null);
  const [selected, setSelected] = useState(null);
  const [issue, setIssue] = useState('');
  const [method, setMethod] = useState('bring_to_store');
  const [paidService, setPaidService] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    setBusy(true); setError(''); setCards(null); setSelected(null); setPaidService(false);
    try {
      const res = await warrantyCardService.adminList({ q: q.trim(), limit: 30 });
      setCards(res.data);
      if (res.data.length === 1) setSelected(res.data[0]);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tra cứu được');
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api.post('/warranties', { cardId: selected._id, issueDescription: issue, method, paidService: !selected.inWarranty ? paidService : undefined });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Không tạo được phiếu');
    } finally {
      setBusy(false);
    }
  };

  const out = selected && !selected.inWarranty;
  const canSubmit = selected && selected.state !== 'void' && issue.trim() && (!out || paidService);

  return (
    <Modal show onHide={busy ? undefined : onHide} size="lg" centered>
      <Modal.Header closeButton={!busy}><Modal.Title className="fs-5">Tiếp nhận máy tại cửa hàng</Modal.Title></Modal.Header>
      <Form onSubmit={save}>
        <Modal.Body>
          {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

          <Form.Label className="small fw-medium">1. Tìm máy của khách</Form.Label>
          <InputGroup>
            <Form.Control
              autoFocus
              placeholder="IMEI / Serial, mã bảo hành (SBH...), số điện thoại hoặc mã đơn hàng"
              value={q}
              disabled={busy}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (q.trim()) search(); } }}
            />
            <Button type="button" disabled={busy || !q.trim()} onClick={search}>{busy && !cards ? <Spinner size="sm" /> : <Search />} Tra cứu</Button>
          </InputGroup>

          {cards && cards.length === 0 && (
            <Alert variant="warning" className="small mt-2 mb-0">
              Không tìm thấy sổ bảo hành. Kiểm tra lại IMEI / số điện thoại, hoặc máy không mua tại cửa hàng.
            </Alert>
          )}
          {cards && cards.length > 0 && (
            <Stack gap={2} className="mt-3" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {cards.map((c) => {
                const st = CARD_STATE[c.state] || CARD_STATE.active;
                const active = selected?._id === c._id;
                return (
                  <button
                    key={c._id}
                    type="button"
                    disabled={c.state === 'void'}
                    onClick={() => { setSelected(c); setPaidService(false); }}
                    className={`text-start border rounded-3 p-2 bg-body ${active ? 'border-primary border-2 shadow-sm' : ''}`}
                  >
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div style={{ minWidth: 0 }}>
                        <div className="fw-medium text-truncate">{c.productName}{c.variantLabel ? ` (${c.variantLabel})` : ''}</div>
                        <div className="small text-muted">
                          {c.customerName} · {c.customerPhone} · Đơn {c.orderCode}
                          {c.serial ? <> · IMEI <code>{c.serial}</code></> : ' · chưa nhập IMEI'}
                        </div>
                      </div>
                      <Badge bg={st.bg} className="d-inline-flex align-items-center gap-1 flex-shrink-0">
                        {c.inWarranty ? <ShieldCheck /> : <ShieldX />} {st.label}
                      </Badge>
                    </div>
                    {c.state !== 'void' && c.totalMonths > 0 && (
                      <div className={`small mt-1 ${c.inWarranty ? 'text-success' : 'text-danger'}`}>
                        {c.inWarranty ? `Còn ${c.daysLeft} ngày · hết hạn ${fmtDay(c.endDate)}` : `Đã hết hạn ngày ${fmtDay(c.endDate)}`}
                        {c.extendedMonths > 0 && <span className="text-muted"> · gồm {c.extendedMonths} tháng mua thêm</span>}
                      </div>
                    )}
                    {c.state === 'void' && <div className="small text-muted mt-1">{c.voidReason}</div>}
                  </button>
                );
              })}
            </Stack>
          )}

          {selected && (
            <div className="mt-3">
              {selected.inWarranty && selected.provider !== 'manufacturer' && (
                <Alert variant="success" className="small py-2 d-flex align-items-center gap-2">
                  <ShieldCheck /> Máy <strong>còn bảo hành tại cửa hàng</strong> đến {fmtDay(selected.endDate)} - sửa chữa miễn phí theo chính sách.
                </Alert>
              )}
              {selected.inWarranty && selected.provider === 'manufacturer' && (
                <Alert variant="info" className="small py-2">
                  <div className="d-flex align-items-center gap-2 fw-medium"><Building /> Bảo hành do hãng quản lý (còn hạn đến {fmtDay(selected.endDate)})</div>
                  Chuyển máy tới <strong>{selected.providerInfo?.name}</strong>
                  {selected.providerInfo?.phone && <> - hotline {selected.providerInfo.phone}</>}
                  {selected.providerInfo?.address && <> - {selected.providerInfo.address}</>}. Cửa hàng tiếp nhận hộ và theo dõi bằng phiếu này.
                </Alert>
              )}
              {out && (
                <Alert variant="warning" className="small py-2">
                  <div className="fw-medium d-flex align-items-center gap-2"><ShieldX /> Máy {selected.totalMonths > 0 ? `đã hết bảo hành (${fmtDay(selected.endDate)})` : 'không kèm bảo hành'}</div>
                  Báo khách trước: sửa chữa sẽ <strong>tính phí</strong>. Chỉ tiếp nhận khi khách đồng ý.
                  <Form.Check className="mt-2" id="paid-service" checked={paidService} onChange={(e) => setPaidService(e.target.checked)}
                    label="Khách đồng ý sửa dịch vụ có tính phí" />
                </Alert>
              )}

              <Form.Label className="small fw-medium">2. Mô tả lỗi *</Form.Label>
              <Form.Control as="textarea" rows={3} required maxLength={2000} value={issue} disabled={busy}
                placeholder="VD: Máy không lên nguồn, màn hình có sọc..." onChange={(e) => setIssue(e.target.value)} />
              <Form.Label className="small fw-medium mt-2">Hình thức</Form.Label>
              <Form.Select size="sm" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(WARRANTY_METHOD_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Form.Select>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={busy} onClick={onHide}>Đóng</Button>
          <Button type="submit" disabled={busy || !canSubmit}>
            {out ? 'Tạo phiếu sửa dịch vụ' : 'Tạo phiếu bảo hành'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
