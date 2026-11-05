/* ORVEX — المرحلة 5 / بند 17: التقارير المجدولة (schedrep.js). للمدير فقط. مجموعتان تتزامنان عبر records: repScheds (الجداول) وrepRuns (سجل التشغيل).
   كيف يعمل (مهم): التطبيق يعمل في المتصفح بلا خادم بريد، فلا يوجد إرسال تلقائي والتطبيق مغلق.
   - عند فتح التطبيق (وكل 5 دقائق وعند العودة للتبويب) يفحص المدير الجداول، وأحدث موعد استحقاق فات لكل جدول يُنتَج له تقرير جاهز
     (لقطة نصية ثابتة لا تتغير لاحقًا) بمعرّف حتمي run-<جدول>-<تاريخ الاستحقاق> فلا يتكرر على أي جهاز.
   - الإرسال: زر «إرسال» يفتح تطبيق البريد/المشاركة بالنص والمستلمين، ثم يسأل المدير هل أُرسل: «نعم» ← مُرسل، «لا» ← فاشل ويبقى للإعادة.
     كل محاولة تُسجَّل (الوقت، المستخدم، النتيجة). فشل الإنتاج (خطأ أو مستلم غير صالح) يُسجَّل بحالة فاشل مع السبب وزر إعادة.
   - لا تُنتَج تقارير لمواعيد سبقت إنشاء الجدول، ولا تُراكَم مواعيد فائتة (يُنتَج الأحدث فقط).
   - الإرسال التلقائي الفعلي يتطلب مكوّنًا خادميًا (دالة Edge + مزوّد بريد) لم يُنفَّذ هنا. */
