/** P1a route wrapper — `/waggle-dance` → WaggleDanceApp (bare mount, Desktop.tsx:433). */
import WaggleDanceApp from '@/components/os/apps/WaggleDanceApp';
import SurfaceBoundary from './SurfaceBoundary';

const WaggleDanceRoute = () => (
  <SurfaceBoundary appName="Waggle Dance">
    <WaggleDanceApp />
  </SurfaceBoundary>
);

export default WaggleDanceRoute;
