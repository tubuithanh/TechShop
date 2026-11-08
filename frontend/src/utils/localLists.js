import { useEffect, useState } from 'react';

// Danh sách nhỏ lưu trong trình duyệt (localStorage) + báo cho mọi component đang dùng khi thay đổi:
//  - "Sản phẩm đã xem gần đây"
//  - "Danh sách so sánh" (thanh so sánh nổi ở đáy màn hình)
// Mỗi phần tử là bản tóm tắt sản phẩm (đủ để vẽ card nhỏ) - không phải gọi lại API.
// localStorage có thể bị chặn (chế độ ẩn danh...) -> mọi thao tác đều bọc try/catch, lỗi thì coi như rỗng.
const EVENT = 'techshop:list-change';

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* bỏ qua - chỉ không ghi nhớ được */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export const summarize = (p) => ({
  _id: p._id,
  slug: p.slug,
  title: p.title,
  featuredImage: p.featuredImage,
  price: p.price,
  salePrice: p.salePrice,
  effectivePrice: p.effectivePrice,
  ratingAverage: p.ratingAverage,
  ratingCount: p.ratingCount,
  categoryId: p.categoryId?._id || p.categoryId
});

export function useLocalList(key) {
  const [list, setList] = useState(() => read(key));
  useEffect(() => {
    const sync = (e) => {
      if (!e.detail || e.detail === key) setList(read(key));
    };
    const onStorage = (e) => e.key === key && setList(read(key));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage); // đồng bộ giữa các tab
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);
  return list;
}

// ----- Đã xem gần đây -----
export const RECENT_KEY = 'techshop.recentlyViewed';
export function addRecentlyViewed(product) {
  const next = [summarize(product), ...read(RECENT_KEY).filter((p) => p._id !== product._id)].slice(0, 12);
  write(RECENT_KEY, next);
}

// ----- So sánh (tối đa 4) -----
export const COMPARE_KEY = 'techshop.compare';
export const COMPARE_MAX = 4;
export function toggleCompare(product) {
  const list = read(COMPARE_KEY);
  if (list.some((p) => p._id === product._id)) {
    write(COMPARE_KEY, list.filter((p) => p._id !== product._id));
    return { added: false };
  }
  if (list.length >= COMPARE_MAX) return { added: false, full: true };
  write(COMPARE_KEY, [...list, summarize(product)]);
  return { added: true };
}
export const removeCompare = (id) => write(COMPARE_KEY, read(COMPARE_KEY).filter((p) => p._id !== id));
export const clearCompare = () => write(COMPARE_KEY, []);
export const getCompare = () => read(COMPARE_KEY);
