// Giá sau khuyến mãi tự động để hiển thị trên thẻ sản phẩm / trang chi tiết.
// Chỉ chương trình áp dụng cho MỌI khách ở MỌI chi nhánh mới trừ thẳng vào giá hiển thị (giá chắc chắn đúng
// với ai cũng vậy). Chương trình giới hạn chi nhánh / hạng thành viên chỉ hiện dòng "Ưu đãi thêm..." vì giá
// thật còn tùy khách và chi nhánh - backend tính chính xác lúc thanh toán (utils/promotions.js).
import { useEffect, useState } from 'react';
import { promotionService } from '../services/promotionService';

// Tải danh sách 1 lần cho cả trang (nhiều thẻ sản phẩm dùng chung), làm mới sau 5 phút
const TTL = 5 * 60 * 1000;
let cache = null;
let pending = null;
function loadPromotions() {
  if (cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.list);
  if (!pending) {
    pending = promotionService.getActive()
      .then((list) => { cache = { list: list || [], at: Date.now() }; return cache.list; })
      .catch(() => [])
      .finally(() => { pending = null; });
  }
  return pending;
}

export function useActivePromotions() {
  const [list, setList] = useState(cache?.list || []);
  useEffect(() => {
    let alive = true;
    loadPromotions().then((l) => { if (alive) setList(l); });
    return () => { alive = false; };
  }, []);
  return list;
}

const idOf = (x) => String(x?._id ?? x ?? '');

function inScope(promo, product) {
  switch (promo.scope) {
    case 'categories': return (promo.categoryIds || []).some((c) => idOf(c) === idOf(product.categoryId));
    case 'brands': return (promo.brandIds || []).some((b) => idOf(b) === idOf(product.brandId));
    case 'products': return (promo.productIds || []).some((p) => idOf(p) === idOf(product._id));
    default: return true;
  }
}

function amountFor(promo, price) {
  let off = promo.discountType === 'percent' ? (price * promo.discountValue) / 100 : promo.discountValue;
  if (promo.discountType === 'percent' && promo.maxDiscountPerItem) off = Math.min(off, promo.maxDiscountPerItem);
  return Math.round(Math.min(off, price));
}

const isPublic = (p) => !(p.storeIds?.length) && !(p.tierKeys?.length);

// price: giá đang bán của sản phẩm / phiên bản (đã gồm giá giảm sẵn của sản phẩm nếu có)
// Trả về { price, amount, promo } (giá sau khuyến mãi công khai tốt nhất) và extra = các ưu đãi có điều kiện
export function promotionPrice(product, price, promotions) {
  if (!product || !Number.isFinite(price)) return { price, amount: 0, promo: null, extra: [] };
  let promo = null;
  let amount = 0;
  const extra = [];
  for (const p of promotions || []) {
    if (!inScope(p, product)) continue;
    if (!isPublic(p)) { extra.push(p); continue; }
    const a = amountFor(p, price);
    if (a > amount) { amount = a; promo = p; }
  }
  return { price: price - amount, amount, promo, extra };
}

// Mô tả ngắn 1 ưu đãi có điều kiện: "Giảm thêm 5% cho hạng Vàng tại CN Quận 1"
export function describeExtra(p) {
  const value = p.discountType === 'percent' ? `${p.discountValue}%` : `${(p.discountValue || 0).toLocaleString('vi-VN')}đ`;
  const who = p.tierNames?.length ? ` cho thành viên hạng ${p.tierNames.join(', ')}` : '';
  const where = p.storeIds?.length ? ` tại ${(p.storeIds || []).map((s) => s.name).filter(Boolean).join(', ')}` : '';
  return `${p.name}: giảm ${value}${who}${where}`;
}
