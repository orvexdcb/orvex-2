/* ORVEX — شاشات المحاسبة (للمدير): ميزان المراجعة، قائمة الدخل والميزانية من الدفتر، قيد يدوي، الحسابات، إقفال الفترات.
   تعتمد على migrations/006 وعلى جسر window.__orvexAcct في server.js. لا تغيّر أي بيانات في التطبيق نفسه.
   القوائم تُحسب من ميزان المراجعة (trial_balance) فهي متوازنة دائمًا إن كان الدفتر متوازنًا. */
(function(root){
  'use strict';
  const r2=n=>{n=+n;if(!isFinite(n))return 0;const s=n<0?-1:1;return s*Math.round(Math.abs(n)*100*(1+4*Number.EPSILON))/100};
  const num0=v=>{const n=parseFloat(String(v==null?'':v).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)));return isNaN(n)?0:n};
  const sum=(a,f)=>r2(a.reduce((s,x)=>s+f(x),0));
  const bal=x=>num0(x.balance);

  /* tb: صفوف trial_balance لفترة؛ للميزانية تُمرَّر صفوف تراكمية حتى تاريخ الميزانية */
  function incomeStatement(tb){
    const rev=tb.filter(x=>x.type==='revenue'&&(bal(x)!==0)).map(x=>({code:x.code,name:x.name,amount:r2(-bal(x))}));
    const exp=tb.filter(x=>x.type==='expense'&&(bal(x)!==0)).map(x=>({code:x.code,name:x.name,amount:r2(bal(x))}));
    const revenue=sum(rev,x=>x.amount),expense=sum(exp,x=>x.amount);
    return{rev,exp,revenue,expense,net:r2(revenue-expense)};
  }
  function balanceSheet(tb){
    const side=(t,sign)=>tb.filter(x=>x.type===t&&bal(x)!==0).map(x=>({code:x.code,name:x.name,amount:r2(sign*bal(x))}));
    const assets=side('asset',1),liab=side('liability',-1),eq=side('equity',-1),is=incomeStatement(tb);
    const A=sum(assets,x=>x.amount),Lb=sum(liab,x=>x.amount),E=sum(eq,x=>x.amount);
    return{assets,liab,eq,assetsTotal:A,liabTotal:Lb,eqTotal:E,earnings:is.net,equityWithEarnings:r2(E+is.net),balanced:Math.abs(A-(Lb+E+is.net))<0.01};
  }
  function jeDiff(lines){const d=sum(lines,l=>num0(l.d)),c=sum(lines,l=>num0(l.c));return{debit:d,credit:c,diff:r2(d-c)}}
  function jeValid(je){
    const used=je.lines.filter(l=>l.a&&(num0(l.d)>0||num0(l.c)>0));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(je.date||''))return'اختر التاريخ';
    if(used.length<2)return'يلزم سطران على الأقل';
    if(used.some(l=>num0(l.d)>0&&num0(l.c)>0))return'السطر الواحد إما مدين أو دائن';
    if(Math.abs(jeDiff(used).diff)>0.004)return'القيد غير متوازن';
    return'';
  }
  function monthEnd(m){const [y,mo]=m.split('-').map(Number);return m+'-'+String(new Date(y,mo,0).getDate()).padStart(2,'0')}
  /* CSV بترميز UTF-8 مع BOM ليفتحه Excel بالعربية. الخلايا النصية التي تبدأ بـ = + - @ تُحيَّد لمنع حقن الصيغ. */
  function csvCell(v){
    if(typeof v==='number')return String(r2(v));
    let s=String(v==null?'':v);
    if(/^[=+\-@\t\r]/.test(s))s="'"+s;
    return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }
  function toCSV(head,rows){return '\ufeff'+[head].concat(rows).map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'}
  const api={incomeStatement,balanceSheet,jeDiff,jeValid,monthEnd,toCSV,csvCell};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

  /* ========= واجهة ========= */
  const B=()=>root.__orvexAcct;
  /* const/let العامة في التطبيق (esc, money, today, isAdmin, curUser) ليست على window؛ نصل إليها بـ typeof */
  const E=s=>typeof esc!=='undefined'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const M=v=>typeof money!=='undefined'?money(v):String(v);
  const isAdm=()=>typeof isAdmin!=='undefined'&&!!isAdmin();
  const who=()=>typeof curUser!=='undefined'?((curUser()||{}).name||''):'';
  const tdy=()=>typeof today!=='undefined'?today():new Date().toISOString().slice(0,10);
  const TABS=[['tb','ميزان المراجعة'],['is','قائمة الدخل'],['bs','الميزانية'],['je','قيد يدوي'],['ac','الحسابات'],['pr','الفترات']];
  const TYPES={asset:'أصول',liability:'التزامات',equity:'حقوق ملكية',revenue:'إيرادات',expense:'مصروفات'};
  const st=root.__ac={tab:'tb',from:'',to:'',cache:null,je:null};
  const fail=e=>{const m=String(e&&e.message||e);
    return /Could not find the function|PGRST202|relation .* does not exist|42P01/i.test(m)?'قاعدة Supabase تحتاج ترحيل المحاسبة 006 وتشغيل seed_default_accounts أولًا.':
      /ORVEX_PERIOD_CLOSED/.test(m)?'التاريخ يقع في فترة مغلقة.':/ORVEX_ENTRY_UNBALANCED/.test(m)?'القيد غير متوازن.':/row-level security|42501|permission denied/i.test(m)?'ليست لديك صلاحية (للمدير فقط).':m};
  const body=h=>{const b=document.getElementById('acBody');if(b)b.innerHTML=h};
  const tbl=(head,rows,foot)=>`<div class="table-wrap"><table><tr>${head.map(h=>`<th${h[1]?' class="n"':''}>${h[0]}</th>`).join('')}</tr>${rows.join('')}${foot||''}</table></div>`;
  const td=(v,n)=>`<td${n?' class="n"':''}>${v}</td>`;
  async function tbRows(from,to){const b=B();return b.rpc('trial_balance',{p_shop:b.shop(),p_from:from,p_to:to})}

  root.acOpen=function(tab){
    if(!isAdm())return root.toast('للمدير فقط');
    if(!B()||!B().ok())return root.toast('تتطلب المحاسبة تسجيل الدخول السحابي');
    st.tab=tab||st.tab||'tb';if(!st.from)st.from=tdy().slice(0,8)+'01';if(!st.to)st.to=tdy();
    root.modal('المحاسبة',`<div class="actions no-print" style="flex-wrap:wrap;margin-bottom:8px">${TABS.map(([k,l])=>`<button class="btn ${k===st.tab?'primary':''}" onclick="acTab('${k}')">${l}</button>`).join('')}</div><div id="acBody"></div>`);
    acTab(st.tab);
  };
  root.acTab=async function(t){
    st.tab=t;document.querySelectorAll('#modal .actions .btn').forEach((b,i)=>{b.classList.toggle('primary',TABS[i]&&TABS[i][0]===t)});
    body('<p class="muted">جارٍ التحميل…</p>');
    st.rep=null;
    try{await VIEW[t]()}catch(e){body(`<p style="color:#b23f2d">${E(fail(e))}</p>`);return}
    const b=document.getElementById('acBody');
    if(b&&st.rep&&st.tab===t){
      const nm=(typeof db!=='undefined'&&db.settings&&db.settings.name)||'ORVEX';
      b.insertAdjacentHTML('afterbegin',`<p style="margin:0 0 6px"><b>${E(nm)} — ${E(st.rep.title)}</b> <small>${E(st.rep.range)}</small></p>`);
      b.insertAdjacentHTML('beforeend','<div class="actions no-print"><button class="btn" onclick="acExport()">⬇ تصدير Excel (CSV)</button><button class="btn" onclick="window.print()">🖨 طباعة / PDF</button></div>');
    }
  };
  root.acRange=function(f,t){if(f)st.from=f;if(t)st.to=t;acTab(st.tab)};
  const range=()=>`<div class="f2"><div><label>من</label><input type="date" value="${E(st.from)}" onchange="acRange(this.value,'')"></div><div><label>إلى</label><input type="date" value="${E(st.to)}" onchange="acRange('',this.value)"></div></div>`;
  const row=(a,b,bold)=>`<div class="row"><div class="grow">${bold?'<b>'+a+'</b>':a}</div><div class="end">${bold?'<b>'+M(b)+'</b>':M(b)}</div></div>`;

  const VIEW={
    async tb(){
      const rows=(await tbRows(st.from,st.to)).filter(x=>num0(x.debit)||num0(x.credit));
      const D=sum(rows,x=>num0(x.debit)),C=sum(rows,x=>num0(x.credit));
      st.rep={title:'ميزان المراجعة',range:st.from+' → '+st.to,head:['الرمز','الحساب','مدين','دائن','الرصيد'],rows:rows.map(x=>[x.code,x.name,num0(x.debit),num0(x.credit),num0(x.balance)]).concat([['','الإجمالي',D,C,r2(D-C)]])};
      body(range()+(rows.length?tbl([['الحساب'],['مدين',1],['دائن',1],['الرصيد',1]],rows.map(x=>'<tr>'+td(E(x.code)+' '+E(x.name))+td(M(num0(x.debit)),1)+td(M(num0(x.credit)),1)+td(M(num0(x.balance)),1)+'</tr>'),'<tr><td><b>الإجمالي</b></td>'+td('<b>'+M(D)+'</b>',1)+td('<b>'+M(C)+'</b>',1)+td(D===C?'✓ متوازن':'<b style="color:#b23f2d">غير متوازن</b>',1)+'</tr>'):'<p class="muted">لا حركات في هذه الفترة.</p>'));
    },
    async is(){
      const r=incomeStatement(await tbRows(st.from,st.to));
      st.rep={title:'قائمة الدخل',range:st.from+' → '+st.to,head:['البند','المبلغ'],rows:r.rev.map(x=>[x.name,x.amount]).concat([['إجمالي الإيرادات',r.revenue]],r.exp.map(x=>['− '+x.name,x.amount]),[['إجمالي المصروفات',r.expense],['صافي الربح',r.net]])};
      body(range()+`<div class="card" style="margin-top:8px">${r.rev.map(x=>row(E(x.name),x.amount)).join('')}${row('إجمالي الإيرادات',r.revenue,1)}${r.exp.map(x=>row('− '+E(x.name),x.amount)).join('')}${row('إجمالي المصروفات',r.expense,1)}${row('صافي الربح',r.net,1)}</div><p class="muted" style="font-size:12.5px">من الدفتر المحاسبي (المبالغ قبل الضريبة). تختلف عن «قائمة الدخل» القديمة بوجود مشتريات المخزون والأرصدة الافتتاحية فقط إن سُجّلت.</p>`);
    },
    async bs(){
      const r=balanceSheet(await tbRows('1900-01-01',st.to));
      st.rep={title:'الميزانية',range:'كما في '+st.to,head:['البند','المبلغ'],rows:[['الأصول','']].concat(r.assets.map(x=>[x.name,x.amount]),[['إجمالي الأصول',r.assetsTotal],['الالتزامات','']],r.liab.map(x=>[x.name,x.amount]),[['إجمالي الالتزامات',r.liabTotal],['حقوق الملكية','']],r.eq.map(x=>[x.name,x.amount]),[['أرباح/خسائر الفترات غير المقفلة',r.earnings],['إجمالي حقوق الملكية',r.equityWithEarnings]])};
      const sec=(t,a)=>`<div class="card" style="margin-top:8px"><b>${t}</b>${a.map(x=>row(E(x.name),x.amount)).join('')}</div>`;
      body(`<div class="f2"><div><label>كما في تاريخ</label><input type="date" value="${E(st.to)}" onchange="acRange('',this.value)"></div></div>`+sec('الأصول',r.assets)+row('إجمالي الأصول',r.assetsTotal,1)+sec('الالتزامات',r.liab)+row('إجمالي الالتزامات',r.liabTotal,1)+sec('حقوق الملكية',r.eq.concat([{name:'أرباح/خسائر الفترات غير المقفلة',amount:r.earnings}]))+row('إجمالي حقوق الملكية',r.equityWithEarnings,1)+`<p style="margin-top:8px">${r.balanced?'✓ الأصول = الالتزامات + حقوق الملكية':'<b style="color:#b23f2d">الميزانية غير متوازنة — راجع القيود</b>'}</p>`);
    },
    async je(){
      if(!st.cache||!st.cache.accounts)st.cache={accounts:(await B().accounts()).filter(a=>a.is_active!==false)};
      if(!st.je)st.je={date:tdy(),memo:'',lines:[{a:'',d:'',c:''},{a:'',d:'',c:''}]};
      jeDraw();
    },
    async ac(){
      const acc=await B().accounts();st.cache={accounts:acc};
      body(`<div class="card">${tbl([['الرمز'],['الاسم'],['النوع']],acc.map(a=>'<tr>'+td(E(a.code))+td(E(a.name)+(a.is_active===false?' (موقوف)':''))+td(TYPES[a.type]||E(a.type))+'</tr>'))}</div>
      <h3 style="margin:12px 0 4px">إضافة حساب</h3><div class="f2"><div><label>الرمز</label><input id="acCode" inputmode="numeric"></div><div><label>الاسم</label><input id="acName"></div></div>
      <label>النوع</label><select id="acType">${Object.keys(TYPES).map(k=>`<option value="${k}">${TYPES[k]}</option>`).join('')}</select>
      <div class="actions"><button class="btn primary" onclick="acAddAccount()">إضافة</button></div><p class="muted" style="font-size:12.5px">الحسابات لا تُحذف؛ يمكن إيقافها فقط. حسابات النظام (الصندوق، المبيعات…) مرتبطة بالترحيل التلقائي.</p>`);
    },
    async pr(){
      const b=B(),ps=await b.get('periods?shop_id=eq.'+b.shop()+'&select=id,start_date,end_date,status&order=start_date.desc');
      body(`<div class="card">${ps.length?tbl([['الفترة'],['الحالة']],ps.map(p=>'<tr>'+td(E(p.start_date)+' → '+E(p.end_date))+td(p.status==='closed'?'🔒 مغلقة':'مفتوحة')+'</tr>')):'<p class="muted">لا فترات مسجلة (كل التواريخ مفتوحة).</p>'}</div>
      <h3 style="margin:12px 0 4px">إقفال شهر</h3><input type="month" id="prM" value="${E(tdy().slice(0,7))}">
      <div class="actions"><button class="btn danger" onclick="acClosePeriod()">إقفال الشهر</button></div>
      <p class="muted" style="font-size:12.5px">بعد الإقفال لا تُقبل قيود بتواريخ هذا الشهر ولا يمكن إعادة فتحه. صحّح الأخطاء قبل الإقفال.</p>`);
    }
  };
  function jeDraw(){
    const je=st.je,acc=st.cache.accounts,d=jeDiff(je.lines);
    body(`<div class="f2"><div><label>التاريخ</label><input type="date" value="${E(je.date)}" oninput="__ac.je.date=this.value;acJeRefresh()"></div><div><label>البيان</label><input value="${E(je.memo)}" oninput="__ac.je.memo=this.value"></div></div>
    ${je.lines.map((l,i)=>`<div class="f2" style="align-items:end"><div><label>الحساب</label><select onchange="__ac.je.lines[${i}].a=this.value;acJeRefresh()"><option value="">—</option>${acc.map(a=>`<option value="${E(a.id)}" ${l.a===a.id?'selected':''}>${E(a.code)} ${E(a.name)}</option>`).join('')}</select></div>
    <div style="display:flex;gap:6px"><input type="number" inputmode="decimal" placeholder="مدين" value="${E(l.d)}" oninput="__ac.je.lines[${i}].d=this.value;acJeRefresh()"><input type="number" inputmode="decimal" placeholder="دائن" value="${E(l.c)}" oninput="__ac.je.lines[${i}].c=this.value;acJeRefresh()"></div></div>`).join('')}
    <div class="actions"><button class="btn" onclick="__ac.je.lines.push({a:'',d:'',c:''});acTab('je')">+ سطر</button></div>
    <div id="jeInfo" class="card" style="margin-top:8px"></div>
    <div class="actions"><button class="btn primary" id="jePost" onclick="acPostJe()">ترحيل القيد</button></div>
    <p class="muted" style="font-size:12.5px">القيد لا يُعدَّل ولا يُحذف بعد الترحيل؛ التصحيح بقيد عكسي. استخدم هذه الشاشة للأرصدة الافتتاحية والتسويات.</p>`);
    acJeRefresh();
  }
  root.acExport=async function(){
    const r=st.rep;if(!r)return root.toast('لا يوجد تقرير للتصدير');
    const name='ORVEX_'+r.title.replace(/\s+/g,'_')+'_'+r.range.replace(/[^\d\-]+/g,'_').replace(/^_+|_+$/g,'')+'.csv',text=toCSV(r.head,r.rows);
    try{
      const f=new File([text],name,{type:'text/csv'});
      if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return}
    }catch(e){if(e&&e.name==='AbortError')return}
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);root.toast('تم تنزيل '+name);
  };
  root.acJeRefresh=function(){
    const je=st.je,d=jeDiff(je.lines),e=jeValid(je),i=document.getElementById('jeInfo'),b=document.getElementById('jePost');
    if(i)i.innerHTML=row('إجمالي المدين',d.debit)+row('إجمالي الدائن',d.credit)+row('الفرق',d.diff,1)+(e?`<small style="color:#b23f2d">${E(e)}</small>`:'<small>✓ جاهز للترحيل</small>');
    if(b)b.disabled=!!e;
  };
  root.acPostJe=async function(){
    const je=st.je,e=jeValid(je);if(e)return root.toast(e);
    const lines=je.lines.filter(l=>l.a&&(num0(l.d)>0||num0(l.c)>0)).map(l=>({account_id:l.a,debit:r2(num0(l.d)),credit:r2(num0(l.c))}));
    const id='man-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),b=B();
    try{
      const r=await b.rpc('post_journal_entry',{p_shop:b.shop(),p_entry:{id,entry_date:je.date,memo:je.memo||'قيد يدوي',source:'manual',source_ref:null,created_by:who(),lines}});
      if(r!=='posted')throw new Error('unexpected:'+r);
      st.je=null;root.toast('تم ترحيل القيد');acTab('tb');
    }catch(x){root.toast(fail(x))}
  };
  root.acAddAccount=async function(){
    const code=(document.getElementById('acCode').value||'').trim(),name=(document.getElementById('acName').value||'').trim(),type=document.getElementById('acType').value,b=B();
    if(!code||!name)return root.toast('أدخل الرمز والاسم');
    try{await b.post('accounts',{shop_id:b.shop(),id:'a'+code,code,name,type});st.cache=null;root.toast('تمت الإضافة');acTab('ac')}
    catch(x){root.toast(/23505|duplicate/i.test(String(x&&x.message))?'الرمز مستخدم من قبل':fail(x))}
  };
  root.acClosePeriod=async function(){
    const m=(document.getElementById('prM').value||'').trim();if(!/^\d{4}-\d{2}$/.test(m))return root.toast('اختر الشهر');
    if(!confirm('إقفال '+m+' نهائيًا؟ لا يمكن إعادة فتحه ولن تُقبل قيود بتواريخه.'))return;
    const b=B(),id='p-'+m;
    try{
      try{await b.post('periods',{shop_id:b.shop(),id,start_date:m+'-01',end_date:monthEnd(m),status:'open'})}catch(x){if(!/23505|duplicate/i.test(String(x&&x.message)))throw x}
      await b.patch('periods?shop_id=eq.'+b.shop()+'&id=eq.'+encodeURIComponent(id),{status:'closed',closed_by:who()});
      root.toast('تم إقفال '+m);acTab('pr');
    }catch(x){root.toast(fail(x))}
  };
  if(typeof vParties==='function'){const _v=vParties;vParties=function(){return _v()+(isAdm()?'<div class="actions"><button class="btn" onclick="acOpen()">📚 المحاسبة</button></div>':'')}}
})(typeof window!=='undefined'?window:globalThis);
