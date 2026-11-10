import { money } from '../utils/orderWorkflow';
import { merchandiseVat } from '../utils/displayVat';
export default function VatBreakdown({ vat: storedVat, shippingVat, shippingFee = 0 }) {
  const vat = merchandiseVat(storedVat, shippingVat, shippingFee);
  if (!vat || (!vat.groups?.length && typeof vat.rate !== 'number')) return null;
  const groups = vat.groups?.length ? vat.groups : [vat];
  return <div className="small border-top mt-2 pt-2">
    <div className="d-flex justify-content-between gap-2"><span>Tiền hàng chưa VAT</span><span>{money(vat.netAmount)}</span></div>
    {groups.map(group=><div className="d-flex justify-content-between gap-2" key={group.rate}><span>VAT hàng hóa {group.rate}% (đã bao gồm)</span><span>{money(group.amount)}</span></div>)}
    {groups.length>1 && <div className="d-flex justify-content-between gap-2"><span>Tổng VAT hàng hóa</span><span>{money(vat.amount)}</span></div>}
  </div>;
}
