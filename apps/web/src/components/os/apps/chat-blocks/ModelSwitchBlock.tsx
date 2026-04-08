import { memo } from 'react';
import { Hexagon } from 'lucide-react';
import type { ModelSwitchContentBlock } from '@/lib/types';

interface ModelSwitchBlockProps {
  block: ModelSwitchContentBlock;
}

const ModelSwitchBlock = memo(({ block }: ModelSwitchBlockProps) => (
  <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
    <Hexagon className="w-3 h-3 text-amber-400 shrink-0" />
    <span>Switched to <span className="text-foreground font-medium">{block.to}</span> — {block.reason}</span>
  </div>
));

ModelSwitchBlock.displayName = 'ModelSwitchBlock';
export default ModelSwitchBlock;