(function(root){
'use strict';
const ISO=/^\d{4}-\d{2}-\d{2}$/,MAIL=/^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;
const S=()=>db.repScheds||(db.repScheds=[]),R=()=>db.repRuns||(db.repRuns=[]);
const L=(a,r,d,ba)=>{try{if(root.orvexLog)root.orvexLog(a,r,d,ba)}catch(e){}};
const by=()=>(curUser()||{}).name||'';
const FREQ={daily:'يومي',weekly:'أسبوعي',monthly:'شهري'};
const TYPES={sales:'المبيعات',inventory:'المخزون',expenses:'المصروفات',profit:'الأرباح'};
const DOW=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const pad=n=>String(n).padStart(2,'0');
const dstr=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const addD=(s,n)=>{const [y,m,d]=s.split('-').map(Number),x=new Date(y,m-1,d+n);return dstr(x)};
const lastOfM=(y,m)=>new Date(y,m,0).getDate();

/* ===== الجداول ===== */
function parseTo(t){const L2=String(t||'').split(/[\s,;،]+/).map(x=>x.trim()).filter(Boolean),seen=new Set(),out=[];
  for(const x of L2){const k=x.toLowerCase();if(seen.has(k))continue;seen.add(k);if(!MAIL.test(x))return{err:'بريد غير صالح: '+x};out.push(x)}
  if(out.length>10)return{err:'الحد الأقصى 10 مستلمين'};return{list:out}}
function schedSave(id,v){
  if(!isAdmin())return{err:'للمدير فقط'};
  const name=String(v.name||'').trim(),freq=FREQ[v.freq]?v.freq:'';
  if(!name)return{err:'أدخل اسم الجدول'};if(!freq)return{err:'اختر التكرار'};
  const types=(v.types||[]).filter(t=>TYPES[t]);if(!types.length)return{err:'اختر تقريرًا واحدًا على الأقل'};
  const hour=Math.round(num(v.hour));if(!(hour>=0&&hour<=23)||v.hour==='')return{err:'ساعة غير صحيحة (0-23)'};
  const dow=Math.round(num(v.dow)),dom=Math.round(num(v.dom||1));
  if(freq==='weekly'&&!(dow>=0&&dow<=6))return{err:'يوم الأسبوع غير صحيح'};
  if(freq==='monthly'&&!(dom>=1&&dom<=28))return{err:'يوم الشهر بين 1 و28'};
  const to=parseTo(v.to);if(to.err)return to;
  const old=id?S().find(x=>x.id===id):null;if(id&&!old)return{err:'الجدول غير موجود'};
  if(S().some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase()))return{err:'اسم الجدول مستخدم'};
  const o={name,freq,types,hour,dow:freq==='weekly'?dow:0,dom:freq==='monthly'?dom:1,to:to.list,active:v.active!==false};
  if(old){const b={freq:old.freq,hour:old.hour,to:old.to.length,active:old.active};Object.assign(old,o);
    /* تغيير الموعد يعيد ضبط نقطة البداية كي لا يُنتَج تقرير لموعد فات قبل التعديل */
    old.from=new Date().toISOString();L('rep_sched_edit',name,FREQ[freq],{b,a:{freq,hour,to:o.to.length,active:o.active}});return{ok:old}}
  const s=Object.assign({id:uid(),from:new Date().toISOString(),by:by(),at:new Date().toISOString()},o);S().push(s);L('rep_sched_add',name,FREQ[freq]+' '+hour+':00');return{ok:s}}
function schedToggle(id){if(!isAdmin())return{err:'للمدير فقط'};const s=S().find(x=>x.id===id);if(!s)return{err:'الجدول غير موجود'};
  s.active=s.active===false;if(s.active)s.from=new Date().toISOString();L('rep_sched_toggle',s.name,s.active?'تفعيل':'إيقاف');return{ok:s}}
function schedDelete(id){if(!isAdmin())return{err:'للمدير فقط'};const i=S().findIndex(x=>x.id===id);if(i<0)return{err:'الجدول غير موجود'};
  const s=S()[i];if(R().some(r=>r.sid===id&&r.status==='ready'))return{err:'توجد تقارير جاهزة لم تُرسل: أرسلها أو أوقف الجدول'};
  S().splice(i,1);L('rep_sched_delete',s.name,'السجلات تبقى');return{ok:true}}

/* ===== الاستحقاق: آخر موعد فات (تاريخ + ساعة) ===== */
function lastDue(s,now){
  now=now||new Date();const t=dstr(now),hr=now.getHours();
  if(s.freq==='daily')return hr>=s.hour?t:addD(t,-1);
  if(s.freq==='weekly'){let d=t;for(let i=0;i<8;i++){const [y,m,dd]=d.split('-').map(Number);if(new Date(y,m-1,dd).getDay()===s.dow&&(d<t||hr>=s.hour))return d;d=addD(d,-1)}return t}
  const [y,m]=t.split('-').map(Number);let yy=y,mm=m;
  const day=(Y,M)=>Math.min(s.dom,lastOfM(Y,M));
  let d=yy+'-'+pad(mm)+'-'+pad(day(yy,mm));
  if(d>t||(d===t&&hr<s.hour)){mm--;if(mm===0){mm=12;yy--}d=yy+'-'+pad(mm)+'-'+pad(day(yy,mm))}
  return d}
/* فترة التقرير لموعد استحقاق: يومي = أمس، أسبوعي = آخر 7 أيام قبل الموعد، شهري = الشهر التقويمي السابق */
function period(s,due){
  if(s.freq==='daily'){const d=addD(due,-1);return{from:d,to:d,label:d}}
  if(s.freq==='weekly'){const to=addD(due,-1),from=addD(due,-7);return{from,to,label:from+' ← '+to}}
  const [y,m]=due.split('-').map(Number),py=m===1?y-1:y,pm=m===1?12:m-1;
  return{from:py+'-'+pad(pm)+'-01',to:py+'-'+pad(pm)+'-'+pad(lastOfM(py,pm)),label:py+'-'+pad(pm),month:py+'-'+pad(pm)}}

/* ===== محتوى التقارير (لقطة نصية) ===== */
const inR=(d,p)=>{d=String(d||'').slice(0,10);return d>=p.from&&d<=p.to};
const sm=(a,f)=>r2(a.reduce((s,x)=>s+num(f(x)),0));
const cur=()=>(db.settings||{}).currency||'';
function bSales(p){const S_=(db.sales||[]).filter(s=>!s.void&&inR(s.date,p)),R_=(db.returns||[]).filter(r=>inR(r.date,p)),sales=sm(S_,s=>s.net),ret=sm(R_,r=>r.net),by={};
  S_.forEach(s=>(s.items||[]).forEach(i=>{const k=i.name||i.pid;by[k]=r2((by[k]||0)+num(i.price)*num(i.qty))}));
  const top=Object.keys(by).sort((a,b)=>by[b]-by[a]).slice(0,5),meth={};S_.forEach(s=>{const k=s.method||'—';meth[k]=r2((meth[k]||0)+num(s.net))});
  return['تقرير المبيعات ('+p.label+')','عدد الفواتير: '+S_.length,'المبيعات: '+sales+' '+cur(),'المرتجعات: '+ret,'الصافي: '+r2(sales-ret),'متوسط الفاتورة: '+(S_.length?r2(sales/S_.length):0),
    ...Object.keys(meth).map(k=>'طريقة '+k+': '+meth[k]),...(top.length?['الأكثر مبيعًا:']:[]),...top.map((k,i)=>(i+1)+'. '+k+' — '+by[k])]}
function bInv(p){const P=db.products||[],val=sm(P,x=>num(x.stock)*num(x.cost));let low=[],exp=[];
  try{const I3=root.ORVEX_INV3;if(I3&&I3.lowList)low=I3.lowList()}catch(e){}try{const I2=root.ORVEX_INV2;if(I2&&I2.expiring)exp=I2.expiring()}catch(e){}
  return['تقرير المخزون (حتى '+p.to+')','عدد المواد: '+P.length,'قيمة المخزون بالتكلفة: '+val+' '+cur(),'نفد: '+low.filter(x=>x.st==='out').length+' | منخفض: '+low.filter(x=>x.st==='low').length,
    ...low.slice(0,10).map(x=>'• '+x.p.name+' ('+x.q+')'),'قريب الانتهاء/منتهٍ: '+exp.length,...exp.slice(0,10).map(x=>'• '+x.p.name+' — دفعة '+x.b.no+' — '+(x.d<0?'منتهية':'بعد '+x.d+' يوم'))]}
function bExp(p){const X=(db.expenses||[]).filter(e=>inR(e.date,p)),by={};X.forEach(e=>{const k=e.cat||'أخرى';by[k]=r2((by[k]||0)+num(e.amount))});
  return['تقرير المصروفات ('+p.label+')','الإجمالي: '+sm(X,e=>e.amount)+' '+cur()+' ('+X.length+' بند)',...Object.keys(by).sort((a,b)=>by[b]-by[a]).map(k=>k+': '+by[k])]}
function bProfit(p){
  if(p.month&&root.ORVEX_PNL){const x=root.ORVEX_PNL.pnl(p.month);return['تقرير الأرباح ('+p.label+')','صافي المبيعات: '+x.net,'مجمل الربح: '+x.gross,'المصروفات: '+r2(x.other),'الرواتب: '+x.pay,'الإهلاك: '+x.dep,'صافي الربح: '+x.profit+' ('+x.margin+'%)']}
  const S_=(db.sales||[]).filter(s=>!s.void&&inR(s.date,p)),R_=(db.returns||[]).filter(r=>inR(r.date,p)),X=(db.expenses||[]).filter(e=>inR(e.date,p)),
    net=r2(sm(S_,s=>s.net)-sm(R_,r=>r.net)),cogs=r2(sm(S_,s=>s.cost)-sm(R_,r=>r.cost)),ex=sm(X,e=>e.amount);
  return['تقرير الأرباح ('+p.label+') — قبل الإهلاك','صافي المبيعات: '+net,'تكلفة البضاعة: '+cogs,'مجمل الربح: '+r2(net-cogs),'المصروفات والرواتب: '+ex,'صافي الربح: '+r2(net-cogs-ex)]}
const B_={sales:bSales,inventory:bInv,expenses:bExp,profit:bProfit};
function build(s,p){return [(db.settings.name||'ORVEX')+' — '+s.name].concat(...s.types.map(t=>['',...B_[t](p)])).concat(['','(المبالغ قبل الضريبة)']).join('\n')}

/* ===== التشغيل ===== */
function runFor(s,now){
  const due=lastDue(s,now),id='run-'+s.id+'-'+due;if(R().some(r=>r.id===id))return null;
  if(s.from){const [y,m,d]=due.split('-').map(Number),dt=new Date(y,m-1,d,s.hour).toISOString();if(dt<s.from)return null}
  const p=period(s,due),r={id,sid:s.id,sname:s.name,due,period:p,to:s.to.slice(),status:'ready',attempts:[],at:new Date().toISOString(),by:by()};
  try{r.text=build(s,p);if(!s.to.length){r.status='failed';r.err='لا يوجد مستلمون في الجدول'}}
  catch(e){r.status='failed';r.err='تعذّر إنتاج التقرير: '+(e&&e.message||e);r.text=''}
  r.attempts.push({t:r.at,by:r.by,ok:r.status!=='failed',err:r.err||'',kind:'generate'});
  R().push(r);if(r.status==='failed')L('rep_run_fail',s.name,r.err);return r}
function tick(now){
  if(!isAdmin())return[];const made=[];S().forEach(s=>{if(s.active===false)return;const r=runFor(s,now);if(r)made.push(r)});
  if(R().length>400)R().splice(0,R().length-300);
  return made}
function sent(id,ok,err){
  if(!isAdmin())return{err:'للمدير فقط'};const r=R().find(x=>x.id===id);if(!r)return{err:'التقرير غير موجود'};
  if(r.status==='sent')return{err:'أُرسل مسبقًا'};if(!r.text)return{err:'لا يوجد نص: أعد الإنتاج'};
  r.attempts.push({t:new Date().toISOString(),by:by(),ok:!!ok,err:ok?'':(err||'لم يُؤكَّد الإرسال'),kind:'send'});
  if(ok){r.status='sent';r.err='';r.sentAt=new Date().toISOString();L('rep_sent',r.sname,r.period.label)}else{r.status='failed';r.err=err||'لم يُؤكَّد الإرسال';L('rep_run_fail',r.sname,r.err)}
  return{ok:r}}
function retry(id){
  if(!isAdmin())return{err:'للمدير فقط'};const r=R().find(x=>x.id===id);if(!r)return{err:'التقرير غير موجود'};if(r.status!=='failed')return{err:'ليس فاشلًا'};
  const s=S().find(x=>x.id===r.sid);if(!s)return{err:'الجدول محذوف'};
  r.to=s.to.slice();if(!r.to.length)return{err:'لا يوجد مستلمون في الجدول'};
  try{r.text=build(s,r.period)}catch(e){r.err='تعذّر إنتاج التقرير: '+(e&&e.message||e);r.attempts.push({t:new Date().toISOString(),by:by(),ok:false,err:r.err,kind:'generate'});return{err:r.err}}
  r.status='ready';r.err='';r.attempts.push({t:new Date().toISOString(),by:by(),ok:true,err:'',kind:'regenerate'});L('rep_retry',r.sname,r.period.label);return{ok:r}}
function pending(){return R().filter(r=>r.status==='ready'||r.status==='failed').length}
function mailUrl(r){const body=r.text.length>1500?r.text.slice(0,1500)+'\n… (التقرير الكامل داخل التطبيق)':r.text;
  return'mailto:'+r.to.map(encodeURIComponent).join(',')+'?subject='+encodeURIComponent(r.sname+' — '+r.period.label)+'&body='+encodeURIComponent(body)}

root.ORVEX_REP={schedSave,schedToggle,schedDelete,lastDue,period,build,tick,sent,retry,pending,parseTo,mailUrl,S,R,FREQ,TYPES};

/* ================= الواجهة ================= */
if(typeof document==='undefined'||!root.modal)return;
const val=id=>{const e=document.getElementById(id);return e?e.value:''};
const SF={id:'',types:{}};
const BD={ready:'جاهز',sent:'مُرسل',failed:'فاشل'};
root.repOpen=function(){
  if(!isAdmin())return toast('للمدير فقط');const n=tick().length;if(n){save();toast('أُنتج '+n+' تقرير جديد')}
  const rs=R().slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,30);
  modal('التقارير المجدولة',`<h3 style="margin:0 0 4px">الجداول</h3><div class="card">${S().length?S().map(s=>`<div class="row" onclick="repForm('${jsq(s.id)}')"><div class="grow"><div class="t">${esc(s.name)} ${s.active===false?'<span class="badge">موقوف</span>':''}</div><small>${esc(FREQ[s.freq])} ${s.freq==='weekly'?'— '+DOW[s.dow]:s.freq==='monthly'?'— يوم '+s.dom:''} الساعة ${s.hour}:00 — ${s.types.map(t=>TYPES[t]).join('، ')}</small></div><div class="end"><small>${s.to.length} مستلم</small></div></div>`).join(''):'<p class="muted">لا توجد جداول.</p>'}</div>
  <div class="actions"><button class="btn primary" onclick="repForm()">+ جدول</button></div>
  <h3 style="margin:12px 0 4px">التقارير المُنتَجة</h3><div class="card">${rs.length?rs.map(r=>`<div class="row" onclick="repRun('${jsq(r.id)}')"><div class="grow"><div class="t">${esc(r.sname)} <span class="badge ${r.status==='failed'?'bad':''}">${BD[r.status]}</span></div><small>${esc(r.period.label)}${r.err?' — '+esc(r.err):''}</small></div></div>`).join(''):'<p class="muted">لا توجد تقارير بعد.</p>'}</div>
  <p class="muted" style="font-size:12.5px">الإرسال يتم من هذا الجهاز عند فتح التطبيق (لا إرسال والتطبيق مغلق).</p><div class="actions"><button class="btn ghost" onclick="closeModal()">إغلاق</button></div>`)};
