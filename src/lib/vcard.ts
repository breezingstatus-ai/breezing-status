// vCard generation and contact saving utility

/**
 * Generates and triggers download of a standardized vCard (.vcf) file
 * Allows both Android and iOS devices to easily add the official WhatsApp business contact
 */
export function downloadContactVCard(contactName: string, phoneNumber: string): boolean {
  try {
    const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const cleanName = contactName.trim() || 'Breezing Status HD';

    const vcardContent = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${cleanName}`,
      `N:${cleanName};;;;`,
      `ORG:${cleanName}`,
      `TEL;TYPE=CELL,VOICE,pref:${cleanNumber}`,
      'NOTE:Official WhatsApp HD Media Delivery Service',
      'END:VCARD',
    ].join('\r\n');

    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${cleanName.replace(/\s+/g, '_')}.vcf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Failed to generate contact card:', err);
    return false;
  }
}
