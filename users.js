/* ================= المستخدمون والصلاحيات ================= */
const PERMS=[['pos','نقطة البيع'],['discount','منح خصومات'],['price_edit','تعديل سعر البيع في الفاتورة'],['credit','البيع الآجل (بالدين)'],['returns','المرتجعات'],['void','إلغاء الفواتير'],['close_day','إغلاق الصندوق اليومي'],['close_edit','تعديل الإغلاق المعتمد وتجاوز الفترات المقفلة'],['invoices','عرض الفواتير'],['stock_view','عرض المخزون'],['stock_edit','إضافة وتعديل وحذف المواد'],['see_cost','رؤية سعر الشراء والأرباح'],['parties','العملاء والموردون'],['purchases','المشتريات'],['expenses','المصروفات'],['reports','التقارير ولوحة المؤشرات'],['settings','إعدادات المتجر'],['hr','الموارد البشرية: الموظفون والحضور والإجازات'],['payroll','الرواتب والسلف وسياسة الدوام (بيانات حساسة)']];
const ROLES={admin:['مدير (كل الصلاحيات)',null],cashier:['كاشير',['pos','invoices','stock_view','close_day']],sales_sup:['مشرف مبيعات',['pos','discount','price_edit','credit','returns','void','close_day','invoices','stock_view','parties']],store:['أمين مخزن',['stock_view','stock_edit','purchases','parties']],acct:['محاسب',['close_day','invoices','returns','stock_view','parties','purchases','expenses','reports','see_cost']],custom:['مخصص',[]]};
const VIEW_PERM={closings:'close_day',pos:'pos',stock:'stock_view',parties:'parties',invoices:'invoices',returns:'returns',purchases:'purchases',expenses:'expenses',reports:'reports',settings:'settings',users:'__admin'};
const NAV_PERM={pos:'pos',stock:'stock_view',parties:'parties'};
const curUser=()=>db.users.find(u=>u.id===state.user)||null;
const isAdmin=()=>{const u=curUser();return !!u&&u.admin===true};
const can=p=>{const u=curUser();if(!u)return false;const f=PERM_FEAT[p];if(f&&!feat(f))return false;return u.admin===true||!!(u.perms&&u.perms[p])};
const roleLabel=u=>u.designer?'مصمم':u.admin?'مدير':(ROLES[u.role]?ROLES[u.role][0]:'مخصص');
const navItems=()=>NAV.filter(n=>n[0]==='studio'?isDesigner():(!NAV_PERM[n[0]]||can(NAV_PERM[n[0]])));
const canView=v=>{if(v==='studio')return isDesigner();if(v==='users'&&!feat('users'))return false;if(v==='site')return isAdmin()&&siteOn();const n=VIEW_PERM[v];return !n||(n==='__admin'?isAdmin():can(n))};
IC.returns='<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>';
IC.users='<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/>';

