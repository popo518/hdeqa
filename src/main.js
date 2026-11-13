import * as THREE from 'three';
import { loadSavedState, saveState, requestPersistentStorage } from './storage.js';
import {
  TASKS, BUILD_ITEMS, GRAPHICS_PROFILES, createInitialState, normalizeState,
  localDateKey, taskInstanceId, rewardText, canAfford, resourceSummary, formatDateTime,
} from './data.js';
import { GardenWorld } from './world.js';
import { recordTaskCompletion, spendResources } from './ledger.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#world');
const sheet = $('#sheet');
const sheetTitle = $('#sheet-title');
const sheetKicker = $('#sheet-kicker');
const sheetContent = $('#sheet-content');
const buildBar = $('#build-bar');
const toast = $('#toast');
const saveStatus = $('#save-status');
const loadingScreen = $('#loading');

let state;
let world;
let swRegistration = null;
let activePanel = null;
let saveChain = Promise.resolve();
let toastTimer = null;
let notificationTimer = null;
let lastPositionSaved = null;
let cameraSaveTimer = null;

const RESOURCE_LABELS = { seeds: 'بذور', wood: 'خشب', stone: 'حجر' };
const PRAYER_LABELS = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setSaveStatus(status, label) {
  saveStatus.classList.remove('saving', 'error');
  if (status === 'saving') saveStatus.classList.add('saving');
  if (status === 'error') saveStatus.classList.add('error');
  saveStatus.lastChild.textContent = ` ${label}`;
}

function persist() {
  const snapshot = JSON.parse(JSON.stringify(state));
  setSaveStatus('saving', 'جارٍ الحفظ');
  saveChain = saveChain.catch(() => undefined).then(() => saveState(snapshot)).then(result => {
    if (result.ok) {
      setSaveStatus('saved', result.storage === 'indexeddb' ? 'محفوظ' : 'حفظ احتياطي');
    } else {
      setSaveStatus('error', 'تعذر الحفظ');
      showToast('تعذر حفظ التغييرات. صدّر نسخة احتياطية من الإعدادات.');
    }
    return result;
  }).catch(error => {
    console.error(error);
    setSaveStatus('error', 'تعذر الحفظ');
    return { ok: false, error };
  });
  return saveChain;
}

function setSheet(title, kicker, html) {
  if (world?.buildType) world.cancelBuild();
  activePanel = title;
  sheetTitle.textContent = title;
  sheetKicker.textContent = kicker;
  sheetContent.innerHTML = html;
  sheet.classList.remove('hidden');
  world?.setInputPaused(true);
  $('#bottom-dock').classList.add('hidden');
  buildBar.classList.add('hidden');
}

function closeSheet() {
  activePanel = null;
  sheet.classList.add('hidden');
  world?.setInputPaused(false);
  $('#bottom-dock').classList.remove('hidden');
}

function renderResources() {
  return `<div class="resource-strip">${resourceSummary(state.resources).map(resource => `
    <div class="resource-chip"><span>${resource.emoji}</span><span>${resource.label}</span><strong>${resource.amount}</strong></div>
  `).join('')}</div>`;
}

function taskTime(task) {
  if (task.timeKey && task.kind === 'prayer') {
    const value = state.settings.prayerTimes[task.timeKey];
    return value ? `الوقت الذي ضبطته: ${escapeHTML(value)}` : 'لم تضبط وقتها بعد';
  }
  if (task.timeKey === 'morning') return `تذكير الصباح: ${escapeHTML(state.settings.morningTime || '07:00')}`;
  if (task.timeKey === 'evening') return `تذكير المساء: ${escapeHTML(state.settings.eveningTime || '18:00')}`;
  return 'متاحة خلال اليوم';
}

