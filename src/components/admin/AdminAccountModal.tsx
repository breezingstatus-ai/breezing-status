import {UserProfile} from '../../types';
import {signOut} from '../../lib/supabase';
import {useState,useEffect,useRef} from 'react';
export function AdminAccountModal({isOpen,user,onClose,theme,onToggleTheme,onSettings,onSignedOut}:{isOpen:boolean;user:UserProfile;onClose:()=>void;theme:string;onToggleTheme:()=>void;onSettings:()=>void;onSignedOut:()=>void}) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(isOpen)dialog.current?.showModal();else dialog.current?.close();},[isOpen]);
 const logout=async()=>{setBusy(true);setError('');try{await signOut();onSignedOut();}catch{setError('Could not sign out. Please try again.');}finally{setBusy(false);}};
 return <dialog ref={dialog} onCancel={event=>{event.preventDefault();onClose();}} aria-labelledby="admin-account-title" className="admin-account-dialog w-[calc(100%-2rem)] max-w-md rounded-3xl p-6 bg-white dark:bg-[#1A241E] shadow-xl"><section className="space-y-5">
   <div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-widest opacity-60">Operations workspace</p><h2 id="admin-account-title" className="text-xl font-semibold mt-1">Administrator account</h2></div><button onClick={onClose} aria-label="Close administrator account" className="p-2">✕</button></div>
   <div><p className="font-semibold">{user.full_name}</p><p className="text-sm break-all opacity-70">{user.email}</p><p className="text-xs mt-2">Verified administrator</p></div>
   <button onClick={onSettings} className="w-full p-3 rounded-xl bg-[#173B2A] text-white font-semibold">Open admin settings</button>
   <button onClick={onToggleTheme} className="w-full p-3 rounded-xl border">Use {theme==='dark'?'light':'dark'} appearance</button>
   <button disabled={busy} onClick={logout} className="w-full p-3 rounded-xl border text-red-600">{busy?'Signing out…':'Sign out'}</button>
   {error&&<p role="alert" className="text-sm">{error}</p>}
 </section></dialog>;
}
