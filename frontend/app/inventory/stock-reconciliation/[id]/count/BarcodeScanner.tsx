"use client";

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

interface BarcodeScannerProps {
  onScan:  (result: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null);
  const [error,     setError]     = useState('');
  const [scanning,  setScanning]  = useState(true);
  const [lastScan,  setLastScan]  = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;

    async function startScanner() {
      try {
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        // Get available cameras — prefer back camera on mobile
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCamera = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        ) ?? devices[devices.length - 1]; // last device is usually back camera

        if (!backCamera) {
          setError('No camera found on this device');
          return;
        }

        if (!videoRef.current) return;

        controls = await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current,
          (result, err) => {
            if (result) {
              const text = result.getText();
              // Debounce — avoid firing multiple times for same scan
              if (text === lastScan) return;
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                setLastScan(text);
                setScanning(false);
                onScan(text);
              }, 300);
            }
            // NotFoundException is expected when no barcode in frame — ignore
            if (err && !(err instanceof NotFoundException)) {
              console.warn('Scanner error:', err);
            }
          }
        );
      } catch (e: any) {
        if (e?.name === 'NotAllowedError') {
          setError('Camera permission denied. Allow camera access and try again.');
        } else if (e?.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError(`Camera error: ${e?.message ?? 'Unknown error'}`);
        }
      }
    }

    startScanner();

    return () => {
      controls?.stop();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);  // eslint-disable-line

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes scan-line {
          0%   { top: 10%; }
          100% { top: 85%; }
        }
      `}</style>

      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #e2dfd8)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Scan Item Barcode
        </div>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: 'white', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Cancel
        </button>
      </div>

      {/* Camera view */}
      {!error ? (
        <div style={{ position: 'relative', width: '100%', maxWidth: 360, aspectRatio: '1', overflow: 'hidden', borderRadius: 16 }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }}
            autoPlay
            muted
            playsInline
          />

          {/* Scanning overlay — corner brackets */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '70%', height: '70%' }}>
              {/* Corners */}
              {[
                { top: 0, left: 0, borderTop: '3px solid var(--accent-strong, #fb923c)', borderLeft: '3px solid var(--accent-strong, #fb923c)', borderRadius: '8px 0 0 0' },
                { top: 0, right: 0, borderTop: '3px solid var(--accent-strong, #fb923c)', borderRight: '3px solid var(--accent-strong, #fb923c)', borderRadius: '0 8px 0 0' },
                { bottom: 0, left: 0, borderBottom: '3px solid var(--accent-strong, #fb923c)', borderLeft: '3px solid var(--accent-strong, #fb923c)', borderRadius: '0 0 0 8px' },
                { bottom: 0, right: 0, borderBottom: '3px solid var(--accent-strong, #fb923c)', borderRight: '3px solid var(--accent-strong, #fb923c)', borderRadius: '0 0 8px 0' },
              ].map((style, i) => (
                <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...style }} />
              ))}

              {/* Scanning line animation */}
              {scanning && (
                <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent-strong, #fb923c), transparent)', animation: 'scan-line 1.5s ease-in-out infinite alternate', boxShadow: '0 0 8px var(--accent-strong, #fb923c)' }} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px 24px', maxWidth: 320, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📷</div>
          <div style={{ fontSize: 14, color: 'var(--danger-subtle, #fca5a5)', fontFamily: "'IBM Plex Sans',sans-serif", lineHeight: 1.5 }}>{error}</div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: 24, textAlign: 'center', padding: '0 32px' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'IBM Plex Sans',sans-serif", lineHeight: 1.6 }}>
          Point camera at item barcode, internal code, or supplier code
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8, fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Supports CODE128, EAN-13, QR, and more
        </div>
      </div>
    </div>
  );
}