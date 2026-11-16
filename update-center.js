/* ORVEX Update Center — founder-only release management. Publishing remains fail-closed until routing secrets are enabled. */
(function(){
'use strict';
if(window.__orvexUpdateCenterLoaded)return;window.__orvexUpdateCenterLoaded=true;
const api=(action,extra={})=>window.__orvexRequest('/functions/v1/orvex-release-center',{
 method:'POST',body:JSON.stringify({action,...extra})
});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const semver=s=>/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(s);
const status={draft:'مسودة',testing:'قيد الاختبار',approved:'معتمد',published:'منشور',paused:'متوقف',quarantined:'معزول',rolled_back:'تم التراجع عنه'};
let rows=[];let events=[];let distributionEnabled=false;
const eventNames={release_created:'إنشاء إصدار',targets_changed:'تعديل الجهات',artifact_registered:'تسجيل ملف الإصدار',testing_started:'بدء الاختبار',release_approved:'اعتماد الإصدار',release_published:'نشر الإصدار',release_ticket_issued:'إصدار تذكرة تحديث',proxy_asset_failure:'خطأ تحميل ملف',automatic_quarantine:'عزل تلقائي بسبب الأخطاء',quarantined:'عزل يدوي',paused:'إيقاف الإصدار',release_rolled_back:'تراجع إلى الإصدار السابق'};
function shell(){
 const old=document.getElementById('orvex-update-center');if(old)old.remove();
 const root=document.createElement('div');root.id='orvex-update-center';root.dir='rtl';
 root.innerHTML=`<div class="ouc-backdrop"><section class="ouc-panel" role="dialog" aria-modal="true" aria-label="مركز تحديثات ORVEX">
 <header><div><h2>مركز تحديثات ORVEX</h2><p>إدارة الإصدارات والاختبار وسجل العمليات</p></div><button class="ouc-close" type="button" aria-label="إغلاق">×</button></header>
 <div class="ouc-warning"><b>وضع الحماية مفعل</b><span>لا يظهر تحديث لأي جهة إلا بعد اعتماد الإصدار ثم الضغط على «نشر التحديث». التوزيع يبقى مغلقاً حتى تهيئة مفاتيح الأمان ومسار Vercel.</span></div>
 <form id="ouc-create" class="ouc-card"><h3>إنشاء إصدار جديد</h3><div class="ouc-fields"><label>رقم الإصدار<input name="version" placeholder="1.0.0" required></label><label>اسم التحديث<input name="title" maxlength="100" placeholder="إصلاحات وتحسينات" required></label></div><label>وصف التغييرات<textarea name="notes" rows="2" placeholder="ما الذي تغير في هذا الإصدار؟"></textarea></label><button class="ouc-primary">إنشاء مسودة</button></form>
 <div class="ouc-card"><div class="ouc-list-head"><h3>سجل الإصدارات</h3><button type="button" id="ouc-refresh">تحديث القائمة</button></div><div id="ouc-list">جارٍ التحميل…</div></div>
 <div class="ouc-card"><h3>سجل العمليات والتدقيق</h3><div id="ouc-events">جارٍ التحميل…</div></div>
 <footer>لا يتم تعديل بيانات المحلات أو جداول المبيعات والمحاسبة من مركز التحديثات.</footer>
 </section></div>`;
 document.body.appendChild(root);
 root.querySelector('.ouc-close').onclick=()=>root.remove();
 root.querySelector('.ouc-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)root.remove()});
 root.querySelector('#ouc-refresh').onclick=load;
 root.querySelector('#ouc-create').onsubmit=create;
 load();
}
function renderEvents(){
 const box=document.getElementById('ouc-events');if(!box)return;
 if(!events.length){box.innerHTML='<p class="ouc-muted">لا توجد عمليات مسجلة بعد.</p>';return}
 box.innerHTML=events.map(e=>{const r=rows.find(x=>x.id===e.release_id);const actor=e.actor_id?String(e.actor_id).slice(0,8):'النظام';return `<div class="ouc-event"><div><b>${esc(eventNames[e.event_type]||e.event_type)}</b><span>${esc(r?r.version:'—')}</span></div><small>${esc(new Date(e.created_at).toLocaleString('ar-IQ'))} · ${esc(actor)}</small></div>`}).join('');
}
function render(){
 const warning=document.querySelector('#orvex-update-center .ouc-warning');if(warning)warning.innerHTML=distributionEnabled?'<b>التوزيع الآمن جاهز</b><span>لن يظهر أي تحديث للمحلات أو المؤسس إلا بعد ضغط زر «نشر التحديث» واعتماد الإصدار والجهات المستهدفة.</span>':'<b>النشر مغلق حالياً</b><span>لن يظهر أي تحديث لأي جهة. زر النشر سيبقى معطلاً حتى اكتمال إعداد Vercel وSupabase واختبار خدمة المراقبة.</span>';
 const box=document.getElementById('ouc-list');if(!box)return;
 if(!rows.length){box.innerHTML='<p class="ouc-muted">لا توجد إصدارات مسجلة بعد.</p>';renderEvents();return}
 box.innerHTML=rows.map(r=>`<article class="ouc-release" data-id="${esc(r.id)}"><div class="ouc-release-top"><b>${esc(r.version)} — ${esc(r.title)}</b><span>${esc(status[r.status]||r.status)}</span></div><p>${esc(r.notes||'لا يوجد وصف')}</p><small>أُنشئ: ${esc(new Date(r.created_at).toLocaleString('ar-IQ'))}</small>
 <div class="ouc-actions">${r.status==='draft'?'<button data-action="start_testing">بدء الاختبار</button>':''}${r.status==='testing'?'<button data-action="approve">اعتماد الإصدار</button>':''}${r.status==='approved'?(distributionEnabled?'<button class="ouc-primary" data-action="publish">نشر التحديث</button>':'<button class="ouc-disabled" disabled title="يتطلب تهيئة التوزيع الآمن">النشر غير مفعّل</button>'):''}${r.status==='published'?'<button data-action="rollback" class="ouc-danger">إيقاف الإصدار والرجوع للسابق</button>':''}${!['quarantined','rolled_back'].includes(r.status)?'<button class="ouc-danger" data-action="quarantine">عزل إصدار معيب</button>':''}${!['published','quarantined','rolled_back'].includes(r.status)?'<button data-action="targets">تحديد الجهات</button>':''}${['draft','testing'].includes(r.status)?'<button data-action="artifact">تسجيل ملف الإصدار</button>':''}</div></article>`).join('');
 box.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.closest('[data-id]').dataset.id,b.dataset.action));
 renderEvents();
}
async function load(){
 const box=document.getElementById('ouc-list');if(!box)return;box.textContent='جارٍ التحميل…';
 try{const r=await api('list');rows=r.releases||[];events=r.events||[];let routing=false;try{const h=await fetch('/api/release-routing-health',{cache:'no-store'});routing=h.ok&&(await h.json()).enabled===true}catch(e){}distributionEnabled=r.distribution_enabled===true&&routing;render()}catch(e){box.textContent='تعذر تحميل الإصدارات: '+e.message}
}
async function create(e){
 e.preventDefault();const f=new FormData(e.currentTarget),version=String(f.get('version')).trim(),title=String(f.get('title')).trim();
 if(!semver(version))return alert('استخدم ترقيمًا مثل 1.0.0 أو 1.2.3');
 try{await api('create',{version,title,notes:String(f.get('notes')||'')});e.currentTarget.reset();await load()}catch(err){alert('تعذر إنشاء الإصدار: '+err.message)}
}
async function configureTargets(id){
 const data=await api('list_shops'); const shops=data.shops||[];
 const saved=(rows.find(r=>r.id===id)||{}).orvex_release_targets||[];
 const savedAll=saved.some(t=>t.target_type==='all'&&!t.excluded),savedFounder=saved.some(t=>t.target_type==='founder'&&!t.excluded);
 const modal=document.createElement('div'); modal.className='ouc-target-modal';
 modal.innerHTML=`<div class="ouc-target-box"><h3>تحديد الجهات المستهدفة</h3><p>يمكن نشر الإصدار لجميع المحلات وحساب المؤسس أو لمحلات محددة. يمكنك استثناء محلات من التوزيع العام.</p><label class="ouc-check"><input type="checkbox" id="ouc-all" ${savedAll?'checked':''}> جميع المحلات وحساب المؤسس</label><label class="ouc-check"><input type="checkbox" id="ouc-founder" ${savedFounder?'checked':''}> حساب المؤسس</label><div class="ouc-shop-list">${shops.map(x=>`<label class="ouc-check"><input type="checkbox" data-shop="${esc(x.id)}" ${saved.some(t=>t.target_type==='shop'&&String(t.target_id)===String(x.id))?'checked':''}> ${esc(x.name||x.id)} <small>${esc(x.id)}</small><select data-exclude="${esc(x.id)}"><option value="include" ${!saved.some(t=>t.target_type==='shop'&&String(t.target_id)===String(x.id)&&t.excluded)?'selected':''}>تضمين</option><option value="exclude" ${saved.some(t=>t.target_type==='shop'&&String(t.target_id)===String(x.id)&&t.excluded)?'selected':''}>استثناء</option></select></label>`).join('')}</div><div class="ouc-target-actions"><button type="button" id="ouc-target-cancel">إلغاء</button><button type="button" class="ouc-primary" id="ouc-target-save">حفظ الجهات</button></div></div>`;
 document.body.appendChild(modal); modal.querySelector('#ouc-target-cancel').onclick=()=>modal.remove();
 modal.querySelector('#ouc-target-save').onclick=async()=>{
  const all=modal.querySelector('#ouc-all').checked, founder=modal.querySelector('#ouc-founder').checked;
  const targets=[]; if(all)targets.push({target_type:'all'}); if(founder)targets.push({target_type:'founder',target_id:'self'});
  modal.querySelectorAll('[data-shop]:checked').forEach(el=>{const sid=el.dataset.shop;const excluded=modal.querySelector(`[data-exclude="${CSS.escape(sid)}"]`).value==='exclude';targets.push({target_type:'shop',target_id:sid,excluded});});
  if(!targets.length){alert('حدد جهة واحدة على الأقل');return}
  if(!all&&targets.some(t=>t.target_type==='shop'&&t.excluded)){alert('استثناء المحلات متاح عند اختيار جميع الجهات فقط.');return}
  try{await api('set_targets',{release_id:id,targets});modal.remove();await load()}catch(e){alert('تعذر حفظ الجهات: '+e.message)}
 };
}
async function act(id,action){
 try{
  if(action==='targets'){await configureTargets(id);return}
  if(action==='artifact'){
   const artifact_url=prompt('رابط ملف الإصدار الثابت (HTTPS):');if(!artifact_url)return;
   const artifact_sha256=prompt('بصمة SHA-256 للملف (64 خانة hex):');if(!artifact_sha256)return;
   await api('set_artifact',{release_id:id,artifact_url,artifact_sha256});
  }else if(action==='quarantine'){
   const reason=prompt('اكتب سبب عزل الإصدار:');if(!reason)return;
   await api('quarantine',{release_id:id,reason});
  }else if(action==='rollback'){
   if(!confirm('سيتم إيقاف توزيع هذا الإصدار والعودة تلقائياً إلى أحدث إصدار سابق منشور ومطابق لكل جهة. هل تريد المتابعة؟'))return;
   const reason=prompt('سبب التراجع (مطلوب للتوثيق):');if(!reason)return;
   await api('rollback',{release_id:id,reason});
  }else await api(action,{release_id:id});
  await load();
 }catch(e){alert('لم تكتمل العملية: '+e.message)}
}
window.orvexUpdateCenter=function(){
 if(typeof isDesigner!=='function'||!isDesigner())return toast('مركز التحديثات للمصمم فقط');
 if(typeof window.__orvexRequest!=='function')return toast('خدمة المصادقة غير جاهزة');
 shell();
};
const style=document.createElement('style');style.textContent=`
#orvex-update-center{position:fixed;inset:0;z-index:10050;font-family:inherit;color:var(--ink,#17251e)}
.ouc-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62);display:flex;justify-content:center;align-items:flex-start;padding:3vh 12px;overflow:auto}
.ouc-panel{width:min(760px,100%);background:var(--bg,#f5f7f5);border:1px solid var(--line,#dce4de);border-radius:18px;padding:16px;box-shadow:0 20px 70px #0005;max-height:94vh;overflow:auto}
.ouc-panel header,.ouc-list-head,.ouc-release-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.ouc-panel h2{margin:0;font-size:21px}.ouc-panel header p,.ouc-release p{margin:4px 0;color:var(--muted,#66756c);font-size:13px}.ouc-close{border:0;border-radius:10px;width:38px;height:38px;font-size:25px;background:var(--surface,#fff);color:inherit}
.ouc-warning{display:grid;gap:4px;padding:12px;margin:14px 0;background:#fff3d8;color:#674a08;border:1px solid #ead39a;border-radius:12px;font-size:13px}
.ouc-card{background:var(--surface,#fff);border:1px solid var(--line,#dce4de);border-radius:13px;padding:13px;margin:12px 0}.ouc-card h3{margin:0 0 10px;font-size:15px}.ouc-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ouc-card label{display:grid;gap:5px;font-size:13px;margin:8px 0}.ouc-card input,.ouc-card textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line,#dce4de);border-radius:9px;background:var(--bg,#fff);color:inherit;font:inherit}.ouc-primary,.ouc-actions button,.ouc-list-head button{border:1px solid var(--line,#dce4de);border-radius:9px;padding:8px 11px;background:var(--surface,#fff);color:inherit;font:inherit;cursor:pointer}.ouc-primary{background:#147a43;color:white;border-color:#147a43;margin-top:8px}.ouc-release{padding:12px 0;border-top:1px solid var(--line,#dce4de)}.ouc-release-top span{font-size:12px;padding:4px 8px;border-radius:20px;background:var(--bg,#f2f4f2)}.ouc-release small,.ouc-muted,.ouc-panel footer{color:var(--muted,#66756c);font-size:12px}.ouc-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.ouc-actions .ouc-danger{color:#b3261e}.ouc-actions .ouc-disabled{opacity:.55;cursor:not-allowed}.ouc-panel footer{padding-top:8px}.ouc-event{padding:8px 0;border-bottom:1px solid var(--line,#ddd)}.ouc-event>div{display:flex;justify-content:space-between;gap:8px;font-size:13px}.ouc-event>div span{color:var(--muted,#66756c)}.ouc-event small{color:var(--muted,#66756c);font-size:11px}.ouc-target-modal{position:fixed;inset:0;z-index:10060;background:#0009;display:grid;place-items:center;padding:12px}.ouc-target-box{width:min(620px,100%);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--ink,#17251e);border-radius:15px;padding:16px;box-sizing:border-box}.ouc-target-box h3{margin-top:0}.ouc-target-box p{font-size:13px;color:var(--muted,#66756c)}.ouc-check{display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid var(--line,#ddd);font-size:13px}.ouc-check small{opacity:.6;direction:ltr}.ouc-check select{margin-inline-start:auto;padding:5px;border:1px solid var(--line,#ddd);border-radius:7px}.ouc-shop-list{max-height:45vh;overflow:auto}.ouc-target-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.ouc-target-actions button{border:1px solid var(--line,#ddd);border-radius:8px;padding:9px 12px;background:var(--bg,#fff);color:inherit}
@media(max-width:520px){.ouc-fields{grid-template-columns:1fr}.ouc-panel{padding:12px}.ouc-backdrop{padding:1vh 6px}}
`;document.head.appendChild(style);
})();
