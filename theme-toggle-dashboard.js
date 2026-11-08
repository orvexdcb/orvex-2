/* ORVEX dashboard theme switch: place beside the notification bell */
(function(){
  'use strict';
  const root=document.documentElement, KEY='orvex-theme';
  const icon=(dark)=>dark
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>';
  function isDark(){return root.getAttribute('data-theme')==='dark'||(!root.hasAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches)}
  function sync(){document.querySelectorAll('.od-theme-toggle').forEach(b=>{const d=isDark();b.innerHTML=icon(d);b.title=d?'التبديل إلى الوضع الفاتح':'التبديل إلى الوضع الداكن';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(d))});}
  function install(){
    document.querySelectorAll('.od-h').forEach(h=>{
      const bell=h.querySelector('.od-bell:not(.od-feed)');
      if(!bell||h.querySelector('.od-theme-toggle'))return;
      const b=document.createElement('button');b.type='button';b.className='od-theme-toggle';b.addEventListener('click',()=>{
        const next=isDark()?'light':'dark';root.setAttribute('data-theme',next);
        try{localStorage.setItem(KEY,next)}catch(e){}
        sync();
      });
      b.style.cssText='width:40px;height:40px;flex:0 0 40px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;background:transparent;color:inherit;cursor:pointer;padding:8px;margin-inline-start:4px';
      b.querySelectorAll('svg').forEach(()=>{});
      bell.insertAdjacentElement('afterend',b);
    });
    sync();
  }
  const style=document.createElement('style');style.textContent='.od-theme-toggle svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.od-theme-toggle:focus-visible{outline:2px solid var(--brand,#27e060);outline-offset:2px}';document.head.appendChild(style);
  install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('storage',e=>{if(e.key===KEY){if(e.newValue==='light'||e.newValue==='dark')root.setAttribute('data-theme',e.newValue);sync()}});
})();