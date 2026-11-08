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
      navigator.serviceWorker.addEventListener('controllerchange',function(){if(hadCtl)showUpdate()});
      window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})});
    }
  }catch(e){}

  function showUpdate(){
    if(document.getElementById('orvexUpd'))return;
    var b=document.createElement('div');b.id='orvexUpd';
    b.setAttribute('role','status');
    b.style.cssText='position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);z-index:9999;background:#0c6a64;color:#fff;border-radius:12px;padding:10px 12px;display:flex;gap:8px;align-items:center;font:13px/1.5 "IBM Plex Sans Arabic",sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)';
    var s=document.createElement('span');s.style.flex='1';s.textContent=T('upd');
    var r=document.createElement('button');r.textContent=T('reload');
    r.style.cssText='background:#fff;color:#0c6a64;border:0;border-radius:8px;padding:6px 10px;font:inherit;font-weight:600;cursor:pointer';
    r.addEventListener('click',function(){location.reload()});
    var l=document.createElement('button');l.textContent=T('later');
    l.style.cssText='background:transparent;color:#fff;border:0;padding:6px;font:inherit;cursor:pointer';
    l.addEventListener('click',function(){b.remove()});
    b.appendChild(s);b.appendChild(r);b.appendChild(l);document.body.appendChild(b);
  }

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


  /* 4) زر تحديث يدوي دائم بعد تسجيل الدخول، لجميع الأدوار والأجهزة */
  function addManualUpdate(){
    var s=typeof window.__orvexStatus==='function'?window.__orvexStatus():null;
    var logged=!!(s&&s.logged);
    var b=document.getElementById('orvexManualUpdate');
    if(!logged){if(b)b.remove();return}
    if(b)return;
    b=document.createElement('button');b.id='orvexManualUpdate';b.type='button';
    b.textContent='↻ تحديث البرنامج';
    b.setAttribute('aria-label','تحديث برنامج ORVEX');
    b.style.cssText='position:fixed;top:calc(env(safe-area-inset-top,0px) + 58px);inset-inline-end:10px;z-index:8999;border:1px solid #087a43;border-radius:999px;background:#087a43;color:#fff;padding:8px 13px;font:600 12px/1.2 "IBM Plex Sans Arabic",sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.18);cursor:pointer';
    b.addEventListener('click',async function(){
      var st=typeof window.__orvexStatus==='function'?window.__orvexStatus():null;
      if(st&&(st.busy||st.dirty)){try{toast('توجد عملية حفظ أو مزامنة جارية. انتظر اكتمالها ثم حدّث البرنامج.')}catch(e){alert('توجد عملية حفظ أو مزامنة جارية. انتظر اكتمالها ثم حدّث البرنامج.')}return}
      if(!confirm('سيتم إعادة تحميل ORVEX. تأكد من إكمال أي فاتورة أو تعديل مفتوح. هل تريد المتابعة؟'))return;
      b.disabled=true;b.textContent='جارٍ التحديث…';
      /* احفظ رمز الجلسة الحالي قبل إعادة تحميل التطبيق؛ لا تحفظ كلمة المرور ولا بيانات المتجر هنا. */
      try{if(typeof window.__orvexPrepareUpdate==='function')window.__orvexPrepareUpdate()}catch(e){}
      try{
        if('serviceWorker' in navigator){
          var reg=await navigator.serviceWorker.getRegistration();
          if(reg)await reg.update().catch(function(){});
        }
      }catch(e){}
      location.reload();
    });
    document.body.appendChild(b);
  }
  function updateManualButton(){try{addManualUpdate()}catch(e){}}
  window.addEventListener('load',function(){updateManualButton();setInterval(updateManualButton,1500)});

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
