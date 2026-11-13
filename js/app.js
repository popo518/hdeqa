import { openDatabase, loadSnapshot, saveSnapshot, exportBackup, validateBackup, clearUserData } from './db.js';
import { ZONES, HADITHS, DEFAULT_TASKS, ITEM_CATALOG } from './content.js';
import { GardenWorld } from './world.js';
import { sendMagicLink, getCloudSession, pushCloudSnapshot, pullCloudSnapshot, signOutCloud } from './sync.js';

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const todayKey = () => new Date().toLocaleDateString('en-CA');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDate = value => { try { return new Date(value).toLocaleString('ar-JO',{dateStyle:'medium',timeStyle:'short'}); } catch { return '—'; } };

let state;
let world;
let saveTimer = null;
let lastSavedPosition = '';
let lastNearbyKey = '';
let activePanel = 'garden';
let buildMode = null;
let installPrompt = null;
let supabaseSession = null;
let libraryQuery = '';
let libraryFilter = 'all';

function newState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    profile: { id:'current', nickname:'صديق الحديقة', createdAt:now, updatedAt:now },
    garden: { id:'current', name:'حديقتي', currentZone:'garden', playerPosition:{x:1110,y:795}, camera:{zoom:.88}, visitedZones:['garden'], createdAt:now, updatedAt:now },
    tasks: DEFAULT_TASKS.map(t=>({...t, createdAt:now, updatedAt:now})),
    sessions: [],
    inventory: ITEM_CATALOG.filter(i=>i.starter>0).map(i=>({id:i.id,itemId:i.id,count:i.starter,updatedAt:now})),
    objects: [],
    settings: { id:'current', reduceMotion:false, lowPower:false, haptics:false, reminders:false, moveSpeed:1, fontScale:1, cloudEnabled:false, supabaseUrl:'', supabaseAnonKey:'' },
    favorites: [],
    history: [{id:uid(),type:'created',label:'تم إنشاء حديقتك',createdAt:now}],
    syncQueue: []
  };
}

async function init() {
  setStatus('جارٍ فتح الحديقة…','loading');
  try {
    await openDatabase();
    state = await loadSnapshot();
    if (!state.profile || !state.garden || !state.settings) {
      state = newState();
      await saveSnapshot(state);
    } else {
      // Backward-safe defaults for future schema additions.
      state.schemaVersion = 1;
      state.profile ||= {id:'current',nickname:'صديق الحديقة',createdAt:new Date().toISOString()};
      state.garden.visitedZones ||= ['garden'];
      state.garden.playerPosition ||= {x:1110,y:795};
      state.settings ||= {id:'current'};
      state.tasks ||= []; state.sessions ||= []; state.inventory ||= []; state.objects ||= []; state.history ||= []; state.favorites ||= []; state.syncQueue ||= [];
      if (!state.tasks.length) state.tasks = DEFAULT_TASKS.map(t=>({...t,createdAt:new Date().toISOString()}));
    }
    world = new GardenWorld($('#garden-canvas'));
    world.setPlayer(state.garden.playerPosition);
    world.setState({objects:state.objects});
    world.lowPower = !!state.settings.lowPower;
    world.reduceMotion = !!state.settings.reduceMotion;
    world.resizeCamera(state.garden.camera?.zoom || 1);
    lastSavedPosition = JSON.stringify(world.getPlayerPosition());
    bindEvents();
    renderSummary();
    setStatus('تم الحفظ على هذا الجهاز','saved');
    $('#profile-name').textContent = state.profile.nickname;
    $('#summary-garden-name').textContent = state.garden.name;
    if (state.settings.supabaseUrl && state.settings.supabaseAnonKey) updateCloudStatus();
    requestAnimationFrame(frame);
    checkCloudCallback();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
    }
  } catch (error) {
    setStatus('تعذر فتح قاعدة البيانات','error');
    showToast(`لم يتم فتح الحديقة: ${error.message}`,'error');
  }
}

function setStatus(text, mode='saved') {
  const node = $('#save-status'); if (!node) return;
  node.textContent = text;
  const dot = node.parentElement?.querySelector('.status-dot');
  if (dot) dot.style.background = mode==='error' ? '#ba765e' : mode==='loading' ? '#c6a05f' : '#80a96e';
}
function showToast(message, type='') {
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message;
  $('#toast-region').appendChild(toast);
  setTimeout(()=>toast.remove(), 3400);
}
function persistSoon() {
  if (!state) return;
  clearTimeout(saveTimer);
  setStatus('جارٍ الحفظ…','loading');
  state.garden.updatedAt = new Date().toISOString();
  state.profile.updatedAt = new Date().toISOString();
  saveTimer = setTimeout(async()=>{
    try { await saveSnapshot(state); setStatus('تم الحفظ على هذا الجهاز','saved'); }
    catch(error){setStatus('تعذر الحفظ','error');showToast(`لم يكتمل الحفظ: ${error.message}`,'error');}
  },260);
}
function saveNow() {
  clearTimeout(saveTimer);
  return saveSnapshot(state).then(()=>setStatus('تم الحفظ على هذا الجهاز','saved')).catch(error=>{setStatus('تعذر الحفظ','error');showToast(error.message,'error');throw error;});
}
function addHistory(type,label,detail='') {
  state.history.push({id:uid(),type,label,detail,createdAt:new Date().toISOString()});
  if(state.history.length>500)state.history=state.history.slice(-500);
}
function getInventoryCount(itemId){return state.inventory.find(x=>x.itemId===itemId)?.count||0;}
function changeInventory(itemId,delta){
  let row=state.inventory.find(x=>x.itemId===itemId);
  if(!row){row={id:itemId,itemId,count:0,updatedAt:new Date().toISOString()};state.inventory.push(row);}
  row.count=Math.max(0,row.count+delta);row.updatedAt=new Date().toISOString();
}
function renderSummary(){
  $('#profile-name').textContent=state.profile.nickname||'صديق الحديقة';
  $('#summary-garden-name').textContent=state.garden.name||'حديقتي';
  $('#stat-zones').textContent=(state.garden.visitedZones||['garden']).length;
  $('#stat-objects').textContent=state.objects.length;
  $('#stat-tasks').textContent=state.history.filter(x=>x.type==='task-complete').length;
  const next=state.tasks.find(t=>!isTaskDone(t));
  const root=$('#next-step-card');
  if(!next){root.innerHTML='<div class="next-card"><strong>أحسنت في تنظيم مسارك</strong><p>يمكنك إضافة عمل شخصي جديد لمتابعته أو استكشاف منطقة أخرى.</p><button class="secondary-small" data-open="tasks">إدارة المهام</button></div>';}
  else {root.innerHTML=`<div class="next-card"><strong>${escapeHtml(next.title)}</strong><p>${escapeHtml(next.description||'')}</p><button class="primary-small" data-open="tasks">إدارة المهام</button></div>`;}
}
function isTaskDone(task){
  if(task.kind==='once')return !!task.completed;
  const key=task.kind==='weekly'?weekKey():todayKey();
  return task.lastCompletedKey===key;
}
function weekKey(){const d=new Date();const one=new Date(d.getFullYear(),0,1);return `${d.getFullYear()}-W${Math.ceil((((d-one)/86400000)+one.getDay()+1)/7)}`;}

