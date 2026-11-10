function historyEntry(req, status, note, changes, storeName, eventType = 'activity', storeId) {
  return {
    status, note, eventType, storeId, changedAt: new Date(), changedBy: req.account?._id,
    actorName: req.account?.name || req.account?.displayName || (req.accountRole === 'system' ? 'Hệ thống GHN' : 'Khách hàng'),
    actorRole: req.accountRole, storeName: storeName || req.storeScope?.currentStore?.name || req.account?.storeId?.name, changes
  };
}
async function enrichHistory(documents) {
  const orders = documents.map(d => d.toObject ? d.toObject() : d);
  const ids = [...new Set(orders.flatMap(o => (o.statusHistory || []).filter(h => !h.actorName && h.changedBy).map(h => String(h.changedBy))))];
  const [admins, customers] = await Promise.all([
    require('../models/Admin').find({ _id: { $in: ids } }).select('name role').lean(),
    require('../models/User').find({ _id: { $in: ids } }).select('displayName').lean()
  ]);
  const actors = new Map([...admins, ...customers].map(a => [String(a._id), a]));
  for (const o of orders) {
    for (const h of o.statusHistory || []) {
      const actor = actors.get(String(h.changedBy));
      if (!h.actorName && actor) { h.actorName = actor.name || actor.displayName; h.actorRole = actor.role || 'customer'; }
    }
    // Legacy IDs can be resolved, but historical branch/name snapshots cannot be reconstructed.
    if (!o.confirmedAt && o.status !== 'pending') {
      for (const h of [...(o.statusHistory || [])].reverse()) {
        if (h.eventType === 'activity') continue;
        if (h.status === 'confirmed') {
          o.confirmedAt = h.changedAt; o.confirmedByName = h.actorName; o.confirmedStoreName = h.storeName;
          break;
        }
        if (h.status === 'pending') break;
      }
    }
  }
  return orders;
}
module.exports = { historyEntry, enrichHistory };
