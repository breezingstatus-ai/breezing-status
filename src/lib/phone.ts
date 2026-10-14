// International phone number utilities and WhatsApp URL generator

export interface CountryInfo {
  name: string;
  code: string;
  flag: string;
  example: string;
}

export const SUPPORTED_COUNTRIES: CountryInfo[] = [
  { name: 'Malawi', code: '+265', flag: '🇲🇼', example: '991 234 567' },
  { name: 'South Africa', code: '+27', flag: '🇿🇦', example: '71 234 5678' },
  { name: 'Kenya', code: '+254', flag: '🇰🇪', example: '712 345 678' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬', example: '802 345 6789' },
  { name: 'Zambia', code: '+260', flag: '🇿🇲', example: '97 123 4567' },
  { name: 'Zimbabwe', code: '+263', flag: '🇿🇼', example: '77 123 4567' },
  { name: 'Tanzania', code: '+255', flag: '🇹🇿', example: '71 234 5678' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧', example: '7911 123456' },
  { name: 'United States / Canada', code: '+1', flag: '🇺🇸', example: '202 555 0123' },
  { name: 'United Arab Emirates', code: '+971', flag: '🇦🇪', example: '50 123 4567' },
  { name: 'India', code: '+91', flag: '🇮🇳', example: '98123 45678' },
];

/**
 * Normalizes phone number by removing spaces, hyphens, and leading zeros.
 * Returns standard international format like +265991234567
 */
export function normalizePhoneNumber(countryCode: string, localNumber: string): string {
  const cleanCode = countryCode.trim().startsWith('+') ? countryCode.trim() : `+${countryCode.trim()}`;
  let cleanLocal = localNumber.replace(/[\s\-\(\)\.]/g, '');
  
  // Remove leading 0 if user typed 0991234567
  if (cleanLocal.startsWith('0')) {
    cleanLocal = cleanLocal.substring(1);
  }

  // If local number already includes the country code without plus
  const codeDigits = cleanCode.replace('+', '');
  if (cleanLocal.startsWith(codeDigits)) {
    cleanLocal = cleanLocal.substring(codeDigits.length);
  }

  return `${cleanCode}${cleanLocal}`;
}

/**
 * Validates international phone number length
 */
export function validatePhoneNumber(fullNumber: string): { isValid: boolean; error?: string } {
  const digitsOnly = fullNumber.replace(/\D/g, '');
  if (digitsOnly.length < 8) {
    return { isValid: false, error: 'Phone number is too short' };
  }
  if (digitsOnly.length > 15) {
    return { isValid: false, error: 'Phone number is too long' };
  }
  return { isValid: true };
}

/**
 * Generates direct WhatsApp chat link
 */
export function getWhatsAppUrl(fullNumber: string, message?: string): string {
  const digits = fullNumber.replace(/\D/g, '');
  const encodedMsg = message ? encodeURIComponent(message) : '';
  return `https://wa.me/${digits}${encodedMsg ? `?text=${encodedMsg}` : ''}`;
}

/**
 * Formats a clean download filename for the admin: e.g. Grace_Banda_265991234567_001.jpg
 */
export function formatDownloadFilename(customerName: string, phoneNumber: string, index: number, ext: string = 'jpg'): string {
  const safeName = customerName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Customer';
  const cleanDigits = phoneNumber.replace(/\D/g, '') || '000';
  const paddedIndex = String(index + 1).padStart(3, '0');
  return `${safeName}_${cleanDigits}_${paddedIndex}.${ext}`;
}
