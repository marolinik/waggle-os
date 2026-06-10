/**
 * P1a route wrapper — `/settings/events` → EventsApp (§5.1: wrapper hosts the
 * useEvents bundle, relocated from Desktop.tsx:121; props + onAbort verbatim
 * from Desktop.tsx:424-429).
 */
import EventsApp from '@/components/os/apps/EventsApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { useEvents } from '@/hooks/useEvents';
import { adapter } from '@/lib/adapter';

const EventsRoute = () => {
  const { activeWorkspaceId } = useShell();
  const events = useEvents(activeWorkspaceId);
  return (
    <SurfaceBoundary appName="Events">
      <EventsApp steps={events.steps} autoScroll={events.autoScroll} onToggleAutoScroll={events.toggleAutoScroll}
        filter={events.filter} onFilterChange={events.setFilter}
        onAbort={() => { if (activeWorkspaceId) adapter.abortAgent(activeWorkspaceId).catch(() => {}); }} />
    </SurfaceBoundary>
  );
};

export default EventsRoute;
