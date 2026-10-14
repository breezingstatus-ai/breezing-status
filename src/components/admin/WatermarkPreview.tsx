import React, { useEffect, useRef, useState } from 'react';
import { WatermarkSettings } from '../../types';
import { loadWatermarkImage, renderWatermark } from '../../lib/mediaProcessor';
export function WatermarkPreview({settings,onChange}:{settings:WatermarkSettings;onChange:(value:WatermarkSettings)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [format,setFormat]=useState('portrait');
  const [guides,setGuides]=useState(true);
  const width=640, height=format==='portrait'?1138:format==='square'?640:480;
  useEffect(()=>{
    let canceled=false;
    void loadWatermarkImage(settings.logo_url).then(img=>{
      if(canceled || !canvas.current) return;
      const ctx=canvas.current.getContext('2d'); if(!ctx) return;
      ctx.fillStyle='#bed0bb'; ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#799480';ctx.beginPath();ctx.arc(width/2,height/2,width*.28,0,Math.PI*2);ctx.fill();
      if(guides){ctx.strokeStyle='#ffffffaa';ctx.setLineDash([8,8]);for(const f of [1/3,2/3]){ctx.beginPath();ctx.moveTo(width*f,0);ctx.lineTo(width*f,height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,height*f);ctx.lineTo(width,height*f);ctx.stroke();}ctx.setLineDash([]);}
      renderWatermark(ctx,img,width,height,settings);
    }); return()=>{canceled=true;};
  },[settings,format,guides,height]);
  const move=(event:React.PointerEvent<HTMLCanvasElement>)=>{
    if(event.type==='pointermove' && !(event.buttons&1)) return;
    const rect=event.currentTarget.getBoundingClientRect();
    onChange({...settings,position:'custom',offset_x_percent:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),offset_y_percent:Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))});
  };
  return <div className="w-full space-y-3 text-xs">
    <label className="block">Preview format<select value={format} onChange={e=>setFormat(e.target.value)} className="ml-2 border rounded-lg p-2"><option value="portrait">Status 9:16</option><option value="square">Square</option><option value="landscape">Landscape</option></select></label>
    <label className="flex gap-2"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)} />Show alignment guides</label>
    <p>Drag or tap the preview to position the logo. Use the controls below for precise placement.</p>
    <canvas ref={canvas} width={width} height={height} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);move(event);}} onPointerMove={move} className="block rounded-xl mx-auto" style={{touchAction:'none',width:'auto',height:'auto',maxWidth:'100%',maxHeight:460}} aria-label="Watermark placement preview" />
    {(['x','y'] as const).map(axis=><label key={axis} className="block">{axis==='x'?'Horizontal':'Vertical'} position (%)<input type="number" min="0" max="100" value={settings[`offset_${axis}_percent`]??50} onChange={e=>onChange({...settings,position:'custom',[`offset_${axis}_percent`]:Math.max(0,Math.min(100,Number(e.target.value)))})} className="ml-2 w-20 border p-2 rounded-lg" /></label>)}
    <p>Placement scales to the uploaded picture or video. Save Watermark Settings to publish it.</p>
  </div>;
}
