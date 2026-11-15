/* ORVEX — منطق شاشات ميزات الأنشطة (المرحلة 7). نقي بلا DOM، يُختبر بمعزل.
   - كل بيانات الميزات في مجموعة واحدة db.featRecs: {id, feat, no, date, status, f:{حقول}, del?, created, updated}.
   - لا يقرأ ولا يكتب المبيعات أو المخزون أو الحسابات؛ يقرأ المنتجات/العملاء للاختيار والبحث فقط.
   - الحذف «ناعم» (del:true) ويُخفى من القوائم. تتزامن المجموعة كأي records (REC في server.js). */
(function(root){
'use strict';
var num=function(v){var n=parseFloat(String(v==null?'':v).replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d)}).replace(/٫/g,'.'));return isFinite(n)?n:0};
var r2=function(n){n=+n;if(!isFinite(n))return 0;return Math.round(n*100+(n<0?-1e-9:1e-9))/100};
var DATE=/^\d{4}-\d{2}-\d{2}$/;
var validDate=function(s){if(!DATE.test(s||''))return false;var d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s};
var pad=function(n){return n<10?'0'+n:''+n};
/* إضافة أشهر مع تثبيت اليوم على آخر يوم في الشهر الهدف (31 يناير + شهر = 28/29 فبراير) */
function addMonths(s,m){
  var p=s.split('-'),y=+p[0],mo=+p[1]-1+m,d=+p[2];y+=Math.floor(mo/12);mo=((mo%12)+12)%12;
  var last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();return y+'-'+pad(mo+1)+'-'+pad(Math.min(d,last));
}
function daysBetween(a,b){return Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/864e5)}

/* ---------------------------------------------------------------- سجل الميزات ----------------------------------------------------------------
   type: text | number | date | select | textarea | product | customer ؛ opts للـ select ؛ req إلزامي ؛ min للأرقام.
   statuses: [مفتاح، تسمية] والأولى افتراضية. list: أعمدة البطاقة. search: حقول البحث. */
