import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Suppress button if already running as an installed PWA
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow with native install prompt
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-[#21A36B] hover:bg-[#1b8858] text-white px-3.5 py-2 text-xs font-semibold shadow-sm transition-all active:scale-95"
        title="Install app on your device"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (no beforeinstallprompt event supported by Apple WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-[#19241E] dark:text-[#F2F6F2] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] px-3.5 py-2 text-xs font-medium transition-all"
        >
          <Download className="w-3.5 h-3.5 text-[#21A36B]" />
          <span>Install on iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2]">
              <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
                <h3 className="text-base font-semibold">Install breezing status HD</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3.5 text-xs text-[#748078] dark:text-[#A7B8AC]">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#F1F5F1] dark:bg-[#25332A] text-[#173B2A] dark:text-[#58C994]">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">1. Tap Share</span>
                    <p className="mt-0.5">Tap the Share icon located at the bottom of Safari.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#F1F5F1] dark:bg-[#25332A] text-[#173B2A] dark:text-[#58C994]">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">2. Add to Home Screen</span>
                    <p className="mt-0.5">Scroll down in the share sheet and choose "Add to Home Screen".</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-[#173B2A] dark:bg-[#58C994] py-2.5 text-xs font-semibold text-white dark:text-[#101713] transition-all hover:opacity-95"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
