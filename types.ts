export enum FilterType {
  ORIGINAL = 'ORIGINAL',
  GRAYSCALE = 'GRAYSCALE',
  BW_THRESHOLD = 'BW_THRESHOLD', // High contrast for documents
  ENHANCE = 'ENHANCE',
}

export type AnnotationTool = 'PEN' | 'ERASER' | 'RECT' | 'CIRCLE' | 'TEXT';

export interface ScannedPage {
  id: string;
  originalDataUrl: string; // The raw capture
  displayDataUrl: string; // The version shown (filtered/rotated)
  annotationDataUrl?: string; // Transparent PNG of drawings/signatures
  rotation: number; // 0, 90, 180, 270
  filter: FilterType;
  width: number;
  height: number;
  createdAt: number;
  ocrText?: string; // For search and smart naming
}

export interface DocumentGroup {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: ScannedPage[];
  tags?: string[];
  folder?: string; // 'Work', 'Personal', 'Receipts', etc.
}

export type ScanMode = 'DOCUMENT' | 'ID_CARD';

export type AppView = 'HOME' | 'CAMERA' | 'DOC_DETAIL' | 'EDIT';