import {useEffect,useState} from 'react';
import {AppSettings,ServiceNotice} from '../../types';
import {updateServiceStatus,subscribeToStateUpdates} from '../../lib/supabase';
import {SERVICE_NOTICES,servicePaused} from '../../lib/serviceStatus';
import {ServiceNoticeCard} from '../customer/ServiceNoticeCard';
export function ServiceControls({settings,onSaved}:{settings:AppSettings;onSaved:(value:AppSettings)=>void}) {
  const [paused,setPaused]=useState(servicePaused(settings));
  const [key,setKey]=useState(settings.service_notice_key||'maintenance');
  const [notices,setNotices]=useState<ServiceNotice[]>(settings.service_notices||SERVICE_NOTICES);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{if(!dirty){setPaused(servicePaused(settings));setKey(settings.service_notice_key||'maintenance');setNotices(settings.service_notices||SERVICE_NOTICES);}},[settings,dirty]);
  useEffect(()=>subscribeToStateUpdates((table,value)=>{if(table==='app_settings'&&value) onSaved(value);}),[onSaved]);
  const notice=notices.find(n=>n.key===key)!;
  const edit=(field:'title'|'message',value:string)=>{setDirty(true);setNotices(notices.map(n=>n.key===key?{...n,[field]:value}:n));};
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('');
    try {const result=await updateServiceStatus(paused,key,notices);onSaved(result);setDirty(false);setMessage(paused?'Uploads paused. Connected customer pages now show your notice.':'Uploads are available again.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not save service status.');}finally{setBusy(false);}
  };
  return <form onSubmit={save} className="space-y-6">
    <div className="rounded-2xl border p-6 bg-white dark:bg-[#1A241E] space-y-4">
      <h2 className="text-xl font-semibold">Studio availability</h2>
      <p className="text-sm opacity-70">Pause all customer uploads and choose the notice they see. Existing orders remain available to the team.</p>
      <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={paused} onChange={e=>{setPaused(e.target.checked);setDirty(true);}}/>Pause uploads</label>
      <label className="block text-sm">Reason<select value={key} onChange={e=>{setKey(e.target.value);setDirty(true);}} className="block w-full mt-2 border rounded-xl p-3 bg-transparent">{SERVICE_NOTICES.map(n=><option key={n.key} value={n.key}>{n.title}</option>)}</select></label>
      <label className="block text-sm">Notice title<input required maxLength={100} value={notice.title} onChange={e=>edit('title',e.target.value)} className="block w-full mt-2 border rounded-xl p-3 bg-transparent"/></label>
      <label className="block text-sm">Message<textarea required maxLength={600} value={notice.message} onChange={e=>edit('message',e.target.value)} className="block w-full mt-2 border rounded-xl p-3 bg-transparent" rows={3}/></label>
      <button disabled={busy} className="rounded-xl bg-[#173B2A] text-white px-6 py-3 font-semibold text-sm">{busy?'Saving…':'Apply service update'}</button>
      {message&&<p role="status" className="text-sm">{message}</p>}
    </div>
    <div><p className="text-xs uppercase tracking-widest opacity-60">Customer notice preview</p><ServiceNoticeCard settings={{...settings,service_notice_key:key,service_notices:notices}}/></div>
  </form>;
}
