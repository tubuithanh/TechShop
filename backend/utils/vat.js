// Listed prices include VAT. Round once at order level in VND so net + VAT = total.
function includedVat(total, rate = 10) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Invalid VAT rate');
  const taxableTotal = Math.max(0, Math.round(total));
  const amount = Math.round(taxableTotal * rate / (100 + rate));
  return { rate, included: true, taxableTotal, netAmount: taxableTotal - amount, amount };
}
// Allocate integer VND proportionally; largest remainders ensure the exact discount is used.
function allocateAmount(total, weights) {
  const sum = weights.reduce((a,b) => a+b, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map(w => total*w/sum), result = raw.map(Math.floor);
  const order = raw.map((n,i) => ({ i, fraction:n-result[i] })).sort((a,b) => b.fraction-a.fraction || a.i-b.i);
  for (let remaining = total-result.reduce((a,b)=>a+b,0), i=0; i<remaining; i++) result[order[i % order.length].i]++;
  return result;
}
// lineDiscounts (tùy chọn): số tiền giảm ĐÃ XÁC ĐỊNH cho từng dòng (khuyến mãi theo sản phẩm, mã chỉ áp dụng
// cho 1 số sản phẩm). Không truyền thì chia đều tổng giảm giá theo tỷ lệ tiền hàng như trước.
function orderVat(items, shippingFee = 0, discountAmount = 0, shippingRate = 10, lineDiscounts = null) {
  const rawItemsTotal = items.reduce((s,i)=>s+i.unitPrice*i.quantity,0);
  const itemGross = allocateAmount(Math.round(rawItemsTotal), items.map(i=>i.unitPrice*i.quantity));
  const itemsTotal = itemGross.reduce((a,b)=>a+b,0);
  const grossTotal = Math.round(rawItemsTotal+shippingFee);
  const discountTotal = grossTotal-Math.round(Math.max(0,rawItemsTotal+shippingFee-discountAmount));
  const itemDiscount = Math.min(itemsTotal, discountTotal);
  const discounts = lineDiscounts
    ? lineDiscounts.map((d,i)=>Math.max(0,Math.min(Math.round(d)||0,itemGross[i])))
    : allocateAmount(itemDiscount, itemGross);
  const usedItemDiscount = discounts.reduce((a,b)=>a+b,0);
  const lines = items.map((item,i)=>({ discountAmount:discounts[i], vat:includedVat(itemGross[i]-discounts[i],item.vatRate ?? 10) }));
  const shippingVat = includedVat(Math.max(0,grossTotal-itemsTotal-(discountTotal-usedItemDiscount)),shippingRate);
  const groups = new Map();
  for (const tax of [...lines.map(l=>l.vat), ...(shippingVat.taxableTotal ? [shippingVat] : [])]) {
    const group = groups.get(tax.rate) || { rate:tax.rate,taxableTotal:0,netAmount:0,amount:0 };
    for (const key of ['taxableTotal','netAmount','amount']) group[key]+=tax[key];
    groups.set(tax.rate,group);
  }
  const rates = [...groups.values()].sort((a,b)=>a.rate-b.rate);
  const vat = { included:true,taxableTotal:0,netAmount:0,amount:0,groups:rates };
  for (const group of rates) for (const key of ['taxableTotal','netAmount','amount']) vat[key]+=group[key];
  if (rates.length===1) vat.rate=rates[0].rate;
  return { lines, shippingVat, vat };
}
module.exports = { includedVat, orderVat, allocateAmount };
