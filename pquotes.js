/* ORVEX — عروض المشاريع (project_quotes): عرض سعر لمشروع بأقسام وبنود نصية حرّة (مقاولات، ديكور، تركيبات…)
   غير مرتبط بالمخزون ولا بنقطة البيع (بخلاف «عروض الأسعار» من السلة). الحالات: مسودة ← مُرسَل ← مقبول/مرفوض.
   لا تُنشئ فاتورة ولا قيدًا ماليًا. التخزين: db.pquotes (يُزامَن). */
(function(root){
'use strict';
const STATUS={draft:'مسودة',sent:'مُرسَل',accepted:'مقبول',rejected:'مرفوض'};
const NEXT={draft:['sent'],sent:['accepted','rejected','draft'],accepted:[],rejected:['draft']};
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const pos=n=>{n=parseFloat(n);return isFinite(n)&&n>=0?n:0};
const canMove=(a,b)=>(NEXT[a]||[]).includes(b);
const editable=q=>q.status==='draft';
function move(q,to,by,at){
  if(!q||!canMove(q.status,to))return false;
  if(to==='sent'&&!itemCount(q))return false; /* لا يُرسَل عرض بلا بنود */
  q.hist=(q.hist||[]).concat([{at,by:by||'',from:q.status,to}]).slice(-40);q.status=to;return true;
}
const itemCount=q=>(q.sections||[]).reduce((n,s)=>n+(s.items||[]).length,0);
const lineTotal=i=>r2(pos(i.qty)*pos(i.price));
const sectionTotal=s=>r2((s.items||[]).reduce((t,i)=>t+lineTotal(i),0));
/* المجاميع: الإجمالي الفرعي − الخصم (لا يتجاوز الفرعي) ثم الضريبة % على الصافي */
function totals(q){
  const sub=r2((q.sections||[]).reduce((t,s)=>t+sectionTotal(s),0));
  const disc=r2(Math.min(pos(q.discount),sub)),net=r2(sub-disc),tax=r2(net*Math.min(pos(q.taxPct),100)/100);
  return{sub,disc,net,tax,total:r2(net+tax)};
}
const expired=(q,today)=>q.status==='sent'&&!!q.validUntil&&q.validUntil<today;
function addItem(q,sectionTitle,it){
  const t=String(sectionTitle||'').trim()||'عام',d=String(it.desc||'').trim();
  if(!d)return{err:'أدخل وصف البند'};
  const qty=parseFloat(it.qty),price=parseFloat(it.price);
  if(!(qty>0))return{err:'كمية غير صالحة'};if(!(price>=0))return{err:'سعر غير صالح'};
  const secs=q.sections||(q.sections=[]);let s=secs.find(x=>x.title===t);if(!s){s={title:t,items:[]};secs.push(s)}
  s.items.push({desc:d.slice(0,300),qty,unit:String(it.unit||'').trim().slice(0,20),price});return{ok:true};
}
function delItem(q,si,ii){
  const s=(q.sections||[])[si];if(!s||!s.items[ii])return false;
  s.items.splice(ii,1);if(!s.items.length)q.sections.splice(si,1);return true;
}
function filterList(list,q,st,today){
  q=String(q||'').trim().toLowerCase();
  return list.filter(x=>(!st||(st==='open'?x.status==='draft'||x.status==='sent':st==='expired'?expired(x,today):x.status===st))&&(!q||[x.no,x.project,x.custName,x.phone].some(v=>String(v||'').toLowerCase().includes(q))));
}
function whatsText(q,money){
  const t=totals(q),L=[`عرض سعر: ${q.project} (${q.no})`];
  (q.sections||[]).forEach(s=>{L.push('',`• ${s.title}`);s.items.forEach(i=>L.push(`  - ${i.desc}: ${i.qty}${i.unit?' '+i.unit:''} × ${money(i.price)} = ${money(lineTotal(i))}`))});
  L.push('',`الإجمالي الفرعي: ${money(t.sub)}`);if(t.disc>0)L.push(`الخصم: ${money(t.disc)}`);if(t.tax>0)L.push(`الضريبة: ${money(t.tax)}`);
  L.push(`الإجمالي: ${money(t.total)}`);if(q.validUntil)L.push(`صالح حتى: ${q.validUntil}`);if(q.terms)L.push('',q.terms);
  return L.join('\n');
}
const P={STATUS,NEXT,canMove,editable,move,itemCount,lineTotal,sectionTotal,totals,expired,addItem,delItem,filterList,whatsText};
root.ORVEX_PQ=P;
if(typeof module!=='undefined'&&module.exports)module.exports=P;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),L=()=>(db.pquotes=db.pquotes||[]);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.project_quotes={fn:'pquotesModal',label:'عروض المشاريع'};
let F={q:'',st:'open'};
const allowed=()=>typeof can==='function'?can('invoices'):true;
const me=()=>(curUser()||{}).name||'';
const rnd=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const g=id=>{const e=document.getElementById(id);return e?e.value.trim():''};
root.pquotesModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  const all=L(),t=today();
  modal('عروض المشاريع',`<input class="search" type="search" placeholder="ابحث: المشروع، العميل، الرقم" value="${E(F.q)}" oninput="pqQ(this.value)">
  ${chips([['open','مفتوحة ('+all.filter(x=>x.status==='draft'||x.status==='sent').length+')'],['accepted','مقبولة'],['expired','منتهية ('+all.filter(x=>expired(x,t)).length+')'],['','الكل ('+all.length+')']],F.st,'pqF')}
  <div class="card" id="pql">${listHtml()}</div><div class="actions"><button class="btn primary" onclick="pqForm()">+ عرض مشروع</button></div>`);
};
function listHtml(){
  const t=today(),l=filterList(L(),F.q,F.st,t).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,100);
  if(!l.length)return empty(L().length?'لا توجد نتائج':'لا توجد عروض مشاريع. اضغط «+ عرض مشروع».');
  return l.map(x=>`<button class="row tap" onclick="pqView('${jsq(x.id)}')"><div class="grow"><div class="t">${E(x.project)} <small>${E(x.no)}</small></div><small>${E(x.custName||'—')} · ${money(totals(x).total)}</small></div><span class="badge ${x.status==='accepted'?'':'grey'}">${E(STATUS[x.status])}${expired(x,t)?' ⚠ منتهٍ':''}</span></button>`).join('');
}
root.pqQ=v=>{F.q=v;const l=document.getElementById('pql');if(l)l.innerHTML=listHtml()};
root.pqF=k=>{F.st=k;pquotesModal()};
root.pqForm=function(){
  modal('عرض مشروع جديد',`<label>اسم المشروع *</label><input id="pq_p"><div class="f2"><div><label>العميل</label><input id="pq_c"></div><div><label>الهاتف</label><input id="pq_t" type="tel"></div></div>
  <label>الموقع</label><input id="pq_a"><div class="f2"><div><label>صالح حتى</label><input id="pq_v" type="date" value="${(window.ORVEX_WARRANTY?ORVEX_WARRANTY.addMonths(today(),1):'')||''}"></div><div><label>الضريبة %</label><input id="pq_x" type="number" inputmode="decimal" step="any" value="${+db.settings.tax||0}"></div></div>
  <label>الشروط (دفعات، مدة التنفيذ…)</label><textarea id="pq_s" rows="2" style="width:100%"></textarea>
  <div class="actions"><button class="btn primary" onclick="pqSave()">إنشاء وإضافة البنود</button><button class="btn ghost" onclick="pquotesModal()">رجوع</button></div>`);
};
root.pqSave=function(){
  if(!allowed())return;const p=g('pq_p');if(!p)return toast('أدخل اسم المشروع');
  const v=g('pq_v');if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))return toast('تاريخ غير صالح');
  const x=Math.min(pos(g('pq_x')),100);
  const q={id:uid(),no:'PQ-'+today().replace(/-/g,'').slice(2)+'-'+rnd(),at:new Date().toISOString(),date:today(),project:p,custName:g('pq_c'),phone:g('pq_t'),address:g('pq_a'),validUntil:v,taxPct:x,discount:0,terms:g('pq_s'),sections:[],status:'draft',by:me(),hist:[]};
  L().push(q);save();toast('تم الإنشاء');pqView(q.id);
};
root.pqView=function(id){
  const q=L().find(x=>x.id===id);if(!q)return;const t=totals(q),ed=editable(q);
  const mv=(NEXT[q.status]||[]).map(s=>`<button class="btn ${s==='sent'||s==='accepted'?'primary':''}" onclick="pqMove('${jsq(q.id)}','${s}')">${s==='draft'?'إعادة للتعديل':E(STATUS[s])}</button>`).join('');
  modal(E(q.project)+' — '+q.no,`<div class="card"><div class="row"><span class="grow">الحالة</span><b>${E(STATUS[q.status])}${expired(q,today())?' (منتهي الصلاحية)':''}</b></div><div class="row"><span class="grow">العميل</span><b>${E(q.custName||'—')} ${E(q.phone||'')}</b></div>${q.validUntil?`<div class="row"><span class="grow">صالح حتى</span><b>${E(q.validUntil)}</b></div>`:''}</div>
  ${(q.sections||[]).map((s,si)=>`<div class="card"><b>${E(s.title)}</b> <small>${money(sectionTotal(s))}</small>${s.items.map((i,ii)=>`<div class="row"><div class="grow">${E(i.desc)}<br><small>${i.qty}${i.unit?' '+E(i.unit):''} × ${money(i.price)}</small></div><b>${money(lineTotal(i))}</b>${ed?`<button class="btn danger" onclick="pqDel('${jsq(q.id)}',${si},${ii})">×</button>`:''}</div>`).join('')}</div>`).join('')||'<div class="card">'+empty('لا بنود بعد')+'</div>'}
  <div class="card"><div class="row"><span class="grow">الإجمالي الفرعي</span><b>${money(t.sub)}</b></div>${t.disc>0?`<div class="row"><span class="grow">الخصم</span><b>${money(t.disc)}</b></div>`:''}${t.tax>0?`<div class="row"><span class="grow">الضريبة (${q.taxPct}%)</span><b>${money(t.tax)}</b></div>`:''}<div class="row"><span class="grow"><b>الإجمالي</b></span><b>${money(t.total)}</b></div></div>
  ${ed?`<h4>إضافة بند</h4><label>القسم</label><input id="pi_s" list="pq_secs" placeholder="مثال: أعمال الدهان"><datalist id="pq_secs">${(q.sections||[]).map(s=>`<option value="${E(s.title)}">`).join('')}</datalist>
  <label>وصف البند</label><input id="pi_d"><div class="f2"><div><label>الكمية</label><input id="pi_q" type="number" inputmode="decimal" step="any" value="1"></div><div><label>الوحدة</label><input id="pi_u" placeholder="م²، قطعة…"></div></div><label>سعر الوحدة</label><input id="pi_p" type="number" inputmode="decimal" step="any">
  <div class="actions"><button class="btn primary" onclick="pqAdd('${jsq(q.id)}')">+ إضافة البند</button></div>
  <label>خصم (مبلغ)</label><div style="display:flex;gap:8px"><input id="pi_x" type="number" inputmode="decimal" step="any" value="${q.discount||''}"><button class="btn" onclick="pqDisc('${jsq(q.id)}')">حفظ الخصم</button></div>`:''}
  <div class="actions">${mv}${q.phone?`<button class="btn" onclick="pqWhats('${jsq(q.id)}')">واتساب</button>`:''}${ed&&isAdmin()?`<button class="btn danger" onclick="pqRemove('${jsq(q.id)}')">حذف</button>`:''}<button class="btn ghost" onclick="pquotesModal()">رجوع</button></div>
  ${(q.hist||[]).length?`<h4>السجل</h4>${q.hist.slice().reverse().map(h=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #ddd">${E(String(h.at).slice(0,16).replace('T',' '))} — ${E(STATUS[h.from])} ← ${E(STATUS[h.to])} ${E(h.by)}</div>`).join('')}`:''}`);
};
root.pqAdd=function(id){
  const q=L().find(x=>x.id===id);if(!q||!editable(q))return;
  const r=addItem(q,g('pi_s'),{desc:g('pi_d'),qty:g('pi_q'),unit:g('pi_u'),price:g('pi_p')});
  if(r.err)return toast(r.err);save();pqView(id);
};
root.pqDel=function(id,si,ii){const q=L().find(x=>x.id===id);if(q&&editable(q)&&delItem(q,si,ii)){save();pqView(id)}};
root.pqDisc=function(id){const q=L().find(x=>x.id===id);if(!q||!editable(q))return;q.discount=pos(g('pi_x'));save();toast('تم');pqView(id)};
root.pqMove=function(id,to){
  const q=L().find(x=>x.id===id);if(!q)return;
  const go=()=>{if(move(q,to,me(),new Date().toISOString())){save();toast('تم');pqView(id)}else toast(to==='sent'?'أضف بنودًا أولًا':'انتقال غير مسموح')};
  if(to==='accepted'||to==='rejected')return askConfirm(to==='accepted'?'تسجيل قبول العميل للعرض؟':'تسجيل رفض العرض؟',go,'تأكيد');
  go();
};
root.pqRemove=id=>{if(!isAdmin())return;askConfirm('حذف المسودة نهائيًا؟',()=>{db.pquotes=L().filter(x=>x.id!==id||!editable(x));save();pquotesModal()},'حذف')};
root.pqWhats=function(id){
  const q=L().find(x=>x.id===id);if(!q||!q.phone)return;
  let ph=q.phone.replace(/[^\d]/g,'');if(ph.startsWith('0'))ph='964'+ph.slice(1);
  window.open('https://wa.me/'+ph+'?text='+encodeURIComponent(whatsText(q,money)),'_blank');
};
})(typeof window!=='undefined'?window:globalThis);
