/** P1a route wrapper — `/skills` → CapabilitiesApp (bare mount, Desktop.tsx:432). */
import CapabilitiesApp from '@/components/os/apps/CapabilitiesApp';
import SurfaceBoundary from './SurfaceBoundary';

const SkillsRoute = () => (
  <SurfaceBoundary appName="Skills Hub">
    <CapabilitiesApp />
  </SurfaceBoundary>
);

export default SkillsRoute;
