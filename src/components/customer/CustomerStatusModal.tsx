import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  MessageSquare,
  Download,
  Check,
} from 'lucide-react';
import { UploadRequest, AppSettings } from '../../types';
import { downloadContactVCard } from '../../lib/vcard';
import { getWhatsAppUrl } from '../../lib/phone';

interface CustomerStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: UploadRequest | null;
  appSettings: AppSettings;
}

export const CustomerStatusModal: React.FC<CustomerStatusModalProps> = ({
  isOpen,
  onClose,
  request,
  appSettings,
}) => {
  const [savedVCard, setSavedVCard] = useState(false);

  if (!isOpen || !request) return null;

  const isSent = request.status === 'sent';
  const officialPhone = appSettings.official_whatsapp_number || '+265 99 374 1274';
  const officialName = appSettings.official_contact_name || 'Breezing Status HD';

  const handleSaveContact = () => {
    const success = downloadContactVCard(officialName, officialPhone);
    if (success) {
      setSavedVCard(true);
      setTimeout(() => setSavedVCard(false), 3000);
    }
  };

  const waSupportLink = getWhatsAppUrl(
    officialPhone,
    `Hello, regarding request #${request.request_code} (${request.media_count} ${request.media_type}${request.media_count > 1 ? 's' : ''}):`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2] space-y-4">
        {/* Top Header with Request Code */}
        <div className="flex items-center justify-between pb-2 border-b border-[#E4EAE5] dark:border-[#334539]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-[#21A36B]">
              #{request.request_code}
            </span>
            <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC]">
              · {request.media_count} {request.media_type}{request.media_count > 1 ? 's' : ''}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Status Card */}
        <div className="text-center space-y-2">
          {isSent ? (
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-[#21A36B]/15 text-[#21A36B] mx-auto flex items-center justify-center shadow-inner">
              <Clock className="w-7 h-7" />
            </div>
          )}

          <div>
            <span
              className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                isSent
                  ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                  : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
              }`}
            >
              {isSent ? 'Sent' : 'Processing — Awaiting Delivery'}
            </span>

            <h3 className="text-base font-extrabold text-[#19241E] dark:text-[#F2F6F2]">
              {isSent ? 'Sent' : 'Processing — Awaiting Delivery'}
            </h3>

            <p className="mt-1 text-xs text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
              {isSent
                ? `Your HD media has been sent! Check your WhatsApp chat at ${request.customer_phone} to view and post.`
                : 'Sharpening, watermarking, optimization, and verification are complete. Awaiting administrator delivery to your WhatsApp chat.'}
            </p>
          </div>
        </div>

        {/* Preparation Stages — Completed & Awaiting Delivery */}
        <div className="p-3.5 rounded-2xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#748078] dark:text-[#A7B8AC]">
              Preparation Stages
            </span>
            <span className="text-[10px] font-semibold text-[#21A36B] flex items-center gap-1">
              <span>HD Engine</span>
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#21A36B] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                ✓
              </div>
              <span className="font-medium text-[#19241E] dark:text-[#F2F6F2]">
                Files Verified & Checked
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#21A36B] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                ✓
              </div>
              <span className="font-medium text-[#19241E] dark:text-[#F2F6F2]">
                HD Sharpening & Watermarking
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#21A36B] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                ✓
              </div>
              <span className="font-medium text-[#19241E] dark:text-[#F2F6F2]">
                Status Media Optimized & Uploaded
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  isSent
                    ? 'bg-blue-600 text-white'
                    : 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                }`}
              >
                {isSent ? '✓' : '•'}
              </div>
              <span
                className={
                  isSent
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : 'font-semibold text-[#19241E] dark:text-[#F2F6F2]'
                }
              >
                {isSent ? 'Delivered via WhatsApp' : 'Awaiting Administrator Delivery'}
              </span>
            </div>
          </div>
        </div>

        {/* Sender & Delivery Target Details */}
        <div className="p-3 rounded-2xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[#748078] dark:text-[#A7B8AC]">Sender Contact:</span>
            <span className="font-mono font-bold">
              0993741274{' '}
              <span className="text-[10px] text-[#748078] dark:text-[#A7B8AC] font-normal">
                ({officialPhone})
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#748078] dark:text-[#A7B8AC]">Delivery Target:</span>
            <span className="font-mono font-bold text-[#21A36B]">{request.customer_phone}</span>
          </div>

          <div className="pt-1 flex gap-2">
            <button
              onClick={handleSaveContact}
              className="flex-1 py-1.5 rounded-lg border border-[#E4EAE5] dark:border-[#334539] text-[11px] font-semibold text-[#173B2A] dark:text-[#58C994] hover:bg-white dark:hover:bg-[#1A241E] flex items-center justify-center gap-1 transition-colors"
            >
              {savedVCard ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              <span>{savedVCard ? 'Saved .vcf' : 'Save Contact'}</span>
            </button>

            <a
              href={waSupportLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 rounded-lg bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366] text-[11px] font-bold hover:bg-[#25D366]/25 flex items-center justify-center gap-1 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Support Chat</span>
            </a>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-bold hover:opacity-95 transition-opacity"
        >
          Close
        </button>
      </div>
    </div>
  );
};
