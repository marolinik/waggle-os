import { Lock, ArrowUpRight } from 'lucide-react';

interface LockedFeatureProps {
  featureName: string;
  upgradePrompt: string;
  children?: React.ReactNode;
}

const LockedFeature = ({ featureName, upgradePrompt, children }: LockedFeatureProps) => (
  <div className="relative h-full">
    {children && (
      <div className="h-full opacity-20 pointer-events-none select-none blur-[1px]">
        {children}
      </div>
    )}
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
        <Lock className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-display font-medium text-foreground">{featureName}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{upgradePrompt}</p>
      <button className="flex items-center gap-1.5 mt-1 px-4 py-2 text-xs font-medium rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors">
        <ArrowUpRight className="w-3.5 h-3.5" />
        View Plans
      </button>
    </div>
  </div>
);

export default LockedFeature;
