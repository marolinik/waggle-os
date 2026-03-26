export { FilePreview } from './FilePreview.js';
export type { FilePreviewProps } from './FilePreview.js';

export { CodePreview } from './CodePreview.js';
export type { CodePreviewProps } from './CodePreview.js';

export { DiffViewer } from './DiffViewer.js';
export type { DiffViewerProps } from './DiffViewer.js';

export { ImagePreview } from './ImagePreview.js';
export type { ImagePreviewProps } from './ImagePreview.js';

export {
  getFileIcon,
  getLanguageFromExtension,
  isImageFile,
  isCodeFile,
  computeUnifiedDiff,
  truncateFilePath,
  getFileExtension,
  formatFileSize,
  FILE_ICONS,
  CODE_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from './utils.js';
export type { FileEntry, DiffEntry, DiffViewMode, DiffLine } from './utils.js';
