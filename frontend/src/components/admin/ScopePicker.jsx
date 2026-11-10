import { useEffect, useMemo, useState } from 'react';
import { Badge, Form, ListGroup, Spinner } from 'react-bootstrap';
import { X } from 'react-bootstrap-icons';
import { productService } from '../../services/productService';
import { storeService } from '../../services/storeService';
import { settingService } from '../../services/settingService';

// Danh mục / thương hiệu / chi nhánh / hạng thành viên dùng cho form khuyến mãi & voucher (tải 1 lần)
export function useScopeOptions() {
  const [options, setOptions] = useState({ categories: [], brands: [], stores: [], tiers: [] });
  useEffect(() => {
    let alive = true;
    Promise.all([
      productService.getCategories().catch(() => []),
      productService.getBrands().catch(() => []),
      storeService.getStores().catch(() => []),
      // Cấu hình hạng chỉ admin đọc được - nhân viên chỉ xem thì không cần
      settingService.getLoyaltySettings().then((d) => d.tiers || []).catch(() => [])
    ]).then(([categories, brands, stores, tiers]) => {
      if (!alive) return;
      setOptions({
        categories: categories.map((c) => ({ value: c._id, label: c.name })),
        brands: brands.map((b) => ({ value: b._id, label: b.name })),
        stores: stores.map((s) => ({ value: s._id, label: s.name })),
        tiers: tiers.map((t) => ({ value: t.key, label: t.name, color: t.color }))
      });
    });
    return () => { alive = false; };
  }, []);
  return options;
}

// Chọn nhiều mục: các mục đã chọn hiện dạng "chip", ô tìm kiếm lọc danh sách bên dưới.
// options: [{ value, label }] (danh sách cố định) HOẶC search(q) => Promise<[{ value, label }]> (tìm từ máy chủ).
// labels: { [value]: label } để hiển thị tên các mục đã chọn khi danh sách tìm kiếm không chứa chúng.
export function MultiPicker({ value = [], onChange, options, search, placeholder = 'Tìm...', emptyText = 'Không có lựa chọn', labels = {} }) {
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(false);
  const [known, setKnown] = useState(labels);

  useEffect(() => { setKnown((k) => ({ ...labels, ...k })); }, [labels]);

  useEffect(() => {
    if (!search) return undefined;
    setLoading(true);
    const timer = setTimeout(() => {
      search(q).then((list) => {
        setRemote(list);
        setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((o) => [o.value, o.label])) }));
      }).catch(() => setRemote([])).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, search]);

  const list = useMemo(() => {
    if (search) return remote;
    const needle = q.trim().toLowerCase();
    return (options || []).filter((o) => !needle || o.label.toLowerCase().includes(needle));
  }, [search, remote, options, q]);

  const labelOf = (v) => known[v] || (options || []).find((o) => o.value === v)?.label || 'Đã chọn';
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div>
      {value.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {value.map((v) => (
            <Badge key={v} bg="primary-subtle" text="primary-emphasis" className="d-inline-flex align-items-center gap-1 fw-normal py-1 px-2">
              {labelOf(v)}
              <X role="button" aria-label="Bỏ chọn" onClick={() => toggle(v)} />
            </Badge>
          ))}
        </div>
      )}
      <Form.Control size="sm" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <ListGroup className="mt-1" style={{ maxHeight: 170, overflowY: 'auto' }}>
        {loading && <ListGroup.Item className="small text-muted"><Spinner size="sm" /> Đang tìm...</ListGroup.Item>}
        {!loading && list.length === 0 && <ListGroup.Item className="small text-muted">{emptyText}</ListGroup.Item>}
        {!loading && list.map((o) => (
          <ListGroup.Item key={o.value} action className="small py-1 d-flex align-items-center gap-2" onClick={() => toggle(o.value)}>
            <Form.Check readOnly checked={value.includes(o.value)} tabIndex={-1} aria-hidden />
            <span className="text-truncate">{o.label}</span>
          </ListGroup.Item>
        ))}
      </ListGroup>
    </div>
  );
}

// Tìm sản phẩm theo tên (cả sản phẩm đang ẩn không cần - khuyến mãi chỉ áp dụng cho hàng đang bán)
export const searchProducts = (q) =>
  productService.getProducts({ keyword: q || undefined, limit: 20 }).then((res) => (res.data || []).map((p) => ({ value: p._id, label: p.title })));

// Lấy id từ mảng có thể đã populate ({ _id, name }) hoặc chỉ là id
export const idsOf = (list) => (list || []).map((x) => (typeof x === 'object' && x ? x._id : x));
export const labelsOf = (list, key = 'name') =>
  Object.fromEntries((list || []).filter((x) => typeof x === 'object' && x).map((x) => [x._id, x[key] || x.title || x.name]));

// Tóm tắt phạm vi áp dụng trong bảng (dùng chung cho voucher và chương trình khuyến mãi)
export function ScopeSummary({ v, tiers = [] }) {
  const names = (list, key = 'name') => (list || []).map((x) => (typeof x === 'object' ? x[key] || x.title || x.name : '')).filter(Boolean);
  const parts = [];
  if (v.categoryIds?.length) parts.push(`Danh mục: ${names(v.categoryIds).join(', ')}`);
  if (v.brandIds?.length) parts.push(`Thương hiệu: ${names(v.brandIds).join(', ')}`);
  if (v.productIds?.length) parts.push(`${v.productIds.length} sản phẩm`);
  if (v.storeIds?.length) parts.push(`Chi nhánh: ${names(v.storeIds).join(', ')}`);
  if (v.tierKeys?.length) parts.push(`Hạng: ${v.tierKeys.map((k) => tiers.find((t) => t.value === k)?.label || k).join(', ')}`);
  if (!parts.length) return <span className="text-muted">Tất cả</span>;
  return parts.map((p) => <div key={p} className="text-truncate" title={p}>{p}</div>);
}
