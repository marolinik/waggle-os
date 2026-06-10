/**
 * UX Refactor v2.1 P1a — route-world port of Desktop.tsx:556-558: every route
 * surface renders inside AppErrorBoundary with the appConfig title as appName.
 * The window-close affordance becomes leave-the-route (→ /home).
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import AppErrorBoundary from '@/components/os/ErrorBoundary';

const SurfaceBoundary = ({ appName, children }: { appName: string; children: ReactNode }) => {
  const navigate = useNavigate();
  return (
    <AppErrorBoundary appName={appName} onClose={() => navigate('/home')}>
      {children}
    </AppErrorBoundary>
  );
};

export default SurfaceBoundary;
