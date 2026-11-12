/* ORVEX — المرحلة 2: الدفتر المحلي (ledger.js)
   دفتر قيد مزدوج يعمل دون أي ترحيل في Supabase: القيود الآلية تُشتق من بيانات التطبيق نفسها عبر محرك accounting.js
   (فواتير، مرتجعات، مشتريات، مصروفات، دفعات) + قيود جرد وتكاليف وصول وعجز/زيادة الصندوق + قيود يدوية.
   - لا يكتب على الدفتر السحابي (006) ولا يتعارض معه: هذا عرض مستقل يُحسب عند الطلب.
   - القيود اليدوية إلحاقية فقط: لا حذف ولا تعديل، التصحيح بقيد عكسي.
   - المجموعات الجديدة: journals, coa, bankAccts, bankRecs (تُزامَن عبر records). */
(function(root){
'use strict';
const lcs=s=>String(s==null?'':s).trim().toLowerCase();
const R2=n=>{n=+n;if(!isFinite(n))return 0;const s=n<0?-1:1;return s*Math.round(Math.abs(n)*100*(1+4*Number.EPSILON))/100};
const N=v=>{const n=parseFloat(String(v==null?'':v).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)));return isNaN(n)?0:n};
const D=()=>db;
const ensure=()=>{const d=D();['journals','coa','bankAccts','bankRecs'].forEach(k=>{if(!Array.isArray(d[k]))d[k]=[]});return d};
const usr=()=>(typeof curUser==='function'&&(curUser()||{}).name)||'';
const uidf=()=>uid();
const tdy=()=>today();
const audit=(a,r,d,ba)=>{try{if(root.orvexLog)root.orvexLog(a,r,d,ba)}catch(e){}};
const canf=p=>typeof can==='function'?!!can(p):false;
const isAdm=()=>typeof isAdmin==='function'?!!isAdmin():false;

/* ===== شجرة الحسابات ===== */
const BASE=[
 ['1110','الصندوق','asset','cash'],['1120','البنك / الدفع الإلكتروني (عام)','asset','bank'],['1130','ذمم العملاء','asset','ar'],['1140','المخزون','asset','inventory'],
 ['1150','ضريبة مدخلات','asset','vat_in'],['1210','الأصول الثابتة','asset','fixed_assets'],['1219','مجمع الإهلاك','asset','acc_dep'],
 ['2110','ذمم الموردين','liability','ap'],['2120','ضريبة مخرجات','liability','vat_out'],['2130','رواتب مستحقة','liability','payroll_payable'],
 ['3100','رأس المال','equity','capital'],['3200','الأرباح المحتجزة','equity','retained'],
 ['4100','إيرادات المبيعات','revenue','sales'],['4150','مردودات المبيعات','revenue','sales_returns'],['4190','خصومات المبيعات','revenue','sales_discount'],
 ['5100','تكلفة البضاعة المباعة','expense','cogs'],['5200','المصروفات التشغيلية','expense','opex'],['5300','الرواتب والأجور','expense','payroll'],
 ['5400','الإهلاك','expense','depreciation'],['5500','فروق ومخزون تالف','expense','inventory_adjust'],['5600','عجز وزيادة الصندوق','expense','cash_diff'],['5450','خسائر (أرباح) استبعاد الأصول','expense','asset_disposal']
].map(([code,name,type,key])=>({id:'a'+code,code,name,type,key,base:true}));
const TYPES={asset:'أصول',liability:'التزامات',equity:'حقوق ملكية',revenue:'إيرادات',expense:'مصروفات'};
function accounts(){const d=ensure(),L=BASE.slice();
  d.coa.forEach(a=>L.push({id:a.id,code:a.code,name:a.name,type:a.type,key:null,active:a.active!==false,custom:true}));
  d.bankAccts.forEach(b=>L.push({id:'bk_'+b.id,code:b.code,name:'بنك: '+b.name,type:'asset',key:null,bank:b.id,active:b.active!==false}));
  return L}
const byId=()=>{const m={};accounts().forEach(a=>m[a.id]=a);return m};
function acctAdd(code,name,type){const d=ensure();code=String(code||'').trim();name=String(name||'').trim();
  if(!canf('settings')&&!isAdm())return{err:'للمدير فقط'};
  if(!/^\d{3,8}$/.test(code))return{err:'رمز الحساب أرقام فقط (3-8)'};if(!name)return{err:'أدخل اسم الحساب'};if(!TYPES[type])return{err:'نوع غير صحيح'};
  if(accounts().some(a=>a.code===code))return{err:'الرمز مستخدم'};
  const a={id:'c'+uidf(),code,name,type,active:true};d.coa.push(a);audit('coa_add',code,name+' / '+TYPES[type],{a});return{ok:a}}
function acctToggle(id){const d=ensure(),a=d.coa.find(x=>x.id===id);if(!a)return{err:'لا يمكن إيقاف حساب أساسي'};
  if(a.active!==false&&Math.abs(tb('','9999-12-31').find(r=>r.id===id)?.balance||0)>0.004)return{err:'الحساب عليه رصيد'};
  a.active=a.active===false;audit('coa_toggle',a.code,a.active?'تفعيل':'إيقاف');return{ok:a}}

