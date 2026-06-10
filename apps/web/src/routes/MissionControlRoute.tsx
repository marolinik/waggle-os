/**
 * P1a route wrapper — `/settings/mission-control` → CockpitApp (bare mount,
 * Desktop.tsx:430). D8: nav label "Mission Control"; "Command Center" is
 * reserved for the Ctrl+K palette. (The legacy `mission-control` AppId /
 * MissionControlApp is KILLED — §1.1.)
 */
import CockpitApp from '@/components/os/apps/CockpitApp';
import SurfaceBoundary from './SurfaceBoundary';

const MissionControlRoute = () => (
  <SurfaceBoundary appName="Cockpit">
    <CockpitApp />
  </SurfaceBoundary>
);

export default MissionControlRoute;
