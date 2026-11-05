/* ORVEX — عروض الأسعار وتحويلها إلى فواتير + حفظ الفواتير المعلّقة على الجهاز.
   * العرض لا يمسّ المخزون ولا الحسابات ولا الأرصدة؛ يُنشأ فاتورة فقط عند التحويل (يمرّ بالمسار العادي: فحص المخزون، حد الائتمان، الضريبة الحالية).
   * سعر العرض المتفق عليه يُحفظ في السطور ويُحمَّل كما هو عند التحويل، أما الضريبة فتُحسب بإعداد الضريبة وقت الفاتورة.
   * ترقيم العروض QT-<رمز الجهاز>-<عدد> فريد لكل جهاز (ليس تسلسلًا موحّدًا بين الأجهزة).
   * الفواتير المعلّقة: كانت في الذاكرة فقط وتضيع بتحديث الصفحة؛ تُحفظ الآن في localStorage لهذا الجهاز/المحل. */
(function(){
  'use strict';
  /* ---------- الفواتير المعلّقة: حفظ على الجهاز ---------- */
  const hk=()=>((typeof state!=='undefined'&&state.prevKey)||KEY)+'_held';
  function loadHeld(){try{if(state.held&&state.held.length)return;const a=JSON.parse(localStorage.getItem(hk())||'[]');if(Array.isArray(a))state.held=a.filter(h=>h&&Array.isArray(h.cart)&&h.cart.length&&h.co)}catch(e){}}
  function persistHeld(){try{if(state.held.length)localStorage.setItem(hk(),JSON.stringify(state.held));else localStorage.removeItem(hk())}catch(e){}}
  if(typeof holdInvoice==='function'){const _h=holdInvoice;holdInvoice=function(){const n=state.held.length;const r=_h.apply(this,arguments);if(state.held.length!==n)persistHeld();return r}}
  if(typeof recallHeld==='function'){const _r=recallHeld;recallHeld=function(i){loadHeld();const h=state.held[i];if(h){const before=h.cart.length;h.cart=h.cart.filter(l=>prod(l.pid));if(h.cart.length<before)toast('حُذفت من الفاتورة مواد لم تعد موجودة')}const r=_r.apply(this,arguments);persistHeld();return r}}
  if(typeof heldModal==='function'){const _m=heldModal;heldModal=function(){loadHeld();return _m.apply(this,arguments)}}
  if(typeof openPos==='function'){const _o=openPos;openPos=function(){loadHeld();return _o.apply(this,arguments)}}

  /* ---------- عروض الأسعار ---------- */
  const lineTotal=l=>r2(l.qty*l.price*(1-(l.dp||0)/100));
  const devShort=()=>{try{return(localStorage.getItem(KEY+'_devid')||'').slice(0,3)||'X'}catch(e){return'X'}};
  const qNo=()=>{db.settings.nextQuo=(db.settings.nextQuo||1);return 'QT-'+devShort()+'-'+(db.settings.nextQuo++)};
  const qStatus=q=>q.status==='converted'?'converted':(q.validUntil&&q.validUntil<today()?'expired':'open');
  const SL={open:'ساري',expired:'منتهٍ',converted:'حُوِّل إلى فاتورة'};
  const addDays=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return ymd(x)};

  window.saveQuote=function(){
    if(!state.cart.length)return toast('أضف مواد للفاتورة أولًا');
    const c=state.co.cid?cust(state.co.cid):null;
    modal('حفظ كعرض سعر',`<div class="card"><div class="row"><span class="grow">العميل</span><b>${esc(c?c.name:'بدون عميل')}</b></div><div class="row"><span class="grow">الإجمالي</span><b>${money(calcCart().total)}</b></div></div>
      <label>مدة الصلاحية (أيام)</label><input id="qt_days" type="number" inputmode="numeric" min="1" max="365" value="7">
      <label>ملاحظات تظهر في العرض</label><input id="qt_note" placeholder="مثال: الأسعار شاملة التوصيل">
      <div class="actions"><button class="btn primary" onclick="confirmSaveQuote()">حفظ العرض</button></div>
      <p class="muted" style="font-size:12.5px">العرض لا يخصم من المخزون ولا يسجّل ديونًا؛ يتحوّل إلى فاتورة عند الموافقة عليه.</p>`);
  };
  window.confirmSaveQuote=function(){
    if(!state.cart.length)return toast('الفاتورة فارغة');
    const days=Math.min(365,Math.max(1,parseInt($('#qt_days').value,10)||7)),t=calcCart(),u=curUser();
    const q={id:uid(),no:qNo(),at:new Date().toISOString(),date:today(),validUntil:addDays(today(),days),cid:state.co.cid||'',
      cart:JSON.parse(JSON.stringify(state.cart)),co:{disc:state.co.disc||0,rep:state.co.rep||'',priceType:state.co.priceType||'retail'},
      totals:{sub:t.sub,disc:t.disc,net:t.net,tax:t.tax,total:t.total},note:($('#qt_note').value||'').trim(),status:'open',by:u?u.name:''};
    db.quotes.push(q);save();closeModal();resetInvoice();toast('تم حفظ العرض '+q.no);
  };
  window.quotesModal=function(){
    const L=db.quotes.slice().reverse();
    modal('عروض الأسعار',`<div class="card">${L.length?L.slice(0,60).map(q=>{const c=q.cid?cust(q.cid):null,st=qStatus(q);
      return `<button class="row tap" onclick="quoteDetail('${jsq(q.id)}')"><div class="grow"><div class="t">${esc(q.no)} — ${esc(c?c.name:'بدون عميل')}</div><small>${fdate(q.date)} · ${SL[st]}</small></div><b>${money(q.totals.total)}</b></button>`}).join(''):empty('لا توجد عروض أسعار')}</div>`);
  };
  window.quoteDetail=function(id){
    const q=db.quotes.find(x=>x.id===id);if(!q)return;const c=q.cid?cust(q.cid):null,st=qStatus(q);
    const rows=q.cart.map(l=>{const p=prod(l.pid);return `<div class="row"><div class="grow"><div class="t">${esc(p?p.name:(l.name||'مادة محذوفة'))}</div><small>${l.qty} × ${money(l.price)}${l.dp?' − '+l.dp+'%':''}</small></div><b>${money(lineTotal(l))}</b></div>`}).join('');
    const st2=db.settings;
    modal('عرض سعر '+q.no,`<div id="qtPrint"><div class="card"><div class="row"><span class="grow">${esc(st2.name)}</span><small>${esc(st2.phone||'')}</small></div>
      <div class="row"><span class="grow">العميل</span><b>${esc(c?c.name:'-')}</b></div><div class="row"><span class="grow">التاريخ / الصلاحية حتى</span><span>${fdate(q.date)} / ${fdate(q.validUntil)}</span></div>
      <div class="row"><span class="grow">الحالة</span><b>${SL[st]}${q.saleNo?' ('+esc(q.saleNo)+')':''}</b></div></div>
      <div class="card">${rows}${q.totals.disc>0?`<div class="row"><span class="grow">الخصم</span><span>${money(q.totals.disc)}</span></div>`:''}${q.totals.tax>0?`<div class="row"><span class="grow">الضريبة (تقديرية بإعداد وقت العرض)</span><span>${money(q.totals.tax)}</span></div>`:''}<div class="row"><span class="grow"><b>الإجمالي</b></span><b>${money(q.totals.total)}</b></div></div>${q.note?`<p>${esc(q.note)}</p>`:''}</div>
      <div class="actions no-print">${st==='converted'?'':`<button class="btn primary" onclick="quoteToInvoice('${jsq(q.id)}')">تحويل إلى فاتورة</button>`}<button class="btn" onclick="window.print()">🖨 طباعة / PDF</button>${c&&c.phone?`<button class="btn" onclick="quoteWhats('${jsq(q.id)}')">واتساب</button>`:''}${isAdmin()&&st!=='converted'?`<button class="btn danger" onclick="quoteDelete('${jsq(q.id)}')">حذف</button>`:''}</div>`);
  };
  window.quoteToInvoice=function(id){
    const q=db.quotes.find(x=>x.id===id);if(!q||q.status==='converted')return toast('هذا العرض محوَّل مسبقًا');
    if(qStatus(q)==='expired'&&!confirm('انتهت صلاحية هذا العرض. تحويله إلى فاتورة؟'))return;
    const lines=q.cart.filter(l=>prod(l.pid));
    if(!lines.length)return toast('مواد هذا العرض لم تعد موجودة');
    const missing=q.cart.length-lines.length;
    const doIt=()=>{
      if(state.cart.length)state.held.push({cart:state.cart,co:state.co});
      state.cart=JSON.parse(JSON.stringify(lines));state.co=Object.assign(newCo(),q.co,{cid:q.cid||'',quoteId:q.id});state.sel=-1;state.kp='';
      persistHeld();closeModal();if(typeof posRender==='function')posRender();
      toast('حُمّل العرض '+q.no+' في الفاتورة'+(missing?' (استُبعدت '+missing+' مادة محذوفة)':''));
    };
    if(state.cart.length)askConfirm('الفاتورة الحالية غير فارغة؛ ستُعلَّق وتُحمَّل مواد العرض. متابعة؟',doIt,'تحميل العرض');else doIt();
  };
  window.quoteDelete=function(id){askConfirm('حذف هذا العرض نهائيًا؟',()=>{db.quotes=db.quotes.filter(x=>x.id!==id);save();quotesModal();toast('تم الحذف')},'حذف العرض')};
  window.quoteWhats=function(id){
    const q=db.quotes.find(x=>x.id===id),c=q&&q.cid?cust(q.cid):null;if(!q||!c||!c.phone)return;
    const txt=(db.settings.name+' — عرض سعر '+q.no+'\n'+q.cart.map(l=>{const p=prod(l.pid);return (p?p.name:'مادة')+' × '+l.qty+' = '+money(lineTotal(l))}).join('\n')+'\nالإجمالي: '+money(q.totals.total)+'\nصالح حتى '+fdate(q.validUntil));
    window.open('https://wa.me/'+String(c.phone).replace(/[^\d]/g,'')+'?text='+encodeURIComponent(txt),'_blank');
  };
  /* عند إتمام فاتورة محمّلة من عرض: تُعلَّم المحوَّلة وتُربط برقم الفاتورة */
  if(typeof finalize==='function'){const _f=finalize;finalize=function(){
    const qid=state.co&&state.co.quoteId,n=db.sales.length,r=_f.apply(this,arguments);
    if(qid&&db.sales.length>n){const q=db.quotes.find(x=>x.id===qid),s=db.sales[db.sales.length-1];if(q&&q.status!=='converted'){q.status='converted';q.saleId=s.id;q.saleNo=s.no;q.convertedAt=new Date().toISOString();save()}}
    return r}}
})();
