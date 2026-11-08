/* ORVEX: الموقع الجغرافي للمحلات (إعدادات المحل) + «خريطة المحلات» للمؤسس.
   - بيانات الموقع في أعمدة shops (latitude, longitude, address, ...) وفق الترحيل 20261107210000.
   - الخريطة: Leaflet (مضمّنة محليًا في vendor/leaflet) + بلاطات OpenStreetMap (مجانية، بلا مفتاح، مع الإسناد المطلوب).
   - لا يُخزَّن موقع أي شخص ولا تتبع مستمر: GPS يُطلب مرة واحدة فقط عند ضغط «موقعي الحالي».
   يُحمَّل بعد feedback.js. */
(function(){
'use strict';
const SBX=()=>window.__orvexSync&&window.__orvexSync.SB;
const rq=(p,o)=>window.__orvexRequest(p,o);
const role=()=>{const s=SBX();return s&&s.sess&&s.prof?s.prof.role:null};
const isFounder=()=>role()==='founder';
const E=s=>(typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
const Q=s=>(typeof jsq==='function'?jsq(s):String(s).replace(/['\\]/g,'\\$&'));
const MIG='نفّذ ملف الترحيل supabase/migrations/20261107210000_feedback_center_and_shop_location.sql على Supabase أولاً.';
const hint=e=>{const m=String(e&&e.message||e);return /PGRST204|42703|column|latitude|longitude|governorate/i.test(m)?MIG+' ('+m+')':m};
const GOVS=['بغداد','نينوى','البصرة','أربيل','السليمانية','دهوك','كركوك','الأنبار','ديالى','صلاح الدين','بابل','كربلاء','النجف','واسط','ميسان','ذي قار','المثنى','القادسية'];
const LOCSEL='id,name,license_active,governorate,city,address,street,landmark,latitude,longitude,location_updated_at';
const gmaps=(la,lo)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(la+','+lo);
const hasLoc=r=>r&&r.latitude!=null&&r.longitude!=null;
const r6=n=>Math.round(n*1e6)/1e6;

/* تحقق من المدخلات (يطابق قيود قاعدة البيانات) */
function validateLoc(v){
 const t=k=>{const x=String(v[k]==null?'':v[k]).trim();return x||null};
 const lim={governorate:80,city:120,address:300,street:150,landmark:200};
 const data={};
 for(const k of Object.keys(lim)){data[k]=t(k);if(data[k]&&data[k].length>lim[k])return{ok:false,err:'الحقل أطول من المسموح ('+lim[k]+' حرفًا)'}}
 const la=String(v.latitude==null?'':v.latitude).trim(),lo=String(v.longitude==null?'':v.longitude).trim();
 if(!la&&!lo){data.latitude=null;data.longitude=null;return{ok:true,data}}
 if(!la||!lo)return{ok:false,err:'أدخل خط العرض وخط الطول معًا أو اتركهما فارغين'};
 const a=Number(la),b=Number(lo);
 if(!isFinite(a)||!isFinite(b))return{ok:false,err:'الإحداثيات يجب أن تكون أرقامًا'};
 if(a<-90||a>90)return{ok:false,err:'خط العرض يجب أن يكون بين -90 و90'};
 if(b<-180||b>180)return{ok:false,err:'خط الطول يجب أن يكون بين -180 و180'};
 data.latitude=r6(a);data.longitude=r6(b);return{ok:true,data};
}

/* ---------- تحميل Leaflet عند الحاجة فقط ---------- */
let leafP=null;
function loadLeaflet(){
 if(window.L&&window.L.map)return Promise.resolve(window.L);
 if(leafP)return leafP;
 leafP=new Promise((res,rej)=>{
  const l=document.createElement('link');l.rel='stylesheet';l.href='vendor/leaflet/leaflet.css';document.head.appendChild(l);
  const s=document.createElement('script');s.src='vendor/leaflet/leaflet.js';
  s.onload=()=>res(window.L);s.onerror=()=>{leafP=null;rej(new Error('تعذّر تحميل مكتبة الخريطة. تحقق من الاتصال بالإنترنت.'))};
  document.head.appendChild(s);
 });
 return leafP;
}
const pin=L=>L.divIcon({className:'ox-pin',html:'<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.6 13 23 13 23s13-13.4 13-23C28 6.8 22.2 1 15 1z" fill="#16a05b" stroke="#07140e" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>',iconSize:[30,38],iconAnchor:[15,37],popupAnchor:[0,-34]});
const tiles=L=>L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'});
const IRAQ=[33.2,43.7];

/* ---------- بطاقة «معلومات الموقع الجغرافي» في إعدادات المحل ---------- */
const canEditShop=()=>{const r=role();return r==='founder'||r==='manager'};
async function loadLocCard(){
 const box=document.getElementById('locCard'),s=SBX();if(!box||!s||!s.shop)return;
 try{
  const r=(await rq('/rest/v1/shops?id=eq.'+encodeURIComponent(s.shop)+'&select='+LOCSEL))[0];
  if(!r)throw new Error('تعذّر قراءة بيانات المحل');
  const rows=[['اسم المحل',r.name],['المحافظة',r.governorate],['المدينة أو المنطقة',r.city],['العنوان التفصيلي',r.address],['اسم الشارع',r.street],['أقرب نقطة دالة',r.landmark]];
  box.innerHTML='<h3>معلومات الموقع الجغرافي</h3>'+rows.map(x=>`<div class="row"><div class="grow"><small>${E(x[0])}</small><div>${E(x[1]||'—')}</div></div></div>`).join('')
   +`<div class="row"><div class="grow"><small>الإحداثيات (خط العرض / خط الطول)</small><div dir="ltr" style="text-align:start">${hasLoc(r)?E(r.latitude)+' , '+E(r.longitude):'—'}</div></div></div>`
   +(hasLoc(r)?'':'<p class="muted">لم يُحدَّد موقع المحل على الخريطة بعد (اختياري).</p>')
   +'<div class="actions">'+(canEditShop()?`<button class="btn primary" onclick="orvexShopLocEdit('${Q(s.shop)}')">${hasLoc(r)||r.address?'تعديل الموقع':'تحديد الموقع'}</button>`:'')
   +(hasLoc(r)?`<a class="btn" href="${E(gmaps(r.latitude,r.longitude))}" target="_blank" rel="noopener">فتح الموقع في خرائط Google</a>`:'')+'</div>'
   +(canEditShop()?'':'<p class="muted" style="font-size:12.5px">تعديل الموقع متاح لمدير المحل والمؤسس فقط.</p>');
 }catch(e){box.innerHTML='<h3>معلومات الموقع الجغرافي</h3><p class="muted">'+E(hint(e))+'</p>'}
}
if(typeof VIEWS==='object'&&VIEWS.settings){
 const _vset=VIEWS.settings;
 VIEWS.settings=function(){
  const h=_vset.apply(this,arguments),s=SBX();
  if(typeof h!=='string'||!s||!s.sess||!s.shop||role()==='mall_manager')return h;
  setTimeout(loadLocCard,80);
  return h+'<div class="card" id="locCard"><h3>معلومات الموقع الجغرافي</h3><p class="muted">جارٍ التحميل…</p></div>';
 };
}

/* ---------- محرر الموقع (خريطة + حقول) ---------- */
let ED=null;
window.orvexShopLocEdit=async function(shopId){
 const s=SBX();
 if(!s||!s.sess)return toast('سجّل الدخول أولاً');
 if(!canEditShop())return toast('تعديل الموقع لمدير المحل أو المؤسس فقط');
 if(role()==='manager'&&shopId!==s.shop)return toast('لا يمكنك تعديل موقع محل آخر');
 let r;
 try{r=(await rq('/rest/v1/shops?id=eq.'+encodeURIComponent(shopId)+'&select='+LOCSEL))[0];if(!r)throw new Error('المحل غير موجود')}catch(e){return toast(hint(e))}
 let L=null,mapErr='';
 try{L=await loadLeaflet()}catch(e){mapErr=e.message}
 modal('معلومات الموقع الجغرافي',`<label>اسم المحل</label><input value="${E(r.name)}" readonly>
  <div class="f2"><div><label for="lc_gov">المحافظة</label><input id="lc_gov" list="lc_govs" maxlength="80" value="${E(r.governorate||'')}"><datalist id="lc_govs">${GOVS.map(g=>`<option value="${E(g)}">`).join('')}</datalist></div>
  <div><label for="lc_city">المدينة أو المنطقة</label><input id="lc_city" maxlength="120" value="${E(r.city||'')}"></div></div>
  <label for="lc_addr">العنوان التفصيلي</label><input id="lc_addr" maxlength="300" value="${E(r.address||'')}">
  <div class="f2"><div><label for="lc_street">اسم الشارع</label><input id="lc_street" maxlength="150" value="${E(r.street||'')}"></div>
  <div><label for="lc_lm">أقرب نقطة دالة</label><input id="lc_lm" maxlength="200" value="${E(r.landmark||'')}"></div></div>
  <div class="f2"><div><label for="lc_lat">خط العرض Latitude</label><input id="lc_lat" dir="ltr" inputmode="decimal" value="${hasLoc(r)?E(r.latitude):''}" oninput="orvexLocInput()"></div>
  <div><label for="lc_lng">خط الطول Longitude</label><input id="lc_lng" dir="ltr" inputmode="decimal" value="${hasLoc(r)?E(r.longitude):''}" oninput="orvexLocInput()"></div></div>
  ${L?'<div id="lc_map" class="ox-map" role="application" aria-label="خريطة تحديد موقع المحل"></div><p class="muted" style="font-size:12.5px;margin:6px 0">اضغط على الخريطة لوضع العلامة أو اسحبها لتصحيح الموقع.</p>':`<p class="note">${E(mapErr||'الخريطة غير متاحة')}. يمكنك إدخال الإحداثيات يدويًا.</p>`}
  <div class="actions"><button class="btn" type="button" onclick="orvexLocGps()">📍 استخدام موقعي الحالي (GPS)</button><a class="btn" id="lc_g" target="_blank" rel="noopener" style="display:none">فتح الموقع في خرائط Google</a></div>
  <div id="lc_prev" class="muted" style="font-size:13px"></div>
  <div class="actions"><button class="btn primary" id="lc_save" onclick="orvexShopLocSave('${Q(shopId)}')">حفظ الموقع</button>${hasLoc(r)?'<button class="btn danger" type="button" onclick="orvexLocClear()">إزالة الإحداثيات</button>':''}<button class="btn" onclick="closeModal()">إلغاء</button></div>`);
 ED={L,map:null,marker:null,shopId};
 if(L){
  const has=hasLoc(r),m=L.map('lc_map',{scrollWheelZoom:false}).setView(has?[r.latitude,r.longitude]:IRAQ,has?16:6);
  tiles(L).addTo(m);ED.map=m;
  m.on('click',e=>setPos(e.latlng.lat,e.latlng.lng,{}));
  if(has)putMarker(r.latitude,r.longitude);
  setTimeout(()=>{try{m.invalidateSize()}catch(e){}},120);
 }
 paintPrev();
};
function putMarker(la,lo){
 if(!ED||!ED.L||!ED.map)return;
 if(!ED.marker){ED.marker=ED.L.marker([la,lo],{draggable:true,icon:pin(ED.L)}).addTo(ED.map);ED.marker.on('dragend',()=>{const p=ED.marker.getLatLng();setPos(p.lat,p.lng,{noMove:true})})}
 else ED.marker.setLatLng([la,lo]);
}
function setPos(la,lo,o){
 la=r6(la);lo=r6(lo);
 const a=document.getElementById('lc_lat'),b=document.getElementById('lc_lng');if(!a||!b)return;
 a.value=la;b.value=lo;putMarker(la,lo);
 if(ED&&ED.map&&!o.noMove)ED.map.setView([la,lo],o.zoom||Math.max(ED.map.getZoom(),15));
 paintPrev();
}
window.orvexLocInput=function(){
 const la=document.getElementById('lc_lat').value.trim(),lo=document.getElementById('lc_lng').value.trim();
 const a=Number(la),b=Number(lo);
 if(la&&lo&&isFinite(a)&&isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180){putMarker(a,b);if(ED&&ED.map)ED.map.setView([a,b],Math.max(ED.map.getZoom(),15))}
 paintPrev();
};
function paintPrev(){
 const p=document.getElementById('lc_prev'),g=document.getElementById('lc_g');if(!p)return;
 const v=validateLoc({latitude:document.getElementById('lc_lat').value,longitude:document.getElementById('lc_lng').value});
 if(v.ok&&v.data.latitude!=null){p.innerHTML='معاينة الموقع: <bdi dir="ltr">'+E(v.data.latitude)+' , '+E(v.data.longitude)+'</bdi>';if(g){g.href=gmaps(v.data.latitude,v.data.longitude);g.style.display=''}}
 else{p.textContent=v.ok?'لم يُحدَّد موقع بعد (اختياري).':v.err;if(g)g.style.display='none'}
}
window.orvexLocClear=function(){
 document.getElementById('lc_lat').value='';document.getElementById('lc_lng').value='';
 if(ED&&ED.marker){ED.marker.remove();ED.marker=null}
 paintPrev();toast('أُزيلت الإحداثيات — اضغط «حفظ الموقع» لتثبيت ذلك');
};
window.orvexLocGps=function(){
 if(!navigator.geolocation)return toast('المتصفح لا يدعم تحديد الموقع. حدّد الموقع يدويًا على الخريطة.');
 toast('جارٍ تحديد موقعك… وافق على طلب الإذن إن ظهر');
 /* طلب واحد فقط بعد ضغط المستخدم؛ لا watchPosition ولا تخزين لموقع الشخص */
 navigator.geolocation.getCurrentPosition(p=>{setPos(p.coords.latitude,p.coords.longitude,{zoom:17});toast('تم تحديد موقعك الحالي. حرّك العلامة إن لزم ثم احفظ.')},
  e=>toast(e&&e.code===1?'تم رفض إذن الموقع. فعّله من إعدادات المتصفح أو حدّد الموقع يدويًا على الخريطة.':e&&e.code===2?'تعذّر تحديد موقعك حاليًا. حدّده يدويًا على الخريطة.':'انتهت مهلة تحديد الموقع. حاول مجددًا أو حدّده يدويًا.'),
  {enableHighAccuracy:true,timeout:15000,maximumAge:0});
};
window.orvexShopLocSave=async function(shopId){
 const g=id=>document.getElementById(id)?.value;
 const v=validateLoc({governorate:g('lc_gov'),city:g('lc_city'),address:g('lc_addr'),street:g('lc_street'),landmark:g('lc_lm'),latitude:g('lc_lat'),longitude:g('lc_lng')});
 if(!v.ok)return toast(v.err);
 if(navigator.onLine===false)return toast('لا يوجد إنترنت. حاول عند عودة الاتصال.');
 const btn=document.getElementById('lc_save');if(btn)btn.disabled=true;
 try{
  const res=await rq('/rest/v1/shops?id=eq.'+encodeURIComponent(shopId),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(v.data)});
  if(!Array.isArray(res)||!res.length)throw new Error('لم يُحفظ الموقع: ليست لديك صلاحية تعديل هذا المحل');
  const s=SBX();if(s&&Array.isArray(s.shops)){const x=s.shops.find(y=>y.id===shopId);if(x)Object.assign(x,v.data)}
  ED=null;closeModal();toast('تم حفظ موقع المحل');
  loadLocCard();if(document.getElementById('fmap'))refreshMap();
 }catch(e){toast('تعذّر حفظ الموقع: '+hint(e));if(btn)btn.disabled=false}
};

/* ---------- خريطة المحلات (المؤسس) ---------- */
const M={shops:[],mgr:{},malls:[],f:{q:'',gov:'',st:'',mall:''},map:null,layer:null,markers:{},err:null};
async function loadMapData(){
 M.err=null;
 try{
  const [S,P,ML]=await Promise.all([
   rq('/rest/v1/shops?select='+LOCSEL+'&order=name'),
   rq('/rest/v1/profiles?role=eq.manager&select=id,full_name,username,shop_id').catch(()=>[]),
   rq('/rest/v1/rpc/mall_admin_list',{method:'POST',body:'{}'}).catch(()=>[])]);
  M.shops=S;M.mgr={};P.forEach(p=>{if(p.shop_id&&!M.mgr[p.shop_id])M.mgr[p.shop_id]=p});
  M.malls=Array.isArray(ML)?ML:[];
 }catch(e){M.shops=[];M.err=hint(e)}
}
const mallsOf=id=>M.malls.filter(m=>Array.isArray(m.shop_ids)&&m.shop_ids.map(String).includes(String(id)));
const mgrName=id=>{const p=M.mgr[id];return p?p.full_name+(p.username?' (@'+p.username+')':''):'—'};
function filtered(){
 const f=M.f;
 const mall=f.mall?M.malls.find(m=>String(m.id)===f.mall):null,ids=mall?new Set((mall.shop_ids||[]).map(String)):null;
 return M.shops.filter(s=>(!f.q||String(s.name).toLowerCase().includes(f.q))&&(!f.gov||s.governorate===f.gov)
  &&(!f.st||(f.st==='active')===!!s.license_active)&&(!ids||ids.has(String(s.id))));
}
window.orvexShopsMap=async function(){
 if(!isFounder())return toast('هذه الشاشة للمؤسس فقط');
 closeModal();
 let o=document.getElementById('fmap');
 if(!o){o=document.createElement('div');o.id='fmap';o.setAttribute('dir','rtl');document.body.appendChild(o);document.body.classList.add('noscroll')}
 o.innerHTML='<div class="fmap-h"><button class="btn" onclick="orvexShopsMapClose()">رجوع</button><h2>خريطة المحلات</h2></div><div class="fmap-b"><p class="muted">جارٍ التحميل…</p></div>';
 let L=null,mapErr='';
 try{L=await loadLeaflet()}catch(e){mapErr=e.message}
 await loadMapData();
 drawMapScreen(L,mapErr);
};
window.orvexShopsMapClose=function(){
 const o=document.getElementById('fmap');if(M.map){try{M.map.remove()}catch(e){}M.map=null;M.layer=null;M.markers={}}
 if(o)o.remove();document.body.classList.remove('noscroll');
};
function refreshMap(){loadMapData().then(()=>{if(document.getElementById('fmap')){const L=window.L&&window.L.map?window.L:null;if(M.map){try{M.map.remove()}catch(e){}M.map=null;M.layer=null;M.markers={}}drawMapScreen(L,L?'':'الخريطة غير متاحة')}})}
function drawMapScreen(L,mapErr){
 const o=document.getElementById('fmap');if(!o)return;
 const govs=[...new Set(M.shops.map(s=>s.governorate).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
 o.innerHTML=`<div class="fmap-h"><button class="btn" onclick="orvexShopsMapClose()">رجوع</button><h2>خريطة المحلات</h2><button class="btn" onclick="orvexShopsMap()" title="تحديث" aria-label="تحديث">⟳</button></div>
 <div class="fmap-b">${M.err?`<div class="note">${E(M.err)}</div>`:''}${mapErr?`<div class="note">${E(mapErr)}</div>`:''}
  <div class="fb-flt"><input id="fm_q" type="search" placeholder="بحث باسم المحل…" value="${E(M.f.q)}" oninput="orvexMapFilter()">
   <select id="fm_gov" onchange="orvexMapFilter()"><option value="">كل المحافظات</option>${govs.map(g=>`<option ${M.f.gov===g?'selected':''}>${E(g)}</option>`).join('')}</select>
   <select id="fm_st" onchange="orvexMapFilter()"><option value="">كل الحالات</option><option value="active" ${M.f.st==='active'?'selected':''}>فعال</option><option value="inactive" ${M.f.st==='inactive'?'selected':''}>غير فعال</option></select>
   <select id="fm_mall" onchange="orvexMapFilter()"><option value="">كل المجمعات</option>${M.malls.map(m=>`<option value="${E(m.id)}" ${M.f.mall===String(m.id)?'selected':''}>${E(m.name)}</option>`).join('')}</select></div>
  <div id="fm_cnt" class="muted" style="margin-bottom:8px"></div>
  ${L?'<div id="fm_map" class="ox-map ox-map-big" role="application" aria-label="خريطة المحلات"></div>':''}
  <h3 style="margin:14px 0 6px">المحلات ذات الموقع المحدد</h3><div id="fm_placed"></div>
  <h3 style="margin:14px 0 6px">محلات لم تُسجَّل مواقعها</h3><div id="fm_unplaced"></div></div>`;
 if(L){
  M.map=L.map('fm_map').setView(IRAQ,6);tiles(L).addTo(M.map);M.layer=L.layerGroup().addTo(M.map);
  setTimeout(()=>{try{M.map.invalidateSize()}catch(e){}},150);
 }
 drawMapData();
}
window.orvexMapFilter=function(){
 const g=id=>document.getElementById(id);
 M.f={q:(g('fm_q')?.value||'').trim().toLowerCase(),gov:g('fm_gov')?.value||'',st:g('fm_st')?.value||'',mall:g('fm_mall')?.value||''};
 drawMapData();
};
function popup(s){
 const ml=mallsOf(s.id).map(m=>m.name);
 return `<div class="ox-pop" dir="rtl"><b>${E(s.name)}</b>
  <div>المدير: ${E(mgrName(s.id))}</div><div>المحافظة / المنطقة: ${E([s.governorate,s.city].filter(Boolean).join(' / ')||'—')}</div>
  <div>العنوان: ${E([s.address,s.street,s.landmark].filter(Boolean).join('، ')||'—')}</div>
  ${ml.length?`<div>المجمع: ${E(ml.join('، '))}</div>`:''}
  <div>الحالة: <span class="ox-st ${s.license_active?'on':'off'}">${s.license_active?'فعال':'غير فعال'}</span></div>
  <div class="ox-pa"><a class="btn" href="${E(gmaps(s.latitude,s.longitude))}" target="_blank" rel="noopener">فتح في Google Maps</a><button class="btn" onclick="orvexShopLocEdit('${Q(s.id)}')">تعديل الموقع</button></div></div>`;
}
function drawMapData(){
 const list=filtered(),placed=list.filter(hasLoc),un=list.filter(s=>!hasLoc(s)),all=M.shops.filter(hasLoc).length;
 const cnt=document.getElementById('fm_cnt');
 if(cnt)cnt.textContent=`المحلات التي لديها مواقع محددة: ${all} من ${M.shops.length}`+(list.length!==M.shops.length?` — المعروض بعد التصفية: ${list.length}`:'');
 if(M.map&&M.layer&&window.L){
  M.layer.clearLayers();M.markers={};
  placed.forEach(s=>{const m=window.L.marker([s.latitude,s.longitude],{icon:pin(window.L),title:s.name}).bindPopup(popup(s),{maxWidth:280});m.addTo(M.layer);M.markers[s.id]=m});
  if(placed.length){try{M.map.fitBounds(window.L.latLngBounds(placed.map(s=>[s.latitude,s.longitude])),{padding:[40,40],maxZoom:15})}catch(e){}}
 }
 const row=(s,btn)=>`<div class="row" style="align-items:center"><div class="grow" style="min-width:0"><div class="t" style="white-space:normal">${E(s.name)}</div><small>${E([s.governorate,s.city].filter(Boolean).join(' / ')||'بدون عنوان')} · المدير: ${E(mgrName(s.id))}${mallsOf(s.id).length?' · المجمع: '+E(mallsOf(s.id).map(m=>m.name).join('، ')):''}</small></div><span class="badge ${s.license_active?'':'grey'}">${s.license_active?'فعال':'غير فعال'}</span>${btn}</div>`;
 const pl=document.getElementById('fm_placed'),ul=document.getElementById('fm_unplaced');
 if(pl)pl.innerHTML=placed.length?'<div class="card" style="padding:4px 12px">'+placed.map(s=>row(s,`<button class="btn" onclick="orvexMapFocus('${Q(s.id)}')">عرض</button>`)).join('')+'</div>':'<p class="muted">لا توجد محلات مطابقة لها موقع.</p>';
 if(ul)ul.innerHTML=un.length?'<div class="card" style="padding:4px 12px">'+un.map(s=>row(s,`<button class="btn primary" onclick="orvexShopLocEdit('${Q(s.id)}')">تحديد الموقع</button>`)).join('')+'</div>':'<p class="muted">كل المحلات المعروضة لها مواقع.</p>';
}
window.orvexMapFocus=function(id){
 const m=M.markers[id];if(!m||!M.map)return;
 M.map.setView(m.getLatLng(),Math.max(M.map.getZoom(),16));m.openPopup();
 const el=document.getElementById('fm_map');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
};

/* ---------- بطاقة لوحة المؤسس ---------- */
if(typeof VIEWS==='object'&&VIEWS.studio){
 const _vs=VIEWS.studio;
 VIEWS.studio=function(){
  const h=_vs.apply(this,arguments);
  if(typeof h==='string'&&h.includes('id="shopList"')&&!h.includes('id="mapCard"'))
   return h.replace('<div class="card" id="shopList"','<div class="card" id="mapCard"><h3>خريطة المحلات</h3><p class="muted">عرض مواقع كل المحلات على خريطة واحدة، مع البحث والتصفية حسب المحافظة والحالة والمجمع.</p><div class="actions"><button class="btn primary" onclick="orvexShopsMap()">فتح الخريطة</button></div></div><div class="card" id="shopList"');
  return h;
 };
}

/* ---------- التنسيق ---------- */
const st=document.createElement('style');
st.textContent=`.ox-map{width:100%;height:260px;border-radius:12px;border:1px solid var(--line,#d9e8df);overflow:hidden;position:relative;z-index:0}
.ox-map-big{height:min(60vh,520px)}.ox-pin{background:none;border:0}
.leaflet-container{font-family:inherit}.leaflet-popup-content{direction:rtl;text-align:start;margin:12px 14px}
.ox-pop>div{margin:2px 0;font-size:13px}.ox-pop b{font-size:15px;color:#0a7a52}.ox-pa{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.ox-pa .btn{font-size:12px;padding:6px 10px;color:#12372a;text-decoration:none}
.ox-st{font-weight:700;border-radius:999px;padding:1px 8px}.ox-st.on{background:#d9f5e3;color:#13693a}.ox-st.off{background:#eee;color:#666}
#fmap{position:fixed;inset:0;z-index:90;background:var(--bg,#fff);color:var(--ink,#123);overflow:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom,0)}
#fmap .fmap-h{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface,#fff);border-bottom:1px solid var(--line,#d9e8df)}
#fmap .fmap-h h2{flex:1;margin:0;font-size:17px}#fmap .fmap-b{max-width:960px;margin:0 auto;padding:14px}`;
document.head.appendChild(st);

window.__orvexMaps={validateLoc,gmaps,GOVS,hasLoc};
})();
