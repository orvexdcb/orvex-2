/* ================= ORVEX SERVER: ربط Supabase ================= */
(function(){
const U='https://dgoimemvaudwayelcrmg.supabase.co',AK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnb2ltZW12YXVkd2F5ZWxjcm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjgzMDMsImV4cCI6MjEwNzMwNDMwM30.0SDYLAwp2st48pG9_lhTWu3RU6iS6zBJRzqMS0-YFx0';
const MAIN=['products','customers','sales','bundles'],REC=['suppliers','purchases','expenses','payments','returns','closings','audit','employees','payroll','attendance','leaves','advances','empPay','assets','coupons','quotes','warehouses','transfers','stocktakes','approvals','journals','coa','bankAccts','bankRecs','loyTx','boms','prodOrders','repScheds','repRuns'],COLL=MAIN.concat(REC);
const SB={sess:null,prof:null,shop:null,me:null,dirty:false,busy:false,pt:null,poll:null,retryTimer:null,retryCount:0,authExpired:false,authWarned:false,loggingOut:false,again:false,changeSeq:0};let last={};window.__orvexStatus=()=>({logged:!!SB.sess,dirty:!!SB.dirty,busy:!!SB.busy,retry:SB.retryCount||0,expired:!!SB.authExpired});
const em=u=>u+'@users.orvex.app';
/* ===== بوابة الصلاحيات (ORVEX roles) =====
   إنشاء المحلات وإدارتها والكتالوج المستقل ودوال المجمعات: للمؤسس فقط.
   حساب المحل لا يستطيع الوصول لهذه المسارات حتى لو استُدعيت الدوال يدويًا من وحدة التحكم.
   هذه طبقة دفاع إضافية؛ التنفيذ الفعلي في الخادم (RLS + دالة orvex-admin) ولم يُغيَّر. */
const isFounderAcct=()=>!!(SB.sess&&SB.prof&&SB.prof.role==='founder');
const founderOK=()=>SB.sess?isFounderAcct():(typeof isDesigner==='function'&&isDesigner());
const FN_FOUNDER_ONLY=new Set(['create_shop','delete_shop','update_user','pkg_code']);
function roleGate(p,o){
 if(!SB.sess||!SB.prof||SB.prof.role==='founder')return;
 const role=SB.prof.role,m=String((o&&o.method)||'GET').toUpperCase(),i=p.indexOf('?'),path=i<0?p:p.slice(0,i),qs=new URLSearchParams(i<0?'':p.slice(i+1));
 const eq=k=>{const v=qs.get(k);return v&&v.startsWith('eq.')?v.slice(3):null},own=SB.shop||'';
 const deny=()=>{const e=new Error('غير مسموح: هذه الوظيفة للمؤسس فقط');e.status=403;e.gated=true;throw e};
 let b=null;try{b=o&&o.body?JSON.parse(o.body):null}catch(e){}
 if(path==='/functions/v1/orvex-mall-admin')deny();
 if(path==='/functions/v1/orvex-admin'){
  const a=b&&b.action;
  if(FN_FOUNDER_ONLY.has(a))deny();
  if(a==='create_user'&&!(role==='manager'&&own&&b.role==='staff'&&b.shop_id===own))deny();
  if((a==='reset_password'||a==='delete_user')&&role!=='manager')deny();
  return}
 if(path==='/rest/v1/shops'){if(!(own&&eq('id')===own&&(m==='GET'||m==='PATCH')))deny();return}
 if(path==='/rest/v1/founder_products'||path==='/rest/v1/device_requests')deny();
 if(path==='/rest/v1/devices'){if(!(m==='GET'&&own&&eq('shop_id')===own))deny();return}
 if(path==='/rest/v1/shop_audit'){if(!(m==='GET'&&own&&eq('shop_id')===own))deny();return}
 if(path==='/rest/v1/profiles'){
  if(m==='GET'){if(!((own&&eq('shop_id')===own)||eq('id')))deny();return}
  if(m==='PATCH'){if(!(role==='manager'&&eq('id')))deny();return}
  deny()}
 if(/^\/rest\/v1\/rpc\/mall_(admin_|set_shop|security_audit)/.test(path))deny();
}
window.orvexRole={ok:founderOK,founder:()=>isFounderAcct(),shopAccount:()=>!!(SB.sess&&SB.prof&&(SB.prof.role==='manager'||SB.prof.role==='staff')),gate:roleGate};

const devId=()=>{let d=null;try{d=localStorage.getItem(KEY+'_devid');if(!d){d=(uid()+uid()+uid()).toUpperCase();localStorage.setItem(KEY+'_devid',d)}}catch(e){d=d||uid()+uid()}return d};
const ORVEX_TAB_SESSION='orvex_tab_session_v1';function saveTabSession(){try{if(SB.sess&&SB.sess.rt)sessionStorage.setItem(ORVEX_TAB_SESSION,JSON.stringify({username:SB.prof&&SB.prof.username||$('#a_user')?.value?.trim()?.toLowerCase()||'',rt:SB.sess.rt,uid:SB.sess.uid}))}catch(e){}}function clearTabSession(){try{sessionStorage.removeItem(ORVEX_TAB_SESSION)}catch(e){}}
async function tok(){const s=SB.sess;if(!s)return AK;if(SB.authExpired)throw new Error('انتهت جلسة الدخول. احفظ عملك ثم سجّل الخروج وادخل مجددًا.');if(s.exp-Date.now()<60000){let r;try{r=await fetch(U+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:AK,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.rt})})}catch(e){throw new Error('تعذر الاتصال لتجديد جلسة الدخول. تحقق من الإنترنت وحاول مجددًا.')}if(!r.ok){if(r.status!==400&&r.status!==401&&r.status!==403)throw new Error('تعذر تجديد جلسة الدخول مؤقتًا (HTTP '+r.status+'). ستتم إعادة المحاولة.');SB.authExpired=true;SB.retryCount=0;clearTimeout(SB.retryTimer);if(!SB.authWarned){SB.authWarned=true;toast('انتهت جلسة الدخول. احفظ عملك ثم سجّل الخروج وادخل مجددًا.')}throw new Error('انتهت جلسة الدخول. سجّل الخروج وادخل مجددًا.')}const j=await r.json();if(!j.access_token||!j.refresh_token){SB.authExpired=true;throw new Error('تعذر تجديد جلسة الدخول. سجّل الدخول مجددًا.')}SB.sess={at:j.access_token,rt:j.refresh_token,exp:Date.now()+j.expires_in*1000,uid:s.uid};saveTabSession();SB.authWarned=false}return SB.sess.at}
async function rq(p,o){o=o||{};roleGate(p,o);const hd=Object.assign({apikey:AK,Authorization:'Bearer '+await tok(),'Content-Type':'application/json'},o.headers||{});let r;try{r=await fetch(U+p,Object.assign({},o,{headers:hd}))}catch(e){const ne=new Error('لا يوجد اتصال بالخادم');ne.network=true;throw ne}const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}if(!r.ok){const er=new Error((j&&(j.error||j.message||j.msg))||'خطأ '+r.status);er.status=r.status;throw er}return j}
const orvexQ=()=>window.orvexSyncQ||null;/* syncq.js (اختياري: غيابه يعيد السلوك القديم) */
const fn=b=>rq('/functions/v1/orvex-admin',{method:'POST',body:JSON.stringify(b)});
async function all(p){let out=[],o=0;for(;;){const r=await rq(p+(p.includes('?')?'&':'?')+'limit=1000&offset='+o);out=out.concat(r);if(r.length<1000)return out;o+=1000}}
const toUser=p=>({id:p.id,name:p.full_name,username:p.username,phone:p.phone||'',admin:p.role!=='staff',designer:p.role==='founder',role:p.role==='staff'?((p.perms&&p.perms._role)||'custom'):'admin',perms:p.perms||{},active:p.active!==false});
const sig=o=>JSON.stringify([COLL.map(k=>o[k]),o.settings,o.features,o.users]);
/* كتالوج مستقل لكل حساب مؤسس: لا يستخدم shop_id ولا جداول منتجات المحلات */
const FC={ready:false,dirty:false,busy:false,last:{},timer:null,retry:0};
window.__orvexLoy={ok:()=>!!(SB.shop&&SB.sess&&!SB.authExpired),shop:()=>SB.shop||'',insert:rows=>rq('/rest/v1/loyalty_ledger?on_conflict=shop_id,id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows.map(r=>Object.assign({},r,{shop_id:SB.shop})))}),list:cid=>all('/rest/v1/loyalty_ledger?shop_id=eq.'+SB.shop+'&customer_id=eq.'+encodeURIComponent(cid)+'&select=id,kind,points,ref,created_at&order=created_at.desc')};
window.__orvexAcct={ok:()=>!!(SB.shop&&SB.sess&&!SB.authExpired),shop:()=>SB.shop||'',rpc:(n,a)=>rq('/rest/v1/rpc/'+n,{method:'POST',body:JSON.stringify(a)}),accounts:()=>all('/rest/v1/accounts?shop_id=eq.'+SB.shop+'&select=id,code,name,type,system_key,is_active&order=code'),get:p=>all('/rest/v1/'+p),post:(p,b)=>rq('/rest/v1/'+p,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(b)}),patch:(p,b)=>rq('/rest/v1/'+p,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(b)})};
async function pullFounderCatalog(){
 if(!SB.sess||!SB.me||SB.prof?.role!=='founder'||SB.shop)return false;
 const rows=await all('/rest/v1/founder_products?founder_id=eq.'+encodeURIComponent(SB.me.id)+'&select=id,data,updated_at');
 db.products=rows.map(x=>x.data).filter(Boolean);
 FC.last=Object.fromEntries(db.products.filter(x=>x&&x.id).map(x=>[x.id,JSON.stringify(x)]));
 FC.ready=true;FC.dirty=false;FC.retry=0;return true;
}
async function pushFounderCatalog(){
 if(!FC.ready||!SB.sess||!SB.me||SB.prof?.role!=='founder'||SB.shop)return false;
 if(FC.busy)return false;
 FC.busy=true;const snapshot=(db.products||[]).filter(x=>x&&x.id).map(x=>JSON.parse(JSON.stringify(x)));
 const now=Object.fromEntries(snapshot.map(x=>[x.id,JSON.stringify(x)]));
 try{
  const changed=snapshot.filter(x=>FC.last[x.id]!==JSON.stringify(x));
  for(let i=0;i<changed.length;i+=200){const rows=changed.slice(i,i+200).map(x=>({founder_id:SB.me.id,id:x.id,data:x,updated_at:new Date().toISOString()}));await rq('/rest/v1/founder_products?on_conflict=founder_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});rows.forEach(x=>FC.last[x.id]=JSON.stringify(x.data));}
  const gone=Object.keys(FC.last).filter(id=>!Object.prototype.hasOwnProperty.call(now,id));
  for(let i=0;i<gone.length;i+=100){const ids=gone.slice(i,i+100);await rq('/rest/v1/founder_products?founder_id=eq.'+encodeURIComponent(SB.me.id)+'&id=in.('+ids.map(encodeURIComponent).join(',')+')',{method:'DELETE'});ids.forEach(id=>delete FC.last[id]);}
  FC.dirty=JSON.stringify((db.products||[]).filter(x=>x&&x.id))!==JSON.stringify(snapshot);
  if(FC.dirty)scheduleFounderCatalogPush();else FC.retry=0;
  return !FC.dirty;
 }catch(e){FC.dirty=true;FC.retry=Math.min(FC.retry+1,6);toast('تعذّر حفظ كتالوج المؤسس: '+e.message);scheduleFounderCatalogPush();return false}
 finally{FC.busy=false;}
}
function scheduleFounderCatalogPush(){if(!FC.ready||!FC.dirty||!SB.sess||SB.shop)return;clearTimeout(FC.timer);FC.timer=setTimeout(()=>{if(!FC.busy)pushFounderCatalog();},Math.min(30000,1200*Math.pow(2,Math.max(0,FC.retry-1))));}
async function pull(first){const sid=SB.shop;if(!sid)return;SB.busy=true;try{
 const sh=(await rq('/rest/v1/shops?id=eq.'+sid+'&select=*'))[0];if(!sh)throw new Error('المحل غير موجود');SB.note=sh.note||'';
 if(sh.license_active===false&&SB.prof.role!=='founder')throw new Error('ترخيص المحل موقوف. تواصل مع المؤسس');
 const nd=normalize(fresh());nd.settings=Object.assign(nd.settings,{name:sh.name},sh.settings||{});if(sh.features&&Object.keys(sh.features).length)nd.features=sh.features;nd.edition=SB.prof.role==='founder'?'studio':'manager';
 let cur='';const mx=r=>r.forEach(x=>{if(x.updated_at>cur)cur=x.updated_at});
 for(const t of MAIN){const rr=await all(`/rest/v1/${t}?shop_id=eq.${sid}&select=data,updated_at`);mx(rr);nd[t]=rr.map(x=>x.data).filter(x=>x&&typeof x==='object')}
 const rec=await all(`/rest/v1/records?shop_id=eq.${sid}&select=kind,data,updated_at`);mx(rec);REC.forEach(k=>nd[k]=rec.filter(x=>x.kind===k).map(x=>x.data).filter(x=>x&&typeof x==='object'));
 nd.users=(await rq(`/rest/v1/profiles?shop_id=eq.${sid}&select=*`)).map(toUser);if(!nd.users.some(u=>u.id===SB.me.id))nd.users.push(SB.me);
 if(!first&&SB.dirty)return false;if(cur)SB.cur=cur;if(!first&&sig(nd)===sig(db))return false;
 db=nd;last={};COLL.forEach(k=>{last[k]=Object.fromEntries(db[k].filter(r=>r&&r.id).map(r=>[r.id,JSON.stringify(r)]))});last._s=JSON.stringify(db.settings);persistBase();return true}finally{SB.busy=false;if(SB.again){SB.again=false;clearTimeout(SB.pt);SB.pt=setTimeout(()=>{if(SB.dirty&&SB.sess&&SB.shop)push()},300)}}}
const cj=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,q)=>(o[q]=x[q],o),{}):x);
/* مزامنة تزايدية: تجلب فقط الصفوف التي تغيّرت منذ آخر سحب (updated_at بتوقيت الخادم). الحذف يُلتقط بالسحب الكامل كل 10 دورات */
async function pullInc(){const sid=SB.shop;if(!sid)return false;SB.busy=true;try{
 const sh=(await rq('/rest/v1/shops?id=eq.'+sid+'&select=*'))[0];if(!sh)throw new Error('المحل غير موجود');SB.note=sh.note||'';
 if(sh.license_active===false&&SB.prof.role!=='founder')throw new Error('ترخيص المحل موقوف. تواصل مع المؤسس');
 const since=encodeURIComponent(new Date(Date.parse(SB.cur||'1970-01-01T00:00:00Z')-10000).toISOString());let cur=SB.cur||'';
 const got={};for(const t of MAIN){const rr=await all(`/rest/v1/${t}?shop_id=eq.${sid}&updated_at=gt.${since}&select=data,updated_at`);rr.forEach(x=>{if(x.updated_at>cur)cur=x.updated_at});got[t]=rr.map(x=>x.data)}
 const rec=await all(`/rest/v1/records?shop_id=eq.${sid}&updated_at=gt.${since}&select=kind,data,updated_at`);rec.forEach(x=>{if(x.updated_at>cur)cur=x.updated_at;if(REC.includes(x.kind))(got[x.kind]=got[x.kind]||[]).push(x.data)});
 const base=normalize(fresh()),st=Object.assign(base.settings,{name:sh.name},sh.settings||{}),ft=(sh.features&&Object.keys(sh.features).length)?sh.features:base.features;
 const us=(await rq(`/rest/v1/profiles?shop_id=eq.${sid}&select=*`)).map(toUser);if(!us.some(u=>u.id===SB.me.id))us.push(SB.me);
 if(SB.dirty)return false;/* تعديلات محلية أثناء الجلب: لا نكتب فوقها، والمؤشر لا يتقدّم فيُعاد الجلب لاحقًا */
 let ch=false;
 for(const t of Object.keys(got))for(const r of got[t]){if(!r||!r.id)continue;const i=db[t].findIndex(y=>y.id===r.id);if(i>=0&&cj(db[t][i])===cj(r))continue;if(i>=0)db[t][i]=r;else db[t].push(r);(last[t]=last[t]||{})[r.id]=JSON.stringify(r);ch=true}
 if(cj([st,ft,us])!==cj([db.settings,db.features,db.users])){db.settings=st;db.features=ft;db.users=us;last._s=JSON.stringify(db.settings);ch=true}
 if(cur)SB.cur=cur;if(ch)persistBase();return ch}finally{SB.busy=false;if(SB.again){SB.again=false;clearTimeout(SB.pt);SB.pt=setTimeout(()=>{if(SB.dirty&&SB.sess&&SB.shop)push()},300)}}}
