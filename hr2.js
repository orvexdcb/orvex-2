/* ORVEX — المرحلة 4: الموارد البشرية (hr2.js)
   يحل محل منطق staff2.js (يُحمَّل بعده) ويحافظ على بياناته: employees وpayroll كما هما، وتُضاف مجموعات attendance وleaves وadvances.
   كلها محلية أولًا وتتزامن عبر records مثل بقية المجموعات؛ لا ترحيل في Supabase.
   - الصلاحيات: 'hr' (الموظفون/الحضور/الإجازات) و'payroll' (الرواتب والسلف والسياسة). المدير يملك الاثنتين دائمًا.
   - الحضور: سجل واحد لكل موظف/يوم بمعرّف حتمي att-<emp>-<date>؛ الدخول مرة، الخروج مرة، والتعديل اليدوي بسبب إلزامي وتدقيق قبل/بعد.
   - الإجازات: طلب ← قرار نهائي (معتمدة/مرفوضة) أو إلغاء بسبب؛ بلا تداخل؛ رصيد سنوي؛ تُحسب أيام العمل فقط (بعد العطل الأسبوعية والرسمية).
   - الرواتب: معرّف حتمي pay-<emp>-<month> فلا صرف مزدوج؛ الصافي = الأساسي والبدلات (بنسبة أيام التوظيف) + المكافأة − (غياب + إجازة بلا راتب + تأخير + خصم آخر + أقساط سلف).
     يُنشأ مصروف «رواتب» بقيمة الصافي النقدي فيصل للإغلاق والتقارير والقيود المحاسبية (Dr 5300 / Cr الصندوق) دون تغيير تلك الوحدات.
   - السلف: أساس نقدي: صرف السلفة نفسه مصروف «رواتب» (خروج نقد)، وأقساطها تُخصم من صافي الرواتب اللاحقة فلا تتكرر التكلفة. */
(function(){
'use strict';
const A=k=>Array.isArray(db[k])?db[k]:(db[k]=[]);
const emps=()=>A('employees'),payRows=()=>A('empPay'),pays=()=>A('payroll'),atts=()=>A('attendance'),leaves=()=>A('leaves'),advs=()=>A('advances');
const V=id=>{const x=document.getElementById(id);return x&&x.value!=null?String(x.value):''},C=id=>{const x=document.getElementById(id);return !!(x&&x.checked)};
const lc=s=>String(s==null?'':s).trim().toLowerCase();
const L=(a,r,d,ba)=>{try{if(window.orvexLog)orvexLog(a,r,d,ba)}catch(e){}};
const me=()=>(typeof curUser==='function'&&curUser())||{};
const canHr=()=>isAdmin()||can('hr'),canPay=()=>isAdmin()||can('payroll');
const curM=()=>today().slice(0,7);
const empOf=id=>emps().find(e=>e.id===id);
const selfEmp=()=>{const u=me();return u&&u.id?(emps().find(e=>e.userId===u.id&&e.active!==false)||null):null};
const NOHR='ليست لديك صلاحية الموارد البشرية',NOPAY='ليست لديك صلاحية الرواتب';

/* ---------- التواريخ والأوقات ---------- */
const pd=s=>{const a=String(s).split('-').map(Number);return new Date(Date.UTC(a[0],a[1]-1,a[2]))};
const fd=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>fd(new Date(pd(s).getTime()+n*864e5));
const dow=s=>pd(s).getUTCDay();
const mEnd=m=>{const a=m.split('-').map(Number);return fd(new Date(Date.UTC(a[0],a[1],0)))};
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&fd(pd(s))===s;
const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m||'');
const mins=t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(t||'');return m&&+m[1]<24&&+m[2]<60?(+m[1])*60+(+m[2]):null};
const hm=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const nowHM=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const nextMonth=(m,n)=>{const a=m.split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1+n,1));return fd(d).slice(0,7)};
const DAYS=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const hrs=m=>(Math.round(m/6)/10)+' س';

/* ---------- السياسة والجدول ---------- */
const cfg=()=>{const s=db.settings||{};return{off:Array.isArray(s.hrOff)?s.hrOff:[5],leave:(s.hrLeaveDays==null||s.hrLeaveDays==='')?21:Math.max(0,num(s.hrLeaveDays)),
  grace:(s.hrGrace==null||s.hrGrace==='')?10:Math.max(0,num(s.hrGrace)),lateDed:s.hrLateDed===true,hol:Array.isArray(s.hrHolidays)?s.hrHolidays:[],start:s.hrStart||'09:00',end:s.hrEnd||'17:00',otRate:Math.max(0,num(s.hrOtRate)),carry:Math.max(0,num(s.hrCarry))}};
const sched=e=>{const c=cfg(),st=mins(e.shiftStart)!=null?mins(e.shiftStart):mins(c.start),en=mins(e.shiftEnd)!=null?mins(e.shiftEnd):mins(c.end);
  return{off:Array.isArray(e.offDays)?e.offDays:c.off,st,en,len:en>st?en-st:en-st+1440,hol:c.hol,grace:c.grace}};
const employed=(e,d)=>(!e.hired||d>=e.hired)&&(!e.endDate||d<=e.endDate);
const isWork=(e,d)=>{const s=sched(e);return !s.off.includes(dow(d))&&!s.hol.includes(d)};
/* الأجور (الراتب/البدلات/العمولة) في مجموعة مستقلة empPay (صف لكل موظف بمعرّفه) كي يمكن حجبها في القاعدة دون تعطيل بطاقة «حضوري».
   القراءة تتراجع إلى الحقول القديمة داخل صف الموظف إلى أن يرحّلها مستخدم بصلاحية payroll (payMigrate) فلا ينكسر شيء قبل الترحيل. */
const pf=e=>{const r=payRows().find(x=>x.id===e.id)||e;return{salary:Math.max(0,num(r.salary)),allow:Array.isArray(r.allow)?r.allow:[],commRate:Math.max(0,num(r.commRate))}};
const allowSum=e=>r2(pf(e).allow.reduce((a,x)=>a+Math.max(0,num(x.a)),0));
function payMigrate(){if(!canPay())return 0;let n=0;
  emps().forEach(e=>{if(e.salary===undefined&&e.allow===undefined&&e.commRate===undefined)return;
    if(!payRows().some(x=>x.id===e.id))payRows().push({id:e.id,salary:Math.max(0,r2(num(e.salary))),allow:Array.isArray(e.allow)?e.allow:[],commRate:Math.max(0,r2(num(e.commRate)))});
    delete e.salary;delete e.allow;delete e.commRate;n++});
  if(n){L('pay_migrate','الأجور','نُقل '+n+' موظف إلى مجموعة الأجور المستقلة');save()}return n}
function setPay(id,v){let r=payRows().find(x=>x.id===id);if(!r){r={id};payRows().push(r)}Object.assign(r,v);return r}
const leaveAllow=e=>e.leaveDays==null||e.leaveDays===''?cfg().leave:Math.max(0,num(e.leaveDays));
const paidMonth=(emp,m)=>pays().some(p=>p.emp===emp&&p.month===m);
const lockMsg=d=>{const f=window.ORVEX_FIN;return f&&f.lockDate&&f.lockDate()&&d<=f.lockDate()?'التاريخ ضمن فترة مقفلة حتى '+f.lockDate():''};
const attId=(emp,d)=>'att-'+emp+'-'+d;
const attOf=(emp,d)=>atts().find(x=>x.id===attId(emp,d)&&!x.void);
const leaveOn=(emp,d,st)=>leaves().find(l=>l.emp===emp&&(st?l.status===st:(l.status==='approved'||l.status==='pending'))&&l.from<=d&&d<=l.to);
const diffMin=(a,b,over)=>{let x=b-a;if(x<=0&&over)x+=1440;return x};

/* ---------- حالة يوم وإحصاء شهر ---------- */
function dayStatus(e,d,asOf){
  if(!employed(e,d))return{st:'na'};
  const r=attOf(e.id,d);if(r&&r.in)return{st:'present',rec:r};
  if(!isWork(e,d))return{st:'off'};
  if(d>(asOf||today()))return{st:'future'};
  const l=leaveOn(e.id,d,'approved');if(l)return{st:l.kind==='unpaid'?'unpaid':'leave',leave:l};
  if(e.trackAtt!==true)return{st:'assumed'};            /* لا يتتبع الحضور: يُعدّ حاضرًا ولا يُخصم */
  return{st:'absent',pending:!!leaveOn(e.id,d,'pending')};
}
function monthStats(e,m,asOf){
  const ms=m+'-01',me_=mEnd(m),s={total:0,empl:0,present:0,assumed:0,leave:0,unpaid:0,absent:0,lateMin:0,earlyMin:0,otMin:0,workMin:0,open:0,pendingDays:0};
  for(let d=ms;d<=me_;d=addDays(d,1)){
    if(isWork(e,d)){s.total++;if(employed(e,d))s.empl++}
    const x=dayStatus(e,d,asOf);
    if(x.st==='present'){s.present++;s.lateMin+=num(x.rec.lateMin);s.earlyMin+=num(x.rec.earlyMin);s.otMin+=num(x.rec.otMin);s.workMin+=num(x.rec.workMin);if(!x.rec.out)s.open++}
    else if(s[x.st]!==undefined&&x.st!=='total'){s[x.st]++;if(x.st==='absent'&&x.pending)s.pendingDays++}
  }
  return s}

