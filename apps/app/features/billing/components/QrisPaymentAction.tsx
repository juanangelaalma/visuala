"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

type QrisPaymentActionProps = {
  value: string;
  expiresAt: string | null;
};

const MAX_QRIS_PAYLOAD_LENGTH = 1024;

export function isValidQrisPayload(value: string) {
  return value.length >= 12 && value.length <= MAX_QRIS_PAYLOAD_LENGTH && /^00020[01][0-9A-Z]+$/.test(value);
}

export function QrisPaymentAction({ value, expiresAt }: QrisPaymentActionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isValidQrisPayload(value)) {
      setError(true);
      return;
    }
    setError(false);
    QRCode.toCanvas(canvas, value, { width: 256, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).catch(() => setError(true));
  }, [value]);

  if (!value || error) return <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">QR code is unavailable. Refresh the payment status and try again.</p>;

  return (
    <section aria-labelledby="qris-heading" className="text-center">
      <h3 id="qris-heading" className="text-lg font-semibold text-white">Scan with QRIS</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-450">Open a supported banking or wallet app, then scan this code.</p>
      <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-4">
        <canvas ref={canvasRef} role="img" aria-label="QRIS payment QR code" className="h-auto max-w-full" />
      </div>
      {expiresAt ? <p className="sr-only">This QR code has an expiry time shown below.</p> : null}
    </section>
  );
}
