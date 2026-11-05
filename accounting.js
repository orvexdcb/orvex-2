/* ORVEX — ترحيل محاسبي تلقائي (إضافي، معطّل افتراضيًا).
   يتطلب تطبيق migrations/006_orvex_accounting_core_DRAFT.sql على Supabase وتشغيل seed_default_accounts للمحل.
   المبدأ: القيود تُشتق من بيانات التطبيق نفسها (فواتير، مرتجعات، مشتريات، مصروفات، دفعات) بمعرّفات حتمية،
   فلا تسجيل مزدوج حتى لو رحّل جهازان معًا (الخادم يتجاهل المكرر). لا يعدّل أي بيانات في التطبيق.
   التفعيل: orvexAcct.enable('YYYY-MM-DD') — لا يُرحَّل شيء قبل هذا التاريخ. الإيقاف: orvexAcct.disable().
   قيود معروفة: الأرصدة الافتتاحية (صندوق/مخزون/ذمم) تُدخل يدويًا كقيد افتتاحي؛ لو فُقدت حالة الجهاز المحلية
   (orvexAcct state) ثم عُدّل مستند قديم قبل المزامنة فقد لا يُكتشف التعديل. */
(function(root){
  'use strict';
  const r2=n=>{n=+n;if(!isFinite(n))return 0;const s=n<0?-1:1;return s*Math.round(Math.abs(n)*100*(1+4*Number.EPSILON))/100};
  const hash=str=>{let h=5381;for(let i=0;i<str.length;i++)h=((h<<5)+h+str.charCodeAt(i))|0;return (h>>>0).toString(36)};
  const PAYROLL_CAT='رواتب';

  /* سطر قيد: key = system_key للحساب (يُحوَّل لمعرّف الحساب عند الإرسال) */
  const L=(key,debit,credit)=>({key,debit:r2(debit||0),credit:r2(credit||0)});
  const clean=lines=>lines.filter(l=>l.debit>0||l.credit>0);
  const cashKey=m=>m==='cash'||!m?'cash':'bank';

  function saleLines(s){
    const total=r2(s.total),paid=Math.min(r2(s.paid),total),rem=r2(total-paid),tax=Math.max(0,r2(s.tax||0));
    const rev=r2(total-tax);   /* الإيراد = الإجمالي − الضريبة (يضمن التوازن حتى لو اختلف net عن total في فواتير قديمة) */
    const ls=[L(cashKey(s.method),paid,0),L('ar',rem,0),L('sales',0,rev),L('vat_out',0,tax)];
    const cost=r2(s.cost||0);if(cost>0){ls.push(L('cogs',cost,0),L('inventory',0,cost))}
    return clean(ls);
  }
  function returnLines(r){
    const total=r2(r.total),tax=Math.max(0,r2(total-(r.net==null?total:r2(r.net)))),rev=r2(total-tax);
    const ls=[L('sales_returns',rev,0),L('vat_out',tax,0),r.method==='balance'?L('ar',0,total):L('cash',0,total)];
    const cost=r2(r.cost||0);if(cost>0){ls.push(L('inventory',cost,0),L('cogs',0,cost))}
    return clean(ls);
  }
  function purchaseLines(p){
    const total=r2(p.total),paid=Math.min(r2(p.paid),total),rem=r2(total-paid);
    return clean([L('inventory',total,0),L(cashKey(p.method),0,paid),L('ap',0,rem)]);
  }
  function expenseLines(e){const a=r2(e.amount);return clean([L(e.cat===PAYROLL_CAT?'payroll':'opex',a,0),L('cash',0,a)])}
  function paymentLines(p){const a=r2(p.amount);return p.type==='c'?clean([L('cash',a,0),L('ar',0,a)]):clean([L('ap',a,0),L('cash',0,a)])}

  /* القيود المتوقعة الآن من بيانات db (لكل مستند: مفتاح ثابت + بصمة المحتوى) */
  function expected(db,startDate){
    const out=[],add=(source,doc,date,memo,lines)=>{
      if(!date||date<startDate||!lines.length)return;
      const d=lines.reduce((s,l)=>s+l.debit,0),c=lines.reduce((s,l)=>s+l.credit,0);
      if(Math.abs(d-c)>0.005)return;   /* لا نرحّل قيدًا غير متوازن؛ يظهر في skipped */
      out.push({key:source+':'+doc.id,source,docId:doc.id,date,memo,lines,hash:hash(date+JSON.stringify(lines))});
    };
    const skipped=[];
    const guard=(source,doc,date,memo,lines)=>{
      const d=lines.reduce((s,l)=>s+l.debit,0),c=lines.reduce((s,l)=>s+l.credit,0);
      if(date&&date>=startDate&&Math.abs(d-c)>0.005)skipped.push({source,id:doc.id,reason:'unbalanced',debit:r2(d),credit:r2(c)});
      add(source,doc,date,memo,lines);
    };
    (db.sales||[]).forEach(s=>{if(s.void)return;guard('sale',s,s.date,'فاتورة '+s.no,saleLines(s))});
    (db.returns||[]).forEach(r=>guard('return',r,r.date,'مرتجع '+r.no,returnLines(r)));
    (db.purchases||[]).forEach(p=>guard('purchase',p,p.date,'مشتريات '+p.no,purchaseLines(p)));
    (db.expenses||[]).forEach(e=>guard('expense',e,e.date,'مصروف '+(e.cat||''),expenseLines(e)));
    (db.payments||[]).forEach(p=>guard('payment',p,p.date,p.type==='c'?'تحصيل من عميل':'دفعة لمورد',paymentLines(p)));
    return{entries:out,skipped};
  }

  /* خطة الترحيل: ما يجب ترحيله وما يجب عكسه، بالنسبة للحالة المحلية state.posted = {key:{v,hash,active}} */
  function plan(db,state,startDate,today){
    const {entries,skipped}=expected(db,startDate),seen={},acts=[];
    const eid=(e,v)=>e.source+'-'+e.docId+'-v'+v, ref=(e,v)=>e.docId+'#'+v;
    entries.forEach(e=>{
      seen[e.key]=1;const st=state.posted[e.key];
      if(!st){acts.push({type:'post',key:e.key,v:1,hash:e.hash,entry:mk(e,1)});return}
      if(st.active&&st.hash===e.hash)return;
      if(st.active)acts.push({type:'reverse',key:e.key,v:st.v,id:e.source+'-'+e.docId+'-v'+st.v});
      acts.push({type:'post',key:e.key,v:st.v+1,hash:e.hash,entry:mk(e,st.v+1),after:st.active?'reverse':null});
    });
    Object.keys(state.posted).forEach(k=>{
      const st=state.posted[k];if(seen[k]||!st.active)return;
      acts.push({type:'reverse',key:k,v:st.v,id:k.replace(':','-')+'-v'+st.v,deactivate:true});
    });
    function mk(e,v){return{id:eid(e,v),entry_date:e.date,memo:e.memo,source:e.source,source_ref:ref(e,v),lines:e.lines}}
    return{actions:acts,skipped};
  }

  /* تحويل سطور المفتاح إلى معرّفات حسابات (map: system_key → account id) */
  function toServerEntry(entry,map,by){
    const lines=entry.lines.map(l=>{const id=map[l.key];if(!id)throw new Error('ORVEX_ACCT_MISSING_ACCOUNT:'+l.key);return{account_id:id,debit:l.debit,credit:l.credit}});
    return{id:entry.id,entry_date:entry.entry_date,memo:entry.memo,source:entry.source,source_ref:entry.source_ref,created_by:by||'',lines};
  }

  const api={r2,expected,plan,toServerEntry,saleLines,returnLines,purchaseLines,expenseLines,paymentLines};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

  /* ========= طبقة المتصفح ========= */
  const SK=()=>(typeof KEY!=='undefined'?KEY:'sales_system_v1')+'_acct';
  const load=()=>{try{const s=JSON.parse(localStorage.getItem(SK())||'null');if(s&&s.posted)return s}catch(e){}return{on:false,start:'',posted:{},err:'',last:''}};
  const store=s=>{try{localStorage.setItem(SK(),JSON.stringify(s))}catch(e){}};
  let busy=false,amap=null,amapAt=0;
  const bridge=()=>root.__orvexAcct;
  const tdy=()=>typeof today!=='undefined'?today():new Date().toISOString().slice(0,10);
  const who=()=>typeof curUser!=='undefined'?((curUser()||{}).name||''):'';
  async function accountMap(B){
    if(amap&&Date.now()-amapAt<300000)return amap;
    const rows=await B.accounts(),m={};rows.forEach(a=>{if(a.system_key&&a.is_active!==false)m[a.system_key]=a.id});
    amap=m;amapAt=Date.now();return m;
  }
  async function run(){
    const st=load(),B=bridge();
    if(busy||!st.on||!st.start||!B||!B.ok())return{skipped:true};
    busy=true;
    try{
      const map=await accountMap(B),p=plan((typeof db!=='undefined'?db:{}),st,st.start,tdy()),by=who();
      let done=0,failed=0;st.err='';
      const failedKeys={};
      for(const a of p.actions){
        if(failedKeys[a.key])continue;   /* لا نرحّل نسخة جديدة إذا فشل عكس السابقة */
        try{
          if(a.type==='reverse'){
            const r=await B.rpc('reverse_journal_entry',{p_shop:B.shop(),p_id:a.id,p_new_id:'rev-'+a.id,p_date:tdy(),p_by:by});
            if(r!=='reversed'&&r!=='already_reversed'&&r!=='duplicate')throw new Error('unexpected:'+r);
            const s=st.posted[a.key];if(s){s.active=false}
          }else{
            const r=await B.rpc('post_journal_entry',{p_shop:B.shop(),p_entry:toServerEntry(a.entry,map,by)});
            if(r!=='posted'&&r!=='duplicate')throw new Error('unexpected:'+r);
            st.posted[a.key]={v:a.v,hash:a.hash,active:true};
          }
          done++;
        }catch(e){
          failed++;failedKeys[a.key]=1;const m=String(e&&e.message||e);
          st.err=m;
          if(/Could not find the function|PGRST202/i.test(m)){st.err='تحتاج قاعدة Supabase إلى ترحيل المحاسبة 006 أولًا';break}
          if(/ORVEX_ACCT_MISSING_ACCOUNT/.test(m)){amap=null;break}
          if(/ORVEX_PERIOD_CLOSED/.test(m)){st.err='فترة مغلقة: '+m;continue}
        }
      }
      st.last=new Date().toISOString();store(st);
      return{done,failed,skipped:p.skipped,err:st.err};
    }catch(e){st.err=String(e&&e.message||e);store(st);return{error:st.err}}
    finally{busy=false}
  }
  root.orvexAcct=Object.assign({},api,{
    enable(start){if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))throw new Error('أدخل تاريخ البدء بصيغة YYYY-MM-DD');const s=load();s.on=true;s.start=start;store(s);return run()},
    disable(){const s=load();s.on=false;store(s)},
    status(){const s=load();return{on:s.on,start:s.start,posted:Object.keys(s.posted).length,err:s.err,last:s.last}},
    run
  });
  /* تشغيل دوري هادئ (لا يعمل إلا بعد enable وجلسة سحابية صالحة) */
  setInterval(()=>{run().catch(()=>{})},60000);
})(typeof window!=='undefined'?window:globalThis);
