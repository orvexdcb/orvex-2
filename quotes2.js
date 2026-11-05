/* ORVEX — المرحلة 3: تطوير عروض الأسعار (quotes2.js)
   يضيف فوق quotes.js (دون تعديله): حالات العرض (ساري/مُرسَل/مقبول/مرفوض/طلب بيع/منتهٍ/محوَّل) بسجل تاريخي،
   خطوة «طلب بيع» بين العرض والفاتورة، تمديد الصلاحية، تدقيق الحذف والتحويل، وطباعة A4 واضحة.
   التحويل إلى فاتورة يبقى عبر المسار العادي (مخزون/ائتمان/ضريبة الوقت الحالي). يُحمَّل بعد quotes.js وقبل server.js. */
(function(){
'use strict';
const ST={open:'ساري',sent:'أُرسل للعميل',accepted:'مقبول',rejected:'مرفوض',ordered:'طلب بيع',expired:'منتهٍ',converted:'حُوِّل إلى فاتورة'};
const NEXT={open:['sent','accepted','rejected','ordered'],sent:['accepted','rejected','ordered','open'],accepted:['ordered','rejected'],ordered:['accepted'],rejected:['open'],converted:[]};
const by=()=>(typeof curUser==='function'&&(curUser()||{}).name)||'';
const log=(a,r,d,ba)=>{try{if(window.orvexLog)window.orvexLog(a,r,d,ba)}catch(e){}};
const Q=()=>{if(!Array.isArray(db.quotes))db.quotes=[];return db.quotes};
const find=id=>Q().find(x=>x.id===id)||null;
const rawOf=q=>q.status||'open';
const statusOf=q=>{const s=rawOf(q);return(s==='open'||s==='sent'||s==='accepted')&&q.validUntil&&q.validUntil<today()?'expired':s};
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return ymd(x)};
const lineTotal=l=>r2(l.qty*l.price*(1-(l.dp||0)/100));
const evt=(q,ev,note)=>{q.log=q.log||[];q.log.push({t:new Date().toISOString(),by:by(),ev,note:note||''})};
const may=()=>(typeof isAdmin==='function'&&isAdmin())||can('pos');
const devShort=()=>{try{return(localStorage.getItem(KEY+'_devid')||'').slice(0,3)||'X'}catch(e){return'X'}};

function setStatus(id,to,note){const q=find(id);if(!q)return{err:'العرض غير موجود'};if(!may())return{err:'ليست لديك صلاحية'};
  const from=rawOf(q);if(from==='converted')return{err:'العرض محوَّل إلى فاتورة'};
  if(!(NEXT[from]||[]).includes(to))return{err:'لا يمكن الانتقال من «'+ST[from]+'» إلى «'+ST[to]+'»'};
  if(to==='ordered'&&statusOf(q)==='expired')return{err:'العرض منتهٍ؛ مدّد صلاحيته أولًا'};
  if(to==='rejected'&&!String(note||'').trim())return{err:'اكتب سبب الرفض'};
  q.status=to;evt(q,to,note);
  if(to==='ordered'&&!q.orderNo){db.settings.nextSO=(db.settings.nextSO||1);q.orderNo='SO-'+devShort()+'-'+(db.settings.nextSO++);q.orderAt=new Date().toISOString()}
  log(to==='ordered'?'quote_order':'quote_status',q.no,ST[from]+' ← '+ST[to]+(note?' — '+note:''),{b:{status:from},a:{status:to}});return{ok:q}}
function extend(id,days){const q=find(id);if(!q)return{err:'العرض غير موجود'};if(!may())return{err:'ليست لديك صلاحية'};
  const raw=rawOf(q);if(raw==='converted'||raw==='rejected'||raw==='ordered')return{err:'لا يُمدَّد في هذه الحالة'};
  days=Math.floor(num(days));if(!(days>=1&&days<=365))return{err:'المدة بين 1 و365 يومًا'};
  const b=q.validUntil;q.validUntil=addDays(today()>b?today():b,days);evt(q,'extend','حتى '+q.validUntil);log('quote_status',q.no,'تمديد',{b:{validUntil:b},a:{validUntil:q.validUntil}});return{ok:q}}
const canInvoice=q=>['open','sent','accepted','ordered'].includes(rawOf(q));
window.ORVEX_QT={setStatus,extend,statusOf,canInvoice,ST,NEXT,find};

/* التحويل لفاتورة: لا يُسمح من المرفوض */
if(typeof window.quoteToInvoice==='function'){const _t=window.quoteToInvoice;window.quoteToInvoice=function(id){const q=find(id);
  if(q&&!canInvoice(q)&&rawOf(q)!=='converted')return toast('العرض «'+ST[rawOf(q)]+'» ولا يمكن تحويله');return _t(id)}}
/* بعد إتمام الفاتورة: سجل التحويل في تاريخ العرض */
if(typeof finalize==='function'){const _f=finalize;finalize=function(){const qid=state.co&&state.co.quoteId,r=_f.apply(this,arguments);
  if(qid){const q=find(qid);if(q&&q.status==='converted'&&!(q.log||[]).some(x=>x.ev==='converted')){evt(q,'converted',q.saleNo||'');log('quote_status',q.no,'تحويل إلى فاتورة '+(q.saleNo||''),{a:{status:'converted',sale:q.saleNo}});save()}}return r}}
/* حذف العرض: تدقيق */
if(typeof window.quoteDelete==='function'){window.quoteDelete=function(id){const q=find(id);if(!q)return;if(!isAdmin())return toast('للمدير فقط');if(rawOf(q)==='converted')return toast('لا يُحذف عرض محوَّل');
  askConfirm('حذف هذا العرض نهائيًا؟',()=>{log('quote_delete',q.no,ST[statusOf(q)]+' | '+q.totals.total,{b:{no:q.no,status:rawOf(q),total:q.totals.total}});db.quotes=db.quotes.filter(x=>x.id!==id);save();quotesModal();toast('تم الحذف')},'حذف العرض')}}

/* ---- الواجهة ---- */
const QF={f:''};
window.quotesModal=function(){const L=Q().slice().reverse().filter(q=>!QF.f||statusOf(q)===QF.f).slice(0,80),cnt={};Q().forEach(q=>{const s=statusOf(q);cnt[s]=(cnt[s]||0)+1});
  modal('عروض الأسعار',`<div class="actions no-print" style="flex-wrap:wrap;margin-bottom:6px"><button class="btn ${QF.f?'':'primary'}" onclick="quotesFilter('')">الكل</button>${['open','sent','accepted','ordered','expired','rejected','converted'].map(k=>`<button class="btn ${QF.f===k?'primary':''}" onclick="quotesFilter('${k}')">${ST[k]}${cnt[k]?' ('+cnt[k]+')':''}</button>`).join('')}</div>
  <div class="card">${L.length?L.map(q=>{const c=q.cid?cust(q.cid):null,st=statusOf(q);return`<button class="row tap" onclick="quoteDetail('${jsq(q.id)}')"><div class="grow"><div class="t">${esc(q.orderNo||q.no)} — ${esc(c?c.name:'بدون عميل')}</div><small>${fdate(q.date)} · ${ST[st]}</small></div><b>${money(q.totals.total)}</b></button>`}).join(''):empty('لا توجد عروض أسعار')}</div>`)};
window.quotesFilter=k=>{QF.f=k;quotesModal()};
window.quoteDetail=function(id){const q=find(id);if(!q)return;const c=q.cid?cust(q.cid):null,st=statusOf(q),raw=rawOf(q),s2=db.settings,ok=may();
  const rows=q.cart.map(l=>{const p=prod(l.pid);return`<div class="row"><div class="grow"><div class="t">${esc(p?p.name:(l.name||'مادة محذوفة'))}</div><small>${l.qty} × ${money(l.price)}${l.dp?' − '+l.dp+'%':''}</small></div><b>${money(lineTotal(l))}</b></div>`}).join('');
  const hist=(q.log||[]).slice().reverse().map(g=>`<div style="font-size:12px;padding:2px 0;border-bottom:1px dashed #ddd">${esc(fdate(String(g.t).slice(0,10)))} — ${esc(ST[g.ev]||g.ev)} — ${esc(g.by||'')}${g.note?' — '+esc(g.note):''}</div>`).join('');
  const nx=(NEXT[raw]||[]).filter(k=>k!=='ordered'&&k!=='rejected');
  modal('عرض سعر '+q.no,`<div id="qtPrint"><div class="card"><div class="row"><span class="grow">${esc(s2.name)}</span><small>${esc(s2.phone||'')}</small></div>
  <div class="row"><span class="grow">العميل</span><b>${esc(c?c.name:'-')}</b></div><div class="row"><span class="grow">التاريخ / الصلاحية حتى</span><span>${fdate(q.date)} / ${fdate(q.validUntil)}</span></div>
  <div class="row"><span class="grow">الحالة</span><b>${ST[st]}${q.orderNo?' ('+esc(q.orderNo)+')':''}${q.saleNo?' ('+esc(q.saleNo)+')':''}</b></div></div>
  <div class="card">${rows}${q.totals.disc>0?`<div class="row"><span class="grow">الخصم</span><span>${money(q.totals.disc)}</span></div>`:''}${q.totals.tax>0?`<div class="row"><span class="grow">الضريبة (تقديرية بإعداد وقت العرض)</span><span>${money(q.totals.tax)}</span></div>`:''}<div class="row"><span class="grow"><b>الإجمالي</b></span><b>${money(q.totals.total)}</b></div></div>${q.note?`<p>${esc(q.note)}</p>`:''}</div>
  ${hist?`<label class="no-print">سجل الحالة</label><div class="card no-print">${hist}</div>`:''}
  <div class="actions no-print" style="flex-wrap:wrap">${canInvoice(q)&&ok?`<button class="btn primary" onclick="quoteToInvoice('${jsq(q.id)}')">تحويل إلى فاتورة</button>`:''}
  ${ok&&(NEXT[raw]||[]).includes('ordered')&&st!=='expired'?`<button class="btn" onclick="quoteSt('${jsq(q.id)}','ordered')">تحويل إلى طلب بيع</button>`:''}
  ${ok&&nx.map(k=>`<button class="btn" onclick="quoteSt('${jsq(q.id)}','${k}')">${k==='open'?'إعادة فتح':'تعليم: '+ST[k]}</button>`).join('')}
  ${ok&&(NEXT[raw]||[]).includes('rejected')?`<button class="btn" onclick="quoteReject('${jsq(q.id)}')">رفض</button>`:''}
  ${ok&&['open','sent','accepted'].includes(raw)?`<button class="btn" onclick="quoteExtend('${jsq(q.id)}')">تمديد الصلاحية</button>`:''}
  <button class="btn" onclick="quotePrintA4('${jsq(q.id)}')">🖨 طباعة A4</button>${c&&c.phone?`<button class="btn" onclick="quoteWhats('${jsq(q.id)}')">واتساب</button>`:''}${isAdmin()&&raw!=='converted'?`<button class="btn danger" onclick="quoteDelete('${jsq(q.id)}')">حذف</button>`:''}</div>`)};
window.quoteSt=(id,to)=>{const r=setStatus(id,to,'');if(r.err)return toast(r.err);save();toast('تم: '+ST[to]);quoteDetail(id)};
window.quoteReject=id=>{modal('رفض العرض','<label>سبب الرفض (إلزامي)</label><input id="qr_n"><div class="actions"><button class="btn danger" onclick="quoteRejectOk(\''+jsq(id)+'\')">رفض</button><button class="btn ghost" onclick="quoteDetail(\''+jsq(id)+'\')">رجوع</button></div>')};
window.quoteRejectOk=id=>{const r=setStatus(id,'rejected',($('#qr_n')||{}).value);if(r.err)return toast(r.err);save();quoteDetail(id)};
window.quoteExtend=id=>{modal('تمديد الصلاحية','<label>عدد الأيام (من اليوم أو من تاريخ الانتهاء إن لم ينتهِ)</label><input id="qe_d" type="number" value="7"><div class="actions"><button class="btn primary" onclick="quoteExtendOk(\''+jsq(id)+'\')">تمديد</button><button class="btn ghost" onclick="quoteDetail(\''+jsq(id)+'\')">رجوع</button></div>')};
window.quoteExtendOk=id=>{const r=extend(id,($('#qe_d')||{}).value);if(r.err)return toast(r.err);save();quoteDetail(id)};

/* ---- طباعة A4 (عبر إطار مخفي) ---- */
function a4Html(q){const c=q.cid?cust(q.cid):null,s=db.settings,st=statusOf(q),terms=s.quoteTerms||'الأسعار سارية حتى تاريخ الصلاحية المذكور. الدفع والتسليم حسب الاتفاق.';
  const rows=q.cart.map((l,i)=>{const p=prod(l.pid);return`<tr><td>${i+1}</td><td>${esc(p?p.name:(l.name||''))}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${l.dp?l.dp+'%':'-'}</td><td>${money(lineTotal(l))}</td></tr>`}).join('');
  return`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(q.no)}</title><style>@page{size:A4;margin:14mm}body{font-family:Tahoma,Arial,sans-serif;font-size:13px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #888;padding:6px;text-align:right}th{background:#eee}.tot td{font-weight:700}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:8px}.sig{display:flex;justify-content:space-between;margin-top:50px}.sig div{width:40%;border-top:1px solid #444;text-align:center;padding-top:4px}small{color:#555}</style></head><body>
  <div class="hd"><div><h1>${esc(s.name||'')}</h1><small>${esc(s.address||'')} ${s.phone?'— '+esc(s.phone):''}</small>${s.taxNo?'<br><small>الرقم الضريبي: '+esc(s.taxNo)+'</small>':''}</div><div style="text-align:left"><b>عرض سعر</b><br>${esc(q.no)}<br><small>${esc(fdate(q.date))}</small></div></div>
  <p>العميل: <b>${esc(c?c.name:'-')}</b>${c&&c.phone?' — '+esc(c.phone):''}<br>صالح حتى: <b>${esc(fdate(q.validUntil))}</b> — الحالة: ${esc(ST[st])}</p>
  <table><tr><th>#</th><th>المادة</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr>${rows}
  ${q.totals.disc>0?`<tr class="tot"><td colspan="5">الخصم</td><td>${money(q.totals.disc)}</td></tr>`:''}${q.totals.tax>0?`<tr class="tot"><td colspan="5">الضريبة (تقديرية)</td><td>${money(q.totals.tax)}</td></tr>`:''}<tr class="tot"><td colspan="5">الإجمالي</td><td>${money(q.totals.total)}</td></tr></table>
  ${q.note?`<p>ملاحظات: ${esc(q.note)}</p>`:''}<p><small>${esc(terms)}</small></p><div class="sig"><div>توقيع البائع</div><div>موافقة العميل</div></div></body></html>`}
window.quotePrintA4=function(id){const q=find(id);if(!q)return;const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  const d=f.contentWindow.document;d.open();d.write(a4Html(q));d.close();setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('تعذّرت الطباعة')}setTimeout(()=>f.remove(),2000)},300)};
window.ORVEX_QT.a4Html=a4Html;
})();
