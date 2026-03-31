import { Store } from 'lucide-react';

const MarketplaceApp = () => (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
    <Store className="w-10 h-10 opacity-30" />
    <p className="text-sm font-display font-medium">Coming Soon</p>
    <p className="text-xs opacity-70">Community skills, agent templates, and connector packs</p>
  </div>
);

export default MarketplaceApp;