var ST_JOB=[['new','جديد'],['working','قيد العمل'],['ready','جاهز'],['done','تم التسليم'],['cancel','ملغى']];
var F={
 warranty:{title:'الضمان',prefix:'W-',statuses:[['active','ساري'],['claim','مطالبة'],['closed','مغلق']],
  fields:[{k:'product',l:'المنتج',t:'product',req:1},{k:'customer',l:'العميل',t:'customer'},{k:'serial',l:'الرقم التسلسلي',t:'text'},{k:'start',l:'بداية الضمان',t:'date',req:1},{k:'months',l:'المدة (أشهر)',t:'number',req:1,min:1},{k:'note',l:'ملاحظات',t:'textarea'}],
  list:['product','customer','serial'],search:['serial','customerName','productName','note']},
 repair_orders:{title:'أوامر الصيانة',prefix:'R-',statuses:ST_JOB,
  fields:[{k:'customerName',l:'اسم العميل',t:'text',req:1},{k:'phone',l:'الهاتف',t:'text'},{k:'device',l:'الجهاز / الموديل',t:'text',req:1},{k:'serial',l:'IMEI / الرقم التسلسلي',t:'text'},{k:'problem',l:'العطل',t:'textarea',req:1},{k:'cost',l:'تكلفة الصيانة',t:'number',min:0},{k:'deposit',l:'عربون',t:'number',min:0},{k:'promised',l:'موعد التسليم',t:'date'}],
  list:['customerName','device','problem'],search:['customerName','phone','device','serial','problem'],money:['cost','deposit']},
 service_orders:{title:'أوامر الخدمة',prefix:'S-',statuses:ST_JOB,
  fields:[{k:'customerName',l:'اسم العميل',t:'text',req:1},{k:'phone',l:'الهاتف',t:'text'},{k:'service',l:'الخدمة المطلوبة',t:'text',req:1},{k:'details',l:'التفاصيل',t:'textarea'},{k:'price',l:'السعر',t:'number',min:0},{k:'due',l:'موعد التنفيذ',t:'date'}],
  list:['customerName','service'],search:['customerName','phone','service','details'],money:['price']},
 delivery_orders:{title:'أوامر التوصيل',prefix:'D-',statuses:[['new','جديد'],['out','خرج للتوصيل'],['delivered','تم التوصيل'],['failed','تعذّر'],['cancel','ملغى']],
  fields:[{k:'customerName',l:'اسم المستلم',t:'text',req:1},{k:'phone',l:'الهاتف',t:'text',req:1},{k:'address',l:'العنوان',t:'textarea',req:1},{k:'driver',l:'السائق',t:'text'},{k:'items',l:'المواد',t:'textarea'},{k:'amount',l:'مبلغ التحصيل',t:'number',min:0},{k:'fee',l:'أجرة التوصيل',t:'number',min:0}],
  list:['customerName','address','driver'],search:['customerName','phone','address','driver','items'],money:['amount','fee']},
 project_quotes:{title:'عروض المشاريع',prefix:'PQ-',statuses:[['draft','مسودة'],['sent','أُرسل'],['accepted','مقبول'],['rejected','مرفوض']],
  fields:[{k:'customerName',l:'العميل',t:'text',req:1},{k:'project',l:'اسم المشروع',t:'text',req:1},{k:'scope',l:'نطاق العمل والمواد',t:'textarea'},{k:'amount',l:'قيمة العرض',t:'number',req:1,min:0},{k:'valid',l:'صالح حتى',t:'date'}],
  list:['customerName','project'],search:['customerName','project','scope'],money:['amount']},
 print_services:{title:'خدمات الطباعة',prefix:'P-',statuses:[['new','جديد'],['printing','قيد الطباعة'],['ready','جاهز'],['done','تم التسليم'],['cancel','ملغى']],
  fields:[{k:'customerName',l:'العميل',t:'text',req:1},{k:'job',l:'نوع العمل',t:'select',opts:['طباعة مستندات','تصوير','تصميم','لافتات','بطاقات','أخرى'],req:1},{k:'qty',l:'الكمية',t:'number',req:1,min:1},{k:'unit',l:'سعر الوحدة',t:'number',min:0},{k:'note',l:'ملاحظات',t:'textarea'}],
  list:['customerName','job','qty'],search:['customerName','job','note'],computed:'print'},
 vehicle_fitment:{title:'توافق القطع مع السيارات',prefix:'V-',statuses:null,
  fields:[{k:'part',l:'رقم / اسم القطعة',t:'text',req:1},{k:'make',l:'ماركة السيارة',t:'text',req:1},{k:'model',l:'الموديل',t:'text',req:1},{k:'from',l:'من سنة',t:'number',min:1900},{k:'to',l:'إلى سنة',t:'number',min:1900},{k:'note',l:'ملاحظات',t:'textarea'}],
  list:['part','make','model'],search:['part','make','model','note']},
 installments:{title:'التقسيط',prefix:'I-',statuses:[['active','نشطة'],['done','مكتملة'],['cancel','ملغاة']],
  fields:[{k:'customerName',l:'اسم العميل',t:'text',req:1},{k:'customer',l:'ربط بعميل مسجّل (لترحيل التحصيل لحسابه)',t:'customer'},{k:'phone',l:'الهاتف',t:'text'},{k:'item',l:'المادة',t:'text',req:1},{k:'total',l:'السعر الإجمالي',t:'number',req:1,min:1},{k:'down',l:'الدفعة الأولى',t:'number',min:0},{k:'n',l:'عدد الأقساط',t:'number',req:1,min:1},{k:'start',l:'تاريخ أول قسط',t:'date',req:1},{k:'every',l:'كل كم شهر',t:'number',min:1}],
  list:['customerName','item'],search:['customerName','phone','item'],computed:'installments'}
};
/* ميزات بشاشات خاصة (ليست قوائم عامة) */
var CUSTOM=['tables','orders','kitchen_display','weights','sizes_colors','variants_matrix','part_number_search','gold_pricing'];
var TITLES={tables:'الطاولات',orders:'الطلبات',kitchen_display:'شاشة المطبخ',weights:'الأوزان',sizes_colors:'المقاسات والألوان',variants_matrix:'مصفوفة الموديلات',part_number_search:'بحث برقم القطعة',gold_pricing:'تسعير الذهب'};
var CODES=Object.keys(F).concat(CUSTOM);
var titleOf=function(c){return F[c]?F[c].title:TITLES[c]||c};