/* ---------- الموظفون ---------- */
function parseAllow(t){const list=[];for(const raw of String(t||'').split('\n')){const ln=raw.trim();if(!ln)continue;const m=/^(.+?)\s*[=:：]\s*([\d.٠-٩٫]+)$/.exec(ln);if(!m)return{err:'سطر بدل غير صحيح: «'+ln+'» (الصيغة: الاسم=المبلغ)'};const a=r2(num(m[2]));if(!(a>0))return{err:'مبلغ البدل يجب أن يكون أكبر من صفر'};list.push({n:m[1].trim(),a})}return{list}}
function saveEmp(id,o){
  if(!canHr()&&!canPay())return{err:NOHR};
  const e0=id?empOf(id):null;if(id&&!e0)return{err:'الموظف غير موجود'};if(canPay())payMigrate();
  if(!canHr()){                                   /* مسؤول الرواتب بلا صلاحية الموارد: الراتب والبدلات لموظف موجود فقط */
    if(!id)return{err:NOHR};const k={};['salary','allowText','allow','commRate'].forEach(x=>{if(o[x]!==undefined)k[x]=o[x]});o=k}
  o=Object.assign({},e0||{},o);
  if(e0&&canPay()){const q=pf(e0);if(o.salary===undefined)o.salary=q.salary;if(o.commRate===undefined)o.commRate=q.commRate;if(o.allowText==null&&o.allow===undefined)o.allow=q.allow}   /* تعديل جزئي لا يصفّر الأجور */
  const name=String(o.name||'').trim();if(!name)return{err:'أدخل الاسم'};
  if(emps().some(x=>x.id!==id&&lc(x.name)===lc(name)))return{err:'يوجد موظف بنفس الاسم'};
  const nid=String(o.nationalId||'').trim();if(nid&&emps().some(x=>x.id!==id&&lc(x.nationalId)===lc(nid)))return{err:'رقم الهوية مسجّل لموظف آخر'};
  if(o.hired&&!validDate(o.hired))return{err:'تاريخ التعيين غير صحيح'};
  if(o.shiftStart&&mins(o.shiftStart)==null||o.shiftEnd&&mins(o.shiftEnd)==null)return{err:'وقت الدوام غير صحيح'};
  if(o.offDays&&(!Array.isArray(o.offDays)||o.offDays.some(x=>!(x>=0&&x<=6))))return{err:'أيام العطلة غير صحيحة'};
  if(o.userId){const u=(db.users||[]).find(x=>x.id===o.userId);if(!u)return{err:'المستخدم المربوط غير موجود'};
    const other=emps().find(x=>x.id!==id&&x.userId===o.userId);if(other)return{err:'المستخدم مربوط بالموظف «'+other.name+'»'}}
  let al=null;if(canPay()){al=parseAllow(o.allowText!=null?o.allowText:(o.allow||[]).map(x=>x.n+'='+x.a).join('\n'));if(al.err)return al;
    if(num(o.salary)<0)return{err:'الراتب غير صحيح'};if(o.commRate!==undefined&&o.commRate!==''&&(num(o.commRate)<0||num(o.commRate)>100))return{err:'نسبة العمولة بين 0 و100'}}
  if(o.leaveDays!==undefined&&o.leaveDays!==''&&o.leaveDays!==null&&num(o.leaveDays)<0)return{err:'رصيد الإجازة غير صحيح'};
  const active=o.active!==false,end=active?'':(o.endDate||today());
  if(!active&&!validDate(end))return{err:'تاريخ انتهاء الخدمة غير صحيح'};
  const f={name,job:String(o.job||'').trim(),dept:String(o.dept||'').trim(),phone:String(o.phone||'').trim(),nationalId:nid,address:String(o.address||'').trim(),
    emName:String(o.emName||'').trim(),emPhone:String(o.emPhone||'').trim(),hired:o.hired||'',note:String(o.note||'').trim(),active,endDate:end,userId:o.userId||'',
    shiftStart:o.shiftStart||'',shiftEnd:o.shiftEnd||'',trackAtt:o.trackAtt===true,leaveDays:(o.leaveDays===''||o.leaveDays==null)?'':Math.max(0,num(o.leaveDays))};
  if(Array.isArray(o.offDays)){const c=cfg().off.slice().sort().join(),n=o.offDays.map(Number).sort().join();if(n!==c)f.offDays=o.offDays.map(Number)}
  const pv=canPay()?{salary:Math.max(0,r2(num(o.salary))),allow:al.list,commRate:Math.min(100,Math.max(0,r2(num(o.commRate))))}:null;
  const fields=['name','job','dept','phone','nationalId','hired','active','endDate','userId','shiftStart','shiftEnd','trackAtt','leaveDays','offDays'];
  const snap=e=>{const r={};fields.forEach(k=>{if(e[k]!==undefined)r[k]=e[k]});if(canPay()){const q=pf(e);r.salary=q.salary;r.allow=q.allow;r.commRate=q.commRate}return r};
  if(e0){const b=snap(e0);if(Array.isArray(o.offDays)&&!f.offDays)delete e0.offDays;Object.assign(e0,f);if(pv)setPay(e0.id,pv);
    const diff=fields.concat(canPay()?['salary','allow','commRate']:[]).filter(k=>JSON.stringify(b[k])!==JSON.stringify(snap(e0)[k])).join('، ');
    L('emp_edit',name,diff?'تغيّر: '+diff:'بلا تغيير',{b,a:snap(e0)});
    if(b.userId!==e0.userId)L('emp_link',name,e0.userId?'ربط بمستخدم':'فك الربط',{b:{userId:b.userId||''},a:{userId:e0.userId||''}});
    save();return{ok:e0}}
  const e=Object.assign({id:uid()},f);emps().push(e);if(pv)setPay(e.id,pv);L('emp_add',name,canPay()?'راتب '+pf(e).salary:'',{a:snap(e)});save();return{ok:e}}

/* ---------- الحضور والانصراف ---------- */
function attAuth(e,o){const self=selfEmp();return canHr()||(self&&self.id===e.id&&!o.date&&!o.time)}
function punchIn(empId,o){o=o||{};const e=empOf(empId);if(!e)return{err:'الموظف غير موجود'};
  if(!attAuth(e,o))return{err:'لا يمكنك تسجيل حضور موظف آخر'};
  const hr=canHr(),date=hr&&o.date?o.date:today(),time=hr&&o.time?o.time:nowHM();
  if(!validDate(date)||mins(time)==null)return{err:'التاريخ أو الوقت غير صحيح'};
  if(e.active===false||!employed(e,date))return{err:'الموظف غير على رأس العمل في هذا التاريخ'};
  if(date>today())return{err:'لا يمكن تسجيل حضور في تاريخ مستقبلي'};
  if(paidMonth(e.id,date.slice(0,7)))return{err:'صُرف راتب هذا الشهر؛ الحضور مقفل'};
  const old=atts().find(x=>x.id===attId(e.id,date));
  if(old&&!old.void)return{err:'سُجّل حضور هذا اليوم مسبقًا'};if(old&&old.void)return{err:'السجل ملغى؛ يعدّله مسؤول الموارد البشرية'};
  if(leaveOn(e.id,date,'approved'))return{err:'الموظف في إجازة معتمدة في هذا اليوم'};
  const s=sched(e),raw=Math.max(0,mins(time)-s.st),r={id:attId(e.id,date),emp:e.id,date,in:time,out:'',src:(selfEmp()&&selfEmp().id===e.id&&!o.date)?'self':'manual',by:me().name||'',st:hm(s.st),en:hm(s.en),lateMin:raw>s.grace?raw:0};
  atts().push(r);L('att_in',e.name,date+' '+time+(r.lateMin?' | تأخير '+r.lateMin+' د':''));save();return{ok:r}}
function punchOut(empId,o){o=o||{};const e=empOf(empId);if(!e)return{err:'الموظف غير موجود'};
  if(!attAuth(e,o))return{err:'لا يمكنك تسجيل انصراف موظف آخر'};
  const hr=canHr(),date=hr&&o.date?o.date:today(),time=hr&&o.time?o.time:nowHM();
  if(!validDate(date)||mins(time)==null)return{err:'التاريخ أو الوقت غير صحيح'};
  const r=attOf(e.id,date);if(!r)return{err:'لا يوجد تسجيل حضور لهذا اليوم'};if(r.out)return{err:'سُجّل الانصراف مسبقًا'};
  if(paidMonth(e.id,date.slice(0,7)))return{err:'صُرف راتب هذا الشهر؛ الحضور مقفل'};
  const s=sched(e),over=mins(r.en)<=mins(r.st);if(mins(time)<=mins(r.in)&&!over)return{err:'وقت الانصراف يجب أن يكون بعد الحضور'};
  fillOut(r,time);L('att_out',e.name,date+' '+time+' | '+hrs(r.workMin));save();return{ok:r}}
