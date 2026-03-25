import { motion } from "framer-motion";
import { X, Minus, Maximize2 } from "lucide-react";
import { useState } from "react";

interface AppWindowProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { w: string; h: string };
  zIndex: number;
  onFocus: () => void;
}

const AppWindow = ({
  title,
  icon,
  children,
  onClose,
  defaultPosition = { x: 100, y: 60 },
  defaultSize = { w: "500px", h: "400px" },
  zIndex,
  onFocus,
}: AppWindowProps) => {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: 0,
        x: isMaximized ? 0 : defaultPosition.x,
        width: isMaximized ? "100%" : defaultSize.w,
        height: isMaximized ? "calc(100vh - 6rem)" : defaultSize.h,
        top: isMaximized ? "2rem" : defaultPosition.y,
        left: isMaximized ? 0 : undefined,
      }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="absolute glass-strong rounded-xl overflow-hidden flex flex-col shadow-2xl"
      style={{ zIndex }}
      onMouseDown={onFocus}
    >
      {/* Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 cursor-default select-none shrink-0">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-display font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {}}
            className="w-3 h-3 rounded-full bg-primary/40 hover:bg-primary/60 transition-colors"
          />
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="w-3 h-3 rounded-full bg-primary/40 hover:bg-primary/60 transition-colors"
          />
          <button
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-destructive/60 hover:bg-destructive transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </motion.div>
  );
};

export default AppWindow;
