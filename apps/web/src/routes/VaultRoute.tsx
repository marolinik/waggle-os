/**
 * P1a route wrapper — `/settings/vault` → VaultApp (bare mount, Desktop.tsx:408).
 * Renders full-canvas with the System nav section active; NOT embedded inside
 * SettingsApp's UI (zero-rewrite, §1.1).
 */
import VaultApp from '@/components/os/apps/VaultApp';
import SurfaceBoundary from './SurfaceBoundary';

const VaultRoute = () => (
  <SurfaceBoundary appName="Vault">
    <VaultApp />
  </SurfaceBoundary>
);

export default VaultRoute;
