/* ORVEX: PWA + مؤشر المزامنة + إشعار التحديث (ملف خارجي ليتوافق مع CSP) */
(function(){
  'use strict';
  var T=function(k){return({
    off:'غير متصل',sync:'جارٍ المزامنة',wait:'بانتظار الرفع',ok:'تمت المزامنة',exp:'انتهت الجلسة',
    upd:'تم تحديث التطبيق. أعد التحميل عند الانتهاء من العملية الحالية.',reload:'تحديث الآن',later:'لاحقًا'
  })[k]};

  /* 1) زر تحديث دائم: يفحص عامل الخدمة عند الطلب ويطبق النسخة الجديدة فقط بعد نقر المستخدم. */
  var swReg=null, updateAvailable=false, updateButton=null, checking=false;
  function updateButtonUI(){
    if(!updateButton)return;
    updateButton.textContent=updateAvailable?'↻ تحديث البرنامج — تحديث متاح':'↻ تحديث البرنامج';
    updateButton.setAttribute('aria-label',updateAvailable?'تطبيق تحديث ORVEX المتاح':'التحقق من تحديثات ORVEX');
    updateButton.style.background=updateAvailable?'#087a43':'#15251f';
    updateButton.style.borderColor=updateAvailable?'#087a43':'#355548';
  }
  function ensureUpdateButton(){
    if(updateButton&&updateButton.isConnected)return;
    updateButton=document.getElementById('orvexAlwaysUpdate');
    if(updateButton)return;
    var b=document.createElement('button');
    b.id='orvexAlwaysUpdate';b.type='button';
    b.textContent='↻ تحديث البرنامج';
    b.setAttribute('aria-label','التحقق من تحديثات ORVEX');
    b.style.cssText='position:fixed;left:12px;bottom:calc(82px + env(safe-area-inset-bottom,0px));z-index:9990;display:flex;align-items:center;justify-content:center;gap:7px;max-width:calc(100vw - 24px);padding:11px 15px;border:1px solid #355548;border-radius:999px;background:#15251f;color:#fff;font:700 13px/1.4 "IBM Plex Sans Arabic",sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;touch-action:manipulation';
    b.addEventListener('click',checkAndApplyUpdate);
    document.body.appendChild(b);updateButton=b;updateButtonUI();
  }
  function setUpdateAvailable(v){updateAvailable=!!v;updateButtonUI();}
  function waitForInstall(worker,timeout){
    return new Promise(function(resolve){
      if(!worker)return resolve(false);
      if(worker.state==='installed')return resolve(true);
      var done=false;function finish(v){if(done)return;done=true;worker.removeEventListener('statechange',changed);resolve(v)}
      function changed(){if(worker.state==='installed')finish(true);else if(worker.state==='redundant'||worker.state==='activated')finish(false)}
      worker.addEventListener('statechange',changed);setTimeout(function(){finish(worker.state==='installed')},timeout||12000);
    });
  }
  async function checkForUpdate(){
    if(!('serviceWorker' in navigator)||location.protocol.indexOf('http')!==0)return false;
    try{
      swReg=swReg||await navigator.serviceWorker.getRegistration();
      if(!swReg)swReg=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
      if(swReg.waiting){setUpdateAvailable(true);return true}
      var installing=swReg.installing;
      try{await swReg.update()}catch(e){}
      if(swReg.waiting){setUpdateAvailable(true);return true}
      installing=swReg.installing||installing;
      if(installing&&await waitForInstall(installing,12000)){
        await swReg.update().catch(function(){});
        if(swReg.waiting){setUpdateAvailable(true);return true}
      }
      setUpdateAvailable(!!swReg.waiting);
      return updateAvailable;
    }catch(e){return false}
  }
  async function checkAndApplyUpdate(){
    if(checking)return;checking=true;ensureUpdateButton();
    if(updateButton){updateButton.disabled=true;updateButton.textContent='جارٍ التحقق…'}
    try{
      var available=await checkForUpdate();
      if(!available){
        try{toast('لا يوجد تحديث جديد. برنامج ORVEX محدّث بالفعل.')}catch(e){alert('لا يوجد تحديث جديد. برنامج ORVEX محدّث بالفعل.')}
        return;
      }
      var st=typeof window.__orvexStatus==='function'?window.__orvexStatus():null;
      if(st&&(st.busy||st.dirty)){
        try{toast('توجد عملية حفظ أو مزامنة جارية. انتظر اكتمالها ثم حدّث البرنامج.')}catch(e){alert('توجد عملية حفظ أو مزامنة جارية. انتظر اكتمالها ثم حدّث البرنامج.')}
        return;
      }
      if(!confirm('يوجد تحديث جديد لـ ORVEX. سيتم تثبيته وإعادة تحميل التطبيق. لن يتم حذف بيانات المحل. هل تريد المتابعة؟'))return;
      if(updateButton)updateButton.textContent='جارٍ تثبيت التحديث…';
      try{if(typeof window.__orvexPrepareUpdate==='function')window.__orvexPrepareUpdate()}catch(e){}
      window.__orvexUpdating=true;
      await applyUpdate();
      location.reload();
    }finally{
      checking=false;
      if(updateButton){updateButton.disabled=false;updateButtonUI()}
    }
  }
  function watchInstalling(reg){
    var worker=reg&&reg.installing;if(!worker)return;
    worker.addEventListener('statechange',function(){
      if(worker.state==='installed'&&navigator.serviceWorker.controller)setUpdateAvailable(true);
    });
  }
  if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0){
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(window.__orvexUpdating)return;
      setUpdateAvailable(false);
    });
    window.addEventListener('load',async function(){
      try{
        swReg=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
        swReg.addEventListener('updatefound',function(){watchInstalling(swReg)});
        if(swReg.waiting)setUpdateAvailable(true);
        if(swReg.installing)watchInstalling(swReg);
      }catch(e){}
      ensureUpdateButton();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUpdateButton);
  else ensureUpdateButton();
  try{new MutationObserver(ensureUpdateButton).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
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
      setTimeout(fin,15000);
      navigator.serviceWorker.getRegistration().then(function(reg){
        if(!reg)return fin();
        function promoteWhenInstalled(w){
          if(!w)return fin();
          var promote=function(){
            if(w.state==='installed'){
              try{w.postMessage({type:'SKIP_WAITING'})}catch(e){}
            }
            if(w.state==='activated')fin();
          };
          promote();
          w.addEventListener('statechange',promote);
        }
        if(reg.waiting)return promoteWhenInstalled(reg.waiting);
        reg.update().then(function(){
          if(reg.installing)promoteWhenInstalled(reg.installing);
          else if(reg.waiting)promoteWhenInstalled(reg.waiting);
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
