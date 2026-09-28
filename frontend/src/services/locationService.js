import api from './api';

// Danh sách tỉnh ít thay đổi -> nhớ trong phiên làm việc, và nhớ phường/xã theo từng tỉnh
let provincesPromise = null;
const wardsCache = new Map();

export const locationService = {
  getProvinces() {
    if (!provincesPromise) {
      provincesPromise = api
        .get('/locations/provinces')
        .then((res) => res.data.data)
        .catch((err) => {
          provincesPromise = null;
          throw err;
        });
    }
    return provincesPromise;
  },
  getWards(province) {
    if (!province) return Promise.resolve([]);
    if (!wardsCache.has(province)) {
      wardsCache.set(
        province,
        api
          .get('/locations/wards', { params: { province } })
          .then((res) => res.data.data)
          .catch((err) => {
            wardsCache.delete(province);
            throw err;
          })
      );
    }
    return wardsCache.get(province);
  },
  clearCache() {
    provincesPromise = null;
    wardsCache.clear();
  },

  // ===== Quản trị =====
  async adminGetProvinces() {
    const { data } = await api.get('/locations/admin/provinces');
    return data.data;
  },
  async createProvince(payload) {
    const { data } = await api.post('/locations/admin/provinces', payload);
    return data;
  },
  async updateProvince(id, payload) {
    const { data } = await api.put(`/locations/admin/provinces/${id}`, payload);
    return data;
  },
  async deleteProvince(id) {
    const { data } = await api.delete(`/locations/admin/provinces/${id}`);
    return data;
  },
  async adminGetWards(params) {
    const { data } = await api.get('/locations/admin/wards', { params });
    return data;
  },
  async createWard(payload) {
    const { data } = await api.post('/locations/admin/wards', payload);
    return data;
  },
  async updateWard(id, payload) {
    const { data } = await api.put(`/locations/admin/wards/${id}`, payload);
    return data;
  },
  async deleteWard(id) {
    const { data } = await api.delete(`/locations/admin/wards/${id}`);
    return data;
  },
  async seedDefault() {
    const { data } = await api.post('/locations/admin/seed-default');
    return data;
  }
};
