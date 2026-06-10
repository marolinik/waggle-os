/** P1a route wrapper — `/settings/usage` → TelemetryApp (bare mount, Desktop.tsx:465). */
import TelemetryApp from '@/components/os/apps/TelemetryApp';
import SurfaceBoundary from './SurfaceBoundary';

const UsageRoute = () => (
  <SurfaceBoundary appName="Usage & Telemetry">
    <TelemetryApp />
  </SurfaceBoundary>
);

export default UsageRoute;
