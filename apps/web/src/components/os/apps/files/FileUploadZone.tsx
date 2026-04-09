/**
 * FileUploadZone — Drag-and-drop upload overlay.
 * Extracted from FilesApp.tsx.
 */

import { Upload } from 'lucide-react';
import { motion } from 'framer-motion';

interface FileUploadZoneProps {
  readonly currentPath: string;
}

const FileUploadZone = ({ currentPath }: FileUploadZoneProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[50] flex items-center justify-center bg-primary/5 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-xl pointer-events-none"
    >
      <div className="flex flex-col items-center gap-2">
        <Upload className="w-10 h-10 text-primary animate-bounce" />
        <p className="text-sm font-display text-primary">Drop files to upload</p>
        <p className="text-[11px] text-muted-foreground">
          Files will be added to <span className="font-mono text-foreground">{currentPath}</span>
        </p>
      </div>
    </motion.div>
  );
};

export default FileUploadZone;
