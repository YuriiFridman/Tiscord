import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  sharerName: string;
  onClose: () => void;
}

export default function ScreenShareViewer({ stream, sharerName, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      <div className="flex items-center justify-between w-full max-w-5xl px-4 py-2">
        <span className="text-sm font-medium" style={{ color: '#fff' }}>
          🖥️ {sharerName} is sharing their screen
        </span>
        <button onClick={onClose} style={{ color: '#fff' }}>✕ Stop viewing</button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, background: '#000' }}
      />
    </div>
  );
}
