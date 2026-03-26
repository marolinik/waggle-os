/**
 * CommandPalette — floating popup showing matching slash commands.
 *
 * Appears above the chat input when the user types `/`.
 * Keyboard-navigable with up/down arrows and Enter to select.
 */

import React, { useEffect, useRef, useMemo } from 'react';

export interface CommandPaletteCommand {
  name: string;
  description: string;
  usage: string;
}

export interface CommandPaletteProps {
  commands: CommandPaletteCommand[];
  filter: string; // current text after /
  onSelect: (command: string) => void;
  onClose: () => void;
  visible: boolean;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
}

export function CommandPalette({
  commands,
  filter,
  onSelect,
  onClose,
  visible,
  selectedIndex = 0,
  onSelectedIndexChange,
}: CommandPaletteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter commands by the text typed after /
  const filtered = useMemo(() => {
    if (!filter) return commands;
    const lower = filter.toLowerCase();
    return commands.filter(
      cmd =>
        cmd.name.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower),
    );
  }, [commands, filter]);

  // Scroll selected item into view
  useEffect(() => {
    if (!containerRef.current) return;
    const items = containerRef.current.querySelectorAll('[data-command-item]');
    const activeItem = items[selectedIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle keyboard events — parent should call onClose on Escape,
  // but we also handle global Escape for safety.
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Command palette"
      className="absolute bottom-full left-3 right-3 bg-muted border border-border rounded-lg p-1 mb-1 max-h-[300px] overflow-y-auto z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.4)]"
    >
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          data-command-item
          role="option"
          aria-selected={i === selectedIndex}
          onClick={() => onSelect(cmd.name)}
          onMouseEnter={() => onSelectedIndexChange?.(i)}
          className={`flex items-center gap-3 w-full py-2 px-3 border-none rounded-md text-foreground cursor-pointer text-left text-[13px] font-mono ${
            i === selectedIndex ? 'bg-primary/15' : 'bg-transparent'
          }`}
        >
          <span className="text-primary font-semibold min-w-[100px]">
            /{cmd.name}
          </span>
          <span className="text-muted-foreground text-xs font-[inherit] flex-1">
            {cmd.description}
          </span>
          {cmd.usage && (
            <span className="text-muted-foreground/50 text-[11px] ml-auto shrink-0">
              {cmd.usage}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
