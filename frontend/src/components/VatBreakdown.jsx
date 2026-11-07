import { money } from '../utils/orderWorkflow';
export default function VatBreakdown({ vat }) {
  if (!vat || (!vat.groups?.length && typeof vat.rate !== 'number')) return null;
  const groups = vat.groups?.length ? vat.groups : [vat];
  return <div className="small border-top mt-2 pt-2">
    <div className="d-flex justify-content-between gap-2"><span>Giá trị chưa VAT</span><span>{money(vat.netAmount)}</span></div>
    {groups.map(group=><div className="d-flex justify-content-between gap-2" key={group.rate}><span>VAT {group.rate}% (đã bao gồm)</span><span>{money(group.amount)}</span></div>)}
    {groups.length>1 && <div className="d-flex justify-content-between gap-2"><span>Tổng VAT</span><span>{money(vat.amount)}</span></div>}
  </div>;
}
