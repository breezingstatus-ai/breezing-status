import React from 'react';
import { 
  Camera, 
  Video, 
  Check, 
  ShieldCheck, 
  Sliders, 
  CheckCircle2, 
  FileCheck 
} from 'lucide-react';

export type ProcessingStage = 1 | 2 | 3 | 4 | 5 | 6;

interface ProcessingAnimationProps {
  isOpen: boolean;
  mediaType: 'image' | 'video';
  currentStage: ProcessingStage;
  progressPercent: number; // 0 to 100 genuine upload / processing progress
  filesCount: number;
  previewThumbnail?: string;
}

interface StageInfo {
  stage: ProcessingStage;
  label: (mediaType: 'image' | 'video') => string;
  subtext: string;
}

const STAGES: StageInfo[] = [
  {
    stage: 1,
    label: (m) => (m === 'image' ? 'Photo Received' : 'Video Received'),
    subtext: 'Input read and buffered safely into memory',
  },
  {
    stage: 2,
    label: () => 'File Verified',
    subtext: 'Dimensions, container format, and limits checked',
  },
  {
    stage: 3,
    label: () => 'Enhancing Quality',
    subtext: 'Preserving native aspect ratio & subtle edge detail',
  },
  {
    stage: 4,
    label: () => 'Optimizing Your Media',
    subtext: 'Compressing for crisp uncompressed status delivery',
  },
  {
    stage: 5,
    label: () => 'Final Quality Check',
    subtext: 'Verifying Cloudinary storage and integrity token',
  },
  {
    stage: 6,
    label: () => 'Your Media Is Ready',
    subtext: 'Submitted for priority delivery queue',
  },
];

export const ProcessingAnimation: React.FC<ProcessingAnimationProps> = ({
  isOpen,
  mediaType,
  currentStage,
  progressPercent,
  filesCount,
  previewThumbnail,
}) => {
  if (!isOpen) return null;

  const currentStageInfo = STAGES.find((s) => s.stage === currentStage) || STAGES[0];
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-[#FAF9F5] dark:bg-[#152019] p-6 shadow-2xl border border-[#E5E9E4] dark:border-[#2C3E32] text-[#19241E] dark:text-[#F2F6F2] relative overflow-hidden">
        
        {/* Subtle decorative shimmer ambient top glow */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-[#21A36B]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-[#173B2A]/10 dark:bg-[#58C994]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Circular Progress & Media Icon Container */}
        <div className="relative w-32 h-32 mx-auto my-3 flex items-center justify-center">
          {/* SVG Progress Circle */}
          <svg className="w-32 h-32 transform -rotate-90">
            {/* Background Track */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              className="text-[#E5ECE6] dark:text-[#233328]"
            />
            {/* Active Progress Line */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke="#21A36B"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-300 ease-out"
            />
          </svg>

          {/* Central Media Icon / Thumbnail with gentle shimmer */}
          <div className="absolute inset-0 flex items-center justify-center">
            {previewThumbnail ? (
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#21A36B]/30 relative shadow-sm">
                <img
                  src={previewThumbnail}
                  alt="Processing preview"
                  className="w-full h-full object-cover"
                />
                {/* Gentle shimmer overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-pulse" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-white dark:bg-[#1A261F] border border-[#E4EAE5] dark:border-[#334539] text-[#21A36B] flex items-center justify-center shadow-sm">
                {mediaType === 'image' ? (
                  <Camera className="w-8 h-8 stroke-[1.8]" />
                ) : (
                  <Video className="w-8 h-8 stroke-[1.8]" />
                )}
              </div>
            )}
          </div>

          {/* Small percentage chip */}
          <div className="absolute -bottom-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#1A261F] border border-[#E4EAE5] dark:border-[#334539] text-[10px] font-mono font-bold text-[#173B2A] dark:text-[#58C994] shadow-xs">
            {Math.round(progressPercent)}%
          </div>
        </div>

        {/* Current Active Status Title */}
        <div className="text-center mt-3 mb-5 space-y-1">
          <h3 className="text-lg font-extrabold tracking-tight text-[#19241E] dark:text-[#F2F6F2]">
            {currentStageInfo.label(mediaType)}
          </h3>
          <p className="text-xs text-[#748078] dark:text-[#A7B8AC] max-w-xs mx-auto">
            {currentStageInfo.subtext}
          </p>
        </div>

        {/* 6 Step Indicators */}
        <div className="space-y-2 pt-2 border-t border-[#E5E9E4] dark:border-[#2C3E32]">
          {STAGES.map((s) => {
            const isCompleted = currentStage > s.stage;
            const isCurrent = currentStage === s.stage;

            return (
              <div
                key={s.stage}
                className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl transition-all duration-200 ${
                  isCurrent
                    ? 'bg-white dark:bg-[#1F2C23] border border-[#21A36B]/40 shadow-xs'
                    : 'text-[#748078] dark:text-[#A7B8AC]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      isCompleted
                        ? 'bg-[#21A36B] text-white'
                        : isCurrent
                        ? 'border-2 border-[#21A36B] text-[#21A36B]'
                        : 'border border-[#CBD5CD] dark:border-[#3E5244] text-[#CBD5CD]'
                    }`}
                  >
                    {isCompleted ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : s.stage}
                  </div>
                  <span
                    className={`text-xs ${
                      isCurrent
                        ? 'font-bold text-[#19241E] dark:text-[#F2F6F2]'
                        : isCompleted
                        ? 'font-medium text-[#19241E] dark:text-[#F2F6F2]'
                        : 'text-[#8E9B91] dark:text-[#738779]'
                    }`}
                  >
                    {s.label(mediaType)}
                  </span>
                </div>

                <div className="text-[10px] font-mono">
                  {isCompleted && (
                    <span className="text-[#21A36B] font-semibold">Done</span>
                  )}
                  {isCurrent && (
                    <span className="text-[#21A36B] font-bold animate-pulse">In Progress</span>
                  )}
                  {!isCompleted && !isCurrent && (
                    <span className="text-neutral-400">Waiting</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-4 pt-3 text-center text-[11px] text-[#748078] dark:text-[#A7B8AC] flex items-center justify-center gap-1.5 border-t border-[#E5E9E4] dark:border-[#2C3E32]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#21A36B]" />
          <span>
            {filesCount} {filesCount === 1 ? 'file' : 'files'} · Preserving HD status fidelity
          </span>
        </div>
      </div>
    </div>
  );
};
