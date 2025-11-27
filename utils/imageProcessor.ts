import { FilterType, ScannedPage } from '../types';
import { jsPDF } from 'jspdf';

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

// Main processing function: Rotates and Applies Filters
export const processImage = async (
  dataUrl: string,
  rotation: number,
  filter: FilterType,
  quality: number = 0.8,
  annotationDataUrl?: string
): Promise<string> => {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Could not get canvas context");

  // Handle Rotation Dimensions
  if (rotation % 180 !== 0) {
    canvas.width = img.height;
    canvas.height = img.width;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }

  // Draw Rotate
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  // Get raw data for pixel manipulation if needed
  if (filter !== FilterType.ORIGINAL) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    const finalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = finalData.data;
    
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (filter === FilterType.GRAYSCALE) {
        px[i] = px[i+1] = px[i+2] = gray;
      } else if (filter === FilterType.BW_THRESHOLD) {
         // Adaptive-ish threshold or hard threshold
         const v = gray > 110 ? 255 : 0;
         px[i] = px[i+1] = px[i+2] = v;
      } else if (filter === FilterType.ENHANCE) {
        // Simple sharpening / contrast
        px[i] = Math.min(255, r * 1.05);
        px[i+1] = Math.min(255, g * 1.05);
        px[i+2] = Math.min(255, b * 1.05);
      }
    }
    ctx.putImageData(finalData, 0, 0);
  }

  // Apply Annotation Overlay if exists
  if (annotationDataUrl) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Ensure identity transform
    try {
        const overlay = await loadImage(annotationDataUrl);
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    } catch (e) {
        console.warn("Failed to load annotation overlay", e);
    }
  }

  return canvas.toDataURL('image/jpeg', quality);
};

const createPDFDoc = (pages: ScannedPage[]) => {
  const doc = new jsPDF();

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage();

    const imgProps = doc.getImageProperties(page.displayDataUrl);
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    
    // Calculate aspect ratio to fit page
    const imgRatio = imgProps.width / imgProps.height;
    const pageRatio = pdfWidth / pdfHeight;

    let w = pdfWidth;
    let h = w / imgRatio;

    if (h > pdfHeight) {
      h = pdfHeight;
      w = h * imgRatio;
    }

    // Center image
    const x = (pdfWidth - w) / 2;
    const y = (pdfHeight - h) / 2;

    doc.addImage(page.displayDataUrl, 'JPEG', x, y, w, h);
  });
  return doc;
};

export const generatePDF = (pages: ScannedPage[], fileName?: string) => {
  if (pages.length === 0) return;
  const doc = createPDFDoc(pages);
  const name = fileName ? (fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`) : `scan_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(name);
};

export const getPDFBlob = (pages: ScannedPage[]): Blob => {
  const doc = createPDFDoc(pages);
  return doc.output('blob');
};