function fillOut(r,time){const a=mins(r.in),b=mins(time),st=mins(r.st),en=mins(r.en),over=en<=st,out=b<=a&&over?b+1440:b,endAbs=over?en+1440:en;
  r.out=time;r.workMin=Math.max(0,out-a);r.earlyMin=Math.max(0,endAbs-out);r.otMin=Math.max(0,out-endAbs)}
function attEdit(empId,date,o){
  if(!canHr())return{err:NOHR};const e=empOf(empId);if(!e)return{err:'الموظف غير موجود'};
  if(!validDate(date)||date>today())return{err:'تاريخ غير صحيح'};
  const reason=String(o.reason||'').trim();if(!reason)return{err:'اكتب سبب التعديل'};
  if(paidMonth(e.id,date.slice(0,7)))return{err:'صُرف راتب هذا الشهر؛ ألغِ الصرف أولًا لتعديل الحضور'};
  if(!employed(e,date))return{err:'الموظف غير على رأس العمل في هذا التاريخ'};
  const old=atts().find(x=>x.id===attId(e.id,date)),b=old?{in:old.in,out:old.out,void:!!old.void}:null;
  if(o.void){if(!old||old.void)return{err:'لا يوجد سجل لإلغائه'};old.void=true;old.edited=1;L('att_edit',e.name,date+' | إلغاء | '+reason,{b,a:{void:true}});save();return{ok:old}}
  if(mins(o.in)==null)return{err:'وقت الحضور غير صحيح'};if(o.out&&mins(o.out)==null)return{err:'وقت الانصراف غير صحيح'};
  const s=sched(e);let r=old;
  if(!r){r={id:attId(e.id,date),emp:e.id,date,in:o.in,out:'',src:'manual',by:me().name||'',st:hm(s.st),en:hm(s.en),lateMin:0};atts().push(r)}
  if(o.out&&mins(o.out)<=mins(o.in)&&mins(r.en)>mins(r.st)){if(!old)atts().pop();return{err:'وقت الانصراف يجب أن يكون بعد الحضور'}}
  r.void=false;r.in=o.in;r.out='';r.workMin=0;r.earlyMin=0;r.otMin=0;const raw=Math.max(0,mins(o.in)-mins(r.st));r.lateMin=raw>s.grace?raw:0;
  if(o.out)fillOut(r,o.out);r.edited=1;r.editBy=me().name||'';
  L('att_edit',e.name,date+' | '+reason,{b:b||'لا سجل',a:{in:r.in,out:r.out}});save();return{ok:r}}

/* ---------- الإجازات ---------- */
const leaveDays=(e,f,t)=>{let n=0;for(let d=f;d<=t;d=addDays(d,1))if(isWork(e,d))n++;return n};
const monthsOf=(f,t)=>{const o=[];for(let m=f.slice(0,7);m<=t.slice(0,7);m=nextMonth(m,1))o.push(m);return o};
const usedAnnual=(emp,y,skip)=>r2(leaves().filter(l=>l.emp===emp&&l.kind==='annual'&&(l.status==='approved'||l.status==='pending')&&l.id!==skip&&String(l.from).slice(0,4)===String(y)).reduce((a,l)=>a+num(l.days),0));
/* ترحيل رصيد الإجازة: ما بقي من السنة السابقة يُرحَّل بسقف hrCarry يومًا (0 = لا ترحيل)، وتُسلسَل السنوات من سنة التعيين (حدّ أقصى 5 سنوات للخلف) */
const carryIn=(e,y)=>{const cap=cfg().carry;if(!(cap>0))return 0;y=+y;const hy=e.hired?+String(e.hired).slice(0,4):y-5,first=Math.max(hy,y-5);let c=0;
  for(let yr=first;yr<y;yr++)c=Math.min(cap,Math.max(0,r2(leaveAllow(e)+c-usedAnnual(e.id,yr))));return r2(c)};
const entitle=(e,y)=>r2(leaveAllow(e)+carryIn(e,y));
const leaveBalance=(empId,y)=>{const e=empOf(empId);return e?r2(entitle(e,y)-usedAnnual(empId,y)):0};
const KINDS={annual:'سنوية',sick:'مرضية',unpaid:'بلا راتب',other:'أخرى'};
function leaveReq(o){
  if(!canHr())return{err:NOHR};const e=empOf(o.emp);if(!e)return{err:'الموظف غير موجود'};
  if(!validDate(o.from)||!validDate(o.to)||o.from>o.to)return{err:'تواريخ الإجازة غير صحيحة'};
  const kind=o.kind||'annual';if(!KINDS[kind])return{err:'نوع إجازة غير صحيح'};
  if(e.active===false)return{err:'الموظف موقوف'};if(e.hired&&o.from<e.hired)return{err:'الإجازة قبل تاريخ التعيين'};
  if(o.from.slice(0,4)!==o.to.slice(0,4))return{err:'الإجازة تعبر سنتين؛ قسّمها إلى طلبين'};
  const days=leaveDays(e,o.from,o.to);if(days<=0)return{err:'لا توجد أيام عمل ضمن الفترة (كلها عطل)'};
  const bad=monthsOf(o.from,o.to).find(m=>paidMonth(e.id,m));if(bad)return{err:'صُرف راتب شهر '+bad+'؛ لا يمكن إضافة إجازة فيه'};
  if(leaves().some(l=>l.emp===e.id&&(l.status==='pending'||l.status==='approved')&&l.from<=o.to&&l.to>=o.from))return{err:'تتداخل مع إجازة أخرى للموظف'};
  if(kind==='annual'&&usedAnnual(e.id,o.from.slice(0,4))+days>entitle(e,o.from.slice(0,4)))return{err:'الرصيد لا يكفي: المتبقي '+leaveBalance(e.id,o.from.slice(0,4))+' يومًا والمطلوب '+days};
  const l={id:o.id||uid(),emp:e.id,name:e.name,from:o.from,to:o.to,days,kind,status:'pending',note:String(o.note||'').trim(),by:me().name||'',at:new Date().toISOString()};
  if(leaves().some(x=>x.id===l.id))return{err:'الطلب مسجّل مسبقًا'};
  leaves().push(l);L('leave_req',e.name,KINDS[kind]+' '+o.from+'→'+o.to+' ('+days+' يوم)');save();return{ok:l}}
function leaveDecide(id,dec,reason){
  if(!canHr())return{err:NOHR};const l=leaves().find(x=>x.id===id);if(!l)return{err:'الطلب غير موجود'};
  if(l.status!=='pending')return{err:'القرار نهائي ولا يُعاد'};if(dec!=='approved'&&dec!=='rejected')return{err:'قرار غير صحيح'};
  if(dec==='rejected'&&!String(reason||'').trim())return{err:'اكتب سبب الرفض'};
  const e=empOf(l.emp);if(dec==='approved'){const bad=monthsOf(l.from,l.to).find(m=>paidMonth(l.emp,m));if(bad)return{err:'صُرف راتب شهر '+bad+'؛ لا يمكن اعتماد الإجازة'};
    if(l.kind==='annual'&&e&&usedAnnual(l.emp,l.from.slice(0,4),l.id)+num(l.days)>entitle(e,l.from.slice(0,4)))return{err:'الرصيد لا يكفي'}}
  const b={status:l.status};l.status=dec;l.decidedBy=me().name||'';l.decidedAt=new Date().toISOString();if(reason)l.reason=String(reason).trim();
  L('leave_decide',l.name,(dec==='approved'?'اعتماد':'رفض')+' '+l.from+'→'+l.to+(reason?' | '+reason:''),{b,a:{status:dec}});save();return{ok:l}}
function leaveCancel(id,reason){
  if(!canHr())return{err:NOHR};const l=leaves().find(x=>x.id===id);if(!l)return{err:'الطلب غير موجود'};
  if(l.status!=='pending'&&l.status!=='approved')return{err:'لا يمكن إلغاء هذا الطلب'};if(!String(reason||'').trim())return{err:'اكتب سبب الإلغاء'};
  const bad=monthsOf(l.from,l.to).find(m=>paidMonth(l.emp,m));if(bad)return{err:'صُرف راتب شهر '+bad+'؛ ألغِ الصرف أولًا'};
  const b={status:l.status};l.status='cancelled';l.reason=String(reason).trim();l.decidedBy=me().name||'';l.decidedAt=new Date().toISOString();
  L('leave_cancel',l.name,l.from+'→'+l.to+' | '+reason,{b,a:{status:'cancelled'}});save();return{ok:l}}

