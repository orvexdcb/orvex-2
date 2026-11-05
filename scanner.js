/* ORVEX scanner.js: مسح الباركود بالكاميرا داخل شاشة المبيعات + دعم القارئ الخارجي.
   - المتصفح/WebView الذي يدعم BarcodeDetector: مسح مستمر بالكاميرا.
   - داخل تطبيق Capacitor: إضافة ML Kit الأصلية (@capacitor-mlkit/barcode-scanning) إن وُجدت.
   - غير ذلك: رسالة واضحة + إدخال الرمز يدويًا.
   - البحث دائمًا في db.products المحلية (تعمل دون إنترنت)، والإضافة عبر addCart نفسها فلا يتغير منطق الحساب. */
(function(){
const S={open:false,stream:null,raf:0,det:null,last:'',lastT:0,busy:false,count:0,native:false};
const norm=c=>String(c==null?'':c).trim();
const isNative=()=>{try{return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}catch(e){return false}};
const plug=()=>{try{return window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.BarcodeScanner}catch(e){return null}};

function findBySku(c){const q=norm(c).toLowerCase();if(!q)return null;if(window.orvexFindByCode)return window.orvexFindByCode(c);return db.products.find(p=>p.sku&&String(p.sku).trim().toLowerCase()===q)||null}

let ac=null;
function beep(ok){try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=ok?1200:300;g.gain.value=.08;o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+(ok?.08:.25))}catch(e){}try{if(navigator.vibrate)navigator.vibrate(ok?30:[60,40,60])}catch(e){}}

/* تعالج رمزًا ممسوحًا: تعيد {ok,reason,id}. الكمية 1 دائمًا، وتزيد تلقائيًا عند تكرار المنتج */
window.scanHandle=function(code){
  code=norm(code);if(!code)return{ok:false,reason:'empty'};
  const p=findBySku(code);
  if(!p){beep(false);toast('الباركود «'+code+'» غير موجود في المنتجات');return{ok:false,reason:'notfound'}}
  const before=(state.cart.find(l=>l.pid===p.id)||{}).qty||0;
  const _uq=window.__scanQty>1?window.__scanQty:1;window.__scanQty=0;addCart(p.id,_uq,true);
  const after=(state.cart.find(l=>l.pid===p.id)||{}).qty||0;
  const ok=after>before;beep(ok);
  return{ok,reason:ok?'added':'stock',id:p.id};
};

function setMsg(t,err){const m=document.getElementById('scanMsg');if(m){m.textContent=t;m.style.color=err?'#ff8a80':'#fff'}}
function errText(e){
  const n=e&&e.name;
  if(n==='NotAllowedError'||n==='SecurityError'||n==='PermissionDeniedError')return 'تم رفض إذن الكاميرا. فعّل الإذن من إعدادات الجهاز أو المتصفح ثم أعد المحاولة، أو اكتب الباركود أدناه.';
  if(n==='NotFoundError'||n==='OverconstrainedError')return 'لم يتم العثور على كاميرا في هذا الجهاز. اكتب الباركود أدناه أو استخدم قارئًا خارجيًا.';
  if(n==='NotReadableError'||n==='AbortError')return 'تعذّر تشغيل الكاميرا لأنها مستخدمة من تطبيق آخر. أغلق التطبيق الآخر وأعد المحاولة.';
  return 'تعذّر تشغيل الكاميرا'+(e&&e.message?': '+e.message:'')+'. يمكنك كتابة الباركود أدناه.';
}

window.scanClose=function(){
  S.open=false;cancelAnimationFrame(S.raf);
  if(S.stream){S.stream.getTracks().forEach(t=>t.stop());S.stream=null}
  const o=document.getElementById('scanOv');if(o)o.remove();
  if(typeof focusEntry==='function')focusEntry();
};
window.scanManual=function(){const i=document.getElementById('scanMan');if(!i)return;const v=i.value;i.value='';const r=scanHandle(v);if(r.ok){setMsg('تمت الإضافة ✓ ('+(++S.count)+')')}};

function overlay(){
  const o=document.createElement('div');o.id='scanOv';
  o.innerHTML='<div class="scan-box"><video id="scanVid" playsinline muted autoplay></video><div class="scan-line"></div></div>'+
   '<div id="scanMsg" class="scan-msg">جارٍ تشغيل الكاميرا…</div>'+
   '<div class="scan-man"><input id="scanMan" inputmode="text" autocomplete="off" placeholder="أو اكتب الباركود ثم Enter" onkeydown="if(event.key===\'Enter\'){event.preventDefault();scanManual()}"><button class="btn" onclick="scanManual()">إضافة</button></div>'+
   '<button class="btn primary scan-done" onclick="scanClose()">تم</button>';
  document.body.appendChild(o);return o;
}