/* ---------------------------------------------------------------- CRUD العام ---------------------------------------------------------------- */
function recs(db,feat){return(db.featRecs||[]).filter(function(r){return r.feat===feat&&!r.del})}
function nextNo(db,feat){
  var pre=(F[feat]&&F[feat].prefix)||'X-',max=0;
  (db.featRecs||[]).forEach(function(r){if(r.feat===feat&&r.no&&String(r.no).indexOf(pre)===0){var n=parseInt(String(r.no).slice(pre.length),10);if(n>max)max=n}});
  return pre+(max+1);
}
/* تحقق وتنظيف الحقول حسب التعريف؛ يعيد {ok,f} أو {err} */
function clean(def,input){
  var f={};
  for(var i=0;i<def.fields.length;i++){
    var d=def.fields[i],v=input?input[d.k]:undefined;
    if(d.t==='number'){
      var raw=String(v==null?'':v).trim();
      if(raw===''){if(d.req)return{err:'أدخل '+d.l};continue}
      var n=num(raw);if(!isFinite(n)||(d.min!=null&&n<d.min))return{err:d.l+' غير صالح'};
      if(n>1e12)return{err:d.l+' كبير جدًا'};f[d.k]=n;
    }else if(d.t==='date'){
      var s=String(v==null?'':v).trim();
      if(!s){if(d.req)return{err:'أدخل '+d.l};continue}
      if(!validDate(s))return{err:d.l+' غير صالح'};f[d.k]=s;
    }else if(d.t==='select'){
      var o=String(v==null?'':v);
      if(!o){if(d.req)return{err:'اختر '+d.l};continue}
      if(d.opts.indexOf(o)<0)return{err:d.l+' غير صالح'};f[d.k]=o;
    }else{
      var t=String(v==null?'':v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
      if(!t){if(d.req)return{err:'أدخل '+d.l};continue}
      if(t.length>(d.t==='textarea'?1000:200))return{err:d.l+' طويل'};f[d.k]=t;
    }
  }
  if(f.from&&f.to&&f.from>f.to)return{err:'سنة البداية بعد سنة النهاية'};
  if(def.computed==='installments'){
    if(f.n!=null&&(f.n!==Math.floor(f.n)||f.n>120))return{err:'عدد الأقساط من 1 إلى 120'};
    if(f.down!=null&&f.total!=null&&f.down>=f.total)return{err:'الدفعة الأولى يجب أن تكون أقل من السعر'};
  }
  return{ok:true,f:f};
}
function create(db,feat,input,env){
  env=env||{};var def=F[feat];if(!def)return{err:'ميزة غير معروفة'};
  var c=clean(def,input);if(c.err)return c;
  var now=env.now||new Date().toISOString(),r={id:env.id||('fr'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)),feat:feat,no:nextNo(db,feat),date:env.today||now.slice(0,10),status:def.statuses?def.statuses[0][0]:'',f:c.f,created:now,updated:now};
  if(def.computed==='installments'&&c.f.customer&&!custOf(db,c.f.customer))return{err:'العميل المختار غير موجود'};
  if(def.computed==='installments')r.f.plan=schedule(c.f.total,c.f.down||0,c.f.n,c.f.start,c.f.every||1);
  (db.featRecs=db.featRecs||[]).push(r);return{ok:true,rec:r};
}
function find(db,id){return(db.featRecs||[]).find(function(r){return r.id===id&&!r.del})}
function update(db,id,input,env){
  var r=find(db,id);if(!r)return{err:'السجل غير موجود'};var def=F[r.feat];if(!def)return{err:'ميزة غير معروفة'};
  var c=clean(def,input);if(c.err)return c;env=env||{};
  if(def.computed==='installments'){
    if(c.f.customer&&!custOf(db,c.f.customer))return{err:'العميل المختار غير موجود'};
    if(hasPosted(r)&&(c.f.customer||'')!==(r.f.customer||''))return{err:'لا يمكن تغيير العميل بعد ترحيل تحصيل لحسابه'};
  }
  var plan=r.f.plan;r.f=c.f;
  if(def.computed==='installments'){
    var paid=(plan||[]).some(function(p){return p.paid});
    /* لا نعيد توليد الجدول بعد دفع قسط (يحفظ المدفوعات)؛ إعادة التوليد فقط قبل أي دفع */
    r.f.plan=paid?plan:schedule(c.f.total,c.f.down||0,c.f.n,c.f.start,c.f.every||1);
  }
  r.updated=env.now||new Date().toISOString();return{ok:true,rec:r};
}
function setStatus(db,id,status,env){
  var r=find(db,id);if(!r)return{err:'السجل غير موجود'};var def=F[r.feat];
  if(!def||!def.statuses||!def.statuses.some(function(s){return s[0]===status}))return{err:'حالة غير صالحة'};
  r.status=status;r.updated=(env&&env.now)||new Date().toISOString();return{ok:true,rec:r};
}
function remove(db,id,env){var r=find(db,id);if(!r)return{err:'السجل غير موجود'};if(hasPosted(r))return{err:'لا يمكن حذف خطة رُحِّل منها تحصيل إلى حساب العميل'};r.del=true;r.updated=(env&&env.now)||new Date().toISOString();return{ok:true}}
function haystack(r,def){return(def.search||[]).map(function(k){return String(r.f[k]==null?'':r.f[k])}).concat([r.no||'']).join(' ').toLowerCase()}
function list(db,feat,o){
  o=o||{};var def=F[feat],q=String(o.q||'').trim().toLowerCase();
  return recs(db,feat).filter(function(r){
    if(o.status&&r.status!==o.status)return false;
    return !q||haystack(r,def||{search:[]}).indexOf(q)>=0;
  }).sort(function(a,b){return String(b.created).localeCompare(String(a.created))});
}
/* ملخص عددي بحسب الحالة */
function counts(db,feat){var c={};recs(db,feat).forEach(function(r){c[r.status]=(c[r.status]||0)+1});return c}
function printTotal(r){return r2(num(r.f.qty)*num(r.f.unit))}

