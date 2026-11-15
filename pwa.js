/* ORVEX: PWA + مؤشر المزامنة + إشعار التحديث (ملف خارجي ليتوافق مع CSP) */
(function(){
  'use strict';
  var T=function(k){return({
    off:'غير متصل',sync:'جارٍ المزامنة',wait:'بانتظار الرفع',ok:'تمت المزامنة',exp:'انتهت الجلسة',
    upd:'تم تحديث التطبيق. أعد التحميل عند الانتهاء من العملية الحالية.',reload:'تحديث الآن',later:'لاحقًا'
  })[k]};

  /* 1) عامل الخدمة + إشعار عند توفر نسخة جديدة (دون إعادة تحميل قسرية أثناء بيع جارٍ) */
  try{
    if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){
      var hadCtl=!!navigator.serviceWorker.controller;
      function watchInstalling(reg){
        var worker=reg&&reg.installing;
        if(!worker)return;
        worker.addEventListener('statechange',function(){
          if(hadCtl&&worker.state==='installed'&&!window.__orvexUpdating)showUpdate();
        });
      }
      navigator.serviceWorker.addEventListener('controllerchange',function(){
        if(hadCtl&&!window.__orvexUpdating)showUpdate();
      });
      window.addEventListener('load',async function(){
        try{
          var reg=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
          reg.addEventListener('updatefound',function(){watchInstalling(reg)});
          if(hadCtl&&reg.waiting)showUpdate();
          if(reg.installing)watchInstalling(reg);
          try{await reg.update()}catch(e){}
          if(hadCtl&&reg.waiting)showUpdate();
          /* احتياط إضافي: قارن نسخة كاش التطبيق بإصدار عامل الخدمة المنشور،
             حتى لا يفوتنا حدث updatefound في بعض المتصفحات أو عند فتح PWA مباشرة. */
          if(hadCtl&&window.caches){
            try{
              const probe=await fetch('sw.js?orvex-version-probe='+Date.now(),{cache:'no-store'});
              if(probe.ok){
                const source=await probe.text();
                const match=source.match(/const\\s+VER\\s*=\\s*['"]([^'"]+)['"]/);
                if(match){
                  const keys=await caches.keys();
                  const appCaches=keys.filter(k=>k.startsWith('orvex-root-')||/^orvex-v\\d/.test(k));
                  if(appCaches.length&&!appCaches.includes(match[1]))showUpdate();
                }
              }
            }catch(e){}
          }
        }catch(e){}
      });
    }
  }catch(e){}

  var updateAvailable=false;
  function showUpdate(){
    updateAvailable=true;
    var card=document.querySelector('#auth .auth-card');
    if(!card||document.getElementById('orvexLoginUpdate'))return;
    var b=document.createElement('button');
    b.id='orvexLoginUpdate';b.type='button';
    b.textContent='↻ تحديث البرنامج — إصدار جديد متاح';
    b.setAttribute('aria-label','تحديث برنامج ORVEX إلى الإصدار الجديد');
    b.style.cssText='display:flex;width:100%;justify-content:center;align-items:center;gap:8px;margin:18px 0 2px;padding:12px 14px;border:1px solid #087a43;border-radius:12px;background:#087a43;color:#fff;font:700 14px/1.4 "IBM Plex Sans Arabic",sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.16);cursor:pointer';
    b.addEventListener('click',async function(){
      var st=typeof window.__orvexStatus==='function'?window.__orvexStatus():null;
      if(st&&(st.busy||st.dirty)){try{toast('توجد عملية حفظ أو مزامنة جارية. انتظر اكتمالها ثم حدّث البرنامج.')}catch(e){alert('توجد عملية حفظ أو مزامنة جارية. انتظر اكتمالها ثم حدّث البرنامج.')}return}
      if(!confirm('يتوفر تحديث جديد لـ ORVEX. سيتم تطبيقه وإعادة تحميل شاشة الدخول. لن يتم تسجيل خروجك أو حذف بياناتك. هل تريد المتابعة؟'))return;
      b.disabled=true;b.textContent='جارٍ تثبيت التحديث…';
      try{if(typeof window.__orvexPrepareUpdate==='function')window.__orvexPrepareUpdate()}catch(e){}
      window.__orvexUpdating=true;
      try{await applyUpdate()}catch(e){}
      location.reload();
    });
    card.appendChild(b);
  }
  function watchLoginForUpdate(){
    if(updateAvailable)showUpdate();
  }
  try{
    var mo=new MutationObserver(watchLoginForUpdate);
    mo.observe(document.body,{childList:true,subtree:true});
  }catch(e){}


  /* 2) تخزين دائم + تنبيه امتلاء التخزين المحلي */
  try{
    if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(function(){});
    if(navigator.storage&&navigator.storage.estimate){
      navigator.storage.estimate().then(function(e){
        if(e&&e.quota&&e.usage/e.quota>0.8){
          window.addEventListener('load',function(){try{toast('مساحة التخزين المحلي شبه ممتلئة. احفظ نسخة احتياطية من الإعدادات')}catch(x){}});
        }
      }).catch(function(){});
    }
  }catch(e){}


  function applyUpdate(){
    return new Promise(function(resolve){
      if(!('serviceWorker' in navigator))return resolve();
      var done=false;function fin(){if(!done){done=true;resolve()}}
      setTimeout(fin,10000);
      navigator.serviceWorker.getRegistration().then(function(reg){
        if(!reg)return fin();
        function watch(w){
          if(!w)return fin();
          if(w.state==='activated')return fin();
          w.addEventListener('statechange',function(){if(w.state==='activated')fin()});
        }
        if(reg.waiting){try{reg.waiting.postMessage({type:'SKIP_WAITING'})}catch(e){}return watch(reg.waiting)}
        reg.update().then(function(){
          if(reg.installing)watch(reg.installing);
          else if(reg.waiting){try{reg.waiting.postMessage({type:'SKIP_WAITING'})}catch(e){}watch(reg.waiting)}
          else fin();
        }).catch(fin);
      }).catch(fin);
    });
  }



  /* 3) مؤشر حالة المزامنة (للقراءة فقط؛ يظهر بعد تسجيل الدخول للخادم) */
  var pill=null;
  function mk(){
    pill=document.createElement('span');pill.id='orvexSync';pill.setAttribute('aria-live','polite');
    pill.style.cssText='display:none;align-items:center;gap:5px;font:600 11.5px/1 "IBM Plex Sans Arabic",sans-serif;padding:4px 8px;border-radius:999px;background:rgba(127,127,127,.14);white-space:nowrap';
    var d=document.createElement('i');d.style.cssText='width:8px;height:8px;border-radius:50%;display:inline-block;background:#999';
    var t=document.createElement('span');pill.appendChild(d);pill.appendChild(t);
    var h=document.querySelector('header.top');
    if(h)h.appendChild(pill);else{pill.style.position='fixed';pill.style.top='calc(env(safe-area-inset-top,0px) + 4px)';pill.style.left='8px';pill.style.zIndex='50';document.body.appendChild(pill)}
  }
  function tick(){
    try{
      var s=typeof window.__orvexStatus==='function'?window.__orvexStatus():null;
      if(!pill)mk();
      if(!s||!s.logged){pill.style.display='none';return}
      var k,c;
      if(s.expired){k='exp';c='#d33'}
      else if(!navigator.onLine){k='off';c='#e67e00'}
      else if(s.busy){k='sync';c='#2a7fd4'}
      else if(s.dirty){k='wait';c='#e6a800'}
      else{k='ok';c='#1a9a4a'}
      pill.style.display='inline-flex';
      pill.firstChild.style.background=c;pill.lastChild.textContent=T(k);
    }catch(e){}
  }
  window.addEventListener('load',function(){tick();setInterval(tick,1500)});
  window.addEventListener('online',tick);window.addEventListener('offline',tick);
})();