async function hashPw(pw,salt){
  try{const b=new TextEncoder().encode(salt+':'+pw);const h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
  catch(e){let h=5381;const t=salt+':'+pw;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return 'f'+(h>>>0).toString(16)}
}
// كلمات المرور: PBKDF2-SHA256 (100k) بوسم p2$. الهاشات القديمة (SHA-256 مفردة) تبقى صالحة وتُرقّى تلقائيًا عند أول دخول ناجح.
// hashPw تبقى كما هي لأنها تُستخدم أيضًا لتوقيع أكواد التحديث وأكواد تفعيل الجهاز.
const PW2='p2$';
async function hashPw2(pw,salt){
  try{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
    const b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode('orvex:'+salt),iterations:100000,hash:'SHA-256'},k,256);
    return PW2+Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}
  catch(e){return hashPw(pw,salt)}
}
async function pwCheck(pw,u){
  if(!u||!u.hash)return false;
  return String(u.hash).indexOf(PW2)===0?(await hashPw2(pw,u.salt))===u.hash:(await hashPw(pw,u.salt))===u.hash;
}
function showAuth(){
  const old=document.getElementById('auth');if(old)old.remove();
  const d=document.createElement('div');d.id='auth';
  const setup=!db.users.length;
  let last='';try{last=localStorage.getItem(KEY+'_last')||''}catch(e){}
  d.innerHTML=setup
   ?`<div class="auth-card">${orvexLogo('a')}<h1>ORVEX</h1><p class="muted" style="margin:-6px 0 6px;font-weight:600">${esc(db.settings.name)}</p><p class="muted" style="margin-top:0">مرحباً بك. أنشئ حساب المصمم للبدء. المصمم وحده من ينشئ حسابات المدراء، ويسلّم نسخة المدير لكل محل، ويتحكم بالمميزات والتحديثات.</p>
     <label>اسم الاستوديو</label><input id="a_store" value="${esc(db.settings.name)}"><label>اسم المصمم</label><input id="a_name"><label>البريد الإلكتروني</label><input id="a_email" type="email" autocomplete="email" autocapitalize="off" value=""><label>اسم المستخدم (بالإنجليزية بدون مسافات)</label><input id="a_user" autocapitalize="off" autocomplete="username"><label>كلمة المرور</label><input id="a_pass" type="password" autocomplete="new-password"><label>تأكيد كلمة المرور</label><input id="a_pass2" type="password" autocomplete="new-password" onkeydown="if(event.key==='Enter')doSetup()">
     <div class="actions"><button class="btn primary" onclick="doSetup()">إنشاء حساب المصمم والدخول</button></div></div>`
   :`<div class="auth-card">${orvexLogo('a')}<h1>ORVEX</h1><p class="muted" style="margin:-6px 0 6px;font-weight:600">${esc(db.settings.name)}</p><p class="muted" style="margin-top:0">تسجيل الدخول</p>
     <label>اسم المستخدم</label><input id="a_user" autocapitalize="off" autocomplete="username" value="${esc(last)}"><label>كلمة المرور</label><input id="a_pass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter'){event.preventDefault();(window.sbLogin?sbLogin():doLogin())}">
     <div class="actions"><button id="a_btn" class="btn primary" onclick="(window.sbLogin?sbLogin():doLogin())">دخول</button></div>${db.license?`<p style="text-align:center;margin:14px 0 0"><a href="#" class="muted" onclick="updModal();return false">لديك كود تحديث من المصمم؟</a></p>`:''}</div>`;
  document.body.appendChild(d);
}
async function doSetup(){
  const store=$('#a_store').value.trim()||'متجري',name=$('#a_name').value.trim(),email=$('#a_email').value.trim().toLowerCase(),un=$('#a_user').value.trim().toLowerCase(),pw=$('#a_pass').value;
  if(!name||!un)return toast('أدخل اسم المصمم واسم المستخدم');
  if(!validEmail(email))return toast('أدخل بريداً إلكترونياً صحيحاً');
  if(/\s/.test(un))return toast('اسم المستخدم بدون مسافات');
  if(pw.length<4)return toast('كلمة المرور 4 أحرف على الأقل');
  if(pw!==$('#a_pass2').value)return toast('تأكيد كلمة المرور غير مطابق');
  const salt=uid()+uid(),u={id:uid(),name,email,username:un,admin:true,designer:true,role:'admin',perms:{},active:true,salt,hash:await hashPw2(pw,salt)};
  db.users.push(u);db.settings.name=store;db.edition='studio';save();loginAs(u);
}
async function doLogin(){
  const un=$('#a_user').value.trim().toLowerCase(),pw=$('#a_pass').value;
  const u=db.users.find(x=>x.username===un);
  if(!u||u.active===false||!(await pwCheck(pw,u)))return toast(u&&u.active===false?'هذا الحساب موقوف':'اسم المستخدم أو كلمة المرور غير صحيحة');
  if(db.license&&db.license.active===false&&!u.designer)return toast('ترخيص هذا المحل موقوف. تواصل مع المصمم وأدخل كود التحديث');
  try{if(String(u.hash).indexOf(PW2)!==0){const h=await hashPw2(pw,u.salt);if(h.indexOf(PW2)===0){u.hash=h;save()}}}catch(e){}
  loginAs(u);
}
function loginAs(u){
  state.user=u.id;try{localStorage.setItem(KEY+'_last',u.username)}catch(e){}
  const a=document.getElementById('auth');if(a)a.remove();
  state.view=u.designer?'studio':'home';state.cart=[];state.co=newCo();state.kp='';state.sel=-1;
  render();window.scrollTo(0,0);
}
function logout(){
  if(state.stash){exitPreview();return}
  closeModal();const p=$('#pos');if(p){clearInterval(_clk);p.remove()}
  state.user=null;state.cart=[];state.co=newCo();state.kp='';state.sel=-1;state.view='home';state.held=[];
  showAuth();
}
function pwModal(){modal('تغيير كلمة المرور',`<label>كلمة المرور الحالية</label><input id="pw0" type="password" autocomplete="current-password"><label>كلمة المرور الجديدة</label><input id="pw1" type="password" autocomplete="new-password"><div class="actions"><button class="btn primary" onclick="doPw()">حفظ</button></div>`)}
async function doPw(){
  const u=curUser();if(!u)return;
  if(!(await pwCheck($('#pw0').value,u)))return toast('كلمة المرور الحالية غير صحيحة');
  const n=$('#pw1').value;if(n.length<4)return toast('كلمة المرور 4 أحرف على الأقل');
  u.salt=uid()+uid();u.hash=await hashPw2(n,u.salt);save();closeModal();toast('تم تغيير كلمة المرور');
}
function vUsers(){
  return `<div class="card">${db.users.map(u=>`<button class="row tap" onclick="userForm('${jsq(u.id)}')"><div class="grow"><div class="t">${esc(u.name)}</div><small>@${esc(u.username)} - ${esc(roleLabel(u))}${u.email?' - '+esc(u.email):''}</small></div><div class="end">${u.active===false?'<span class="badge grey">موقوف</span>':(u.id===state.user?'<span class="badge">أنت</span>':'')}</div></button>`).join('')}</div>
  <p class="muted" style="font-size:12.5px">كلمات المرور محفوظة بصيغة مشفّرة داخل هذا المتصفح. هذا النظام يعمل على جهازك فقط، ولا يغني عن حماية الجهاز نفسه.</p>
  <button class="fab" onclick="userForm()">+ مستخدم جديد</button>`}
