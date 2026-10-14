import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Video,
  X,
  CheckCircle2,
  Clock,
  AlertCircle,
  Lock,
  ArrowRight,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react';
import { SubmitMediaIcon } from '../common/CustomIcons';
import {
  UserProfile,
  SubscriptionPackage,
  UsageQuota,
  WatermarkSettings,
  UploadRequest,
  MediaAsset,
  AppSettings,
} from '../../types';
import { processStatusPhotograph, inspectVideoFile } from '../../lib/mediaProcessor';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { createUploadRequest, reserveMediaQuota, releaseMediaQuota } from '../../lib/supabase';
import { downloadContactVCard } from '../../lib/vcard';
import { ProcessingAnimation, ProcessingStage } from './ProcessingAnimation';

interface UploadSectionProps {
  user: UserProfile | null;
  currentPackage: SubscriptionPackage;
  quota: UsageQuota;
  watermarkSettings: WatermarkSettings;
  appSettings: AppSettings;
  onOpenAuth: () => void;
  onOpenUpgrade: () => void;
  onRequestCreated: (request: UploadRequest) => void;
  onViewRequestStatus: (request: UploadRequest) => void;
}

interface LocalFileItem {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video';
  duration?: number;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  user,
  currentPackage,
  quota,
  watermarkSettings,
  appSettings,
  onOpenAuth,
  onOpenUpgrade,
  onRequestCreated,
  onViewRequestStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const [selectedFiles, setSelectedFiles] = useState<LocalFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>(1);
  const [processingPercent, setProcessingPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<UploadRequest | null>(null);
  const [copiedContact, setCopiedContact] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allowance calculations
  const picsAllowed = currentPackage.monthly_pictures;
  const picsUsed = quota.pictures_used;
  const picsRemaining = Math.max(0, picsAllowed - picsUsed);

  const vidsAllowed = currentPackage.monthly_videos;
  const vidsUsed = quota.videos_used;
  const vidsRemaining = Math.max(0, vidsAllowed - vidsUsed);

  const isVideoExhausted = vidsRemaining <= 0;
  const isPicsExhausted = picsRemaining <= 0;

  const officialNumber = appSettings.official_whatsapp_number || '+265 99 374 1274';
  const officialName = appSettings.official_contact_name || 'Breezing Status HD';

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: LocalFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (activeTab === 'image') {
        if (!file.type.startsWith('image/')) {
          setErrorMessage('Please choose valid photograph files (JPEG, PNG, WebP).');
          continue;
        }

        if (selectedFiles.length + newItems.length >= picsRemaining) {
          setErrorMessage(`You have ${picsRemaining} photo upload slots remaining this month.`);
          break;
        }

        const previewUrl = URL.createObjectURL(file);
        newItems.push({
          id: `img-${Date.now()}-${i}`,
          file,
          previewUrl,
          type: 'image',
        });
      } else {
        if (!file.type.startsWith('video/')) {
          setErrorMessage('Please choose a valid video file (MP4, WebM).');
          continue;
        }

        if (selectedFiles.length + newItems.length >= vidsRemaining) {
          setErrorMessage(`You have ${vidsRemaining} video uploads remaining this month.`);
          break;
        }

        try {
          const inspected = await inspectVideoFile(file, currentPackage.max_video_size_mb, 60);
          newItems.push({
            id: `vid-${Date.now()}-${i}`,
            file,
            previewUrl: inspected.posterUrl,
            type: 'video',
            duration: inspected.duration,
          });
        } catch (err: any) {
          setErrorMessage(err.message || 'Video validation failed.');
        }
      }
    }

    setSelectedFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleSubmit = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }

    if (selectedFiles.length === 0) {
      setErrorMessage(
        activeTab === 'image'
          ? 'Please choose at least one picture to submit.'
          : 'Please choose a video to submit.'
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const reservationToken = `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let isQuotaReserved = false;

    try {
      // Stage 1: Photo Received / Video Received
      setProcessingStage(1);
      setProcessingPercent(15);
      await new Promise((r) => setTimeout(r, 400));

      // Stage 2: File Verified & Quota Reservation
      setProcessingStage(2);
      setProcessingPercent(30);
      for (const item of selectedFiles) {
        if (item.type === 'image' && item.file.size > 25 * 1024 * 1024) {
          throw new Error(`File ${item.file.name} exceeds maximum allowed size (25MB).`);
        }
        if (item.type === 'video' && item.file.size > currentPackage.max_video_size_mb * 1024 * 1024) {
          throw new Error(`Video exceeds maximum allowed size (${currentPackage.max_video_size_mb}MB).`);
        }
      }

      // Pre-allocate quota atomically before starting physical media processing & upload
      await reserveMediaQuota(user.id, selectedFiles.length, activeTab, reservationToken);
      isQuotaReserved = true;

      await new Promise((r) => setTimeout(r, 350));

      // Stage 3: Enhancing Quality (Canvas unsharp mask and watermark)
      setProcessingStage(3);
      setProcessingPercent(48);

      const uploadedAssets: MediaAsset[] = [];
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const item = selectedFiles[i];

        if (item.type === 'image') {
          // Process and enhance image
          const processed = await processStatusPhotograph(
            item.file,
            watermarkSettings,
            currentPackage.watermark_required
          );

          // Stage 4: Optimizing Your Media (Upload with progress)
          setProcessingStage(4);
          const uploadResult = await uploadToCloudinary(
            processed.blob,
            'image',
            item.file.name,
            (pct) => {
              const base = 50 + (i / totalFiles) * 35;
              const slice = (1 / totalFiles) * 35 * (pct / 100);
              setProcessingPercent(Math.min(85, Math.round(base + slice)));
            },
            { token: reservationToken, count: totalFiles }
          );

          uploadedAssets.push({
            id: `asset-${Date.now()}-${i}`,
            request_id: '',
            user_id: user.id,
            cloudinary_public_id: uploadResult.public_id,
            cloudinary_asset_id: uploadResult.asset_id,
            resource_type: 'image',
            secure_url: uploadResult.secure_url,
            original_filename: item.file.name,
            file_size_bytes: uploadResult.bytes,
            width: processed.width,
            height: processed.height,
            format: uploadResult.format,
            is_deleted: false,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
          });
        } else {
          // Video upload
          setProcessingStage(4);
          const uploadResult = await uploadToCloudinary(
            item.file,
            'video',
            item.file.name,
            (pct) => {
              const base = 50 + (i / totalFiles) * 35;
              const slice = (1 / totalFiles) * 35 * (pct / 100);
              setProcessingPercent(Math.min(85, Math.round(base + slice)));
            },
            { token: reservationToken, count: totalFiles }
          );

          uploadedAssets.push({
            id: `asset-${Date.now()}-${i}`,
            request_id: '',
            user_id: user.id,
            cloudinary_public_id: uploadResult.public_id,
            cloudinary_asset_id: uploadResult.asset_id,
            resource_type: 'video',
            secure_url: uploadResult.secure_url,
            original_filename: item.file.name,
            file_size_bytes: uploadResult.bytes,
            duration_seconds: item.duration,
            format: uploadResult.format,
            is_deleted: false,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }

      // Stage 5: Final Quality Check
      setProcessingStage(5);
      setProcessingPercent(92);
      await new Promise((r) => setTimeout(r, 400));

      const newRequest = await createUploadRequest(
        user,
        currentPackage,
        activeTab,
        uploadedAssets,
        undefined,
        reservationToken
      );

      // Stage 6: Your Media Is Ready
      setProcessingStage(6);
      setProcessingPercent(100);
      await new Promise((r) => setTimeout(r, 600));

      setSubmittedRequest(newRequest);
      onRequestCreated(newRequest);
      setSelectedFiles([]);
    } catch (err: any) {
      if (isQuotaReserved) {
        await releaseMediaQuota(reservationToken);
      }
      setErrorMessage(err.message || 'Failed to submit media. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyOfficialNumber = () => {
    navigator.clipboard.writeText(officialNumber);
    setCopiedContact(true);
    setTimeout(() => setCopiedContact(false), 2000);
  };

  const handleSaveOfficialContact = () => {
    downloadContactVCard(officialName, officialNumber);
  };

  return (
    <section className="w-full max-w-md mx-auto px-4 py-8 flex flex-col items-center text-center">
      {/* 6-Stage HD Media Processing Animation */}
      <ProcessingAnimation
        isOpen={isProcessing}
        mediaType={activeTab}
        currentStage={processingStage}
        progressPercent={processingPercent}
        filesCount={selectedFiles.length}
        previewThumbnail={selectedFiles[0]?.previewUrl}
      />

      {/* Hero Title */}
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#19241E] dark:text-[#F2F6F2]">
        Better Quality. Better Status.
      </h1>

      <p className="mt-2 text-sm text-[#748078] dark:text-[#A7B8AC] max-w-xs leading-relaxed">
        Upload your pictures. We'll prepare them and send them to your WhatsApp.
      </p>

      {/* Media Type Tabs */}
      <div className="mt-6 w-full flex items-center p-1 rounded-2xl bg-[#F1F5F1] dark:bg-[#25332A] border border-[#E4EAE5] dark:border-[#334539]">
        <button
          onClick={() => {
            setActiveTab('image');
            setSelectedFiles([]);
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'image'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Pictures</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('video');
            setSelectedFiles([]);
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'video'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Videos</span>
          {isVideoExhausted && (
            <Lock className="w-3 h-3 text-amber-500 ml-0.5" />
          )}
        </button>
      </div>

      {/* Quota Counter Notice */}
      <div className="mt-3 flex items-center justify-between w-full text-xs text-[#748078] dark:text-[#A7B8AC] px-1">
        <span>
          {activeTab === 'image' ? (
            <>
              <strong className="text-[#19241E] dark:text-[#F2F6F2]">{picsUsed} of {picsAllowed}</strong> pictures used
            </>
          ) : (
            <>
              <strong className="text-[#19241E] dark:text-[#F2F6F2]">{vidsUsed} of {vidsAllowed}</strong> videos used
            </>
          )}
        </span>

        {((activeTab === 'image' && isPicsExhausted) || (activeTab === 'video' && isVideoExhausted)) && (
          <button
            onClick={onOpenUpgrade}
            className="text-[#21A36B] hover:underline font-semibold flex items-center gap-0.5"
          >
            <span>Upgrade Plan</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Central Upload Card */}
      <div className="mt-4 w-full rounded-2xl border-2 border-dashed border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] p-6 transition-all hover:border-[#21A36B]/60 shadow-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept={activeTab === 'image' ? 'image/jpeg,image/png,image/webp,image/jpg' : 'video/mp4,video/webm,video/quicktime'}
          multiple={activeTab === 'image'}
          onChange={handleFilesSelected}
          className="hidden"
          id="media-file-input"
          disabled={isProcessing || (activeTab === 'image' ? isPicsExhausted : isVideoExhausted)}
        />

        {selectedFiles.length === 0 ? (
          <label
            htmlFor="media-file-input"
            className="flex flex-col items-center justify-center cursor-pointer py-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F1] dark:bg-[#25332A] text-[#173B2A] dark:text-[#58C994] flex items-center justify-center shadow-inner mb-3">
              <UploadCloud className="w-7 h-7" />
            </div>

            <span className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
              {activeTab === 'image' ? 'Choose Your Pictures' : 'Choose Your Video'}
            </span>

            <p className="mt-1 text-xs text-[#748078] dark:text-[#A7B8AC]">
              {activeTab === 'image'
                ? 'High-res JPEG, JPG, WebP. Multiple files supported.'
                : `Max ${currentPackage.max_video_size_mb} MB · Up to 60 seconds`}
            </p>

            <span className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-semibold shadow-sm hover:opacity-95 transition-all">
              Browse Files
            </span>
          </label>
        ) : (
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
              <span className="text-xs font-bold text-[#19241E] dark:text-[#F2F6F2]">
                {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
              </span>

              <label
                htmlFor="media-file-input"
                className="text-xs text-[#21A36B] font-semibold hover:underline cursor-pointer"
              >
                + Add More
              </label>
            </div>

            {/* Thumbnail Previews Grid */}
            <div className="grid grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
              {selectedFiles.map((item) => (
                <div
                  key={item.id}
                  className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-[#E4EAE5] dark:border-[#334539]"
                >
                  <img
                    src={item.previewUrl}
                    alt="Upload preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeFile(item.id)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all"
                    title="Remove file"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-3 w-full p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 text-left">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Submit Button */}
      {selectedFiles.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={isProcessing}
          className="mt-4 w-full py-3.5 px-4 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-sm font-bold shadow-md hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <SubmitMediaIcon className="w-4 h-4" />
          <span>{activeTab === 'image' ? 'Submit Pictures' : 'Submit Video'}</span>
        </button>
      )}

      {/* If not signed in and no files selected */}
      {!user && selectedFiles.length === 0 && (
        <button
          onClick={onOpenAuth}
          className="mt-4 w-full py-3 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] shadow-sm transition-all"
        >
          Continue with Google
        </button>
      )}

      {/* Delivery Notice */}
      <div className="mt-5 p-3 rounded-xl bg-[#F1F5F1] dark:bg-[#25332A] text-[11px] text-[#748078] dark:text-[#A7B8AC] flex items-center justify-center gap-2 text-center">
        <Clock className="w-3.5 h-3.5 text-[#21A36B] shrink-0" />
        <span>Usually ready in 5–10 minutes. Please allow up to 1 hour.</span>
      </div>

      {/* REDESIGNED SUCCESS SCREEN (Section 8) */}
      {submittedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2] text-center space-y-4">
            {/* Subtle Animated Checkmark */}
            <div className="w-14 h-14 rounded-full bg-[#21A36B]/15 text-[#21A36B] mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-8 h-8 animate-scale-up" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-[#19241E] dark:text-[#F2F6F2]">
                Request Received!
              </h2>
              <p className="mt-1 text-xs text-[#748078] dark:text-[#A7B8AC]">
                {submittedRequest.media_type === 'video'
                  ? 'Your video is being prepared for delivery.'
                  : 'Your pictures are being prepared for delivery.'}
              </p>
            </div>

            {/* Official WhatsApp Contact Card */}
            <div className="p-4 rounded-xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] space-y-2 text-left">
              <span className="text-[11px] font-bold text-[#173B2A] dark:text-[#58C994] block uppercase tracking-wider">
                Save Our WhatsApp Number
              </span>
              <div className="space-y-0.5">
                <p className="font-mono text-xl font-extrabold text-[#19241E] dark:text-[#F2F6F2] tracking-wide">
                  0993741274
                </p>
                <p className="font-mono text-xs text-[#748078] dark:text-[#A7B8AC]">
                  ({officialNumber || '+265 99 374 1274'})
                </p>
              </div>
              <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
                Save this number to your contacts so you can recognize our WhatsApp message when your media arrives.
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveOfficialContact}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-semibold hover:opacity-95 transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Save Contact</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyOfficialNumber}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#25332A] transition-all"
                >
                  {copiedContact ? <Check className="w-3.5 h-3.5 text-[#21A36B]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedContact ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const req = submittedRequest;
                  setSubmittedRequest(null);
                  onViewRequestStatus(req);
                }}
                className="flex-1 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] text-xs font-semibold hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] transition-all"
              >
                View Status
              </button>

              <button
                type="button"
                onClick={() => setSubmittedRequest(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#F1F5F1] dark:bg-[#25332A] text-[#19241E] dark:text-[#F2F6F2] text-xs font-semibold hover:opacity-90 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
