/**
 * P1a route wrapper — `/settings` → SettingsApp (bare mount, Desktop.tsx:407).
 * `?tab=` URL→internal-tab wiring is excluded conversion work (§5.3 #1 — the
 * component lacks a tab prop); `/settings?tab=backup` remains the canonical
 * ADDRESS for the killed `backup` AppId (§1.1).
 */
import SettingsApp from '@/components/os/apps/SettingsApp';
import SurfaceBoundary from './SurfaceBoundary';

const SettingsRoute = () => (
  <SurfaceBoundary appName="Settings">
    <SettingsApp />
  </SurfaceBoundary>
);

export default SettingsRoute;
