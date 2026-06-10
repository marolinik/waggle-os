/**
 * P1a route wrapper — `/automations` → AutomationCenterApp (bare mount,
 * Desktop.tsx:452). `?tab=logs&automationId=<id>` replaces the Journey-16
 * CustomEvent payload (§1.1): the params are stashed through the existing
 * app-deeplink channel BEFORE the app's mount effect runs, so its
 * consumeDeepLink consumer (AutomationCenterApp.tsx:104-114) preselects the
 * Logs tab without any component edit — typed URLs and the §2.3 shim share
 * one mechanism.
 */
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AutomationCenterApp from '@/components/os/apps/AutomationCenterApp';
import SurfaceBoundary from './SurfaceBoundary';
import { stashDeepLink } from '@/lib/app-deeplink';

const AutomationsRoute = () => {
  const [searchParams] = useSearchParams();
  // Stash once per mount, during render, so it precedes the child's mount
  // effect (the ref keeps StrictMode double-render from double-stashing).
  const stashedRef = useRef(false);
  if (!stashedRef.current) {
    stashedRef.current = true;
    const tab = searchParams.get('tab') ?? undefined;
    const automationId = searchParams.get('automationId') ?? undefined;
    if (tab || automationId) {
      stashDeepLink({ appId: 'scheduled-jobs', tab, automationId });
    }
  }
  return (
    <SurfaceBoundary appName="Automation Center">
      <AutomationCenterApp />
    </SurfaceBoundary>
  );
};

export default AutomationsRoute;
