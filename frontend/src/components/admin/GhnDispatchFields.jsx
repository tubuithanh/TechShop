import { useEffect, useState } from 'react';
import { Form, Row, Col, Button, Spinner, Alert } from 'react-bootstrap';
import api from '../../services/api';

// So khớp tên địa chỉ không dấu, bỏ tiền tố "Tỉnh / Thành phố / TP. / Quận / Huyện / Phường / Xã"
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/^(tinh|thanh pho|tp\.?|quan|huyen|thi xa|phuong|xa|thi tran)\s+/g, '').replace(/[^a-z0-9]/g, '');
const names = (x, key) => [x[key], ...(x.NameExtension || [])];
const findByName = (list, key, wanted) => (wanted ? list.find((x) => names(x, key).some((n) => norm(n) === norm(wanted))) : null);

// Phần nhập riêng cho GHN sandbox trong hộp thoại phân công: địa chỉ theo danh mục GHN (tự gợi ý theo địa chỉ đơn),
// kích thước / cân nặng kiện hàng, phí vận chuyển ước tính. value/onChange: { provinceId, districtId, wardCode, weight, length, width, height }
export default function GhnDispatchFields({ order, value, onChange }) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [error, setError] = useState('');
  const [fee, setFee] = useState(null);
  const [feeBusy, setFeeBusy] = useState(false);
  const a = order.deliveryAddress || {};
  const set = (patch) => onChange({ ...value, ...patch });
  const loc = (kind, parent) => api.get(`/deliveries/locations/${kind}`, { params: parent ? { parent } : {} }).then((r) => r.data.data || []);

  useEffect(() => {
    loc('provinces').then((list) => {
      setProvinces(list);
      const p = findByName(list, 'ProvinceName', a.city);
      if (p && !value.provinceId) set({ provinceId: p.ProvinceID });
    }).catch((e) => setError(e.response?.data?.message || 'Không tải được danh mục tỉnh/thành của GHN'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDistricts([]); setWards([]);
    if (!value.provinceId) return;
    loc('districts', value.provinceId).then((list) => {
      setDistricts(list);
      // Quận / huyện thường nằm ở dòng địa chỉ 2 hoặc trong địa chỉ chi tiết
      const d = findByName(list, 'DistrictName', a.addressLine2) || list.find((x) => names(x, 'DistrictName').some((n) => norm(a.addressLine1).includes(norm(n)) && norm(n).length > 2));
      if (d && !value.districtId) set({ districtId: d.DistrictID });
    }).catch(() => setError('Không tải được quận/huyện của GHN'));
  }, [value.provinceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setWards([]);
    if (!value.districtId) return;
    loc('wards', value.districtId).then((list) => {
      setWards(list);
      const w = findByName(list, 'WardName', a.state);
      if (w && !value.wardCode) set({ wardCode: w.WardCode });
    }).catch(() => setError('Không tải được phường/xã của GHN'));
  }, [value.districtId]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimate = async () => {
    setFeeBusy(true); setFee(null); setError('');
    try { setFee((await api.post(`/deliveries/${order._id}/carriers/ghn/fee`, value)).data.data); }
    catch (e) { setError(e.response?.data?.message || 'Không tính được phí GHN'); }
    finally { setFeeBusy(false); }
  };
  // Đổi địa chỉ / kiện hàng -> phí cũ không còn đúng
  useEffect(() => { setFee(null); }, [value.wardCode, value.weight, value.length, value.width, value.height]);

  return (
    <div className="mt-3 border rounded-3 p-3">
      <div className="small text-muted mb-2">
        Địa chỉ nhận theo danh mục GHN - đã gợi ý theo địa chỉ đơn (<i>{[a.addressLine1, a.state, a.city].filter(Boolean).join(', ')}</i>), kiểm tra lại trước khi tạo.
      </div>
      {error && <Alert variant="warning" className="small py-2">{error}</Alert>}
      <Row className="g-2">
        <Col md={4}>
          <Form.Label className="small fw-medium">Tỉnh/thành</Form.Label>
          <Form.Select size="sm" required value={value.provinceId || ''} onChange={(e) => set({ provinceId: Number(e.target.value) || '', districtId: '', wardCode: '' })}>
            <option value="">Chọn</option>
            {provinces.map((p) => <option key={p.ProvinceID} value={p.ProvinceID}>{p.ProvinceName}</option>)}
          </Form.Select>
        </Col>
        <Col md={4}>
          <Form.Label className="small fw-medium">Quận/huyện</Form.Label>
          <Form.Select size="sm" required disabled={!districts.length} value={value.districtId || ''} onChange={(e) => set({ districtId: Number(e.target.value) || '', wardCode: '' })}>
            <option value="">Chọn</option>
            {districts.map((d) => <option key={d.DistrictID} value={d.DistrictID}>{d.DistrictName}</option>)}
          </Form.Select>
        </Col>
        <Col md={4}>
          <Form.Label className="small fw-medium">Phường/xã</Form.Label>
          <Form.Select size="sm" required disabled={!wards.length} value={value.wardCode || ''} onChange={(e) => set({ wardCode: e.target.value })}>
            <option value="">Chọn</option>
            {wards.map((w) => <option key={w.WardCode} value={w.WardCode}>{w.WardName}</option>)}
          </Form.Select>
        </Col>
      </Row>
      <Row className="g-2 mt-1">
        {[['weight', 'Cân nặng (gram)', 19999], ['length', 'Dài (cm)', 200], ['width', 'Rộng (cm)', 200], ['height', 'Cao (cm)', 200]].map(([k, label, max]) => (
          <Col xs={6} md={3} key={k}>
            <Form.Label className="small fw-medium">{label}</Form.Label>
            <Form.Control size="sm" type="number" required min={1} max={max} value={value[k]} onChange={(e) => set({ [k]: e.target.value })} />
          </Col>
        ))}
      </Row>
      <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
        <Button size="sm" variant="outline-secondary" disabled={feeBusy || !value.wardCode} onClick={estimate}>
          {feeBusy ? <><Spinner size="sm" /> Đang tính...</> : 'Tính phí GHN'}
        </Button>
        {fee?.total != null && <span className="small">Phí ước tính: <b>{fee.total.toLocaleString('vi-VN')}đ</b>{fee.insuranceFee ? ` (gồm bảo hiểm ${fee.insuranceFee.toLocaleString('vi-VN')}đ)` : ''}</span>}
        <span className="small text-muted ms-auto">Thu hộ (COD): {(order.paymentStatus === 'paid' ? 0 : order.grandTotal || 0).toLocaleString('vi-VN')}đ</span>
      </div>
    </div>
  );
}
