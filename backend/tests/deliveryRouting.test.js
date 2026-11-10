jest.mock('../utils/httpJson', () => ({ httpJson: jest.fn() }));
const { httpJson } = require('../utils/httpJson');
const { roadDistance, addressKey, internalAllowed } = require('../utils/deliveryRouting');
beforeEach(() => jest.clearAllMocks());
test('Routes use server coordinates and road distance, preserving the exact meter boundary', async () => {
  httpJson.mockResolvedValue({ status: 200, data: { code: 'Ok', routes: [{ distance: 20000.1, duration: 123 }] } });
  const result = await roadDistance({ lat: 10.7, lng: 106.7 }, { lat: 10.8, lng: 106.8 });
  expect(result.distanceMeters).toBe(20000.1);
  expect(String(httpJson.mock.calls[0][0])).toContain('/route/v1/driving/106.7,10.7;106.8,10.8');
  const order = { storeId: 'branch-a', deliveryAddress: { city: 'City', addressLine1: 'Street' } };
  order.deliveryPlan = { storeId: 'branch-a', addressKey: addressKey(order), mode: 'internal', sameProvince: true, distanceMeters: result.distanceMeters };
  expect(internalAllowed(order)).toBe(false);
  order.deliveryPlan.distanceMeters = 20000; expect(internalAllowed(order)).toBe(true);
  order.storeId = 'branch-b'; expect(internalAllowed(order)).toBe(false);
});
test('Unknown coordinates and routing outages never become a zero-distance local delivery', async () => {
  await expect(roadDistance({ lat: null, lng: 106.7 }, { lat: 10.8, lng: 106.8 })).rejects.toMatchObject({ status: 400 });
  expect(httpJson).not.toHaveBeenCalled();
  httpJson.mockRejectedValue(new Error('Network down'));
  await expect(roadDistance({ lat: 10.7, lng: 106.7 }, { lat: 10.8, lng: 106.8 })).rejects.toMatchObject({ status: 503 });
  httpJson.mockResolvedValue({ status: 200, data: { code: 'NoRoute' } });
  await expect(roadDistance({ lat: 10.7, lng: 106.7 }, { lat: 10.8, lng: 106.8 })).rejects.toMatchObject({ status: 400 });
});