function scheduleSyncRetry(){if(!SB.shop||!SB.sess||SB.authExpired||!SB.dirty)return;clearTimeout(SB.retryTimer);SB.retryCount=Math.min((SB.retryCount||0)+1,7);const delay=Math.min(60000,2000*Math.pow(2,SB.retryCount-1));SB.retryTimer=setTimeout(()=>{if(!SB.sess||!SB.shop||!SB.dirty||SB.authExpired)return;if(SB.busy){scheduleSyncRetry();return}push()},delay)}
/* --- عمليات المخزون/الرصيد: معرّف فريد لكل دفعة (idempotency). تُحفظ محليًا قبل الإرسال وتُعاد بالمعرّف نفسه حتى يتأكد الخادم --- */
const IFK=()=>KEY+'_inflight_'+SB.shop;
function ifGet(){try{return JSON.parse(localStorage.getItem(IFK())||'[]')}catch(e){return[]}}
function ifSet(a){try{localStorage.setItem(IFK(),JSON.stringify(a))}catch(e){}}
function inflightAdd(t,dl,op,rows){const a=ifGet();a.push({t,dl,op,rows});ifSet(a)}
function inflightDone(op){ifSet(ifGet().filter(x=>x.op!==op))}
async function sendOp(t,dl,op,rows){
 /* لا تسقط معرّف العملية عند غياب نسخة RPC الجديدة؛ ذلك يعطّل منع التكرار وقد يخصم المخزون مرتين عند إعادة المحاولة. */
 const body={p_table:t,p_field:dl,p_shop:SB.shop,p_rows:rows,p_op:op};
 try{return await rq('/rest/v1/rpc/push_rows',{method:'POST',body:JSON.stringify(body)})}
 catch(e){if(/Could not find the function|PGRST202/i.test(String(e&&e.message)))throw new Error('تحتاج قاعدة Supabase إلى ترحيل منع تكرار المزامنة قبل المتابعة. لم تُرسل العملية بالطريقة القديمة حفاظًا على المخزون والأرصدة.');throw e}
}
function applyOp(rows,res,cur,L,dl){res.forEach(x=>{const row=rows.find(y=>y.id===x.id);if(!row)return;if(x.val==null){L[x.id]=JSON.stringify(row.data);return}
 const sent=row.data[dl],cu=cur.find(y=>y.id===x.id);if(cu&&typeof cu[dl]==='number')cu[dl]=r2(x.val+(cu[dl]-sent));/* يحفظ أي تعديل حدث أثناء الإرسال */
 row.data[dl]=x.val;L[x.id]=JSON.stringify(row.data)})}
async function replayInflight(){for(const o of ifGet()){let res;try{res=await sendOp(o.t,o.dl,o.op,o.rows)}catch(e){const q=orvexQ();if(!q||!q.isPermanent(e)||q.isStock(e))throw e;
  /* رفض نهائي (ذرّي: لم يُطبَّق شيء): نقسم الدفعة لعزل الصف المعيب بدل أن تعلق كل عمليات المخزون خلفه */
  inflightDone(o.op);
  if(o.rows.length>1){const h=o.rows.length>>1;[o.rows.slice(0,h),o.rows.slice(h)].forEach(rs=>inflightAdd(o.t,o.dl,uid()+uid(),rs));return replayInflight()}
  const rw=o.rows[0];if(rw){(last[o.t]=last[o.t]||{})[rw.id]=JSON.stringify(rw.data);q.quarantine({t:o.t,id:rw.id,row:rw,dl:o.dl,kind:'op',error:e})}continue}
 inflightDone(o.op);applyOp(o.rows,res,db[o.t]||[],(last[o.t]=last[o.t]||{}),o.dl)}}
/* رفع صفوف مع عزل الصف المرفوض نهائيًا: تُقسَّم الدفعة حتى يتحدد الصف المعيب فيُحفظ في سجل المزامنة وتستمر البقية */
async function upsertRows(tb,m,rows,L,t){
 try{await rq(`/rest/v1/${tb}?on_conflict=${m?'id':'shop_id,kind,id'}`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});rows.forEach(x=>L[x.id]=JSON.stringify(x.data))}
 catch(e){const q=orvexQ();if(!q||!q.isPermanent(e))throw e;
  if(rows.length>1){const h=rows.length>>1;await upsertRows(tb,m,rows.slice(0,h),L,t);await upsertRows(tb,m,rows.slice(h),L,t);return}
  q.quarantine({t,id:rows[0].id,row:rows[0].data,kind:'row',error:e});L[rows[0].id]=JSON.stringify(rows[0].data)}}
/* --- خط أساس المزامنة المحفوظ: بصمة كل صف كما هو على الخادم عند آخر مزامنة (وقيمة المخزون/الرصيد للمنتجات والعملاء).
   يُستعمل عند إعادة فتح التطبيق لاسترجاع ما أُجري دون اتصال بدل بقائه في نسخة احتياطية فقط --- */
const BK=sid=>KEY+'_base_'+sid,DLF={products:'stock',customers:'balance'};
const hs=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)+'.'+s.length.toString(36)};
let baseT=null;
function persistBase(){clearTimeout(baseT);baseT=setTimeout(()=>{if(!SB.shop||!SB.sess)return;try{const o={v:1,at:Date.now(),t:{}};for(const t of COLL){const Lt=last[t]||{},mm={};for(const id in Lt){const x=Lt[id];if(DLF[t]){let v=null;try{v=JSON.parse(x)[DLF[t]]}catch(e){}mm[id]=[hs(x),v]}else mm[id]=hs(x)}o.t[t]=mm}localStorage.setItem(BK(SB.shop),JSON.stringify(o))}catch(e){}},700)}
function loadBase(sid){try{const o=JSON.parse(localStorage.getItem(BK(sid))||'null');return o&&o.v===1?o:null}catch(e){return null}}
/* يدمج ما أُجري محليًا بعد آخر مزامنة (old) داخل البيانات المسحوبة للتو (db). الخادم يغلب عند التعارض وتُسجَّل نسخة المحلي.
   ما أُنشئ محليًا يُضاف. المنتجات/العملاء: يُطبَّق فرق المخزون/الرصيد على قيمة الخادم (لا استبدال). الحذف المحلي لا يُطبَّق إن كان كبيرًا (>10 في مجموعة). */
function recoverLocal(old,sid){
 const B=loadBase(sid);if(!B)return{n:0,conf:0,none:true};let n=0,conf=0;const q=orvexQ();
 const note=(t,r,msg)=>{conf++;if(q)q.record({t,kind:'collection',id:r&&r.id,row:r,error:{message:msg}})};
 for(const t of COLL){const bt=B.t[t];if(!bt||!Array.isArray(old[t]))continue;const loc=old[t],cur=db[t]=db[t]||[],dl=DLF[t],cm=new Map(cur.map(r=>[r&&r.id,r])),lm=new Set(loc.map(r=>r&&r.id));
  for(const r of loc){if(!r||!r.id)continue;const b=bt[r.id],c=cm.get(r.id);
   if(b===undefined){if(!c){cur.push(r);cm.set(r.id,r);n++}continue}
   const bh=dl?b[0]:b;if(hs(JSON.stringify(r))===bh)continue;
   if(!c){note(t,r,'عُدّل على هذا الجهاز لكنه محذوف على الخادم');continue}
   const ch=hs(JSON.stringify(c));
   if(dl){const d=r2((Number(r[dl])||0)-(Number(b[1])||0));
    if(ch===bh){const nr=Object.assign({},r);nr[dl]=r2((Number(c[dl])||0)+d);cur[cur.indexOf(c)]=nr;cm.set(r.id,nr);n++}
    else if(d!==0){c[dl]=r2((Number(c[dl])||0)+d);n++}
    else note(t,r,'تعديل محلي لم يُطبَّق لأن الخادم تغيّر');continue}
   if(ch===bh){cur[cur.indexOf(c)]=r;cm.set(r.id,r);n++}else note(t,r,'تعديل محلي لم يُطبَّق لأن الخادم تغيّر');}
  const gone=Object.keys(bt).filter(id=>!lm.has(id)&&cm.has(id));
  if(gone.length>10){conf++;if(q)q.record({t,kind:'collection',error:{message:'حذف محلي كبير ('+gone.length+' سجل) لم يُطبَّق تلقائيًا'}})}
  else gone.forEach(id=>{const c=cm.get(id),b=bt[id],bh=dl?b[0]:b;if(hs(JSON.stringify(c))===bh){cur.splice(cur.indexOf(c),1);cm.delete(id);n++}})}
 return{n,conf}}
