import {useEffect,useRef} from 'react';

/** Native scrolling moves the upload card into place; no wheel/touch interception. */
export function useStudioScroll(blocked:boolean) {
  const section=useRef<HTMLElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const intro=useRef<HTMLDivElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const finish=useRef(()=>{});
  useEffect(()=>{
    const root=section.current, layout=stage.current, hero=intro.current, upload=panel.current;
    if(!root||!layout||!hero||!upload||blocked)return;
    const desktop=window.matchMedia('(min-width: 1024px)');
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0, active=false, settled=false, origin=0, travel=0, startX=0, startY=0;
    const reset=()=>{
      delete root.dataset.studioMotion;delete root.dataset.studioPhase;
      for(const key of ['--studio-height','--studio-top','--studio-progress','--studio-x','--studio-y']) root.style.removeProperty(key);
    };
    const paint=()=>{
      frame=0;if(!active)return;
      const progress=settled?1:Math.min(1,Math.max(0,(window.scrollY-origin)/travel));
      // Smooth endpoints, with scroll position remaining the sole source of motion.
      const eased=progress*progress*(3-2*progress);
      root.style.setProperty('--studio-x',`${startX*(1-eased)}px`);
      root.style.setProperty('--studio-y',`${startY*(1-eased)}px`);
      root.style.setProperty('--studio-progress',String(eased));
      root.dataset.studioPhase=progress===0?'intro':progress===1?'aligned':'transition';
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
    const measure=()=>{
      const header=document.querySelector<HTMLElement>('.site-header');
      const top=(header?.offsetHeight||80)+24;
      const available=window.innerHeight-top-24;
      active=desktop.matches&&!reduced.matches&&available>=Math.max(hero.offsetHeight,upload.offsetHeight);
      if(!active){reset();return;}
      travel=Math.max(360,Math.min(620,window.innerHeight*.65));
      root.dataset.studioMotion='enabled';
      root.style.setProperty('--studio-top',`${top}px`);
      root.style.setProperty('--studio-height',`${available+travel+48}px`);
      const padding=parseFloat(getComputedStyle(root).paddingTop)||0;
      origin=root.getBoundingClientRect().top+window.scrollY+padding-top;
      startX=hero.offsetLeft-upload.offsetLeft;
      startY=hero.offsetTop+hero.offsetHeight+32-upload.offsetTop;
      paint();
    };
    finish.current=()=>{settled=true;paint();};
    const observer=new ResizeObserver(measure);observer.observe(hero);observer.observe(upload);
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',measure);
    desktop.addEventListener('change',measure);reduced.addEventListener('change',measure);
    measure();
    return ()=>{
      cancelAnimationFrame(frame);observer.disconnect();reset();finish.current=()=>{};
      window.removeEventListener('scroll',schedule);window.removeEventListener('resize',measure);
      desktop.removeEventListener('change',measure);reduced.removeEventListener('change',measure);
    };
  },[blocked]);
  return {section,stage,intro,panel,finish:()=>finish.current()};
}
