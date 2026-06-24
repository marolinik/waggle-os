/** PR7a route wrapper — `/payment-success` → PaymentSuccessApp (post-Stripe-Checkout
 *  landing; `checkout.ts:42` success_url). AppShell child: the user is back inside the
 *  app after the hosted redirect. */
import PaymentSuccessApp from '@/components/os/apps/PaymentSuccessApp';
import SurfaceBoundary from './SurfaceBoundary';

const PaymentSuccessRoute = () => (
  <SurfaceBoundary appName="Payment">
    <PaymentSuccessApp />
  </SurfaceBoundary>
);

export default PaymentSuccessRoute;
