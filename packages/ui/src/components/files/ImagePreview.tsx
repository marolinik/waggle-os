/**
 * ImagePreview — renders an image with optional zoom capability.
 *
 * Supports data URIs, local file paths (via asset protocol in Tauri),
 * and regular URLs.
 */

import { useState } from 'react';

export interface ImagePreviewProps {
  src: string;
  alt?: string;
  zoomable?: boolean;
}

export function ImagePreview({ src, alt = 'Preview', zoomable = true }: ImagePreviewProps) {
  const [zoomed, setZoomed] = useState(false);

  const handleClick = () => {
    if (zoomable) setZoomed(!zoomed);
  };

  return (
    <div className="image-preview flex flex-col items-center justify-center p-4 bg-background rounded">
      <div
        className={`image-preview__container relative overflow-auto ${
          zoomed ? 'max-h-none cursor-zoom-out' : 'max-h-96 cursor-zoom-in'
        }`}
        onClick={handleClick}
        role={zoomable ? 'button' : undefined}
        tabIndex={zoomable ? 0 : undefined}
        onKeyDown={zoomable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); } : undefined}
      >
        <img
          src={src}
          alt={alt}
          className={`image-preview__img rounded transition-transform ${
            zoomed ? 'scale-100' : 'max-w-full max-h-96 object-contain'
          }`}
          draggable={false}
        />
      </div>

      {zoomable && (
        <span className="image-preview__hint text-xs text-muted-foreground mt-2">
          {zoomed ? 'Click to zoom out' : 'Click to zoom in'}
        </span>
      )}
    </div>
  );
}