/* ---------------------------------------------------------------- الضمان ---------------------------------------------------------------- */
function warrantyEnd(start,months){return validDate(start)&&num(months)>0?addMonths(start,Math.floor(num(months))):''}
/* active | expiring (≤30 يومًا) | expired */
function warrantyState(r,today){
  var end=warrantyEnd(r.f.start,r.f.months);if(!end)return{end:'',state:'expired',days:0};
  var d=daysBetween(today,end);return{end:end,days:d,state:d<0?'expired':d<=30?'expiring':'active'};
}

/* ---------------------------------------------------------------- التقسيط ---------------------------------------------------------------- */
function schedule(total,down,n,start,every){
  total=r2(total);down=r2(down);n=Math.max(1,Math.floor(num(n)));every=Math.max(1,Math.floor(num(every)||1));
  var rest=r2(total-down),base=Math.floor(rest/n*100)/100,out=[],used=0;
  for(var i=0;i<n;i++){var a=i===n-1?r2(rest-used):base;used=r2(used+a);out.push({i:i+1,due:addMonths(start,i*every),amount:a,paid:false,paidOn:''})}
  return out;
}
function installState(r,today){
  var plan=(r.f.plan||[]),paid=0,left=0,over=0,next=null;
  plan.forEach(function(p){if(p.paid)paid=r2(paid+p.amount);else{left=r2(left+p.amount);if(p.due<today)over++;if(!next)next=p}});
  return{paid:paid,left:left,overdue:over,next:next,done:plan.length>0&&!next};
}
function payInstallment(db,id,i,date){
  var r=find(db,id);if(!r||r.feat!=='installments')return{err:'السجل غير موجود'};
  var p=(r.f.plan||[]).find(function(x){return x.i===i});if(!p)return{err:'القسط غير موجود'};
  if(p.paid)return{err:'القسط مدفوع مسبقًا'};
  if(!validDate(date))return{err:'تاريخ غير صالح'};
  p.paid=true;p.paidOn=date;if(installState(r,date).done)r.status='done';r.updated=new Date().toISOString();return{ok:true,rec:r};
}

/* ---- ترحيل تحصيل قسط إلى حساب العميل (نفس أثر «تسجيل دفعة مستلمة» في شاشة العملاء) ----
   الأثر الوحيد: customer.balance -= المبلغ + سطر في db.payments {type:'c'} ومنه تُشتق التقارير والإغلاق والكشف.
   الحارس: يجب أن يكون على العميل دين مسجّل يغطي القسط (رصيد ≥ المبلغ)، وإلا لنشأ رصيد دائن لا أصل له. */