/* ===== البنوك ===== */
function bankAdd(name,methods){const d=ensure();name=String(name||'').trim();if(!isAdm())return{err:'للمدير فقط'};if(!name)return{err:'أدخل اسم الحساب البنكي'};
  if(d.bankAccts.some(b=>lcs(b.name)===lcs(name)))return{err:'الاسم مستخدم'};
  const m=(methods||[]).filter(x=>x==='card'||x==='transfer');
  for(const b of d.bankAccts)if(b.active!==false&&b.map.some(x=>m.includes(x)))return{err:'طريقة الدفع مربوطة بحساب «'+b.name+'» مسبقًا'};
  const n=d.bankAccts.length+1,b={id:uidf(),name,code:String(1120+n),map:m,active:true,at:new Date().toISOString()};
  d.bankAccts.push(b);audit('bank_add',name,(m.join(',')||'بلا ربط'),{a:b});return{ok:b}}
const bankFor=method=>{const d=ensure();const b=d.bankAccts.find(x=>x.active!==false&&x.map.includes(method));return b?'bk_'+b.id:null};

/* ===== اشتقاق القيود ===== */
const A=()=>root.orvexAcct;
function entries(){const d=ensure(),by=byId(),keyId={};accounts().forEach(a=>{if(a.key)keyId[a.key]=a.id});
  const out=[],warn=[];
  const A_=A();if(A_&&A_.expected){
    const ex=A_.expected(d,(d.settings&&d.settings.ledgerStart)||'');
    ex.skipped.forEach(s=>warn.push('قيد غير متوازن: '+s.source+' '+s.id));
    ex.entries.forEach(e=>{
      let doc=null;if(e.source==='sale')doc=d.sales.find(x=>x.id===e.docId);else if(e.source==='purchase')doc=d.purchases.find(x=>x.id===e.docId);else if(e.source==='preturn')doc=(d.preturns||[]).find(x=>x.id===e.docId);
      const dm=doc&&(doc.cashMethod||doc.method),bk=doc&&(dm==='card'||dm==='transfer')?bankFor(dm):null;
      const lines=e.lines.map(l=>({a:l.key==='bank'&&bk?bk:keyId[l.key],d:l.debit,c:l.credit}));
      if(lines.some(l=>!l.a||!by[l.a])){warn.push('حساب مفقود في '+e.key);return}
      out.push({key:e.key,src:e.source,date:e.date,memo:e.memo,lines})})}
  /* عجز/زيادة الصندوق من إغلاقات «الكل» المعتمدة */
  (d.closings||[]).forEach(c=>{if(c.status==='void'||(c.scope&&c.scope!=='all')||!c.diff)return;const x=R2(c.diff);if(!x)return;
    out.push({key:'closing:'+c.id,src:'closing',date:c.date,memo:(x<0?'عجز':'زيادة')+' الصندوق '+c.no,lines:x<0?[{a:keyId.cash_diff,d:-x,c:0},{a:keyId.cash,d:0,c:-x}]:[{a:keyId.cash,d:x,c:0},{a:keyId.cash_diff,d:0,c:x}]})});
  /* تسويات الجرد المعتمدة (الفرق × التكلفة وقت العدّ) */
  (d.stocktakes||[]).forEach(s=>{if(s.status!=='approved')return;const v=R2((s.lines||[]).reduce((a,l)=>a+N(l.applied)*N(l.cost),0));if(!v)return;
    out.push({key:'stocktake:'+s.id,src:'stocktake',date:(s.approvedAt||s.at||s.date||'').slice(0,10)||s.date,memo:'تسوية جرد '+s.no,lines:v<0?[{a:keyId.inventory_adjust,d:-v,c:0},{a:keyId.inventory,d:0,c:-v}]:[{a:keyId.inventory,d:v,c:0},{a:keyId.inventory_adjust,d:0,c:v}]})});
  /* تكاليف الوصول المسدّدة نقدًا/بنكيًا */
  (d.purchases||[]).forEach(p=>(p.landed||[]).forEach(c=>{const a=R2(c.amount);if(!(a>0))return;const cr=c.pay==='bank'?(bankFor('transfer')||keyId.bank):keyId.cash;
    out.push({key:'landed:'+c.id,src:'landed',date:c.date||(c.t||'').slice(0,10)||p.date,memo:'تكلفة وصول '+c.type+' — '+p.no,lines:[{a:keyId.inventory,d:a,c:0},{a:cr,d:0,c:a}]})}));
  /* أصول ثابتة (شراء/إهلاك/استبعاد) وأوامر تصنيع مكتملة: تُشتق من assets3.js وmfg.js ولا تُخزَّن */
  [root.ORVEX_ASSETS,root.ORVEX_MFG].forEach(M=>{if(!M||!M.entries)return;try{M.entries(keyId,bankFor('transfer')||keyId.bank).forEach(e=>{
    if(e.lines.some(l=>!l.a||!by[l.a])){warn.push('حساب مفقود في '+e.key);return}out.push(e)})}catch(x){warn.push('تعذّر اشتقاق قيود '+(M===root.ORVEX_MFG?'التصنيع':'الأصول'))}});
  /* قيود يدوية */
  d.journals.forEach(j=>out.push({key:'journal:'+j.id,src:'manual',date:j.date,memo:j.memo||j.no,no:j.no,jid:j.id,lines:j.lines.map(l=>({a:l.a,d:R2(l.d),c:R2(l.c)}))}));
  return{list:out.filter(e=>e.date).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0),warn}}

