/**
 * Tabs — horizontal tab bar with close buttons.
 *
 * Renders tabs with active state, close buttons, and a [+] new tab button.
 */

export interface Tab {
  id: string;
  label: string;
  icon?: string;
}

export interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function Tabs({ tabs, activeId, onSelect, onClose, onAdd }: TabsProps) {
  return (
    <div
      className="waggle-tabs flex items-center bg-card border-b border-border h-9 overflow-hidden"
      role="tablist"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`waggle-tab flex items-center px-3 h-full cursor-pointer text-[13px] border-r border-border select-none ${
            tab.id === activeId
              ? 'waggle-tab--active bg-background text-foreground'
              : 'bg-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
          <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
            {tab.label}
          </span>
          <button
            className="waggle-tab-close bg-transparent border-none text-inherit ml-2 cursor-pointer text-sm leading-none px-0.5 opacity-60 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
            aria-label={`Close ${tab.label}`}
          >
            {'\u00D7'}
          </button>
        </div>
      ))}

      <button
        className="waggle-tab-add bg-transparent border-none text-muted-foreground hover:text-foreground cursor-pointer text-lg px-3 h-full"
        onClick={onAdd}
        aria-label="New tab"
      >
        +
      </button>
    </div>
  );
}