function renderTasks() {
  const date = localDateKey();
  const completedCount = TASKS.filter(task => state.completions[taskInstanceId(task.id, date)]).length;
  $('#task-count').textContent = String(TASKS.length - completedCount);
  const dateLabel = new Intl.DateTimeFormat('ar-JO', { dateStyle: 'full' }).format(new Date());
  const cards = TASKS.map(task => {
    const record = state.completions[taskInstanceId(task.id, date)];
    const time = taskTime(task);
    const reward = rewardText(task.reward);
    return `<article class="task-card ${record ? 'done' : ''}">
      <div>
        <div class="task-title-row"><span class="task-dot"></span><h3 class="task-name">${escapeHTML(task.title)}</h3></div>
        <p class="task-desc">${escapeHTML(task.description)}</p>
        <div class="task-meta"><span>${time}</span><span class="reward-label">موارد اللعبة: ${escapeHTML(reward)}</span></div>
        ${record ? `<div class="task-meta"><span>سُجّل: ${escapeHTML(formatDateTime(record.completedAt))}</span></div>` : ''}
      </div>
      ${record ? '<span class="done-label">تم التسجيل ✓</span>' : `<button class="primary-small" type="button" data-complete="${escapeHTML(task.id)}">تسجيل الإنجاز</button>`}
    </article>`;
  }).join('');
  setSheet('المهام اليومية', dateLabel, `
    <p class="section-note">هذه قائمة شخصية للتذكير. عند الضغط على «تسجيل الإنجاز» يُحفظ تأكيدك أنت فقط؛ التطبيق لا يستطيع التحقق من أداء العبادة في الواقع. الموارد مكافآت افتراضية داخل اللعبة وليست قياسًا للأجر أو الحسنات.</p>
    <div class="task-list">${cards}</div>
    <p class="setting-footnote">النصوص الشرعية والأحاديث غير مضمّنة في هذه النسخة قبل مراجعتها وتوثيق ألفاظها ومصادرها. يمكنك قراءة الأذكار من مصدر موثوق ثم استخدام التذكير هنا.</p>
  `);
}

function renderBuild() {
  const items = BUILD_ITEMS.map(item => {
    const affordable = canAfford(state.resources, item.cost);
    const costText = Object.entries(item.cost).map(([key, amount]) => `${amount} ${RESOURCE_LABELS[key]}`).join('<br>');
    return `<article class="catalog-card">
      <div class="catalog-top"><span class="item-emoji">${item.emoji}</span><span class="item-cost">${costText}</span></div>
      <h3>${escapeHTML(item.name)}</h3>
      <p>${escapeHTML(item.description)}</p>
      <button class="${affordable ? 'primary-small' : 'secondary-small'}" type="button" data-build="${item.id}" ${affordable ? '' : 'disabled'}>${affordable ? 'اختيار المكان' : 'موارد غير كافية'}</button>
    </article>`;
  }).join('');
  setSheet('قائمة البناء', 'اختر ما تريد إضافته إلى عالمك', `
    <p class="section-note">اختر عنصرًا، ثم اضغط على الأرض في المكان المناسب لتحديد موضعه. يمكنك تدويره قبل التثبيت. لا تُخصم الموارد إلا بعد نجاح التثبيت.</p>
    ${renderResources()}
    <div class="catalog-list">${items}</div>
    <p class="setting-footnote">تُسجّل تفاصيل تكلفة كل عنصر والمهام التي ساهمت في توفير موارده، إن وُجدت، ضمن سجل العنصر.</p>
  `);
}

