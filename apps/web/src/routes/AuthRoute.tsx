/** PR7b — `/auth` pre-shell route (B1).
 *
 * Sibling route OUTSIDE the `/`→AppShell subtree (App.tsx), so it renders with no
 * sidebar / StatusBar / boot gate — just the warm split layout. B1 shows the honest
 * accountless local-first state; B2 swaps in the themed Clerk <SignIn/> behind a
 * no-key guard that falls back to exactly this state. */
import AuthScreen from '@/components/os/auth/AuthScreen';
import AccountlessNotice from '@/components/os/auth/AccountlessNotice';

const AuthRoute = () => (
  <AuthScreen>
    <AccountlessNotice />
  </AuthScreen>
);

export default AuthRoute;
