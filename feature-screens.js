/* ORVEX — شاشات ميزات الأنشطة (المرحلة 7). تُفتح كنوافذ من لوحة المحل: orvexFeat.open('warranty').
   - المنطق في featrecs.js (نقي ومُختبَر)؛ هنا العرض والأحداث فقط.
   - تكتب فقط في db.featRecs ثم save(). لا تلمس المبيعات ولا المخزون ولا الحسابات.
   - الطلبات والتقسيط والضمان… سجلات تشغيلية مستقلة: لا تُنشئ فواتير ولا قيودًا محاسبية (مذكور في الواجهة). */
(function(root){
'use strict';
var L=root.orvexFeatLogic;if(!L||root.orvexFeat)return;

/* globals الخاصة بالتطبيق معرّفة بـ const/let فلا تظهر على window؛ نصل إليها بالاسم مع حراسة */
var G={
 db:function(){return typeof db==='object'?db:null},
 canParties:function(){try{return typeof isAdmin==='function'&&isAdmin()||typeof can==='function'&&can('parties')}catch(e){return false}},
 can:function(){try{return typeof isAdmin==='function'&&isAdmin()||typeof can==='function'&&can('pos')}catch(e){return false}},
 user:function(){try{return typeof curUser==='function'?curUser():null}catch(e){return null}},
 money:function(n){try{return typeof money==='function'?money(n):String(n)}catch(e){return String(n)}},
 today:function(){try{return typeof today==='function'?today():new Date().toISOString().slice(0,10)}catch(e){return new Date().toISOString().slice(0,10)}},
 fdate:function(d){try{return typeof fdate==='function'?fdate(d):d}catch(e){return d}},
 save:function(){try{if(typeof save==='function')save()}catch(e){}},
 state:function(){try{return typeof state==='object'?state:null}catch(e){return null}},
 go:function(v){try{if(typeof go==='function')go(v)}catch(e){}},
 toast:function(m){try{toast(m)}catch(e){}},
 modal:function(t,b){modal(t,b)},setBody:function(h){var el=document.querySelector('#modal .sh-body');if(el)el.innerHTML=h},
 close:function(){try{closeModal()}catch(e){}}
};
var E=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var NATIVE={expiry_alerts:1,barcode_scan:1,serial_tracking:1,batches:1,quotes:1,production_orders:1,bom:1};
var BADGE={new:'#2563eb',working:'#b45309',printing:'#b45309',preparing:'#b45309',ready:'#0e8a43',done:'#475569',delivered:'#0e8a43',paid:'#475569',out:'#b45309',active:'#0e8a43',claim:'#b45309',closed:'#475569',accepted:'#0e8a43',rejected:'#b02a2f',cancel:'#b02a2f',failed:'#b02a2f',draft:'#64748b',sent:'#2563eb',served:'#0e8a43',free:'#0e8a43',busy:'#b02a2f',reserved:'#b45309'};
var S={code:'',view:'list',id:'',q:'',status:'',tab:'',items:[],tableId:'',timer:null};

/* ---------------------------------------------------------------- عرض ---------------------------------------------------------------- */
function badge(label,key){return '<span class="fs-b" style="background:'+(BADGE[key]||'#64748b')+'">'+E(label)+'</span>'}
function stLabel(def,st){var x=(def.statuses||[]).filter(function(s){return s[0]===st})[0];return x?x[1]:st}
function opts(list,sel,blank){return (blank?'<option value="">'+E(blank)+'</option>':'')+list.map(function(o){var v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return '<option value="'+E(v)+'"'+(v===sel?' selected':'')+'>'+E(l)+'</option>'}).join('')}
function productOpts(db,sel){return opts((db.products||[]).filter(function(p){return !p.del}).map(function(p){return[p.id,p.name]}),sel,'— اختر المنتج —')}
function customerOpts(db,sel){return opts((db.customers||[]).filter(function(c){return !c.del}).map(function(c){return[c.id,c.name]}),sel,'— بدون —')}
function nameOf(list,id){var x=(list||[]).filter(function(p){return p.id===id})[0];return x?x.name:''}
function head(title,back){return '<div class="fs-top">'+(back?'<button type="button" class="fs-btn" data-fa="back">رجوع</button>':'')+'<h3>'+E(title)+'</h3></div>'}
function note(t){return '<p class="fs-note">'+E(t)+'</p>'}
var NO_ACC='سجل تشغيلي مستقل: لا يُنشئ فاتورة ولا قيدًا محاسبيًا.';

function fieldHtml(d,v,db){
 var id='fa_'+d.k,lab='<label class="fs-l" for="'+id+'">'+E(d.l)+(d.req?' *':'')+'</label>',val=v==null?'':v;
 if(d.t==='textarea')return lab+'<textarea id="'+id+'" data-k="'+d.k+'" rows="3" maxlength="1000">'+E(val)+'</textarea>';
 if(d.t==='select')return lab+'<select id="'+id+'" data-k="'+d.k+'">'+opts(d.opts,val,'— اختر —')+'</select>';
 if(d.t==='product')return lab+'<select id="'+id+'" data-k="'+d.k+'">'+productOpts(db,val)+'</select>';
 if(d.t==='customer')return lab+'<select id="'+id+'" data-k="'+d.k+'">'+customerOpts(db,val)+'</select>';
 if(d.t==='date')return lab+'<input type="date" id="'+id+'" data-k="'+d.k+'" value="'+E(val)+'">';
 if(d.t==='number')return lab+'<input type="text" inputmode="decimal" id="'+id+'" data-k="'+d.k+'" value="'+E(val)+'" dir="ltr" style="text-align:right">';
 return lab+'<input type="text" id="'+id+'" data-k="'+d.k+'" value="'+E(val)+'" maxlength="200">';
}
/* حقول product/customer تُحفظ معرّفًا ويُشتق الاسم؛ نعرضه في البطاقات */
function cardExtra(code,r,db){
 var f=r.f,o='';
 if(code==='warranty'){var w=L.warrantyState(r,G.today());o+='<div>ينتهي: '+E(w.end?G.fdate(w.end):'—')+' '+badge(w.state==='active'?'ساري':w.state==='expiring'?'يقارب الانتهاء ('+w.days+' يومًا)':'منتهٍ',w.state==='expired'?'cancel':w.state==='expiring'?'claim':'active')+'</div>'}
 if(code==='installments'){var s=L.installState(r,G.today());o+='<div>المدفوع '+E(G.money(s.paid))+' · المتبقي '+E(G.money(s.left))+(s.overdue?' '+badge(s.overdue+' متأخر','cancel'):'')+(s.next?'<br>القسط القادم: '+E(G.fdate(s.next.due))+' ('+E(G.money(s.next.amount))+')':'')+'</div>'}
 if(code==='print_services')o+='<div>الإجمالي: '+E(G.money(L.printTotal(r)))+'</div>';
 (L.F[code].money||[]).forEach(function(k){if(f[k]!=null&&k!=='unit')o+='<div>'+E(labelOf(code,k))+': '+E(G.money(f[k]))+'</div>'});
 if(code==='vehicle_fitment'&&(f.from||f.to))o+='<div>السنوات: '+E((f.from||'…')+' – '+(f.to||'…'))+'</div>';
 return o;
}
function labelOf(code,k){var d=L.F[code].fields.filter(function(x){return x.k===k})[0];return d?d.l:k}
function valueOf(code,r,k,db){
 var d=L.F[code].fields.filter(function(x){return x.k===k})[0],v=r.f[k];
 if(d&&d.t==='product')return nameOf(db.products,v)||'—';if(d&&d.t==='customer')return v?nameOf(db.customers,v)||'—':'';
 return v==null?'':String(v);
}
function listHtml(code,db){
 var def=L.F[code],rows=L.list(db,code,{q:S.q,status:S.status}),cnt=L.counts(db,code);
 var h=head(def.title,false)+note(NO_ACC);
 h+='<div class="fs-row"><button type="button" class="fs-btn pri" data-fa="new">+ جديد</button>'
  +'<input type="search" class="fs-in" id="fa_q" placeholder="بحث…" value="'+E(S.q)+'" aria-label="بحث">'
  +(def.statuses?'<select id="fa_st" class="fs-in" aria-label="الحالة">'+opts(def.statuses.map(function(s){return[s[0],s[1]+' ('+(cnt[s[0]]||0)+')']}),S.status,'كل الحالات')+'</select>':'')+'</div>';
 h+='<div id="fa_list">'+rowsHtml(code,rows,db)+'</div>';return h;
}
function rowsHtml(code,rows,db){
 var def=L.F[code];if(!rows.length)return '<p class="fs-empty">لا توجد سجلات.</p>';
 return rows.map(function(r){
  var main=def.list.map(function(k){return valueOf(code,r,k,db)}).filter(Boolean).join(' · ');
  var acts='<button type="button" class="fs-btn" data-fa="edit" data-id="'+E(r.id)+'">تعديل</button>';
  if(code==='installments')acts='<button type="button" class="fs-btn pri" data-fa="plan" data-id="'+E(r.id)+'">الأقساط</button>'+acts;
  acts+='<button type="button" class="fs-btn danger" data-fa="del" data-id="'+E(r.id)+'">حذف</button>';
  var stBtns=def.statuses&&code!=='installments'?'<div class="fs-sts">'+def.statuses.filter(function(s){return s[0]!==r.status}).map(function(s){return '<button type="button" class="fs-btn sm" data-fa="status" data-id="'+E(r.id)+'" data-v="'+E(s[0])+'">← '+E(s[1])+'</button>'}).join('')+'</div>':'';
  return '<div class="fs-card"><div class="fs-ch"><b>'+E(r.no)+'</b>'+(def.statuses?badge(stLabel(def,r.status),r.status):'')+'<small>'+E(G.fdate(r.date))+'</small></div><div class="fs-main">'+E(main)+'</div>'+cardExtra(code,r,db)+stBtns+'<div class="fs-acts">'+acts+'</div></div>';
 }).join('');
}
function formHtml(code,db,rec){
 var def=L.F[code];
 var h=head((rec?'تعديل ':'جديد: ')+def.title,true);
 h+=def.fields.map(function(d){return fieldHtml(d,rec?rec.f[d.k]:(d.k==='start'?G.today():''),db)}).join('');
 if(code==='installments'&&rec&&(rec.f.plan||[]).some(function(p){return p.paid}))h+=note('توجد أقساط مدفوعة: لن يُعاد توليد الجدول عند التعديل.');
 return h+'<p class="fs-err" id="fa_e" role="alert"></p><div class="fs-acts"><button type="button" class="fs-btn pri" data-fa="save">حفظ</button><button type="button" class="fs-btn" data-fa="back">إلغاء</button></div>';
}
function planHtml(r,db){
 var s=L.installState(r,G.today()),h=head('أقساط '+r.no+' — '+r.f.customerName,true);
 h+='<p class="fs-note">'+E(r.f.item)+' · المدفوع '+E(G.money(s.paid))+' · المتبقي '+E(G.money(s.left))+(r.f.down?' · دفعة أولى '+E(G.money(r.f.down)):'')+'</p>';
 var cu=db&&r.f.customer?L.custOf(db,r.f.customer):null;
 h+=linkNote(r,db,cu,s);
 h+=(r.f.plan||[]).map(function(p){
  var late=!p.paid&&p.due<G.today();
  var link=db&&!p.paid?L.collectCheck(db,r,p.i):null;
  return '<div class="fs-card"><div class="fs-ch"><b>القسط '+p.i+'</b>'+(p.paid?badge('مدفوع','paid'):late?badge('متأخر','cancel'):badge('قادم','new'))+'<small>'+E(G.fdate(p.due))+'</small></div><div class="fs-main">'+E(G.money(p.amount))+(p.paid?' · دُفع '+E(G.fdate(p.paidOn)):'')+'</div>'
   +(p.paid?(p.paymentId?'<div class="fs-note">رُحِّل إلى حساب العميل</div>':''):'<div class="fs-acts"><button type="button" class="fs-btn'+(link&&link.ok?'':' pri')+'" data-fa="pay" data-id="'+E(r.id)+'" data-i="'+p.i+'">تسجيل دفع (سجل فقط)</button>'+(link&&link.ok?'<button type="button" class="fs-btn pri" data-fa="collect" data-id="'+E(r.id)+'" data-i="'+p.i+'">تحصيل وترحيل لحساب العميل</button>':'')+'</div>')+'</div>';
 }).join('');
 return h+note('«تسجيل دفع (سجل فقط)» لا يمس حساب العميل ولا المحاسبة. «تحصيل وترحيل» يخصم من رصيد العميل ويُنشئ دفعة مستلمة في سجل الدفعات (تظهر في الكشف والإغلاق والمحاسبة).');
}
function linkNote(r,db,cu,s){
 if(!db)return '';
 if(!r.f.customer)return note('الخطة غير مرتبطة بعميل مسجّل، فلا يمكن ترحيل التحصيل لحسابه. عدّل الخطة واختر العميل.');
 if(!cu)return note('العميل المرتبط لم يعد موجودًا.');
 var bal=L.r2(L.num(cu.balance)),short=bal+0.005<s.left;
 return '<p class="fs-note">العميل: <b>'+E(cu.name)+'</b> · رصيده المسجّل '+E(G.money(bal))+' · المتبقي من الخطة '+E(G.money(s.left))+(short?' — <b style="color:#b02a2f">الرصيد أقل من المتبقي: أصدر فاتورة آجلة من نقطة البيع كي يُرحَّل التحصيل.</b>':'')+'</p>';
}
function tablesHtml(db){
 var ts=L.tablesList(db),h=head('الطاولات',false)+note(NO_ACC);
 h+='<div class="fs-row"><input class="fs-in" id="fa_tn" placeholder="اسم/رقم الطاولة" maxlength="40"><input class="fs-in" id="fa_ts" inputmode="numeric" placeholder="المقاعد" style="max-width:90px"><button type="button" class="fs-btn pri" data-fa="addtable">+ طاولة</button></div><p class="fs-err" id="fa_e" role="alert"></p>';
 if(!ts.length)return h+'<p class="fs-empty">لا توجد طاولات. أضف أول طاولة.</p>';
 return h+'<div class="fs-grid">'+ts.map(function(t){
  var o=L.openOrders(db,t.id),tot=o.reduce(function(s,x){return s+x.f.total},0);
  return '<button type="button" class="fs-tbl '+E(t.status)+'" data-fa="table" data-id="'+E(t.id)+'"><b>'+E(t.f.name)+'</b><small>'+(t.f.seats?t.f.seats+' مقعد':'')+'</small>'+badge(stLabel({statuses:L.TABLE_ST},t.status),t.status)+(o.length?'<small>'+o.length+' طلب · '+E(G.money(tot))+'</small>':'')+'</button>';
 }).join('')+'</div>';
}
function tableSheetHtml(db,t){
 var o=L.openOrders(db,t.id),h=head('طاولة '+t.f.name,true);
 h+='<div class="fs-sts">'+L.TABLE_ST.filter(function(s){return s[0]!==t.status}).map(function(s){return '<button type="button" class="fs-btn sm" data-fa="tstatus" data-id="'+E(t.id)+'" data-v="'+s[0]+'">← '+E(s[1])+'</button>'}).join('')+'</div><p class="fs-err" id="fa_e" role="alert"></p>';
 h+='<div class="fs-acts"><button type="button" class="fs-btn pri" data-fa="neworder" data-id="'+E(t.id)+'">+ طلب جديد</button>'+(o.length?'':'<button type="button" class="fs-btn danger" data-fa="deltable" data-id="'+E(t.id)+'">حذف الطاولة</button>')+'</div>';
 return h+(o.length?o.map(function(x){return orderCard(x,true)}).join(''):'<p class="fs-empty">لا طلبات مفتوحة.</p>');
}
function orderCard(o,withActs){
 var nx=L.nextStatus(o.status),items=o.f.items.map(function(i){return E(i.name)+' ×'+i.qty}).join('، ');
 return '<div class="fs-card"><div class="fs-ch"><b>'+E(o.no)+'</b>'+badge(L.ORDER_LABEL[o.status]||o.status,o.status)+'<small>'+E(o.f.kind==='takeaway'?'سفري':o.f.kind==='delivery'?'توصيل':'محلي')+'</small></div><div class="fs-main">'+items+'</div><div>الإجمالي: '+E(G.money(o.f.total))+'</div>'+(o.f.note?'<div class="fs-note">'+E(o.f.note)+'</div>':'')
  +(withActs?'<div class="fs-acts">'+(nx?'<button type="button" class="fs-btn pri" data-fa="adv" data-id="'+E(o.id)+'">← '+E(L.ORDER_LABEL[nx])+'</button>':'')+(o.status!=='paid'&&o.status!=='cancel'?'<button type="button" class="fs-btn" data-fa="topos" data-id="'+E(o.id)+'">إلى نقطة البيع</button><button type="button" class="fs-btn danger" data-fa="cancelorder" data-id="'+E(o.id)+'">إلغاء</button>':'')+'</div>':'')+'</div>';
}
function ordersHtml(db){
 var f=S.status||'open',rows=L.recs(db,'orders').filter(function(o){return f==='all'||(f==='open'?(o.status!=='paid'&&o.status!=='cancel'):o.status===f)}).sort(function(a,b){return String(b.created).localeCompare(String(a.created))});
 return head('الطلبات',false)+note(NO_ACC+' الدفع هنا حالة فقط؛ أصدر الفاتورة من نقطة البيع.')
  +'<div class="fs-row"><button type="button" class="fs-btn pri" data-fa="neworder" data-id="">+ طلب جديد</button><select id="fa_st" class="fs-in">'+opts([['open','المفتوحة'],['all','الكل'],['paid','المدفوعة'],['cancel','الملغاة']],f)+'</select></div>'
  +(rows.length?rows.map(function(o){return orderCard(o,true)}).join(''):'<p class="fs-empty">لا توجد طلبات.</p>');
}
function newOrderHtml(db){
 var tables=L.tablesList(db),h=head('طلب جديد',true);
 h+='<label class="fs-l">النوع</label><select id="fa_kind" class="fs-in"><option value="dine">محلي</option><option value="takeaway">سفري</option><option value="delivery">توصيل</option></select>'
  +'<label class="fs-l">الطاولة</label><select id="fa_tbl" class="fs-in">'+opts(tables.map(function(t){return[t.id,t.f.name]}),S.tableId,'— بدون —')+'</select>'
  +'<label class="fs-l">إضافة صنف</label><div class="fs-row"><select id="fa_prod" class="fs-in">'+productOpts(db,'')+'</select><input id="fa_qty" class="fs-in" inputmode="decimal" value="1" style="max-width:70px"><button type="button" class="fs-btn" data-fa="additem">أضف</button></div>'
  +'<div class="fs-row"><input id="fa_iname" class="fs-in" placeholder="أو اسم صنف يدوي"><input id="fa_iprice" class="fs-in" inputmode="decimal" placeholder="السعر" style="max-width:90px"><button type="button" class="fs-btn" data-fa="addmanual">أضف</button></div>';
 h+='<div id="fa_items">'+itemsHtml()+'</div><label class="fs-l">ملاحظة</label><input id="fa_note" class="fs-in" maxlength="300"><p class="fs-err" id="fa_e" role="alert"></p><div class="fs-acts"><button type="button" class="fs-btn pri" data-fa="saveorder">حفظ الطلب</button><button type="button" class="fs-btn" data-fa="back">إلغاء</button></div>';
 return h;
}
function itemsHtml(){
 if(!S.items.length)return '<p class="fs-empty">لم تُضف أصناف.</p>';
 return S.items.map(function(i,k){return '<div class="fs-line"><span>'+E(i.name)+' ×'+i.qty+'</span><span>'+E(G.money(L.r2(i.qty*i.price)))+'</span><button type="button" class="fs-btn sm danger" data-fa="rmitem" data-i="'+k+'" aria-label="حذف الصنف">✕</button></div>'}).join('')+'<div class="fs-line"><b>الإجمالي</b><b>'+E(G.money(L.orderTotal(S.items)))+'</b></div>';
}
function kitchenHtml(db){
 var b=L.kitchenBoard(db),now=Date.now(),cols=[['new','جديدة'],['preparing','قيد التحضير'],['ready','جاهزة']];
 var h=head('شاشة المطبخ',false)+note('تتحدّث تلقائيًا كل 15 ثانية. اضغط على الطلب لنقله للمرحلة التالية.');
 h+='<div class="fs-kit">'+cols.map(function(c){
  return '<div class="fs-col"><h4>'+c[1]+' ('+b[c[0]].length+')</h4>'+(b[c[0]].length?b[c[0]].map(function(o){
   var mins=Math.max(0,Math.round((now-new Date(o.created).getTime())/60000)),nx=L.nextStatus(o.status);
   return '<div class="fs-card"><div class="fs-ch"><b>'+E(o.no)+'</b><small>'+mins+' د'+(o.f.table?' · '+E(nameTable(db,o.f.table)):'')+'</small></div><div class="fs-main">'+o.f.items.map(function(i){return E(i.name)+' ×'+i.qty}).join('<br>')+'</div>'+(o.f.note?'<div class="fs-note">'+E(o.f.note)+'</div>':'')+'<button type="button" class="fs-btn pri" data-fa="adv" data-id="'+E(o.id)+'">← '+E(L.ORDER_LABEL[nx])+'</button></div>';
  }).join(''):'<p class="fs-empty">—</p>')+'</div>';
 }).join('')+'</div>';
 return h;
}
function nameTable(db,id){var t=L.find(db,id);return t?t.f.name:''}
function weightsHtml(db){
 return head('الأوزان',false)+note('حاسبة سعر بالوزن. للقراءة فقط ولا تغيّر المخزون ولا الفواتير.')
  +'<label class="fs-l">المنتج (اختياري)</label><select id="fa_wp" class="fs-in" data-fa-change="wprod">'+productOpts(db,'')+'</select>'
  +'<label class="fs-l">سعر الكيلو</label><input id="fa_wprice" class="fs-in" inputmode="decimal" dir="ltr" style="text-align:right">'
  +'<label class="fs-l">الوزن</label><div class="fs-row"><input id="fa_wval" class="fs-in" inputmode="decimal" dir="ltr" style="text-align:right"><select id="fa_wunit" class="fs-in" style="max-width:90px"><option value="kg">كغ</option><option value="g">غ</option></select></div>'
  +'<label class="fs-l">وزن الوعاء (اختياري)</label><input id="fa_wtare" class="fs-in" inputmode="decimal" dir="ltr" style="text-align:right">'
  +'<div class="fs-acts"><button type="button" class="fs-btn pri" data-fa="weigh">احسب</button></div><div id="fa_wres" class="fs-res" aria-live="polite"></div>';
}
function goldHtml(db){
 var rates=L.getRates(db);
 return head('تسعير الذهب',false)+note('أدخل سعر الغرام لكل عيار ثم احسب. للحساب فقط؛ لا يُنشئ فاتورة.')
  +'<div class="fs-grid2">'+L.KARATS.map(function(k){return '<label class="fs-l">عيار '+k+'<input class="fs-in" data-rate="'+k+'" inputmode="decimal" dir="ltr" style="text-align:right" value="'+E(rates[k]==null?'':rates[k])+'"></label>'}).join('')+'</div>'
  +'<div class="fs-acts"><button type="button" class="fs-btn" data-fa="saverates">حفظ الأسعار</button></div><hr>'
  +'<label class="fs-l">العيار</label><select id="fa_gk" class="fs-in">'+opts(L.KARATS.map(function(k){return[k,'عيار '+k]}),'21')+'</select>'
  +'<label class="fs-l">الوزن (غرام)</label><input id="fa_gw" class="fs-in" inputmode="decimal" dir="ltr" style="text-align:right">'
  +'<label class="fs-l">أجرة الصياغة</label><div class="fs-row"><input id="fa_gm" class="fs-in" inputmode="decimal" dir="ltr" style="text-align:right" value="0"><select id="fa_gmm" class="fs-in" style="max-width:130px"><option value="gram">للغرام</option><option value="pct">% من الذهب</option></select></div>'
  +'<p class="fs-err" id="fa_e" role="alert"></p><div class="fs-acts"><button type="button" class="fs-btn pri" data-fa="gold">احسب السعر</button></div><div id="fa_gres" class="fs-res" aria-live="polite"></div>';
}
function variantsHtml(db){
 var tab=S.tab||'axes',h=head('المقاسات والألوان والمصفوفة',false)+note('سجل مقاسات/ألوان وكميات لكل منتج. مستقل عن المخزون الرئيسي ولا يغيّره.');
 h+='<div class="fs-row"><select id="fa_vp" class="fs-in" data-fa-change="vprod">'+productOpts(db,S.id)+'</select><select id="fa_vt" class="fs-in" data-fa-change="vtab" style="max-width:150px">'+opts([['axes','المقاسات والألوان'],['grid','المصفوفة']],tab)+'</select></div>';
 if(!S.id)return h+'<p class="fs-empty">اختر منتجًا.</p>';
 var r=L.variantRec(db,S.id);
 if(tab==='axes')return h+'<label class="fs-l">المقاسات <small>(سطر أو فاصلة بين كل مقاس)</small></label><textarea id="fa_vs" rows="3">'+E(r?r.f.sizes.join('\n'):'')+'</textarea><label class="fs-l">الألوان</label><textarea id="fa_vc" rows="3">'+E(r?r.f.colors.join('\n'):'')+'</textarea><p class="fs-err" id="fa_e" role="alert"></p><div class="fs-acts"><button type="button" class="fs-btn pri" data-fa="saveaxes">حفظ</button></div>';
 if(!r)return h+'<p class="fs-empty">عرّف المقاسات والألوان أولًا من التبويب الآخر.</p>';
 var S2=r.f.sizes.length?r.f.sizes:[''],C=r.f.colors.length?r.f.colors:[''];
 h+='<div class="fs-scroll"><table class="fs-tb"><thead><tr><th></th>'+C.map(function(c){return '<th>'+E(c||'—')+'</th>'}).join('')+'</tr></thead><tbody>'
  +S2.map(function(s){return '<tr><th>'+E(s||'—')+'</th>'+C.map(function(c){var k=s+'|'+c;return '<td><input class="fs-cell" inputmode="numeric" data-size="'+E(s)+'" data-color="'+E(c)+'" value="'+E(r.f.grid[k]==null?'':r.f.grid[k])+'" aria-label="'+E(s+' '+c)+'"></td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>';
 return h+'<p class="fs-note">الإجمالي: <b id="fa_vtot">'+L.gridTotal(r)+'</b> قطعة</p><p class="fs-err" id="fa_e" role="alert"></p>';
}
function partsHtml(db){
 return head('بحث برقم القطعة وتوافق السيارات',false)
  +'<label class="fs-l">رقم/اسم القطعة أو الباركود</label><input id="fa_pq" class="fs-in" placeholder="مثال: BR-100" autocomplete="off">'
  +'<div class="fs-grid2"><label class="fs-l">الماركة<input id="fa_pm" class="fs-in"></label><label class="fs-l">الموديل<input id="fa_pmo" class="fs-in"></label><label class="fs-l">السنة<input id="fa_py" class="fs-in" inputmode="numeric"></label></div>'
  +'<div class="fs-acts"><button type="button" class="fs-btn" data-fa="open" data-v="vehicle_fitment">إدارة سجلات التوافق</button></div><div id="fa_pres">'+partsResult(db,'','','','')+'</div>';
}
function partsResult(db,q,make,model,year){
 var h='';
 if(String(q).trim().length>=2){
  var s=L.partSearch(db,q);
  h+='<h4>المنتجات ('+s.products.length+')</h4>'+(s.products.length?s.products.map(function(p){return '<div class="fs-line"><span>'+E(p.name)+'</span><span>'+E(p.sku||p.barcode||'')+'</span><span>'+E(G.money(p.price||0))+' · مخزون '+E(p.stock==null?'—':p.stock)+'</span></div>'}).join(''):'<p class="fs-empty">لا نتائج.</p>');
 }
 if(make||model||year||String(q).trim().length>=2){
  var f=L.matchFitment(db,{make:make,model:model,year:year,part:String(q).trim().length>=2?q:''});
  h+='<h4>التوافق ('+f.length+')</h4>'+(f.length?f.slice(0,50).map(function(r){return '<div class="fs-line"><span>'+E(r.f.part)+'</span><span>'+E(r.f.make+' '+r.f.model)+'</span><span>'+E((r.f.from||'…')+' – '+(r.f.to||'…'))+'</span></div>'}).join(''):'<p class="fs-empty">لا سجلات توافق مطابقة.</p>');
 }
 return h||'<p class="fs-empty">اكتب رقم القطعة أو اختر السيارة.</p>';
}

var CSS='#modal .fs-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}#modal .fs-top h3{margin:0;font-size:17px;flex:1}'
+'.fs-note{font-size:12px;color:var(--muted,#667);margin:2px 0 10px;line-height:1.7}.fs-err{color:#b02a2f;font-size:13px;margin:6px 0;min-height:1em}.fs-empty{color:var(--muted,#667);font-size:13px;margin:10px 4px}'
+'.fs-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}.fs-in,#modal .sh-body textarea,#modal .sh-body select.fs-in{flex:1 1 120px;min-width:0;box-sizing:border-box;padding:9px 10px;border:1px solid var(--line,#d8e2e0);border-radius:10px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:14px}'
+'.fs-l{display:block;font-size:13px;font-weight:700;margin:10px 0 4px}.fs-l small{font-weight:400;color:var(--muted,#667)}'
+'.fs-btn{min-height:40px;padding:6px 12px;border-radius:10px;border:1px solid var(--line,#d8e2e0);background:var(--surface,#fff);color:inherit;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;touch-action:manipulation}.fs-btn.pri{background:#0e8a43;border-color:#0e8a43;color:#fff}.fs-btn.danger{color:#c0262b;border-color:#e8b9bb}.fs-btn.sm{min-height:34px;font-size:12.5px;padding:4px 9px}'
+'.fs-card{border:1px solid var(--line,#d8e2e0);border-radius:12px;padding:10px;margin:8px 0;background:var(--surface,#fff);font-size:13.5px;line-height:1.7}.fs-ch{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fs-ch small{margin-inline-start:auto;color:var(--muted,#667)}.fs-main{font-weight:700;margin:4px 0}'
+'.fs-b{color:#fff;font-size:11.5px;padding:2px 9px;border-radius:99px;font-weight:700}.fs-acts,.fs-sts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}'
+'.fs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:8px}.fs-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}'
+'.fs-tbl{display:flex;flex-direction:column;gap:4px;align-items:flex-start;padding:10px;border-radius:12px;border:2px solid var(--line,#d8e2e0);background:var(--surface,#fff);color:inherit;font:inherit;cursor:pointer;text-align:start;min-height:84px}.fs-tbl.busy{border-color:#b02a2f}.fs-tbl.free{border-color:#0e8a43}.fs-tbl.reserved{border-color:#b45309}'
+'.fs-line{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 2px;border-bottom:1px solid var(--line,#e5ecea);font-size:13.5px}'
+'.fs-kit{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.fs-col h4{margin:4px 0}.fs-res{margin-top:10px;padding:10px;border-radius:12px;background:var(--bg,#f4f7f6);font-weight:700;line-height:1.9}'
+'.fs-scroll{overflow-x:auto}.fs-tb{border-collapse:collapse;min-width:100%}.fs-tb th,.fs-tb td{border:1px solid var(--line,#d8e2e0);padding:4px 6px;text-align:center;font-size:13px}.fs-cell{width:64px;text-align:center;padding:6px;border:1px solid var(--line,#d8e2e0);border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit}';

/* ---------------------------------------------------------------- تنقّل وأحداث ---------------------------------------------------------------- */
function stopTimer(){if(S.timer){clearInterval(S.timer);S.timer=null}}
function draw(){
 var d=G.db();if(!d){return}
 var c=S.code,h='';
 if(L.F[c]){
  if(S.view==='form')h=formHtml(c,d,S.id?L.find(d,S.id):null);
  else if(S.view==='plan')h=planHtml(L.find(d,S.id),d);
  else h=listHtml(c,d);
 }else if(c==='tables')h=S.view==='table'?tableSheetHtml(d,L.find(d,S.id)):S.view==='neworder'?newOrderHtml(d):tablesHtml(d);
 else if(c==='orders')h=S.view==='neworder'?newOrderHtml(d):ordersHtml(d);
 else if(c==='kitchen_display')h=kitchenHtml(d);
 else if(c==='weights')h=weightsHtml(d);
 else if(c==='gold_pricing')h=goldHtml(d);
 else if(c==='sizes_colors'||c==='variants_matrix')h=variantsHtml(d);
 else if(c==='part_number_search')h=partsHtml(d);
 else h='<p class="fs-empty">لا شاشة لهذه الميزة.</p>';
 G.setBody(h);
}
function addStyle(){if(document.getElementById('fsCss'))return;var s=document.createElement('style');s.id='fsCss';s.textContent=CSS;document.head.appendChild(s)}
function open(code){
 if(!L.CODES.includes(code)){G.toast('لا توجد شاشة لهذه الميزة');return}
 if(!root.orvexProfile||typeof root.orvexProfile.hasFeature!=='function'||!root.orvexProfile.hasFeature(code)){G.toast('هذه الميزة غير ممنوحة لهذا المحل');return}
 if(!G.user()){G.toast('سجّل الدخول أولًا');return}
 if(!G.can()){G.toast('ليست لديك صلاحية لهذه الشاشة');return}
 if(!G.db()){return}
 stopTimer();addStyle();
 S={code:code,view:'list',id:'',q:'',status:'',tab:code==='variants_matrix'?'grid':'axes',items:[],tableId:'',timer:null};
 G.modal(L.titleOf(code),'');
 var m=document.getElementById('modal');
 m.addEventListener('click',onClick);m.addEventListener('input',onInput);m.addEventListener('change',onChange);
 draw();
 if(code==='kitchen_display')S.timer=setInterval(function(){if(!document.getElementById('modal')){stopTimer();return}if(S.code==='kitchen_display'){var a=document.activeElement;if(!a||a.tagName!=='INPUT')draw()}},15000);
}
function collect(){var o={};document.querySelectorAll('#modal [data-k]').forEach(function(el){o[el.getAttribute('data-k')]=el.value});return o}
var $=function(id){return document.getElementById(id)};
var err=function(m){var e=$('fa_e');if(e)e.textContent=m||''};
function after(r,okMsg){
 if(r&&r.err){err(r.err);G.toast(r.err);return false}
 G.save();if(okMsg)G.toast(okMsg);return true;
}
function onClick(ev){
 var b=ev.target.closest&&ev.target.closest('[data-fa]');if(!b||b.tagName==='SELECT'||b.tagName==='INPUT')return;
 var a=b.getAttribute('data-fa'),id=b.getAttribute('data-id')||'',d=G.db();if(!d)return;
 var c=S.code;
 switch(a){
  case 'back':S.view=c==='tables'&&S.view==='neworder'&&S.tableId?'table':'list';if(S.view==='table')S.id=S.tableId;else if(S.view==='list')S.id='';draw();return;
  case 'new':S.view='form';S.id='';draw();return;
  case 'edit':S.view='form';S.id=id;draw();return;
  case 'plan':S.view='plan';S.id=id;draw();return;
  case 'save':{
   var r=S.id?L.update(d,S.id,collect()):L.create(d,c,collect(),{today:G.today()});
   if(after(r,S.id?'تم الحفظ':'تمت الإضافة')){S.view='list';S.id='';draw()}return}
  case 'del':if(!root.confirm('حذف هذا السجل؟'))return;if(after(L.remove(d,id),'تم الحذف'))draw();return;
  case 'status':if(after(L.setStatus(d,id,b.getAttribute('data-v'))))draw();return;
  case 'pay':if(after(L.payInstallment(d,id,parseInt(b.getAttribute('data-i'),10),G.today()),'تم تسجيل الدفع'))draw();return;
  case 'collect':{
   if(!G.canParties()){G.toast('ليست لديك صلاحية تسجيل دفعات العملاء');return}
   var ri=L.find(d,id),ii=parseInt(b.getAttribute('data-i'),10),ck=L.collectCheck(d,ri,ii);
   if(ck.err){G.toast(ck.err);return}
   if(!root.confirm('تحصيل '+G.money(ck.plan.amount)+' من «'+ck.cust.name+'» وترحيله لحسابه؟\nرصيده: '+G.money(ck.balance)+' ← '+G.money(ck.after)+'\nلا يمكن التراجع من هنا.'))return;
   if(after(L.collectInstallment(d,id,ii,G.today()),'رُحِّل التحصيل إلى حساب العميل'))draw();return}
  case 'open':open(b.getAttribute('data-v'));return;
  /* الطاولات والطلبات */
  case 'addtable':{var r2=L.addTable(d,$('fa_tn').value,$('fa_ts').value);if(after(r2,'تمت إضافة الطاولة'))draw();return}
  case 'table':S.view='table';S.id=id;S.tableId=id;draw();return;
  case 'tstatus':if(after(L.setTableStatus(d,id,b.getAttribute('data-v'))))draw();return;
  case 'deltable':if(!root.confirm('حذف الطاولة؟'))return;if(after(L.remove(d,id),'تم الحذف')){S.view='list';S.id='';draw()}return;
  case 'neworder':S.view='neworder';S.items=[];S.tableId=id||'';draw();return;
  case 'additem':{
   var p=(d.products||[]).filter(function(x){return x.id===$('fa_prod').value})[0],q=L.num($('fa_qty').value);
   if(!p||!(q>0)){err('اختر صنفًا وكمية صحيحة');return}
   S.items.push({name:p.name,qty:q,price:L.num(p.price),pid:p.id});err('');$('fa_items').innerHTML=itemsHtml();return}
  case 'addmanual':{
   var nm=$('fa_iname').value.trim(),pr=L.num($('fa_iprice').value),q2=L.num($('fa_qty').value);
   if(!nm||!(q2>0)||pr<0){err('أدخل اسم الصنف والسعر والكمية');return}
   S.items.push({name:nm,qty:q2,price:pr,pid:''});err('');$('fa_iname').value='';$('fa_iprice').value='';$('fa_items').innerHTML=itemsHtml();return}
  case 'rmitem':S.items.splice(parseInt(b.getAttribute('data-i'),10),1);$('fa_items').innerHTML=itemsHtml();return;
  case 'saveorder':{
   var r3=L.createOrder(d,{items:S.items,table:$('fa_tbl').value,kind:$('fa_kind').value,note:$('fa_note').value},{today:G.today()});
   if(after(r3,'تم حفظ الطلب')){S.items=[];S.view=c==='tables'&&S.tableId?'table':'list';S.id=S.tableId;draw()}return}
  case 'adv':if(after(L.advanceOrder(d,id)))draw();return;
  case 'topos':{
   var od=L.find(d,id),st=G.state();if(!od||!st||!Array.isArray(st.cart)){G.toast('نقطة البيع غير جاهزة');return}
   var cp=L.cartLines(d,od,st.cart);
   if(!cp.lines.length){G.toast(cp.skipped.length?'لا يمكن الإرسال: '+cp.skipped.map(function(x){return x.name+' ('+x.why+')'}).join('، '):'لا أصناف في الطلب');return}
   if(st.cart.length&&!root.confirm('في السلة أصناف حالية. إضافة أصناف الطلب '+od.no+' إليها؟'))return;
   cp.lines.forEach(function(l){var i=st.cart.findIndex(function(x){return x.pid===l.pid});if(i>=0)st.cart[i].qty+=l.qty;else st.cart.push(l)});
   G.close();G.go('pos');
   G.toast(cp.skipped.length?'أُضيف الطلب إلى السلة، وتعذّر: '+cp.skipped.map(function(x){return x.name+' ('+x.why+')'}).join('، '):'أُضيف الطلب إلى سلة نقطة البيع. أكمل الدفع ثم عُد وسجّله «مدفوع».');return}
  case 'cancelorder':if(!root.confirm('إلغاء هذا الطلب؟'))return;if(after(L.cancelOrder(d,id),'أُلغي الطلب'))draw();return;
  /* حاسبات */
  case 'weigh':{
   var w=L.weighPrice($('fa_wprice').value,$('fa_wval').value,$('fa_wtare').value,$('fa_wunit').value);
   $('fa_wres').innerHTML=w.err?'<span class="fs-err">'+E(w.err)+'</span>':'الوزن الصافي: '+E(w.netG)+' غ<br>الإجمالي: '+E(G.money(w.total));return}
  case 'saverates':{var rt={};document.querySelectorAll('#modal [data-rate]').forEach(function(el){rt[el.getAttribute('data-rate')]=el.value});after(L.setRates(d,rt),'حُفظت الأسعار');return}
  case 'gold':{
   var rates=L.getRates(d),k=$('fa_gk').value,g=L.goldPrice({weight:$('fa_gw').value,rate:rates[k],making:$('fa_gm').value,makingMode:$('fa_gmm').value});
   if(g.err){err(g.err);$('fa_gres').innerHTML='';return}err('');
   $('fa_gres').innerHTML='قيمة الذهب: '+E(G.money(g.metal))+'<br>أجرة الصياغة: '+E(G.money(g.making))+'<br>الإجمالي: '+E(G.money(g.total));return}
  case 'saveaxes':{var ra=L.setVariantAxes(d,S.id,$('fa_vs').value,$('fa_vc').value);if(after(ra,'تم الحفظ'))draw();return}
 }
}
function onInput(ev){
 var t=ev.target,d=G.db();if(!d)return;
 if(t.id==='fa_q'){S.q=t.value;var l=$('fa_list');if(l)l.innerHTML=rowsHtml(S.code,L.list(d,S.code,{q:S.q,status:S.status}),d);return}
 if(t.id==='fa_pq'||t.id==='fa_pm'||t.id==='fa_pmo'||t.id==='fa_py'){$('fa_pres').innerHTML=partsResult(d,$('fa_pq').value,$('fa_pm').value,$('fa_pmo').value,$('fa_py').value);return}
 if(t.classList&&t.classList.contains('fs-cell')){
  var r=L.setCell(d,S.id,t.getAttribute('data-size'),t.getAttribute('data-color'),t.value===''?0:t.value);
  if(r.err){err(r.err);return}err('');G.save();var tot=$('fa_vtot');if(tot)tot.textContent=r.total;
 }
}
function onChange(ev){
 var t=ev.target,d=G.db();if(!d)return;
 if(t.id==='fa_st'){S.status=t.value;draw();return}
 if(t.id==='fa_vp'){S.id=t.value;draw();return}
 if(t.id==='fa_vt'){S.tab=t.value;draw();return}
 if(t.id==='fa_wp'){var p=(d.products||[]).filter(function(x){return x.id===t.value})[0];if(p&&$('fa_wprice'))$('fa_wprice').value=p.price||'';return}
}

/* هل للميزة شاشة جاهزة (مدمجة سابقًا أو من هذه المرحلة)؟ */
function has(code){return L.CODES.includes(code)||!!NATIVE[code]}
root.orvexFeat={open:open,has:has,NATIVE:NATIVE,html:{listHtml:listHtml,formHtml:formHtml,planHtml:planHtml,tablesHtml:tablesHtml,ordersHtml:ordersHtml,kitchenHtml:kitchenHtml,weightsHtml:weightsHtml,goldHtml:goldHtml,variantsHtml:variantsHtml,partsHtml:partsHtml,partsResult:partsResult,itemsHtml:itemsHtml,orderCard:orderCard},_S:function(){return S},_set:function(o){Object.assign(S,o)}};
})(typeof window!=='undefined'?window:globalThis);