function renderHistory() {
  const entries = [...(state.history || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const html = entries.length ? entries.map(entry => `
    <article class="history-card"><div><strong>${escapeHTML(entry.title)}</strong><p>${escapeHTML(entry.description || '')}</p></div><span class="history-date">${escapeHTML(formatDateTime(entry.createdAt))}</span></article>
  `).join('') : '<div class="empty-state">لا يوجد سجل بعد.<br>ابدأ بتسجيل نشاط أو إضافة عنصر إلى الحديقة.</div>';
  setSheet('سجل الحديقة', 'كل ما أضفته وسجّلته يبقى هنا', `
    <p class="section-note">هذا سجل للأنشطة والعناصر داخل التطبيق فقط، وليس حكمًا على القبول أو الأجر أو الحالة الدينية.</p>
    ${renderResources()}
    <div class="history-list">${html}</div>
  `);
}

function renderSettings() {
  const graphics = GRAPHICS_PROFILES.map(profile => `<button class="choice-button ${state.settings.graphics === profile.id ? 'active' : ''}" type="button" data-graphics="${profile.id}">${profile.label}</button>`).join('');
  const speeds = [4, 6, 8].map(speed => `<button class="choice-button ${Number(state.settings.movementSpeed) === speed ? 'active' : ''}" type="button" data-speed="${speed}">${speed === 4 ? 'هادئة' : speed === 6 ? 'متوازنة' : 'سريعة'}</button>`).join('');
  const prayerInputs = Object.entries(PRAYER_LABELS).map(([key, label]) => `<label class="setting-row"><span>${label}</span><input type="time" value="${escapeHTML(state.settings.prayerTimes[key] || '')}" data-prayer-time="${key}" /></label>`).join('');
  const notificationsText = state.settings.notificationsEnabled ? 'مفعّلة' : 'متوقفة';
  setSheet('الإعدادات', 'خيارات بسيطة ويمكن تغييرها متى شئت', `
    <div class="settings-grid">
      <section class="setting-card">
        <h3>جودة العالم ثلاثي الأبعاد</h3>
        <div class="setting-buttons">${graphics}</div>
        <p class="setting-footnote">الوضع التلقائي يختار جودة مبدئية ثم يخفض دقة الرسم عند هبوط الأداء. تبقى الحديقة والعناصر المحفوظة كما هي عند تغيير الجودة.</p>
      </section>
      <section class="setting-card">
        <h3>سرعة الحركة</h3>
        <div class="setting-buttons">${speeds}</div>
        <div class="setting-row"><span>مسافة الكاميرا</span><div class="setting-buttons"><button class="choice-button" type="button" data-camera-distance="-2">تقريب</button><button class="choice-button" type="button" data-camera-distance="2">إبعاد</button><button class="choice-button" type="button" data-camera-reset>إعادة</button></div></div>
      </section>
      <section class="setting-card">
        <h3>أوقات الصلاة التي تريد تذكّرها</h3>
        <p class="section-note">أدخل الأوقات وفق تقويم المسجد أو الجهة التي تعتمدها. لا تستخدم هذه النسخة GPS ولا تحسب المواقيت تلقائيًا، ولا تفترض أن طريقة واحدة تناسب الجميع.</p>
        ${prayerInputs}
      </section>
      <section class="setting-card">
        <h3>تذكير الأذكار</h3>
        <label class="setting-row"><span>وقت تذكير الصباح</span><input type="time" value="${escapeHTML(state.settings.morningTime || '07:00')}" data-reminder-time="morningTime" /></label>
        <label class="setting-row"><span>وقت تذكير المساء</span><input type="time" value="${escapeHTML(state.settings.eveningTime || '18:00')}" data-reminder-time="eveningTime" /></label>
      </section>
      <section class="setting-card">
        <h3>الإشعارات</h3>
        <div class="setting-row"><span>الحالة: ${notificationsText}</span><button class="toggle-button ${state.settings.notificationsEnabled ? 'active' : ''}" type="button" data-notifications>${state.settings.notificationsEnabled ? 'إيقاف' : 'تفعيل'}</button></div>
        <p class="setting-footnote">في هذه النسخة تعمل التنبيهات عندما تكون الحديقة مفتوحة فقط، وبعد إذن المتصفح. لا يوجد خادم Push يعمل في الخلفية؛ لذلك لا نعدك بوصول تنبيه بعد إغلاق المتصفح.</p>
      </section>
      <section class="setting-card">
        <h3>النسخ الاحتياطي</h3>
        <p class="section-note">بياناتك محفوظة على هذا المتصفح. احتفظ بنسخة JSON لاستعادتها عند تغيير الجهاز أو حذف بيانات المتصفح.</p>
        <div class="utility-row"><button type="button" data-export>تصدير نسخة احتياطية</button><button type="button" data-restore>استعادة نسخة</button></div>
        <p class="setting-footnote">المنطقة الزمنية الحالية: ${escapeHTML(Intl.DateTimeFormat().resolvedOptions().timeZone || 'توقيت الجهاز المحلي')}</p>
      </section>
    </div>
  `);
}

function renderObjectDetails(itemId) {
  const item = state.placedItems.find(entry => entry.id === itemId);
  if (!item) return;
  const sourceTasks = (item.sourceTaskIds || []).map(id => TASKS.find(task => task.id === id)?.title || (id === 'starter-kit' ? 'حزمة البداية' : id));
  const acquired = formatDateTime(item.acquiredAt || item.placedAt);
  const placed = formatDateTime(item.placedAt);
  const sources = sourceTasks.length ? sourceTasks.join('، ') : 'حزمة البداية أو رصيد محفوظ';
  const sourceNote = item.sourceTaskIds?.length
    ? 'المهمة هنا تشرح مصدر موارد اللعبة فقط؛ لا توجد دلالة على مقدار الأجر الديني.'
    : 'لا توجد مهمة مرتبطة مباشرة بهذا العنصر في سجل الموارد.';
  setSheet(item.name, 'تفاصيل العنصر وسجل اكتسابه', `
    <div class="object-card">
      <div class="object-details">
        <div class="detail-row"><span>العنصر</span><strong>${escapeHTML(item.name)}</strong></div>
        <div class="detail-row"><span>طريقة الحصول</span><strong>إنشاء بموارد الحديقة</strong></div>
        <div class="detail-row"><span>تاريخ الإنشاء</span><strong>${escapeHTML(acquired)}</strong></div>
        <div class="detail-row"><span>تاريخ أول وضع</span><strong>${escapeHTML(placed)}</strong></div>
        <div class="detail-row"><span>التكلفة</span><strong>${escapeHTML(rewardText(item.cost))}</strong></div>
        <div class="detail-row"><span>مصادر الموارد</span><strong>${escapeHTML(sources)}</strong></div>
      </div>
      <p class="setting-footnote">${sourceNote}</p>
      <p class="setting-footnote">لا توجد إحالة قرآنية أو حديثية مرفقة بهذا العنصر؛ لا يربط التطبيق الزينة بنص شرعي دون مراجعة وتوثيق.</p>
    </div>
    <div class="utility-row" style="margin-top:12px"><button type="button" data-close-details>العودة إلى الحديقة</button></div>
  `);
}

function updateTaskCounter() {
  const date = localDateKey();
  const count = TASKS.filter(task => !state.completions[taskInstanceId(task.id, date)]).length;
  $('#task-count').textContent = String(count);
}

function completeTask(taskId) {
  const task = TASKS.find(entry => entry.id === taskId);
  if (!task) return;
  const date = localDateKey();
  const completedAt = new Date().toISOString();
  const transactionId = `task-${crypto.randomUUID()}`;
  const result = recordTaskCompletion(state, task, date, completedAt, transactionId);
  if (!result.ok) {
    showToast('هذا النشاط مسجّل بالفعل اليوم.');
    return;
  }
  persist();
  renderTasks();
  showToast(`تم تسجيل النشاط. موارد الحديقة: ${rewardText(task.reward)}`);
  updateTaskCounter();
}


function placeBuildItem() {
  const placement = world?.getPreviewPlacement();
  if (!placement?.valid) {
    showToast('اختر أرضًا مستوية وبعيدة عن النهر والأغراض الأخرى.');
    return;
  }
  const catalog = BUILD_ITEMS.find(item => item.id === world.buildType);
  if (!catalog || !canAfford(state.resources, catalog.cost)) {
    showToast('مواردك لا تكفي لهذا العنصر.');
    cancelBuildMode();
    return;
  }
  const sources = spendResources(state, catalog.cost);
  if (!sources) {
    showToast('تعذر مطابقة تكلفة العنصر مع سجل الموارد. لم يتم الخصم.');
    return;
  }
  const now = new Date().toISOString();
  const id = `item-${crypto.randomUUID()}`;
  const sourceTaskIds = [...new Set(sources.map(source => source.taskId).filter(Boolean))];
  const record = {
    id, type: catalog.id, name: catalog.name, radius: catalog.radius,
    x: placement.x, z: placement.z, rotation: placement.rotation,
    acquiredAt: now, placedAt: now, cost: { ...catalog.cost },
    sourceTransactions: sources, sourceTaskIds,
    placementHistory: [{ x: placement.x, z: placement.z, placedAt: now }],
    provenanceVersion: 1,
  };
  state.placedItems.push(record);
  state.transactions.push({ id: `build-${id}`, type: 'construction', itemId: id, createdAt: now, resources: Object.fromEntries(Object.entries(catalog.cost).map(([key, value]) => [key, -value])), sourceTransactions: sources.map(source => source.transactionId) });
  state.history.push({ id: `history-${id}`, type: 'item', title: `إنشاء ${catalog.name}`, description: `التكلفة: ${rewardText(catalog.cost)}.`, createdAt: now });
  world.addPlacedItem(record);
  persist();
  cancelBuildMode();
  showToast(`أُضيف ${catalog.name} إلى حديقتك.`);
}

function startBuildMode(itemId) {
  const item = BUILD_ITEMS.find(entry => entry.id === itemId);
  if (!item) return;
  if (!canAfford(state.resources, item.cost)) {
    showToast('تحتاج إلى موارد إضافية لهذا العنصر.');
    return;
  }
  closeSheet();
  world.setBuildType(item.id);
  $('#build-item-name').textContent = `بناء: ${item.name}`;
  $('#build-hint').textContent = 'اضغط على الأرض لتحديد المكان، ثم ثبّت العنصر';
  $('#confirm-build').disabled = true;
  buildBar.classList.remove('hidden');
  $('#bottom-dock').classList.add('hidden');
  showToast('اختر مكانًا مناسبًا في الحديقة.');
}

function cancelBuildMode() {
  world?.cancelBuild();
  buildBar.classList.add('hidden');
  $('#bottom-dock').classList.remove('hidden');
}

function exportBackup() {
  const payload = { app: 'MY_GARDEN', exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-garden-backup-${localDateKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('تم تجهيز النسخة الاحتياطية.');
}

async function restoreBackup(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = parsed?.state || parsed;
    if (!incoming || incoming.schemaVersion !== 1 || !Array.isArray(incoming.placedItems) || !incoming.resources || !incoming.player || !incoming.settings) {
      throw new Error('صيغة النسخة غير معروفة');
    }
    if (!confirm('سيتم استبدال بيانات هذه الحديقة بالنسخة المختارة. هل تريد المتابعة؟')) return;
    state = normalizeState(incoming);
    await persist();
    location.reload();
  } catch (error) {
    console.error(error);
    showToast('تعذر استعادة النسخة. تأكد من اختيار ملف MY GARDEN صحيح.');
  }
}

async function toggleNotifications() {
  if (state.settings.notificationsEnabled) {
    state.settings.notificationsEnabled = false;
    await persist();
    renderSettings();
    showToast('تم إيقاف الإشعارات.');
    return;
  }
  if (!('Notification' in window)) {
    showToast('هذا المتصفح لا يدعم إشعارات النظام.');
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast(permission === 'denied' ? 'إذن الإشعارات مرفوض من إعدادات المتصفح.' : 'لم يتم تفعيل الإشعارات.');
    return;
  }
  state.settings.notificationsEnabled = true;
  await persist();
  renderSettings();
  showToast('فُعّلت التنبيهات أثناء فتح الحديقة.');
}

function shouldSendNotification(taskId, date) {
  return !state.completions[taskInstanceId(taskId, date)];
}

async function deliverNotification(title, body, tag) {
  try {
    if (swRegistration?.active) {
      await swRegistration.showNotification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg', renotify: false });
    } else {
      new Notification(title, { body, tag, renotify: false });
    }
  } catch (error) {
    console.warn('Notification failed:', error);
  }
}

async function checkNotifications() {
  if (!state.settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted' || document.hidden) return;
  const now = new Date();
  const date = localDateKey(now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const reminders = [
    { id: 'morning-adhkar', time: state.settings.morningTime, title: 'تذكير الصباح', body: 'حان وقت التذكير الذي اخترته لأذكار الصباح.' },
    { id: 'evening-adhkar', time: state.settings.eveningTime, title: 'تذكير المساء', body: 'حان وقت التذكير الذي اخترته لأذكار المساء.' },
    ...Object.entries(PRAYER_LABELS).map(([id, label]) => ({ id, time: state.settings.prayerTimes[id], title: `تذكير صلاة ${label}`, body: `هذا هو الوقت الذي أدخلته لتذكير صلاة ${label}.` })),
  ];
  let changed = false;
  for (const reminder of reminders) {
    if (!reminder.time || reminder.time !== time || !shouldSendNotification(reminder.id, date)) continue;
    const key = `${date}:${reminder.id}`;
    if (state.notificationLog[key]) continue;
    state.notificationLog[key] = new Date().toISOString();
    await deliverNotification(reminder.title, reminder.body, key);
    changed = true;
  }
  if (changed) persist();
}

function handleSheetClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.complete) completeTask(button.dataset.complete);
  if (button.dataset.build) startBuildMode(button.dataset.build);
  if (button.dataset.graphics) {
    state.settings.graphics = button.dataset.graphics;
    world.setGraphics(button.dataset.graphics);
    persist();
    renderSettings();
    showToast(`تم تغيير الجودة إلى ${GRAPHICS_PROFILES.find(item => item.id === button.dataset.graphics)?.label}.`);
  }
  if (button.dataset.speed) {
    state.settings.movementSpeed = Number(button.dataset.speed);
    persist();
    renderSettings();
  }
  if (button.hasAttribute('data-camera-reset')) {
    world.resetCamera();
    showToast('أُعيدت زاوية الكاميرا.');
  }
  if (button.dataset.cameraDistance) {
    world.setCameraDistance((state.settings.cameraDistance || 10) + Number(button.dataset.cameraDistance));
    state.settings.cameraDistance = world.cameraDistance;
    persist();
  }
  if (button.hasAttribute('data-notifications')) toggleNotifications();
  if (button.hasAttribute('data-export')) exportBackup();
  if (button.hasAttribute('data-restore')) $('#restore-file').click();
  if (button.hasAttribute('data-close-details')) closeSheet();
}

function handleSheetChange(event) {
  const input = event.target;
  if (input.matches('[data-prayer-time]')) {
    state.settings.prayerTimes[input.dataset.prayerTime] = input.value;
    persist();
    showToast('تم حفظ وقت التذكير.');
  }
  if (input.matches('[data-reminder-time]')) {
    state.settings[input.dataset.reminderTime] = input.value;
    persist();
    showToast('تم حفظ وقت التذكير.');
  }
}

async function initialize() {
  const loaded = await loadSavedState();
  state = normalizeState(loaded.state || createInitialState());
  requestPersistentStorage();
  if (!loaded.state) await persist();

  try {
    world = new GardenWorld({
      canvas,
      state,
      onPositionSave: position => {
        if (!lastPositionSaved || Math.hypot(position.x - lastPositionSaved.x, position.z - lastPositionSaved.z) > 0.55 || Math.abs(position.yaw - lastPositionSaved.yaw) > 0.15) {
          state.player = position;
          if (Number.isFinite(position.cameraDistance)) state.settings.cameraDistance = position.cameraDistance;
          lastPositionSaved = { ...position };
          persist();
        }
      },
      onObjectSelect: renderObjectDetails,
      onPreviewChange: valid => { $('#confirm-build').disabled = !valid; },
      onCameraChange: distance => {
        state.settings.cameraDistance = distance;
        clearTimeout(cameraSaveTimer);
        cameraSaveTimer = setTimeout(() => persist(), 350);
      },
      onError: error => console.error(error),
      joystick: $('#joystick'),
      joystickKnob: $('.joystick-knob'),
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
    });
  } catch (error) {
    console.error(error);
    $('#fatal-error').textContent = `${error.message || 'تعذر تشغيل العالم ثلاثي الأبعاد.'} تأكد من تشغيل التطبيق عبر خادم محلي أو استضافته على HTTPS، ومن أن المتصفح يدعم WebGL 2.`;
    $('#fatal-error').classList.remove('hidden');
    loadingScreen.classList.add('done');
    return;
  }

  $('#tasks-button').addEventListener('click', renderTasks);
  $('#build-button').addEventListener('click', renderBuild);
  $('#journal-button').addEventListener('click', renderHistory);
  $('#settings-button').addEventListener('click', renderSettings);
  $('#close-sheet').addEventListener('click', closeSheet);
  sheetContent.addEventListener('click', handleSheetClick);
  sheetContent.addEventListener('change', handleSheetChange);
  $('#confirm-build').addEventListener('click', placeBuildItem);
  $('#cancel-build').addEventListener('click', cancelBuildMode);
  $('#rotate-build').addEventListener('click', () => world.rotateBuild(Math.PI / 8));
  setInterval(() => {
    if (buildBar.classList.contains('hidden')) return;
    const placement = world?.getPreviewPlacement();
    $('#confirm-build').disabled = !placement?.valid;
  }, 180);
  $('#restore-file').addEventListener('change', event => restoreBackup(event.target.files?.[0]));
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!buildBar.classList.contains('hidden')) cancelBuildMode();
    else if (!sheet.classList.contains('hidden')) closeSheet();
  });
  window.addEventListener('online', () => showToast('عاد الاتصال بالإنترنت.'));
  window.addEventListener('offline', () => showToast('أنت الآن دون اتصال؛ الحديقة المحفوظة ما زالت متاحة.'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.player = world.getPlayerState();
    else checkNotifications();
  });
  window.addEventListener('beforeunload', () => {
    state.player = world.getPlayerState();
    // Regular saves occur continuously; beforeunload is only a final best effort.
    saveState(state);
  });

  $('#world-hint').textContent = window.matchMedia?.('(pointer: coarse)').matches
    ? 'المس عصا الحركة للتحرك واسحب المشهد لتدوير الكاميرا'
    : 'W A S D للحركة · اسحب لتدوير الكاميرا · عجلة الفأرة للتقريب';
  updateTaskCounter();
  notificationTimer = setInterval(checkNotifications, 25_000);
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.warn('Service worker registration skipped:', error);
    }
  }
  await world.rendererReady;
  setTimeout(() => loadingScreen.classList.add('done'), 450);
  setTimeout(() => $('#world-hint').classList.add('fade'), 7000);
}

initialize().catch(error => {
  console.error(error);
  $('#fatal-error').textContent = 'حدث خطأ أثناء تجهيز الحديقة. أعد تحميل الصفحة، وإذا استمرت المشكلة افتح سجل الأخطاء في المتصفح.';
  $('#fatal-error').classList.remove('hidden');
  loadingScreen.classList.add('done');
});

window.addEventListener('pagehide', () => {
  if (notificationTimer) clearInterval(notificationTimer);
  if (world) {
    state.player = world.getPlayerState();
    persist();
    world.dispose();
  }
});
