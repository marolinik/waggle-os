/**
 * P1a route wrapper — `/team` → TeamGovernanceApp (bare mount, Desktop.tsx:466).
 * Reserved (§1.1): renders the legacy app for TEAMS+; FREE/PRO never see the
 * nav zone (filterByBillingTier parity). No new Team work (D5).
 */
import TeamGovernanceApp from '@/components/os/apps/TeamGovernanceApp';
import SurfaceBoundary from './SurfaceBoundary';

const TeamRoute = () => (
  <SurfaceBoundary appName="Team Governance">
    <TeamGovernanceApp />
  </SurfaceBoundary>
);

export default TeamRoute;