root.repForm=function(id){if(!isAdmin())return toast('للمدير فقط');
  const s=id?S().find(x=>x.id===id):{name:'',freq:'daily',types:['sales'],hour:20,dow:6,dom:1,to:[],active:true};if(!s)return;
  modal(id?'تعديل جدول':'جدول جديد',`<label>الاسم</label><input id="rs_n" value="${esc(s.name)}"><label>التكرار</label><select id="rs_f">${Object.keys(FREQ).map(k=>`<option value="${k}" ${k===s.freq?'selected':''}>${FREQ[k]}</option>`).join('')}</select>
  <div class="f2"><div><label>الساعة (0-23)</label><input id="rs_h" type="number" value="${s.hour}"></div><div><label>يوم الأسبوع (أسبوعي)</label><select id="rs_w">${DOW.map((d,i)=>`<option value="${i}" ${i===s.dow?'selected':''}>${d}</option>`).join('')}</select></div></div>
  <label>يوم الشهر 1-28 (شهري)</label><input id="rs_m" type="number" value="${s.dom}"><label>التقارير</label><div class="chips">${Object.keys(TYPES).map(k=>`<label class="pchk" style="border:0"><input type="checkbox" id="rs_t_${k}" ${s.types.includes(k)?'checked':''}> ${TYPES[k]}</label>`).join('')}</div>
  <label>المستلمون (بريد، مفصولة بفاصلة)</label><input id="rs_to" value="${esc(s.to.join(', '))}">
  <div class="actions"><button class="btn primary" onclick="repSave('${jsq(id||'')}')">حفظ</button>${id?`<button class="btn" onclick="repTog('${jsq(id)}')">${s.active===false?'تفعيل':'إيقاف'}</button><button class="btn danger" onclick="repDel('${jsq(id)}')">حذف</button>`:''}<button class="btn ghost" onclick="repOpen()">رجوع</button></div>`)};