/* ---------- السلف ---------- */
const instPlan=(amount,months,start)=>{const per=r2(amount/months),out=[];for(let i=0;i<months;i++)out.push({month:nextMonth(start,i),amount:i===months-1?r2(amount-per*(months-1)):per,paidIn:''});return out};
const advDue=(emp,m)=>advs().filter(a=>a.emp===emp&&a.status!=='void').flatMap(a=>(a.inst||[]).filter(i=>!i.paidIn&&i.month<=m).map(i=>({adv:a.id,i})));
const advLeft=a=>r2((a.inst||[]).filter(i=>!i.paidIn).reduce((s,i)=>s+i.amount,0));
function advGrant(o){
  if(!canPay())return{err:NOPAY};const e=empOf(o.emp);if(!e)return{err:'الموظف غير موجود'};if(e.active===false)return{err:'الموظف موقوف'};
  const amount=r2(num(o.amount)),months=Math.floor(num(o.months));if(!(amount>0))return{err:'مبلغ السلفة يجب أن يكون أكبر من صفر'};
  if(!(months>=1&&months<=60))return{err:'عدد الأقساط بين 1 و60'};const start=o.start||curM();if(!validMonth(start))return{err:'شهر البدء غير صحيح'};
  if(start<curM())return{err:'شهر البدء لا يسبق الشهر الحالي'};
  const lk=lockMsg(today());if(lk)return{err:lk};
  const a={id:o.id||uid(),emp:e.id,name:e.name,amount,months,start,date:today(),note:String(o.note||'').trim(),status:'open',inst:instPlan(amount,months,start),by:me().name||''};
  if(advs().some(x=>x.id===a.id))return{err:'السلفة مسجّلة مسبقًا'};
  advs().push(a);db.expenses.push({id:'exp-adv-'+a.id,cat:'رواتب',amount,date:a.date,note:'سلفة '+e.name});
  L('adv_grant',e.name,amount+' على '+months+' قسط من '+start,{a:{amount,months,start}});save();return{ok:a}}
function advResched(id,months,start){
  if(!canPay())return{err:NOPAY};const a=advs().find(x=>x.id===id);if(!a||a.status==='void')return{err:'السلفة غير موجودة'};
  months=Math.floor(num(months));start=start||curM();if(!(months>=1&&months<=60))return{err:'عدد الأقساط بين 1 و60'};if(!validMonth(start))return{err:'شهر البدء غير صحيح'};
  const left=advLeft(a);if(!(left>0))return{err:'لا رصيد متبقٍ للجدولة'};
  const paid=(a.inst||[]).filter(i=>i.paidIn);if(paid.some(i=>i.month>=start))return{err:'شهر البدء يتداخل مع أقساط مسدّدة'};
  const b={inst:a.inst.filter(i=>!i.paidIn).map(i=>i.month+'='+i.amount).join(',')};a.inst=paid.concat(instPlan(left,months,start));
  L('adv_resched',a.name,'المتبقي '+left+' على '+months+' قسط من '+start,{b,a:{inst:a.inst.filter(i=>!i.paidIn).map(i=>i.month+'='+i.amount).join(',')}});save();return{ok:a}}
function advVoid(id,reason){
  if(!canPay())return{err:NOPAY};const a=advs().find(x=>x.id===id);if(!a||a.status==='void')return{err:'السلفة غير موجودة'};
  if(!String(reason||'').trim())return{err:'اكتب سبب الإلغاء'};if((a.inst||[]).some(i=>i.paidIn))return{err:'سُدّد قسط منها؛ لا يمكن إلغاؤها'};
  const lk=lockMsg(a.date);if(lk)return{err:lk};
  a.status='void';a.reason=String(reason).trim();db.expenses=db.expenses.filter(x=>x.id!=='exp-adv-'+a.id);
  L('adv_void',a.name,a.amount+' | '+reason,{b:{amount:a.amount,status:'open'},a:{status:'void'}});save();return{ok:a}}

/* ---------- الرواتب ---------- */
function calcPay(e,m,adj){adj=adj||{};const st=monthStats(e,m),s=sched(e),fixedB=pf(e).salary,fixedA=allowSum(e),fixed=fixedB+fixedA,
  f=st.total>0?st.empl/st.total:1,base=r2(fixedB*f),allow=r2(fixedA*f),daily=st.total>0?fixed/st.total:0,
  absDed=r2(daily*st.absent),unpDed=r2(daily*st.unpaid),lateDed=cfg().lateDed&&s.len?r2(daily/s.len*st.lateMin):0,
  cr=Math.min(100,pf(e).commRate),commB=cr>0?commBase(e,m):0,comm=r2(commB*cr/100),
  otPay=cfg().otRate>0&&s.len?r2(daily/s.len*st.otMin*cfg().otRate):0,
  bonus=r2(Math.max(0,num(adj.bonus))),other=r2(Math.max(0,num(adj.other))),due=advDue(e.id,m),advD=r2(due.reduce((a,x)=>a+x.i.amount,0)),
  gross=r2(base+allow+bonus+otPay+comm),ded=r2(absDed+unpDed+lateDed+other+advD),warn=[];
  if(st.pendingDays)warn.push('يوجد طلب إجازة معلّق يمس أيام غياب هذا الشهر');if(st.open)warn.push(st.open+' يوم بلا تسجيل انصراف');
  return{st,base,allow,bonus,otPay,comm,commBase:commB,absDed,unpDed,lateDed,other,advD,due,gross,ded,net:r2(gross-ded),warn,daily:r2(daily)}}
/* العمولة: تُنسب الفاتورة إلى المندوب (rep) وإلا الكاشير (cashier) بمطابقة اسم الموظف أو اسم مستخدمه المربوط؛ الأساس = صافي الفواتير غير الملغاة − صافي مرتجعاتها خلال الشهر */
const salesKey=e=>{const k=[lc(e.name)],u=e.userId&&(db.users||[]).find(x=>x.id===e.userId);if(u){k.push(lc(u.name));if(u.username)k.push(lc(u.username))}return k};
const commBase=(e,m)=>{const keys=salesKey(e),mine=s=>keys.includes(lc(s.rep||s.cashier)),inM=d=>String(d||'').slice(0,7)===m,S=A('sales'),
  gross=S.filter(s=>!s.void&&mine(s)&&inM(s.date)).reduce((a,s)=>a+num(s.net),0),
  ret=A('returns').filter(r=>inM(r.date)).reduce((a,r)=>{const s=S.find(x=>x.id===r.saleId);return a+(s&&!s.void&&mine(s)?num(r.net):0)},0);
  return Math.max(0,r2(gross-ret))};
const empInMonth=(e,m)=>(!e.hired||e.hired<=mEnd(m))&&(!e.endDate||e.endDate>=m+'-01');
function payRun(empId,m,adj){
  if(!canPay())return{err:NOPAY};const e=empOf(empId);if(!e)return{err:'الموظف غير موجود'};
  if(!validMonth(m)||m>curM())return{err:'الشهر غير صحيح أو لم يبدأ بعد'};
  const id='pay-'+e.id+'-'+m;if(pays().some(p=>p.id===id))return{err:'صُرف راتب هذا الشهر مسبقًا'};
  if(!empInMonth(e,m))return{err:'الموظف غير موظَّف في هذا الشهر'};
  const lk=lockMsg(today());if(lk)return{err:lk};
  const c=calcPay(e,m,adj);if(c.st.pendingDays)return{err:'يوجد طلب إجازة معلّق يمس هذا الشهر؛ اعتمده أو ارفضه أولًا'};
  if(c.net<0)return{err:'الصافي سالب ('+c.net+'): خفّض الخصومات أو أعد جدولة السلفة'};
  const p={id,emp:e.id,name:e.name,month:m,base:c.base,allow:c.allow,bonus:c.bonus,deduct:c.ded,absDays:c.st.absent,absDed:c.absDed,unpDays:c.st.unpaid,unpDed:c.unpDed,lateMin:c.st.lateMin,lateDed:c.lateDed,otMin:c.st.otMin,otPay:c.otPay,comm:c.comm,commBase:c.commBase,
    otherDed:c.other,advDed:c.advD,workDays:c.st.total,presentDays:c.st.present+c.st.assumed,gross:c.gross,net:c.net,date:today(),by:me().name||''};
  pays().push(p);c.due.forEach(x=>{x.i.paidIn=id});
  if(c.net>0)db.expenses.push({id:'exp-'+id,cat:'رواتب',amount:c.net,date:p.date,note:'راتب '+e.name+' — '+m});
  L('payroll_pay',e.name,m+' | الصافي '+c.net+(c.ded?' | خصومات '+c.ded:''),{a:{gross:c.gross,deduct:c.ded,net:c.net}});save();return{ok:p}}
