// Presentation only: stored taxes, grand totals and electronic invoice exports are untouched.
export function merchandiseVat(vat, shippingVat, shippingFee = 0) {
  if (!vat || (shippingFee > 0 && !shippingVat)) return null;
  const groups = (vat.groups?.length ? vat.groups : [vat]).map(g => ({ ...g }));
  if (shippingVat?.taxableTotal > 0) {
    const group = groups.find(g => g.rate === shippingVat.rate);
    if (!group) return null;
    for (const field of ['taxableTotal', 'netAmount', 'amount']) group[field] -= shippingVat[field];
  }
  const visible = groups.filter(g => g.taxableTotal > 0);
  return { groups: visible, netAmount: visible.reduce((sum,g) => sum + g.netAmount, 0), amount: visible.reduce((sum,g) => sum + g.amount, 0) };
}
