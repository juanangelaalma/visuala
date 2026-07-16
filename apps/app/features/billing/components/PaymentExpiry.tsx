"use client";

import { useEffect, useState } from "react";

type PaymentExpiryProps = { expiresAt: string };

function getRemaining(expiresAt: string) {
  const milliseconds = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours > 0 ? `${hours}h ` : ""}${minutes}m ${remainder}s`;
}

export function PaymentExpiry({ expiresAt }: PaymentExpiryProps) {
  const [remaining, setRemaining] = useState<string | null>(() => getRemaining(expiresAt));
  const date = new Date(expiresAt);
  const valid = Number.isFinite(date.getTime());

  useEffect(() => {
    const update = () => setRemaining(getRemaining(expiresAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!valid) return null;
  return (
    <p className="text-sm text-neutral-450">
      {remaining ? <>Expires in <span className="font-medium tabular-nums text-white">{remaining}</span></> : <span className="font-medium text-white">Payment code expired</span>}
      <span className="block text-xs">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date)}</span>
    </p>
  );
}