function payCancel(id,reason){
  if(!canPay())return{err:NOPAY};const p=pays().find(x=>x.id===id);if(!p)return{err:'الصرف غير موجود'};
  if(!String(reason||'').trim())return{err:'اكتب سبب الإلغاء'};const lk=lockMsg(p.date);if(lk)return{err:lk};
  advs().forEach(a=>(a.inst||[]).forEach(i=>{if(i.paidIn===id)i.paidIn=''}));
  db.payroll=pays().filter(x=>x.id!==id);db.expenses=db.expenses.filter(x=>x.id!=='exp-'+id);
  L('payroll_cancel',p.name,p.month+' | '+p.net+' | '+reason,{b:{month:p.month,gross:p.gross,deduct:p.deduct,net:p.net},a:{cancelled:true}});save();return{ok:true}}

window.ORVEX_HR={cfg,sched,monthStats,dayStatus,calcPay,pay:pf,payMigrate,commBase,slipHtml,carryIn,entitle,saveEmp,punchIn,punchOut,attEdit,leaveReq,leaveDecide,leaveCancel,leaveBalance,leaveDays,advGrant,advResched,advVoid,advLeft,advDue,payRun,payCancel,parseAllow,canHr,canPay,selfEmp,empInMonth};
window.ORVEX_STAFF={emps,pays,eid:(e,m)=>'pay-'+e+'-'+m};

/* ================= الواجهة ================= */
const T=r=>r&&r.err?(toast(r.err),false):true;
const badge=(t,c)=>`<span class="badge"${c?` style="background:${c}"`:''}>${esc(t)}</span>`;
const back=(fn,l)=>`<button class="btn ghost" onclick="${fn}">${l||'رجوع'}</button>`;
const ST={present:'حاضر',leave:'إجازة',unpaid:'إجازة بلا راتب',absent:'غائب',off:'عطلة',future:'—',na:'—',assumed:'حاضر (بلا تتبع)'};
const eName=id=>(empOf(id)||{}).name||'';

window.hrOpen=function(){try{payMigrate()}catch(_){}
  if(!canHr()&&!canPay())return toast(NOHR);
  const d=today(),act=emps().filter(e=>e.active!==false&&employed(e,d)),n={p:0,l:0,a:0,v:0};
  act.forEach(e=>{const x=dayStatus(e,d);if(x.st==='present'){n.p++;if(x.rec.lateMin)n.l++}else if(x.st==='leave'||x.st==='unpaid')n.v++;else if(x.st==='absent')n.a++});
  const pend=leaves().filter(l=>l.status==='pending').length;
  modal('الموارد البشرية',`<div class="card"><div class="row"><div class="grow"><div class="t">اليوم ${esc(fdate(d))}</div><small>${act.length} موظف على رأس العمل</small></div></div>
  <div class="f2" style="padding:8px 12px"><div>حاضر: <b>${n.p}</b></div><div>متأخر: <b>${n.l}</b></div><div>في إجازة: <b>${n.v}</b></div><div>غائب (متتبَّع): <b>${n.a}</b></div></div></div>
  <div class="actions" style="flex-wrap:wrap">${canHr()?`<button class="btn" onclick="staffOpen()">👥 الموظفون</button><button class="btn" onclick="attOpen()">🕒 الحضور</button><button class="btn" onclick="leavesOpen()">🏖 الإجازات${pend?' ('+pend+')':''}</button><button class="btn" onclick="attReport()">📋 تقرير الحضور</button>`:''}
  ${canPay()?`<button class="btn primary" onclick="payrollOpen()">💵 الرواتب</button><button class="btn" onclick="advOpen()">🤝 السلف</button><button class="btn" onclick="hrSettings()">⚙ السياسة</button>`:''}</div>`)};

window.staffOpen=function(){
  if(!canHr()&&!canPay())return toast(NOHR);
  const us=id=>((db.users||[]).find(u=>u.id===id)||{}).username;
  const E=emps().slice().sort((a,b)=>(b.active!==false)-(a.active!==false)||String(a.name).localeCompare(String(b.name),'ar'));
  modal('الموظفون',`<div class="card">${E.length?E.map(e=>`<div class="row" onclick="empForm('${jsq(e.id)}')"><div class="grow"><div class="t">${esc(e.name)} ${e.active===false?badge('منتهي'):''}</div><small>${esc(e.job||'')}${e.dept?' — '+esc(e.dept):''}${e.userId&&us(e.userId)?' — 👤 @'+esc(us(e.userId)):''}</small></div>${canPay()?`<div class="end"><b>${money(pf(e).salary+allowSum(e))}</b></div>`:''}</div>`).join(''):'<p class="muted">لا يوجد موظفون بعد.</p>'}</div>
  <div class="actions">${canHr()?`<button class="btn primary" onclick="empForm()">+ موظف</button>`:''}${back('hrOpen()')}</div>`)};

window.empForm=function(id){
  if(!canHr()&&!canPay())return toast(NOHR);
  if(!canHr()){const x=id&&empOf(id);if(!x)return toast(NOHR);
    return modal('راتب '+x.name,`<div class="f2"><div><label>الراتب الأساسي</label><input id="em_s" type="number" inputmode="decimal" value="${pf(x).salary}"></div><div></div></div>
    <label>عمولة المبيعات (٪ من صافي مبيعاته الشهرية، 0 = بلا عمولة)</label><input id="em_cm" type="number" inputmode="decimal" min="0" max="100" value="${pf(x).commRate}">
  <label>البدلات (سطر لكل بدل: الاسم=المبلغ)</label><textarea id="em_al" rows="3">${esc(pf(x).allow.map(a=>a.n+'='+a.a).join('\n'))}</textarea>
    <div class="actions"><button class="btn primary" onclick="empSave('${jsq(id)}')">حفظ</button>${back('staffOpen()')}</div>`)}
  const e=id?empOf(id):{name:'',job:'',dept:'',phone:'',nationalId:'',address:'',emName:'',emPhone:'',hired:today(),salary:'',allow:[],active:true,note:'',trackAtt:true,userId:''};if(!e)return;
  const s=sched(e),c=cfg(),taken=emps().filter(x=>x.id!==id&&x.userId).map(x=>x.userId),users=(db.users||[]).filter(u=>u.active!==false&&!taken.includes(u.id));
  const lu=e.userId?(db.users||[]).find(u=>u.id===e.userId):null;
  modal(id?'ملف الموظف':'موظف جديد',`<label>الاسم</label><input id="em_n" value="${esc(e.name)}">
  <div class="f2"><div><label>الوظيفة</label><input id="em_j" value="${esc(e.job||'')}"></div><div><label>القسم</label><input id="em_d" value="${esc(e.dept||'')}"></div></div>
  <div class="f2"><div><label>الهاتف</label><input id="em_p" type="tel" value="${esc(e.phone||'')}"></div><div><label>رقم الهوية</label><input id="em_i" value="${esc(e.nationalId||'')}"></div></div>
  <label>العنوان</label><input id="em_ad" value="${esc(e.address||'')}">
  <div class="f2"><div><label>جهة طوارئ</label><input id="em_en" value="${esc(e.emName||'')}"></div><div><label>هاتف الطوارئ</label><input id="em_ep" type="tel" value="${esc(e.emPhone||'')}"></div></div>
  <label>تاريخ التعيين</label><input id="em_h" type="date" value="${esc(e.hired||'')}">
  ${canPay()?`<div class="f2"><div><label>الراتب الأساسي</label><input id="em_s" type="number" inputmode="decimal" value="${pf(e).salary||''}"></div><div><label>رصيد الإجازة السنوي (فارغ = ${c.leave})</label><input id="em_lv" type="number" inputmode="decimal" value="${e.leaveDays??''}"></div></div>
  <label>عمولة المبيعات (٪ من صافي مبيعاته الشهرية، 0 = بلا عمولة)</label><input id="em_cm" type="number" inputmode="decimal" min="0" max="100" value="${pf(e).commRate}">
  <label>البدلات (سطر لكل بدل: الاسم=المبلغ)</label><textarea id="em_al" rows="3">${esc(pf(e).allow.map(x=>x.n+'='+x.a).join('\n'))}</textarea>`:`<label>رصيد الإجازة السنوي (فارغ = ${c.leave})</label><input id="em_lv" type="number" inputmode="decimal" value="${e.leaveDays??''}"><p class="muted" style="font-size:12.5px">بيانات الراتب مخفية: تحتاج صلاحية «الرواتب».</p>`}
  <label>الدوام (فارغ = الافتراضي ${esc(c.start)}–${esc(c.end)})</label><div class="f2"><input id="em_ss" type="time" value="${esc(e.shiftStart||'')}"><input id="em_se" type="time" value="${esc(e.shiftEnd||'')}"></div>
  <label>أيام العطلة الأسبوعية</label><div class="chips">${DAYS.map((n,i)=>`<label class="pchk" style="border:0"><input type="checkbox" id="em_o${i}" ${s.off.includes(i)?'checked':''}> ${n}</label>`).join('')}</div>
  <label class="pchk" style="border:0"><input type="checkbox" id="em_t" ${e.trackAtt===true?'checked':''}> يُتتبَّع حضوره (الغياب يُخصم من الراتب)</label>
  <label>ربط بمستخدم في النظام</label><select id="em_u"><option value="">— بلا ربط —</option>${lu&&!users.includes(lu)?`<option value="${esc(lu.id)}" selected>@${esc(lu.username)} — ${esc(lu.name)}</option>`:''}${users.map(u=>`<option value="${esc(u.id)}" ${u.id===e.userId?'selected':''}>@${esc(u.username)} — ${esc(u.name)}</option>`).join('')}</select>
  ${lu&&isAdmin()?`<button class="btn" onclick="userForm('${jsq(lu.id)}')">🔑 صلاحيات المستخدم</button>`:''}
  <label>ملاحظة</label><input id="em_t2" value="${esc(e.note||'')}">
  <label class="pchk" style="border:0"><input type="checkbox" id="em_a" ${e.active!==false?'checked':''}> على رأس العمل</label>
  <label>تاريخ انتهاء الخدمة (عند الإيقاف)</label><input id="em_ed" type="date" value="${esc(e.endDate||'')}">
  <div class="actions"><button class="btn primary" onclick="empSave('${jsq(id||'')}')">حفظ</button>${back('staffOpen()')}</div>`)};

