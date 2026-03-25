import { motion, useDragControls, useMotionValue, PanInfo } from "framer-motion";
import { useState, useCallback, useEffect } from "react";

type SnapZone = "left" | "right" | "top" | null;

const SNAP_THRESHOLD = 16;
const STATUS_BAR_H = 32;
const DOCK_H = 72;

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
  const [snapZone, setSnapZone] = useState<SnapZone>(null);
  const [snapPreview, setSnapPreview] = useState<SnapZone>(null);
  const dragControls = useDragControls();
  const mx = useMotionValue(defaultPosition.x);
  const my = useMotionValue(defaultPosition.y);

  // Detect snap zone from pointer position during drag
  const detectSnap = useCallback((info: PanInfo): SnapZone => {
    const px = info.point.x;
    const py = info.point.y;
    if (px <= SNAP_THRESHOLD) return "left";
    if (px >= window.innerWidth - SNAP_THRESHOLD) return "right";
    if (py <= STATUS_BAR_H + SNAP_THRESHOLD) return "top";
    return null;
  }, []);

  const handleDrag = useCallback((_: unknown, info: PanInfo) => {
    setSnapPreview(detectSnap(info));
  }, [detectSnap]);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    setIsDragging(false);
    const zone = detectSnap(info);
    setSnapPreview(null);
    if (zone) {
      setSnapZone(zone);
    }
  }, [detectSnap]);

  const unsnap = useCallback(() => {
    if (snapZone) setSnapZone(null);
  }, [snapZone]);

  // Compute animated position/size based on snap state
  const getAnimateProps = () => {
    if (isMinimized) {
      return { opacity: 0, scale: 0.3, y: window.innerHeight, x: window.innerWidth / 2 - 100 };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const usableH = vh - STATUS_BAR_H - DOCK_H;

    if (isMaximized || snapZone === "top") {
      return { opacity: 1, scale: 1, x: 0, y: STATUS_BAR_H, width: vw, height: usableH };
    }
    if (snapZone === "left") {
      return { opacity: 1, scale: 1, x: 0, y: STATUS_BAR_H, width: vw / 2, height: usableH };
    }
    if (snapZone === "right") {
      return { opacity: 1, scale: 1, x: vw / 2, y: STATUS_BAR_H, width: vw / 2, height: usableH };
    }

    return { opacity: 1, scale: 1, width: defaultSize.w, height: defaultSize.h };
  };

  // Double-click title bar to maximize/restore
  const handleDoubleClick = useCallback(() => {
    if (snapZone) { setSnapZone(null); return; }
    setIsMaximized(m => !m);
  }, [snapZone]);

  const isSnappedOrMax = isMaximized || snapZone !== null;

  return (
    <>
      {/* Snap preview overlay */}
      {isDragging && snapPreview && (
        <div
          className="fixed z-[9999] rounded-xl border-2 border-primary/50 bg-primary/10 backdrop-blur-sm transition-all duration-150"
          style={{
            top: STATUS_BAR_H,
            left: snapPreview === "right" ? "50%" : 0,
            width: snapPreview === "top" ? "100%" : "50%",
            height: `calc(100vh - ${STATUS_BAR_H + DOCK_H}px)`,
          }}
        />
      )}

      <motion.div
        drag={!isSnappedOrMax}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragConstraints={{ top: STATUS_BAR_H, left: 0, right: window.innerWidth - 200, bottom: window.innerHeight - 100 }}
        onDragStart={() => setIsDragging(true)}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        initial={{ opacity: 0, scale: 0.9, x: defaultPosition.x, y: defaultPosition.y }}
        animate={getAnimateProps()}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`absolute top-0 left-0 glass-strong overflow-hidden flex flex-col shadow-2xl ${
          isSnappedOrMax ? "rounded-none" : "rounded-xl"
        }`}
        style={{ zIndex, pointerEvents: isMinimized ? "none" : "auto" }}
        onMouseDown={onFocus}
      >
        {/* Title Bar - Drag Handle */}
        <div
          onPointerDown={(e) => {
            if (snapZone) { unsnap(); }
            if (!isMaximized) dragControls.start(e);
          }}
          onDoubleClick={handleDoubleClick}
          className={`flex items-center justify-between px-4 py-2.5 border-b border-border/50 select-none shrink-0 ${
            isSnappedOrMax ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-grab"
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
              onClick={() => { setSnapZone(null); setIsMaximized(!isMaximized); }}
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
    </>
  );
};

export default AppWindow;