function custOf(db,id){return(db.customers||[]).filter(function(c){return c.id===id&&!c.del})[0]}
function hasPosted(r){return r.feat==='installments'&&(r.f.plan||[]).some(function(p){return !!p.paymentId})}
function collectCheck(db,r,i){
  if(!r||r.feat!=='installments')return{err:'السجل غير موجود'};
  var p=(r.f.plan||[]).filter(function(x){return x.i===i})[0];if(!p)return{err:'القسط غير موجود'};
  if(p.paid)return{err:'القسط مدفوع مسبقًا'};
  if(r.status==='cancel')return{err:'الخطة ملغاة'};
  if(!r.f.customer)return{err:'اربط الخطة بعميل مسجّل أولًا (تعديل)'};
  var c=custOf(db,r.f.customer);if(!c)return{err:'العميل المرتبط غير موجود'};
  var bal=r2(num(c.balance));
  if(bal+0.005<p.amount)return{err:'رصيد العميل المسجّل ('+bal+') أقل من القسط ('+p.amount+'). أصدر فاتورة آجلة له من نقطة البيع أولًا ثم رحِّل التحصيل.',balance:bal};
  return{ok:true,plan:p,cust:c,balance:bal,after:r2(bal-p.amount)};
}
function collectInstallment(db,id,i,date,env){
  var r=find(db,id),chk=collectCheck(db,r,i);if(chk.err)return chk;
  if(!validDate(date))return{err:'تاريخ غير صالح'};
  var now=(env&&env.now)||new Date().toISOString(),p=chk.plan,pay={id:(env&&env.id)||('fp'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)),type:'c',pid:chk.cust.id,amount:p.amount,at:now,date:date,src:'installment:'+r.no+'#'+p.i};
  chk.cust.balance=r2(num(chk.cust.balance)-p.amount);
  (db.payments=db.payments||[]).push(pay);
  p.paid=true;p.paidOn=date;p.paymentId=pay.id;
  if(installState(r,date).done)r.status='done';
  r.updated=now;return{ok:true,payment:pay,balance:chk.cust.balance};
}