window.empSave=function(id){
  if(!canHr()){if(T(saveEmp(id,{salary:V('em_s'),allowText:V('em_al'),commRate:V('em_cm')}))){toast('تم الحفظ');staffOpen()}return}
  const o={name:V('em_n'),job:V('em_j'),dept:V('em_d'),phone:V('em_p'),nationalId:V('em_i'),address:V('em_ad'),emName:V('em_en'),emPhone:V('em_ep'),hired:V('em_h'),shiftStart:V('em_ss'),shiftEnd:V('em_se'),
    leaveDays:V('em_lv'),trackAtt:C('em_t'),userId:V('em_u'),note:V('em_t2'),active:C('em_a'),endDate:V('em_ed'),offDays:DAYS.map((x,i)=>C('em_o'+i)?i:-1).filter(i=>i>=0)};
  if(canPay()){o.salary=V('em_s');o.allowText=V('em_al');o.commRate=V('em_cm')}
  if(T(saveEmp(id,o))){toast('تم الحفظ');staffOpen()}};

/* ---- الحضور ---- */
window.hrPunch=function(kind,emp,date,back_){
  const r=kind==='in'?punchIn(emp,{}):punchOut(emp,{});if(T(r)){toast(kind==='in'?'تم تسجيل الحضور':'تم تسجيل الانصراف');if(back_==='card'){render()}else attOpen(date||today())}};
window.attOpen=function(d){
  if(!canHr())return toast(NOHR);d=d||window.__hrd||today();window.__hrd=d;
  const E=emps().filter(e=>e.active!==false&&employed(e,d)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));
  modal('الحضور — '+fdate(d),`<input type="date" value="${esc(d)}" max="${esc(today())}" onchange="attOpen(this.value)"><div class="card" style="margin-top:8px">${E.length?E.map(e=>{const x=dayStatus(e,d),r=x.rec;
    const line=r?`دخول ${esc(r.in)}${r.out?' — خروج '+esc(r.out)+' ('+hrs(r.workMin)+')':' — <b>لم ينصرف</b>'}${r.lateMin?' — تأخير '+r.lateMin+' د':''}${r.otMin?' — إضافي '+r.otMin+' د':''}`:(x.st==='absent'?'غائب':ST[x.st]||'');
    const bt=[];if(d===today()&&!r&&x.st!=='leave'&&x.st!=='unpaid')bt.push(`<button class="btn primary" onclick="hrPunch('in','${jsq(e.id)}','${jsq(d)}')">حضور</button>`);
    if(r&&!r.out&&d===today())bt.push(`<button class="btn" onclick="hrPunch('out','${jsq(e.id)}','${jsq(d)}')">انصراف</button>`);
    bt.push(`<button class="btn ghost" onclick="attForm('${jsq(e.id)}','${jsq(d)}')">تعديل</button>`);
    return `<div class="row"><div class="grow"><div class="t">${esc(e.name)} ${e.trackAtt===true?'':'<small>(بلا تتبع)</small>'}</div><small>${line}</small></div><div class="end">${bt.join('')}</div></div>`}).join(''):'<p class="muted">لا موظفون في هذا التاريخ.</p>'}</div><div class="actions">${back('hrOpen()')}</div>`)};
window.attForm=function(emp,d){
  const e=empOf(emp),r=attOf(emp,d);if(!e)return;
  modal('تعديل حضور — '+e.name,`<p class="muted">${esc(fdate(d))} — يُسجَّل السبب والقيم قبل/بعد في سجل التدقيق.</p><div class="f2"><div><label>الحضور</label><input id="at_i" type="time" value="${esc(r?r.in:'')}"></div><div><label>الانصراف</label><input id="at_o" type="time" value="${esc(r?r.out:'')}"></div></div>
  <label>السبب (إلزامي)</label><input id="at_r"><div class="actions"><button class="btn primary" onclick="attSave('${jsq(emp)}','${jsq(d)}')">حفظ</button>${r?`<button class="btn danger" onclick="attVoidUI('${jsq(emp)}','${jsq(d)}')">إلغاء السجل</button>`:''}${back("attOpen('"+jsq(d)+"')")}</div>`)};
window.attSave=function(emp,d){if(T(attEdit(emp,d,{in:V('at_i'),out:V('at_o'),reason:V('at_r')}))){toast('تم الحفظ');attOpen(d)}};
window.attVoidUI=function(emp,d){if(T(attEdit(emp,d,{void:true,reason:V('at_r')}))){toast('أُلغي السجل');attOpen(d)}};
window.attReport=function(m){
  if(!canHr())return toast(NOHR);m=m||window.__hrm||curM();window.__hrm=m;
  const E=emps().filter(e=>empInMonth(e,m));
  modal('تقرير الحضور '+m,`<input type="month" value="${esc(m)}" onchange="attReport(this.value)"><div class="card" style="margin-top:8px">${E.length?E.map(e=>{const s=monthStats(e,m);return `<div class="row"><div class="grow"><div class="t">${esc(e.name)}</div><small>أيام العمل ${s.total} — حضور ${s.present+s.assumed} — غياب ${s.absent} — إجازة ${s.leave+s.unpaid}</small><br><small>ساعات ${hrs(s.workMin)} — تأخير ${s.lateMin} د — إضافي ${s.otMin} د</small></div></div>`}).join(''):'<p class="muted">لا موظفون.</p>'}</div><div class="actions">${back('hrOpen()')}</div>`)};

