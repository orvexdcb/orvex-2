/* ORVEX: مركز الاقتراحات والبلاغات + إشعارات المؤسس.
   - يعيد استخدام جدول public.feedback_requests (الترحيل: supabase/migrations/20261107210000_*.sql).
   - الإشعارات تُشتق من الطلبات نفسها (founder_read_at is null) وتظهر في جرس الإشعارات الحالي؛ لا نظام موازٍ.
   - زر الاقتراحات في الشريط العلوي بجانب الجرس (لا زر عائم).
   يُحمَّل بعد server.js و mall.js. */
(function(){
'use strict';
const SBX=()=>window.__orvexSync&&window.__orvexSync.SB;
const rq=(p,o)=>window.__orvexRequest(p,o);
const role=()=>{const s=SBX();return s&&s.sess&&s.prof?s.prof.role:null};
const isFounder=()=>role()==='founder';
const TYPES={
 suggestion:{l:'اقتراح تطوير',ic:'💡',n:'اقتراح جديد'},
 bug:{l:'الإبلاغ عن مشكلة تقنية',ic:'🐞',n:'بلاغ مشكلة تقنية'},
 support:{l:'طلب مساعدة أو دعم',ic:'🛟',n:'طلب مساعدة جديد'}};
const ST={new:'جديد',in_progress:'قيد المراجعة',resolved:'تمت المعالجة'};
const MIG='نفّذ ملف الترحيل supabase/migrations/20261107210000_feedback_center_and_shop_location.sql على Supabase أولاً.';
const hint=e=>{const m=String(e&&e.message||e);return /PGRST204|42703|column|founder_read_at|title|feedback_internal_notes|PGRST205|relation/i.test(m)?MIG+' ('+m+')':m};
const shopLabel=n=>{n=String(n||'').trim();return n?(/^محل(\s|$)/.test(n)?n:'محل '+n):'محل غير معروف'};
const fmtDT=t=>{try{return new Date(t).toLocaleString('en-GB',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return String(t||'')}};
const E=s=>(typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
const Q=s=>(typeof jsq==='function'?jsq(s):String(s).replace(/['\\]/g,'\\$&'));
const SEL='id,shop_id,submitted_by,request_type,area,title,message,contact_name,contact_email,contact_phone,status,created_at,updated_at,founder_read_at';

/* ---------- أسماء المحلات (للمؤسس) ---------- */
let SHOPN={};
async function shopNames(force){
 const s=SBX();if(!isFounder())return SHOPN;
 if(!force&&Object.keys(SHOPN).length)return SHOPN;
 try{const rows=(s.shops&&s.shops.length&&!force)?s.shops:await rq('/rest/v1/shops?select=id,name');SHOPN={};rows.forEach(r=>{SHOPN[r.id]=r.name})}catch(e){}
 return SHOPN;
}
const shopOf=r=>r.shop_id?shopLabel(SHOPN[r.shop_id]):'المؤسس (بدون محل)';
const notifText=r=>{const t=TYPES[r.request_type]||TYPES.suggestion;return t.ic+' '+t.n+' من '+shopOf(r)+(r.status&&r.status!=='new'?' — '+ST[r.status]:'')};

/* ---------- الزر في الشريط العلوي ---------- */
if(typeof IC==='object'&&!IC.bulb)IC.bulb='<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>';
const bulbIcon=()=>typeof svg==='function'?svg('bulb'):'💡';
function mountTop(){
 const old=document.getElementById('orvexFeedbackShortcut');if(old)old.remove();/* إزالة الزر العائم القديم إن وُجد */
 const r=role(),show=!!r&&r!=='mall_manager';
 document.querySelectorAll('.od-h').forEach(h=>{
  const bells=h.querySelectorAll('.od-feed');
  for(let i=1;i<bells.length;i++)bells[i].remove();/* لا يظهر الزر مرتين */
  const bell=h.querySelector('.od-bell:not(.od-feed)');
  if(!show||!bell){bells.forEach(b=>b.remove());return}
  if(!bells.length){const b=document.createElement('button');b.type='button';b.className='od-bell od-feed';b.title='الاقتراحات والبلاغات';b.setAttribute('aria-label','الاقتراحات والبلاغات');b.innerHTML=bulbIcon();b.addEventListener('click',()=>window.orvexFeedbackForm());bell.parentNode.insertBefore(b,bell)}
 });
 if(isFounder())startPoll();else stopPoll();
 paintBadge();
}
let mt=0;const schedule=()=>{clearTimeout(mt);mt=setTimeout(mountTop,40)};

/* ---------- إشعارات المؤسس (من الطلبات غير المقروءة) ---------- */
const N={ids:new Set(),items:[],first:true,timer:null,busy:false,err:null};
async function refreshUnread(){
 if(!isFounder()||N.busy)return;N.busy=true;
 try{
  const rows=await rq('/rest/v1/feedback_requests?select=id,shop_id,request_type,title,status,created_at&founder_read_at=is.null&order=created_at.desc&limit=50');
  await shopNames();
  const fresh=rows.filter(r=>!N.ids.has(r.id));
  N.items=rows;N.ids=new Set(rows.map(r=>r.id));N.err=null;
  if(!N.first&&fresh.length&&typeof toast==='function')toast(notifText(fresh[0])+(fresh.length>1?' (+'+(fresh.length-1)+')':''));
  N.first=false;paintBadge();
 }catch(e){N.err=hint(e)}finally{N.busy=false}
}
function startPoll(){if(N.timer)return;N.first=true;refreshUnread();N.timer=setInterval(()=>{if(!document.hidden)refreshUnread()},25000)}
function stopPoll(){if(!N.timer)return;clearInterval(N.timer);N.timer=null;N.ids=new Set();N.items=[];SHOPN={}}
function paintBadge(){
 document.querySelectorAll('.od-bell:not(.od-feed)').forEach(b=>{
  let c=b.querySelector('.od-cnt');const n=isFounder()?N.items.length:0;
  if(!n){if(c)c.remove();return}
  if(!c){c=document.createElement('b');c.className='od-cnt';b.appendChild(c)}
  const tx=n>9?'9+':String(n);if(c.textContent!==tx)c.textContent=tx;/* لا نكتب إلا عند التغيّر: المراقب يعيد استدعاء هذه الدالة */
  const al='التنبيهات ('+n+' غير مقروء)';if(b.getAttribute('aria-label')!==al)b.setAttribute('aria-label',al);
 });
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshUnread()});
window.addEventListener('online',()=>refreshUnread());

const _stockBell=window.dashBell;
window.dashBell=function(){
 if(!isFounder())return typeof _stockBell==='function'?_stockBell.apply(this,arguments):undefined;
 founderBell();
};
async function founderBell(){
 if(typeof modal!=='function')return;
 await refreshUnread();
 const low=(typeof db!=='undefined'&&db.products)?db.products.filter(p=>p.stock<=p.min):[];
 const list=N.items.length?N.items.map(r=>`<div class="fb-n"><button class="fb-nmain" onclick="orvexFeedbackNotifOpen('${Q(r.id)}')"><span class="fb-nt">${E(notifText(r))}</span><small>${E(r.title||'')}${r.title?' · ':''}${E(fmtDT(r.created_at))}</small></button><button class="fb-mark" title="تعليم كمقروء" aria-label="تعليم كمقروء" onclick="orvexFeedbackMarkRead('${Q(r.id)}')">✓</button></div>`).join(''):`<p class="muted">${N.err?E(N.err):'لا توجد إشعارات جديدة.'}</p>`;
 modal('الإشعارات'+(N.items.length?' ('+N.items.length+')':''),`<div class="card" style="padding:4px 12px">${list}</div><div class="actions">${N.items.length?'<button class="btn" onclick="orvexFeedbackMarkAll()">تعليم الكل كمقروء</button>':''}<button class="btn primary" onclick="orvexFeedbackCenter()">مركز الاقتراحات والبلاغات</button>${low.length&&_stockBell?`<button class="btn" onclick="closeModal();(window.__orvexStockBell||function(){})()">تنبيهات المخزون (${low.length})</button>`:''}</div>`);
}
window.__orvexStockBell=function(){if(typeof _stockBell==='function')_stockBell()};
window.orvexFeedbackNotifOpen=id=>{closeModal();window.orvexFeedbackCenter(id)};
async function patchRead(filter){
 return rq('/rest/v1/feedback_requests?'+filter,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({founder_read_at:new Date().toISOString()})});
}
window.orvexFeedbackMarkRead=async function(id){
 try{await patchRead('id=eq.'+encodeURIComponent(id)+'&founder_read_at=is.null');N.items=N.items.filter(r=>r.id!==id);N.ids.delete(id);paintBadge();founderBell();if(C.rows.length){const r=C.rows.find(x=>x.id===id);if(r)r.founder_read_at=new Date().toISOString();drawList()}}
 catch(e){toast('تعذّر التحديث: '+hint(e))}
};
window.orvexFeedbackMarkAll=async function(){
 try{await patchRead('founder_read_at=is.null');N.items=[];N.ids=new Set();paintBadge();closeModal();toast('تم تعليم كل الإشعارات كمقروءة');if(C.rows.length){C.rows.forEach(r=>{r.founder_read_at=r.founder_read_at||new Date().toISOString()});drawList()}}
 catch(e){toast('تعذّر التحديث: '+hint(e))}
};

/* ---------- شاشة المحل: الاقتراحات والبلاغات ---------- */
window.orvexFeedbackForm=function(tab){
 const s=SBX();
 if(!s||!s.sess)return toast('سجّل الدخول أولاً حتى يصل طلبك إلى حساب المؤسس.');
 if(isFounder())return window.orvexFeedbackCenter();
 if(!s.shop)return toast('لا يوجد محل مرتبط بهذا الحساب.');
 shopScreen(typeof tab==='string'?tab:'new');
};
function shopScreen(tab,opt){
 opt=opt||{};
 modal('الاقتراحات والبلاغات',`<div class="chips" style="margin-bottom:10px"><button class="chip ${tab==='new'?'on':''}" onclick="orvexFeedbackForm('new')">طلب جديد</button><button class="chip ${tab==='list'?'on':''}" onclick="orvexFeedbackForm('list')">طلباتي</button></div><div id="fbBody"></div>`);
 if(tab==='list')shopList(opt);else shopForm();
}
function shopForm(){
 const s=SBX(),b=document.getElementById('fbBody');if(!b)return;
 b.innerHTML=`<p class="muted" style="margin-top:0">أرسل اقتراحًا أو بلّغ عن مشكلة. سيصل الطلب إلى حساب مؤسس ORVEX ويمكنك متابعة حالته من «طلباتي».</p>
  <label for="ofType">نوع الطلب</label><select id="ofType">${Object.keys(TYPES).map(k=>`<option value="${k}">${TYPES[k].ic} ${TYPES[k].l}</option>`).join('')}</select>
  <label for="ofTitle">العنوان *</label><input id="ofTitle" maxlength="150" placeholder="عنوان مختصر للطلب">
  <label for="ofMessage">تفاصيل الطلب *</label><textarea id="ofMessage" rows="5" maxlength="5000" placeholder="اشرح اقتراحك أو المشكلة والخطوات التي سببتها…"></textarea>
  <label for="ofName">اسم مقدم الطلب (اختياري)</label><input id="ofName" maxlength="120" value="${E((s.prof&&s.prof.full_name)||(s.me&&s.me.name)||'')}">
  <label for="ofPhone">رقم الهاتف للتواصل (اختياري)</label><input id="ofPhone" type="tel" inputmode="tel" maxlength="40" value="${E((s.prof&&s.prof.phone)||'')}">
  <div class="actions"><button class="btn primary" id="ofSend" onclick="orvexFeedbackSend()">إرسال الطلب</button><button class="btn" onclick="closeModal()">إلغاء</button></div>`;
}
window.orvexFeedbackSend=async function(){
 const s=SBX(),btn=document.getElementById('ofSend');
 if(!s||!s.sess)return toast('انتهت الجلسة؛ سجّل الدخول مجددًا.');
 if(navigator.onLine===false)return toast('لا يوجد إنترنت. احتفظ بنص الطلب وأرسله عند عودة الاتصال.');
 const g=id=>(document.getElementById(id)?.value||'').trim();
 const type=g('ofType'),title=g('ofTitle'),message=g('ofMessage');
 if(!TYPES[type])return toast('اختر نوع الطلب');
 if(title.length<3)return toast('اكتب عنوانًا مختصرًا (3 أحرف على الأقل).');
 if(message.length<5)return toast('اكتب تفاصيل أوضح (5 أحرف على الأقل).');
 const payload={shop_id:s.shop||null,submitted_by:(s.me&&s.me.id)||s.sess.uid||null,request_type:type,area:'عام',title,message,contact_name:g('ofName')||null,contact_phone:g('ofPhone')||null,status:'new'};
 if(btn){btn.disabled=true;btn.textContent='جارٍ الإرسال…'}
 try{await rq('/rest/v1/feedback_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});shopScreen('list',{sent:true})}
 catch(e){toast('تعذّر إرسال الطلب: '+hint(e));if(btn){btn.disabled=false;btn.textContent='إرسال الطلب'}}
};
async function shopList(opt){
 const b=document.getElementById('fbBody');if(!b)return;
 b.innerHTML=(opt.sent?'<div class="fb-ok" role="status">✅ تم إرسال طلبك بنجاح. سنراجعه ونحدّث حالته هنا.</div>':'')+'<p class="muted">جارٍ التحميل…</p>';
 try{
  const rows=await rq('/rest/v1/feedback_requests?select=id,request_type,title,message,status,created_at&order=created_at.desc&limit=100');
  const body=rows.length?rows.map(r=>{const t=TYPES[r.request_type]||TYPES.suggestion;return `<div class="fb-my"><div class="fb-myh"><b>${t.ic} ${E(r.title||t.l)}</b><span class="fb-badge st-${E(r.status)}">${E(ST[r.status]||r.status)}</span></div><small>${E(t.l)} · <bdi>${E(fmtDT(r.created_at))}</bdi></small><p>${E(r.message)}</p></div>`}).join(''):'<p class="muted">لا توجد طلبات مُرسلة بعد.</p>';
  if(document.getElementById('fbBody'))document.getElementById('fbBody').innerHTML=(opt.sent?'<div class="fb-ok" role="status">✅ تم إرسال طلبك بنجاح. سنراجعه ونحدّث حالته هنا.</div>':'')+body;
 }catch(e){if(document.getElementById('fbBody'))document.getElementById('fbBody').innerHTML='<p class="muted">تعذّر تحميل الطلبات: '+E(hint(e))+'</p>'}
}

/* ---------- مركز الاقتراحات والبلاغات (المؤسس) ---------- */
const C={rows:[],users:{},f:{q:'',shop:'',type:'',st:''},err:null};
const founderOnly=()=>{if(!isFounder()){toast('هذه الشاشة للمؤسس فقط');return false}return true};
async function loadAll(){
 C.err=null;
 try{
  await shopNames(true);
  C.rows=await rq('/rest/v1/feedback_requests?select='+SEL+'&order=created_at.desc&limit=500');
  const ids=[...new Set(C.rows.map(r=>r.submitted_by).filter(Boolean))];
  C.users={};
  if(ids.length){try{const P=await rq('/rest/v1/profiles?id=in.('+ids.join(',')+')&select=id,full_name,username');P.forEach(p=>{C.users[p.id]=p})}catch(e){}}
 }catch(e){C.rows=[];C.err=hint(e)}
}
const who=r=>r.contact_name||(C.users[r.submitted_by]&&C.users[r.submitted_by].full_name)||'—';
function ensureOverlay(){
 let o=document.getElementById('fbc');
 if(!o){o=document.createElement('div');o.id='fbc';o.setAttribute('dir','rtl');document.body.appendChild(o);document.body.classList.add('noscroll')}
 return o;
}
window.orvexFeedbackClose=function(){const o=document.getElementById('fbc');if(o)o.remove();document.body.classList.remove('noscroll');loadCardStats();refreshUnread()};
window.orvexFeedbackCenter=async function(openId){
 if(!founderOnly())return;
 closeModal();
 const o=ensureOverlay();
 o.innerHTML='<div class="fbc-h"><button class="btn" onclick="orvexFeedbackClose()">رجوع</button><h2>مركز الاقتراحات والبلاغات</h2></div><div class="fbc-b"><p class="muted">جارٍ التحميل…</p></div>';
 await loadAll();
 drawCenter();
 if(openId)window.orvexFeedbackOpen(openId);
};
function counts(){const c={all:C.rows.length,new:0,in_progress:0,resolved:0};C.rows.forEach(r=>{if(c[r.status]!=null)c[r.status]++});return c}
function drawCenter(){
 const o=document.getElementById('fbc');if(!o)return;
 const c=counts(),shops=Object.keys(SHOPN).sort((a,b)=>String(SHOPN[a]).localeCompare(String(SHOPN[b]),'ar'));
 o.innerHTML=`<div class="fbc-h"><button class="btn" onclick="orvexFeedbackClose()">رجوع</button><h2>مركز الاقتراحات والبلاغات</h2><button class="btn" onclick="orvexFeedbackCenter()" title="تحديث" aria-label="تحديث">⟳</button></div>
 <div class="fbc-b">${C.err?`<div class="note">${E(C.err)}</div>`:''}
  <div class="fb-stats"><div><b>${c.all}</b><span>إجمالي الطلبات</span></div><div><b>${c.new}</b><span>الطلبات الجديدة</span></div><div><b>${c.in_progress}</b><span>قيد المراجعة</span></div><div><b>${c.resolved}</b><span>تمت المعالجة</span></div></div>
  <div class="fb-flt"><input id="fbq" type="search" placeholder="بحث في العنوان أو الرسالة أو المحل…" value="${E(C.f.q)}" oninput="orvexFeedbackFilter()">
   <select id="fbs" onchange="orvexFeedbackFilter()"><option value="">كل المحلات</option>${shops.map(id=>`<option value="${E(id)}" ${C.f.shop===id?'selected':''}>${E(SHOPN[id])}</option>`).join('')}</select>
   <select id="fbt" onchange="orvexFeedbackFilter()"><option value="">كل الأنواع</option>${Object.keys(TYPES).map(k=>`<option value="${k}" ${C.f.type===k?'selected':''}>${TYPES[k].l}</option>`).join('')}</select>
   <select id="fbst" onchange="orvexFeedbackFilter()"><option value="">كل الحالات</option>${Object.keys(ST).map(k=>`<option value="${k}" ${C.f.st===k?'selected':''}>${ST[k]}</option>`).join('')}</select></div>
  <div id="fbList"></div></div>`;
 drawList();
}
window.orvexFeedbackFilter=function(){
 const g=id=>document.getElementById(id);
 C.f={q:(g('fbq')?.value||'').trim().toLowerCase(),shop:g('fbs')?.value||'',type:g('fbt')?.value||'',st:g('fbst')?.value||''};
 drawList();
};
function drawList(){
 const box=document.getElementById('fbList');if(!box)return;
 const f=C.f,rows=C.rows.filter(r=>(!f.shop||r.shop_id===f.shop)&&(!f.type||r.request_type===f.type)&&(!f.st||r.status===f.st)&&(!f.q||[r.title,r.message,shopOf(r),who(r)].join(' ').toLowerCase().includes(f.q)))
  .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));/* الأحدث أولاً */
 box.innerHTML=rows.length?rows.map(r=>{const t=TYPES[r.request_type]||TYPES.suggestion;return `<button class="fb-row ${r.founder_read_at?'':'unread'}" onclick="orvexFeedbackOpen('${Q(r.id)}')"><span class="fb-ic" aria-hidden="true">${t.ic}</span><span class="fb-main"><b class="fb-t">${E(r.title||String(r.message).slice(0,70))}</b><small>${E(t.l)} · ${E(shopOf(r))} · ${E(who(r))} · <bdi>${E(fmtDT(r.created_at))}</bdi></small></span><span class="fb-badge st-${E(r.status)}">${E(ST[r.status]||r.status)}</span></button>`}).join(''):'<p class="muted" style="text-align:center;padding:24px 0">'+(C.rows.length?'لا توجد نتائج مطابقة.':'لا توجد طلبات حتى الآن.')+'</p>';
}
window.orvexFeedbackOpen=async function(id){
 if(!founderOnly())return;
 const r=C.rows.find(x=>x.id===id);if(!r)return toast('الطلب غير موجود');
 drawDetail(r);
 if(!r.founder_read_at){try{await patchRead('id=eq.'+encodeURIComponent(id)+'&founder_read_at=is.null');r.founder_read_at=new Date().toISOString();N.items=N.items.filter(x=>x.id!==id);N.ids.delete(id);paintBadge();drawList()}catch(e){}}
 try{const n=await rq('/rest/v1/feedback_internal_notes?request_id=eq.'+encodeURIComponent(id)+'&select=note,updated_at');const el=document.getElementById('fbNote');if(el&&n[0])el.value=n[0].note||''}catch(e){const el=document.getElementById('fbNoteErr');if(el)el.textContent=hint(e)}
};
function drawDetail(r){
 const t=TYPES[r.request_type]||TYPES.suggestion;
 modal(t.ic+' '+(r.title||t.l),`<div class="fb-meta"><div><span>النوع</span><b>${E(t.l)}</b></div><div><span>المحل</span><b>${E(shopOf(r))}</b></div><div><span>مقدم الطلب</span><b>${E(who(r))}</b></div><div><span>الهاتف</span><b dir="ltr">${E(r.contact_phone||'—')}</b></div><div><span>التاريخ والوقت</span><b><bdi>${E(fmtDT(r.created_at))}</bdi></b></div><div><span>الحالة</span><b><span class="fb-badge st-${E(r.status)}" id="fbCur">${E(ST[r.status]||r.status)}</span></b></div></div>
  <label>نص الرسالة</label><div class="fb-msg">${E(r.message)}</div>
  <label>تغيير الحالة</label><div class="chips" id="fbSt">${['new','in_progress','resolved'].map(k=>`<button class="chip ${r.status===k?'on':''}" onclick="orvexFeedbackStatus('${Q(r.id)}','${k}')">${ST[k]}</button>`).join('')}</div>
  <label for="fbNote">ملاحظات داخلية (للمؤسس فقط، لا تظهر للمحل)</label><textarea id="fbNote" rows="4" maxlength="5000" placeholder="أضف ملاحظة داخلية…"></textarea><small id="fbNoteErr" class="muted"></small>
  <div class="actions"><button class="btn primary" onclick="orvexFeedbackNoteSave('${Q(r.id)}')">حفظ الملاحظة</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`);
}
window.orvexFeedbackStatus=async function(id,status){
 if(!ST[status])return;
 const r=C.rows.find(x=>x.id===id);if(!r)return;
 try{
  const body={status};if(!r.founder_read_at)body.founder_read_at=new Date().toISOString();
  const res=await rq('/rest/v1/feedback_requests?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
  if(!Array.isArray(res)||!res.length)throw new Error('لم يتم تحديث الطلب (صلاحية غير كافية)');
  r.status=status;if(body.founder_read_at)r.founder_read_at=body.founder_read_at;
  N.items=N.items.filter(x=>x.id!==id);N.ids.delete(id);paintBadge();
  const cur=document.getElementById('fbCur');if(cur){cur.textContent=ST[status];cur.className='fb-badge st-'+status}
  document.querySelectorAll('#fbSt .chip').forEach((b,i)=>b.classList.toggle('on',['new','in_progress','resolved'][i]===status));
  toast('تم تحديث حالة الطلب إلى «'+ST[status]+'»');
  const o=document.getElementById('fbc');if(o)drawCenter();
 }catch(e){toast('تعذّر تحديث الحالة: '+hint(e))}
};
window.orvexFeedbackNoteSave=async function(id){
 const s=SBX(),el=document.getElementById('fbNote');if(!el)return;
 try{await rq('/rest/v1/feedback_internal_notes',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({request_id:id,note:el.value.trim(),updated_by:(s.me&&s.me.id)||s.sess.uid,updated_at:new Date().toISOString()})});toast('تم حفظ الملاحظة الداخلية')}
 catch(e){toast('تعذّر حفظ الملاحظة: '+hint(e))}
};

/* ---------- بطاقة لوحة المؤسس ---------- */
async function loadCardStats(){
 const el=document.getElementById('fbCardStats');if(!el||!isFounder())return;
 try{const R=await rq('/rest/v1/feedback_requests?select=status&limit=1000'),c={all:R.length,new:0,in_progress:0,resolved:0};R.forEach(r=>{if(c[r.status]!=null)c[r.status]++});
  el.innerHTML=`<div class="fb-stats"><div><b>${c.all}</b><span>إجمالي الطلبات</span></div><div><b>${c.new}</b><span>جديدة</span></div><div><b>${c.in_progress}</b><span>قيد المراجعة</span></div><div><b>${c.resolved}</b><span>تمت المعالجة</span></div></div>`}
 catch(e){el.innerHTML='<p class="muted">'+E(hint(e))+'</p>'}
}
if(typeof VIEWS==='object'&&VIEWS.studio){
 const _vs=VIEWS.studio;
 VIEWS.studio=function(){
  const h=_vs.apply(this,arguments);
  if(typeof h==='string'&&h.includes('id="shopList"')){
   setTimeout(loadCardStats,120);
   return h.replace('<div class="card" id="shopList"','<div class="card" id="fbCard"><h3>مركز الاقتراحات والبلاغات</h3><div id="fbCardStats"><p class="muted">جارٍ التحميل…</p></div><div class="actions"><button class="btn primary" onclick="orvexFeedbackCenter()">فتح المركز</button></div></div><div class="card" id="shopList"');
  }
  return h;
 };
}

/* ---------- التنسيق ---------- */
const st=document.createElement('style');
st.textContent=`.od-feed{color:#27e060!important}.od-feed:hover{background:rgba(39,224,96,.12);border-radius:10px}
.od-bell .od-cnt{position:absolute;top:2px;inset-inline-end:2px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#e5484d;color:#fff;font:700 11px/17px Cairo,Tahoma,sans-serif;text-align:center;box-sizing:border-box}
#fbc{position:fixed;inset:0;z-index:90;background:var(--bg,#fff);color:var(--ink,#123);overflow:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom,0)}
#fbc .fbc-h{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface,#fff);border-bottom:1px solid var(--line,#d9e8df)}
#fbc .fbc-h h2{flex:1;margin:0;font-size:17px}
#fbc .fbc-b{max-width:900px;margin:0 auto;padding:14px}
.fb-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}
.fb-stats>div{background:var(--surface,#fff);border:1px solid var(--line,#d9e8df);border-radius:12px;padding:10px 6px;text-align:center}
.fb-stats b{display:block;font-size:22px;color:var(--brand,#0a7a52)}.fb-stats span{font-size:12px;color:var(--muted,#6b8076)}
.fb-flt{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.fb-row{display:flex;align-items:center;gap:10px;width:100%;text-align:start;background:var(--surface,#fff);color:inherit;border:1px solid var(--line,#d9e8df);border-radius:12px;padding:10px 12px;margin-bottom:8px;font:inherit}
.fb-row.unread{border-inline-start:4px solid #27e060}.fb-row.unread .fb-t{font-weight:800}
.fb-ic{font-size:22px;flex:none}.fb-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.fb-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fb-main small{color:var(--muted,#6b8076);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fb-badge{flex:none;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;background:#e8f0ec;color:#2b4a3c}
.fb-badge.st-new{background:#fff1d6;color:#8a5a00}.fb-badge.st-in_progress{background:#dcebff;color:#1d4f91}.fb-badge.st-resolved{background:#d9f5e3;color:#13693a}
:root[data-theme="dark"] .fb-badge.st-new,:root:not([data-theme="light"]) .fb-badge.st-new{background:#33291a;color:#f1c36a}
:root[data-theme="dark"] .fb-badge.st-in_progress,:root:not([data-theme="light"]) .fb-badge.st-in_progress{background:#17304f;color:#8dbcf5}
:root[data-theme="dark"] .fb-badge.st-resolved,:root:not([data-theme="light"]) .fb-badge.st-resolved{background:#12341f;color:#7fdca3}
.fb-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px}.fb-meta div{background:var(--soft,#eef5f1);border-radius:10px;padding:8px 10px}.fb-meta span{display:block;font-size:12px;color:var(--muted,#6b8076)}.fb-meta b{overflow-wrap:anywhere}
.fb-msg{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--soft,#eef5f1);border-radius:10px;padding:10px 12px;max-height:240px;overflow:auto}
#ofMessage,#fbNote{width:100%;resize:vertical;box-sizing:border-box}
.fb-ok{background:#d9f5e3;color:#13693a;border-radius:10px;padding:10px 12px;margin-bottom:10px;font-weight:700}
:root[data-theme="dark"] .fb-ok,:root:not([data-theme="light"]) .fb-ok{background:#12341f;color:#7fdca3}
.fb-my{border:1px solid var(--line,#d9e8df);border-radius:12px;padding:10px 12px;margin-bottom:8px}.fb-myh{display:flex;justify-content:space-between;gap:8px;align-items:center}.fb-my p{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.fb-n{display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--line,#d9e8df);padding:8px 0}.fb-n:last-child{border:0}
.fb-nmain{flex:1;min-width:0;text-align:start;background:none;border:0;color:inherit;font:inherit;display:flex;flex-direction:column;gap:2px}.fb-nt{font-weight:700;white-space:normal}.fb-nmain small{color:var(--muted,#6b8076)}
.fb-mark{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--line,#d9e8df);background:var(--surface,#fff);color:var(--brand,#0a7a52);font-size:16px}
@media(max-width:560px){.fb-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.fb-meta{grid-template-columns:1fr}}`;
document.head.appendChild(st);

/* ---------- تشغيل ---------- */
const start=()=>{mountTop();try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})}catch(e){setInterval(mountTop,1500)}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.__orvexFeedback={mountTop,refreshUnread,notifText,get unread(){return N.items.slice()},TYPES,ST};
})();
