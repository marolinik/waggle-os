import { useEffect } from 'react';

export interface Toast {
  id: string;
  title: string;
  body: string;
  category: string;
  actionUrl?: string;
  createdAt: number;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onAction?: (actionUrl: string) => void;
  maxVisible?: number;
}

const CATEGORY_BORDER_CLASS: Record<string, string> = {
  cron: 'border-blue-500',
  approval: 'border-green-500',
  task: 'border-amber-500',
  message: 'border-purple-500',
  agent: 'border-indigo-500',
};

export function ToastContainer({ toasts, onDismiss, onAction, maxVisible = 3 }: ToastContainerProps) {
  const visible = toasts.slice(0, maxVisible);

  return (
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
      {visible.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss, onAction }: {
  toast: Toast;
  onDismiss: (id: string) => void;
  onAction?: (url: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const borderClass = CATEGORY_BORDER_CLASS[toast.category] ?? 'border-gray-500';

  return (
    <div
      className={`bg-card rounded-lg px-3.5 py-2.5 min-w-[280px] max-w-[360px] shadow-[0_4px_12px_rgba(0,0,0,0.3)] pointer-events-auto border border-border/40 border-l-[3px] ${borderClass} ${toast.actionUrl ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={() => {
        if (toast.actionUrl && onAction) onAction(toast.actionUrl);
        onDismiss(toast.id);
      }}
    >
      <div className="flex justify-between items-center">
        <div className="text-[13px] font-semibold text-foreground">{toast.title}</div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
          className="bg-transparent border-none text-muted-foreground cursor-pointer text-sm px-1"
        >&times;</button>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{toast.body}</div>
    </div>
  );
}
