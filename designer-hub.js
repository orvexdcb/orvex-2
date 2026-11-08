/* ORVEX Designer Hub: five sections, restricted to the designer dashboard. */
(function(){
  if(typeof VIEWS!=='object'||!VIEWS||typeof VIEWS.studio!=='function'||window.__orvexDesignerHub)return;
  window.__orvexDesignerHub=true;
  const icons={
    feedback:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7.5v4M12 15h.01"/>',
    map:'<path d="M12 21.5s-7-6.1-7-11.5a7 7 0 0 1 14 0c0 5.4-7 11.5-7 11.5z"/><circle cx="12" cy="10" r="2.6"/>',
    shops:'<path d="M3.5 9.5 5 4h14l1.5 5.5"/><path d="M3.5 9.5a2.8 2.8 0 0 0 5.5 0 2.8 2.8 0 0 0 6 0 2.8 2.8 0 0 0 5.5 0"/><path d="M5 12.5V20h14v-7.5M10 20v-4.5h4V20"/>',
    assts:'<circle cx="9" cy="8" r="3.4"/><path d="M2.6 20a6.4 6.4 0 0 1 12.8 0"/><circle cx="17.5" cy="9.2" r="2.4"/><path d="M17.2 14.2a5 5 0 0 1 4.3 5.3"/>',
    malls:'<rect x="4.5" y="3" width="15" height="18" rx="1.6"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M9 15.5h1.5M13.5 15.5H15M10.5 21v-3h3v3"/>'
  };
  const tiles=[
    {k:'feedback',t:'مركز الاقتراحات والإبلاغات',fn:'orvexFeedbackCenter'},
    {k:'map',t:'خريطة المحلات',fn:'orvexShopsMap'},
    {k:'shops',t:'المحلات',s:'shops'},
    {k:'assts',t:'مساعدو المصمم',s:'assts'},
    {k:'malls',t:'المجمعات التجارية',s:'malls'}
  ];
  const sections={
    shops:{title:'المحلات',pick:t=>[t.querySelector('#pendList'),t.querySelector('#reqList'),t.querySelector('button[onclick="auditView()"]')?.parentElement,t.querySelector('#shopList'),t.querySelector('.fab')]},
    assts:{title:'مساعدو المصمم',pick:t=>[t.querySelector('#asstBox')]},
    malls:{title:'المجمعات التجارية',pick:t=>[t.querySelector('#mallBox')]}
  };
  window.orvexDesignerSection=function(k){if(!sections[k])return;state.dsec=k;render();window.scrollTo(0,0)};
  window.orvexDesignerHome=function(){state.dsec=null;render();window.scrollTo(0,0)};
  window.orvexDesignerOpen=function(name){const f=window[name];if(typeof f!=='function')return toast('هذا القسم غير متاح في هذه النسخة');f()};
  function grid(){
    return '<div class="dh" dir="rtl"><p class="dh-sub">اختر القسم الذي تريد فتحه</p><div class="dh-grid">'+tiles.map(x=>{
      const action=x.fn?'orvexDesignerOpen(\''+x.fn+'\')':'orvexDesignerSection(\''+x.s+'\')';
      return '<button type="button" class="dh-tile" data-k="'+x.k+'" onclick="'+action+'" aria-label="'+x.t+'"><span class="dh-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[x.k]+'</svg><i class="dh-bd" hidden></i></span><span class="dh-lb">'+x.t+'</span></button>';
    }).join('')+'</div></div>';
  }
  function section(k,html){
    const tpl=document.createElement('template');tpl.innerHTML=html;
    const parts=sections[k].pick(tpl.content).filter(Boolean).map(e=>e.outerHTML).join('');
    return '<div class="dh" dir="rtl"><div class="dh-top"><button type="button" class="btn" onclick="orvexDesignerHome()">رجوع</button><h3>'+sections[k].title+'</h3></div>'+(parts||'<p class="muted">هذا القسم غير متاح.</p>')+'</div>';
  }
  async function badge(){
    try{
      const S=window.__orvexSync&&window.__orvexSync.SB,rq=window.__orvexRequest;
      if(!S||!S.sess||!S.prof||S.prof.role!=='founder'||typeof rq!=='function')return;
      const a=await rq('/rest/v1/devices?approved=eq.false&select=id'),b=await rq('/rest/v1/device_requests?select=id');
      const n=(a||[]).length+(b||[]).length,el=document.querySelector('.dh-tile[data-k="shops"] .dh-bd');
      if(el&&n>0){el.textContent=n>99?'99+':String(n);el.hidden=false}
    }catch(e){}
  }
  const original=VIEWS.studio;
  VIEWS.studio=function(){
    const html=original.apply(this,arguments);
    if(typeof html!=='string'||!html.includes('id="shopList"')||!isDesigner())return html;
    if(state.dsec&&sections[state.dsec])return section(state.dsec,html);
    state.dsec=null;setTimeout(badge,80);return grid();
  };
  if(typeof go==='function'){const old=go;go=function(v){if(v==='studio'&&!state.shopId)state.dsec=null;return old.apply(this,arguments)}}
  if(typeof loginAs==='function'){const oldLogin=loginAs;loginAs=function(){state.dsec=null;return oldLogin.apply(this,arguments)}}
  const style=document.createElement('style');
  style.textContent='.dh-sub{margin:2px 0 14px;text-align:center;color:var(--muted,#647c70);font-size:14px}.dh-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:18px 14px;max-width:960px;margin:0 auto}.dh-tile{flex:0 0 calc(50% - 7px);max-width:200px;display:flex;flex-direction:column;align-items:center;gap:10px;background:none;border:0;padding:6px 4px;color:var(--ink,#12372a);font:inherit;cursor:pointer;touch-action:manipulation}.dh-ic{position:relative;width:88px;height:88px;border-radius:24px;display:flex;align-items:center;justify-content:center;color:#27e060;background:linear-gradient(145deg,#0e231a,#050f0b);border:1px solid #14452b;box-shadow:0 6px 16px rgba(5,15,11,.28);transition:transform .15s,box-shadow .15s,border-color .15s}.dh-ic svg{width:42px;height:42px}.dh-lb{font-weight:800;font-size:14px;line-height:1.45;text-align:center;overflow-wrap:anywhere}.dh-tile:hover .dh-ic{border-color:#27e060;box-shadow:0 8px 20px rgba(39,224,96,.25)}.dh-tile:active .dh-ic{transform:scale(.95)}.dh-tile:focus-visible{outline:none}.dh-tile:focus-visible .dh-ic{border-color:#27e060;box-shadow:0 0 0 3px rgba(39,224,96,.45)}.dh-bd{position:absolute;top:-6px;inset-inline-end:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#e5484d;color:#fff;font:700 12px/22px Tahoma,sans-serif;text-align:center}.dh-bd[hidden]{display:none}.dh-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}.dh-top h3{margin:0;flex:1;font-size:18px}@media(min-width:600px){.dh-tile{flex-basis:calc(33.333% - 10px)}.dh-ic{width:96px;height:96px}.dh-ic svg{width:46px;height:46px}}@media(min-width:960px){.dh-tile{flex-basis:calc(20% - 12px)}}';
  document.head.appendChild(style);
})();