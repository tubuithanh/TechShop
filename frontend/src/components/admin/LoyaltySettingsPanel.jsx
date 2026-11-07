import { useEffect, useState } from 'react';
import { Form, Alert, Spinner, Badge, Table, Button, InputGroup } from 'react-bootstrap';
import { AwardFill, PlusLg, Trash, ArrowCounterclockwise } from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

// Kiểm tra nhanh phía giao diện (backend kiểm tra lại đầy đủ)
function tiersError(tiers) {
  for (const [i, t] of tiers.entries()) {
    if (!t.name.trim()) return `Hạng ${i + 1}: chưa nhập tên`;
    if (!/^\d+$/.test(String(t.minPoints))) return `${t.name}: ngưỡng điểm phải là số nguyên ≥ 0`;
    if (i > 0 && Number(t.minPoints) <= Number(tiers[i - 1].minPoints)) return `Ngưỡng của ${t.name} phải lớn hơn ${tiers[i - 1].name}`;
  }
  const names = tiers.map((t) => t.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Tên hạng không được trùng nhau';
  return null;
}

// Tab "Hạng thành viên" trong Cấu hình hệ thống. Bật/tắt lưu ngay; tỷ lệ quy đổi + danh sách hạng lưu bằng nút riêng,
// có xem trước số khách lên / xuống hạng trước khi lưu.
export default function LoyaltySettingsPanel() {
  const [data, setData] = useState(null); // cấu hình đang lưu + số khách mỗi hạng
  const [pointValue, setPointValue] = useState('');
  const [tiers, setTiers] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const receive = (d) => {
    setData(d);
    setPointValue(String(d.pointValue));
    setTiers(d.tiers.map((t) => ({ ...t, minPoints: String(t.minPoints) })));
    setPreview(null);
  };

  useEffect(() => {
    settingService
      .getLoyaltySettings()
      .then(receive)
      .catch((err) => setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không tải được cấu hình hạng thành viên' }));
  }, []);

  const payloadTiers = tiers.map((t) => ({ key: t.key, name: t.name.trim(), minPoints: Number(t.minPoints), color: t.color }));
  const clientError = tiersError(tiers);
  const tiersChanged = data && JSON.stringify(payloadTiers) !== JSON.stringify(data.tiers.map(({ key, name, minPoints, color }) => ({ key, name, minPoints, color })));
  const pointValueChanged = data && pointValue !== String(data.pointValue);

  // Xem trước tự động (chờ 500ms sau lần sửa cuối) khi bộ hạng đã hợp lệ và khác bản đang lưu
  const tiersKey = JSON.stringify(payloadTiers);
  useEffect(() => {
    if (!data || clientError || !tiersChanged) {
      setPreview(null);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      settingService
        .previewLoyaltyTiers(payloadTiers)
        .then((p) => !ignore && setPreview(p))
        .catch((err) => !ignore && setPreview({ error: err.response?.data?.message || 'Không xem trước được' }));
    }, 500);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [tiersKey, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (enabled) => {
    if (!enabled && !confirm('TẮT tích điểm thành viên?\n\nĐơn giao thành công trong thời gian tắt sẽ KHÔNG được cộng điểm (bật lại cũng không cộng bù). Điểm và hạng khách đang có được giữ nguyên.')) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await settingService.updateLoyaltySettings({ enabled });
      receive(res.data);
      setFeedback({ type: enabled ? 'success' : 'warning', message: res.message });
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không lưu được, vui lòng thử lại' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const changes = [];
    if (pointValueChanged) changes.push(`Tỷ lệ mới ${fmt(pointValue)}đ = 1 điểm chỉ áp dụng cho các đơn giao thành công từ bây giờ (điểm đã cộng giữ nguyên).`);
    if (preview && !preview.error && (preview.up || preview.down)) changes.push(`${fmt(preview.up)} khách lên hạng, ${fmt(preview.down)} khách xuống hạng ngay khi lưu.`);
    if (changes.length && !confirm(`Lưu cấu hình hạng thành viên?\n\n${changes.join('\n')}`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await settingService.updateLoyaltySettings({ pointValue: Number(pointValue), tiers: payloadTiers });
      receive(res.data);
      setFeedback({ type: 'success', message: res.message });
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không lưu được, vui lòng thử lại' });
    } finally {
      setBusy(false);
    }
  };

  const setTier = (i, patch) => setTiers((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const addTier = () =>
    setTiers((list) => {
      const last = list[list.length - 1];
      return [...list, { key: '', name: '', minPoints: String(Number(last?.minPoints || 0) + 1000), color: '#6c757d' }];
    });
  const removeTier = (i) => setTiers((list) => list.filter((_, j) => j !== i));

  if (!data) {
    return feedback ? <Alert variant={feedback.type}>{feedback.message}</Alert> : <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>;
  }

  const countOf = (list, key) => list?.find((s) => s.key === key)?.count;
  const pointValueValid = /^\d+$/.test(pointValue) && Number(pointValue) >= 1000 && Number(pointValue) <= 10000000;

  return (
    <div>
      <h2 className="fs-6 fw-bold d-flex align-items-center gap-2 mb-3">
        <AwardFill className="text-primary" /> Hạng thành viên
      </h2>
      {feedback && <Alert variant={feedback.type} className="small py-2">{feedback.message}</Alert>}

      <div className="d-flex align-items-center gap-3 border rounded p-3 mb-4">
        <Form.Check
          type="switch"
          id="loyalty-enabled"
          checked={data.enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          label={<span className="fw-medium">Tích điểm thành viên</span>}
        />
        <Badge bg={data.enabled ? 'success' : 'secondary'}>{data.enabled ? 'Đang bật' : 'Đang tắt'}</Badge>
        <span className="small text-muted">
          {data.enabled
            ? 'Đơn giao thành công được cộng điểm; khách xem hạng trong trang tài khoản.'
            : 'Không cộng điểm cho đơn mới, ẩn trang Hạng thành viên của khách. Điểm đã có vẫn giữ.'}
        </span>
      </div>

      <Form.Group className="mb-4" style={{ maxWidth: '24rem' }}>
        <Form.Label className="small fw-medium">Số tiền hàng cho 1 điểm</Form.Label>
        <InputGroup size="sm">
          <Form.Control value={pointValue} inputMode="numeric" isInvalid={!pointValueValid} onChange={(e) => setPointValue(e.target.value.replace(/\D/g, ''))} />
          <InputGroup.Text>đ = 1 điểm</InputGroup.Text>
          <Form.Control.Feedback type="invalid">Từ 1.000đ đến 10.000.000đ</Form.Control.Feedback>
        </InputGroup>
        <Form.Text>Tính trên tiền hàng sau giảm giá, không tính phí vận chuyển. Đổi tỷ lệ chỉ áp dụng cho đơn giao sau khi lưu.</Form.Text>
      </Form.Group>

      <div className="small fw-medium mb-2">
        Danh sách hạng ({tiers.length}/{data.maxTiers}) — thấp đến cao
      </div>
      <Table size="sm" className="small align-middle" responsive>
        <thead>
          <tr>
            <th style={{ width: '3.5rem' }}>Màu</th>
            <th>Tên hạng</th>
            <th style={{ width: '10rem' }}>Từ (điểm)</th>
            <th className="text-end">Khách hiện tại</th>
            {preview && !preview.error && <th className="text-end">Sau khi lưu</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td>
                <Form.Control type="color" value={t.color} onChange={(e) => setTier(i, { color: e.target.value })} className="p-0 border-0" style={{ width: '2.25rem', height: '1.75rem' }} title="Chọn màu" />
              </td>
              <td>
                <Form.Control size="sm" value={t.name} maxLength={30} placeholder="VD: Bạch kim" onChange={(e) => setTier(i, { name: e.target.value })} />
              </td>
              <td>
                <Form.Control
                  size="sm"
                  inputMode="numeric"
                  value={t.minPoints}
                  disabled={i === 0}
                  title={i === 0 ? 'Hạng thấp nhất luôn bắt đầu từ 0 điểm' : undefined}
                  onChange={(e) => setTier(i, { minPoints: e.target.value.replace(/\D/g, '') })}
                />
              </td>
              <td className="text-end">{t.key && countOf(data.stats, t.key) !== undefined ? fmt(countOf(data.stats, t.key)) : '—'}</td>
              {preview && !preview.error && <td className="text-end fw-medium">{fmt(preview.next[i]?.count)}</td>}
              <td className="text-end">
                {i > 0 && tiers.length > data.minTiers && (
                  <Button variant="link" size="sm" className="text-danger p-0" title="Xóa hạng" onClick={() => removeTier(i)}>
                    <Trash />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {tiers.length < data.maxTiers && (
        <Button variant="outline-secondary" size="sm" onClick={addTier} className="mb-3">
          <PlusLg /> Thêm hạng
        </Button>
      )}

      {clientError && <Alert variant="warning" className="small py-2">{clientError}</Alert>}
      {preview?.error && <Alert variant="warning" className="small py-2">{preview.error}</Alert>}
      {preview && !preview.error && (
        <Alert variant="info" className="small py-2">
          Xem trước: <strong>{fmt(preview.up)}</strong> khách lên hạng, <strong>{fmt(preview.down)}</strong> khách xuống hạng (trên tổng {fmt(preview.total)} khách). Hạng tính lại từ điểm nên thay đổi có hiệu lực ngay khi lưu.
        </Alert>
      )}

      <div className="d-flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !!clientError || !pointValueValid || (!tiersChanged && !pointValueChanged)}>
          {busy ? 'Đang lưu...' : 'Lưu cấu hình hạng'}
        </Button>
        <Button size="sm" variant="outline-secondary" disabled={busy || (!tiersChanged && !pointValueChanged)} onClick={() => receive(data)}>
          <ArrowCounterclockwise /> Hoàn tác
        </Button>
      </div>
    </div>
  );
}
