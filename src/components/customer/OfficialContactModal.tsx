import React, { useState } from 'react';
import { X, Phone, MessageSquare, Download, Check, Copy, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { AppSettings } from '../../types';
import { downloadContactVCard } from '../../lib/vcard';
import { getWhatsAppUrl } from '../../lib/phone';

interface OfficialContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings;
}

export const OfficialContactModal: React.FC<OfficialContactModalProps> = ({
  isOpen,
  onClose,
  appSettings,
}) => {
  const [copied, setCopied] = useState(false);
  const [downloadedVCard, setDownloadedVCard] = useState(false);

  if (!isOpen) return null;

  const officialPhone = appSettings.official_whatsapp_number || '+265 99 374 1274';
  const officialName = appSettings.official_contact_name || 'Breezing Status HD';

  const handleCopy = () => {
    navigator.clipboard.writeText('0993741274');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadVCard = () => {
    const success = downloadContactVCard(officialName, officialPhone);
    if (success) {
      setDownloadedVCard(true);
      setTimeout(() => setDownloadedVCard(false), 3000);
    }
  };

  const waLink = getWhatsAppUrl(
    officialPhone,
    'Hello Breezing Status HD, I have a question regarding my WhatsApp status media.'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#25D366]/20 text-[#128C7E] dark:text-[#25D366] flex items-center justify-center font-bold">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Official WhatsApp Contact</h3>
              <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC]">HD Delivery & Support</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contact Info Card */}
        <div className="p-4 rounded-2xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] text-center space-y-2">
          <span className="text-[11px] font-semibold text-[#748078] dark:text-[#A7B8AC] uppercase tracking-wider block">
            {officialName}
          </span>
          <p className="font-mono text-xl font-extrabold text-[#19241E] dark:text-[#F2F6F2] tracking-wide">
            0993741274
          </p>
          <p className="font-mono text-xs text-[#748078] dark:text-[#A7B8AC]">
            ({officialPhone})
          </p>

          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-[#21A36B] hover:bg-[#21A36B]/10 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied Number' : 'Copy Number'}</span>
          </button>
        </div>

        {/* Explanation */}
        <div className="p-3 rounded-xl bg-[#21A36B]/10 border border-[#21A36B]/20 text-xs text-[#19241E] dark:text-[#F2F6F2] space-y-1">
          <p className="font-semibold flex items-center gap-1.5 text-[#173B2A] dark:text-[#58C994]">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Why Save This Number?</span>
          </p>
          <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
            WhatsApp delivers HD status broadcasts only if you have saved our number in your phone address book.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* 1. Save Contact vCard */}
          <button
            onClick={handleDownloadVCard}
            className="w-full py-3 px-4 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-98 transition-all"
          >
            {downloadedVCard ? <UserCheck className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>{downloadedVCard ? 'Contact File Saved (.vcf)' : 'Save Contact to Phone (.vcf)'}</span>
          </button>

          {/* 2. Chat on WhatsApp */}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 rounded-xl border border-[#25D366] bg-[#25D366]/10 text-[#128C7E] dark:text-[#25D366] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#25D366]/20 active:scale-98 transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat on WhatsApp Directly</span>
          </a>
        </div>
      </div>
    </div>
  );
};