/* ---------------------------------------------------------------- الطاولات / الطلبات / المطبخ ---------------------------------------------------------------- */
var TABLE_ST=[['free','فارغة'],['busy','مشغولة'],['reserved','محجوزة']];
var ORDER_FLOW=['new','preparing','ready','served','paid'];
var ORDER_LABEL={new:'جديد',preparing:'قيد التحضير',ready:'جاهز',served:'تم التقديم',paid:'مدفوع',cancel:'ملغى'};
function tablesList(db){return(db.featRecs||[]).filter(function(r){return r.feat==='tables'&&!r.del}).sort(function(a,b){return String(a.f.name).localeCompare(String(b.f.name),'ar',{numeric:true})})}
function addTable(db,name,seats,env){
  var n=String(name||'').trim();if(!n)return{err:'اكتب اسم/رقم الطاولة'};if(n.length>40)return{err:'الاسم طويل'};
  if(tablesList(db).some(function(t){return String(t.f.name).toLowerCase()===n.toLowerCase()}))return{err:'الطاولة موجودة'};
  var s=seats===''||seats==null?0:num(seats);if(s<0||s>100)return{err:'عدد المقاعد غير صالح'};
  var now=(env&&env.now)||new Date().toISOString(),r={id:(env&&env.id)||('fr'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)),feat:'tables',no:'',date:now.slice(0,10),status:'free',f:{name:n,seats:s},created:now,updated:now};
  (db.featRecs=db.featRecs||[]).push(r);return{ok:true,rec:r};
}
function setTableStatus(db,id,st){
  var r=find(db,id);if(!r||r.feat!=='tables')return{err:'الطاولة غير موجودة'};
  if(!TABLE_ST.some(function(x){return x[0]===st}))return{err:'حالة غير صالحة'};
  if(st==='free'&&openOrders(db,id).length)return{err:'على الطاولة طلبات مفتوحة'};
  r.status=st;r.updated=new Date().toISOString();return{ok:true,rec:r};
}
function orderTotal(items){return r2((items||[]).reduce(function(s,i){return s+num(i.qty)*num(i.price)},0))}
function openOrders(db,tableId){return recs(db,'orders').filter(function(o){return o.f.table===tableId&&o.status!=='paid'&&o.status!=='cancel'})}
/* items: [{name, qty, price, pid?}] — الأسعار تُنسخ عند الإنشاء ولا تتبع تغيير المنتج لاحقًا */
function createOrder(db,input,env){
  var items=(input.items||[]).map(function(i){return{name:String(i.name||'').trim().slice(0,120),qty:num(i.qty),price:num(i.price),pid:i.pid||''}}).filter(function(i){return i.qty>0});
  if(!items.length)return{err:'أضف صنفًا واحدًا على الأقل'};
  if(items.some(function(i){return !i.name||i.price<0||i.qty>1e6}))return{err:'بيانات الأصناف غير صالحة'};
  var table='';
  if(input.table){var t=find(db,input.table);if(!t||t.feat!=='tables')return{err:'الطاولة غير موجودة'};table=t.id}
  var now=(env&&env.now)||new Date().toISOString(),o={id:(env&&env.id)||('fr'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)),feat:'orders',no:nextNoOrders(db),date:(env&&env.today)||now.slice(0,10),status:'new',
    f:{table:table,kind:input.kind==='takeaway'?'takeaway':input.kind==='delivery'?'delivery':'dine',items:items,total:orderTotal(items),note:String(input.note||'').trim().slice(0,300)},created:now,updated:now};
  (db.featRecs=db.featRecs||[]).push(o);
  if(table){var tb=find(db,table);if(tb.status!=='busy'){tb.status='busy';tb.updated=now}}
  return{ok:true,rec:o};
}
function nextNoOrders(db){var max=0;(db.featRecs||[]).forEach(function(r){if(r.feat==='orders'&&r.no){var n=parseInt(String(r.no).slice(1),10);if(n>max)max=n}});return '#'+(max+1)}
function nextStatus(st){var i=ORDER_FLOW.indexOf(st);return i>=0&&i<ORDER_FLOW.length-1?ORDER_FLOW[i+1]:null}
function advanceOrder(db,id){
  var o=find(db,id);if(!o||o.feat!=='orders')return{err:'الطلب غير موجود'};
  var n=nextStatus(o.status);if(!n)return{err:'لا حالة لاحقة'};
  o.status=n;o.updated=new Date().toISOString();
  if(n==='paid'&&o.f.table&&!openOrders(db,o.f.table).length){var t=find(db,o.f.table);if(t&&t.status==='busy'){t.status='free';t.updated=o.updated}}
  return{ok:true,rec:o};
}
function cancelOrder(db,id){
  var o=find(db,id);if(!o||o.feat!=='orders')return{err:'الطلب غير موجود'};
  if(o.status==='paid')return{err:'لا يمكن إلغاء طلب مدفوع'};
  o.status='cancel';o.updated=new Date().toISOString();
  if(o.f.table&&!openOrders(db,o.f.table).length){var t=find(db,o.f.table);if(t&&t.status==='busy'){t.status='free';t.updated=o.updated}}
  return{ok:true,rec:o};
}
/* أعمدة شاشة المطبخ: الطلبات الجديدة وقيد التحضير والجاهزة فقط، الأقدم أولًا */
function kitchenBoard(db){
  var cols={new:[],preparing:[],ready:[]};
  recs(db,'orders').forEach(function(o){if(cols[o.status])cols[o.status].push(o)});
  Object.keys(cols).forEach(function(k){cols[k].sort(function(a,b){return String(a.created).localeCompare(String(b.created))})});
  return cols;
}

/* ---------------------------------------------------------------- تمرير الطلب إلى نقطة البيع ----------------------------------------------------------------
   لا نكتب في المبيعات: نُجهّز أسطر سلة POS فقط (نفس شكل addCart: {pid,qty,price,dp}) ويكمل المستخدم الدفع بالمسار المعتاد.
   تُستثنى الأصناف اليدوية (بلا منتج) والمنتجات المحذوفة والتي يتجاوز طلبها المخزون (نفس قاعدة addCart: have+qty>stock). */
function cartLines(db,order,cart){
  var have={};(cart||[]).forEach(function(l){have[l.pid]=(have[l.pid]||0)+num(l.qty)});
  var want={},order_=[],skipped=[];
  ((order&&order.f&&order.f.items)||[]).forEach(function(it){
    if(!it.pid){skipped.push({name:it.name,why:'صنف يدوي بلا منتج'});return}
    var p=(db.products||[]).filter(function(x){return x.id===it.pid&&!x.del})[0];
    if(!p){skipped.push({name:it.name,why:'المنتج غير موجود'});return}
    if(!(it.qty>0))return;
    if(!(it.pid in want)){want[it.pid]={pid:it.pid,qty:0,price:num(it.price),dp:0,p:p};order_.push(it.pid)}
    want[it.pid].qty=Math.round((want[it.pid].qty+it.qty)*1e6)/1e6;
  });
  var lines=[];
  order_.forEach(function(pid){
    var w=want[pid],total=num(have[pid])+w.qty;
    if(total>w.p.stock){skipped.push({name:w.p.name,why:'المتوفر '+w.p.stock});return}
    lines.push({pid:pid,qty:w.qty,price:w.price,dp:0});
  });
  return{lines:lines,skipped:skipped};
}

