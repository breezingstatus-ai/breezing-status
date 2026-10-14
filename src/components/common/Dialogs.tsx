import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
type Request = { message: string; title: string; confirmLabel: string; info?: boolean; resolve: (answer: boolean) => void };
const Context = createContext<{ confirm: (message: string, title?: string, confirmLabel?: string) => Promise<boolean>; notify: (message: string) => Promise<boolean> } | null>(null);
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = requests[0];
  const finish = (answer: boolean) => { current?.resolve(answer); setRequests(queue => queue.slice(1)); };
  useEffect(() => { if (current) dialog.current?.showModal(); else dialog.current?.close(); }, [current]);
  const ask = (message: string, title: string, confirmLabel: string, info = false) => new Promise<boolean>(resolve => setRequests(queue => [...queue, { message, title, confirmLabel, info, resolve }]));
  return <Context.Provider value={{confirm: (message, title = 'Confirm action', label = 'Confirm') => ask(message, title, label), notify: message => ask(message, 'Notice', 'Close', true)}}>
    {children}
    <dialog ref={dialog} className="app-confirmation" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onCancel={event => {event.preventDefault(); finish(false);}}>
      {current && <><h2 id="confirmation-title">{current.title}</h2><p id="confirmation-message">{current.message}</p><div className="confirmation-actions">{!current.info && <button autoFocus onClick={() => finish(false)}>Cancel</button>}<button className="confirmation-primary" autoFocus={current.info} onClick={() => finish(true)}>{current.confirmLabel}</button></div></>}
    </dialog>
  </Context.Provider>;
}
export function useDialogs() { const value = useContext(Context); if (!value) throw new Error('DialogProvider is required'); return value; }