root.repSave=function(id){const r=schedSave(id,{name:val('rs_n'),freq:val('rs_f'),hour:val('rs_h'),dow:val('rs_w'),dom:val('rs_m'),types:Object.keys(TYPES).filter(k=>{const e=document.getElementById('rs_t_'+k);return e&&e.checked}),to:val('rs_to'),active:(id&&(S().find(x=>x.id===id)||{}).active)!==false});
  if(r.err)return toast(r.err);save();toast('تم الحفظ');repOpen()};
root.repTog=function(id){const r=schedToggle(id);if(r.err)return toast(r.err);save();repOpen()};
root.repDel=function(id){askConfirm('حذف الجدول؟ يبقى سجل تقاريره.',()=>{const r=schedDelete(id);if(r.err)return toast(r.err);save();repOpen()})};
root.repRun=function(id){const r=R().find(x=>x.id===id);if(!r)return repOpen();
  modal(r.sname,`<p><span class="badge ${r.status==='failed'?'bad':''}">${BD[r.status]}</span> <small>${esc(r.period.label)} — إلى: ${esc(r.to.join('، ')||'—')}</small></p>${r.err?`<p class="muted" style="color:var(--danger,#c0392b)">${esc(r.err)}</p>`:''}
  <pre style="white-space:pre-wrap;font:inherit;max-height:40vh;overflow:auto" class="card">${esc(r.text||'')}</pre><h3 style="margin:10px 0 4px">المحاولات</h3><div class="card">${r.attempts.slice().reverse().map(a=>`<div class="row"><div class="grow"><small>${esc(new Date(a.t).toLocaleString('ar-SA-u-nu-latn'))} — ${esc(a.by||'')} — ${a.kind==='send'?'إرسال':a.kind==='regenerate'?'إعادة إنتاج':'إنتاج'} — ${a.ok?'✓':'✗ '+esc(a.err||'')}</small></div></div>`).join('')}</div>
  <div class="actions">${r.status==='ready'?`<button class="btn primary" onclick="repSend('${jsq(id)}')">إرسال</button>`:''}${r.status==='failed'?`<button class="btn primary" onclick="repRetry('${jsq(id)}')">إعادة المحاولة</button>`:''}<button class="btn ghost" onclick="repOpen()">رجوع</button></div>`)};