/* ---------------------------------------------------------------- الأوزان ---------------------------------------------------------------- */
/* سعر الكيلو × الوزن الصافي؛ unit: kg | g ؛ tare بنفس الوحدة */
function weighPrice(pricePerKg,weight,tare,unit){
  var k=unit==='g'?1000:1,w=num(weight)/k,t=num(tare)/k,p=num(pricePerKg);
  if(p<0||w<0||t<0)return{err:'قيم سالبة غير مسموحة'};if(t>w)return{err:'وزن الوعاء أكبر من الوزن'};
  var net=Math.round((w-t)*1e6)/1e6;return{ok:true,net:net,netG:Math.round(net*1000*1e3)/1e3,total:r2(net*p)};
}

/* ---------------------------------------------------------------- تسعير الذهب ---------------------------------------------------------------- */
var KARATS=['24','22','21','18','14'];
function getRates(db){var r=(db.featRecs||[]).find(function(x){return x.feat==='gold_rates'&&!x.del});return r?r.f.rates||{}:{}}
function setRates(db,rates,env){
  var clean={};
  for(var i=0;i<KARATS.length;i++){var k=KARATS[i],v=rates?rates[k]:'';if(v===''||v==null)continue;var n=num(v);if(n<0||n>1e9)return{err:'سعر العيار '+k+' غير صالح'};clean[k]=n}
  var now=(env&&env.now)||new Date().toISOString(),r=(db.featRecs||[]).find(function(x){return x.feat==='gold_rates'&&!x.del});
  if(r){r.f.rates=clean;r.date=now.slice(0,10);r.updated=now}
  else(db.featRecs=db.featRecs||[]).push({id:(env&&env.id)||('fr'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)),feat:'gold_rates',no:'',date:now.slice(0,10),status:'',f:{rates:clean},created:now,updated:now});
  return{ok:true,rates:clean};
}
/* السعر = وزن × سعر غرام العيار + أجرة الصياغة (للغرام أو نسبة مئوية من قيمة الذهب) */
function goldPrice(i){
  var w=num(i.weight),rate=num(i.rate);
  if(!(w>0))return{err:'أدخل الوزن'};if(!(rate>0))return{err:'لا يوجد سعر لهذا العيار'};
  var metal=r2(w*rate),mk=i.makingMode==='pct'?r2(metal*num(i.making)/100):r2(w*num(i.making));
  if(num(i.making)<0)return{err:'أجرة الصياغة غير صالحة'};
  return{ok:true,metal:metal,making:mk,total:r2(metal+mk)};
}

