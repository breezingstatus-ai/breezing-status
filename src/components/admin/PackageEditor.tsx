import React, { useState, useEffect } from 'react';
import { SubscriptionPackage } from '../../types';
import { updatePackage } from '../../lib/supabase';
export function PackageEditor({ pkg, onSaved }: { pkg: SubscriptionPackage; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(pkg);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setDraft(pkg); }, [pkg]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try { await updatePackage(draft); await onSaved(); setMessage('Saved. New uploads use these rules immediately.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save package.'); }
    finally { setSaving(false); }
  };
  const fields = [['price','Price',0],['duration_days','Subscription days',1],['monthly_pictures','Pictures per month',0],['monthly_videos','Videos per month',0],['max_video_size_mb','Maximum video size (MB)',1],['max_video_duration_seconds','Maximum video length (seconds)',1]] as const;
  return <form onSubmit={save} className="p-5 rounded-2xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] space-y-4 text-xs">
    <h3 className="font-bold text-lg">{pkg.name}</h3>
    <label className="block">Package name<input required value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} className="mt-1 w-full border rounded-xl p-3 bg-transparent" /></label>
    {fields.map(([key,label,min]) => <label key={key} className="block">{label}<input type="number" min={min} required step={key==='price'?'0.01':'1'} value={draft[key] ?? 60} onChange={e => setDraft({...draft,[key]:Number(e.target.value)})} className="mt-1 w-full border rounded-xl p-3 bg-transparent" /></label>)}
    <label className="block">Currency<input required maxLength={3} value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value.toUpperCase()})} className="mt-1 w-full border rounded-xl p-3 bg-transparent" /></label>
    <label className="block">Description<textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} className="mt-1 w-full border rounded-xl p-3 bg-transparent" /></label>
    <label className="flex gap-2 items-center"><input type="checkbox" checked={draft.watermark_required} onChange={e=>setDraft({...draft,watermark_required:e.target.checked})} />Apply watermark to this package</label>
    <label className="flex gap-2 items-center"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft({...draft,is_active:e.target.checked})} />Package available</label>
    <button disabled={saving} className="w-full rounded-xl p-3 bg-[#173B2A] text-white font-semibold">{saving?'Saving…':`Save ${pkg.name}`}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
