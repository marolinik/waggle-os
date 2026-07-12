/** PR7b — `/auth` pre-shell route.
 *
 * Sibling route OUTSIDE the `/`→AppShell subtree (App.tsx), so it renders with no
 * sidebar / StatusBar / boot gate — just the warm split layout. The form content is
 * gated on Clerk config (D2(b)): with explicit enablement plus a valid key, the themed
 * Clerk <SignIn/>/<SignUp/> (B2); otherwise, the honest accountless local-first state
 * (B1). The gate matches WaggleClerkProvider's, so ClerkAuthForm only renders when a
 * ClerkProvider is actually mounted above it. */
import AuthScreen from '@/components/os/auth/AuthScreen';
import AccountlessNotice from '@/components/os/auth/AccountlessNotice';
import ClerkAuthForm from '@/components/os/auth/ClerkAuthForm';
import { clerkPublishableKey } from '@/lib/clerk';

const AuthRoute = () => (
  <AuthScreen>
    {clerkPublishableKey() ? <ClerkAuthForm /> : <AccountlessNotice />}
  </AuthScreen>
);

export default AuthRoute;
