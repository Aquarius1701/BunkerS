import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, AlertCircle, HardHat, RefreshCw, MessageSquare } from 'lucide-react';
import { encodeProtobufPacket, decodeProtobufPacket, validateAndSanitizeInput } from '../lib/protobufCodec';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({ isOpen, onClose }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ulanmoqda...');
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<{ sender: 'user' | 'assistant'; text: string }[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    if (isOpen) {
      startLiveSession();
    } else {
      cleanupAudio();
    }

    return () => {
      cleanupAudio();
    };
  }, [isOpen]);

  const cleanupAudio = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    // Stop active audio playbacks
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    activeSourcesRef.current = [];

    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
    setIsSpeaking(false);
  };

  const startLiveSession = async () => {
    setError(null);
    setStatusMessage('BunkerStroy Gemini 3.8 Live serveriga ulanmoqda...');
    setTranscripts([
      {
        sender: 'assistant',
        text: "Assalomu alaykum! Men BunkerStroy ovozli yordamchisiman. Qurilish mollari, yuk logistikasi yoki ulgurji ta'minot bo'yicha qanday yordam bera olaman?",
      },
    ]);

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      // Audio contexts setup
      // Model output audio is 24kHz PCM
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });

      // Mic input audio is 16kHz PCM
      inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      ws.onopen = () => {
        setIsConnected(true);
        setStatusMessage("Ulandi! Mikrofonni yoqib savolingizni bering.");
        startMicCapture();
      };

      ws.onmessage = async (event) => {
        try {
          let bytes: Uint8Array;
          if (event.data instanceof ArrayBuffer) {
            bytes = new Uint8Array(event.data);
          } else if (event.data instanceof Blob) {
            bytes = new Uint8Array(await event.data.arrayBuffer());
          } else {
            bytes = new TextEncoder().encode(String(event.data));
          }
          const decoded = decodeProtobufPacket<any>(bytes);
          const validated = validateAndSanitizeInput(decoded.data);
          const msg = validated.valid ? validated.sanitized : decoded.data;
          if (msg.type === 'audio' && msg.audio) {
            playAudioChunk(msg.audio);
          } else if (msg.type === 'text' && msg.text) {
            setTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.sender === 'assistant') {
                return [...prev.slice(0, -1), { sender: 'assistant', text: last.text + ' ' + msg.text }];
              }
              return [...prev, { sender: 'assistant', text: msg.text }];
            });
          } else if (msg.type === 'interrupted') {
            // Stop playback on interruption
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {}
            });
            activeSourcesRef.current = [];
            setIsSpeaking(false);
          } else if (msg.type === 'error') {
            setError(msg.error);
          }
        } catch (e) {
          console.error('Error handling Protobuf WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('Live WebSocket error:', err);
        setError("Ovozli serverga ulanishda xatolik. Iltimos qayta urinib ko'ring.");
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsRecording(false);
        setStatusMessage('Sessiya yakunlandi.');
      };
    } catch (err: any) {
      console.error('Failed to init live audio:', err);
      setError(err?.message || "Mikrofon yoki ovoz serveriga ulanish imkoni bo'lmadi.");
    }
  };

  const startMicCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioCtx = inputAudioCtxRef.current;
      if (!audioCtx) return;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      // ScriptProcessorNode for streaming PCM
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to 16-bit PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert Int16Array to base64
        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Audio = btoa(binary);

        wsRef.current.send(
          encodeProtobufPacket({
            audio: base64Audio,
          })
        );
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsRecording(true);
      setStatusMessage('BunkerStroy sizni eshitmoqda... Gapiring!');
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setError("Mikrofon ruxsati berilmadi. Ovozli suhbat uchun brauzerda mikrofonni yoqing.");
      setIsRecording(false);
    }
  };

  const playAudioChunk = (base64Data: string) => {
    const audioCtx = outputAudioCtxRef.current;
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    try {
      setIsSpeaking(true);
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert 16-bit PCM little endian to Float32
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      const currentTime = audioCtx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsSpeaking(false);
        }
      };
    } catch (e) {
      console.error('Audio chunk decoding error:', e);
    }
  };

  const sendTextQuestion = (q: string) => {
    const check = validateAndSanitizeInput(q);
    if (!check.valid) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setTranscripts((prev) => [...prev, { sender: 'user', text: check.sanitized }]);
      wsRef.current.send(encodeProtobufPacket({ text: check.sanitized }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-purple-500/40 rounded-3xl max-w-xl w-full p-6 sm:p-8 flex flex-col shadow-2xl relative overflow-hidden space-y-6">
        
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Gemini 3.8 Live <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">Ovozli Maslahatchi</span>
              </h2>
              <p className="text-xs text-slate-400">BunkerStroy qurilish va logistika bo‘yicha jonli ovozli suhbat</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Central Audio Wave & Status */}
        <div className="flex flex-col items-center justify-center py-6 space-y-5 relative z-10">
          
          <div className="relative flex items-center justify-center">
            {/* Outer animated rings */}
            {isRecording && (
              <>
                <span className="animate-ping absolute inline-flex h-32 w-32 rounded-full bg-purple-500/20"></span>
                <span className="animate-pulse absolute inline-flex h-24 w-24 rounded-full bg-indigo-500/30"></span>
              </>
            )}

            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                isSpeaking
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 scale-110 shadow-emerald-500/40'
                  : isRecording
                  ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isSpeaking ? (
                <Volume2 className="w-9 h-9 animate-bounce" />
              ) : isRecording ? (
                <Mic className="w-9 h-9 animate-pulse" />
              ) : (
                <MicOff className="w-9 h-9" />
              )}
            </div>
          </div>

          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-white flex items-center justify-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-pulse' : isConnected ? 'bg-purple-400 animate-ping' : 'bg-red-400'}`}></span>
              {isSpeaking ? 'BunkerStroy gapirmoqda...' : statusMessage}
            </div>
            <p className="text-xs text-slate-400">
              O'zbek yoki rus tilida bemalol savol bering. Savolingiz real vaqtda ovoz orqali tahlil qilinadi.
            </p>
          </div>
        </div>

        {/* Conversation transcript */}
        <div className="max-h-48 overflow-y-auto space-y-2.5 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs">
          {transcripts.map((t, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-xl ${
                t.sender === 'assistant'
                  ? 'bg-purple-950/40 border border-purple-500/20 text-purple-200'
                  : 'bg-slate-800 text-slate-200 ml-6 text-right'
              }`}
            >
              <span className="font-bold text-[10px] block opacity-75 mb-0.5">
                {t.sender === 'assistant' ? 'BUNKERSTROY AI' : 'SIZ'}
              </span>
              <p className="leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>

        {/* Quick Question Prompts */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400">Tezkor savol berish:</span>
          <div className="flex flex-wrap gap-2">
            {[
              "Qizilqumsement M500 narxi qancha?",
              "Samosvalda 20 tonna qum tashish narxi?",
              "Gazoblok va armatura yetkazish muddati?",
            ].map((q, idx) => (
              <button
                key={idx}
                onClick={() => sendTextQuestion(q)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-purple-900/40 border border-slate-700 hover:border-purple-500/40 text-slate-300 hover:text-purple-200 text-[11px] transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer controls */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <button
            onClick={() => {
              cleanupAudio();
              startLiveSession();
            }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-slate-800/80 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Qayta ulash
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
};