async function push(){if(!SB.shop||!SB.sess)return false;if(SB.authExpired)return false;if(SB.busy){SB.again=true;return false}SB.busy=true;const pushSeq=SB.changeSeq||0;let ok=false;try{
 const failed=[];let dlBlocked=false;
 try{await replayInflight()}catch(e){const q=orvexQ();if(!q||!q.isolate(e,'products/customers'))throw e;dlBlocked=true;failed.push({t:'products/customers',e})}
 for(const t of COLL){try{const m=MAIN.includes(t),tb=m?t:'records',cur=db[t]||[],L=last[t]||(last[t]={});
  /* لقطة ثابتة للصفوف عند بدء المزامنة: تمنع اعتبار تعديلات أحدث قد حدثت أثناء الرفع وكأنها أُرسلت بالفعل */
  const ch=cur.filter(r=>r.id&&L[r.id]!==JSON.stringify(r)).map(r=>JSON.parse(JSON.stringify(r))),gone=Object.keys(L).filter(id=>!cur.some(r=>r.id===id));
  const dl=t==='products'?'stock':t==='customers'?'balance':null;
  if(dl&&dlBlocked)continue;/* عمليات مخزون سابقة مرفوضة: لا نُنشئ عملية جديدة فوقها (تكرار الفرق) */
  for(let i=0;i<ch.length;i+=200){
   if(dl){/* المخزون/الرصيد يُرسلان كفرق ويُطبَّقان ذريًا على الخادم، فلا يضيع بيع من جهاز آخر */
    const rows=ch.slice(i,i+200).map(r=>{let d=0;try{const o=JSON.parse(L[r.id]||'null');if(o&&typeof o[dl]==='number'&&typeof r[dl]==='number')d=r2(r[dl]-o[dl])}catch(e){}return{id:r.id,delta:d,data:JSON.parse(JSON.stringify(r))}});
    const op=uid()+uid();inflightAdd(t,dl,op,rows);/* يُحفظ قبل الإرسال: إن ضاع الرد أُعيد بالمعرّف نفسه فلا يُخصم المخزون مرتين */
    let res;try{res=await sendOp(t,dl,op,rows)}catch(e){const q=orvexQ();if(q&&q.isPermanent(e)&&!q.isStock(e)){await replayInflight();continue}throw e}/* رفض نهائي: replayInflight تقسّم الدفعة وتعزل الصف المعيب */
    inflightDone(op);applyOp(rows,res,cur,L,dl);continue}
   const chb=window.orvexSyncMerge?await window.orvexSyncMerge.hook(t,m,tb,ch.slice(i,i+200),L,cur,SB.shop,p=>all(p)):ch.slice(i,i+200);/* دمج ثلاثي اختياري (sync-merge.js): معطّل افتراضيًا ويعيد الدفعة كما هي */
   const rows=chb.map(r=>Object.assign(m?{}:{kind:t},{id:r.id,shop_id:SB.shop,data:JSON.parse(JSON.stringify(r))}));
   await upsertRows(tb,m,rows,L,t)}
  for(let i=0;i<gone.length;i+=100){const g=gone.slice(i,i+100);await rq(`/rest/v1/${tb}?shop_id=eq.${SB.shop}${m?'':'&kind=eq.'+t}&id=in.(${g.map(x=>'"'+x+'"').join(',')})`,{method:'DELETE'});g.forEach(x=>delete L[x])}}catch(e){const q=orvexQ();if(!q||!q.isolate(e,t))throw e;failed.push({t,e})}}
 try{const ss=JSON.stringify(db.settings);if(ss!==last._s&&SB.prof.role!=='staff'){await rq('/rest/v1/shops?id=eq.'+SB.shop,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({settings:db.settings})});last._s=ss}}catch(e){const q=orvexQ();if(!q||!q.isolate(e,'settings'))throw e;failed.push({t:'settings',e})}
 if(failed.length){const q=orvexQ(),fe=new Error('تعذّرت مزامنة: '+failed.map(x=>q.label(x.t)).join('، '));fe.partial=true;fe.orvexPermanent=failed.every(x=>q.isPermanent(x.e));throw fe}
 if((SB.changeSeq||0)===pushSeq){SB.dirty=false;SB.retryCount=0;clearTimeout(SB.retryTimer)}else{SB.dirty=true;scheduleSyncRetry()}SB.blocked=null;SB.netWarned=false;SB.lastSyncAt=Date.now();if(orvexQ())orvexQ().onSuccess();persistBase();ok=true}catch(e){SB.dirty=true;if(/ORVEX_STOCK_CONFLICT/i.test(String(e&&e.message))){SB.stockConflict=String(e.message);clearTimeout(SB.retryTimer);toast('تعارض مخزون: لم تُعتمد العملية المتعارضة. افتح حالة المزامنة لمعرفة التفاصيل، ثم صحّح المخزون قبل إعادة المحاولة.')}else if(e&&e.orvexPermanent){SB.blocked=e.message;clearTimeout(SB.retryTimer);toast(e.message+'. لن تُعاد المحاولة تلقائيًا؛ افتح حالة المزامنة للمراجعة.')}else if(e&&e.network){if(!SB.netWarned){SB.netWarned=true;toast('لا يوجد اتصال بالخادم. تُحفظ العمليات على هذا الجهاز وتُرسل تلقائيًا عند عودة الاتصال.')}scheduleSyncRetry()}else{toast('تعذّرت المزامنة: '+e.message);scheduleSyncRetry()}}finally{SB.busy=false;if(SB.again){SB.again=false;clearTimeout(SB.pt);SB.pt=setTimeout(()=>{if(SB.dirty)push()},300)}}return ok}
const _sv=save;save=function(){_sv();if(SB.prof&&SB.prof.role==='founder'&&!SB.shop&&SB.sess){if(FC.ready){FC.dirty=true;scheduleFounderCatalogPush()}return}if(SB.shop&&SB.sess){SB.changeSeq=(SB.changeSeq||0)+1;SB.dirty=true;clearTimeout(SB.pt);SB.pt=setTimeout(push,1200)}};
/* عند عودة الإنترنت، لا ننتظر دورة المزامنة الدورية */
window.addEventListener('online',()=>{if(SB.shop&&SB.sess&&SB.dirty&&!SB.authExpired){clearTimeout(SB.pt);clearTimeout(SB.retryTimer);SB.retryCount=0;SB.pt=setTimeout(()=>push(),400)}});
window.addEventListener('beforeunload',e=>{if(SB.dirty){e.preventDefault();e.returnValue=''}});

window.__orvexSync={get COLL(){return COLL},ifKey:IFK,inflightAdd,recoverLocal,loadBase,persistBase,refill,poolLoad,get SB(){return SB},get last(){return last},set last(v){last=v},push,pullInc,pull,pullFounderCatalog,pushFounderCatalog,get FC(){return FC}};/* لاختبارات tests/run.js */
window.__orvexRequest=(p,o)=>rq(p,o);
const NF={inv:'next',po:'nextPo',rt:'nextRt'},POOLK=()=>KEY+'_pool_'+SB.shop;
function poolLoad(){try{window.__numPool=JSON.parse(localStorage.getItem(POOLK())||'{}')}catch(e){window.__numPool={}}}
window.__numSave=()=>{try{localStorage.setItem(POOLK(),JSON.stringify(window.__numPool))}catch(e){}};
/* أدنى رقم آمن: لا يقل عن العداد المحلي ولا عن أكبر رقم مستخدم فعلًا في المستندات الموجودة (حتى لا يتكرر رقم قديم) */
function floorOf(k){const src={inv:[db.sales,db.settings.prefix],po:[db.purchases,'PUR-'],rt:[db.returns,'RT-']}[k];let m=Math.floor(+db.settings[NF[k]]||1);(src[0]||[]).forEach(x=>{const s=String(x.no||'');if(s.indexOf(src[1])===0&&/^\d+$/.test(s.slice(src[1].length))){const n=parseInt(s.slice(src[1].length),10);if(n+1>m)m=n+1}});return Math.max(1,m)}
async function refill(){if(!SB.shop||!SB.sess||SB.rf)return;SB.rf=true;try{for(const k of Object.keys(NF)){const a=(window.__numPool[k]=window.__numPool[k]||[]);if(a.length>=5)continue;const n=20,s=await rq('/rest/v1/rpc/reserve_numbers',{method:'POST',body:JSON.stringify({p_shop:SB.shop,p_name:k,p_count:n,p_floor:floorOf(k)})});for(let i=0;i<n;i++)a.push(s+i);window.__numSave()}}catch(e){}finally{SB.rf=false}}
window.__numRefill=refill;
function startSync(){window.__numOnline=true;poolLoad();refill();try{if(ifGet().length){SB.dirty=true;clearTimeout(SB.pt);SB.pt=setTimeout(push,1500)}}catch(e){}clearInterval(SB.poll);SB.poll=setInterval(async()=>{if(!SB.sess||!SB.shop||SB.authExpired||SB.dirty||SB.busy)return;try{refill();SB.n=(SB.n||0)+1;if(await(SB.n%10===0?pull(false):pullInc())){const t=document.activeElement&&document.activeElement.tagName;if(!$('#modal')&&!$('#pos')&&t!=='INPUT'&&t!=='TEXTAREA')render()}}catch(e){}},30000)}
/* --- الدخول --- */
showAuth=function(){const o=document.getElementById('auth');if(o)o.remove();const d=document.createElement('div');d.id='auth';
 d.innerHTML=`<div class="auth-card">${orvexLogo('a')}<h1>ORVEX</h1><p class="muted" style="margin-top:0">تسجيل الدخول</p><label>اسم المستخدم</label><input id="a_user" autocapitalize="off" autocomplete="username"><label>كلمة المرور</label><input id="a_pass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')sbLogin()"><div class="actions"><button type="button" class="btn primary" id="a_btn" onclick="window.sbLogin()">دخول</button></div><p style="text-align:center;margin:14px 0 0"><a href="#" class="muted" onclick="sbSetup();return false">إعداد المؤسس لأول مرة</a></p></div>`;document.body.appendChild(d);(async()=>{try{const c=d.querySelector('.auth-card'),[u,p,l]=await Promise.all([Store.hasBackup('unsynced',KEY+'_unsynced_backup'),Store.hasBackup('prelogin',KEY+'_prelogin_backup'),Store.hasBackup('legacy_localstorage','')]);if(!(u||p||l)||document.getElementById('auth')!==d)return;const note=document.createElement('p');note.className='muted';note.textContent='توجد نسخة احتياطية محلية يمكن تنزيلها قبل المتابعة.';note.style.marginTop='14px';c.appendChild(note);const add=(t,f)=>{const b=document.createElement('button');b.className='btn';b.style.marginTop='8px';b.textContent=t;b.onclick=f;c.appendChild(b)};if(u)add('تنزيل تغييرات لم تتم مزامنتها',downloadPendingBackup);if(p)add('تنزيل نسخة ما قبل تسجيل الدخول',downloadPreloginBackup);if(l)add('تنزيل نسخة ما قبل الترحيل',downloadLegacyBackup)}catch(e){}})()};
