import { Table, Form, Button } from 'react-bootstrap';

export const newVariant = () => ({
  color: '',
  colorHex: '#1f2937',
  storage: '',
  price: '',
  salePrice: '',
  image: '',
  isActive: true
});

// Bảng quản lý phiên bản (màu × dung lượng/kích thước) của sản phẩm: mỗi dòng có giá, giá khuyến mãi, ảnh
// riêng và trạng thái đang bán. Phiên bản đã lưu giữ nguyên _id (tồn kho/giỏ hàng/đơn hàng gắn theo _id)
// - vì vậy phiên bản còn hàng chỉ nên TẮT "Đang bán" thay vì xóa (backend cũng chặn xóa khi còn hàng).
export default function VariantsEditor({ value, onChange }) {
  const variants = value || [];
  const update = (idx, field, fieldValue) =>
    onChange(variants.map((v, i) => (i === idx ? { ...v, [field]: fieldValue } : v)));
  const remove = (idx) => {
    const v = variants[idx];
    if (v._id && !confirm(`Xóa phiên bản "${v.color}${v.storage ? ' - ' + v.storage : ''}"? Nếu còn hàng trong kho, hãy tắt "Đang bán" thay vì xóa.`)) return;
    onChange(variants.filter((_, i) => i !== idx));
  };

  return (
    <div className="border rounded-3 p-3">
      <div className="small fw-medium mb-2">Phiên bản bán ra (màu × dung lượng/kích thước) - mỗi phiên bản có giá và tồn kho riêng</div>
      <div className="table-responsive">
        <Table size="sm" className="mb-2 align-middle small">
          <thead>
            <tr className="text-muted">
              <th>Màu</th>
              <th style={{ width: 56 }}>Mã màu</th>
              <th>Dung lượng/Kích thước</th>
              <th>Giá gốc</th>
              <th>Giá KM</th>
              <th>Ảnh riêng (link)</th>
              <th>Đang bán</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((v, idx) => (
              <tr key={v._id || `new-${idx}`}>
                <td>
                  <Form.Control size="sm" required placeholder="VD: Đen" value={v.color} onChange={(e) => update(idx, 'color', e.target.value)} />
                </td>
                <td>
                  <Form.Control size="sm" type="color" value={v.colorHex || '#1f2937'} onChange={(e) => update(idx, 'colorHex', e.target.value)} />
                </td>
                <td>
                  <Form.Control size="sm" placeholder="VD: 256GB (bỏ trống nếu chỉ khác màu)" value={v.storage} onChange={(e) => update(idx, 'storage', e.target.value)} />
                </td>
                <td>
                  <Form.Control size="sm" required type="number" min={0} value={v.price} onChange={(e) => update(idx, 'price', e.target.value)} />
                </td>
                <td>
                  <Form.Control size="sm" type="number" min={0} placeholder="Tùy chọn" value={v.salePrice} onChange={(e) => update(idx, 'salePrice', e.target.value)} />
                </td>
                <td>
                  <Form.Control size="sm" placeholder="Dùng ảnh chung nếu trống" value={v.image} onChange={(e) => update(idx, 'image', e.target.value)} />
                </td>
                <td className="text-center">
                  <Form.Check checked={v.isActive} onChange={(e) => update(idx, 'isActive', e.target.checked)} />
                </td>
                <td>
                  <Button variant="outline-danger" size="sm" onClick={() => remove(idx)} disabled={variants.length === 1}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <Button variant="outline-primary" size="sm" onClick={() => onChange([...variants, newVariant()])}>
        + Thêm phiên bản
      </Button>
      <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
        Sau khi tạo phiên bản mới, nhập số lượng tồn kho cho từng phiên bản ở trang "Quản lý tồn kho".
      </div>
    </div>
  );
}
