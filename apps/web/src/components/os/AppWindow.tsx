import { motion, useDragControls, PanInfo } from "framer-motion";
import { useState, useCallback, useRef, useEffect } from "react";
import { savePosition } from "@/lib/window-positions";
import { HintTooltip } from "@/components/ui/hint-tooltip";

type SnapZone = "left" | "right" | "top" | null;

const SNAP_THRESHOLD = 16;
const STATUS_BAR_H = 32;
const DOCK_H = 72;
const MIN_W = 320;
const MIN_H = 240;

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

const edgeCursors: Record<string, string> = {
  n: "cursor-n-resize", s: "cursor-s-resize",
  e: "cursor-e-resize", w: "cursor-w-resize",
  ne: "cursor-ne-resize", nw: "cursor-nw-resize",
  se: "cursor-se-resize", sw: "cursor-sw-resize",
};

interface AppWindowProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  appId?: string;
  onClose: () => void;
  onMinimize: () => void;
  isMinimized?: boolean;
  isFocused?: boolean;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { w: string; h: string };
  zIndex: number;
  onFocus: () => void;
}

const parsePx = (v: string) => parseInt(v, 10) || 400;

const AppWindow = ({
  title,
  icon,
  children,
  appId,
  onClose,
  onMinimize,
  isMinimized = false,
  isFocused = false,
  defaultPosition = { x: 100, y: 60 },
  defaultSize = { w: "500px", h: "400px" },
  zIndex,
  onFocus,
}: AppWindowProps) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [snapZone, setSnapZone] = useState<SnapZone>(null);
  const [snapPreview, setSnapPreview] = useState<SnapZone>(null);
  // L-05 / R-5: clamp default size to ≤90vw × ≤80vh so narrow
  // viewports don't open a window wider than the screen.
  const [size, setSize] = useState(() => {
    const w = parsePx(defaultSize.w);
    const h = parsePx(defaultSize.h);
    if (typeof window === 'undefined') return { w, h };
    const maxW = Math.floor(window.innerWidth * 0.9);
    const maxH = Math.floor(window.innerHeight * 0.8);
    return { w: Math.min(w, maxW), h: Math.min(h, maxH) };
  });
  const [isResizing, setIsResizing] = useState(false);
  const dragControls = useDragControls();

  // Resize state refs (avoid re-renders during mousemove)
  const resizeRef = useRef<{
    edge: ResizeEdge;
    startX: number; startY: number;
    startW: number; startH: number;
    startPosX: number; startPosY: number;
    el: HTMLDivElement | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Escape key closes the focused window
  useEffect(() => {
    if (!isFocused) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, onClose]);

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
    } else if (appId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      savePosition(appId, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
  }, [detectSnap, appId]);

  const unsnap = useCallback(() => {
    if (snapZone) setSnapZone(null);
  }, [snapZone]);

  // --- Resize logic ---
  const startResize = useCallback((edge: ResizeEdge, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startPosX: rect.left,
      startPosY: rect.top,
      el: containerRef.current,
    };
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || !r.el) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;

      let newW = r.startW;
      let newH = r.startH;

      if (edge?.includes("e")) newW = Math.max(MIN_W, r.startW + dx);
      if (edge?.includes("w")) newW = Math.max(MIN_W, r.startW - dx);
      if (edge?.includes("s")) newH = Math.max(MIN_H, r.startH + dy);
      if (edge?.includes("n")) newH = Math.max(MIN_H, r.startH - dy);

      // Apply size directly for smooth resizing
      r.el.style.width = `${newW}px`;
      r.el.style.height = `${newH}px`;

      // For north/west edges, also shift position
      if (edge?.includes("w")) {
        const actualDx = r.startW - newW;
        r.el.style.transform = r.el.style.transform.replace(
          /translateX\([^)]+\)/,
          `translateX(${r.startPosX + (r.startW - newW)}px)`
        );
      }
    };

    const onUp = () => {
      const r = resizeRef.current;
      if (r?.el) {
        const rect = r.el.getBoundingClientRect();
        setSize({ w: rect.width, h: rect.height });
        if (appId) {
          savePosition(appId, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
        }
      }
      resizeRef.current = null;
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

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

    return { opacity: 1, scale: 1, width: size.w, height: size.h };
  };

  const handleDoubleClick = useCallback(() => {
    if (snapZone) { setSnapZone(null); return; }
    setIsMaximized(m => !m);
  }, [snapZone]);

  const isSnappedOrMax = isMaximized || snapZone !== null;
  const showResizeHandles = !isSnappedOrMax && !isMinimized;

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
        ref={containerRef}
        drag={!isSnappedOrMax && !isResizing}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragConstraints={{ top: STATUS_BAR_H, left: 0, right: window.innerWidth - 200, bottom: window.innerHeight - 100 }}
        onDragStart={() => setIsDragging(true)}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        initial={{ opacity: 0, scale: 0.9, x: defaultPosition.x, y: defaultPosition.y }}
        animate={isResizing ? undefined : getAnimateProps()}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`absolute top-0 left-0 glass-strong overflow-visible flex flex-col shadow-2xl ${
          isSnappedOrMax ? "rounded-none" : "rounded-xl"
        }`}
        role="dialog"
        aria-label={title}
        style={{ zIndex, pointerEvents: isMinimized ? "none" : "auto" }}
        onMouseDown={onFocus}
      >
        {/* Resize Handles */}
        {showResizeHandles && (
          <>
            {/* Edges */}
            <div onPointerDown={(e) => startResize("n", e)} className="absolute -top-1 left-2 right-2 h-2 cursor-n-resize z-10" />
            <div onPointerDown={(e) => startResize("s", e)} className="absolute -bottom-1 left-2 right-2 h-2 cursor-s-resize z-10" />
            <div onPointerDown={(e) => startResize("w", e)} className="absolute top-2 -left-1 bottom-2 w-2 cursor-w-resize z-10" />
            <div onPointerDown={(e) => startResize("e", e)} className="absolute top-2 -right-1 bottom-2 w-2 cursor-e-resize z-10" />
            {/* Corners */}
            <div onPointerDown={(e) => startResize("nw", e)} className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-20" />
            <div onPointerDown={(e) => startResize("ne", e)} className="absolute -top-1 -right-1 w-4 h-4 cursor-ne-resize z-20" />
            <div onPointerDown={(e) => startResize("sw", e)} className="absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize z-20" />
            <div onPointerDown={(e) => startResize("se", e)} className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-20" />
          </>
        )}

        {/* Title Bar - Drag Handle */}
        <div
          onPointerDown={(e) => {
            if (snapZone) { unsnap(); }
            if (!isMaximized && !isResizing) dragControls.start(e);
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
          <div className="flex items-center gap-0">
            <HintTooltip content="Minimize">
              <button
                onClick={onMinimize}
                className="w-6 h-6 flex items-center justify-center"
                aria-label="Minimize window"
              >
                <span className="w-3 h-3 rounded-full bg-primary/40 hover:bg-primary/60 transition-colors" />
              </button>
            </HintTooltip>
            <HintTooltip content="Maximize">
              <button
                onClick={() => { setSnapZone(null); setIsMaximized(!isMaximized); }}
                className="w-6 h-6 flex items-center justify-center"
                aria-label="Toggle fullscreen"
              >
                <span className="w-3 h-3 rounded-full bg-primary/40 hover:bg-primary/60 transition-colors" />
              </button>
            </HintTooltip>
            <HintTooltip content="Close">
              <button
                onClick={onClose}
                className="w-6 h-6 flex items-center justify-center"
                aria-label="Close window"
              >
                <span className="w-3 h-3 rounded-full bg-destructive/60 hover:bg-destructive transition-colors" />
              </button>
            </HintTooltip>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto rounded-b-xl">{children}</div>
      </motion.div>
    </>
  );
};

export default AppWindow;
