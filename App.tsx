
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { AppStatus, TranslationHistoryItem } from './types';
import { MODEL_NAME, SYSTEM_PROMPT, FRAME_CAPTURE_INTERVAL, APP_TITLE, APP_SUBTITLE } from './constants';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [lastTranslation, setLastTranslation] = useState<string>('');
  const [isTTSEnabled, setIsTTSEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Initialize AI client
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const startCamera = async () => {
    try {
      setStatus(AppStatus.INITIALIZING);
      setError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser does not support camera access.");
      }

      let stream: MediaStream;
      
      try {
        // Attempt with high-quality constraints first
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 }, 
            facingMode: 'user' 
          },
          audio: false,
        });
      } catch (err) {
        console.warn("Preferred camera constraints failed, falling back to basic video.", err);
        // Fallback to basic video access if specific constraints fail
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Ensure video metadata is loaded before starting recognition
        videoRef.current.onloadedmetadata = () => {
          setStatus(AppStatus.RECOGNIZING);
        };
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      let errorMessage = "Unable to access camera.";
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = "No camera found on this device. Please connect a webcam.";
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = "Camera permission denied. Please allow access in your browser settings.";
      } else {
        errorMessage = err.message || "An error occurred while accessing the camera.";
      }
      setError(errorMessage);
      setStatus(AppStatus.ERROR);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus(AppStatus.IDLE);
    setError(null);
  };

  const speak = (text: string) => {
    if (!isTTSEnabled || !text || text.includes('[No gesture detected]')) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || status !== AppStatus.RECOGNIZING) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Check if video is actually playing and has dimensions
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Draw frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            parts: [
              { text: "What sign language gesture is shown in this image?" },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image,
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
      });

      const text = response.text || '';
      const cleanText = text.trim();

      if (cleanText && cleanText !== lastTranslation) {
        setLastTranslation(cleanText);
        if (cleanText !== '[No gesture detected]') {
          const newItem: TranslationHistoryItem = {
            id: Math.random().toString(36).substr(2, 9),
            originalGesture: 'Detected',
            translation: cleanText,
            timestamp: new Date(),
          };
          setHistory(prev => [newItem, ...prev].slice(0, 50));
          speak(cleanText);
        }
      }
    } catch (err) {
      console.error("AI processing error:", err);
    }
  }, [status, lastTranslation, isTTSEnabled, ai.models]);

  useEffect(() => {
    if (status === AppStatus.RECOGNIZING) {
      intervalRef.current = window.setInterval(processFrame, FRAME_CAPTURE_INTERVAL);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, processFrame]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 flex justify-between items-center bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-violet-500 bg-clip-text text-transparent">
            {APP_TITLE}
          </h1>
          <p className="text-slate-400 text-sm">{APP_SUBTITLE}</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setIsTTSEnabled(!isTTSEnabled)}
            className={`p-3 rounded-full transition-all ${isTTSEnabled ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
            title={isTTSEnabled ? "Speech Enabled" : "Speech Disabled"}
          >
            <i className={`fas ${isTTSEnabled ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
          </button>
          {status === AppStatus.IDLE || status === AppStatus.ERROR ? (
            <button
              onClick={startCamera}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
            >
              Start Session
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors"
            >
              End Session
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
        {/* Main Viewport */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="gradient-border flex-1 flex flex-col min-h-[400px]">
            <div className="gradient-content flex-1 overflow-hidden relative flex items-center justify-center">
              {status === AppStatus.IDLE && !error && (
                <div className="text-center p-8">
                  <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                    <i className="fas fa-video-slash text-3xl text-slate-500"></i>
                  </div>
                  <p className="text-slate-400">Camera is offline. Start session to begin translation.</p>
                </div>
              )}
              
              {status === AppStatus.INITIALIZING && (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-slate-400">Initializing camera...</p>
                </div>
              )}

              {error && (
                <div className="text-center p-8 max-w-sm">
                  <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-exclamation-triangle text-2xl"></i>
                  </div>
                  <p className="text-red-400 font-medium mb-4">{error}</p>
                  <button 
                    onClick={startCamera}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-500 ${status === AppStatus.RECOGNIZING ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}`}
              />
              
              <canvas ref={canvasRef} className="hidden" />

              {status === AppStatus.RECOGNIZING && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
                  <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center shadow-2xl">
                    <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold mb-2">Detected Phrase</p>
                    <h2 className="text-4xl font-bold text-white mb-1">
                      {lastTranslation === '[No gesture detected]' ? '...' : lastTranslation || 'Waiting for gesture'}
                    </h2>
                    <div className="flex justify-center items-center gap-2 mt-2">
                      <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                      <span className="text-xs text-slate-400">Analyzing live feed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar History */}
        <div className="flex flex-col gap-4 max-h-[calc(100vh-12rem)]">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <i className="fas fa-history text-blue-400"></i> History
              </h3>
              <button 
                onClick={() => setHistory([])}
                className="text-xs text-slate-500 hover:text-white transition-colors"
              >
                Clear All
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center py-12 opacity-30">
                  <i className="fas fa-keyboard text-4xl mb-3"></i>
                  <p>No translations yet</p>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="bg-slate-900/60 p-4 rounded-lg border border-slate-700 group hover:border-blue-500/30 transition-all">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xl font-medium text-white">{item.translation}</span>
                      <span className="text-[10px] text-slate-500">{item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => speak(item.translation)}
                        className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                      >
                        <i className="fas fa-play-circle"></i> Repeat
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <i className="fas fa-info-circle text-violet-400"></i> Tips
            </h4>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex gap-2">
                <span className="text-violet-400">•</span>
                Ensure good lighting on your hands for better recognition.
              </li>
              <li className="flex gap-2">
                <span className="text-violet-400">•</span>
                Keep your hand within the camera frame.
              </li>
              <li className="flex gap-2">
                <span className="text-violet-400">•</span>
                The system analyzes your gestures every {FRAME_CAPTURE_INTERVAL/1000} seconds.
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="p-4 text-center text-slate-600 text-xs border-t border-slate-800 bg-slate-900">
        &copy; {new Date().getFullYear()} Manovox AI Interpreter. Powered by Gemini.
      </footer>
    </div>
  );
};

export default App;