/* ---------------------------------------------------------------- المقاسات والألوان / المصفوفة ---------------------------------------------------------------- */
function variantRec(db,pid){return(db.featRecs||[]).find(function(r){return r.feat==='variants'&&!r.del&&r.f.pid===pid})}
function parseList(t){var seen={},o=[];String(t==null?'':t).split(/[\n,،]+/).forEach(function(x){x=x.replace(/\s+/g,' ').trim();if(x&&!seen[x.toLowerCase()]){seen[x.toLowerCase()]=1;o.push(x)}});return o}
/* تعريف المقاسات والألوان لمنتج؛ الخلايا القديمة التي لم تعد ضمن القوائم تُحذف */
function setVariantAxes(db,pid,sizes,colors,env){
  if(!pid)return{err:'اختر منتجًا'};
  var s=Array.isArray(sizes)?sizes:parseList(sizes),c=Array.isArray(colors)?colors:parseList(colors);
  if(!s.length&&!c.length)return{err:'أضف مقاسًا أو لونًا واحدًا على الأقل'};
  if(s.length>40||c.length>40||s.concat(c).some(function(x){return x.length>30||x.indexOf('|')>=0}))return{err:'القوائم كبيرة أو تحتوي رمزًا غير مسموح'};
  var now=(env&&env.now)||new Date().toISOString(),r=variantRec(db,pid);
  if(!r){r={id:(env&&env.id)||('fr'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)),feat:'variants',no:'',date:now.slice(0,10),status:'',f:{pid:pid,sizes:s,colors:c,grid:{}},created:now,updated:now};(db.featRecs=db.featRecs||[]).push(r)}
  else{r.f.sizes=s;r.f.colors=c;r.updated=now}
  var keep={};cells(r).forEach(function(k){if(r.f.grid&&k in r.f.grid)keep[k]=r.f.grid[k]});r.f.grid=keep;
  return{ok:true,rec:r};
}
function cells(r){
  var S=(r.f.sizes&&r.f.sizes.length)?r.f.sizes:[''],C=(r.f.colors&&r.f.colors.length)?r.f.colors:[''],o=[];
  S.forEach(function(s){C.forEach(function(c){o.push(s+'|'+c)})});return o;
}
function setCell(db,pid,size,color,qty){
  var r=variantRec(db,pid);if(!r)return{err:'عرّف المقاسات والألوان أولًا'};
  var k=(size||'')+'|'+(color||'');if(cells(r).indexOf(k)<0)return{err:'خلية غير موجودة'};
  var q=num(qty);if(q<0||q>1e7||q!==Math.floor(q))return{err:'الكمية عدد صحيح غير سالب'};
  r.f.grid[k]=q;r.updated=new Date().toISOString();return{ok:true,total:gridTotal(r)};
}
function gridTotal(r){return Object.keys(r.f.grid||{}).reduce(function(s,k){return s+num(r.f.grid[k])},0)}

/* ---------------------------------------------------------------- التوافق وبحث القطع ---------------------------------------------------------------- */
var low=function(s){return String(s==null?'':s).toLowerCase().trim()};
function matchFitment(db,q){
  q=q||{};var year=num(q.year);
  return recs(db,'vehicle_fitment').filter(function(r){
    var f=r.f;
    if(q.make&&low(f.make).indexOf(low(q.make))<0)return false;
    if(q.model&&low(f.model).indexOf(low(q.model))<0)return false;
    if(q.part&&low(f.part).indexOf(low(q.part))<0)return false;
    if(year){if(f.from&&year<f.from)return false;if(f.to&&year>f.to)return false}
    return true;
  });
}
/* بحث موحّد: المنتجات (الاسم/الباركود/SKU) + سجلات التوافق (رقم القطعة) */
function partSearch(db,q){
  var s=low(q);if(s.length<2)return{products:[],fitment:[]};
  var prods=(db.products||[]).filter(function(p){return !p.del&&[p.name,p.sku,p.barcode,p.code].some(function(x){return low(x).indexOf(s)>=0})}).slice(0,30);
  return{products:prods,fitment:matchFitment(db,{part:q}).slice(0,30)};
}

root.orvexFeatLogic={F:F,CUSTOM:CUSTOM,CODES:CODES,titleOf:titleOf,TABLE_ST:TABLE_ST,ORDER_FLOW:ORDER_FLOW,ORDER_LABEL:ORDER_LABEL,KARATS:KARATS,
  num:num,r2:r2,validDate:validDate,addMonths:addMonths,daysBetween:daysBetween,
  clean:clean,create:create,update:update,setStatus:setStatus,remove:remove,list:list,counts:counts,find:find,recs:recs,nextNo:nextNo,printTotal:printTotal,
  warrantyEnd:warrantyEnd,warrantyState:warrantyState,schedule:schedule,installState:installState,payInstallment:payInstallment,collectCheck:collectCheck,collectInstallment:collectInstallment,hasPosted:hasPosted,custOf:custOf,
  tablesList:tablesList,addTable:addTable,setTableStatus:setTableStatus,orderTotal:orderTotal,openOrders:openOrders,createOrder:createOrder,nextStatus:nextStatus,advanceOrder:advanceOrder,cancelOrder:cancelOrder,kitchenBoard:kitchenBoard,cartLines:cartLines,
  weighPrice:weighPrice,getRates:getRates,setRates:setRates,goldPrice:goldPrice,
  variantRec:variantRec,parseList:parseList,setVariantAxes:setVariantAxes,cells:cells,setCell:setCell,gridTotal:gridTotal,matchFitment:matchFitment,partSearch:partSearch};
})(typeof window!=='undefined'?window:globalThis);
