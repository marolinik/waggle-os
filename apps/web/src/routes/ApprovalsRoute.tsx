/**
 * P1a route wrapper — `/approvals` → ApprovalsApp (bare mount, Desktop.tsx:462).
 * D5: route registered for everyone; the NAV entry carries minBillingTier
 * 'TEAMS' exactly as the dock entry does (dock-tiers.ts) — tier-hidden, not
 * stripped (§1.1).
 */
import ApprovalsApp from '@/components/os/apps/ApprovalsApp';
import SurfaceBoundary from './SurfaceBoundary';

const ApprovalsRoute = () => (
  <SurfaceBoundary appName="Approvals">
    <ApprovalsApp />
  </SurfaceBoundary>
);

export default ApprovalsRoute;
