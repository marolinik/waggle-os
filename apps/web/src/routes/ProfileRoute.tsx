/**
 * P1a route wrapper — `/settings/profile` → UserProfileApp (bare mount,
 * Desktop.tsx:409). No nav entry — parity with today (§1.1). `?tab=identity`
 * deep links arrive via the §2.3 shim's post-render re-dispatch (the app's
 * live `waggle:open-app` listener; it never reads the deeplink stash).
 */
import UserProfileApp from '@/components/os/apps/UserProfileApp';
import SurfaceBoundary from './SurfaceBoundary';

const ProfileRoute = () => (
  <SurfaceBoundary appName="My Profile">
    <UserProfileApp />
  </SurfaceBoundary>
);

export default ProfileRoute;