function permsHtml(u){return PERMS.filter(([k])=>!PERM_FEAT[k]||feat(PERM_FEAT[k])).map(([k,l])=>`<label class="pchk"><input type="checkbox" data-p="${k}" ${u.admin||(u.perms&&u.perms[k])?'checked':''} ${u.admin?'disabled':''}> ${l}</label>`).join('')}
function userForm(id){
  if(!isAdmin())return toast('للمدير فقط');
  const u=id?db.users.find(x=>x.id===id):{name:'',username:'',role:'cashier',admin:false,active:true,perms:Object.fromEntries(ROLES.cashier[1].map(k=>[k,true]))};
  modal(id?'تعديل مستخدم':'مستخدم جديد',`<label>الاسم</label><input id="u_name" value="${esc(u.name)}">
  <div class="f2"><div><label>اسم المستخدم</label><input id="u_user" autocapitalize="off" value="${esc(u.username)}"></div><div><label>${id?'كلمة مرور جديدة (اختياري)':'كلمة المرور'}</label><input id="u_pass" type="password" autocomplete="new-password"></div></div>
  <label>نوع الحساب</label><select id="u_role" onchange="applyRole(this.value)">${Object.entries(ROLES).filter(([k])=>k!=='admin'||isDesigner()||u.admin).map(([k,v])=>`<option value="${k}" ${(u.admin?'admin':(u.role||'custom'))===k?'selected':''}>${v[0]}</option>`).join('')}</select>
  <label style="margin-top:14px">الصلاحيات</label><div class="card" id="u_perms" style="padding:4px 12px">${permsHtml(u)}</div>
  <label class="pchk" style="border:0"><input type="checkbox" id="u_active" ${u.active!==false?'checked':''}> الحساب فعّال</label>
  <div class="actions"><button class="btn primary" onclick="saveUser('${jsq(id||'')}')">حفظ</button>${id&&id!==state.user?`<button class="btn danger" onclick="delUser('${jsq(id)}')">حذف</button>`:''}</div>`);
}
function applyRole(r){
  const preset=ROLES[r][1];
  document.querySelectorAll('#u_perms input[data-p]').forEach(b=>{if(r==='admin'){b.checked=true;b.disabled=true}else{b.disabled=false;if(r!=='custom')b.checked=preset.includes(b.dataset.p)}});
}
async function saveUser(id){
  if(!isAdmin())return toast('للمدير فقط');
  const name=$('#u_name').value.trim(),un=$('#u_user').value.trim().toLowerCase(),pw=$('#u_pass').value,role=$('#u_role').value,active=$('#u_active').checked;
  if(!name||!un)return toast('أدخل الاسم واسم المستخدم');
  if(/\s/.test(un))return toast('اسم المستخدم بدون مسافات');
  if(db.users.some(x=>x.username===un&&x.id!==id))return toast('اسم المستخدم مستخدم من قبل');
  if((!id||pw)&&pw.length<4)return toast('كلمة المرور 4 أحرف على الأقل');
  const perms={};
  document.querySelectorAll('#u_perms input[data-p]').forEach(b=>{if(b.checked)perms[b.dataset.p]=true});
  const u=id?db.users.find(x=>x.id===id):{id:uid()};
  const admin=u.designer===true||role==='admin';
  if(u.designer&&!isDesigner())return toast('حساب المصمم لا يُعدَّل');
  if(admin&&!u.admin&&!isDesigner())return toast('إنشاء حساب المدير للمصمم فقط');
  if(id&&u.admin&&(!admin||!active)&&!db.users.some(x=>x.admin&&x.active!==false&&x.id!==id))return toast('يجب أن يبقى مدير فعّال واحد على الأقل');
  if(id===state.user&&!active)return toast('لا يمكنك إيقاف حسابك الحالي');
  Object.assign(u,{name,username:un,role:admin?'admin':role,admin,perms,active});
  if(pw){u.salt=uid()+uid();u.hash=await hashPw2(pw,u.salt)}
  if(!id)db.users.push(u);
  save();closeModal();render();toast('تم الحفظ');
}
function delUser(id){
  if(!isAdmin())return;
  const u=db.users.find(x=>x.id===id);if(!u||id===state.user||(u.designer&&!isDesigner()))return;
  if(u.admin&&!db.users.some(x=>x.admin&&x.active!==false&&x.id!==id))return toast('يجب أن يبقى مدير فعّال واحد على الأقل');
  askConfirm('حذف حساب «'+u.name+'»؟ الفواتير السابقة تبقى مسجلة باسمه.',()=>{db.users=db.users.filter(x=>x.id!==id);save();render()},'حذف');
}
/* ================= المصمم، المحلات، المميزات ================= */
const FEATURES=[['pos','نقطة البيع'],['stock','المخزون'],['parties','العملاء والموردون'],['invoices','الفواتير'],['returns','المرتجعات'],['purchases','المشتريات'],['expenses','المصروفات'],['reports','التقارير ولوحة المؤشرات'],['users','إدارة حسابات الموظفين'],['backup','النسخ الاحتياطي والاستعادة'],['demo','البيانات التجريبية ومسح البيانات'],['site','الموقع الإلكتروني للمحل (متجر عام برابط خاص)'],['ai','المساعد الذكي']];
const PERM_FEAT={pos:'pos',returns:'returns',invoices:'invoices',stock_view:'stock',stock_edit:'stock',parties:'parties',purchases:'purchases',expenses:'expenses',reports:'reports'};
const feat=k=>{const f=db.features;return !f||f[k]!==false};
const siteOn=()=>!!(db.features&&db.features.site===true);
const isDesigner=()=>{const u=curUser();return !!u&&u.designer===true};
const validEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||'');
const isDesignerUser=list=>(list||[]).some(u=>u.designer);
IC.studio='<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>';
TITLES.studio='لوحة المصمم';
function wipeData(){const u=db.users,n=db.settings.name,m={edition:db.edition,features:db.features,license:db.license,shops:db.shops};db=fresh();db.users=u;db.settings.name=n;Object.keys(m).forEach(k=>{if(m[k]!==undefined)db[k]=m[k]})}
const b64e=s=>btoa(unescape(encodeURIComponent(s)));
const b64d=s=>decodeURIComponent(escape(atob(s)));

