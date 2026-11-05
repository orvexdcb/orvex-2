/* ORVEX — دمج ثلاثي للتعديلات المتزامنة (إضافي، معطّل افتراضيًا).
   المشكلة: الصفوف العامة تُرفع بـ upsert يستبدل الصف كله، فيمحو تعديل جهاز تعديلَ جهاز آخر على حقل مختلف من الصف نفسه.
   الحل هنا: قبل الرفع نجلب نسخة الخادم للصفوف المعدّلة محليًا ونقارنها بالنسخة الأساسية المحفوظة (last[t][id]):
     - الخادم لم يتغيّر عن الأساس → نرفع المحلي كما هو.
     - تغيّر الخادم → دمج على مستوى الحقول: حقل عدّله جهاز واحد فقط يؤخذ تعديله؛ حقل عدّله الاثنان بقيمتين مختلفتين يُسجَّل تعارضًا
       ويفوز المحلي (نفس السلوك الحالي) مع حفظ القيمة البعيدة في سجل التعارضات.
   حدود معروفة: (1) فجوة صغيرة بين الجلب والرفع تبقى لأن الخادم لا يفحص إصدار الصف؛ الإغلاق الكامل يتطلب شرط إصدار في الخادم (RPC).
   (2) المصفوفات تُعامل كقيمة واحدة (لا دمج عناصر). (3) المنتجات والعملاء لهم مسار فروق للمخزون/الرصيد ولا يغيّره هذا الملف.
   التفعيل: مفعّل افتراضيًا منذ المرحلة 6 (orvexSyncMerge.disable() يوقفه على الجهاز) — السجل: orvexSyncMerge.conflicts() — المراجعة: orvexSyncQ.openConflicts() */