function openDialog(title, body, eyebrow='حديقتي') {
  if(world){world.setDirection(0,0);world.player.target=null;savePosition();}
  $('#dialog-title').textContent=title;$('#dialog-eyebrow').textContent=eyebrow;$('#dialog-body').innerHTML=body;$('#dialog-backdrop').hidden=false;
  document.body.classList.add('dialog-open');
  $('#dialog-close').focus();
}
function closeDialog(){
  $('#dialog-backdrop').hidden=true;document.body.classList.remove('dialog-open');
  if(buildMode && buildMode.type==='place') return;
  activePanel='garden';setDock('garden');
}
function setDock(name){$$('.dock-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.open===name));}
function openPanel(name){
  activePanel=name;setDock(name);
  if(name==='garden'){closeDialog();return;}
  const panels={tasks:renderTasksPanel,library:renderLibraryPanel,inventory:renderInventoryPanel,map:renderMapPanel,achievements:renderAchievementsPanel,settings:renderSettingsPanel,backup:renderBackupPanel,help:renderHelpPanel};
  (panels[name]||renderHelpPanel)();
}

function renderTasksPanel(){
  const tasks=state.tasks;
  const html=`<p class="panel-intro">هذه قائمة متابعة شخصية. تسجيل المهمة يعني أنك أدخلت ما تريد متابعته بنفسك؛ التطبيق لا يتحقق من أداء العمل أو النية.</p>
  <div class="card-actions" style="margin-bottom:14px"><button class="primary-small" data-action="show-add-task">＋ إضافة مهمة شخصية</button></div>
  ${tasks.length?`<div class="card-grid">${tasks.map(t=>{
    const done=isTaskDone(t),repeat=t.kind==='once'?'مرة واحدة':t.kind==='daily'?'يومياً':'أسبوعياً';
    return `<article class="content-card"><div class="card-meta"><span class="tag">${escapeHtml(t.category||'شخصي')}</span><span class="tag warm">${repeat}</span>${done?'<span class="tag">مسجلة</span>':''}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description||'')}</p><div class="card-actions">${done?'<button class="secondary-small" disabled>تم التسجيل لهذه الفترة</button>':`<button class="primary-small" data-action="complete-task" data-id="${escapeHtml(t.id)}">تسجيل الإنجاز</button>`}${!t.system?`<button class="danger-button" data-action="delete-task" data-id="${escapeHtml(t.id)}">حذف</button>`:''}</div></article>`;
  }).join('')}</div>`:'<div class="empty-state"><strong>لا توجد مهام بعد</strong>أضف مهمة شخصية تريد متابعتها.</div>'}
  <div class="note-box">العناصر التي قد تحصل عليها هنا هي عناصر افتراضية للزينة وتنظيم التطبيق فقط، وليست مقابلاً شرعياً للعمل ولا تمثل أجراً.</div>`;
  openDialog('المهام والمتابعة',html,'مسارك الشخصي');
}
function renderAddTaskForm(){
  openDialog('إضافة مهمة شخصية',`<form id="add-task-form">
    <div class="field"><label for="task-title">اسم المهمة</label><input id="task-title" name="title" maxlength="80" required placeholder="مثلاً: قراءة عشر دقائق" /></div>
    <div class="field"><label for="task-description">وصف مختصر (اختياري)</label><textarea id="task-description" name="description" maxlength="300" placeholder="اكتب ملاحظة تساعدك على تذكرها"></textarea></div>
    <div class="form-grid"><div class="field"><label for="task-category">التصنيف</label><select id="task-category" name="category"><option>شخصي</option><option>تعلم</option><option>قراءة</option><option>مساعدة الآخرين</option><option>عبادة</option><option>استكشاف</option></select></div>
    <div class="field"><label for="task-kind">التكرار</label><select id="task-kind" name="kind"><option value="once">مرة واحدة</option><option value="daily">يومياً (اختيار شخصي)</option><option value="weekly">أسبوعياً (اختيار شخصي)</option></select></div></div>
    <p class="helper">التكرار هنا إعداد تنظيمي تختاره أنت، وليس حكماً شرعياً أو تحديداً لعدد عبادة.</p>
    <button class="primary-small" type="submit">حفظ المهمة</button>
  </form>`,'إدارة المهام');
  $('#add-task-form').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const title=String(fd.get('title')).trim();if(!title)return;
    state.tasks.push({id:uid(),title,description:String(fd.get('description')||'').trim(),category:String(fd.get('category')),kind:String(fd.get('kind')),personal:true,system:false,completed:false,createdAt:new Date().toISOString()});
    addHistory('task-created',`أُضيفت مهمة: ${title}`);await saveNow();renderSummary();renderTasksPanel();showToast('تمت إضافة المهمة.');
  });
}
async function completeTask(id){
  const task=state.tasks.find(t=>t.id===id);if(!task||isTaskDone(task))return;
  const key=task.kind==='weekly'?weekKey():todayKey();
  if(task.kind==='once')task.completed=true;else task.lastCompletedKey=key;
  task.updatedAt=new Date().toISOString();
  addHistory('task-complete',`تم تسجيل المهمة: ${task.title}`,`تسجيل ذاتي · ${todayKey()}`);
  if(task.system&&task.rewardItem){changeInventory(task.rewardItem,1);showToast(`تم تسجيل المهمة وإضافة ${ITEM_CATALOG.find(i=>i.id===task.rewardItem)?.name||'عنصر'} للزينة.`);}
  else showToast('تم تسجيل المهمة الشخصية.');
  await saveNow();renderSummary();renderTasksPanel();
}
function deleteTask(id){
  const task=state.tasks.find(t=>t.id===id);if(!task||task.system)return;
  if(!confirm(`حذف المهمة «${task.title}»؟`))return;
  state.tasks=state.tasks.filter(t=>t.id!==id);addHistory('task-deleted',`حُذفت مهمة: ${task.title}`);persistSoon();renderSummary();renderTasksPanel();
}
function normalizeSearch(value){return String(value||'').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLocaleLowerCase('ar').trim();}
function renderLibraryPanel(){
  const normalized=normalizeSearch(libraryQuery);
  const favoriteIds=new Set(state.favorites.map(x=>x.id));
  const list=HADITHS.filter(h=>(libraryFilter==='all'||(libraryFilter==='favorites'?favoriteIds.has(h.id):h.category===libraryFilter))&&(!normalized||normalizeSearch(`${h.topic} ${h.text} ${h.collection} ${h.category}`).includes(normalized)));
  openDialog('المكتبة والمراجع',`<p class="panel-intro">نصوص أولية أُحيلت إلى صفحات مصادرها الرقمية. ظهورها هنا لا يعني اعتمادها من مراجع شرعي للتطبيق؛ تبقى غير مفعّلة كمكافآت أو مهام رسمية إلى حين مراجعة بشرية متخصصة.</p>
    <div class="field search-field"><label for="library-search">ابحث في الموضوع أو النص أو الكتاب</label><input id="library-search" value="${escapeHtml(libraryQuery)}" placeholder="مثلاً: النخلة، المسجد، اليتيم" /></div>
    <div class="card-actions" style="margin-bottom:13px"><button class="secondary-small" data-filter="all">الكل</button><button class="secondary-small" data-filter="الأذكار">الأذكار</button><button class="secondary-small" data-filter="الصلاة">الصلاة</button><button class="secondary-small" data-filter="المساجد">المساجد</button><button class="secondary-small" data-filter="الإحسان">الإحسان</button><button class="secondary-small" data-filter="favorites">المفضلة</button></div>
    ${list.length?`<div class="card-grid">${list.map(h=>`<article class="content-card"><div class="card-meta"><span class="tag">${escapeHtml(h.category)}</span><span class="tag warm">${escapeHtml(h.grade)}</span><span class="tag warning">مراجعة أولية</span></div><h3>${escapeHtml(h.topic)}</h3><p>${escapeHtml(h.text.slice(0,100))}${h.text.length>100?'…':''}</p><div class="small-muted" style="margin-top:7px">${escapeHtml(h.collection)} · ${escapeHtml(h.reference)}</div><div class="card-actions"><button class="secondary-small" data-action="hadith-detail" data-id="${escapeHtml(h.id)}">تفاصيل ومصدر</button><button class="primary-small" data-action="counter" data-id="${escapeHtml(h.id)}">عداد شخصي</button></div></article>`).join('')}</div>`:'<div class="empty-state"><strong>لا توجد نتائج</strong>جرّب كلمة أخرى أو غيّر التصنيف.</div>'}
    <div class="note-box">العداد الشخصي أداة تسجيل فقط. لا يثبت صدق الأداء أو قبول العمل، ولا يحدد عدداً شرعياً لم يرد في النص.</div>`,'مكتبة القراءة');
  $('#library-search').addEventListener('input',e=>{libraryQuery=e.target.value;const pos=e.target.selectionStart;renderLibraryPanel();const input=$('#library-search');input.focus();input.setSelectionRange(pos,pos);});
}
function renderHadithDetail(id){
  const h=HADITHS.find(x=>x.id===id);if(!h)return;
  const fav=state.favorites.some(x=>x.id===id);
  openDialog(h.topic,`<div class="card-meta"><span class="tag">${escapeHtml(h.category)}</span><span class="tag warm">${escapeHtml(h.grade)} · ${escapeHtml(h.gradeSource)}</span><span class="tag warning">مراجعة مصدر أولية</span></div>
    <div class="hadith-text">${escapeHtml(h.text)}</div>
    <p class="small-muted"><strong>الراوي:</strong> ${escapeHtml(h.narrator)}</p><p class="small-muted"><strong>المصدر:</strong> ${escapeHtml(h.collection)} · ${escapeHtml(h.reference)}</p>
    <p class="panel-intro">${escapeHtml(h.note)}</p><a class="source-link" href="${escapeHtml(h.source)}" target="_blank" rel="noopener noreferrer">فتح صفحة المصدر الأصلي ↗</a>
    <div class="note-box">حالة المحتوى: تم فحص صفحة المصدر الإلكتروني، لكنه يحتاج اعتماداً بشرياً متخصصاً قبل ربطه بمهام أو عناصر تُفتح مقابل العمل. العنصر الافتراضي لا يمثل حقيقة غيبية أو أجراً.</div>
    <div class="card-actions"><button class="primary-small" data-action="counter" data-id="${escapeHtml(h.id)}">فتح عداد شخصي</button><button class="secondary-small" data-action="favorite" data-id="${escapeHtml(h.id)}">${fav?'إزالة من المفضلة':'إضافة للمفضلة'}</button></div>`,'تفاصيل المرجع');
}
function toggleFavorite(id){
  const idx=state.favorites.findIndex(x=>x.id===id);
  if(idx>=0)state.favorites.splice(idx,1);else state.favorites.push({id,createdAt:new Date().toISOString()});
  persistSoon();renderHadithDetail(id);
}
function openCounter(hadithId){
  const h=HADITHS.find(x=>x.id===hadithId);if(!h)return;
  let session=state.sessions.find(x=>x.id===`current-${hadithId}`);
  if(!session){session={id:`current-${hadithId}`,hadithId,count:0,target:null,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),active:true};state.sessions.push(session);}
  renderCounter(h,session);
}
function renderCounter(h,session){
  const targetText=session.target?`هدفك الشخصي: ${session.target} (ليس عدداً شرعياً)`:'لا يوجد هدف عددي محدد';
  openDialog('عداد شخصي',`<p class="panel-intro">${escapeHtml(h.topic)} · ${escapeHtml(h.collection)} ${escapeHtml(h.reference)}</p>
    <div class="counter-card"><div class="counter-label">الجلسة المحفوظة على هذا الجهاز</div><div class="counter-value" id="counter-value">${session.count}</div><div class="counter-label" id="counter-target">${targetText}</div><div class="counter-actions"><button class="counter-plus" data-action="counter-plus" data-id="${escapeHtml(h.id)}" aria-label="زيادة العداد">＋</button></div>
    <div class="counter-actions"><button class="secondary-small" data-action="counter-undo" data-id="${escapeHtml(h.id)}">تراجع عن ضغطة</button><button class="secondary-small" data-action="counter-target" data-id="${escapeHtml(h.id)}">تحديد هدف شخصي</button><button class="danger-button" data-action="counter-reset" data-id="${escapeHtml(h.id)}">إعادة ضبط</button></div></div>
    <p class="helper">يُحفظ العدد بعد كل تغيير، ويمكنك الرجوع إليه لاحقاً. سجّل ما تفعله بنفسك؛ التطبيق لا يسمع الذكر ولا يتحقق منه.</p>
    <div class="card-actions"><button class="primary-small" data-action="counter-finish" data-id="${escapeHtml(h.id)}">إنهاء هذه الجلسة وتسجيلها</button></div>`,'متابعة الذكر');
}
async function updateCounter(hadithId,delta){
  const s=state.sessions.find(x=>x.id===`current-${hadithId}`);if(!s)return;
  s.count=Math.max(0,s.count+delta);s.updatedAt=new Date().toISOString();persistSoon();
  const value=$('#counter-value');if(value)value.textContent=s.count;
}
async function finishCounter(hadithId){
  const s=state.sessions.find(x=>x.id===`current-${hadithId}`);if(!s||s.count<=0){showToast('لا توجد نقرات مسجلة في هذه الجلسة.','warning');return;}
  const h=HADITHS.find(x=>x.id===hadithId);addHistory('session-finished',`سُجلت جلسة شخصية: ${h?.topic||'ذكر'}`,`عدد النقرات المسجل: ${s.count}`);
  s.lastFinishedCount=s.count;s.count=0;s.target=null;s.updatedAt=new Date().toISOString();await saveNow();renderSummary();
  showToast('تم حفظ سجل الجلسة على جهازك.');renderCounter(h,s);
}
function renderInventoryPanel(){
  const rows=ITEM_CATALOG.map(item=>({item,count:getInventoryCount(item.id)})).filter(x=>x.count>0);
  const placed=state.objects;
  openDialog('المخزون والبناء',`<p class="panel-intro">اختر عنصراً ثم اضغط على مساحة خضراء صالحة في العالم لوضعه. يمكنك نقل العناصر أو إعادتها إلى المخزون.</p>
    <h3 style="font-size:13px">المتاح لديك</h3>
    ${rows.length?rows.map(({item,count})=>`<div class="item-row"><div class="item-art">${itemIcon(item.id)}</div><div class="item-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></div><span class="item-count">× ${count}</span><button class="secondary-small" data-action="place-item" data-id="${item.id}">وضع</button></div>`).join(''):'<div class="empty-state">لا توجد عناصر متاحة حالياً.</div>'}
    <h3 style="font-size:13px;margin-top:22px">العناصر الموضوعة في الحديقة</h3>
    ${placed.length?placed.map(o=>{const item=ITEM_CATALOG.find(i=>i.id===o.itemId);return `<div class="item-row"><div class="item-art">${itemIcon(o.itemId)}</div><div class="item-copy"><strong>${escapeHtml(item?.name||'عنصر')}</strong><small>الموضع: ${Math.round(o.x)}، ${Math.round(o.y)}</small></div><button class="secondary-small" data-action="move-object" data-id="${escapeHtml(o.id)}">نقل</button><button class="danger-button" data-action="remove-object" data-id="${escapeHtml(o.id)}">إعادة للمخزون</button></div>`;}).join(''):'<div class="empty-state">لم تضع أي عناصر بعد. ابدأ بالشتلة أو الزهرة الموجودة في المخزون.</div>'}
    <div class="note-box">الأشجار والمباني والزينة داخل العالم عناصر رسومية رمزية، وليست تصويراً للجنة أو تجسيداً لنعيمها. لا تُحسب كأجر.</div>`,'تخصيص العالم');
}
function itemIcon(id){return ({sapling:'🌱',palm:'🌴',flower:'✿',bench:'▰',fountain:'◉',lamp:'♧'})[id]||'✿';}
function enterBuildMode(itemId,objectId=null){
  if(!objectId&&getInventoryCount(itemId)<=0){showToast('لا يوجد هذا العنصر في المخزون.','warning');return;}
  buildMode=objectId?{type:'move',objectId,itemId}:{type:'place',itemId};
  $('#dialog-backdrop').hidden=true;$('#build-banner').hidden=false;
  world.buildMode=true;
  $('#build-banner-text').textContent=objectId?'وضع النقل: اختر موضعاً جديداً للعنصر':'وضع البناء: اضغط على مساحة خضراء صالحة لتثبيت العنصر';
  showToast('يمكنك إلغاء العملية في أي وقت.');
}
async function placeFromCanvas(point){
  if(!buildMode)return;
  const mode=buildMode;const check=world.placeObjectAt(point.x,point.y,mode.itemId,mode.objectId);
  if(!check.ok){showToast(check.reason,'warning');return;}
  if(mode.type==='place'){
    if(getInventoryCount(mode.itemId)<=0){showToast('انتهى العدد المتاح من هذا العنصر.','warning');return;}
    changeInventory(mode.itemId,-1);state.objects.push({id:uid(),itemId:mode.itemId,x:Math.round(point.x),y:Math.round(point.y),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    addHistory('object-placed',`تم وضع ${ITEM_CATALOG.find(i=>i.id===mode.itemId)?.name||'عنصر'} في الحديقة`);
  } else {
    const o=state.objects.find(x=>x.id===mode.objectId);if(!o)return;
    o.x=Math.round(point.x);o.y=Math.round(point.y);o.updatedAt=new Date().toISOString();addHistory('object-moved',`تم نقل ${ITEM_CATALOG.find(i=>i.id===o.itemId)?.name||'عنصر'}`);
  }
  buildMode=null;world.buildMode=false;$('#build-banner').hidden=true;world.setState({objects:state.objects});await saveNow();renderSummary();showToast('تم حفظ التغيير داخل حديقتك.');
}
function removeObject(id){
  const o=state.objects.find(x=>x.id===id);if(!o)return;
  const item=ITEM_CATALOG.find(i=>i.id===o.itemId);if(!confirm(`إعادة ${item?.name||'العنصر'} إلى المخزون؟`))return;
  state.objects=state.objects.filter(x=>x.id!==id);changeInventory(o.itemId,1);addHistory('object-returned',`أُعيد ${item?.name||'عنصر'} إلى المخزون`);world.setState({objects:state.objects});persistSoon();renderInventoryPanel();renderSummary();
}
function renderMapPanel(){
  openDialog('خريطة الحديقة',`<p class="panel-intro">المناطق متصلة بالممرات في عالم واحد. اختر منطقة للانتقال بالكاميرا إليها، أو امشِ نحوها بنفسك.</p>
    <div class="zone-list">${ZONES.map(z=>`<button class="zone-card" data-action="focus-zone" data-id="${z.id}" type="button"><span class="zone-symbol">${zoneIcon(z.id)}</span><span><strong>${escapeHtml(z.name)}</strong><small>${state.garden.visitedZones.includes(z.id)?'تمت زيارتها':'مفتوحة · لم تزرها بعد'}</small></span></button>`).join('')}</div>
    <div class="note-box">تظهر المناطق داخل خريطة واحدة. هذا العرض لا يحاكي مكاناً حقيقياً أو عالماً غيبياً؛ إنها حديقة خيالية للتنظيم والاستكشاف.</div>`,'استكشف المكان');
}
function zoneIcon(id){return ({garden:'⌂',adhkar:'❧',prayer:'☼',mosque:'⌂',charity:'♡',orphan:'♧',ihsan:'✿',library:'▤',ongoing:'♣'})[id]||'✿';}
function renderAchievementsPanel(){
  const visits=(state.garden.visitedZones||[]).length,objects=state.objects.length,taskRecords=state.history.filter(x=>x.type==='task-complete').length,sessions=state.history.filter(x=>x.type==='session-finished').length,created=state.profile.createdAt;
  const badges=[['✦',visits,'مناطق تمت زيارتها'],['♧',objects,'عناصر موضوعة'],['✓',taskRecords,'مهام سجلتها'],['◉',sessions,'جلسات شخصية مسجلة'],['♡',state.favorites.length,'مراجع مفضلة'],['⌂',new Date(created).toLocaleDateString('ar-JO'),'بداية الحديقة']];
  openDialog('سجل الرحلة',`<p class="panel-intro">ملخص لنشاطك داخل التطبيق فقط. لا يقيس الإيمان أو الثواب أو قبول العمل.</p><div class="achievement-grid">${badges.map(([icon,value,label])=>`<div class="achievement"><strong>${icon} ${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
  <h3 style="font-size:13px;margin-top:22px">آخر الأحداث</h3>${state.history.length?`<div>${[...state.history].reverse().slice(0,12).map(h=>`<div class="item-row"><div class="item-art">${h.type==='object-placed'?'🌿':h.type==='session-finished'?'◉':h.type==='task-complete'?'✓':'✦'}</div><div class="item-copy"><strong>${escapeHtml(h.label)}</strong><small>${formatDate(h.createdAt)}</small></div></div>`).join('')}</div>`:'<div class="empty-state">ستظهر هنا الأحداث التي تسجلها داخل التطبيق.</div>'}`,'تقدمك داخل التطبيق');
}
function renderSettingsPanel(){
  const s=state.settings;
  openDialog('الإعدادات',`<form id="settings-form">
    <div class="form-grid"><div class="field"><label for="nickname">اسمك الظاهر</label><input id="nickname" maxlength="30" value="${escapeHtml(state.profile.nickname)}"></div><div class="field"><label for="garden-name">اسم الحديقة</label><input id="garden-name" maxlength="32" value="${escapeHtml(state.garden.name)}"></div></div>
    <div class="setting-row"><div><strong>تقليل الحركة</strong><small>إيقاف اللمعات وحركة الماء غير الضرورية.</small></div><input type="checkbox" id="reduce-motion" ${s.reduceMotion?'checked':''}></div>
    <div class="setting-row"><div><strong>وضع الأداء المنخفض</strong><small>تقليل الحركة وتخفيف بعض عمليات الرسم.</small></div><input type="checkbox" id="low-power" ${s.lowPower?'checked':''}></div>
    <div class="setting-row"><div><strong>سرعة الشخصية</strong><small>اضبط سرعة الحركة في العالم.</small></div><input type="range" min="0.7" max="1.3" step="0.1" id="move-speed" value="${Number(s.moveSpeed||1)}"></div>
    <div class="setting-row"><div><strong>حجم النص</strong><small>تغيير حجم النصوص داخل النوافذ.</small></div><input type="range" min="0.9" max="1.2" step="0.05" id="font-scale" value="${Number(s.fontScale||1)}"></div>
    <div class="card-actions" style="margin-top:16px"><button class="primary-small" type="submit">حفظ الإعدادات</button><button class="secondary-small" type="button" data-action="open-cloud">إعداد المزامنة السحابية</button><button class="secondary-small" type="button" data-action="backup">النسخ الاحتياطي</button></div>
  </form>
  <div class="note-box">يُحفظ التقدم محلياً على هذا الجهاز. حذف بيانات المتصفح قد يؤدي إلى فقدان نسخة الضيف؛ صدّر نسخة احتياطية أو فعّل المزامنة السحابية بعد إعدادها.</div>`,'تفضيلات الحديقة');
  $('#settings-form').addEventListener('submit',async e=>{
    e.preventDefault();state.profile.nickname=$('#nickname').value.trim()||'صديق الحديقة';state.garden.name=$('#garden-name').value.trim()||'حديقتي';
    state.settings.reduceMotion=$('#reduce-motion').checked;state.settings.lowPower=$('#low-power').checked;state.settings.moveSpeed=Number($('#move-speed').value);state.settings.fontScale=Number($('#font-scale').value);
    world.lowPower=state.settings.lowPower;world.reduceMotion=state.settings.reduceMotion;document.documentElement.style.setProperty('--user-font-scale',state.settings.fontScale);
    await saveNow();renderSummary();showToast('تم حفظ الإعدادات.');renderSettingsPanel();
  });
}
function renderCloudPanel(){
  const s=state.settings;
  openDialog('المزامنة بين الأجهزة',`<p class="panel-intro">تعمل الحديقة محلياً دون حساب. لنقلها بين الأجهزة، اربطها بمشروع Supabase خاص بك. يلزم إنشاء المشروع وتشغيل ملف SQL المرفق وإدخال رابط المشروع ومفتاح anon العام.</p>
    <div class="field"><label for="supabase-url">رابط مشروع Supabase</label><input id="supabase-url" type="url" placeholder="https://your-project.supabase.co" value="${escapeHtml(s.supabaseUrl||'')}"></div>
    <div class="field"><label for="supabase-key">مفتاح anon / publishable العام</label><input id="supabase-key" type="password" autocomplete="off" placeholder="المفتاح العام للمشروع" value="${escapeHtml(s.supabaseAnonKey||'')}"></div>
    <button class="primary-small" data-action="save-cloud-config">حفظ إعدادات الاتصال</button>
    <div class="divider-line" style="border-top:1px solid var(--line);margin:18px 0"></div>
    <div class="field"><label for="cloud-email">البريد الإلكتروني لتسجيل الدخول</label><input id="cloud-email" type="email" placeholder="name@example.com" autocomplete="email"></div>
    <div class="card-actions"><button class="primary-small" data-action="cloud-login">إرسال رابط تسجيل الدخول</button><button class="secondary-small" data-action="cloud-sync">مزامنة الآن</button><button class="danger-button" data-action="cloud-logout">تسجيل الخروج</button></div>
    <p class="helper" id="cloud-auth-status">${supabaseSession?'تم تسجيل الدخول إلى السحابة.':'لم يتم التحقق من جلسة سحابية بعد.'}</p>
    <div class="note-box">استخدم المفتاح العام فقط. لا تضع service_role أو كلمة مرور قاعدة البيانات في المتصفح. سياسات RLS في الملف المرفق هي التي تحمي بيانات الحسابات.</div>
    <a class="source-link" href="./supabase/schema.sql" target="_blank" rel="noopener">عرض ملف إعداد قاعدة البيانات ↗</a>`,'نسخ بياناتك إلى أجهزتك');
}
function renderBackupPanel(){
  openDialog('النسخ الاحتياطي والاستعادة',`<p class="panel-intro">أنشئ ملفاً محلياً يحتوي على اسم الحديقة والعناصر والمهام والإعدادات والسجلات الشخصية. لن يتضمن مفاتيح الاتصال السحابية.</p>
  <div class="card-grid"><article class="content-card"><h3>تصدير نسخة احتياطية</h3><p>تنزيل ملف JSON يمكنك الاحتفاظ به أو نقله إلى جهاز آخر.</p><div class="card-actions"><button class="primary-small" data-action="export-backup">تنزيل النسخة</button></div></article>
  <article class="content-card"><h3>استعادة نسخة</h3><p>فحص الملف قبل الاستيراد. لن تتغير البيانات الحالية حتى تؤكد الاستبدال.</p><div class="card-actions"><button class="secondary-small" data-action="import-backup">اختيار ملف</button></div></article></div>
  <div class="note-box">النسخة الاحتياطية لا تستبدل المزامنة السحابية. احتفظ بنسخة خارج الجهاز، خصوصاً قبل حذف بيانات المتصفح أو تغييره.</div>
  <button class="danger-button" data-action="reset-data">إعادة ضبط الحديقة</button>`,'حماية تقدمك');
}
function renderHelpPanel(){
  openDialog('المساعدة وطريقة الاستخدام',`<div class="content-card"><h3>التجول</h3><p>على الكمبيوتر استخدم WASD أو الأسهم، ثم اضغط E للتفاعل مع المكان القريب. على الهاتف استخدم عصا التحكم الظاهرة أسفل اليسار، واضغط زر «تفاعل» لفتح المكان القريب. ويمكنك لمس أرضية العالم لتوجيه الشخصية.</p></div>
  <div class="content-card" style="margin-top:10px"><h3>البناء</h3><p>افتح المخزون، واختر «وضع» بجانب العنصر، ثم اضغط مساحة خضراء قابلة للبناء. لن يسمح التطبيق بوضع عنصر فوق مبنى أو عنصر آخر. ويمكن إعادة العنصر إلى المخزون.</p></div>
  <div class="content-card" style="margin-top:10px"><h3>الحفظ</h3><p>يحفظ التطبيق تغييراتك تلقائياً في IndexedDB على هذا الجهاز. استخدم النسخ الاحتياطي لنقل تقدمك أو استعادته. المزامنة السحابية اختيارية وتتطلب إعداد Supabase.</p></div>
  <div class="content-card" style="margin-top:10px"><h3>الدقة الشرعية</h3><p>المكتبة تعرض النص والمصدر والدرجة المنقولة من صفحات المراجع، وتوضح أن السجلات تحتاج اعتماداً بشرياً متخصصاً قبل تفعيلها رسمياً. التطبيق لا يحكم على النية أو القبول ولا يحسب الثواب.</p></div>
  <div class="note-box">حديقتي عالم خيالي للتذكير والتنظيم فقط. المباني والأشجار الافتراضية لا تمثل الجنة، ولا تعني أن المستخدم أدى عملاً واقعياً بمجرد الضغط على زر.</div>`,'دليل الاستخدام');
}
function renderZone(id){
  const zone=ZONES.find(z=>z.id===id);if(!zone)return;
  if(!state.garden.visitedZones.includes(id)){state.garden.visitedZones.push(id);state.garden.currentZone=id;addHistory('zone-visited',`زرت ${zone.name}`);persistSoon();renderSummary();}
  const source=HADITHS.filter(h=>id==='library'||h.category===zone.short||h.category===zone.name||((id==='adhkar')&&h.category==='الأذكار')||((id==='orphan')&&h.id==='orphan-6005')||((id==='prayer')&&h.id==='rawatib-1797')||((id==='mosque')&&h.id==='mosque-533a'));
  const extra=source.length?`<h3 style="font-size:13px;margin-top:18px">مراجع ذات صلة</h3>${source.map(h=>`<div class="item-row"><div class="item-art">▤</div><div class="item-copy"><strong>${escapeHtml(h.topic)}</strong><small>${escapeHtml(h.collection)} · ${escapeHtml(h.reference)} · مراجعة أولية</small></div><button class="secondary-small" data-action="hadith-detail" data-id="${h.id}">عرض</button></div>`).join('')}`:'';
  openDialog(zone.name,`<div class="content-card"><div class="zone-symbol" style="margin-bottom:10px">${zoneIcon(id)}</div><p>${escapeHtml(zone.description)}</p><div class="card-meta"><span class="tag">منطقة قابلة للاستكشاف</span><span class="tag warm">${state.garden.visitedZones.includes(id)?'تمت الزيارة':'زيارة جديدة'}</span></div><button class="primary-small" data-action="walk-zone" data-id="${id}">العودة إلى التجول في هذه المنطقة</button></div>${extra}`,'من عالم الحديقة');
}
function interactNearby(){
  const nearby=world.nearestInteractable();if(!nearby){showToast('اقترب من مبنى أو منطقة ثم اضغط تفاعل.','warning');return;}
  if(nearby.type==='zone')renderZone(nearby.id);else{
    const item=ITEM_CATALOG.find(i=>i.id===nearby.object.itemId);openDialog(item?.name||'عنصر في الحديقة',`<div class="content-card"><div class="item-art" style="margin-bottom:12px">${itemIcon(nearby.object.itemId)}</div><h3>${escapeHtml(item?.name||'عنصر')}</h3><p>${escapeHtml(item?.description||'')}</p><p class="small-muted">عنصر افتراضي وضعته في حديقتك. لا يحمل معنى شرعياً أو تمثيلاً للغيب.</p><div class="card-actions"><button class="secondary-small" data-action="move-object" data-id="${nearby.object.id}">نقل العنصر</button><button class="danger-button" data-action="remove-object" data-id="${nearby.object.id}">إعادته للمخزون</button></div></div>`,'استكشاف العناصر');
  }
}

function focusZone(id){
  const zone=ZONES.find(z=>z.id===id);if(!zone)return;
  world.moveTo(zone.x,zone.y+115);state.garden.currentZone=id;closeDialog();
}
function updateNearbyUI(){
  const nearby=world.nearestInteractable();
  const key=nearby?`${nearby.type}-${nearby.id}`:'none';if(key===lastNearbyKey)return;lastNearbyKey=key;
  if(!nearby){$('#nearby-title').textContent='واصل الاستكشاف';$('#nearby-description').textContent='اقترب من أي مرفق واضغط تفاعل لفتح تفاصيله.';return;}
  $('#nearby-title').textContent=nearby.type==='zone'?nearby.object.name:(ITEM_CATALOG.find(i=>i.id===nearby.object.itemId)?.name||'عنصر');
  $('#nearby-description').textContent=nearby.type==='zone'?nearby.object.description:'عنصر موجود في الحديقة. اضغط تفاعل لعرض خياراته.';
}

function bindEvents(){
  $('#dialog-close').addEventListener('click',closeDialog);
  $('#dialog-backdrop').addEventListener('click',e=>{if(e.target===$('#dialog-backdrop'))closeDialog();});
  document.addEventListener('keydown',handleKeys);
  $$('.dock-item').forEach(btn=>btn.addEventListener('click',()=>openPanel(btn.dataset.open)));
  $$('.world-tool,[data-open]:not(.dock-item)').forEach(btn=>btn.addEventListener('click',()=>openPanel(btn.dataset.open)));
  $('#next-step-card').addEventListener('click',e=>{if(e.target.closest('[data-open]'))openPanel(e.target.closest('[data-open]').dataset.open);});
  $('#profile-button').addEventListener('click',()=>openPanel('settings'));
  $('#interact-button').addEventListener('click',interactNearby);
  $('#nearby-action').addEventListener('click',interactNearby);
  $('#cancel-build').addEventListener('click',()=>{buildMode=null;world.buildMode=false;$('#build-banner').hidden=true;showToast('تم إلغاء وضع البناء.');});
  $('#garden-canvas').addEventListener('pointerdown',onCanvasPointer);
  bindJoystick();
  $('#dialog-body').addEventListener('click',handleDialogAction);
  $('#backup-file').addEventListener('change',handleBackupFile);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install-button').hidden=false;});
  $('#install-button').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install-button').hidden=true;});
  window.addEventListener('online',()=>{$('#connection-status').textContent='متصل بالإنترنت';});
  window.addEventListener('offline',()=>{$('#connection-status').textContent='دون اتصال';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){world.setDirection(0,0);world.player.target=null;savePosition();}});
}
function handleKeys(e){
  if($('#dialog-backdrop')&&!$('#dialog-backdrop').hidden){if(e.key==='Escape'){closeDialog();}return;}
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  const key=e.key.toLowerCase();let x=0,y=0;
  if(key==='arrowup'||key==='w')y=-1; if(key==='arrowdown'||key==='s')y=1;if(key==='arrowleft'||key==='a')x=-1;if(key==='arrowright'||key==='d')x=1;
  if(x||y){e.preventDefault();world.setDirection(x,y);}
  if(key==='e'||key==='enter')interactNearby();
}
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){world?.setDirection(0,0);savePosition();}});
function bindJoystick(){
  const base=$('.joystick-base'),knob=$('#joystick-knob');if(!base||!knob)return;let active=false,pointerId=null;
  const reset=()=>{active=false;pointerId=null;knob.style.transform='translate(0,0)';world.setDirection(0,0);savePosition();};
  base.addEventListener('pointerdown',e=>{active=true;pointerId=e.pointerId;base.setPointerCapture(pointerId);move(e);});
  base.addEventListener('pointermove',e=>{if(active&&e.pointerId===pointerId)move(e);});
  base.addEventListener('pointerup',e=>{if(e.pointerId===pointerId)reset();});
  base.addEventListener('pointercancel',reset);
  function move(e){const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const len=Math.hypot(dx,dy),max=31;if(len>max){dx=dx/len*max;dy=dy/len*max;}knob.style.transform=`translate(${dx}px,${dy}px)`;const l=Math.hypot(dx,dy);world.setDirection(l<5?0:dx/max,l<5?0:dy/max);}
}
function onCanvasPointer(e){
  if(e.button!==undefined&&e.button!==0)return;
  const point=world.screenToWorld(e.clientX,e.clientY);
  if(buildMode){placeFromCanvas(point);return;}
  const zone=ZONES.find(z=>Math.hypot(z.x-point.x,z.y-point.y)<82);
  if(zone){world.focusZone(zone.id);state.garden.currentZone=zone.id;return;}
  const object=state.objects.find(o=>Math.hypot(o.x-point.x,o.y-point.y)<38);
  if(object&&Math.hypot(object.x-world.player.x,object.y-world.player.y)<130){interactNearby();return;}
  world.moveTo(point.x,point.y);
}
let lastPositionSave=0;
function savePosition(){
  if(!world||!state)return;
  const position=world.getPlayerPosition();const key=JSON.stringify(position);if(key===lastSavedPosition)return;
  state.garden.playerPosition=position;state.garden.camera={zoom:world.camera.zoom};lastSavedPosition=key;persistSoon();
}
function frame(timestamp){
  if(!world)return;
  if(!document.hidden){const dt=world.lastTime?Math.min((timestamp-world.lastTime)/1000,.06):0;world.update(dt*(state.settings.moveSpeed||1));world.draw(timestamp);
    if(timestamp-lastPositionSave>1200){const p=JSON.stringify(world.getPlayerPosition());if(p!==lastSavedPosition)savePosition();lastPositionSave=timestamp;}
    if(timestamp%300<18)updateNearbyUI();
  }
  world.lastTime=timestamp;requestAnimationFrame(frame);
}