function vStudio(){
  if(!isDesigner())return '';
  const S=db.shops;
  return `<div class="note">لوحة المصمم: أنشئ حساب المدير لكل محل، وسلّمه نسخته الخاصة، وتحكّم بالمميزات المتاحة له، وأرسل له التحديثات بكود تحديث.</div>
  <div class="grid2"><div class="kpi"><span>عدد المحلات</span><b>${S.length}</b></div><div class="kpi"><span>المحلات الفعّالة</span><b class="good">${S.filter(s=>s.active!==false).length}</b></div></div>
  <div class="card">${S.length?S.map(s=>`<button class="row tap" onclick="shopForm('${jsq(s.id)}')"><div class="grow"><div class="t">${esc(s.name)}</div><small>المدير: ${esc(s.mgr.name)} (@${esc(s.mgr.username)}) - ${esc(s.mgr.email||'')} - الإصدار ${s.ver}</small></div><div class="end"><span class="badge ${s.active===false?'grey':''}">${s.active===false?'موقوف':'فعّال'}</span><br><small>${FEATURES.filter(f=>s.features[f[0]]).length}/${FEATURES.length} ميزة</small></div></button>`).join(''):empty('لا توجد محلات بعد. أنشئ أول محل وحساب مدير له.')}</div>
  <button class="fab" onclick="shopForm()">+ محل جديد</button>`;
}
function shopForm(id){
  if(!isDesigner())return toast('للمصمم فقط');
  const s=id?db.shops.find(x=>x.id===id):{name:'',mgr:{name:'',username:''},features:Object.fromEntries(FEATURES.map(f=>[f[0],true])),active:true,ver:0,note:''};
  if(!s)return;
  modal(id?'تعديل محل':'محل جديد',`<label>اسم المحل</label><input id="sh_name" value="${esc(s.name)}">
  <label>اسم المدير</label><input id="sh_mname" value="${esc(s.mgr.name)}">
  <label>البريد الإلكتروني للمدير</label><input id="sh_email" type="email" autocomplete="off" autocapitalize="off" value="${esc(s.mgr.email||'')}">
  <div class="f2"><div><label>اسم المستخدم</label><input id="sh_user" autocapitalize="off" value="${esc(s.mgr.username)}"></div><div><label>${id?'كلمة مرور جديدة (اختياري)':'كلمة المرور'}</label><input id="sh_pass" type="password" autocomplete="new-password"></div></div>
  <label style="margin-top:14px">المميزات المتاحة لحساب المدير</label><div class="card" style="padding:4px 12px">${FEATURES.map(([k,l])=>`<label class="pchk"><input type="checkbox" data-f="${k}" ${s.features[k]?'checked':''}> ${l}</label>`).join('')}</div>
  <label>ملاحظة التحديث (تظهر للمدير)</label><input id="sh_note" value="${esc(s.note||'')}">
  <label class="pchk" style="border:0"><input type="checkbox" id="sh_active" ${s.active!==false?'checked':''}> ترخيص المحل فعّال</label>
  <div class="actions"><button class="btn primary" onclick="saveShop('${jsq(id||'')}')">حفظ</button></div>
  ${id?`<div class="actions"><button class="btn primary" onclick="enterAsManager('${jsq(id)}')">الدخول إلى حساب المدير</button></div><div class="actions"><button class="btn" onclick="downloadPkg('${jsq(id)}')">تنزيل نسخة المدير</button><button class="btn" onclick="updateCodeModal('${jsq(id)}')">كود التحديث</button></div><div class="actions"><button class="btn danger" onclick="delShop('${jsq(id)}')">حذف المحل</button></div>`:''}`);
}
async function saveShop(id){
  if(!isDesigner())return toast('للمصمم فقط');
  const name=$('#sh_name').value.trim(),mn=$('#sh_mname').value.trim(),un=$('#sh_user').value.trim().toLowerCase(),pw=$('#sh_pass').value,email=$('#sh_email').value.trim().toLowerCase();
  if(!name||!mn||!un)return toast('أدخل اسم المحل واسم المدير واسم المستخدم');
  if(!validEmail(email))return toast('أدخل بريداً إلكترونياً صحيحاً للمدير');
  if(db.shops.some(x=>(x.mgr.email||'')===email&&x.id!==id))return toast('هذا البريد مستخدم لمحل آخر');
  if(/\s/.test(un))return toast('اسم المستخدم بدون مسافات');
  if((!id||pw)&&pw.length<4)return toast('كلمة المرور 4 أحرف على الأقل');
  if(db.shops.some(x=>x.mgr.username===un&&x.id!==id))return toast('اسم المستخدم مستخدم لمحل آخر');
  const features={};document.querySelectorAll('[data-f]').forEach(b=>{features[b.dataset.f]=b.checked});
  const active=$('#sh_active').checked,note=$('#sh_note').value.trim();
  let s=id?db.shops.find(x=>x.id===id):null;
  const isNew=!s;
  if(isNew){s={id:uid(),secret:uid()+uid()+uid(),ver:0,created:today(),mgr:{id:uid(),pwVer:0}};db.shops.push(s)}
  const changed=isNew||JSON.stringify(s.features)!==JSON.stringify(features)||s.active!==active||s.name!==name||(s.note||'')!==note||!!pw||s.mgr.username!==un||s.mgr.name!==mn||(s.mgr.email||'')!==email;
  Object.assign(s,{name,features,active,note});s.mgr.name=mn;s.mgr.username=un;s.mgr.email=email;
  if(changed)s.ver++;
  if(pw){s.mgr.salt=uid()+uid();s.mgr.hash=await hashPw2(pw,s.mgr.salt);s.mgr.pwVer=s.ver}
  save();
  if(isNew){render();shopForm(s.id);toast('تم إنشاء المحل وحساب المدير')}
  else{closeModal();render();toast(changed?'تم الحفظ. أرسل كود التحديث للمدير':'لا توجد تغييرات')}
}
function delShop(id){
  if(!isDesigner())return;
  const s=db.shops.find(x=>x.id===id);if(!s)return;
  askConfirm('حذف المحل «'+s.name+'» من لوحتك؟ النسخة المسلّمة له تبقى تعمل عنده، لكنك لن تستطيع إرسال تحديثات لها.',()=>{db.shops=db.shops.filter(x=>x.id!==id);save();render()},'حذف');
}
function shopDb(s){
  const d=fresh();
  d.settings.name=s.name;d.edition='manager';d.features=Object.assign({},s.features);
  d.license={shopId:s.id,secret:s.secret,ver:s.ver,pwVer:s.mgr.pwVer||0,active:s.active!==false,note:s.note||''};
  d.users=[{id:s.mgr.id,name:s.mgr.name,email:s.mgr.email||'',username:s.mgr.username,admin:true,role:'admin',perms:{},active:true,salt:s.mgr.salt,hash:s.mgr.hash}];
  return d;
}
function buildPackage(s){
  const seed={key:'sales_pkg_'+s.id,db:shopDb(s)};
  const doc=document.documentElement.cloneNode(true);
  doc.querySelectorAll('#auth,#pos,#modal,#plock,.toast,#seed').forEach(e=>e.remove());
  const m=doc.querySelector('#main');if(m)m.innerHTML='';
  const n=doc.querySelector('#nav');if(n)n.innerHTML='';
  const ti=doc.querySelector('#title');if(ti)ti.textContent='';
  const td=doc.querySelector('#today');if(td)td.textContent='';
  const b=doc.querySelector('body');if(b)b.removeAttribute('class');
  const sc=document.createElement('script');sc.id='seed';sc.type='application/json';
  sc.textContent=JSON.stringify(seed).replace(/</g,'\\u003c');
  doc.querySelector('head').appendChild(sc);
  const tt=doc.querySelector('title');if(tt)tt.textContent=s.name+' - ORVEX';
  return '<!DOCTYPE html>\n'+doc.outerHTML;
}
function downloadPkg(id){
  const s=db.shops.find(x=>x.id===id);if(!s||!isDesigner())return;
  try{
    const html=buildPackage(s);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    a.download='ORVEX_'+s.name.replace(/[\\\/:*?"<>|\s]+/g,'_')+'.html';
    document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
    toast('تم تجهيز نسخة المدير');
  }catch(e){toast('تعذّر تجهيز النسخة')}
}
async function makeUpdateCode(s){
  const p={sid:s.id,ver:s.ver,features:s.features,active:s.active!==false,note:s.note||'',name:s.name,mgr:{id:s.mgr.id,name:s.mgr.name,email:s.mgr.email||'',username:s.mgr.username,salt:s.mgr.salt,hash:s.mgr.hash,pwVer:s.mgr.pwVer||0}};
  const j=JSON.stringify(p);
  return b64e(JSON.stringify({p:j,s:await hashPw(j,s.secret)}));
}
async function updateCodeModal(id){
  const s=db.shops.find(x=>x.id===id);if(!s||!isDesigner())return;
  const code=await makeUpdateCode(s);
  modal('كود التحديث',`<p class="muted">أرسل هذا الكود للمدير. يلصقه في الإعدادات (أو من شاشة الدخول) فتُطبَّق المميزات والتعديلات الجديدة.</p><textarea id="bk" readonly>${code}</textarea><div class="actions"><button class="btn primary" onclick="copyBk()">نسخ</button></div>`);
}
function updModal(){
  modal('تطبيق كود تحديث',`<p class="muted">الصق الكود الذي أرسله لك المصمم.</p><textarea id="upd" placeholder="..."></textarea><div class="actions"><button class="btn primary" onclick="applyUpdate()">تطبيق</button></div>`);
}
async function applyUpdate(){
  try{
    const o=JSON.parse(b64d($('#upd').value.trim().replace(/\s+/g,''))),p=JSON.parse(o.p),L=db.license;
    if(!L||p.sid!==L.shopId)return toast('هذا الكود ليس لهذا المحل');
    if((await hashPw(o.p,L.secret))!==o.s)return toast('الكود غير صالح');
    if(p.ver<=L.ver)return toast('هذا الكود قديم أو مُطبَّق بالفعل');
    db.features=p.features;L.ver=p.ver;L.active=p.active;L.note=p.note||'';
    if(p.name)db.settings.name=p.name;
    if(p.mgr&&p.mgr.email){const mu=db.users.find(x=>x.id===p.mgr.id);if(mu)mu.email=p.mgr.email}
    if(p.mgr&&p.mgr.pwVer>(L.pwVer||0)){
      const u=db.users.find(x=>x.id===p.mgr.id);
      if(u){u.name=p.mgr.name;u.username=p.mgr.username;u.salt=p.mgr.salt;u.hash=p.mgr.hash;L.pwVer=p.mgr.pwVer}
    }
    save();closeModal();
    if(L.active===false&&curUser()&&!isDesigner()){logout();toast('تم إيقاف ترخيص المحل');return}
    if(curUser())render();
    toast('تم تطبيق التحديث (الإصدار '+L.ver+')');
  }catch(e){toast('الكود غير صالح')}
}
function licCard(){
  const L=db.license;
  return `<div class="card"><h3>الترخيص والتحديثات</h3><div class="row"><div class="grow"><div class="t">الإصدار ${L.ver}</div><small>${esc(L.note||'لا توجد ملاحظات')}</small></div><span class="badge ${L.active===false?'bad':''}">${L.active===false?'موقوف':'فعّال'}</span></div><p class="muted" style="font-size:12.5px">المميزات يديرها المصمم فقط. للحصول على مميزات أو تعديلات جديدة يرسل لك المصمم كود تحديث.</p><div class="actions"><button class="btn" onclick="updModal()">تطبيق كود تحديث</button></div></div>`;
}

/* ===== دخول المصمم إلى حساب المدير (وضع المعاينة) ===== */
const previewBar=()=>state.stash&&curUser()?`<div class="note" style="display:flex;align-items:center;gap:10px;justify-content:space-between"><span>وضع المصمم: أنت داخل حساب المدير «${esc(curUser().name)}» لمحل «${esc(db.settings.name)}». البيانات هنا معاينة منفصلة عن بيانات المحل الفعلية.</span><button class="btn" style="flex:none" onclick="exitPreview()">رجوع للمصمم</button></div>`:'';
async function enterAsManager(id){
  if(!isDesigner())return toast('للمصمم فقط');
  const s=db.shops.find(x=>x.id===id);if(!s)return;
  if(!s.mgr.hash)return toast('حساب المدير غير مكتمل');
  const key='sales_prev_'+s.id,base=shopDb(s);let pd=null;
  try{const r=await Store.loadDb(key);if(r&&r.data)pd=normalize(r.data)}catch(e){}
  if(!pd)pd=normalize(JSON.parse(JSON.stringify(base)));
  else{pd.edition='manager';pd.features=base.features;pd.license=base.license;pd.settings.name=s.name;pd.users=pd.users.filter(u=>u.id!==s.mgr.id).concat(base.users)}
  const p=$('#pos');if(p){clearInterval(_clk);p.remove()}
  closeModal();
  state.stash={db,user:state.user};
  db=pd;state.prevKey=key;state.user=s.mgr.id;
  state.cart=[];state.co=newCo();state.kp='';state.sel=-1;state.held=[];state.view='home';
  save();render();window.scrollTo(0,0);toast('دخلت إلى حساب المدير: '+s.mgr.name);
}
function exitPreview(){
  if(!state.stash)return;
  closeModal();const p=$('#pos');if(p){clearInterval(_clk);p.remove()}
  save();
  db=state.stash.db;state.user=state.stash.user;state.stash=null;state.prevKey=null;
  state.cart=[];state.co=newCo();state.kp='';state.sel=-1;state.held=[];state.view='studio';
  render();window.scrollTo(0,0);
}

