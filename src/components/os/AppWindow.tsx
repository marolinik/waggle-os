import { motion, useDragControls } from "framer-motion";
import { useState } from "react";

interface AppWindowProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  isMinimized?: boolean;
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
  onMinimize,
  isMinimized = false,
  defaultPosition = { x: 100, y: 60 },
  defaultSize = { w: "500px", h: "400px" },
  zIndex,
  onFocus,
}: AppWindowProps) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragControls = useDragControls();

  return (
    <motion.div
      drag={!isMaximized}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={{ top: 32, left: 0, right: window.innerWidth - 200, bottom: window.innerHeight - 100 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      initial={{ opacity: 0, scale: 0.9, x: defaultPosition.x, y: defaultPosition.y }}
      animate={
        isMinimized
          ? {
              opacity: 0,
              scale: 0.3,
              y: window.innerHeight,
              x: window.innerWidth / 2 - 100,
            }
          : {
              opacity: 1,
              scale: 1,
              ...(isMaximized
                ? { x: 0, y: 32, width: "100vw", height: "calc(100vh - 6rem)" }
                : { width: defaultSize.w, height: defaultSize.h }),
            }
      }
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="absolute top-0 left-0 glass-strong rounded-xl overflow-hidden flex flex-col shadow-2xl"
      style={{ zIndex, pointerEvents: isMinimized ? "none" : "auto" }}
      onMouseDown={onFocus}
    >
      {/* Title Bar - Drag Handle */}
      <div
        onPointerDown={(e) => {
          if (!isMaximized) dragControls.start(e);
        }}
        className={`flex items-center justify-between px-4 py-2.5 border-b border-border/50 select-none shrink-0 ${
          isMaximized ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-display font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onMinimize}
            className="w-3 h-3 rounded-full bg-primary/40 hover:bg-primary/60 transition-colors"
            title="Minimize"
          />
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="w-3 h-3 rounded-full bg-primary/40 hover:bg-primary/60 transition-colors"
            title="Maximize"
          />
          <button
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-destructive/60 hover:bg-destructive transition-colors"
            title="Close"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </motion.div>
  );
};

export default AppWindow;