/* ===== ميزان المراجعة والقوائم ===== */
function tb(from,to){const by=byId(),m={};accounts().forEach(a=>m[a.id]={id:a.id,code:a.code,name:a.name,type:a.type,debit:0,credit:0});
  entries().list.forEach(e=>{if((from&&e.date<from)||(to&&e.date>to))return;e.lines.forEach(l=>{const r=m[l.a];if(!r)return;r.debit=R2(r.debit+l.d);r.credit=R2(r.credit+l.c)})});
  return Object.values(m).map(r=>Object.assign(r,{balance:R2(r.debit-r.credit)})).filter(r=>r.debit||r.credit).sort((a,b)=>a.code<b.code?-1:1)}
const sm=(a,f)=>R2(a.reduce((s,x)=>s+f(x),0));
function incomeStatement(rows){const rev=rows.filter(x=>x.type==='revenue'&&x.balance).map(x=>({code:x.code,name:x.name,amount:R2(-x.balance)})),
  exp=rows.filter(x=>x.type==='expense'&&x.balance).map(x=>({code:x.code,name:x.name,amount:x.balance})),r=sm(rev,x=>x.amount),e=sm(exp,x=>x.amount);
  return{rev,exp,revenue:r,expense:e,net:R2(r-e)}}
function balanceSheet(rows){const side=(t,s)=>rows.filter(x=>x.type===t&&x.balance).map(x=>({code:x.code,name:x.name,amount:R2(s*x.balance)})),
  assets=side('asset',1),liab=side('liability',-1),eq=side('equity',-1),is=incomeStatement(rows),A_=sm(assets,x=>x.amount),L_=sm(liab,x=>x.amount),E_=sm(eq,x=>x.amount);
  return{assets,liab,eq,assetsTotal:A_,liabTotal:L_,eqTotal:E_,earnings:is.net,balanced:Math.abs(A_-(L_+E_+is.net))<0.01}}
const totals=rows=>({debit:sm(rows,x=>x.debit),credit:sm(rows,x=>x.credit)});

/* ===== التدفقات النقدية (طريقة مباشرة) — مشتقة من القيود، لا تُخزَّن ===== */
const CF_SRC={sale:'مقبوضات المبيعات',return:'مردودات المبيعات المدفوعة',purchase:'مدفوعات المشتريات',preturn:'مقبوضات مرتجع الشراء',expense:'مصروفات تشغيلية',payment:'تحصيل/سداد الذمم',landed:'تكاليف وصول',closing:'عجز/زيادة الصندوق',stocktake:'تسويات جرد',mfg:'تصنيع',asset:'شراء أصول ثابتة',asset_dep:'إهلاك',asset_disposal:'بيع/شطب أصول',manual:'قيود يدوية'};
function cashFlow(from,to){const by=byId(),isCash=id=>{const a=by[id];return !!a&&(a.key==='cash'||a.key==='bank'||!!a.bank)};
  const sec={operating:{},investing:{},financing:{}};let open=0,close=0,net=0;
  entries().list.forEach(e=>{let c=0,eq=false,fa=false;e.lines.forEach(l=>{const a=by[l.a];if(isCash(l.a))c=R2(c+l.d-l.c);else if(a){if(a.type==='equity')eq=true;if(a.key==='fixed_assets')fa=true}});
    if(!c)return;if(to&&e.date>to)return;close=R2(close+c);
    if(from&&e.date<from){open=R2(open+c);return}
    const sc=e.src==='asset'||e.src==='asset_disposal'||(e.src==='manual'&&fa)?'investing':(e.src==='manual'&&eq)?'financing':'operating';
    const k=CF_SRC[e.src]||e.src;sec[sc][k]=R2((sec[sc][k]||0)+c);net=R2(net+c)});
  const rows=o=>Object.keys(o).map(k=>({name:k,amount:o[k]})),tot=o=>R2(Object.keys(o).reduce((a,k)=>a+o[k],0));
  const r={operating:rows(sec.operating),investing:rows(sec.investing),financing:rows(sec.financing),opTotal:tot(sec.operating),invTotal:tot(sec.investing),finTotal:tot(sec.financing),opening:open,net,closing:close};
  r.reconciled=Math.abs(R2(open+net)-close)<0.005&&Math.abs(R2(r.opTotal+r.invTotal+r.finTotal)-net)<0.005;return r}