root.repRetry=function(id){const r=retry(id);if(r.err){save();toast(r.err);return repRun(id)}save();toast('أُعيد إنتاج التقرير');repRun(id)};
root.repSend=function(id){const r=R().find(x=>x.id===id);if(!r||r.status!=='ready')return;
  try{if(navigator.share&&!r.to.length){navigator.share({title:r.sname,text:r.text}).catch(()=>{})}else{const a=document.createElement('a');a.href=mailUrl(r);document.body.appendChild(a);a.click();a.remove()}}
  catch(e){const x=sent(id,false,'تعذّر فتح تطبيق البريد');save();toast(x.err||'تعذّر فتح تطبيق البريد');return repRun(id)}
  modal('تأكيد الإرسال',`<p>هل أرسلت التقرير فعلًا من تطبيق البريد؟</p><div class="actions"><button class="btn primary" onclick="repConfirm('${jsq(id)}',1)">نعم، أُرسل</button><button class="btn danger" onclick="repConfirm('${jsq(id)}',0)">لا، فشل</button></div>`)};
root.repConfirm=function(id,ok){const r=sent(id,!!ok,ok?'':'لم يُرسَل من تطبيق البريد');if(r.err)toast(r.err);save();repRun(id)};
try{document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isAdmin&&curUser()&&isAdmin()){const n=tick().length;if(n){save();toast('تقرير مجدول جاهز للإرسال')}}})}catch(e){}
setInterval(()=>{try{if(curUser()&&isAdmin()){const n=tick().length;if(n){save();toast('تقرير مجدول جاهز للإرسال')}}}catch(e){}},300000);
if(typeof vParties==='function'){const _vp=vParties;vParties=function(){const n=isAdmin()?pending():0;return _vp()+(isAdmin()?`<div class="actions"><button class="btn" onclick="repOpen()">📧 التقارير المجدولة${n?' ('+n+')':''}</button></div>`:'')}}
})(typeof window!=='undefined'?window:globalThis);
