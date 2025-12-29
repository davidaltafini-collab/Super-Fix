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
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 } 
                    }, 
                    audio: false 
                });
                handleStreamSuccess(mediaStream);
            } catch (e) {
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
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
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
            {/* MODIFICARE CHEIE AICI: 
                h-[100dvh] asigură că pe mobil containerul se oprește deasupra barei de navigare a browserului.
                flex-col împarte spațiul corect.
            */}
            <div className="w-full h-[100dvh] md:max-w-2xl md:h-auto md:max-h-[90vh] md:border-4 md:border-white relative bg-black flex flex-col shadow-2xl md:rounded-lg overflow-hidden">
                
                {/* 1. Header Fix (shrink-0) */}
                <div className="bg-red-600 border-b-4 border-white shrink-0 relative z-20 flex justify-between items-center px-4 py-3">
                    <h3 className="text-white font-heading uppercase tracking-widest text-sm md:text-lg drop-shadow-md mx-auto">
                        {label}
                    </h3>
                    <button onClick={onClose} className="text-white font-bold text-xl hover:scale-110 px-2">X</button>
                </div>

                {/* 2. Zona de Mijloc (Flexibilă) */}
                <div className="flex-grow relative bg-black overflow-hidden w-full">
                    {!capturedImage ? (
                        // === MOD LIVE VIDEO ===
                        <>
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                            />
                            
                            {/* HUD Vizor */}
                            <div className="absolute inset-0 m-4 pointer-events-none opacity-60 z-10">
                                <div className="w-full h-full border-2 border-dashed border-gray-500/50 relative">
                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-400"></div>
                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-400"></div>
                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-400"></div>
                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-400"></div>
                                </div>
                            </div>

                            {/* Buton Captură (poziționat absolut jos, peste video) */}
                            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 pb-safe">
                                <button 
                                    onClick={capturePhoto} 
                                    className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                                >
                                    <div className="w-16 h-16 bg-red-600 rounded-full border-2 border-black"></div>
                                </button>
                            </div>
                        </>
                    ) : (
                        // === MOD PREVIEW IMAGINE ===
                        // Imaginea stă absolut în containerul flexibil, astfel nu împinge footer-ul
                        <div className="absolute inset-0 flex items-center justify-center bg-black">
                            <img 
                                src={capturedImage} 
                                alt="Preview" 
                                className="w-full h-full object-contain" 
                            />
                        </div>
                    )}
                </div>

                {/* 3. Footer Fix (shrink-0) - Doar când avem poză capturată */}
                {capturedImage && (
                    <div className="bg-white border-t-4 border-black shrink-0 p-4 pb-safe z-30 w-full">
                        <p className="text-center font-comic text-sm mb-3 font-bold text-gray-700">Este clară?</p>
                        <div className="flex gap-4 max-w-md mx-auto">
                            <button 
                                onClick={retakePhoto} 
                                className="flex-1 bg-yellow-400 text-black font-heading py-3 border-2 border-black shadow-[4px_4px_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase text-sm md:text-base"
                            >
                                🔄 REFĂ
                            </button>
                            <button 
                                onClick={confirmPhoto} 
                                className="flex-1 bg-green-500 text-white font-heading py-3 border-2 border-black shadow-[4px_4px_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase text-sm md:text-base"
                            >
                                ✅ TRIMITE
                            </button>
                        </div>
                    </div>
                )}
                
                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    );
};
