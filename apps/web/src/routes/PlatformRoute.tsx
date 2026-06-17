/** PR6a route wrapper — `/platform` → PlatformApp (static showcase, ⌘K-only surface). */
import PlatformApp from '@/components/os/apps/PlatformApp';
import SurfaceBoundary from './SurfaceBoundary';

const PlatformRoute = () => (
  <SurfaceBoundary appName="Platform">
    <PlatformApp />
  </SurfaceBoundary>
);

export default PlatformRoute;
