/**
 * FileDropZone — visual overlay when files are dragged over the chat input.
 *
 * Wraps children and activates a translucent drop indicator on dragover.
 * Reads file contents and calls `onDrop` with categorized DroppedFile[] (including base64 content).
 */

import React, { useState, useCallback, useRef } from 'react';
import { categorizeFile, type DroppedFile } from './drop-utils.js';

export interface FileDropZoneProps {
  /** Called with categorized files (including base64 content) when user drops files. */
  onDrop: (files: DroppedFile[]) => void;
  /** Disable the drop zone (e.g. while agent is thinking). */
  disabled?: boolean;
  children?: React.ReactNode;
}

/** Read a File as base64 (without the data: prefix). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip data:...;base64, prefix
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onDrop, disabled, children }) => {
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounter.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setDragActive(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      dragCounter.current = 0;
      if (disabled) return;

      const fileList = e.dataTransfer.files;
      if (!fileList || fileList.length === 0) return;

      const dropped: DroppedFile[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const info = categorizeFile(f.name, f.size);
        try {
          const base64 = await readAsBase64(f);
          dropped.push({ ...info, content: base64 });
        } catch {
          dropped.push(info);
        }
      }
      onDrop(dropped);
    },
    [disabled, onDrop],
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative h-full"
    >
      {children}
      {dragActive && (
        <div
          data-testid="drop-overlay"
          className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary/60 rounded-lg flex items-center justify-center pointer-events-none z-10"
        >
          <span className="text-primary font-semibold text-sm">
            Drop files here
          </span>
        </div>
      )}
    </div>
  );
};
