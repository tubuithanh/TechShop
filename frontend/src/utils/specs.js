// Tiện ích hiển thị thông số kỹ thuật theo nhóm, dựa trên mẫu thông số của danh mục
// (category.specTemplate - xem backend/utils/specTemplates.js).

export const OTHER_SPECS_GROUP = 'Thông số khác';

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

// Nhóm thông số của 1 sản phẩm theo mẫu: [{ group, items: [{ key, value }] }]. Bỏ qua trường trống;
// các khóa không có trong mẫu (dữ liệu cũ, hoặc danh mục chưa có mẫu) gom vào nhóm "Thông số khác".
export function groupSpecs(specifications, template) {
  const specs = specifications || {};
  const placed = new Set();
  const groups = (template || [])
    .map((g) => ({
      group: g.group,
      items: g.fields
        .filter((f) => hasValue(specs[f.key]))
        .map((f) => {
          placed.add(f.key);
          return { key: f.key, value: specs[f.key] };
        })
    }))
    .filter((g) => g.items.length > 0);

  const others = Object.entries(specs)
    .filter(([key, value]) => !placed.has(key) && hasValue(value))
    .map(([key, value]) => ({ key, value }));
  if (others.length) groups.push({ group: OTHER_SPECS_GROUP, items: others });
  return groups;
}

// Giá trị "tốt nhất" của 1 dòng thông số dạng số trên trang so sánh (để tô nổi bật), hoặc null nếu
// không áp dụng. CHỈ so khi mọi sản phẩm cùng danh mục - cùng 1 tên thông số có thể khác đơn vị giữa
// các danh mục (Pin điện thoại tính mAh, Pin laptop tính Wh), so thẳng số với nhau sẽ ra kết quả sai.
export function getBestSpecValue(products, key) {
  const categoryIds = new Set(products.map((p) => p.categoryId?._id || p.categoryId));
  if (categoryIds.size !== 1) return null;
  const field = (products[0].categoryId?.specTemplate || []).flatMap((g) => g.fields).find((f) => f.key === key);
  const better = field?.numeric?.better;
  if (better !== 'higher' && better !== 'lower') return null;
  const values = products.map((p) => p.specNumbers?.[key]).filter((n) => typeof n === 'number');
  if (values.length < 2 || new Set(values).size === 1) return null;
  return better === 'higher' ? Math.max(...values) : Math.min(...values);
}

// Dựng các nhóm dòng cho trang so sánh nhiều sản phẩm (có thể khác danh mục): [{ group, keys }].
// Thứ tự lấy theo mẫu của sản phẩm đầu tiên, rồi bổ sung trường từ mẫu các sản phẩm còn lại; chỉ giữ
// các dòng mà ít nhất 1 sản phẩm có giá trị - để các dòng luôn thẳng hàng giữa các cột.
export function buildCompareGroups(products) {
  const groups = [];
  const seen = new Set();
  const addKey = (groupName, key) => {
    if (seen.has(key)) return;
    seen.add(key);
    let g = groups.find((x) => x.group === groupName);
    if (!g) {
      g = { group: groupName, keys: [] };
      groups.push(g);
    }
    g.keys.push(key);
  };

  products.forEach((p) =>
    (p.categoryId?.specTemplate || []).forEach((g) => g.fields.forEach((f) => addKey(g.group, f.key)))
  );
  products.forEach((p) => Object.keys(p.specifications || {}).forEach((key) => addKey(OTHER_SPECS_GROUP, key)));

  return groups
    .map((g) => ({ group: g.group, keys: g.keys.filter((key) => products.some((p) => hasValue(p.specifications?.[key]))) }))
    .filter((g) => g.keys.length > 0);
}
