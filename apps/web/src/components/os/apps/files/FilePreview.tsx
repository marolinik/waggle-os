/**
 * FilePreview — Side panel showing file contents/preview.
 * Extracted from FilesApp.tsx.
 */

import { Eye, X as XIcon, Download, RefreshCw, Image } from 'lucide-react';
import { motion } from 'framer-motion';
import type { FileEntry } from '@/lib/types';
import { formatSize } from './file-utils';
import { SyntaxPreview } from './SyntaxPreview';

interface FilePreviewProps {
  readonly file: FileEntry;
  readonly content: string | null;
  readonly loading: boolean;
  readonly isImage: boolean;
  readonly onClose: () => void;
  readonly onDownload: (file: FileEntry) => void;
}

const FilePreview = ({ file, content, loading, isImage, onClose, onDownload }: FilePreviewProps) => {
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="border-l border-border/30 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <div className="flex items-center gap-1.5 min-w-0">
          <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-display text-foreground truncate">{file.name}</span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted/50">
          <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : isImage ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-full aspect-square rounded-lg bg-muted/30 border border-border/20 flex items-center justify-center overflow-hidden">
              <Image className="w-12 h-12 text-muted-foreground/30" />
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Image preview loads from backend
            </p>
          </div>
        ) : content ? (
          <SyntaxPreview content={content} fileName={file.name} />
        ) : (
          <p className="text-xs text-muted-foreground text-center mt-8">No preview available</p>
        )}
      </div>

      {/* Footer with file info */}
      <div className="border-t border-border/20 px-3 py-2 space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Size</span>
          <span className="text-foreground">{formatSize(file.size)}</span>
        </div>
        {file.mimeType && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Type</span>
            <span className="text-foreground font-mono">{file.mimeType}</span>
          </div>
        )}
        {file.modifiedAt && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Modified</span>
            <span className="text-foreground">{new Date(file.modifiedAt).toLocaleString()}</span>
          </div>
        )}
        <div className="pt-1.5 flex gap-1">
          <button
            onClick={() => onDownload(file)}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Download className="w-3 h-3" /> Download
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default FilePreview;
