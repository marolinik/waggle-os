import { Clock } from 'lucide-react';

const ScheduledJobsApp = () => (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
    <Clock className="w-10 h-10 opacity-30" />
    <p className="text-sm font-display font-medium">Coming Soon</p>
    <p className="text-xs opacity-70">Automate recurring tasks — reports, syncs, health checks</p>
  </div>
);

export default ScheduledJobsApp;