(function(root){
  'use strict';
  const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const eq=(a,b)=>{
    if(a===b)return true;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>eq(x,b[i]));
    if(isObj(a)&&isObj(b)){const ka=Object.keys(a).filter(k=>a[k]!==undefined),kb=Object.keys(b).filter(k=>b[k]!==undefined);return ka.length===kb.length&&ka.every(k=>eq(a[k],b[k]))}
    return false;
  };
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  /* base/local/remote: كائنات الصف. يعيد {merged, conflicts:[{path,local,remote}]} */
  function threeWay(base,local,remote,path){
    path=path||'';const conflicts=[];
    if(!isObj(local)||!isObj(remote)||!isObj(base)){
      /* قيم غير كائنية: القاعدة نفسها على مستوى القيمة */
      if(eq(local,base))return{merged:clone(remote),conflicts};
      if(eq(remote,base)||eq(local,remote))return{merged:clone(local),conflicts};
      return{merged:clone(local),conflicts:[{path:path||'(root)',local:clone(local),remote:clone(remote)}]};
    }
    const out={},keys=new Set([].concat(Object.keys(base),Object.keys(local),Object.keys(remote)));
    keys.forEach(k=>{
      const b=base[k],l=local[k],r=remote[k],p=path?path+'.'+k:k;
      let v;
      if(eq(l,b))v=r;                       /* لم نعدّله محليًا: نأخذ ما عند الخادم */
      else if(eq(r,b)||eq(l,r))v=l;         /* الخادم لم يتغيّر أو تطابقا */
      else if(isObj(l)&&isObj(r)&&isObj(b)){const s=threeWay(b,l,r,p);v=s.merged;s.conflicts.forEach(c=>conflicts.push(c))}
      else{v=l;conflicts.push({path:p,local:clone(l),remote:clone(r)})}
      if(v!==undefined)out[k]=clone(v);
    });
    return{merged:out,conflicts};
  }
  /* يحوّل دفعة صفوف (لقطات) إلى صفوف مدموجة قبل الرفع.
     opts: {t, shop, m (جدول رئيسي؟), tb, rows (لقطات الصفوف المعدّلة), L (last[t]), cur (الصفوف الحية), fetch(path)->rows[{id,data}], now()} */
  async function prepare(o){
    const ids=o.rows.map(r=>r.id).filter(id=>o.L[id]!==undefined);   /* صفوف سبق مزامنتها فقط؛ الجديدة لا تعارض */
    if(!ids.length)return o.rows;
    const q='/rest/v1/'+o.tb+'?shop_id=eq.'+o.shop+(o.m?'':'&kind=eq.'+o.t)+'&id=in.('+ids.map(x=>'"'+String(x).replace(/"/g,'')+'"').join(',')+')&select=id,data';
    const remote=Object.fromEntries((await o.fetch(q)).map(x=>[x.id,x.data]));
    const log=[],out=o.rows.map(r=>{
      if(o.L[r.id]===undefined)return r;
      let base;try{base=JSON.parse(o.L[r.id])}catch(e){return r}
      const rem=remote[r.id];
      if(rem===undefined){log.push({t:o.t,id:r.id,kind:'remote_deleted'});return r}   /* حُذف عن جهاز آخر: السلوك الحالي يعيد إنشاءه؛ نسجّل فقط */
      if(eq(rem,base))return r;
      if(eq(rem,r))return r;                                                        /* الخادم يطابق المحلي أصلًا */
      const s=threeWay(base,r,rem);
      if(s.conflicts.length)log.push({t:o.t,id:r.id,kind:'conflict',fields:s.conflicts});
      else log.push({t:o.t,id:r.id,kind:'merged'});
      /* تحديث الصف الحي إن لم يُعدَّل أثناء المزامنة، ليرى المستخدم النتيجة */
      const live=(o.cur||[]).find(x=>x.id===r.id);
      if(live&&JSON.stringify(live)===JSON.stringify(r)){Object.keys(live).forEach(k=>{if(!(k in s.merged))delete live[k]});Object.assign(live,clone(s.merged))}
      return s.merged;
    });
    if(log.length&&o.onLog)o.onLog(log);
    return out;
  }
  /* مراجعة تعارض: يطبّق قرار المستخدم على الصفوف الحية. keepMine: لا تغيير. useTheirs: يكتب قيمة الجهاز الآخر في الحقول المتعارضة.
     deleteLocal: يحذف الصف الذي حُذف عن جهاز آخر. يعيد {ok,changed,err} */
  function setPath(o,path,v){const ks=String(path).split('.');let c=o;for(let i=0;i<ks.length-1;i++){if(!isObj(c[ks[i]]))c[ks[i]]={};c=c[ks[i]]}const k=ks[ks.length-1];if(v===undefined)delete c[k];else c[k]=clone(v)}
  function resolveEntry(entry,rows,action){
    if(!entry)return{ok:false,err:'السجل غير موجود'};
    if(action==='keepMine')return{ok:true,changed:false};
    const i=(rows||[]).findIndex(r=>r&&r.id===entry.id);
    if(action==='deleteLocal'){if(entry.kind!=='remote_deleted')return{ok:false,err:'الإجراء لا يناسب هذا النوع'};if(i<0)return{ok:true,changed:false};rows.splice(i,1);return{ok:true,changed:true}}
    if(action==='useTheirs'){
      if(entry.kind!=='conflict')return{ok:false,err:'الإجراء لا يناسب هذا النوع'};
      if(i<0)return{ok:false,err:'السجل لم يعد موجودًا على هذا الجهاز'};
      (entry.fields||[]).forEach(f=>setPath(rows[i],f.path,f.remote));return{ok:true,changed:true};
    }
    return{ok:false,err:'إجراء غير معروف'};
  }
  const api={eq,threeWay,prepare,resolveEntry,setPath};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

  /* ========= طبقة المتصفح ========= */
  const FK=()=>(typeof KEY!=='undefined'?KEY:'sales_system_v1')+'_mergeOn',LK=()=>(typeof KEY!=='undefined'?KEY:'sales_system_v1')+'_conflicts';
  const on=()=>{try{return localStorage.getItem(FK())!=='0'}catch(e){return true}};   /* مفعّل افتراضيًا؛ أي فشل داخلي يعيد الدفعة كما هي (hook) */
  const read=()=>{try{return JSON.parse(localStorage.getItem(LK())||'[]')}catch(e){return[]}};
  const dev=()=>{try{return(typeof SB!=='undefined'&&SB.deviceId)||''}catch(e){return''}};
  function record(entries){
    const at=new Date().toISOString(),all=read().concat(entries.map(e=>Object.assign({at,device:dev(),rid:Math.random().toString(36).slice(2,10)+Date.now().toString(36),resolved:false},e))).slice(-200);
    try{localStorage.setItem(LK(),JSON.stringify(all))}catch(e){}
    const c=entries.filter(e=>e.kind==='conflict').length,m=entries.filter(e=>e.kind==='merged').length;
    if(typeof toast==='function'){
      if(c)toast('تعارض تعديل على '+c+' سجل: فاز تعديلك المحلي وحُفظت القيمة الأخرى. افتح حالة المزامنة لمراجعتها');
      else if(m)toast('تم دمج تعديلات من جهاز آخر في '+m+' سجل');
    }
  }
  root.orvexSyncMerge=Object.assign({},api,{
    on,enable(){try{localStorage.setItem(FK(),'1')}catch(e){}},disable(){try{localStorage.setItem(FK(),'0')}catch(e){}},
    conflicts:read,clear(){try{localStorage.removeItem(LK())}catch(e){}},
    /* تعارضات تنتظر قرار المستخدم (الدمج الناجح بلا تعارض إعلامي فقط) */
    pending(){return read().filter(e=>(e.kind==='conflict'||e.kind==='remote_deleted')&&!e.resolved)},
    resolve(rid,action){
      const all=read(),e=all.find(x=>x.rid===rid);if(!e)return{ok:false,err:'السجل غير موجود'};
      const rows=typeof db!=='undefined'&&db&&db[e.t];const r=resolveEntry(e,rows||[],action);
      if(!r.ok)return r;
      e.resolved=true;e.action=action;e.resolvedAt=new Date().toISOString();
      try{localStorage.setItem(LK(),JSON.stringify(all))}catch(_){}
      if(r.changed&&typeof save==='function')save();   /* يرفع القرار عبر المسار العادي */
      return r;
    },
    /* تُستدعى من server.js قبل رفع دفعة؛ أي فشل يعيد الدفعة كما هي (السلوك القديم) */
    async hook(t,m,tb,rows,L,cur,sid,fetchFn){
      if(!on())return rows;
      try{return await prepare({t,m,tb,shop:sid,rows,L,cur,fetch:fetchFn,onLog:record})}catch(e){return rows}
    }
  });
})(typeof window!=='undefined'?window:globalThis);
