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
      QR.toDataURL(href, { margin: 1, width: 320, color: { dark: "#05070d", light: "#fbbf24" } }).then((data) => {
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
        className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 transition-colors hover:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
      >
        <span aria-hidden="true">📱 </span>On Your Phone
      </button>
      {open ? (
        <div className="absolute right-0 z-[1000] mt-2 w-64 rounded-2xl border border-amber-400/40 bg-slate-950 p-4 text-center shadow-2xl">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL generated in the browser
            <img src={qr} alt={`QR code for ${url}`} width={224} height={224} className="mx-auto rounded-lg" />
          ) : (
            <div className="mx-auto h-56 w-56 animate-pulse rounded-lg bg-white/5" />
          )}
          <p className="mt-3 text-sm font-semibold text-white">Scan to open Plan B</p>
          <p className="mt-1 break-words font-mono text-xs text-amber-300">{url}</p>
          <p className="mt-2 text-xs text-slate-400">See live traveller reports, and try your own journey.</p>
        </div>
      ) : null}
    </div>
  );
}
