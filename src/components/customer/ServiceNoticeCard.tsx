import { AppSettings } from '../../types';
import { activeNotice } from '../../lib/serviceStatus';
export function ServiceNoticeCard({settings,checking=false}:{settings:AppSettings;checking?:boolean}) {
  const notice=activeNotice(settings);
  return <section role="status" aria-live="polite" className="service-notice-card">
    <div className="service-notice-orbit" aria-hidden="true"><span/><span/><span/></div>
    <p className="uppercase tracking-[0.2em] text-xs font-semibold text-[#748078]">Breezing Status HD · Service update</p>
    <h2 className="text-2xl sm:text-3xl font-semibold mt-4">{checking?'Checking upload availability':notice.title}</h2>
    <p className="mt-3 text-sm leading-7 max-w-md mx-auto">{checking?'Please wait while we reconnect to the studio.':notice.message}</p>
    <div className="mt-6 inline-flex rounded-full px-4 py-2 bg-[#173B2A]/10 text-sm font-medium">{checking?'Connecting…':'Uploads paused'}</div>
    <p className="text-xs mt-6 opacity-60">This page updates when uploads become available.</p>
  </section>;
}
