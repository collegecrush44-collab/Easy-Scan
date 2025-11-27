import React, { useEffect, useState, useRef } from 'react';
import { ScannedPage, FilterType, AnnotationTool } from '../types';
import { processImage } from '../utils/imageProcessor';
import { RotateCw, Check, Trash2, ArrowLeft, Crop as CropIcon, PenTool, Eraser, Square, Circle, Type as TypeIcon, ZoomIn } from 'lucide-react';
import Cropper from 'cropperjs';

interface EditViewProps {
  page: ScannedPage;
  onSave: (updatedPage: ScannedPage) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}

type EditMode = 'FILTER' | 'CROP' | 'ANNOTATE';

const EditView: React.FC<EditViewProps> = ({ page, onSave, onDelete, onCancel }) => {
  const [sourceDataUrl, setSourceDataUrl] = useState(page.originalDataUrl);
  const [currentRotation, setCurrentRotation] = useState(page.rotation);
  const [currentFilter, setCurrentFilter] = useState(page.filter);
  const [quality] = useState(0.8);
  const [previewUrl, setPreviewUrl] = useState(page.displayDataUrl);
  const [annotationUrl, setAnnotationUrl] = useState<string | undefined>(page.annotationDataUrl);
  const [mode, setMode] = useState<EditMode>('FILTER');
  
  // ZOOM STATE
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastTouchRef = useRef<{ x: number, y: number, dist: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('PEN');
  const [penColor, setPenColor] = useState('#ef4444');
  const [penSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const startPos = useRef<{x: number, y: number} | null>(null);
  const canvasSnapshot = useRef<ImageData | null>(null);

  // Derive canvas dimensions based on current rotation (if rotated 90 or 270, width/height swap)
  const isRotatedSideways = currentRotation % 180 !== 0;
  const baseWidth = page.width || 800;
  const baseHeight = page.height || 1000;
  const canvasWidth = isRotatedSideways ? baseHeight : baseWidth;
  const canvasHeight = isRotatedSideways ? baseWidth : baseHeight;

  useEffect(() => {
    if (mode === 'CROP') return;
    let active = true;
    const update = async () => {
      const newUrl = await processImage(sourceDataUrl, currentRotation, currentFilter, quality, annotationUrl);
      if (active) setPreviewUrl(newUrl);
    };
    update();
    return () => { active = false; };
  }, [currentRotation, currentFilter, sourceDataUrl, quality, annotationUrl, mode]);

  useEffect(() => {
    // Reset Zoom when changing modes or rotation
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [mode, currentRotation]);

  useEffect(() => {
    if (mode === 'CROP' && cropImgRef.current) {
      const prepareCropImage = async () => {
        const rotatedUrl = await processImage(sourceDataUrl, currentRotation, FilterType.ORIGINAL, 1.0);
        if (cropImgRef.current) {
            cropImgRef.current.src = rotatedUrl;
            if (cropperRef.current) cropperRef.current.destroy();
            cropperRef.current = new Cropper(cropImgRef.current, {
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.8,
                background: false,
                modal: true,
                guides: true,
                highlight: false,
                center: true,
            });
        }
      };
      prepareCropImage();
    }
    return () => { if (cropperRef.current) cropperRef.current.destroy(); };
  }, [mode, sourceDataUrl, currentRotation]);

  useEffect(() => {
      if (mode === 'ANNOTATE' && canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.onload = () => ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          if (annotationUrl) img.src = annotationUrl;
      }
  }, [mode]);

  const handleRotate = () => setCurrentRotation(prev => (prev + 90) % 360);

  const performCrop = () => {
    if (cropperRef.current) {
      const canvas = cropperRef.current.getCroppedCanvas();
      if (canvas) {
        setSourceDataUrl(canvas.toDataURL('image/jpeg', 1.0));
        setCurrentRotation(0); 
        if (annotationUrl) setAnnotationUrl(undefined);
        setMode('FILTER');
      }
    }
  };

  // --- Zoom / Pan Logic ---
  
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e && e.touches.length === 1) {
        // Double Tap Detection
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            // Double tap!
            if (scale > 1) {
                setScale(1);
                setTranslate({ x: 0, y: 0 });
            } else {
                setScale(2.5);
                setTranslate({ x: 0, y: 0 }); // Optionally center on tap, but 0,0 is safe
            }
        } else {
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
        }
        lastTapRef.current = now;
    } else if ('touches' in e && e.touches.length === 2) {
        // Pinch Start
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        lastTouchRef.current = { x: midX, y: midY, dist };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (!lastTouchRef.current) return;
      
      if (e.touches.length === 1 && scale > 1) {
          // Pan
          const dx = e.touches[0].clientX - lastTouchRef.current.x;
          const dy = e.touches[0].clientY - lastTouchRef.current.y;
          setTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          lastTouchRef.current = { ...lastTouchRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
          // Pinch
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          
          if (lastTouchRef.current.dist > 0) {
              const scaleChange = dist / lastTouchRef.current.dist;
              setScale(prev => Math.min(Math.max(1, prev * scaleChange), 4));
          }
          lastTouchRef.current = { ...lastTouchRef.current, dist };
      }
  };
  
  const handleTouchEnd = () => {
      // Bounce back logic if needed, for now just cleanup
      if (scale < 1) setScale(1);
      lastTouchRef.current = null;
  };

  // --- Annotation Logic ---

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let cx, cy;
    if ('touches' in e) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
    } else {
        cx = (e as React.MouseEvent).clientX;
        cy = (e as React.MouseEvent).clientY;
    }
    // Scale visual coordinates to internal canvas resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e, canvas);
    startPos.current = { x, y };

    if (currentTool === 'TEXT') {
        const text = prompt("Enter text:");
        if (text) {
            ctx.fillStyle = penColor;
            ctx.font = `bold ${Math.max(20, canvas.width / 20)}px sans-serif`;
            ctx.fillText(text, x, y);
        }
        return;
    }

    setIsDrawing(true);
    canvasSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (currentTool === 'PEN' || currentTool === 'ERASER') {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = currentTool === 'ERASER' ? 'rgba(0,0,0,1)' : penColor;
        // Scale pen size relative to canvas
        const scaleFactor = canvas.width / 800;
        ctx.lineWidth = (currentTool === 'ERASER' ? 30 : penSize) * scaleFactor;
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = currentTool === 'ERASER' ? 'destination-out' : 'source-over';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current || !startPos.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getCoordinates(e, canvas);

    if (currentTool === 'PEN' || currentTool === 'ERASER') {
        ctx.lineTo(x, y);
        ctx.stroke();
    } else if (currentTool === 'RECT' || currentTool === 'CIRCLE') {
        // Restore snapshot to avoid trailing shapes
        if (canvasSnapshot.current) {
            ctx.putImageData(canvasSnapshot.current, 0, 0);
        }
        
        ctx.strokeStyle = penColor;
        const scaleFactor = canvas.width / 800;
        ctx.lineWidth = (penSize + 2) * scaleFactor;
        ctx.globalCompositeOperation = 'source-over';
        
        if (currentTool === 'RECT') {
            ctx.strokeRect(startPos.current.x, startPos.current.y, x - startPos.current.x, y - startPos.current.y);
        } else if (currentTool === 'CIRCLE') {
            ctx.beginPath();
            const radius = Math.sqrt(Math.pow(x - startPos.current.x, 2) + Math.pow(y - startPos.current.y, 2));
            ctx.arc(startPos.current.x, startPos.current.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
  };

  const stopDrawing = () => {
      setIsDrawing(false);
      startPos.current = null;
      canvasSnapshot.current = null;
  };

  const saveAnnotation = () => {
      if (canvasRef.current) setAnnotationUrl(canvasRef.current.toDataURL('image/png'));
      setMode('FILTER');
  };

  const handleSave = () => {
    onSave({
      ...page,
      originalDataUrl: sourceDataUrl,
      rotation: currentRotation,
      filter: currentFilter,
      displayDataUrl: previewUrl,
      annotationDataUrl: annotationUrl
    });
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col h-full font-sans">
      {/* Top Header */}
      <div className="flex justify-between items-center p-4 bg-transparent absolute top-0 left-0 right-0 z-20 pointer-events-none">
         <div className="pointer-events-auto">
             <button onClick={onCancel} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/10 transition-colors">
                <ArrowLeft className="w-5 h-5" />
             </button>
         </div>
         
         <div className="pointer-events-auto">
             {mode === 'FILTER' && (
                 <button onClick={handleSave} className="px-4 py-2 bg-brand-500 rounded-full text-white font-medium text-sm shadow-lg shadow-brand-500/20 active:scale-95 transition-transform">
                    Done
                 </button>
             )}
             {(mode === 'CROP' || mode === 'ANNOTATE') && (
                 <button onClick={mode === 'CROP' ? performCrop : saveAnnotation} className="p-2 bg-brand-500 rounded-full text-white shadow-lg active:scale-95 transition-transform">
                    <Check className="w-5 h-5" />
                 </button>
             )}
         </div>
      </div>
      
      {/* Zoom Reset Indicator */}
      {scale > 1 && mode === 'FILTER' && (
          <div className="absolute top-20 right-4 z-20">
              <button onClick={() => { setScale(1); setTranslate({x:0,y:0}); }} className="bg-black/60 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1 shadow-xl">
                  <ZoomIn className="w-3 h-3" /> Reset {Math.round(scale * 100)}%
              </button>
          </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative bg-zinc-900 flex items-center justify-center overflow-hidden">
         {mode === 'CROP' ? (
             <div className="w-full h-full p-6">
                 <img ref={cropImgRef} className="max-w-full opacity-0" />
             </div>
         ) : mode === 'ANNOTATE' ? (
             <div className="relative flex items-center justify-center" style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: `${canvasWidth}/${canvasHeight}` }}>
                 <img src={previewUrl} className="w-full h-full object-contain pointer-events-none" />
                 <canvas 
                    ref={canvasRef}
                    width={canvasWidth} height={canvasHeight}
                    className="absolute inset-0 w-full h-full touch-none"
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                 />
             </div>
         ) : (
             <div 
                className="w-full h-full flex items-center justify-center touch-none overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
             >
                <div style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transition: 'transform 0.1s ease-out' }} className="flex items-center justify-center p-6 w-full h-full">
                    <img 
                        src={previewUrl} 
                        className="max-h-[75vh] max-w-full object-contain shadow-2xl" 
                    />
                </div>
             </div>
         )}
      </div>

      {/* Bottom Controls Sheet */}
      <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20 shrink-0 pb-safe">
          
          {mode === 'FILTER' && (
              <div className="p-6">
                  {/* Tools Row */}
                  <div className="flex justify-around items-center mb-6">
                      <button onClick={() => setMode('CROP')} className="flex flex-col items-center gap-1.5 group">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-zinc-700 transition-colors">
                              <CropIcon className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-medium">Crop</span>
                      </button>
                      
                      <button onClick={handleRotate} className="flex flex-col items-center gap-1.5 group">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-zinc-700 transition-colors">
                              <RotateCw className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-medium">Rotate</span>
                      </button>
                      
                      <button onClick={() => setMode('ANNOTATE')} className="flex flex-col items-center gap-1.5 group">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-zinc-700 transition-colors">
                              <PenTool className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-medium">Tools</span>
                      </button>

                      <button onClick={() => onDelete(page.id)} className="flex flex-col items-center gap-1.5 group">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-red-400 group-hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-medium">Delete</span>
                      </button>
                  </div>

                  {/* Filter Carousel */}
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                      {[
                        { id: FilterType.ORIGINAL, label: 'Original' },
                        { id: FilterType.GRAYSCALE, label: 'Grayscale' },
                        { id: FilterType.BW_THRESHOLD, label: 'B & W' },
                        { id: FilterType.ENHANCE, label: 'Magic' },
                      ].map(f => (
                          <button 
                            key={f.id}
                            onClick={() => setCurrentFilter(f.id)}
                            className={`flex-shrink-0 flex flex-col items-center gap-2`}
                          >
                              <div className={`w-16 h-20 rounded-lg border-2 overflow-hidden relative ${currentFilter === f.id ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-transparent opacity-60'}`}>
                                  {/* Preview Simulation */}
                                  <div className={`w-full h-full bg-zinc-200 ${f.id === FilterType.GRAYSCALE ? 'grayscale' : f.id === FilterType.BW_THRESHOLD ? 'grayscale contrast-200' : ''}`}>
                                    <img src={sourceDataUrl} className="w-full h-full object-cover" />
                                  </div>
                              </div>
                              <span className={`text-[10px] font-medium ${currentFilter === f.id ? 'text-brand-400' : 'text-zinc-500'}`}>{f.label}</span>
                          </button>
                      ))}
                  </div>
              </div>
          )}

          {mode === 'ANNOTATE' && (
             <div className="p-6 flex flex-col gap-4">
                 <div className="flex justify-between items-center gap-2">
                     <button onClick={() => setCurrentTool('PEN')} className={`p-3 rounded-xl flex-1 flex items-center justify-center ${currentTool === 'PEN' ? 'bg-brand-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                         <PenTool className="w-5 h-5" />
                     </button>
                     <button onClick={() => setCurrentTool('RECT')} className={`p-3 rounded-xl flex-1 flex items-center justify-center ${currentTool === 'RECT' ? 'bg-brand-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                         <Square className="w-5 h-5" />
                     </button>
                     <button onClick={() => setCurrentTool('CIRCLE')} className={`p-3 rounded-xl flex-1 flex items-center justify-center ${currentTool === 'CIRCLE' ? 'bg-brand-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                         <Circle className="w-5 h-5" />
                     </button>
                     <button onClick={() => setCurrentTool('TEXT')} className={`p-3 rounded-xl flex-1 flex items-center justify-center ${currentTool === 'TEXT' ? 'bg-brand-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                         <TypeIcon className="w-5 h-5" />
                     </button>
                     <button onClick={() => setCurrentTool('ERASER')} className={`p-3 rounded-xl flex-1 flex items-center justify-center ${currentTool === 'ERASER' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                         <Eraser className="w-5 h-5" />
                     </button>
                 </div>
                 
                 {currentTool !== 'ERASER' && (
                    <div className="flex gap-3 justify-center">
                        {['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#000000', '#ffffff'].map(c => (
                            <button 
                                key={c} 
                                onClick={() => setPenColor(c)}
                                className={`w-8 h-8 rounded-full border-2 ${penColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                 )}
             </div>
          )}

      </div>
    </div>
  );
};

export default EditView;