/* ===== أعمار الديون: عملاء (c) أو موردون (s) — مشتقة من المستندات؛ الدفعات والمرتجعات تُسدَّد بها الأقدم أولًا ===== */
const BUCKETS=[['0-30',0,30],['31-60',31,60],['61-90',61,90],['90+',91,1e9]];
const dayDiff=(a,b)=>Math.floor((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
function aging(type,asOf){const d=ensure(),c=type==='c',list=c?(d.customers||[]):(d.suppliers||[]),as=asOf||tdy(),rows=[];
  list.forEach(p=>{const debits=[],credits=[];let cr=0;
    if(c){(d.sales||[]).forEach(s=>{if(s.void||s.cid!==p.id||s.date>as)return;const r=R2(R2(s.total)-Math.min(R2(s.paid),R2(s.total)));if(r>0.004)debits.push({date:s.date,amt:r,no:s.no})});
      (d.returns||[]).forEach(r=>{if(r.cid===p.id&&r.method==='balance'&&r.date<=as)credits.push({date:r.date,amt:R2(r.total)})})}
    else{(d.purchases||[]).forEach(o=>{if(o.sid!==p.id||o.date>as)return;const r=R2(R2(o.total)-Math.min(R2(o.paid),R2(o.total)));if(r>0.004)debits.push({date:o.date,amt:r,no:o.no})});
      (d.preturns||[]).forEach(r=>{if(!r.void&&r.sid===p.id&&r.date<=as&&R2(r.apPart)>0)credits.push({date:r.date,amt:R2(r.apPart)})})}
    (d.payments||[]).forEach(y=>{if(y.type===type&&y.pid===p.id&&y.date<=as)credits.push({date:y.date,amt:R2(y.amount)})});
    credits.forEach(x=>cr=R2(cr+x.amt));debits.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
    debits.forEach(x=>{const t=Math.min(x.amt,cr);x.amt=R2(x.amt-t);cr=R2(cr-t)});
    const open=debits.filter(x=>x.amt>0.004),b=BUCKETS.map(()=>0);
    open.forEach(x=>{const n=Math.max(0,dayDiff(x.date,as)),i=BUCKETS.findIndex(k=>n>=k[1]&&n<=k[2]);b[i]=R2(b[i]+x.amt)});
    const docs=R2(b.reduce((a,x)=>a+x,0)),bal=R2(p.balance||0),unalloc=R2(bal-docs);   /* ما لا تفسّره المستندات: رصيد افتتاحي، أو دفعة زائدة (سالب) */
    if(docs||Math.abs(unalloc)>0.004)rows.push({id:p.id,name:p.name,buckets:b,docs,unallocated:unalloc,balance:bal,invoices:open.map(x=>({no:x.no,date:x.date,amount:x.amt}))})});
  const tot=BUCKETS.map((_,i)=>R2(rows.reduce((a,r)=>a+r.buckets[i],0)));
  return{asOf:as,labels:BUCKETS.map(x=>x[0]),rows,totals:tot,docsTotal:R2(tot.reduce((a,x)=>a+x,0)),unallocatedTotal:R2(rows.reduce((a,r)=>a+r.unallocated,0)),balanceTotal:R2(rows.reduce((a,r)=>a+r.balance,0))}}

/* ===== القيود اليدوية ===== */
const lockDate=()=>(D().settings||{}).lockDate||'';
function jeCreate(date,memo,lines){const d=ensure();
  if(!isAdm()&&!canf('expenses'))return{err:'ليست لديك صلاحية القيود'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return{err:'اختر التاريخ'};
  if(lockDate()&&date<=lockDate())return{err:'التاريخ يقع في فترة مقفلة حتى '+lockDate()};
  const by=byId(),L=(lines||[]).map(l=>({a:l.a,d:R2(N(l.d)),c:R2(N(l.c))})).filter(l=>l.a&&(l.d>0||l.c>0));
  if(L.length<2)return{err:'يلزم سطران على الأقل'};
  for(const l of L){if(!by[l.a]||by[l.a].active===false)return{err:'حساب غير صالح'};if(l.d>0&&l.c>0)return{err:'السطر الواحد إما مدين أو دائن'};if(l.d<0||l.c<0)return{err:'مبلغ سالب'}}
  const dd=sm(L,l=>l.d),cc=sm(L,l=>l.c);if(Math.abs(dd-cc)>0.004)return{err:'القيد غير متوازن (الفرق '+R2(dd-cc)+')'};
  const j={id:uidf(),no:'JV-'+tdy().replace(/-/g,'').slice(2)+'-'+uidf().slice(-4).toUpperCase(),date,memo:String(memo||'').trim(),lines:L,by:usr(),at:new Date().toISOString()};
  d.journals.push(j);audit('journal_add',j.no,'مدين '+dd,{a:{date,memo:j.memo,total:dd,lines:L.length}});return{ok:j}}
function jeReverse(id,reason){const d=ensure(),j=d.journals.find(x=>x.id===id);if(!j)return{err:'القيد غير موجود'};
  if(!isAdm())return{err:'للمدير فقط'};if(j.revBy)return{err:'القيد معكوس مسبقًا'};if(j.revOf)return{err:'لا يُعكس قيد عكسي'};
  if(!String(reason||'').trim())return{err:'اكتب سبب العكس'};
  const date=tdy();if(lockDate()&&date<=lockDate())return{err:'تاريخ اليوم داخل فترة مقفلة'};
  const r={id:uidf(),no:'JV-'+date.replace(/-/g,'').slice(2)+'-'+uidf().slice(-4).toUpperCase(),date,memo:'عكس '+j.no+': '+reason,lines:j.lines.map(l=>({a:l.a,d:l.c,c:l.d})),by:usr(),at:new Date().toISOString(),revOf:j.id};
  j.revBy=r.id;d.journals.push(r);audit('journal_reverse',j.no,reason,{b:{no:j.no},a:{no:r.no}});return{ok:r}}

/* ===== التسويات البنكية ===== */
function bankItems(bankId){const acc='bk_'+bankId,items=[];
  entries().list.forEach(e=>e.lines.forEach((l,i)=>{if(l.a!==acc)return;const amt=R2(l.d-l.c);if(!amt)return;items.push({k:e.key+'#'+i+'#'+amt,date:e.date,memo:e.memo,amt})}));return items}
function recState(bankId){const d=ensure(),recs=d.bankRecs.filter(r=>r.bank===bankId).sort((a,b)=>a.at<b.at?-1:1),cleared=new Set();recs.forEach(r=>r.keys.forEach(k=>cleared.add(k)));
  const items=bankItems(bankId),keys=new Set(items.map(i=>i.k)),open=items.filter(i=>!cleared.has(i.k));
  const last=recs[recs.length-1];
  return{open,cleared:items.filter(i=>cleared.has(i.k)),stale:[...cleared].filter(k=>!keys.has(k)),prev:last?last.stmt:0,book:sm(items,i=>i.amt),lastDate:last?last.date:''}}
function recFinalize(bankId,date,stmt,keys){const d=ensure();if(!isAdm()&&!canf('expenses'))return{err:'ليست لديك صلاحية'};
  const b=d.bankAccts.find(x=>x.id===bankId);if(!b)return{err:'حساب بنكي غير موجود'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return{err:'تاريخ الكشف مطلوب'};
  const st=recState(bankId),openKeys=new Map(st.open.map(i=>[i.k,i])),ks=[...new Set(keys||[])];
  if(!ks.length)return{err:'اختر بندًا واحدًا على الأقل'};
  for(const k of ks)if(!openKeys.has(k))return{err:'بند غير متاح للتسوية (سُوّي مسبقًا أو تغيّر)'};
  if(st.lastDate&&date<st.lastDate)return{err:'تاريخ الكشف أقدم من آخر تسوية ('+st.lastDate+')'};
  const S=R2(N(stmt)),expect=R2(st.prev+sm(ks.map(k=>openKeys.get(k)),i=>i.amt)),diff=R2(S-expect);
  if(Math.abs(diff)>0.004)return{err:'الفرق '+diff+': رصيد الكشف لا يطابق الرصيد المسوّى',diff};
  const r={id:uidf(),bank:bankId,date,stmt:S,prev:st.prev,keys:ks,by:usr(),at:new Date().toISOString()};d.bankRecs.push(r);
  audit('bank_rec',b.name,date+' | رصيد '+S+' | '+ks.length+' بند',{a:{stmt:S,items:ks.length}});return{ok:r}}

/* ===== CSV ===== */
const cell=v=>{if(typeof v==='number')return String(R2(v));let s=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const toCSV=(head,rows)=>'\ufeff'+[head].concat(rows).map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';

root.ORVEX_LED={accounts,acctAdd,acctToggle,bankAdd,bankFor,entries,tb,incomeStatement,balanceSheet,totals,cashFlow,aging,jeCreate,jeReverse,bankItems,recState,recFinalize,toCSV,TYPES,BASE};

/* ================= الواجهة ================= */
if(typeof document==='undefined'||!root.modal)return;
const E=s=>esc(s),M=v=>money(v),T=m=>root.toast(m);
const S=root.__led={tab:'tb',from:'',to:'',je:null,rec:null};
const TABS=[['tb','ميزان المراجعة'],['is','الأرباح والخسائر'],['bs','الميزانية'],['je','القيود'],['ac','الحسابات'],['bk','البنوك']];
const tbl=(h,rows,foot)=>`<div class="table-wrap"><table><tr>${h.map(x=>`<th${x[1]?' class="n"':''}>${x[0]}</th>`).join('')}</tr>${rows.join('')}${foot||''}</table></div>`;
const td=(v,n)=>`<td${n?' class="n"':''}>${v}</td>`;
const setBody=h=>{const b=document.getElementById('ledBody');if(b)b.innerHTML=h};
const range=()=>`<div class="f2"><div><label>من</label><input type="date" value="${E(S.from)}" onchange="ledRange(this.value,'')"></div><div><label>إلى</label><input type="date" value="${E(S.to)}" onchange="ledRange('',this.value)"></div></div>`;
root.ledOpen=function(tab){if(!isAdm()&&!canf('reports'))return T('للمدير أو المحاسب فقط');
  S.tab=tab||S.tab||'tb';if(!S.from)S.from=tdy().slice(0,8)+'01';if(!S.to)S.to=tdy();
  root.modal('الدفتر المحاسبي',`<div class="actions no-print" style="flex-wrap:wrap;margin-bottom:8px">${TABS.map(([k,l])=>`<button class="btn ${k===S.tab?'primary':''}" onclick="ledTab('${k}')">${l}</button>`).join('')}</div><div id="ledBody"></div>`);ledTab(S.tab)};
root.ledRange=(f,t)=>{if(f)S.from=f;if(t)S.to=t;ledTab(S.tab)};
root.ledExport=function(){const r=S.rep;if(!r)return;const b=new Blob([toCSV(r.head,r.rows)],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='ORVEX_'+r.name+'_'+tdy()+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)};
const warnBox=w=>w.length?`<p class="note" style="font-size:12.5px">⚠ ${w.slice(0,3).map(E).join(' — ')}</p>`:'';
const VIEW={
 tb(){const rows=tb(S.from,S.to),t=totals(rows),w=entries().warn;S.rep={name:'trial_balance',head:['الرمز','الحساب','مدين','دائن','الرصيد'],rows:rows.map(x=>[x.code,x.name,x.debit,x.credit,x.balance]).concat([['','الإجمالي',t.debit,t.credit,R2(t.debit-t.credit)]])};
  return range()+warnBox(w)+(rows.length?tbl([['الحساب'],['مدين',1],['دائن',1],['الرصيد',1]],rows.map(x=>'<tr>'+td(E(x.code)+' '+E(x.name))+td(M(x.debit),1)+td(M(x.credit),1)+td(M(x.balance),1)+'</tr>'),'<tr><td><b>الإجمالي</b></td>'+td('<b>'+M(t.debit)+'</b>',1)+td('<b>'+M(t.credit)+'</b>',1)+td(t.debit===t.credit?'✓ متوازن':'<b style="color:#b23f2d">غير متوازن</b>',1)+'</tr>'):'<p class="muted">لا حركات في هذه الفترة.</p>')},
 is(){const r=incomeStatement(tb(S.from,S.to));S.rep={name:'income',head:['البند','المبلغ'],rows:r.rev.map(x=>[x.name,x.amount]).concat([['إجمالي الإيرادات',r.revenue]],r.exp.map(x=>[x.name,x.amount]),[['إجمالي المصروفات',r.expense],['صافي الربح / الخسارة',r.net]])};
  const row=(a,b,bold)=>`<div class="row"><div class="grow">${bold?'<b>'+a+'</b>':a}</div><div class="end">${bold?'<b>'+M(b)+'</b>':M(b)}</div></div>`;
  return range()+'<div class="card"><b>الإيرادات</b>'+r.rev.map(x=>row(E(x.name),x.amount)).join('')+row('إجمالي الإيرادات',r.revenue,1)+'<b>المصروفات</b>'+r.exp.map(x=>row(E(x.name),x.amount)).join('')+row('إجمالي المصروفات',r.expense,1)+row(r.net>=0?'صافي الربح':'صافي الخسارة',r.net,1)+'</div>'},
 bs(){const r=balanceSheet(tb('',S.to));S.rep={name:'balance_sheet',head:['البند','المبلغ'],rows:r.assets.map(x=>[x.name,x.amount]).concat([['إجمالي الأصول',r.assetsTotal]],r.liab.map(x=>[x.name,x.amount]),[['إجمالي الالتزامات',r.liabTotal]],r.eq.map(x=>[x.name,x.amount]),[['أرباح الفترة',r.earnings],['الالتزامات + الملكية',R2(r.liabTotal+r.eqTotal+r.earnings)]])};
  const row=(a,b,bold)=>`<div class="row"><div class="grow">${bold?'<b>'+a+'</b>':a}</div><div class="end">${bold?'<b>'+M(b)+'</b>':M(b)}</div></div>`;
  return `<div><label>حتى تاريخ</label><input type="date" value="${E(S.to)}" onchange="ledRange('',this.value)"></div><div class="card"><b>الأصول</b>${r.assets.map(x=>row(E(x.name),x.amount)).join('')}${row('إجمالي الأصول',r.assetsTotal,1)}<b>الالتزامات</b>${r.liab.map(x=>row(E(x.name),x.amount)).join('')}${row('إجمالي الالتزامات',r.liabTotal,1)}<b>حقوق الملكية</b>${r.eq.map(x=>row(E(x.name),x.amount)).join('')}${row('أرباح الفترة',r.earnings)}${row('الالتزامات + الملكية',R2(r.liabTotal+r.eqTotal+r.earnings),1)}<p style="margin:6px 0 0">${r.balanced?'✓ الميزانية متوازنة':'<b style="color:#b23f2d">غير متوازنة — أدخل قيدًا افتتاحيًا (مخزون/صندوق/ذمم) أو راجع التحذيرات</b>'}</p></div>`},
 je(){const d=ensure(),L=d.journals.slice().sort((a,b)=>a.at<b.at?1:-1).slice(0,30);
  return `<div class="actions"><button class="btn primary" onclick="ledJeNew()">+ قيد يدوي</button></div><div class="card">${L.map(j=>`<div class="row"><div class="grow"><div class="t">${E(j.no)}${j.revBy?' <span class="badge bad">معكوس</span>':''}${j.revOf?' <span class="badge">عكسي</span>':''}</div><small>${E(j.date)} — ${E(j.memo||'')} — مدين ${M(j.lines.reduce((a,l)=>a+l.d,0))}</small></div><div class="end">${isAdm()&&!j.revBy&&!j.revOf?`<button class="btn ghost" onclick="ledJeRev('${jsq(j.id)}')">عكس</button>`:''}</div></div>`).join('')||'<p class="muted">لا قيود يدوية.</p>'}</div><p class="muted" style="font-size:12.5px">القيود اليدوية لا تُحذف ولا تُعدَّل؛ التصحيح بقيد عكسي. للأرصدة الافتتاحية سجّل قيدًا بتاريخ بدء العمل.</p>`},
 ac(){const A_=accounts(),d=ensure(),banks=d.bankAccts;
  return `<div class="card">${A_.map(a=>`<div class="row"><div class="grow"><div class="t">${E(a.code)} ${E(a.name)}</div><small>${TYPES[a.type]}${a.active===false?' — موقوف':''}</small></div><div class="end">${a.custom?`<button class="btn ghost" onclick="ledAcTog('${jsq(a.id)}')">${a.active===false?'تفعيل':'إيقاف'}</button>`:''}</div></div>`).join('')}</div>
  <label>حساب جديد</label><div class="f2"><input id="la_c" placeholder="الرمز مثل 5700" inputmode="numeric"><input id="la_n" placeholder="الاسم"></div><select id="la_t">${Object.keys(TYPES).map(k=>`<option value="${k}">${TYPES[k]}</option>`).join('')}</select><div class="actions"><button class="btn primary" onclick="ledAcAdd()">إضافة</button></div>`},
 bk(){const d=ensure();return `<div class="card">${d.bankAccts.map(b=>{const st=recState(b.id);return`<div class="row"><div class="grow"><div class="t">${E(b.name)}</div><small>الدفتري ${M(st.book)} — غير مسوّى ${st.open.length} بند — يستقبل: ${E(b.map.map(x=>x==='card'?'بطاقة':'تحويل').join('، ')||'—')}</small></div><div class="end"><button class="btn" onclick="ledRecOpen('${jsq(b.id)}')">تسوية</button></div></div>`}).join('')||'<p class="muted">لا حسابات بنكية. المدفوعات بالبطاقة/التحويل تذهب لحساب «البنك العام» حتى تضيف حسابًا.</p>'}</div>
  ${isAdm()?`<label>حساب بنكي جديد</label><input id="lb_n" placeholder="اسم البنك / الحساب"><label><input type="checkbox" id="lb_c"> يستقبل مدفوعات البطاقة</label><label><input type="checkbox" id="lb_t"> يستقبل التحويلات</label><div class="actions"><button class="btn primary" onclick="ledBankAdd()">إضافة</button></div>`:''}`}
};
root.ledTab=function(t){S.tab=t;document.querySelectorAll('#modal .actions .btn').forEach((b,i)=>{b.classList.toggle('primary',TABS[i]&&TABS[i][0]===t)});S.rep=null;
  let h;try{h=VIEW[t]()}catch(e){h='<p style="color:#b23f2d">'+E(String(e&&e.message||e))+'</p>'}
  if(S.rep)h='<p style="margin:0 0 6px"><b>'+E((D().settings||{}).name||'ORVEX')+'</b></p>'+h+'<div class="actions no-print"><button class="btn" onclick="ledExport()">⬇ تصدير CSV</button><button class="btn" onclick="window.print()">🖨 طباعة</button></div>';
  setBody(h)};
root.ledAcAdd=()=>{const g=i=>(document.getElementById(i)||{}).value||'',r=acctAdd(g('la_c'),g('la_n'),g('la_t'));if(r.err)return T(r.err);save();ledTab('ac');T('تمت الإضافة')};
root.ledAcTog=id=>{const r=acctToggle(id);if(r.err)return T(r.err);save();ledTab('ac')};
root.ledBankAdd=()=>{const g=i=>document.getElementById(i),m=[];if(g('lb_c')&&g('lb_c').checked)m.push('card');if(g('lb_t')&&g('lb_t').checked)m.push('transfer');const r=bankAdd((g('lb_n')||{}).value,m);if(r.err)return T(r.err);save();ledTab('bk');T('تمت الإضافة')};
root.ledJeRev=id=>{root.modal('عكس قيد','<label>سبب العكس (إلزامي)</label><input id="lj_r"><div class="actions"><button class="btn primary" onclick="ledJeRevOk(\''+jsq(id)+'\')">عكس</button><button class="btn ghost" onclick="ledOpen(\'je\')">رجوع</button></div>')};
root.ledJeRevOk=id=>{const r=jeReverse(id,(document.getElementById('lj_r')||{}).value);if(r.err)return T(r.err);save();ledOpen('je');T('تم العكس')};
root.ledJeNew=()=>{S.je={date:tdy(),memo:'',lines:[{a:'',d:'',c:''},{a:'',d:'',c:''}]};ledJeForm()};
function ledJeForm(){const j=S.je,opts=accounts().filter(a=>a.active!==false).map(a=>`<option value="${E(a.id)}">${E(a.code)} ${E(a.name)}</option>`).join('');
  const dd=sm(j.lines,l=>N(l.d)),cc=sm(j.lines,l=>N(l.c));
  root.modal('قيد يدوي',`<div class="f2"><div><label>التاريخ</label><input type="date" value="${E(j.date)}" oninput="__led.je.date=this.value"></div><div><label>البيان</label><input value="${E(j.memo)}" oninput="__led.je.memo=this.value"></div></div>
  ${j.lines.map((l,i)=>`<div class="f2" style="align-items:end"><select onchange="__led.je.lines[${i}].a=this.value"><option value="">— حساب —</option>${opts.replace('value="'+E(l.a)+'"','value="'+E(l.a)+'" selected')}</select><div class="f2"><input type="number" step="any" placeholder="مدين" value="${E(l.d)}" onchange="__led.je.lines[${i}].d=this.value;ledJeForm()"><input type="number" step="any" placeholder="دائن" value="${E(l.c)}" onchange="__led.je.lines[${i}].c=this.value;ledJeForm()"></div></div>`).join('')}
  <p style="margin:6px 0">مدين <b>${M(dd)}</b> — دائن <b>${M(cc)}</b> — ${Math.abs(dd-cc)<0.004&&dd>0?'<span style="color:#2a7a3b">✓ متوازن</span>':'<b style="color:#b23f2d">الفرق '+M(R2(dd-cc))+'</b>'}</p>
  <div class="actions"><button class="btn" onclick="__led.je.lines.push({a:'',d:'',c:''});ledJeForm()">+ سطر</button><button class="btn primary" onclick="ledJeSave()">حفظ القيد</button><button class="btn ghost" onclick="ledOpen('je')">رجوع</button></div>`)}
root.ledJeForm=ledJeForm;
root.ledJeSave=()=>{const j=S.je,r=jeCreate(j.date,j.memo,j.lines);if(r.err)return T(r.err);save();ledOpen('je');T('تم حفظ القيد '+r.ok.no)};
root.ledRecOpen=id=>{const st=recState(id),b=ensure().bankAccts.find(x=>x.id===id);if(!b)return;S.rec=id;
  root.modal('تسوية — '+b.name,`<p class="muted" style="font-size:12.5px;margin:0 0 6px">الرصيد المسوّى السابق: <b>${M(st.prev)}</b>${st.stale.length?' — <b style="color:#b23f2d">'+st.stale.length+' بند مسوّى تغيّر لاحقًا، راجعه</b>':''}</p>
  <div class="card">${st.open.map((i,x)=>`<label class="row" style="cursor:pointer"><input type="checkbox" class="lr_k" value="${E(i.k)}" data-a="${i.amt}" onchange="ledRecCalc('${jsq(id)}')"><span class="grow">${E(i.date)} — ${E(i.memo)}</span><b>${M(i.amt)}</b></label>`).join('')||'<p class="muted">لا بنود بانتظار التسوية.</p>'}</div>
  <div class="f2"><div><label>تاريخ الكشف</label><input id="lr_d" type="date" value="${tdy()}"></div><div><label>الرصيد الختامي في الكشف</label><input id="lr_s" type="number" step="any" oninput="ledRecCalc('${jsq(id)}')"></div></div>
  <p id="lr_diff" style="margin:6px 0"></p><div class="actions"><button class="btn primary" onclick="ledRecOk('${jsq(id)}')">اعتماد التسوية</button><button class="btn ghost" onclick="ledOpen('bk')">رجوع</button></div>`);ledRecCalc(id)};
root.ledRecCalc=id=>{const st=recState(id),ks=[...document.querySelectorAll('.lr_k:checked')],sum=R2(ks.reduce((a,k)=>a+N(k.dataset.a),0)),s=N((document.getElementById('lr_s')||{}).value),diff=R2(s-(st.prev+sum)),e=document.getElementById('lr_diff');
  if(e)e.innerHTML='المحدد '+M(sum)+' — الفرق: '+(Math.abs(diff)<0.004&&ks.length?'<b style="color:#2a7a3b">0 ✓</b>':'<b style="color:#b23f2d">'+M(diff)+'</b>')};
root.ledRecOk=id=>{const g=i=>(document.getElementById(i)||{}).value,ks=[...document.querySelectorAll('.lr_k:checked')].map(k=>k.value),r=recFinalize(id,g('lr_d'),g('lr_s'),ks);if(r.err)return T(r.err);save();ledOpen('bk');T('تم اعتماد التسوية')};
})(typeof window!=='undefined'?window:globalThis);