async function handleDialogAction(e){
  const btn=e.target.closest('[data-action],[data-filter]');if(!btn)return;
  if(btn.dataset.filter){libraryFilter=btn.dataset.filter;renderLibraryPanel();return;}
  const action=btn.dataset.action,id=btn.dataset.id;
  switch(action){
    case 'show-add-task':renderAddTaskForm();break;
    case 'complete-task':await completeTask(id);break;
    case 'delete-task':deleteTask(id);break;
    case 'hadith-detail':renderHadithDetail(id);break;
    case 'counter':openCounter(id);break;
    case 'counter-plus':await updateCounter(id,1);break;
    case 'counter-undo':await updateCounter(id,-1);break;
    case 'counter-finish':await finishCounter(id);break;
    case 'counter-reset':{const s=state.sessions.find(x=>x.id===`current-${id}`);if(s&&confirm('إعادة ضبط هذا العداد؟')){s.count=0;s.updatedAt=new Date().toISOString();persistSoon();renderCounter(HADITHS.find(h=>h.id===id),s);}}break;
    case 'counter-target':{const s=state.sessions.find(x=>x.id===`current-${id}`);if(!s)return;const val=prompt('أدخل هدفاً شخصياً اختيارياً، أو اتركه فارغاً لإلغاء الهدف. هذا ليس عدداً شرعياً.');if(val===null)return;s.target=val.trim()?Math.min(99999,Math.max(1,Number(val)||1)):null;s.updatedAt=new Date().toISOString();persistSoon();renderCounter(HADITHS.find(h=>h.id===id),s);}break;
    case 'favorite':toggleFavorite(id);break;
    case 'place-item':enterBuildMode(id);break;
    case 'move-object':enterBuildMode(state.objects.find(o=>o.id===id)?.itemId,id);break;
    case 'remove-object':removeObject(id);break;
    case 'focus-zone':focusZone(id);break;
    case 'walk-zone':focusZone(id);break;
    case 'backup':renderBackupPanel();break;
    case 'open-cloud':renderCloudPanel();break;
    case 'export-backup':await downloadBackup();break;
    case 'import-backup':$('#backup-file').click();break;
    case 'reset-data':await resetAllData();break;
    case 'save-cloud-config':await saveCloudConfig();break;
    case 'cloud-login':await cloudLogin();break;
    case 'cloud-sync':await cloudSync();break;
    case 'cloud-logout':await cloudLogout();break;
  }
}