/* ---- الإجازات ---- */
window.leavesOpen=function(f){
  if(!canHr())return toast(NOHR);f=f||window.__hrlf||'pending';window.__hrlf=f;
  const LS={pending:'معلّقة',approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة',all:'الكل'},L_=leaves().filter(l=>f==='all'||l.status===f).slice().sort((a,b)=>a.from<b.from?1:-1);
  modal('الإجازات',chips(Object.entries(LS),f,'leavesOpen')+`<div class="card">${L_.length?L_.map(l=>`<div class="row"><div class="grow"><div class="t">${esc(l.name||eName(l.emp))} — ${KINDS[l.kind]||''} ${badge(LS[l.status]||l.status)}</div><small>${esc(l.from)} ← ${esc(l.to)} (${l.days} يوم)${l.note?' — '+esc(l.note):''}${l.reason?' — '+esc(l.reason):''}</small></div><div class="end">${l.status==='pending'?`<button class="btn primary" onclick="leaveAct('${jsq(l.id)}','approved')">اعتماد</button><button class="btn" onclick="leaveAct('${jsq(l.id)}','rejected')">رفض</button>`:''}${l.status==='pending'||l.status==='approved'?`<button class="btn ghost" onclick="leaveAct('${jsq(l.id)}','cancel')">إلغاء</button>`:''}</div></div>`).join(''):'<p class="muted">لا توجد طلبات.</p>'}</div>
  <div class="actions"><button class="btn primary" onclick="leaveForm()">+ طلب إجازة</button>${back('hrOpen()')}</div>`)};
window.leaveForm=function(){
  const E=emps().filter(e=>e.active!==false);if(!E.length)return toast('لا موظفون');const y=today().slice(0,4);
  modal('طلب إجازة',`<label>الموظف</label><select id="lv_e">${E.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (رصيد ${leaveBalance(e.id,y)})</option>`).join('')}</select>
  <label>النوع</label><select id="lv_k">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
  <div class="f2"><div><label>من</label><input id="lv_f" type="date" value="${esc(today())}"></div><div><label>إلى</label><input id="lv_t" type="date" value="${esc(today())}"></div></div>
  <label>ملاحظة</label><input id="lv_n"><div class="actions"><button class="btn primary" onclick="leaveSave()">إرسال الطلب</button>${back('leavesOpen()')}</div>`)};
window.leaveSave=function(){const r=leaveReq({emp:V('lv_e'),kind:V('lv_k'),from:V('lv_f'),to:V('lv_t'),note:V('lv_n')});if(T(r)){toast('سُجّل الطلب ('+r.ok.days+' يوم عمل)');leavesOpen('pending')}};
window.leaveAct=function(id,a){
  if(a==='approved'){if(T(leaveDecide(id,'approved'))){toast('اعتُمدت');leavesOpen()}return}
  const l=leaves().find(x=>x.id===id);if(!l)return;window.__lvAct=[id,a];
  modal(a==='rejected'?'رفض الطلب':'إلغاء الإجازة',`<label>السبب (إلزامي)</label><input id="lv_r"><div class="actions"><button class="btn danger" onclick="leaveActGo()">تأكيد</button>${back('leavesOpen()','إلغاء')}</div>`)};
window.leaveActGo=function(){const[id,a]=window.__lvAct||[];const r=a==='rejected'?leaveDecide(id,'rejected',V('lv_r')):leaveCancel(id,V('lv_r'));if(T(r)){toast('تم');leavesOpen()}};

/* ---- السياسة ---- */
window.hrSettings=function(){
  if(!canPay())return toast(NOPAY);const c=cfg();
  modal('سياسة الدوام والرواتب',`<label>العطلة الأسبوعية الافتراضية</label><div class="chips">${DAYS.map((n,i)=>`<label class="pchk" style="border:0"><input type="checkbox" id="hs_o${i}" ${c.off.includes(i)?'checked':''}> ${n}</label>`).join('')}</div>
  <div class="f2"><div><label>بداية الدوام</label><input id="hs_s" type="time" value="${esc(c.start)}"></div><div><label>نهاية الدوام</label><input id="hs_e" type="time" value="${esc(c.end)}"></div></div>
  <div class="f2"><div><label>سماح التأخير (دقيقة)</label><input id="hs_g" type="number" value="${c.grace}"></div><div><label>الإجازة السنوية (يوم)</label><input id="hs_l" type="number" value="${c.leave}"></div></div>
  <label class="pchk" style="border:0"><input type="checkbox" id="hs_ld" ${c.lateDed?'checked':''}> خصم التأخير من الراتب (بعد فترة السماح)</label>
  <div class="f2"><div><label>أجر الإضافي (معامل الساعة، 0 = بلا أجر)</label><input id="hs_ot" type="number" step="0.25" min="0" value="${c.otRate}"></div><div><label>أقصى رصيد إجازة يُرحَّل (يوم، 0 = لا ترحيل)</label><input id="hs_cy" type="number" min="0" value="${c.carry}"></div></div>
  <label>العطل الرسمية (تواريخ YYYY-MM-DD، كل سطر تاريخ)</label><textarea id="hs_h" rows="3">${esc(c.hol.join('\n'))}</textarea>
  <div class="actions"><button class="btn primary" onclick="hrSettingsSave()">حفظ</button>${back('hrOpen()')}</div>`)};
window.hrSettingsSave=function(){
  if(!canPay())return toast(NOPAY);
  const hol=V('hs_h').split(/[\n,،\s]+/).map(x=>x.trim()).filter(Boolean);if(hol.some(x=>!validDate(x)))return toast('تاريخ عطلة غير صحيح');
  if(mins(V('hs_s'))==null||mins(V('hs_e'))==null)return toast('وقت الدوام غير صحيح');
  const s=db.settings,b={hrOff:cfg().off,hrStart:cfg().start,hrEnd:cfg().end,hrGrace:cfg().grace,hrLeaveDays:cfg().leave,hrLateDed:cfg().lateDed,hrOtRate:cfg().otRate,hrCarry:cfg().carry};
  s.hrOff=DAYS.map((x,i)=>C('hs_o'+i)?i:-1).filter(i=>i>=0);s.hrStart=V('hs_s');s.hrEnd=V('hs_e');s.hrGrace=Math.max(0,num(V('hs_g')));s.hrLeaveDays=Math.max(0,num(V('hs_l')));s.hrLateDed=C('hs_ld');s.hrOtRate=Math.min(5,Math.max(0,num(V('hs_ot'))));s.hrCarry=Math.min(365,Math.max(0,Math.floor(num(V('hs_cy')))));s.hrHolidays=hol.sort();
  L('hr_policy','سياسة الدوام','',{b,a:{hrOff:s.hrOff,hrStart:s.hrStart,hrEnd:s.hrEnd,hrGrace:s.hrGrace,hrLeaveDays:s.hrLeaveDays,hrLateDed:s.hrLateDed,hrOtRate:s.hrOtRate,hrCarry:s.hrCarry}});save();toast('تم الحفظ');hrOpen()};

/* ---- الرواتب ---- */
window.payrollOpen=function(m){
  if(!canPay())return toast(NOPAY);payMigrate();m=m||window.__prm||curM();window.__prm=m;
  const E=emps().filter(e=>empInMonth(e,m)&&(e.active!==false||pays().some(p=>p.emp===e.id&&p.month===m))),P=pays().filter(p=>p.month===m),tot=r2(P.reduce((a,p)=>a+num(p.net),0));
  const card=e=>{const p=P.find(x=>x.emp===e.id);
    if(p)return `<div class="row"><div class="grow"><div class="t">${esc(e.name)} ${badge('مصروف')}</div><small>${esc(fdate(p.date))} — إجمالي ${money(p.gross!=null?p.gross:num(p.base)+num(p.bonus))} − خصومات ${money(p.deduct||0)}${p.absDays?' (غياب '+p.absDays+' يوم)':''}${p.advDed?' (سلف '+money(p.advDed)+')':''}</small></div><div class="end"><b>${money(p.net)}</b><br><button class="btn" onclick="paySlip('${jsq(p.id)}')">قسيمة</button> <button class="btn" onclick="payCancelUI('${jsq(p.id)}')">إلغاء</button></div></div>`;
    const c=calcPay(e,m,{});
    return `<div class="card" style="margin:6px 0"><div class="t">${esc(e.name)} <small>${e.trackAtt===true?'حضور '+(c.st.present)+'/'+c.st.empl+' يوم':'بلا تتبع حضور'}</small></div>
      <small>أساسي ${money(c.base)} + بدلات ${money(c.allow)}${c.absDed?' − غياب '+money(c.absDed)+' ('+c.st.absent+' يوم)':''}${c.unpDed?' − بلا راتب '+money(c.unpDed):''}${c.comm?' + عمولة '+money(c.comm):''}${c.otPay?' + إضافي '+money(c.otPay)+' ('+hrs(c.st.otMin)+')':''}${c.lateDed?' − تأخير '+money(c.lateDed):''}${c.advD?' − سلف '+money(c.advD):''}</small>
      ${c.warn.map(w=>`<div class="muted" style="color:#b23f2d;font-size:12.5px">⚠ ${esc(w)}</div>`).join('')}
      <div class="f2"><div><label>مكافأة</label><input id="pb_${esc(e.id)}" type="number" inputmode="decimal" placeholder="0" oninput="payPrev('${jsq(e.id)}','${jsq(m)}')"></div><div><label>خصم آخر</label><input id="pd_${esc(e.id)}" type="number" inputmode="decimal" placeholder="0" oninput="payPrev('${jsq(e.id)}','${jsq(m)}')"></div></div>
      <div>الصافي: <b id="pn_${esc(e.id)}">${money(c.net)}</b></div><button class="btn primary" onclick="payEmp('${jsq(e.id)}','${jsq(m)}')">صرف الراتب</button></div>`};
  modal('رواتب شهر '+m,`<input type="month" value="${esc(m)}" max="${esc(curM())}" onchange="payrollOpen(this.value)"><div class="card" style="margin-top:8px">${E.length?E.map(card).join(''):'<p class="muted">لا موظفون في هذا الشهر.</p>'}</div>
  <p class="muted">المصروف هذا الشهر: <b>${money(tot)}</b></p><div class="actions">${E.some(e=>!P.some(p=>p.emp===e.id))?`<button class="btn" onclick="payAll('${jsq(m)}')">صرف الجميع</button>`:''}${back('hrOpen()')}</div>`)};
window.payPrev=function(emp,m){const e=empOf(emp),x=document.getElementById('pn_'+emp);if(!e||!x)return;x.textContent=money(calcPay(e,m,{bonus:V('pb_'+emp),other:V('pd_'+emp)}).net)};
window.payEmp=function(emp,m){const r=payRun(emp,m,{bonus:V('pb_'+emp),other:V('pd_'+emp)});if(T(r)){toast('تم صرف الراتب');payrollOpen(m)}};
window.payAll=function(m){
  const E=emps().filter(e=>empInMonth(e,m)&&e.active!==false&&!pays().some(p=>p.emp===e.id&&p.month===m));let ok=0;const bad=[];
  E.forEach(e=>{const r=payRun(e.id,m,{});if(r.ok)ok++;else bad.push(e.name+': '+r.err)});
  toast('صُرف '+ok+' راتب'+(bad.length?' — تعذّر '+bad.length+': '+bad[0]:''));payrollOpen(m)};
window.payCancelUI=function(id){const p=pays().find(x=>x.id===id);if(!p)return;window.__pcId=id;
  modal('إلغاء صرف راتب',`<p>إلغاء راتب «${esc(p.name)}» لشهر ${esc(p.month)}؟ سيُحذف المصروف وتعود أقساط السلف المخصومة، ويُسجَّل في التدقيق.</p><label>السبب (إلزامي)</label><input id="pc_r"><div class="actions"><button class="btn danger" onclick="payCancelGo()">تأكيد الإلغاء</button>${back("payrollOpen('"+jsq(p.month)+"')",'رجوع')}</div>`)};
window.payCancelGo=function(){const p=pays().find(x=>x.id===window.__pcId),m=p&&p.month;if(T(payCancel(window.__pcId,V('pc_r')))){toast('أُلغي الصرف');payrollOpen(m)}};
window.payCancel=function(id){return window.payCancelUI(id)};
/* قسيمة راتب مطبوعة: تُبنى من سطر الصرف المحفوظ (لا تُعاد الحسبة) فتبقى ثابتة بعد أي تعديل لاحق في السياسة */
function slipHtml(p){const e=empOf(p.emp)||{},sh=(db.settings||{}).name||'ORVEX',row=(a,b,neg)=>b?`<tr><td>${esc(a)}</td><td style="text-align:left">${neg?'−':''}${money(b)}</td></tr>`:'';
  return `<div class="card" style="text-align:right"><p style="margin:0;text-align:center"><b>${esc(sh)}</b><br>قسيمة راتب — ${esc(p.month)}</p>
  <table style="width:100%;margin-top:8px;border-collapse:collapse"><tbody>
  <tr><td>الموظف</td><td style="text-align:left">${esc(p.name)}</td></tr>${e.title?`<tr><td>الوظيفة</td><td style="text-align:left">${esc(e.title)}</td></tr>`:''}
  <tr><td>أيام العمل / الحضور</td><td style="text-align:left">${num(p.workDays)} / ${num(p.presentDays)}</td></tr>
  ${row('الراتب الأساسي',p.base)}${row('البدلات',p.allow)}${row('أجر الإضافي'+(p.otMin?' ('+hrs(p.otMin)+')':''),p.otPay)}${row('عمولة المبيعات'+(p.commBase?' ('+money(p.commBase)+')':''),p.comm)}${row('المكافأة',p.bonus)}
  <tr><td><b>الإجمالي</b></td><td style="text-align:left"><b>${money(p.gross!=null?p.gross:num(p.base)+num(p.bonus))}</b></td></tr>
  ${row('خصم الغياب'+(p.absDays?' ('+p.absDays+' يوم)':''),p.absDed,1)}${row('إجازة بلا راتب'+(p.unpDays?' ('+p.unpDays+' يوم)':''),p.unpDed,1)}${row('خصم التأخير',p.lateDed,1)}${row('خصم آخر',p.otherDed,1)}${row('أقساط السلف',p.advDed,1)}
  <tr><td><b>الصافي المستحق</b></td><td style="text-align:left"><b>${money(p.net)}</b></td></tr></tbody></table>
  <p class="muted" style="font-size:12px">تاريخ الصرف: ${esc(fdate(p.date))}${p.by?' — '+esc(p.by):''}</p>
  <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:12.5px"><span>توقيع الموظف: ________</span><span>توقيع المحاسب: ________</span></div></div>`}
window.paySlip=function(id){if(!canPay())return toast(NOPAY);const p=pays().find(x=>x.id===id);if(!p)return;
  modal('قسيمة راتب',slipHtml(p)+`<div class="actions no-print"><button class="btn primary" onclick="window.print()">🖨 طباعة</button>${back("payrollOpen('"+jsq(p.month)+"')",'رجوع')}</div>`)};

/* ---- السلف ---- */
window.advOpen=function(){
  if(!canPay())return toast(NOPAY);const A_=advs().filter(a=>a.status!=='void').slice().sort((a,b)=>a.date<b.date?1:-1);
  modal('السلف',`<div class="card">${A_.length?A_.map(a=>`<div class="row" onclick="advView('${jsq(a.id)}')"><div class="grow"><div class="t">${esc(a.name||eName(a.emp))} ${advLeft(a)>0?badge('متبقٍ '+fmt(advLeft(a))):badge('مسدَّدة')}</div><small>${esc(fdate(a.date))} — ${a.months} قسط من ${esc(a.start)}</small></div><div class="end"><b>${money(a.amount)}</b></div></div>`).join(''):'<p class="muted">لا توجد سلف.</p>'}</div>
  <div class="actions"><button class="btn primary" onclick="advForm()">+ سلفة</button>${back('hrOpen()')}</div>`)};
window.advForm=function(){const E=emps().filter(e=>e.active!==false);if(!E.length)return toast('لا موظفون');
  modal('سلفة جديدة',`<label>الموظف</label><select id="ad_e">${E.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select>
  <div class="f2"><div><label>المبلغ</label><input id="ad_a" type="number" inputmode="decimal"></div><div><label>عدد الأقساط</label><input id="ad_m" type="number" value="1"></div></div>
  <label>أول قسط في شهر</label><input id="ad_s" type="month" value="${esc(curM())}"><label>ملاحظة</label><input id="ad_n">
  <p class="muted" style="font-size:12.5px">تُصرف السلفة نقدًا الآن وتُسجَّل مصروفًا؛ وتُخصم الأقساط من صافي رواتب الأشهر التالية.</p>
  <div class="actions"><button class="btn primary" onclick="advSave()">صرف السلفة</button>${back('advOpen()')}</div>`)};
window.advSave=function(){const r=advGrant({emp:V('ad_e'),amount:V('ad_a'),months:V('ad_m'),start:V('ad_s'),note:V('ad_n')});if(T(r)){toast('صُرفت السلفة');advOpen()}};
window.advView=function(id){const a=advs().find(x=>x.id===id);if(!a)return;
  modal('سلفة '+(a.name||''),`<div class="card">${a.inst.map(i=>`<div class="row"><div class="grow">${esc(i.month)}</div><div class="end">${money(i.amount)} ${i.paidIn?badge('خُصم'):badge('مستحق')}</div></div>`).join('')}</div>
  ${advLeft(a)>0?`<div class="f2"><div><label>إعادة جدولة المتبقي: أقساط</label><input id="ar_m" type="number" value="${a.inst.filter(i=>!i.paidIn).length||1}"></div><div><label>من شهر</label><input id="ar_s" type="month" value="${esc(curM())}"></div></div><button class="btn" onclick="advReschedGo('${jsq(a.id)}')">إعادة جدولة</button>`:''}
  ${a.inst.some(i=>i.paidIn)?'':`<label>إلغاء السلفة — السبب</label><input id="ar_r"><button class="btn danger" onclick="advVoidGo('${jsq(a.id)}')">إلغاء السلفة</button>`}<div class="actions">${back('advOpen()')}</div>`)};
window.advReschedGo=function(id){if(T(advResched(id,V('ar_m'),V('ar_s')))){toast('أُعيدت الجدولة');advView(id)}};
window.advVoidGo=function(id){if(T(advVoid(id,V('ar_r')))){toast('أُلغيت السلفة');advOpen()}};

/* ---- بطاقة الحضور الذاتي + مدخل الموارد البشرية في «المزيد» ---- */
function punchCard(){const e=selfEmp();if(!e)return'';const d=today(),r=attOf(e.id,d),x=dayStatus(e,d);
  return `<div class="card"><div class="row"><div class="grow"><div class="t">🕒 حضوري — ${esc(e.name)}</div><small>${r?'دخول '+esc(r.in)+(r.out?' — خروج '+esc(r.out):' — لم تنصرف بعد'):(x.st==='leave'||x.st==='unpaid'?'أنت في إجازة اليوم':'لم تسجّل حضورًا اليوم')}</small></div>
  <div class="end">${!r&&x.st!=='leave'&&x.st!=='unpaid'?`<button class="btn primary" onclick="hrPunch('in','${jsq(e.id)}','','card')">حضور</button>`:''}${r&&!r.out?`<button class="btn" onclick="hrPunch('out','${jsq(e.id)}','','card')">انصراف</button>`:''}</div></div></div>`}
if(typeof vMore==='function'){const _vm=vMore;vMore=function(){return punchCard()+_vm()+((canHr()||canPay())?`<div class="actions"><button class="btn" onclick="hrOpen()">👥 الموارد البشرية</button></div>`:'')}}
})();
