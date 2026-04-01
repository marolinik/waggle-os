/**
 * File utility functions — icons, formatting, mock data.
 * Extracted from FilesApp.tsx to reduce file size.
 */

import {
  File, Image, Video, Music, Archive, FileCode, FileSpreadsheet, FileText,
  Cloud, HardDrive, Server,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { FileEntry, StorageType } from '@/lib/types';

export const getFileIcon = (name: string): ElementType => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return File;
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return Image;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Video;
  if (['mp3', 'wav', 'flac', 'ogg', 'aac'].includes(ext)) return Music;
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return Archive;
  if (['js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'toml', 'xml', 'html', 'css'].includes(ext)) return FileCode;
  if (['csv', 'xls', 'xlsx'].includes(ext)) return FileSpreadsheet;
  if (['md', 'txt', 'doc', 'docx', 'pdf', 'rtf'].includes(ext)) return FileText;
  return File;
};

export const formatSize = (bytes?: number): string => {
  if (!bytes) return '\u2014';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const STORAGE_LABELS: Record<StorageType, { label: string; icon: ElementType; color: string }> = {
  virtual: { label: 'Virtual', icon: Cloud, color: 'text-violet-400' },
  local: { label: 'Local', icon: HardDrive, color: 'text-emerald-400' },
  team: { label: 'Team', icon: Server, color: 'text-sky-400' },
};

export const MOCK_FILES: FileEntry[] = [
  { name: 'attachments', path: '/attachments', type: 'directory', modifiedAt: '2026-03-25T10:00:00Z' },
  { name: 'exports', path: '/exports', type: 'directory', modifiedAt: '2026-03-24T14:30:00Z' },
  { name: 'notes', path: '/notes', type: 'directory', modifiedAt: '2026-03-23T09:15:00Z' },
  { name: 'meeting-notes.md', path: '/meeting-notes.md', type: 'file', size: 4200, mimeType: 'text/markdown', modifiedAt: '2026-03-25T08:00:00Z' },
  { name: 'report.pdf', path: '/report.pdf', type: 'file', size: 245000, mimeType: 'application/pdf', modifiedAt: '2026-03-24T16:20:00Z' },
  { name: 'data.csv', path: '/data.csv', type: 'file', size: 18300, mimeType: 'text/csv', modifiedAt: '2026-03-22T11:45:00Z' },
];
