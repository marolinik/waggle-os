/** PR6a route wrapper — `/benchmarks` → BenchmarkApp (static, ⌘K-only surface). */
import BenchmarkApp from '@/components/os/apps/BenchmarkApp';
import SurfaceBoundary from './SurfaceBoundary';

const BenchmarkRoute = () => (
  <SurfaceBoundary appName="Benchmarks">
    <BenchmarkApp />
  </SurfaceBoundary>
);

export default BenchmarkRoute;
