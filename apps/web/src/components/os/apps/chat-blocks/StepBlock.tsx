import { memo } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import type { StepContentBlock } from '@/lib/types';

interface StepBlockProps {
  block: StepContentBlock;
}

const StepBlock = memo(({ block }: StepBlockProps) => (
  <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
    {block.status === 'running' ? (
      <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
    ) : (
      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
    )}
    <span className={block.status === 'done' ? 'opacity-60' : 'text-foreground/80'}>
      {block.description}
    </span>
  </div>
));

StepBlock.displayName = 'StepBlock';
export default StepBlock;