async function downloadBackupFromKey(name,legacyKey,filename){let raw='';try{raw=await Store.getBackup(name,legacyKey)}catch(e){}if(!raw)return toast('لا توجد نسخة احتياطية محفوظة');try{const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('تم تجهيز تنزيل النسخة الاحتياطية')}catch(e){toast('تعذر تنزيل النسخة الاحتياطية: '+e.message)}}
function downloadPendingBackup(){return downloadBackupFromKey('unsynced',KEY+'_unsynced_backup','ORVEX_unsynced_backup.json')}
function downloadPreloginBackup(){return downloadBackupFromKey('prelogin',KEY+'_prelogin_backup','ORVEX_prelogin_backup.json')}
function downloadLegacyBackup(){return downloadBackupFromKey('legacy_localstorage','','ORVEX_pre_migration_backup.json')}
window.__orvexDownloadPendingBackup=downloadPendingBackup;window.__orvexDownloadPreloginBackup=downloadPreloginBackup;
window.sbLogin=async function(){const un=$('#a_user').value.trim().toLowerCase(),pw=$('#a_pass').value,b=$('#a_btn');let saved=null;try{saved=JSON.parse(sessionStorage.getItem(ORVEX_TAB_SESSION)||'null')}catch(e){}if((!un||!pw)&&!(saved&&saved.rt&&saved.username))return toast('أدخل اسم المستخدم وكلمة المرور');const oldText=b.textContent;b.disabled=true;b.textContent='جارٍ تسجيل الدخول...';let loginTimer=0;const LG=m=>{try{console.info('[ORVEX login]',m)}catch(e){}};let stage='الاتصال بخدمة المصادقة';LG(stage);LG(stage);
 try{const ac=new AbortController();loginTimer=setTimeout(()=>ac.abort(),20000);const resume=!!(saved&&saved.rt&&saved.username&&(!un||un===saved.username)&&!pw);const r=await fetch(U+'/auth/v1/token?grant_type='+(resume?'refresh_token':'password'),{method:'POST',headers:{apikey:AK,'Content-Type':'application/json'},body:JSON.stringify(resume?{refresh_token:saved.rt}:{email:em(un),password:pw}),signal:ac.signal});clearTimeout(loginTimer);const j=await r.json();
  if(!r.ok){b.disabled=false;b.textContent=oldText;console.error('[ORVEX login] رفض Supabase Auth',r.status,j&&(j.error_code||j.error||j.msg||j.message));return toast(r.status===400||r.status===401||r.status===422?'اسم المستخدم أو كلمة المرور غير صحيحة':'تعذّر الاتصال بخدمة المصادقة (HTTP '+r.status+')')}LG('نجحت المصادقة uid='+j.user.id);
  SB.sess={at:j.access_token,rt:j.refresh_token,exp:Date.now()+j.expires_in*1000,uid:j.user.id};try{sessionStorage.setItem(ORVEX_TAB_SESSION,JSON.stringify({username:resume?saved.username:un,rt:j.refresh_token,uid:j.user.id}))}catch(e){}SB.authExpired=false;SB.authWarned=false;SB.retryCount=0;clearTimeout(SB.retryTimer);
  stage='قراءة ملف المستخدم من profiles';LG(stage);const p=(await rq('/rest/v1/profiles?id=eq.'+SB.sess.uid+'&select=*'))[0];if(!p||!p.active)throw new Error('الحساب غير موجود أو موقوف');LG('الدور='+p.role+' shop_id='+(p.shop_id||'null'));
  if(p.role==='mall_manager'){stage='فتح واجهة مدير المجمع';LG(stage);if(!window.orvexMall)throw new Error('وحدة مدير المجمع غير محمّلة');SB.prof=p;SB.me=toUser(p);SB.shop=null;await window.orvexMall.enter();return}
  stage='التحقق من اعتماد الجهاز';LG(stage);const d=await fn({action:'device',device_id:devId()});if(!d.ok)throw new Error(d.error||'الجهاز غير مفعّل');
  stage='تهيئة حساب المستخدم';LG(stage);SB.prof=p;SB.me=toUser(p);const old=db;db=normalize(fresh());db.edition=p.role==='founder'?'studio':'manager';db.users=[SB.me];SB.shop=p.shop_id||null;const myOwner=window.orvexOwner.mine(SB),prevOwner=window.orvexOwner.prev();
  if(SB.shop){stage='تحميل بيانات المحل من Supabase';LG(stage);await pull(true);stage='مقارنة البيانات المحلية وحفظ النسخة الاحتياطية';LG(stage);const localHasData=COLL.some(k=>Array.isArray(old[k])&&old[k].length>0),cloudHasData=COLL.some(k=>Array.isArray(db[k])&&db[k].length>0),localDiff=localHasData&&sig(old)!==sig(db);let recd=null;if(localDiff){try{await Store.putBackup('prelogin',({format:'ORVEX-prelogin-backup-v1',savedAt:new Date().toISOString(),shopId:SB.shop,ownerBefore:prevOwner||'unknown',username:un,data:old}))}catch(e){toast('تنبيه: تعذر إنشاء نسخة احتياطية للبيانات المحلية السابقة')}if(cloudHasData&&window.orvexOwner.canRestore(prevOwner,myOwner)){try{recd=recoverLocal(old,SB.shop);if(recd.n||recd.conf){save();setTimeout(()=>toast('استُرجع '+recd.n+' تغيير أُجري دون اتصال وسيُرفع الآن'+(recd.conf?' · '+recd.conf+' تعارض في سجل المزامنة':'')),600)}}catch(e){recd=null}}}if(p.role==='manager'&&localHasData&&!cloudHasData&&window.orvexOwner.canRestore(prevOwner,myOwner)&&confirm('لم نجد سجلات على الخادم، لكن توجد بيانات محلية سابقة. هل تريد استعادتها ورفعها؟')){COLL.forEach(k=>db[k]=old[k]||[]);Object.assign(db.settings,old.settings,{name:db.settings.name});save()}else if(localHasData&&!cloudHasData&&!window.orvexOwner.canRestore(prevOwner,myOwner)){toast('وُجدت بيانات محلية لا تخص هذا المتجر؛ لم تُرفع وحُفظت في نسخة احتياطية منفصلة.')}else if(localDiff&&cloudHasData){toast('احتفظ ORVEX بنسخة احتياطية من البيانات المحلية السابقة؛ يمكنك تنزيلها من شاشة تسجيل الدخول إذا احتجت إليها.')}}
  if(p.role==='founder'&&!SB.shop){stage='تحميل كتالوج المؤسس';LG(stage);await pullFounderCatalog();db.edition='studio';db.users=[SB.me]}
  stage='فتح واجهة ORVEX';LG(stage);window.orvexOwner.set(myOwner);loginAs(SB.me);if(!state.user||document.getElementById('auth'))throw new Error('لم تُفتح الواجهة بعد loginAs');LG('تم فتح الواجهة view='+state.view);stage='بدء المزامنة';LG(stage);startSync()}catch(e){clearTimeout(loginTimer);const msg=e&&e.name==='AbortError'?'انتهت مهلة الاتصال بعد 20 ثانية':(e&&e.message?e.message:'خطأ غير معروف');console.error('[ORVEX login/render]',stage,e);SB.sess=null;SB.prof=null;SB.shop=null;SB.me=null;FC.ready=false;state.user=null;b.disabled=false;b.textContent=oldText;showAuth();const card=document.querySelector('#auth .auth-card');if(card){const box=document.createElement('div');box.id='orvex-login-diagnostic';box.style.cssText='margin:14px 0 0;padding:12px;border:1px solid #d97706;border-radius:10px;background:#fff7ed;color:#7c2d12;text-align:right;direction:rtl;font-size:14px;line-height:1.7';box.textContent='تعذّر إكمال الدخول — المرحلة: '+stage+' — التفاصيل: '+msg;card.appendChild(box)}toast('تعذّر فتح الحساب في مرحلة: '+stage)}};
