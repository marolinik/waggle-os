/** P1a route wrapper — `/marketplace` → MarketplaceApp (bare mount, Desktop.tsx:453). */
import MarketplaceApp from '@/components/os/apps/MarketplaceApp';
import SurfaceBoundary from './SurfaceBoundary';

const MarketplaceRoute = () => (
  <SurfaceBoundary appName="Marketplace">
    <MarketplaceApp />
  </SurfaceBoundary>
);

export default MarketplaceRoute;
