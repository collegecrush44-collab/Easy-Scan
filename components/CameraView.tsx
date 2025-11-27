import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Zap, Layers, Check, CreditCard, FileText } from 'lucide-react';
import { ScanMode } from '../types';

interface CameraViewProps {
  onFinish: (dataUrls: string[]) => void;
  onClose: () => void;
}

const CameraView: React.FC<CameraViewProps> = ({ onFinish, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');
  const [flash, setFlash] = useState(false);
  const [flashMode, setFlashMode] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('DOCUMENT');
  
  // Track stream in a ref for robust cleanup
  const streamRef = useRef<MediaStream | null>(null);
  
  // Batch Scanning State
  const [capturedImages, setCapturedImages] = useState<string[]>([]);

  const startCamera = async () => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      let mediaStream: MediaStream;
      
      try {
        // First try to get the back camera
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment', 
            width: { ideal: 1920 }, 
            height: { ideal: 1080 } 
          },
          audio: false,
        });
      } catch (err) {
        console.log("Environment camera not found, trying fallback...", err);
        // Fallback to any available camera
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1920 }, 
            height: { ideal: 1080 } 
          },
          audio: false,
        });
      }

      streamRef.current = mediaStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError('');
    } catch (err) {
      setError('Unable to access camera. Please ensure permissions are granted.');
      console.error(err);
    }
  };

  useEffect(() => {
    startCamera();
    
    // robust cleanup function
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.9);
    }
    return null;
  };

  const takePhoto = useCallback(() => {
    const dataUrl = captureFrame();
    if (dataUrl) {
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      setCapturedImages(prev => [...prev, dataUrl]);
    }
  }, []);

  const handleFinishBatch = () => {
    if (capturedImages.length > 0) {
      onFinish(capturedImages);
    } else {
      onClose();
    }
  };

  const toggleFlash = () => {
      setFlashMode(!flashMode);
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        // Check if browser supports torch capability
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if ('torch' in capabilities) {
             track.applyConstraints({
                 advanced: [{ torch: !flashMode }] as any
             }).catch(e => console.log(e));
        }
      }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col font-sans">
      {/* Flash Overlay */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${flash ? 'opacity-100' : 'opacity-0'} z-20`}></div>

      {/* Top Bar */}
      <div className="relative z-10 flex justify-between items-center p-6 bg-gradient-to-b from-black/60 to-transparent text-white">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-transform">
          <X className="w-6 h-6" />
        </button>
        
        {/* Mode Selector */}
        <div className="flex bg-black/40 backdrop-blur-md rounded-full p-1 border border-white/10">
            <button 
                onClick={() => setScanMode('DOCUMENT')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${scanMode === 'DOCUMENT' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            >
                <FileText className="w-3 h-3" /> Doc
            </button>
            <button 
                onClick={() => setScanMode('ID_CARD')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${scanMode === 'ID_CARD' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            >
                <CreditCard className="w-3 h-3" /> ID Card
            </button>
        </div>

        <button onClick={toggleFlash} className={`p-2 rounded-full hover:bg-white/10 active:scale-95 transition-transform ${flashMode ? 'text-yellow-400' : 'text-white'}`}>
          <Zap className="w-6 h-6" />
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative overflow-hidden bg-zinc-900 flex items-center justify-center rounded-3xl mx-2 overflow-hidden mb-4 border border-zinc-800">
        {error ? (
          <div className="text-white text-center p-6">
            <p className="mb-4 text-red-400">{error}</p>
            <button onClick={startCamera} className="px-4 py-2 bg-zinc-800 rounded-full border border-zinc-700 flex items-center gap-2 mx-auto">
              <RotateCcw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Guides */}
        {!error && (
            <div className={`absolute border border-white/20 rounded-lg pointer-events-none transition-all duration-300 ${scanMode === 'ID_CARD' ? 'inset-x-12 h-64 border-brand-400/50 shadow-[0_0_0_999px_rgba(0,0,0,0.5)]' : 'inset-8'}`}>
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-brand-400 rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-brand-400 rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-brand-400 rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-brand-400 rounded-br-lg"></div>
              
              {scanMode === 'ID_CARD' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-white/60 text-xs font-medium uppercase tracking-widest bg-black/50 px-3 py-1 rounded">Place ID Here</p>
                  </div>
              )}
            </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 bg-black pt-4 pb-12 flex justify-between items-center px-10">
        
        {/* Thumbnail Preview */}
        <div className="w-14 h-14 relative flex items-center justify-center">
           {capturedImages.length > 0 ? (
               <button 
                onClick={handleFinishBatch}
                className="relative w-12 h-12 active:scale-95 transition-transform"
               >
                   <img 
                    src={capturedImages[capturedImages.length-1]} 
                    className="w-full h-full object-cover rounded-lg border-2 border-zinc-700"
                    alt="Last capture"
                   />
                   <div className="absolute -top-2 -right-2 bg-brand-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm">
                       {capturedImages.length}
                   </div>
               </button>
           ) : (
               <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                   <Layers className="w-5 h-5" />
               </div>
           )}
        </div>

        {/* Shutter Button */}
        <button 
           onClick={takePhoto}
           disabled={!!error}
           className={`w-20 h-20 rounded-full border-4 border-white/20 flex items-center justify-center active:scale-95 transition-transform ${!!error ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="w-16 h-16 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)]"></div>
        </button>

        {/* Done Button */}
         <button 
            onClick={handleFinishBatch}
            className={`w-14 h-14 flex items-center justify-center rounded-full transition-all active:scale-95 ${capturedImages.length > 0 ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-transparent text-transparent pointer-events-none'}`}
         >
             <Check className="w-6 h-6" />
         </button>
      </div>
    </div>
  );
};

export default CameraView;