window.sbSetup=function(){modal('إعداد المؤسس لأول مرة',`<p class="muted" style="margin-top:0">يعمل مرة واحدة فقط. أدخل رمز الإعداد الذي سُلّم لك.</p><label>رمز الإعداد</label><input id="b_c" autocapitalize="characters"><label>الاسم</label><input id="b_n"><label>اسم المستخدم (إنجليزي)</label><input id="b_u" autocapitalize="off"><label>كلمة المرور (6 أحرف+)</label><input id="b_p" type="password"><div class="actions"><button class="btn primary" onclick="sbDoSetup()">إنشاء</button></div>`)};
window.sbDoSetup=async function(){try{await fn({action:'bootstrap',code:$('#b_c').value.trim(),full_name:$('#b_n').value.trim(),username:$('#b_u').value.trim(),password:$('#b_p').value});closeModal();toast('تم إنشاء حساب المؤسس. سجّل دخولك')}catch(e){toast(e.message)}};
const _lo=logout;logout=async function(){if(SB.loggingOut)return;SB.loggingOut=true;try{clearTimeout(SB.pt);clearTimeout(SB.retryTimer);clearTimeout(FC.timer);if(SB.prof&&SB.prof.role==='founder'&&!SB.shop&&FC.ready&&FC.dirty){await pushFounderCatalog();if(FC.dirty){toast('لم يكتمل حفظ كتالوج المؤسس. تحقق من الاتصال ثم حاول تسجيل الخروج مجددًا.');return}}if(SB.shop&&SB.sess){let waited=0;while(SB.busy&&waited<30000){await new Promise(r=>setTimeout(r,100));waited+=100}if(SB.busy){toast('المزامنة ما زالت تعمل. انتظر قليلًا ثم حاول تسجيل الخروج.');return}if(SB.dirty){await push();if(SB.dirty){try{await Store.putBackup('unsynced',({format:'ORVEX-unsynced-backup-v1',savedAt:new Date().toISOString(),shopId:SB.shop,username:SB.prof&&SB.prof.username||'',data:db}))}catch(e){toast('تعذّرت المزامنة ولم أستطع حفظ نسخة احتياطية محلية. لن يتم تسجيل الخروج حتى لا تفقد التغييرات.');return}if(!confirm('تعذّرت مزامنة بعض التغييرات. حفظت نسخة احتياطية محلية للتنزيل لاحقًا. هل تريد تسجيل الخروج رغم ذلك؟'))return}}}clearInterval(SB.poll);clearTimeout(SB.pt);clearTimeout(SB.retryTimer);clearTimeout(baseT);window.__numOnline=false;clearTabSession();/* عودة إلى شاشة الدخول فقط: احتفظ بجلسة الحساب والبيانات في الذاكرة ولا تمسحها */showAuth();toast('تمت العودة إلى شاشة تسجيل الدخول. لم يتم إنهاء الجلسة أو حذف بيانات المتجر.')}finally{SB.loggingOut=false}};
doPw=async function(){const n=$('#pw1').value;if(n.length<6)return toast('كلمة المرور 6 أحرف على الأقل');try{const r=await fetch(U+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:AK,'Content-Type':'application/json'},body:JSON.stringify({email:em(SB.prof.username),password:$('#pw0').value})});if(!r.ok)return toast('كلمة المرور الحالية غير صحيحة');await rq('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:n})});closeModal();toast('تم تغيير كلمة المرور')}catch(e){toast(e.message)}};
/* --- الموظفون (المدير) --- */
saveUser=async function(id){if(!isAdmin())return toast('للمدير فقط');const name=$('#u_name').value.trim(),un=$('#u_user').value.trim().toLowerCase(),pw=$('#u_pass').value,role=$('#u_role').value,active=$('#u_active').checked;
 if(!name||!un)return toast('أدخل الاسم واسم المستخدم');const perms={};document.querySelectorAll('#u_perms input[data-p]').forEach(b=>{if(b.checked)perms[b.dataset.p]=true});perms._role=role;
 try{if(!id){if(role==='admin'&&!isDesigner())return toast('إنشاء المدير للمؤسس فقط');await fn({action:'create_user',username:un,password:pw,full_name:name,role:role==='admin'?'manager':'staff',shop_id:SB.shop,perms})}
  else{await rq('/rest/v1/profiles?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({full_name:name,perms,active})});if(pw)await fn({action:'reset_password',profile_id:id,password:pw})}
  await pull(true);closeModal();render();toast('تم الحفظ')}catch(e){toast(e.message)}};
delUser=function(id){if(!isAdmin())return;const u=db.users.find(x=>x.id===id);if(!u||id===state.user)return;askConfirm('حذف حساب «'+u.name+'» نهائياً؟',async()=>{try{await fn({action:'delete_user',profile_id:id});await pull(true);render()}catch(e){toast(e.message)}},'حذف')};
const _vu=vUsers;vUsers=function(){setTimeout(loadDevs,40);return _vu()+'<div class="card" id="devbox"><h3>الأجهزة</h3><p class="muted">جارٍ التحميل…</p></div>'+(SB.shop&&isAdmin()?'<div class="card"><h3>سجل العمليات الحساسة</h3><p class="muted">حذف وتعديل وإلغاء الفواتير، تغيير الأسعار، حذف المنتجات والعملاء.</p><button class="btn" onclick="auditView(\''+jsq(SB.shop)+'\')">عرض السجل</button></div>':'')};
async function loadDevs(){const b=$('#devbox');if(!b||!SB.shop)return;try{const D=await rq('/rest/v1/devices?shop_id=eq.'+SB.shop+'&select=*&order=created_at');
 b.innerHTML='<h3>الأجهزة</h3>'+(D.map(d=>{const u=db.users.find(x=>x.id===d.profile_id);return `<div class="row"><div class="grow"><div class="t">${esc(u?u.name:'?')}</div><small>جهاز ${esc(d.device_id.slice(0,8))} - ${d.approved?'مفعّل':'بانتظار الموافقة'}</small></div>${isDesigner()?(d.approved?'':`<button class="btn primary" onclick="devOk('${jsq(d.id)}')">موافقة</button>`)+`<button class="btn danger" onclick="devDel('${jsq(d.id)}')">إلغاء الجهاز</button>`:''}</div>`}).join('')||'<p class="muted">لا توجد أجهزة</p>')+'<p class="muted" style="font-size:12.5px">'+(isDesigner()?'تفعيل جهاز جديد لحساب يلغي جهازه القديم تلقائياً. حسابات الكاشير تُفعَّل بأمرك فقط.':'تفعيل الأجهزة وإلغاؤها من صلاحيات المؤسس فقط. حسابات الكاشير تعمل على جهاز واحد يحدده المؤسس.')+'</p>'}catch(e){b.innerHTML='<h3>الأجهزة</h3><p class="muted">'+esc(e.message)+'</p>'}}
window.devOk=async id=>{try{await rq('/rest/v1/devices?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({approved:true})});loadDevs();loadPend()}catch(e){toast(e.message)}};
window.devDel=async id=>{try{await rq('/rest/v1/devices?id=eq.'+id,{method:'DELETE'});loadDevs();loadPend()}catch(e){toast(e.message)}};
/* --- لوحة المؤسس --- */
vStudio=function(){if(!isDesigner())return '';if(state.shopId){closeShop();return ''}setTimeout(loadShops,30);setTimeout(loadPend,60);setTimeout(loadDevReq,70);return `<div class="note">لوحة المؤسس: أنشئ محلاً وحساب مدير له، وتحكّم بالمميزات والترخيص، وافتح بياناته مباشرة.</div><div class="card" id="pendList" style="display:none"></div><div class="card" id="reqList" style="display:none"></div><div class="actions" style="margin:0 0 10px"><button class="btn" onclick="auditView()">📜 سجل التغييرات (كل المحلات)</button></div><div class="card" id="shopList"><p class="muted">جارٍ التحميل…</p></div><button class="fab" onclick="newShopForm()">+ محل جديد</button>`};
async function loadShops(){const b=$('#shopList');if(!b||!founderOK())return;try{const S=await rq('/rest/v1/shops?select=*&order=created_at'),P=await rq('/rest/v1/profiles?role=eq.manager&select=*');SB.shops=S;
 b.innerHTML=S.length?S.map(s=>{const m=P.find(x=>x.shop_id===s.id);return `<button class="row tap" onclick="shopMenu('${jsq(s.id)}')"><div class="grow"><div class="t">${esc(s.name)}</div><small>المدير: ${m?esc(m.full_name)+' (@'+esc(m.username)+')':'-'}</small></div><span class="badge ${s.license_active?'':'grey'}">${s.license_active?'فعّال':'موقوف'}</span></button>`}).join(''):empty('لا توجد محلات بعد.')}catch(e){b.innerHTML='<p class="muted">'+esc(e.message)+'</p>'}}
async function loadPend(){const b=$('#pendList');if(!b||!founderOK())return;try{const D=await rq('/rest/v1/devices?approved=eq.false&select=*&order=created_at'),P=D.length?await rq('/rest/v1/profiles?id=in.('+[...new Set(D.map(d=>d.profile_id))].join(',')+')&select=id,full_name,username,shop_id'):[],S=SB.shops||await rq('/rest/v1/shops?select=id,name');
 b.style.display=D.length?'block':'none';b.innerHTML='<h3>طلبات تفعيل الأجهزة</h3>'+D.map(d=>{const u=P.find(x=>x.id===d.profile_id)||{},sh=S.find(x=>x.id===u.shop_id);return `<div class="row"><div class="grow"><div class="t">${esc(u.full_name||'?')} <small>@${esc(u.username||'')}</small></div><small>${esc(sh?sh.name:'')} - جهاز ${esc(d.device_id.slice(0,8))}</small></div><button class="btn primary" onclick="devOk('${jsq(d.id)}')">تفعيل</button><button class="btn danger" onclick="devDel('${jsq(d.id)}')">رفض</button></div>`}).join('')}catch(e){}}
window.newShopForm=function(){modal('محل جديد',`<label>اسم المحل</label><input id="n_s"><label>اسم المدير</label><input id="n_n"><div class="f2"><div><label>اسم المستخدم</label><input id="n_u" autocapitalize="off"></div><div><label>كلمة المرور (6+)</label><input id="n_p" type="password"></div></div><label>البريد الإلكتروني للمدير</label><input id="n_e" type="email" autocomplete="off" autocapitalize="off"><label>هاتف المدير</label><input id="n_h" type="tel"><div class="actions"><button class="btn primary" onclick="makeShop()">إنشاء</button></div>`)};
window.makeShop=async function(){try{await fn({action:'create_shop',name:$('#n_s').value,full_name:$('#n_n').value,username:$('#n_u').value,password:$('#n_p').value,phone:$('#n_h').value,email:$('#n_e').value});closeModal();toast('تم إنشاء المحل وحساب المدير');loadShops()}catch(e){toast(e.message)}};
/* --- سجل تغييرات المحلات (للمؤسس) --- */
const AUD_F={license_active:'ترخيص المحل',allow_any_device:'الدخول من أي جهاز',features:'المميزات',sale_delete:'حذف فاتورة',sale_void:'إلغاء فاتورة',sale_edit:'تعديل فاتورة',price_change:'تغيير سعر/تكلفة',product_delete:'حذف منتج',customer_delete:'حذف عميل',record_delete:'حذف سجل'};
const AUD_OPS=['sale_delete','sale_void','sale_edit','price_change','product_delete','customer_delete','record_delete'];
const AUD_R={founder:'المؤسس',manager:'مدير المحل',staff:'موظف',service:'النظام'};
const audOn=(k,v)=>(k==='site'||k==='ai')?v===true:v!==false;
const audVal=(f,v)=>v==null?'—':f==='license_active'?(v==='true'?'فعّال':'موقوف'):f==='allow_any_device'?(v==='true'?'مسموح':'غير مسموح'):v;
const audFeat=(o,n)=>{let a={},b={};try{a=JSON.parse(o||'{}')||{};b=JSON.parse(n||'{}')||{}}catch(e){return 'تعديل المميزات'}
 const d=FEATURES.filter(([k])=>audOn(k,a[k])!==audOn(k,b[k])).map(([k,l])=>l+': '+(audOn(k,b[k])?'تفعيل':'إيقاف'));
 return d.length?d.join('، '):'تعديل المميزات'};
const audTime=t=>{try{return new Date(t).toLocaleString('en-GB',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return t}};
window.auditView=async function(shopId,flt){
 shopId=shopId||'';flt=flt||'all';
 if(!founderOK()){if(!SB.shop)return toast('هذه الوظيفة للمؤسس فقط');shopId=SB.shop}
 modal(shopId?'سجل تغييرات المحل':'سجل التغييرات','<p class="muted">جارٍ التحميل…</p>');
 try{
  const R=await rq('/rest/v1/shop_audit?select=*&order=created_at.desc&limit=200'+(shopId?'&shop_id=eq.'+shopId:'')+(flt==='blocked'?'&blocked=eq.true':'')),
   ids=[...new Set(R.map(r=>r.actor_id).filter(Boolean))],
   P=ids.length?await rq('/rest/v1/profiles?id=in.('+ids.join(',')+')&select=id,full_name,username'):[],
   S=SB.shops||await rq('/rest/v1/shops?select=id,name');
  const chip=(k,l)=>`<button class="chip ${flt===k?'on':''}" onclick="auditView('${jsq(shopId)}','${jsq(k)}')">${l}</button>`;
  setBody(`<div class="chips">${chip('all','الكل')}${chip('blocked','المحاولات المحجوبة')}</div>
   <p class="muted" style="font-size:12.5px;margin:0 0 6px">«محاولة محجوبة» تعني أن غير المؤسس حاول تغيير حقل محمي فأُعيد لقيمته الأصلية. يُعرض آخر 200 سجل.</p>
   <div class="card">${R.length?R.map(r=>{
    const sn=(S.find(x=>x.id===r.shop_id)||{}).name||'محل محذوف',pf=P.find(x=>x.id===r.actor_id),
     who=pf?pf.full_name+' (@'+pf.username+')':'—',
     ch=r.field==='features'?audFeat(r.old_value,r.new_value):AUD_OPS.includes(r.field)?(r.old_value||'')+(r.new_value?'  ←  '+r.new_value:''):'من '+audVal(r.field,r.old_value)+' إلى '+audVal(r.field,r.new_value);
    return `<div class="row" style="align-items:flex-start"><div class="grow" style="min-width:0"><div class="t" style="white-space:normal">${shopId?'':esc(sn)+' · '}${esc(AUD_F[r.field]||r.field)}</div><small>${esc(ch)}</small><small>${esc(who)} · ${esc(AUD_R[r.actor_role]||r.actor_role||'')} · <bdi>${audTime(r.created_at)}</bdi></small></div><span class="badge ${r.blocked?'bad':''}">${r.blocked?'محاولة محجوبة':'تم'}</span></div>`}).join(''):empty(flt==='blocked'?'لا توجد محاولات محجوبة.':'لا توجد تغييرات مسجّلة بعد.')}</div>`)
 }catch(e){setBody('<p class="muted">'+esc(e.message)+'</p>')}};
window.shopMenu=async function(id){const s=(SB.shops||[]).find(x=>x.id===id);if(!s)return;const f=s.features||{};
 let m=null;try{m=(await rq('/rest/v1/profiles?shop_id=eq.'+id+'&role=eq.manager&select=*'))[0]||null}catch(e){}
 window._shopMgr=m;
 modal('تعديل محل',`<label>اسم المحل</label><input id="sf_n" value="${esc(s.name)}">
 ${m?`<label>اسم المدير</label><input id="sf_mn" value="${esc(m.full_name)}"><label>البريد الإلكتروني للمدير</label><input id="sf_em" type="email" autocomplete="off" autocapitalize="off" value="${esc(m.email||'')}"><div class="f2"><div><label>اسم المستخدم</label><input id="sf_un" autocapitalize="off" value="${esc(m.username)}"></div><div><label>كلمة مرور جديدة (اختياري)</label><input id="sf_pw" type="password" autocomplete="new-password"></div></div>`:''}
 <label>المميزات المتاحة للمدير</label><div class="card" style="padding:4px 12px">${FEATURES.map(([k,l])=>`<label class="pchk"><input type="checkbox" data-sf="${k}" ${((k==='site'||k==='ai')?f[k]===true:f[k]!==false)?'checked':''}> ${l}</label>`).join('')}</div>
 <label>ملاحظة التحديث (تظهر للمدير)</label><input id="sf_note" value="${esc(s.note||'')}">
 <label class="pchk" style="border:0"><input type="checkbox" id="sf_a" ${s.license_active?'checked':''}> ترخيص المحل فعّال</label>
 <label class="pchk" style="border:0"><input type="checkbox" id="sf_any" ${s.allow_any_device?'checked':''}> السماح لمدير المحل بالدخول من أي جهاز</label>
 <p class="muted" style="font-size:12.5px;margin:0 0 6px">عند التفعيل يدخل المدير من أي جهاز دون موافقة أو كود تفعيل. لا ينطبق على الكاشير والموظفين. يقلل مستوى الحماية، فاستخدمه بحذر.</p>
 <div class="actions"><button class="btn primary" onclick="saveShopF('${jsq(id)}')">حفظ</button></div>
 <div class="actions"><button class="btn primary" onclick="openShop('${jsq(id)}')">الدخول إلى حساب المدير</button></div>
 <div class="actions"><button class="btn" onclick="dlMgrCopy('${jsq(id)}')">تنزيل نسخة المدير</button><button class="btn" onclick="updInfo('${jsq(id)}')">كود التحديث</button></div>
 <div class="actions"><button class="btn" onclick="auditView('${jsq(id)}')">📜 سجل تغييرات هذا المحل</button></div>
 <div class="actions"><button class="btn danger" style="flex:1.35" onclick="delShop('${jsq(id)}')">حذف المحل</button><button class="btn" onclick="mgrDevices('${jsq(id)}')">تفعيل جهاز المدير</button></div>`)};
window.dlMgrCopy=async function(id){const s=(SB.shops||[]).find(x=>x.id===id);if(!s)return;
 try{const doc=document.documentElement.cloneNode(true);
  doc.querySelectorAll('#auth,#pos,#modal,#plock,.toast,#seed,#orvex_pkg').forEach(e=>e.remove());
  const m=doc.querySelector('#main');if(m)m.innerHTML='';const n=doc.querySelector('#nav');if(n)n.innerHTML='';
  const ti=doc.querySelector('#title');if(ti)ti.textContent='';const td=doc.querySelector('#today');if(td)td.textContent='';
  const bd=doc.querySelector('body');if(bd)bd.removeAttribute('class');
  const sc=document.createElement('script');sc.id='orvex_pkg';sc.type='application/json';sc.textContent=JSON.stringify({sid:s.id,name:s.name}).replace(/</g,'\\u003c');
  doc.querySelector('head').appendChild(sc);
  const tt=doc.querySelector('title');if(tt)tt.textContent=s.name+' - ORVEX';
  const html='<!DOCTYPE html>\n'+doc.outerHTML;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  a.download='ORVEX_'+String(s.name).replace(/[\\\/:*?"<>|\s]+/g,'_')+'.html';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  toast('تم تجهيز نسخة المدير')}catch(e){toast('تعذّر تجهيز النسخة')}};
window.updInfo=function(id){const s=(SB.shops||[]).find(x=>x.id===id);if(!s)return;modal('كود التحديث',`<p class="muted" style="margin-top:0">لا حاجة لكود: أي تعديل تحفظه (المميزات، الترخيص، الملاحظة) يصل المدير تلقائيًا عند فتح البرنامج.</p><div class="actions"><button class="btn" onclick="siteSend(window.appLink(),'برنامج المحل')">رابط البرنامج</button><button class="btn" onclick="shopLink('${jsq(id)}')">رابط المتجر</button></div>`)};
window.mgrDevices=function(id,code){modal('تفعيل جهاز',`<p class="muted" style="margin-top:0">رقم الجهاز يصلك تلقائياً من نسخة المدير، أو الصقه يدوياً. الكود يعمل على ذلك الجهاز فقط.</p><input id="dv_id" autocapitalize="characters" value="${esc(code||'')}"><div class="actions"><button class="btn primary" onclick="makeDevCodeS('${jsq(id)}')">إنشاء الكود</button></div><div id="dv_out"></div>`);if(code)setTimeout(()=>makeDevCodeS(id),0)};
window.loadDevReq=async function(){const b=$('#reqList');if(!b||!founderOK())return;try{const R=await rq('/rest/v1/device_requests?select=*&order=created_at.desc'),S=SB.shops||await rq('/rest/v1/shops?select=id,name');b.style.display=R.length?'block':'none';b.innerHTML='<h3>طلبات تفعيل نسخة المدير</h3>'+R.map(r=>{const sh=S.find(x=>x.id===r.shop_id);return `<div class="row"><div class="grow"><div class="t">${esc(sh?sh.name:'?')}</div><small>رقم الجهاز: ${esc(r.device_code)}</small></div><button class="btn primary" onclick="mgrDevices('${jsq(r.shop_id)}','${jsq(r.device_code)}')">إنشاء الكود</button><button class="btn danger" onclick="devReqDel('${jsq(r.id)}')">حذف</button></div>`}).join('')}catch(e){}};
window.devReqDel=async id=>{try{await rq('/rest/v1/device_requests?id=eq.'+id,{method:'DELETE'});loadDevReq()}catch(e){toast(e.message)}};
window.makeDevCodeS=async function(id){const d=($('#dv_id').value||'').trim().toUpperCase();if(!id||d.length<6)return toast('أدخل رقم الجهاز');$('#dv_out').innerHTML='<p class="muted">جارٍ إنشاء كود التفعيل على الخادم…</p>';try{const r=await fn({action:'pkg_code',shop_id:id,device_code:d});if(!r||!r.code)throw new Error((r&&r.error)||'تعذّر إنشاء الكود');$('#dv_out').innerHTML=`<label>كود التفعيل</label><input readonly value="${esc(r.code)}" onclick="this.select()">`}catch(e){$('#dv_out').innerHTML=`<p class="muted">${esc(e.message||'تعذّر إنشاء الكود')}</p>`}};
window.appLink=function(){return location.href.split('#')[0].split('?')[0]};
window.saveShopF=async function(id){const s=(SB.shops||[]).find(x=>x.id===id)||{};const features={};document.querySelectorAll('[data-sf]').forEach(b=>features[b.dataset.sf]=b.checked);
 const name=($('#sf_n').value||'').trim();if(!name)return toast('أدخل اسم المحل');const pw=$('#sf_pw')?$('#sf_pw').value:'';if(pw&&pw.length<6)return toast('كلمة المرور 6 أحرف على الأقل');
 const M=window._shopMgr;let mb=null;
 if(M&&$('#sf_un')){const mn=($('#sf_mn').value||'').trim(),me=($('#sf_em').value||'').trim().toLowerCase(),un=($('#sf_un').value||'').trim().toLowerCase();
  if(!mn)return toast('أدخل اسم المدير');if(me&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(me))return toast('أدخل بريداً إلكترونياً صحيحاً للمدير');
  if(!/^[a-z0-9_.-]{3,30}$/.test(un))return toast('اسم المستخدم 3-30 حرفاً إنجليزياً/أرقام بدون مسافات');
  mb={action:'update_user',profile_id:M.id};if(mn!==M.full_name)mb.full_name=mn;if(me!==(M.email||''))mb.email=me;if(un!==M.username)mb.username=un}
 try{if(mb&&Object.keys(mb).length>2)await fn(mb);
  await rq('/rest/v1/shops?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({name,features,license_active:$('#sf_a').checked,allow_any_device:$('#sf_any')?$('#sf_any').checked:false,note:$('#sf_note').value.trim()||null,settings:Object.assign({},s.settings||{},{name})})});
  if(pw&&window._shopMgr)await fn({action:'reset_password',profile_id:window._shopMgr.id,password:pw});
  closeModal();loadShops();toast('تم الحفظ')}catch(e){toast(e.message)}};
window.delShop=function(id){const s=(SB.shops||[]).find(x=>x.id===id);askConfirm('حذف المحل «'+(s?s.name:'')+'» نهائيًا مع كل بياناته وحسابات موظفيه؟ لا يمكن التراجع.',async()=>{try{await fn({action:'delete_shop',shop_id:id});closeModal();loadShops();toast('تم حذف المحل')}catch(e){toast(e.message)}},'حذف')};
window.openShop=async function(id){try{closeModal();if(SB.prof&&SB.prof.role==='founder'&&!SB.shop&&FC.dirty){await pushFounderCatalog();if(FC.dirty)throw new Error('لم يُحفظ كتالوج المؤسس بعد؛ تحقق من الاتصال قبل فتح المحل')}SB.shop=id;state.shopId=id;await pull(true);state.view='home';render();window.scrollTo(0,0)}catch(e){SB.shop=null;state.shopId=null;toast(e.message)}};
/* كتالوج المؤسس مستقل تمامًا عن منتجات المحلات */
window.closeShop=async function(){try{await push()}catch(e){}SB.shop=null;state.shopId=null;db=normalize(fresh());db.edition='studio';db.users=[SB.me];last={};try{await pullFounderCatalog()}catch(e){toast('تعذر تحميل كتالوج المؤسس: '+e.message)}state.view='studio';render()};
const _r3=render;render=function(){_r3();if(state.shopId){const m=$('#main');if(m)m.insertAdjacentHTML('afterbegin',`<div class="note" style="display:flex;gap:10px;justify-content:space-between;align-items:center"><span>أنت داخل بيانات محل «${esc(db.settings.name)}» كمؤسس.</span><button class="btn" style="flex:none" onclick="closeShop()">رجوع</button></div>`)}};
const _r4=render;render=function(){_r4();if(!state.shopId&&SB.note&&SB.prof&&SB.prof.role!=='founder'){const m=$('#main');if(m)m.insertAdjacentHTML('afterbegin',`<div class="note">${esc(SB.note)}</div>`)}};
/* --- الموقع الإلكتروني للمحل --- */
const siteBase=()=>(location.href.split('#')[0].split('?')[0]).replace(/[^\/]*$/,'')+'store.html';
const siteSend=(l,t)=>{if(navigator.share){navigator.share({title:t||'متجر',url:l}).catch(()=>{})}else{if(navigator.clipboard)navigator.clipboard.writeText(l).then(()=>toast('تم نسخ الرابط'),()=>toast(l));else toast(l)}};
window.shopLink=function(id){siteSend(siteBase()+'?s='+id,'رابط المتجر')};
window.vSite=function(){
 const s=db.settings.site||{},sid=SB.shop||'',base=s.base||siteBase(),link=sid?base+'?s='+sid:'';window._siteLink=link;
 return `<div class="card"><label class="pchk" style="border:0"><input type="checkbox" id="st_on" ${s.on?'checked':''}> تفعيل الموقع الإلكتروني للمحل</label>
 <label>عنوان الموقع</label><input id="st_title" value="${esc(s.title||db.settings.name)}">
 <label>وصف قصير</label><input id="st_desc" value="${esc(s.desc||'')}">
 <label>رقم واتساب لاستقبال الطلبات (مع رمز الدولة)</label><input id="st_wa" inputmode="tel" placeholder="9647xxxxxxxxx" value="${esc(s.wa||'')}">
 <label>عنوان صفحة المتجر (store.html)</label><input id="st_base" style="direction:ltr;text-align:left" value="${esc(base)}">
 <div class="actions"><button class="btn primary" onclick="saveSite()">حفظ</button></div></div>
 <div class="card"><h3>رابط المتجر</h3>${link?`<p class="muted" style="word-break:break-all;direction:ltr;text-align:left;margin-top:0">${esc(link)}</p><div class="actions"><button class="btn" onclick="siteSend(window._siteLink,'${jsq(s.title||db.settings.name)}')">نسخ / مشاركة الرابط</button></div><p class="muted" style="font-size:12.5px">يظهر في الموقع كل مادة سعرها أكبر من صفر. لإخفاء مادة: افتحها في المخزون وأزل علامة «عرض في الموقع الإلكتروني». أسعار الشراء والجملة لا تظهر أبدًا، والكمية تظهر كمتوفر أو غير متوفر فقط.</p>`:'<p class="muted">افتح بيانات محل لعرض رابطه.</p>'}</div>`};
window.siteSend=siteSend;
window.saveSite=function(){
 const wa=$('#st_wa').value.replace(/\D/g,''),on=$('#st_on').checked;
 db.settings.site={on,title:$('#st_title').value.trim(),desc:$('#st_desc').value.trim(),wa,base:$('#st_base').value.trim()};
 save();render();toast(on&&!wa?'تم الحفظ. أضف رقم واتساب لاستقبال الطلبات':'تم الحفظ')};

/* --- نسخة المدير: تفعيل الجهاز (جهاز واحد) --- */
const PKG=(()=>{try{const e=document.getElementById('orvex_pkg');return e?JSON.parse(e.textContent):null}catch(e){return null}})();
const actDev=()=>{let d=null;try{d=localStorage.getItem(KEY+'_dev');if(!d){d=(uid()+uid()).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);localStorage.setItem(KEY+'_dev',d)}}catch(e){}return d||'NODEVICE00'};
async function verifyPkgCode(code){if(!PKG||!PKG.sid||!code)return false;try{const r=await fn({action:'pkg_verify',shop_id:PKG.sid,device_code:actDev(),code:String(code).trim().toUpperCase()});return !!(r&&r.ok===true)}catch(e){return false}}
async function pkgGate(){if(!PKG||!PKG.sid)return;
 let saved='';try{saved=localStorage.getItem(KEY+'_act')||''}catch(e){}
 if(saved&&await verifyPkgCode(saved))return;
 try{const fl=await fn({action:'shop_flag',shop_id:PKG.sid});if(fl&&fl.any===true)return}catch(e){}
 const a=document.getElementById('auth');if(a)a.innerHTML=`<div class="auth-card"><h1>تفعيل الجهاز</h1><p class="muted">هذه النسخة تعمل على جهاز واحد فقط. أرسل رقم الجهاز التالي للمؤسس ليعطيك كود التفعيل.</p><label>رقم الجهاز</label><input readonly value="${actDev()}" onclick="this.select()"><label>كود التفعيل</label><input id="act_c" autocapitalize="characters"><div class="actions"><button class="btn primary" onclick="doAct()">تفعيل</button></div></div>`;try{rq('/rest/v1/device_requests?on_conflict=shop_id,device_code',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({shop_id:PKG.sid,device_code:actDev()})}).catch(()=>{})}catch(e){}}
window.doAct=async function(){const c=($('#act_c').value||'').trim().toUpperCase();if(!PKG||!c)return toast('أدخل كود التفعيل');if(!await verifyPkgCode(c))return toast('كود غير صحيح لهذا الجهاز');try{localStorage.setItem(KEY+'_act',c)}catch(e){}showAuth();toast('تم التفعيل')};
const _sa3=showAuth;showAuth=function(){_sa3();pkgGate()};
/* --- دخول بكلمة المرور فقط بعد أول تسجيل على الجهاز --- */
const RK='orvex_dev_acc',rkGet=()=>{try{return JSON.parse(localStorage.getItem(RK)||'[]')}catch(e){return[]}},b64=x=>btoa(String.fromCharCode(...new Uint8Array(x))),ub=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function rkDer(pw,salt){const m=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},m,256)}
async function rkSave(un,pw){if(!window.crypto||!crypto.subtle)return;const s=crypto.getRandomValues(new Uint8Array(16)),h=b64(await rkDer(pw,s)),l=rkGet().filter(x=>x.u!==un);l.push({u:un,s:b64(s),h});localStorage.setItem(RK,JSON.stringify(l))}
async function rkFind(pw){const r=[];for(const x of rkGet()){if(b64(await rkDer(pw,ub(x.s)))===x.h)r.push(x.u)}return r}
async function rkLogin(){const pw=$('#a_pass').value;if(!pw)return toast('أدخل كلمة المرور');try{const r=await rkFind(pw);if(!r.length)return toast('كلمة المرور لا تطابق أي حساب على هذا الجهاز. استخدم «دخول بحساب آخر»');if(r.length>1){toast('كلمة المرور مشتركة بين أكثر من حساب، أدخل اسم المستخدم');const m=$('#rk_more');if(m)m.click();return}$('#a_user').value=r[0];await window.sbLogin()}catch(e){console.error('[ORVEX saved login]',e);toast('تعذر التحقق من الحساب المحفوظ. استخدم «دخول بحساب آخر»')}}
function rkUI(){const l=rkGet(),u=$('#a_user'),p=$('#a_pass'),b=$('#a_btn');if(!l.length||!u||!p||!b)return;const lb=u.previousElementSibling;u.style.display='none';if(lb)lb.style.display='none';b.onclick=rkLogin;p.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();rkLogin()}};
 b.insertAdjacentHTML('afterend','<p style="text-align:center;margin:12px 0 0"><a href="#" class="muted" id="rk_more">دخول بحساب آخر / جهاز جديد</a></p>');
 $('#rk_more').onclick=e=>{e.preventDefault();u.style.display='';if(lb)lb.style.display='';b.onclick=()=>window.sbLogin();p.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();window.sbLogin()}};e.target.remove();u.focus()};b.addEventListener('click',function(ev){if(b.disabled)return;const hasUser=u.style.display!=='none'&&u.value.trim();if(!hasUser)return;ev.preventDefault();ev.stopImmediatePropagation();window.sbLogin()},true)}
const _sbl=window.sbLogin;window.sbLogin=async function(){const un=$('#a_user').value.trim().toLowerCase(),pw=$('#a_pass').value;await _sbl();if(SB.sess&&un&&pw)rkSave(un,pw).catch(()=>{})};
const _sa4=showAuth;showAuth=function(){_sa4();rkUI()};

/* --- مساعدو المصمم: حسابات بكل صلاحيات المصمم --- */
const isMainF=()=>!!(SB.me&&SB.me.designer&&!(SB.me.perms&&SB.me.perms._assist));
const _vs=vStudio;vStudio=function(){const h=_vs();if(typeof h==='string'&&h.includes('id="shopList"')){setTimeout(loadAssts,90);return h.replace('<button class="fab"','<div class="card" id="asstBox"></div><button class="fab"')}return h};
async function loadAssts(){const b=$('#asstBox');if(!b||!founderOK())return;try{const P=(await rq('/rest/v1/profiles?role=eq.founder&select=*&order=created_at')).filter(p=>p.perms&&p.perms._assist);
 b.innerHTML='<h3>مساعدو المصمم</h3><p class="muted" style="margin-top:0;font-size:13px">حساب يملك كل صلاحيات المصمم: المحلات والمميزات والترخيص والأجهزة.</p>'+(P.length?P.map(p=>`<div class="row"><div class="grow"><div class="t">${esc(p.full_name)}</div><small>@${esc(p.username)}</small></div>${isMainF()?`<button class="btn" onclick="asstPw('${jsq(p.id)}')">كلمة المرور</button><button class="btn danger" onclick="asstDel('${jsq(p.id)}')">حذف</button>`:''}</div>`).join(''):'<p class="muted">لا يوجد مساعد بعد.</p>')+(isMainF()?'<div class="actions"><button class="btn primary" onclick="asstForm()">+ إضافة مساعد</button></div>':'')}catch(e){b.innerHTML='<h3>مساعدو المصمم</h3><p class="muted">'+esc(e.message)+'</p>'}}
window.asstForm=function(){modal('مساعد جديد',`<label>اسم المساعد</label><input id="as_n"><div class="f2"><div><label>اسم المستخدم</label><input id="as_u" autocapitalize="off"></div><div><label>كلمة المرور (6+)</label><input id="as_p" type="password" autocomplete="new-password"></div></div><p class="muted" style="font-size:13px">سيحصل على كل صلاحيات المصمم.</p><div class="actions"><button class="btn primary" onclick="asstSave()">إنشاء</button></div>`)};
window.asstSave=async function(){const n=($('#as_n').value||'').trim(),u=($('#as_u').value||'').trim().toLowerCase(),p=$('#as_p').value;if(!n||!u)return toast('أدخل الاسم واسم المستخدم');if(p.length<6)return toast('كلمة المرور 6 أحرف على الأقل');
 try{await fn({action:'create_user',role:'assistant',full_name:n,username:u,password:p});closeModal();toast('تم إنشاء حساب المساعد');loadAssts()}catch(e){toast(e.message)}};
window.asstPw=function(id){modal('كلمة مرور المساعد',`<label>كلمة مرور جديدة (6+)</label><input id="as_np" type="password" autocomplete="new-password"><div class="actions"><button class="btn primary" onclick="asstPwSave('${jsq(id)}')">حفظ</button></div>`)};
window.asstPwSave=async function(id){const p=$('#as_np').value;if(p.length<6)return toast('كلمة المرور 6 أحرف على الأقل');try{await fn({action:'reset_password',profile_id:id,password:p});closeModal();toast('تم تغيير كلمة المرور')}catch(e){toast(e.message)}};
window.asstDel=function(id){askConfirm('حذف حساب المساعد نهائيًا؟',async()=>{try{await fn({action:'delete_user',profile_id:id});toast('تم حذف المساعد');loadAssts()}catch(e){toast(e.message)}},'حذف')};

/* --- المساعد الذكي (Claude عبر دالة orvex-ai على الخادم) --- */
const _ab=window.askBot,_bm=window.botModal;
const GUIDE=[
'دليل ORVEX للمساعد الذكي — يُرسل مع كل سؤال حتى يجيب وفق خصائص النسخة الحالية.',
'المتاجر والحسابات: يدعم البرنامج تعدد المحلات؛ بيانات كل محل مستقلة، والأجهزة التابعة للمحل نفسه تتشارك بياناته وفق إعدادات الربط والصلاحيات. لا تفترض أن بيانات محل تظهر في محل آخر.',
'المبيعات: تسجيل المبيعات والفواتير ومراجعة سجل الفواتير. تعديل فاتورة البيع للمدير فقط من داخل الفاتورة ← تعديل الفاتورة. المرتجع من داخل الفاتورة ← مرتجع.',
'نقطة البيع والباركود: يمكن استخدام قارئ الباركود المتصل بالجهاز. لطباعة الباركود: المخزون ← طباعة الباركود. عند استخدام الكاميرا لمسح الباركود، امنح المتصفح إذن الكاميرا وتأكد من فتح الموقع عبر HTTPS أو بيئة تدعم الكاميرا.',
'المخزون: المنتجات والتصنيفات والحزم وحدود النواقص. الحزم من المخزون ← الحزم. تظهر تنبيهات المنتجات منخفضة المخزون بحسب الحدود المحددة للمنتج أو التصنيف أو الحد العام.',
'العمل دون إنترنت والمزامنة: قد تُحفظ بعض تغييرات العمل محلياً عند انقطاع الاتصال ثم تُزامن عند عودة الإنترنت بحسب نوع العملية وإعدادات النسخة. لا تنصح بمسح بيانات المتصفح أو حذف التطبيق قبل التأكد من اكتمال المزامنة وأخذ نسخة احتياطية.',
'تعارض المخزون: تحتوي النسخة على معالجة لحالات تعارض تحديث المخزون بين الأجهزة. إذا ظهر اختلاف، افحص الاتصال وسجل العمليات ثم أعد المزامنة؛ لا توصي بتعديل قاعدة البيانات يدوياً.',
'النسخ الاحتياطي: الإعدادات ← نسخ احتياطي. نزّل نسخة احتياطية قبل تحديث التطبيق أو تغيير الجهاز، وتحقق من نجاح التنزيل.',
'الصندوق: في نهاية الجلسة، أغلق الصندوق ثم اطبع التقرير. قد تسمح الإعدادات بإيقاف عرض الفاتورة بعد البيع مع بقاء الفاتورة في السجل.',
'الإعدادات: الألوان واللغة والعملة من الإعدادات ← إعدادات متقدمة. يحدد المدير أقصى نسبة خصم للكاشير من الإعدادات ← إعدادات متقدمة.',
'تنبيه النفاذ: عند توفر الميزة، يمكن استخدام رسالة ما بعد البيع وزر إبلاغ المدير عبر واتساب.',
'الاقتراحات: زر «شاركوا اقتراحاتكم» يتيح إرسال ملاحظات واقتراحات عن البرنامج. وصول الاقتراحات إلى صندوق المؤسس يتطلب إعداد قاعدة البيانات وترحيلات SQL اللازمة وتفعيل الصلاحيات.',
'حسابات وصلاحيات: لا تطلب من المستخدم مشاركة كلمة المرور أو مفاتيح Supabase أو رموز التفعيل في المحادثة. لا تفترض أن كل حساب يملك صلاحيات المدير أو المؤسس.',
'المساعدة والتحديثات: اعتمد على هذا الدليل والسياق المرسل مع السؤال. إذا كانت الميزة غير مذكورة أو لا يمكن التأكد من توفرها، قل ذلك بوضوح واطلب اسم الشاشة أو صورة لها بدلاً من اختراع خطوات.',
'سياسة المعرفة المستقبلية: هذا الدليل يُحدّث مع كل إصدار عند إضافة ميزة أو تغيير مسارها. لا يدّعي المساعد أنه يتعلم تلقائياً من التحديثات أو من محادثات المستخدمين.'
].join('\\n');
const aiOn=()=>!!(SB.sess&&SB.prof&&(SB.prof.role==='founder'||(db.features&&db.features.ai===true)));window.aiOn=aiOn;
function aiCtx(){if(!SB.shop||!SB.prof||SB.prof.role==='staff')return '';try{
 const t=ymd(new Date()),mo=t.slice(0,7),ok=db.sales.filter(s=>!s.void),day=ok.filter(s=>s.date===t),mon=ok.filter(s=>String(s.date).slice(0,7)===mo),L=[];
 L.push('اسم المحل: '+db.settings.name+' | العملة: '+(db.settings.currency||'')+' | تاريخ اليوم: '+t);
 L.push('مبيعات اليوم: '+day.length+' فاتورة، صافي '+sum(day,s=>s.net));
 L.push('مبيعات الشهر: '+mon.length+' فاتورة، صافي '+sum(mon,s=>s.net)+'، الربح الإجمالي '+(sum(mon,s=>s.net)-sum(mon,s=>s.cost)));
 L.push('مصروفات الشهر: '+sum(db.expenses.filter(e=>String(e.date).slice(0,7)===mo),e=>e.amount));
 L.push('مستحق من العملاء: '+sum(db.customers.filter(c=>c.balance>0),c=>c.balance)+' | مستحق للموردين: '+sum(db.suppliers.filter(c=>c.balance>0),c=>c.balance));
 L.push('عدد المنتجات: '+db.products.length);
 const low=db.products.filter(x=>x.stock<=x.min).slice(0,15).map(x=>x.name+' ('+x.stock+')');if(low.length)L.push('منتجات منخفضة أو نافدة: '+low.join('، '));
 const tp={};mon.forEach(s=>(s.items||[]).forEach(i=>{const o=tp[i.name]=tp[i.name]||{q:0,r:0};o.q+=i.qty;o.r+=i.qty*i.price}));
 const top=Object.entries(tp).sort((a,b)=>b[1].r-a[1].r).slice(0,8).map(([n,o])=>n+' ('+o.q+' قطعة، '+o.r+')');if(top.length)L.push('الأكثر مبيعاً هذا الشهر: '+top.join('، '));
 const debt=db.customers.filter(c=>c.balance>0).sort((a,b)=>b.balance-a.balance).slice(0,8).map(c=>c.name+' ('+c.balance+')');if(debt.length)L.push('أكبر ديون العملاء: '+debt.join('، '));
 return L.join('\n')}catch(e){return ''}}
window._botH=[];
window.botModal=function(){if(!aiOn())return _bm();window._botH=[];
 modal('المساعد الذكي',`<div id="bchat" style="max-height:300px;overflow:auto"><div class="bub b">مرحباً! أنا المساعد الذكي. اسألني عن مبيعاتك ومخزونك أو عن أي ميزة في البرنامج.</div></div>${aiCtx()?'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+['ملخص مبيعات اليوم','ما الذي قارب على النفاد؟','من عليه أكبر دين؟'].map(q=>`<button class="btn" style="flex:none;min-width:0" onclick="botQuick(this)">${q}</button>`).join('')+'</div>':''}<div style="display:flex;gap:8px;margin-top:8px"><input id="bq" placeholder="اكتب سؤالك" onkeydown="if(event.key==='Enter')askBot()"><button class="btn primary" id="bsend" onclick="askBot()">إرسال</button></div>`)};
window.botQuick=function(b){$('#bq').value=b.textContent;window.askBot()};
const bfmt=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
window.askBot=async function(){if(!aiOn())return _ab();const i=$('#bq'),q=i.value.trim();if(!q)return;const o=$('#bchat'),btn=$('#bsend');i.value='';
 o.insertAdjacentHTML('beforeend',`<div class="bub u">${esc(q)}</div>`);const w=document.createElement('div');w.className='bub b';w.textContent='جارٍ التفكير…';o.appendChild(w);o.scrollTop=o.scrollHeight;if(btn)btn.disabled=true;
 window._botH.push({role:'user',content:q});
 try{const r=await rq('/functions/v1/orvex-ai',{method:'POST',body:JSON.stringify({messages:window._botH,context:aiCtx(),guide:GUIDE})});w.innerHTML=bfmt(r.reply);window._botH.push({role:'assistant',content:r.reply})}
 catch(e){window._botH.pop();w.textContent=e.message||'تعذّر الاتصال بالمساعد'}
 if(btn)btn.disabled=false;o.scrollTop=o.scrollHeight};

})();

/* --- قائمة النواقص في الرئيسية --- */
window.lowSet=function(v){db.settings.lowLim=Math.max(0,num(v));save();render()};
window.lowCatSet=function(e){const s=db.settings,c=e.dataset.c,v=num(e.value);s.lowCat=s.lowCat||{};if(e.value===''||v<=0)delete s.lowCat[c];else s.lowCat[c]=v;save();render()};
window.lowAllT=function(){state.lowAll=!state.lowAll;render()};
const lowLimOf=p=>{const s=db.settings,lc=s.lowCat||{},c=p.cat||'عام';return lc[c]>0?lc[c]:num(s.lowLim)>0?num(s.lowLim):p.min};
function lowCard(){if(!(isAdmin()||can('stock_view')))return '';const s=db.settings,lim=num(s.lowLim),lc=s.lowCat||{},L=db.products.filter(p=>p.stock<=lowLimOf(p)).sort((a,b)=>a.stock-b.stock),all=state.lowAll,sh=all?L:L.slice(0,8),ad=isAdmin(),cs=[...new Set(db.products.map(p=>p.cat||'عام'))];
 return `<div class="od-c od-low"><h3>⚠️ النواقص (${L.length})</h3>${ad?`<div><label>حد التنبيه العام (فارغ = حد كل منتج)</label><input type="number" min="0" inputmode="decimal" value="${lim||''}" placeholder="مثال: 10" onchange="lowSet(this.value)"></div><details style="margin:8px 0"><summary>حد خاص لكل تصنيف</summary>${cs.map(c=>`<div class="row"><span class="grow">${esc(c)}</span><input type="number" min="0" inputmode="decimal" style="width:90px" data-c="${esc(c)}" value="${lc[c]||''}" placeholder="${lim||'—'}" onchange="lowCatSet(this)"></div>`).join('')}<small class="muted">يُقدَّم حد التصنيف على الحد العام.</small></details>`:''}${L.length?sh.map(p=>`<div class="row${ad?' tap':''}" ${ad?`onclick="productForm('${jsq(p.id)}')"`:''}><div class="grow"><div class="t">${esc(p.name)}</div><small>${esc(p.cat||'عام')} · الحد ${lowLimOf(p)}</small></div><span class="badge ${p.stock<=0?'bad':'warn'}">${p.stock<=0?'نافد':'المتبقي '+p.stock}</span></div>`).join(''):'<div class="muted" style="padding:8px">لا توجد نواقص ✅</div>'}${L.length>8?`<button class="btn" onclick="lowAllT()">${all?'عرض أقل':'عرض الكل ('+L.length+')'}</button>`:''}</div>`}
const _vhm=vHome;vHome=function(){const h=_vhm();try{const c=lowCard();if(!c)return h;const i=h.lastIndexOf('</section>');return(h.includes('od-main')&&i>-1)?h.slice(0,i)+c+h.slice(i):h+'<div style="margin:12px 0">'+c+'</div>'}catch(e){return h}};
/* --- إيقاف عرض الفاتورة بعد البيع --- */
const noInv=()=>{const u=curUser(),s=db.settings;return !!u&&!!(u.admin?s.noInvAdmin:s.noInvCash)};
window.noInvModal=function(){const s=db.settings;modal('عرض الفاتورة بعد البيع',`<label class="pchk"><input type="checkbox" id="ni_a" ${s.noInvAdmin?'checked':''}> إيقاف عرض الفاتورة في جهاز المدير</label><label class="pchk"><input type="checkbox" id="ni_c" ${s.noInvCash?'checked':''}> إيقاف عرض الفاتورة في أجهزة الكاشير</label><p class="muted" style="font-size:12.5px">تُحفظ الفاتورة وتبقى في سجل الفواتير، لكن لا تظهر بعد إتمام البيع. يظهر الباقي للزبون في إشعار.</p><div class="actions"><button class="btn primary" onclick="noInvSave()">حفظ</button></div>`)};
window.noInvSave=function(){const s=db.settings;s.noInvAdmin=$('#ni_a').checked;s.noInvCash=$('#ni_c').checked;save();closeModal();toast('تم الحفظ')};
/* --- إدارة التصنيفات --- */
window.catModal=function(){if(!isAdmin())return toast('للمدير فقط');const m={};db.products.forEach(p=>{const c=p.cat||'عام';m[c]=(m[c]||0)+1});const cs=Object.keys(m);
 modal('إدارة التصنيفات',`<p class="muted" style="font-size:12.5px">غيّر اسم أي تصنيف. إذا كتبت اسم تصنيف موجود يُدمج التصنيفان.</p>${cs.length?cs.map(c=>`<div class="row"><input data-o="${esc(c)}" value="${esc(c)}" style="flex:1"><small class="muted" style="min-width:60px;text-align:center">${m[c]} منتج</small></div>`).join(''):'<div class="muted">لا توجد تصنيفات بعد</div>'}<div class="actions"><button class="btn primary" onclick="catSave()">حفظ</button></div>`)};
window.catSave=function(){const mp={};document.querySelectorAll('input[data-o]').forEach(i=>{const o=i.dataset.o,n=i.value.trim();if(n&&n!==o)mp[o]=n});const ks=Object.keys(mp);if(!ks.length){closeModal();return}
 db.products.forEach(p=>{const c=p.cat||'عام';if(mp[c])p.cat=mp[c]});
 const lc=db.settings.lowCat;if(lc)ks.forEach(o=>{if(lc[o]!=null){if(lc[mp[o]]==null)lc[mp[o]]=lc[o];delete lc[o]}});
 save();closeModal();toast('تم تعديل '+ks.length+' تصنيف');render()};
/* --- تسمية خانات القائمة --- */
const NAVLBL=['الرئيسية','نقطة مبيع','فاتورة المبيعات','فاتورة مشتريات','مرتجع مبيعات','سند صرف (مصروفات)','كشف حساب عميل','جرد المستودعات','التقارير والأرباح','إغلاق الصندوق','تقارير الإغلاق','المستخدمون','الموقع الإلكتروني','الإعدادات','النسخ الاحتياطي','خروج'];
const navNm=l=>(db.settings.navNames&&db.settings.navNames[l])||l;
window.navNamesModal=function(){if(!isAdmin())return;const nn=db.settings.navNames||{};modal('تسمية الخانات',`<p class="muted" style="font-size:12.5px">اكتب الاسم الجديد لأي خانة في القائمة، واتركه فارغاً للاسم الأصلي.</p>${NAVLBL.map(l=>`<div><label>${esc(l)}</label><input class="nn" data-l="${esc(l)}" maxlength="30" value="${esc(nn[l]||'')}" placeholder="${esc(l)}"></div>`).join('')}<div class="actions"><button class="btn primary" onclick="navNamesSave()">حفظ</button><button class="btn" onclick="navNamesReset()">الأسماء الأصلية</button></div>`)};
window.navNamesSave=function(){const o={};document.querySelectorAll('.nn').forEach(e=>{const v=e.value.trim().slice(0,30);if(v&&v!==e.dataset.l)o[e.dataset.l]=v});db.settings.navNames=o;save();closeModal();render();toast('تم حفظ الأسماء')};
window.navNamesReset=function(){delete db.settings.navNames;save();closeModal();render();toast('عادت الأسماء الأصلية')};
/* --- ترتيب بطاقات الرئيسية بالسحب والإفلات --- */
(function(){
const st=document.createElement('style');
st.textContent=`
.ox-bar{grid-column:1/-1;display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;min-height:34px}
.ox-bar .ox-hint{margin-inline-end:auto;color:var(--mu);font-size:12.5px}
.ox-bar button{border:1px solid var(--ln);background:#08170f;color:var(--tx);padding:6px 14px;border-radius:99px;font-size:13px;display:inline-flex;align-items:center;gap:6px}
.ox-bar button.on{background:linear-gradient(160deg,#1fd35a,#0f8f3a);color:#03130a;border-color:#2cf06a;font-weight:700}
.ox-on .od-c{position:relative;cursor:grab;user-select:none;-webkit-user-select:none;outline:2px dashed var(--g);outline-offset:-3px}
.ox-on .od-c *{pointer-events:none}
.ox-on .od-c .ox-grip{pointer-events:auto}
.ox-grip{position:absolute;top:6px;inset-inline-end:6px;z-index:3;width:34px;height:34px;border-radius:10px;background:rgba(39,224,96,.22);color:var(--g);display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none}
.ox-ph{opacity:.3}
.od-low{grid-column:span 12}
.ox-on .od-low{max-height:230px;overflow:hidden}
.ox-ghost{position:fixed!important;z-index:10000;margin:0!important;pointer-events:none!important;box-shadow:0 18px 40px rgba(0,0,0,.55);transform:scale(1.02);opacity:.96;cursor:grabbing;outline:2px solid var(--g)!important}
`;
document.head.appendChild(st);
const GRIP='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>';
const isCard=e=>e&&e.classList&&e.classList.contains('od-c');
function keyOf(el,c){const l=el.classList;if(l.contains('od-k'))return 'k'+(c.k++);if(l.contains('od-mini'))return 'm'+(c.m++);for(const n of ['don','chart','qa','recent','low'])if(l.contains('od-'+n))return n;return 'x'+(c.x++)}
function drag(e,card,main){
  if(e.button>0)return;
  const grip=e.target.closest&&e.target.closest('.ox-grip');
  if(e.pointerType!=='mouse'&&!grip)return;
  e.preventDefault();
  try{e.target.releasePointerCapture(e.pointerId)}catch(_){}
  const id=e.pointerId,r0=card.getBoundingClientRect(),ox=e.clientX-r0.left,oy=e.clientY-r0.top;
  const rtl=getComputedStyle(main).direction==='rtl',host=main.closest('.odash')||document.body;
  const g=card.cloneNode(true);g.querySelectorAll('.ox-grip').forEach(x=>x.remove());g.classList.add('ox-ghost');
  g.style.width=r0.width+'px';g.style.height=r0.height+'px';g.style.left=r0.left+'px';g.style.top=r0.top+'px';
  host.appendChild(g);card.classList.add('ox-ph');
  let px=e.clientX,py=e.clientY,raf=0,last=0;
  const hit=()=>{
    const now=Date.now();if(now-last<110)return;
    const t=[...main.children].filter(c=>isCard(c)&&c!==card).find(c=>{const r=c.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom});
    if(!t)return;
    const a=card.getBoundingClientRect(),b=t.getBoundingClientRect(),same=Math.abs(a.top-b.top)<6;
    const acx=a.left+a.width/2,cx=b.left+b.width/2,cy=b.top+b.height/2;
    const phFirst=same?(rtl?acx>cx:acx<cx):a.top<b.top;
    if(phFirst){if(same?(rtl?px<cx:px>cx):py>cy){t.after(card);last=now}}
    else if(same?(rtl?px>cx:px<cx):py<cy){t.before(card);last=now}
  };
  const loop=()=>{
    const m=70;let dy=0;
    if(py<m)dy=-Math.ceil((m-py)/5);else if(py>innerHeight-m)dy=Math.ceil((py-(innerHeight-m))/5);
    if(dy)window.scrollBy(0,dy);
    g.style.left=(px-ox)+'px';g.style.top=(py-oy)+'px';hit();raf=requestAnimationFrame(loop)};
  const mv=ev=>{if(ev.pointerId!==id)return;px=ev.clientX;py=ev.clientY;ev.preventDefault()};
  const end=ev=>{
    if(ev.pointerId!==id)return;
    cancelAnimationFrame(raf);
    document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);
    g.remove();card.classList.remove('ox-ph');
    db.settings.homeOrder=[...main.children].filter(isCard).map(c=>c.dataset.oxk);
    save();render()};
  document.addEventListener('pointermove',mv,{passive:false});document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  raf=requestAnimationFrame(loop);
}
function enhance(){
  const main=document.querySelector('#main .od-main');
  if(!main||state.view!=='home')return;
  const cards=[...main.children].filter(isCard),ctr={k:0,m:0,x:0},by={};
  cards.forEach(c=>{c.dataset.oxk=keyOf(c,ctr);by[c.dataset.oxk]=c});
  const saved=Array.isArray(db.settings.homeOrder)?db.settings.homeOrder:[],ord=[];
  saved.forEach(k=>{if(by[k]&&!ord.includes(k))ord.push(k)});
  cards.forEach(c=>{if(!ord.includes(c.dataset.oxk))ord.push(c.dataset.oxk)});
  ord.forEach(k=>main.appendChild(by[k]));
  const en=db.settings.lang==='en',edit=!!state.homeEdit,bar=document.createElement('div');bar.className='ox-bar';
  bar.innerHTML=`<span class="ox-hint">${edit?(en?'Drag a card to move it':'اسحب أي بطاقة لتغيير مكانها'):''}</span>${edit&&Array.isArray(db.settings.homeOrder)?`<button type="button" data-a="reset">${en?'Reset order':'إعادة الترتيب الأصلي'}</button>`:''}<button type="button" data-a="toggle" class="${edit?'on':''}">${edit?(en?'✓ Done':'✓ تم'):(en?'⇅ Arrange cards':'⇅ ترتيب البطاقات')}</button>`;
  bar.addEventListener('click',e=>{const a=e.target.closest('button');if(!a)return;
    if(a.dataset.a==='toggle'){state.homeEdit=!state.homeEdit;render()}
    else if(a.dataset.a==='reset'){delete db.settings.homeOrder;save();render()}});
  main.insertBefore(bar,main.firstChild);
  if(!edit)return;
  main.classList.add('ox-on');
  cards.forEach(c=>{const gp=document.createElement('span');gp.className='ox-grip';gp.innerHTML=GRIP;c.appendChild(gp)});
  main.addEventListener('click',e=>{if(e.target.closest('.od-c')){e.preventDefault();e.stopPropagation()}},true);
  main.addEventListener('pointerdown',e=>{const c=e.target.closest&&e.target.closest('.od-c');if(c&&c.parentNode===main)drag(e,c,main)});
}
const _r2=render;render=function(){_r2.apply(this,arguments);try{enhance()}catch(e){console.error(e)}};
})();
async function boot(){try{await initData()}catch(e){console.error(e)}showAuth();try{const saved=JSON.parse(sessionStorage.getItem(ORVEX_TAB_SESSION)||'null');if(saved&&saved.username&&saved.rt){const u=document.getElementById('a_user');if(u)u.value=saved.username;const b=document.getElementById('a_btn');if(b)b.textContent='جارٍ استعادة الجلسة...';await window.sbLogin()}}catch(e){console.warn('[ORVEX session restore]',e)}}
const VIEWS={home:vHome,pos:()=>'',stock:vStock,parties:vParties,more:vMore,invoices:vInvoices,purchases:vPurchases,expenses:vExpenses,reports:vReports,settings:vSettings,returns:vReturns,users:vUsers,studio:vStudio,closings:vClosings,site:()=>window.vSite()};
/* حراسة على مستوى الدوال: تُرفض الاستدعاءات من أي حساب غير المؤسس */
['newShopForm','makeShop','shopMenu','saveShopF','delShop','openShop','closeShop','devReqDel','makeDevCodeS','mgrDevices','devOk','devDel','asstForm','asstSave','asstPw','asstPwSave','asstDel','shopForm','saveShop','enterAsManager','downloadPkg','updateCodeModal','makeUpdateCode','makeDevCode'].forEach(n=>{
 const f=window[n];if(typeof f!=='function'||f.__founderOnly)return;
 const g=function(){if(!window.orvexRole.ok()){toast('هذه الوظيفة للمؤسس فقط');return}return f.apply(this,arguments)};g.__founderOnly=true;window[n]=g});
boot();