async function loop(){
  if(!S.open||!S.det)return;
  const v=document.getElementById('scanVid');
  if(v&&v.readyState>=2&&!S.busy){
    S.busy=true;
    try{
      const r=await S.det.detect(v);
      if(r&&r.length){
        const c=norm(r[0].rawValue),now=Date.now();
        /* تجاهل تكرار الرمز نفسه خلال 1.2 ثانية (نفس المسحة)، وبعدها يُحسب مسحًا جديدًا فتزيد الكمية */
        if(c&&(c!==S.last||now-S.lastT>1200)){
          S.last=c;S.lastT=now;const res=scanHandle(c);
          setMsg(res.ok?'تمت الإضافة ✓ ('+(++S.count)+')':res.reason==='notfound'?'غير موجود: '+c:'المخزون لا يكفي',!res.ok);
        }else if(c===S.last)S.lastT=now;
      }
    }catch(e){}
    S.busy=false;
  }
  S.raf=requestAnimationFrame(loop);
}

async function nativeScan(){
  const P=plug();
  try{
    const sup=await P.isSupported();if(sup&&sup.supported===false)return false;
    let perm=await P.checkPermissions();
    if(!perm||perm.camera!=='granted'){perm=await P.requestPermissions();}
    if(!perm||(perm.camera!=='granted'&&perm.camera!=='limited')){toast('تم رفض إذن الكاميرا. فعّله من إعدادات الجهاز لتتمكن من المسح.');return true}
    let n=0;
    for(;;){/* مسح متتابع: تُفتح الكاميرا من جديد بعد كل رمز حتى يضغط المستخدم إلغاء */
      const r=await P.scan();
      const c=r&&r.barcodes&&r.barcodes[0]&&r.barcodes[0].rawValue;
      if(!c)break;
      scanHandle(c);n++;
    }
  }catch(e){const m=String(e&&e.message||e);if(!/cancel/i.test(m))toast('تعذّر تشغيل الماسح: '+m)}
  return true;
}

window.scanOpen=async function(){
  if(S.open)return;
  if(!document.getElementById('pos')){return toast('افتح شاشة المبيعات أولًا')}
  if(isNative()&&plug()){if(await nativeScan())return}
  S.open=true;S.count=0;S.last='';S.lastT=0;overlay();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){setMsg('الكاميرا غير متاحة هنا (تتطلب اتصالًا آمنًا HTTPS أو تطبيق ORVEX المثبّت). اكتب الباركود أدناه.',true);return}
  if(!('BarcodeDetector' in window)){setMsg('هذا الجهاز/المتصفح لا يدعم قراءة الباركود بالكاميرا. استخدم تطبيق ORVEX المثبّت، أو قارئًا خارجيًا، أو اكتب الباركود أدناه.',true);return}
  try{
    S.det=new BarcodeDetector();
    S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    if(!S.open){S.stream.getTracks().forEach(t=>t.stop());S.stream=null;return}
    const v=document.getElementById('scanVid');v.srcObject=S.stream;await v.play().catch(()=>{});
    setMsg('وجّه الكاميرا نحو الباركود');loop();
  }catch(e){setMsg(errText(e),true)}
};

/* قارئ خارجي (يعمل كلوحة مفاتيح): تسلسل أحرف سريع ينتهي بـ Enter خارج أي حقل إدخال */
let buf='',bt=0;
document.addEventListener('keydown',e=>{
  if(!document.getElementById('pos')||document.getElementById('modal'))return;
  const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
  const now=Date.now();
  if(e.key==='Enter'){if(buf.length>=4){e.preventDefault();scanHandle(buf)}buf='';return}
  if(e.key.length!==1||e.ctrlKey||e.metaKey||e.altKey)return;
  if(now-bt>80)buf='';bt=now;buf+=e.key;
});

/* زر المسح في رأس شاشة المبيعات (يعمل في التخطيطين) */
const _ph=window.posHead||(typeof posHead==='function'?posHead:null);
if(_ph){posHead=function(){return _ph().replace('<div class="ph-l">','<div class="ph-l"><button class="scanbtn" onclick="scanOpen()" aria-label="مسح الباركود">📷 مسح الباركود</button> ')}}

const st=document.createElement('style');
st.textContent='.scanbtn{background:#0c6a64;color:#fff;border:0;border-radius:8px;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer;margin-inline-end:8px}'+
'#scanOv{position:fixed;inset:0;z-index:99999;background:#000e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;padding-top:max(16px,env(safe-area-inset-top))}'+
'.scan-box{position:relative;width:min(92vw,520px);aspect-ratio:4/3;background:#111;border-radius:14px;overflow:hidden}'+
'.scan-box video{width:100%;height:100%;object-fit:cover}'+
'.scan-line{position:absolute;left:8%;right:8%;top:50%;height:2px;background:#ff3b30;box-shadow:0 0 8px #ff3b30}'+
'.scan-msg{color:#fff;text-align:center;max-width:520px;font-weight:600}'+
'.scan-man{display:flex;gap:8px;width:min(92vw,520px)}.scan-man input{flex:1;padding:10px;border-radius:8px;border:0;font:inherit}'+
'.scan-done{min-width:140px}';
document.head.appendChild(st);
})();
