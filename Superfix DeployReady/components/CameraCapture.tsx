import React, { useRef, useState, useEffect } from 'react';

interface CameraCaptureProps {
    onCapture: (base64Image: string) => void;
    onClose: () => void;
    label?: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, label = "Fă o poză" }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        startCamera();
        return () => { stopCamera(); };
    }, []);

    const startCamera = async () => {
        setError('');
        setCapturedImage(null);
        
        try {
            // 1. Încercăm camera principală (spate) - ideal pentru mobil
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: { ideal: 'environment' },
                        // Cerem o rezoluție ideală standard
                        width: { ideal: 1920 },
                        height: { ideal: 1080 } 
                    }, 
                    audio: false 
                });
                handleStreamSuccess(mediaStream);
            } catch (e) {
                // 2. Fallback: Webcam generic (laptop)
                console.log("Environment camera not found, trying generic...");
                const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: false 
                });
                handleStreamSuccess(mediaStream);
            }
        } catch (err) {
            console.error("Camera Error:", err);
            setError("Nu am putut accesa camera. Te rugăm să verifici permisiunile browserului.");
        }
    };

    const handleStreamSuccess = (mediaStream: MediaStream) => {
        setStream(mediaStream);
        if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            // Setăm rezoluția canvas-ului la rezoluția reală a video-ului
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const context = canvas.getContext('2d');
            if (context) {
                // Desenăm exact ce vede camera (fără crop)
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Convertim în imagine base64 (JPEG calitate 0.9)
                const base64 = canvas.toDataURL('image/jpeg', 0.9);
                setCapturedImage(base64);
                stopCamera(); 
            }
        }
    };

    const confirmPhoto = () => {
        if (capturedImage) {
            onCapture(capturedImage);
            onClose(); 
        }
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        startCamera();
    };

    if (error) {
        return (
            <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center p-4">
                <div className="bg-white p-6 border-4 border-red-600 text-center shadow-[8px_8px_0_#000]">
                    <h3 className="font-heading text-xl text-red-600 mb-2">EROARE</h3>
                    <p className="font-comic mb-4">{error}</p>
                    <button onClick={onClose} className="bg-black text-white font-bold px-6 py-2 border-2 border-white">
                        ÎNCHIDE
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center">
            <div className="w-full h-full md:max-w-2xl md:h-auto md:border-4 md:border-white relative bg-black flex flex-col shadow-2xl">
                
                {/* Header */}
                <div className="bg-red-600 border-b-4 border-white shrink-0 relative z-10 flex justify-between items-center px-4 py-2">
                    <h3 className="text-white font-heading uppercase tracking-widest text-sm md:text-lg drop-shadow-md mx-auto">
                        {label}
                    </h3>
                    <button onClick={onClose} className="text-white font-bold text-xl hover:scale-110 px-2">X</button>
                </div>

                {!capturedImage ? (
                    // === MOD LIVE VIDEO (VIZOR) ===
                    <div className="flex-grow relative bg-black overflow-hidden flex items-center justify-center">
                        {/* FIX: object-contain asigură că vezi TOATĂ imaginea, fără zoom/crop */}
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="absolute inset-0 w-full h-full object-contain"
                        />
                        
                        {/* HUD Vizor (Colțuri) - Ajustat să fie peste video */}
                        <div className="absolute inset-0 m-4 pointer-events-none opacity-60">
                            <div className="w-full h-full border-2 border-dashed border-gray-500/50 relative">
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-400"></div>
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-400"></div>
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-400"></div>
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-400"></div>
                            </div>
                        </div>

                        {/* Buton Captură */}
                        <div className="absolute bottom-8 left-0 right-0 flex justify-center pb-safe z-20">
                            <button 
                                onClick={capturePhoto} 
                                className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-90 transition-transform duration-150 hover:bg-gray-100"
                            >
                                <div className="w-16 h-16 bg-red-600 rounded-full border-2 border-black"></div>
                            </button>
                        </div>
                    </div>
                ) : (
                    // === MOD PREVIEW IMAGINE ===
                    <div className="flex-grow flex flex-col bg-black h-full">
                        <div className="flex-grow relative w-full bg-black flex items-center justify-center overflow-hidden">
                            <img src={capturedImage} alt="Preview" className="max-w-full max-h-full object-contain" />
                        </div>
                        
                        {/* Controale Confirmare */}
                        <div className="p-4 bg-white border-t-4 border-black shrink-0 pb-safe">
                            <p className="text-center font-comic text-sm mb-3 font-bold text-gray-700">Imaginea este clară?</p>
                            <div className="flex gap-4">
                                <button 
                                    onClick={retakePhoto} 
                                    className="flex-1 bg-yellow-400 text-black font-heading py-3 border-2 border-black shadow-[2px_2px_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase"
                                >
                                    🔄 REFĂ
                                </button>
                                <button 
                                    onClick={confirmPhoto} 
                                    className="flex-1 bg-green-500 text-white font-heading py-3 border-2 border-black shadow-[2px_2px_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase animate-pulse"
                                >
                                    ✅ TRIMITE
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Canvas ascuns */}
                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    );
};