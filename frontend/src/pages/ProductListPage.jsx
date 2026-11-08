import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, Row, Col, Nav, Button, Badge, Offcanvas } from 'react-bootstrap';
import { Funnel, X, Search as SearchIcon } from 'react-bootstrap-icons';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';
import ProductGridSkeleton from '../components/ProductCardSkeleton';

const SORTS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'best_selling', label: 'Bán chạy' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
  { value: 'top_rated', label: 'Đánh giá cao' }
];
import { useSettings } from '../store/SettingsContext';
import RangeSlider from '../components/RangeSlider';

// "12.500.000" -> "12,5 triệu"
const formatMoneyShort = (v) => {
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  if (v >= 1e3) return `${Math.round(v / 1e3).toLocaleString('vi-VN')} nghìn`;
  return `${v.toLocaleString('vi-VN')}đ`;
};
// Bước kéo "tròn": khoảng 100 nấc trên cả thanh (VD giá 3-34 triệu -> bước 500.000đ)
function niceStep(span) {
  if (!(span > 0)) return 1;
  const raw = span / 100;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
const floorTo = (v, step) => Math.floor(v / step) * step;
const ceilTo = (v, step) => Math.ceil(v / step) * step;
// Mức giá chọn nhanh (chỉ hiện mức có giao với khoảng giá thực tế)
const PRICE_PRESETS = [
  { label: 'Dưới 5 triệu', min: 0, max: 5e6 },
  { label: '5 - 10 triệu', min: 5e6, max: 10e6 },
  { label: '10 - 20 triệu', min: 10e6, max: 20e6 },
  { label: '20 - 30 triệu', min: 20e6, max: 30e6 },
  { label: 'Trên 30 triệu', min: 30e6, max: Infinity }
];

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tổng số sản phẩm khớp bộ lọc (từ API) - không dùng products.length vì đó chỉ là số trên 1 trang
  const [total, setTotal] = useState(0);
  // Trang kế tiếp (con trỏ do API trả về) - trước đây bỏ qua nextCursor nên chỉ xem được trang đầu dù tiêu đề báo tổng
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { settings } = useSettings();

  const keyword = searchParams.get('keyword') || '';
  const categoryId = searchParams.get('categoryId') || '';
  const brandId = searchParams.get('brandId') || '';
  // Sắp xếp cũng nằm trên URL (trước đây là state riêng, tải lại trang là mất)
  const sort = searchParams.get('sort') || 'newest';
  // Khoảng giá đang lọc - lưu trên URL để tải lại trang / gửi link vẫn giữ bộ lọc
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  // Khoảng giá / thông số THỰC TẾ của danh mục đang xem (giới hạn 2 đầu của thanh kéo)
  const [ranges, setRanges] = useState(null);

  // Bộ lọc theo thông số dạng số (RAM, pin, tần số quét...) - chỉ hiện khi đã chọn 1 danh mục, vì mỗi
  // danh mục có bộ trường và đơn vị riêng (VD: "Pin" của điện thoại là mAh, của laptop là Wh).
  const [specInputs, setSpecInputs] = useState({});
  const [appliedSpecFilters, setAppliedSpecFilters] = useState('');
  const selectedCategory = categories.find((c) => c._id === categoryId);
  const numericFields = (selectedCategory?.specTemplate || []).flatMap((g) => g.fields.filter((f) => f.numeric));

  useEffect(() => {
    setSpecInputs({});
    setAppliedSpecFilters('');
  }, [categoryId]);

  const numericKeys = numericFields.map((f) => f.key).join(',');
  useEffect(() => {
    let ignore = false;
    productService
      .getFilterRanges({ categoryId, brandId, keyword, keys: numericKeys })
      .then((r) => !ignore && setRanges(r))
      .catch(() => !ignore && setRanges(null));
    return () => {
      ignore = true;
    };
  }, [categoryId, brandId, keyword, numericKeys]);

  // Đổi tham số trên URL (giá rỗng -> bỏ khỏi URL)
  const updateParams = (changes) => {
    const params = Object.fromEntries(searchParams.entries());
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v == null) delete params[k];
      else params[k] = String(v);
    }
    setSearchParams(params, { replace: true });
  };

  // Giới hạn thanh kéo giá (làm tròn theo bước kéo)
  const priceStep = ranges?.price ? niceStep(ranges.price.max - ranges.price.min) : 1;
  const priceMinBound = ranges?.price ? floorTo(ranges.price.min, priceStep) : 0;
  const priceMaxBound = ranges?.price ? ceilTo(ranges.price.max, priceStep) : 0;
  const priceValue = [
    minPrice ? Math.max(priceMinBound, Number(minPrice)) : priceMinBound,
    maxPrice ? Math.min(priceMaxBound, Number(maxPrice)) : priceMaxBound
  ];
  // Kéo về sát 2 đầu = không lọc đầu đó
  const commitPrice = ([lo, hi]) =>
    updateParams({ minPrice: lo > priceMinBound ? lo : '', maxPrice: hi < priceMaxBound ? hi : '' });
  const presets = ranges?.price ? PRICE_PRESETS.filter((p) => p.min < ranges.price.max && p.max > ranges.price.min) : [];

  const specValue = (key, bound) => {
    const r = ranges?.specs?.[key];
    const v = specInputs[key]?.[bound];
    return v !== undefined && v !== '' ? Number(v) : bound === 'min' ? r?.min : r?.max;
  };
  // Thả tay khỏi thanh kéo thông số -> áp dụng ngay
  const commitSpec = (key, [lo, hi]) => {
    const r = ranges.specs[key];
    const next = { ...specInputs, [key]: { min: lo > r.min ? lo : '', max: hi < r.max ? hi : '' } };
    setSpecInputs(next);
    const filters = Object.entries(next)
      .map(([k, v]) => ({ key: k, min: v.min, max: v.max }))
      .filter((f) => f.min !== '' || f.max !== '');
    setAppliedSpecFilters(filters.length ? JSON.stringify(filters) : '');
  };

  const hasFilter = Boolean(minPrice || maxPrice || appliedSpecFilters);
  const clearFilters = () => {
    setSpecInputs({});
    setAppliedSpecFilters('');
    updateParams({ minPrice: '', maxPrice: '' });
  };

  useEffect(() => {
    productService.getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const queryParams = {
    keyword,
    categoryId,
    brandId,
    sort,
    limit: settings.productsPerPage,
    ...(minPrice ? { minPrice } : {}),
    ...(maxPrice ? { maxPrice } : {}),
    ...(appliedSpecFilters ? { specFilters: appliedSpecFilters } : {})
  };

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    productService
      .getProducts(queryParams)
      .then((res) => {
        if (!ignore) {
          setProducts(res.data);
          setTotal(res.total ?? res.data.length);
          setNextCursor(res.nextCursor || null);
        }
      })
      .catch(() => {
        if (!ignore) {
          setProducts([]);
          setTotal(0);
          setNextCursor(null);
          setError('Không tải được danh sách sản phẩm, vui lòng thử lại');
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [keyword, categoryId, brandId, sort, settings.productsPerPage, appliedSpecFilters, minPrice, maxPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Xem thêm": nối trang kế tiếp vào cuối danh sách, cùng bộ lọc / cách sắp xếp
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await productService.getProducts({ ...queryParams, cursor: nextCursor });
      setProducts((prev) => [...prev, ...res.data.filter((p) => !prev.some((x) => x._id === p._id))]);
      setNextCursor(res.nextCursor || null);
    } catch {
      setError('Không tải thêm được sản phẩm, vui lòng thử lại');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCategoryChange = (catId) => {
    const params = Object.fromEntries(searchParams.entries());
    if (catId) params.categoryId = catId;
    else delete params.categoryId;
    delete params.minPrice;
    delete params.maxPrice;
    setSearchParams(params);
  };

  // Các bộ lọc đang áp dụng -> hiện thành "chip" có nút × để bỏ nhanh từng cái
  const chips = [
    keyword && { key: 'keyword', label: `Từ khóa: "${keyword}"`, clear: () => updateParams({ keyword: '' }) },
    selectedCategory && { key: 'cat', label: selectedCategory.name, clear: () => handleCategoryChange('') },
    brandId && { key: 'brand', label: 'Thương hiệu đã chọn', clear: () => updateParams({ brandId: '' }) },
    (minPrice || maxPrice) && {
      key: 'price',
      label: `Giá: ${formatMoneyShort(priceValue[0])} – ${formatMoneyShort(priceValue[1])}`,
      clear: () => updateParams({ minPrice: '', maxPrice: '' })
    },
    appliedSpecFilters && {
      key: 'specs',
      label: `${JSON.parse(appliedSpecFilters).length} thông số`,
      clear: () => {
        setSpecInputs({});
        setAppliedSpecFilters('');
      }
    }
  ].filter(Boolean);
  const activeFilterCount = chips.filter((c) => c.key !== 'keyword').length;
  const clearAll = () => {
    setSpecInputs({});
    setAppliedSpecFilters('');
    setSearchParams(sort !== 'newest' ? { sort } : {}, { replace: true });
  };

  const filterPanel = (
    <>
          <h3 className="fw-bold mb-2 fs-6">Danh mục</h3>
          <Nav className="flex-column mb-4">
            <Nav.Item>
              <Nav.Link
                onClick={() => handleCategoryChange('')}
                active={!categoryId}
                className={`small ps-0 ${!categoryId ? 'text-primary fw-medium' : 'text-body'}`}
              >
                Tất cả
              </Nav.Link>
            </Nav.Item>
            {categories.map((c) => (
              <Nav.Item key={c._id}>
                <Nav.Link
                  onClick={() => handleCategoryChange(c._id)}
                  active={categoryId === c._id}
                  className={`small ps-0 ${categoryId === c._id ? 'text-primary fw-medium' : 'text-body'}`}
                >
                  {c.name}
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>

          {ranges?.price && (
            <div className="mb-4" data-filter="price">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h3 className="fw-bold mb-0 fs-6">Khoảng giá</h3>
                {hasFilter && (
                  <Button variant="link" size="sm" className="p-0" onClick={clearFilters}>
                    Xóa lọc
                  </Button>
                )}
              </div>
              {priceMaxBound > priceMinBound ? (
                <RangeSlider
                  id="price-slider"
                  label="Khoảng giá"
                  min={priceMinBound}
                  max={priceMaxBound}
                  step={priceStep}
                  value={priceValue}
                  format={formatMoneyShort}
                  onCommit={commitPrice}
                />
              ) : (
                <div className="small text-muted">{formatMoneyShort(ranges.price.min)}</div>
              )}
              {presets.length > 1 && (
                <div className="d-flex flex-wrap gap-1 mt-2">
                  {presets.map((p) => {
                    const lo = Math.max(p.min, priceMinBound);
                    const hi = Math.min(p.max, priceMaxBound);
                    const active = priceValue[0] === lo && priceValue[1] === hi && (minPrice || maxPrice);
                    return (
                      <Badge
                        key={p.label}
                        as="button"
                        type="button"
                        bg={active ? 'primary' : 'light'}
                        text={active ? undefined : 'dark'}
                        className="border fw-normal"
                        onClick={() => commitPrice([lo, hi])}
                      >
                        {p.label}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {numericFields.some((f) => ranges?.specs?.[f.key]) && (
            <div data-filter="specs">
              <h3 className="fw-bold mb-2 fs-6">Lọc theo thông số</h3>
              {numericFields
                .filter((f) => ranges.specs[f.key] && ranges.specs[f.key].max > ranges.specs[f.key].min)
                .map((f) => {
                  const r = ranges.specs[f.key];
                  const step = niceStep(r.max - r.min) < 1 && Number.isInteger(r.min) && Number.isInteger(r.max) ? 1 : niceStep(r.max - r.min);
                  return (
                    <div key={f.key} className="mb-3">
                      <div className="small mb-1">{f.key}</div>
                      <RangeSlider
                        label={f.key}
                        min={r.min}
                        max={r.max}
                        step={step}
                        value={[specValue(f.key, 'min'), specValue(f.key, 'max')]}
                        format={(v) => `${Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${f.numeric.unit}`}
                        onCommit={(v) => commitSpec(f.key, v)}
                      />
                    </div>
                  );
                })}
            </div>
          )}
    </>
  );

  return (
    <Container fluid="xl" className="py-4">
      <Row className="g-4">
        <Col md={3} className="d-none d-md-block">
          <div className="filter-panel">{filterPanel}</div>
        </Col>

        <Col xs={12} md={9}>
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <h1 className="fw-bold fs-5 mb-0">
              {keyword ? `Kết quả cho "${keyword}"` : selectedCategory?.name || 'Tất cả sản phẩm'}{' '}
              <span className="text-muted fw-normal fs-6">({total})</span>
            </h1>
            <Button variant="outline-secondary" size="sm" className="d-md-none d-flex align-items-center gap-2" onClick={() => setShowFilters(true)}>
              <Funnel /> Bộ lọc {activeFilterCount > 0 && <Badge pill bg="primary">{activeFilterCount}</Badge>}
            </Button>
          </div>

          {/* Sắp xếp nhanh dạng tab (cuộn ngang trên điện thoại) */}
          <div className="sort-tabs mb-3" role="tablist" aria-label="Sắp xếp">
            <span className="small text-muted me-1 d-none d-sm-inline">Sắp xếp:</span>
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={sort === s.value}
                className={`sort-tab${sort === s.value ? ' active' : ''}`}
                onClick={() => updateParams({ sort: s.value === 'newest' ? '' : s.value })}
              >
                {s.label}
              </button>
            ))}
          </div>

          {chips.length > 0 && (
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              {chips.map((c) => (
                <span key={c.key} className="filter-chip">
                  {c.label}
                  <button type="button" aria-label={`Bỏ lọc ${c.label}`} onClick={c.clear}>
                    <X size={14} />
                  </button>
                </span>
              ))}
              {chips.length > 1 && (
                <Button variant="link" size="sm" className="p-0 text-danger" onClick={clearAll}>
                  Xóa tất cả
                </Button>
              )}
            </div>
          )}

          {error && <div className="alert alert-warning small py-2">{error}</div>}
          {loading ? (
            <Row className="g-3">
              <ProductGridSkeleton count={9} />
            </Row>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <SearchIcon size={36} />
              <div className="fw-semibold mt-2">Không tìm thấy sản phẩm phù hợp</div>
              <div className="small text-muted mb-3">Thử bỏ bớt bộ lọc hoặc tìm với từ khóa khác</div>
              {chips.length > 0 && (
                <Button size="sm" variant="outline-primary" onClick={clearAll}>
                  Xóa bộ lọc
                </Button>
              )}
            </div>
          ) : (
            <Row className="g-3">
              {products.map((p) => (
                <Col key={p._id} xs={6} md={4}>
                  <ProductCard product={p} />
                </Col>
              ))}
              {nextCursor && (
                <Col xs={12} className="text-center">
                  <Button variant="outline-primary" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Đang tải...' : `Xem thêm (còn ${Math.max(0, total - products.length)} sản phẩm)`}
                  </Button>
                </Col>
              )}
            </Row>
          )}
        </Col>
      </Row>

      {/* Bộ lọc trên điện thoại: bảng trượt từ dưới lên */}
      <Offcanvas show={showFilters} onHide={() => setShowFilters(false)} placement="bottom" className="filter-sheet">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="fs-6 fw-bold">Bộ lọc sản phẩm</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>{filterPanel}</Offcanvas.Body>
        <div className="p-3 border-top">
          <Button className="w-100 fw-semibold" onClick={() => setShowFilters(false)}>
            Xem {total} sản phẩm
          </Button>
        </div>
      </Offcanvas>
    </Container>
  );
}
