import { AppSettings, ServiceNotice } from '../types';
export const SERVICE_NOTICES: ServiceNotice[] = [
  {key:'maintenance',title:'Scheduled maintenance',message:'We are improving your experience. Uploads will return shortly.'},
  {key:'outage',title:'Temporarily out of service',message:'Our upload service is unavailable. Please try again later.'},
  {key:'construction',title:'Something better is on the way',message:'We are updating the studio. Uploads are paused while we finish.'},
  {key:'capacity',title:'Taking a short breather',message:'We are handling a high volume of requests. Please check back soon.'},
  {key:'holiday',title:'Currently away',message:'Our team is taking a break. Uploads will reopen when we return.'},
  {key:'incident',title:'Uploads temporarily on hold',message:'We are resolving a service issue. Thank you for your patience.'},
];
export const servicePaused = (settings: AppSettings) => !settings.service_available || settings.maintenance_mode;
export function activeNotice(settings: AppSettings) {
  return (settings.service_notices || SERVICE_NOTICES).find(n=>n.key===settings.service_notice_key) || SERVICE_NOTICES[0];
}