async function downloadBackup(){
  try{await saveNow();const backup=await exportBackup(state);const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`hadiqati-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);state.garden.lastBackupAt=new Date().toISOString();addHistory('backup-exported','تم تنزيل نسخة احتياطية');persistSoon();showToast('تم إعداد ملف النسخة الاحتياطية.');}
  catch(error){showToast(error.message,'error');}
}
async function handleBackupFile(e){
  const file=e.target.files?.[0];if(!file)return;e.target.value='';
  try{if(file.size>8*1024*1024)throw new Error('حجم الملف أكبر من الحد المسموح.');const text=await file.text();const parsed=JSON.parse(text);const restored=validateBackup(parsed);
    if(!confirm('سيتم استبدال بيانات الحديقة الحالية بالنسخة المختارة. هل أنشأت نسخة من تقدمك الحالي وتريد المتابعة؟'))return;
    const old=await exportBackup(state);const blob=new Blob([JSON.stringify(old,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`hadiqati-before-restore-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);
    const cloudConfig={supabaseUrl:state.settings.supabaseUrl||'',supabaseAnonKey:state.settings.supabaseAnonKey||'',cloudEnabled:!!state.settings.cloudEnabled};
    state=restored;state.settings={...state.settings,...cloudConfig};addHistory('backup-restored','تمت استعادة نسخة احتياطية');await saveNow();world.setPlayer(state.garden.playerPosition);world.setState({objects:state.objects});renderSummary();closeDialog();showToast('تمت استعادة النسخة الاحتياطية.');
  }catch(error){showToast(`تعذرت الاستعادة: ${error.message}`,'error');}
}
async function resetAllData(){
  if(!confirm('هل تريد إعادة ضبط الحديقة؟ سيتم حذف بياناتها المحلية.'))return;
  if(!confirm('تأكيد أخير: لا يمكن التراجع إلا باستخدام نسخة احتياطية. هل تتابع؟'))return;
  await clearUserData();state=newState();await saveSnapshot(state);world.setPlayer(state.garden.playerPosition);world.setState({objects:[]});renderSummary();renderBackupPanel();showToast('بدأت حديقة جديدة.');
}

