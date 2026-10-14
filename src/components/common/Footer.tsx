import React, { useState } from 'react';
import { ShieldCheck, Clock, MessageSquare, X } from 'lucide-react';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface FooterProps {
  onOpenAdmin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAdmin }) => {
  const [modalContent, setModalContent] = useState<'privacy' | 'terms' | 'delivery' | null>(null);

  return (
    <footer className="mt-auto border-t border-[#E4EAE5] dark:border-[#334539] py-8 px-4 text-xs text-[#748078] dark:text-[#A7B8AC] transition-colors pb-8">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand and Copyright */}
        <div className="flex flex-col items-center sm:items-start gap-1">
          <p className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">
            breezing status HD
          </p>
          <p className="text-[11px]">
            High-Definition WhatsApp Status Media Preparation. Built for Malawi & worldwide.
          </p>
        </div>

        {/* Quiet Links */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium">
          <div className="footer-install"><PWAInstallButton /></div>
          <button
            onClick={() => setModalContent('delivery')}
            className="hover:text-[#173B2A] dark:hover:text-[#58C994] transition-colors"
          >
            Delivery
          </button>
          <span aria-hidden="true">·</span>
          <button
            onClick={() => setModalContent('privacy')}
            className="hover:text-[#173B2A] dark:hover:text-[#58C994] transition-colors"
          >
            Privacy & 24h Purge
          </button>
          <span aria-hidden="true">·</span>
          <button
            onClick={() => setModalContent('terms')}
            className="hover:text-[#173B2A] dark:hover:text-[#58C994] transition-colors"
          >
            Terms & Policy
          </button>
        </div>
      </div>

      {/* Info Modals */}
      {modalContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                {modalContent === 'delivery' && <MessageSquare className="w-4 h-4 text-[#21A36B]" />}
                {modalContent === 'privacy' && <Clock className="w-4 h-4 text-[#21A36B]" />}
                {modalContent === 'terms' && <ShieldCheck className="w-4 h-4 text-[#21A36B]" />}
                {modalContent === 'delivery' && 'WhatsApp HD Delivery'}
                {modalContent === 'privacy' && 'Privacy & 24-Hour Media Policy'}
                {modalContent === 'terms' && 'Terms of Service & Usage'}
              </h3>
              <button
                onClick={() => setModalContent(null)}
                className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-[#748078] dark:text-[#A7B8AC] max-h-80 overflow-y-auto pr-1">
              {modalContent === 'delivery' && (
                <>
                  <p>
                    <strong>How Delivery Works:</strong> When you submit photos or videos, they are prepared in uncompressed, high-definition status dimensions.
                  </p>
                  <p>
                    Your prepared media arrives directly in your WhatsApp chat in crisp HD quality ready to post to your WhatsApp Status.
                  </p>
                  <p className="bg-[#F1F5F1] dark:bg-[#25332A] p-2.5 rounded-xl text-[#173B2A] dark:text-[#58C994]">
                    Estimated turnaround: Usually ready in 5–10 minutes. Please allow up to 1 hour during peak times.
                  </p>
                </>
              )}

              {modalContent === 'privacy' && (
                <>
                  <p>
                    <strong>Strict 24-Hour Automatic Retention:</strong> All photographs and videos uploaded to breezing status HD are stored temporarily.
                  </p>
                  <p>
                    Every media file is scheduled for automated permanent deletion exactly <strong>24 hours</strong> after upload.
                  </p>
                  <p>
                    We never share, sell, or retain your private photographs or videos after this 24-hour delivery window.
                  </p>
                  <p>
                    Only minimal aggregated monthly counts are retained to track your monthly subscription limits.
                  </p>
                </>
              )}

              {modalContent === 'terms' && (
                <>
                  <p>
                    <strong>Acceptable Use:</strong> breezing status HD is intended for personal and business status media preparation. You must hold rights to all submitted images and videos.
                  </p>
                  <p>
                    <strong>Subscriptions:</strong> Upgrades and manual payments (Airtel Money, TNM Mpamba, Bank Transfer) are verified and activated upon receipt.
                  </p>
                </>
              )}
            </div>

            <button
              onClick={() => setModalContent(null)}
              className="mt-5 w-full rounded-xl bg-[#F1F5F1] dark:bg-[#25332A] text-[#19241E] dark:text-[#F2F6F2] py-2.5 text-xs font-semibold hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </footer>
  );
};
