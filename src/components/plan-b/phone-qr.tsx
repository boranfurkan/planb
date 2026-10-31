"use client";
// "Open on your phone": a QR code for this page, so the audience can see live traveller reports and try Plan B.
import { useEffect, useState } from "react";

export function PhoneQr() {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open || qr) return;
    const href = window.location.origin;
    // Loaded only when opened: the QR library stays out of the first page load.
    void import("qrcode").then((QR) =>
      QR.toDataURL(href, { margin: 1, width: 320, color: { dark: "#0a0a0c", light: "#f2c27b" } }).then((data) => {
        setUrl(href.replace(/^https?:\/\//, ""));
        setQr(data);
      }),
    );
  }, [open, qr]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full px-1 text-[12.5px] text-[#8a8d95] transition-colors hover:text-[#ededf0] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none"
      >
        On your phone
      </button>
      {open ? (
        <div className="absolute right-0 z-[1000] mt-3 w-64 rounded-3xl border border-white/[0.08] bg-[rgba(14,14,17,0.92)] p-4 text-center shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] backdrop-blur-[28px]">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL generated in the browser
            <img src={qr} alt={`QR code for ${url}`} width={224} height={224} className="mx-auto rounded-lg" />
          ) : (
            <div className="mx-auto h-56 w-56 animate-pulse rounded-lg bg-white/5" />
          )}
          <p className="mt-3 text-sm font-semibold text-white">Scan to open Plan B</p>
          <p className="mt-1 break-words font-mono text-xs text-[#f2c27b]">{url}</p>
          <p className="mt-2 text-xs text-slate-400">See live traveller reports, and try your own journey.</p>
        </div>
      ) : null}
    </div>
  );
}