async function saveCloudConfig(){
  const url=$('#supabase-url')?.value.trim(),key=$('#supabase-key')?.value.trim();
  if(!url||!key){showToast('أدخل رابط المشروع ومفتاح anon العام.','warning');return;}
  try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error('رابط المشروع غير صالح.');state.settings.supabaseUrl=parsed.origin;state.settings.supabaseAnonKey=key;state.settings.cloudEnabled=true;await saveNow();updateCloudStatus();showToast('تم حفظ إعدادات الاتصال.');renderCloudPanel();}
  catch(error){showToast(error.message,'error');}
}
async function cloudLogin(){
  const email=$('#cloud-email')?.value.trim();if(!email){showToast('أدخل بريدك الإلكتروني أولاً.','warning');return;}
  try{await saveNow();await sendMagicLink(state.settings,email,location.href.split('#')[0]);showToast('أُرسل رابط تسجيل الدخول إلى بريدك الإلكتروني.');$('#cloud-auth-status').textContent='افتح رسالة البريد واتبع رابط الدخول من هذا الجهاز.';}
  catch(error){showToast(`تعذر إرسال الرابط: ${error.message}`,'error');}
}
async function cloudSync(){
  try{
    await saveNow();const remote=await pullCloudSnapshot(state.settings);
    if(remote){
      const cloudTime=new Date(remote.garden?.updatedAt||0).getTime();const localTime=new Date(state.garden.updatedAt||0).getTime();
      if(cloudTime>localTime){
        const choice=confirm('توجد نسخة سحابية أحدث من حديقتك على هذا الجهاز. اضغط موافق لتحميل النسخة السحابية (سيتم تنزيل نسخة احتياطية من بياناتك الحالية أولاً)، أو إلغاء للاحتفاظ بهذا الجهاز ورفع بياناته.');
        if(choice){const current=await exportBackup(state);const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`hadiqati-before-cloud-pull-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);const cloudConfig={supabaseUrl:state.settings.supabaseUrl||'',supabaseAnonKey:state.settings.supabaseAnonKey||'',cloudEnabled:!!state.settings.cloudEnabled};state=remote;state.settings={...state.settings,...cloudConfig};addHistory('cloud-pulled','تم تحميل نسخة الحديقة من السحابة');await saveNow();world.setPlayer(state.garden.playerPosition);world.setState({objects:state.objects});renderSummary();showToast('تم تحميل الحديقة السحابية.');return;}
        const result=await pushCloudSnapshot(state.settings,state,true);if(result.pushed){showToast('تم رفع الحديقة الحالية إلى السحابة.');return;}
      }
    }
    const result=await pushCloudSnapshot(state.settings,state,false);
    if(result.conflict){showToast('هناك نسخة سحابية أحدث. أعد المزامنة واختر التحميل أو الرفع.','warning');return;}
    showToast('اكتملت المزامنة السحابية.');
  }catch(error){showToast(`لم تكتمل المزامنة: ${error.message}`,'error');}
}
async function cloudLogout(){
  try{await signOutCloud(state.settings);supabaseSession=null;$('#cloud-auth-status').textContent='تم تسجيل الخروج من السحابة؛ بيانات هذا الجهاز لم تتغير.';showToast('تم تسجيل الخروج من السحابة.');}
  catch(error){showToast(error.message,'error');}
}
async function updateCloudStatus(){
  try{const {session}=await getCloudSession(state.settings);supabaseSession=session;$('#connection-status').textContent=session?'سحابة متصلة':'المزامنة غير مسجلة';}
  catch{$('#connection-status').textContent='الوضع المحلي';}
}
async function checkCloudCallback(){
  if(!state.settings.supabaseUrl||!state.settings.supabaseAnonKey)return;
  try{const {session}=await getCloudSession(state.settings);supabaseSession=session;if(session){$('#connection-status').textContent='سحابة متصلة';showToast('تم تسجيل الدخول إلى المزامنة السحابية.');}}
  catch{}
}

function bindWorldInteractions(){/* Reserved for future world-specific input modules. */}

init();
