import { Link } from 'react-router-dom';
import { Cart3, CheckLg, ClipboardCheck, CreditCard } from 'react-bootstrap-icons';

const STEPS = [
  { label: 'Giỏ hàng', icon: Cart3, to: '/cart' },
  { label: 'Thông tin & thanh toán', icon: CreditCard, to: '/checkout' },
  { label: 'Hoàn tất', icon: ClipboardCheck }
];

// Thanh tiến trình mua hàng: Giỏ hàng -> Thông tin & thanh toán -> Hoàn tất. current: 0, 1, 2
export default function CheckoutSteps({ current = 0 }) {
  return (
    <ol className="checkout-steps" aria-label="Các bước đặt hàng">
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        const inner = (
          <>
            <span className="checkout-step-dot">{state === 'done' ? <CheckLg /> : <s.icon />}</span>
            <span className="checkout-step-label">{s.label}</span>
          </>
        );
        return (
          <li key={s.label} className={`checkout-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' && s.to ? (
              <Link to={s.to} className="text-reset text-decoration-none d-flex flex-column align-items-center gap-1">
                {inner}
              </Link>
            ) : (
              <div className="d-flex flex-column align-items-center gap-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
