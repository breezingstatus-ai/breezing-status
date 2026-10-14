import React from 'react';

/**
 * Modern High-Definition Status Icon
 * Bespoke geometric lens & resolution indicator for Breezing Status HD.
 * Replaces generic AI sparkles with a professional media-mastering emblem.
 */
export const StatusHDIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Outer high-precision focal ring */}
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="4 2"
    />
    {/* Inner clarity lens */}
    <circle
      cx="12"
      cy="12"
      r="4.5"
      stroke="currentColor"
      strokeWidth="2"
    />
    {/* Precision status alignment markers */}
    <path
      d="M12 2v2M12 20v2M2 12h2M20 12h2"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Central focal diode */}
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

/**
 * Modern Submit Media Dispatch Icon
 * Precision upload & status mastering vector.
 * Replaces generic AI sparkles on the Submit Pictures button.
 */
export const SubmitMediaIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Upward transmission beam */}
    <path
      d="M12 15V3M12 3L7.5 7.5M12 3L16.5 7.5"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Modern tray / media frame */}
    <path
      d="M3 13.5v5a2.5 2.5 0 0 0 2.5 2.5h13a2.5 2.5 0 0 0 2.5-2.5v-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* HD Quality indicator pill */}
    <circle cx="12" cy="18" r="1.25" fill="currentColor" />
  </svg>
);
