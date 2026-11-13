export const ZONES = [
  { id:'garden', name:'الساحة الرئيسية', short:'الحديقة', x:900, y:650, color:'#91b875', icon:'leaf', description:'قلب الحديقة ومكان البداية. تجوّل وتعرّف على المرافق.' },
  { id:'adhkar', name:'حديقة الأذكار', short:'الأذكار', x:480, y:420, color:'#8ebd79', icon:'sprout', description:'مساحة هادئة لقراءة الأذكار واستخدام عدّاد شخصي.' },
  { id:'prayer', name:'ساحة الصلاة', short:'الصلاة', x:900, y:260, color:'#d4bd83', icon:'mosque', description:'معلومات عن الصلاة والنوافل مع فصل الفرض عن النافلة.' },
  { id:'mosque', name:'مرفق المسجد', short:'المساجد', x:1370, y:420, color:'#c6ae7d', icon:'building', description:'مكتبة صغيرة عن عمارة المساجد وآدابها.' },
  { id:'charity', name:'بستان الصدقة', short:'الصدقات', x:420, y:900, color:'#83b7a7', icon:'water', description:'تذكّر بأعمال النفع والصدقة وتسجيلها بشكل شخصي.' },
  { id:'orphan', name:'دار الرعاية', short:'كفالة اليتيم', x:1040, y:960, color:'#c2a4bd', icon:'heart', description:'منطقة توعوية عن رعاية اليتيم دون جمع أي بيانات عنه.' },
  { id:'ihsan', name:'روضة الإحسان', short:'الإحسان', x:720, y:1110, color:'#d0aa80', icon:'heart', description:'سجل الأعمال اليومية التي تختار متابعتها.' },
  { id:'library', name:'مكتبة العلم', short:'العلم والقرآن', x:1450, y:850, color:'#9caec5', icon:'book', description:'مراجع ومحتوى للقراءة والتعلم.' },
  { id:'ongoing', name:'بستان الأثر المستمر', short:'الأعمال المستمرة', x:1580, y:1110, color:'#a5b98a', icon:'tree', description:'مساحة رمزية للتعرّف على معنى العمل المستمر الأثر.' }
];

// النصوص أدناه منقولة كما تظهر في صفحات المصدر المشار إليها. حالة السجل: مراجعة مصدر أولية؛ لا يفعّل مكافأة قبل مراجعة بشرية متخصصة.
export const HADITHS = [
  {
    id:'palm-2304', topic:'غرس النخلة', category:'الأذكار',
    text:'مَنْ قَالَ سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ غُرِسَتْ لَهُ نَخْلَةٌ فِي الْجَنَّةِ',
    narrator:'جابر رضي الله عنه', collection:'مشكاة المصابيح', reference:'2304 · كتاب الدعوات', grade:'صحيح', gradeSource:'الألباني',
    source:'https://sunnah.com/mishkat:2304',
    note:'نقلت مشكاة المصابيح الرواية عن الترمذي، وتعرض الصفحة حكم الألباني عليها بالصحة. لم يُضف إلى هذا النص عدد تكرار غير مذكور فيه.',
    reviewStatus:'source_checked'
  },
  {
    id:'rawatib-1797', topic:'الصلوات النافلة', category:'الصلاة',
    text:'مَنْ صَلَّى اثْنَتَيْ عَشْرَةَ رَكْعَةً فِي الْيَوْمِ وَاللَّيْلَةِ سِوَى الْمَكْتُوبَةِ بَنَى اللَّهُ لَهُ بَيْتًا فِي الْجَنَّةِ',
    narrator:'أم حبيبة رضي الله عنها', collection:'سنن النسائي', reference:'1797 · كتاب قيام الليل وتطوع النهار', grade:'صحيح', gradeSource:'دار السلام',
    source:'https://sunnah.com/nasai:1797',
    note:'العدد المذكور في الرواية اثنتا عشرة ركعة سوى الصلوات المفروضة. لم نضف توزيعاً فقهياً للركعات من هذا النص وحده.',
    reviewStatus:'source_checked'
  },
  {
    id:'mosque-533a', topic:'عمارة المساجد', category:'المساجد',
    text:'مَنْ بَنَى مَسْجِدًا لِلَّهِ تَعَالَى ... بَنَى اللَّهُ لَهُ بَيْتًا فِي الْجَنَّةِ',
    narrator:'عثمان بن عفان رضي الله عنه', collection:'صحيح مسلم', reference:'533a · كتاب المساجد ومواضع الصلاة', grade:'صحيح', gradeSource:'صحيح مسلم',
    source:'https://sunnah.com/muslim:533a',
    note:'النص المعروض مقتطف مختصر من الرواية، وفي الصفحة إشارة إلى اختلاف لفظ الرواية في عبارة «يبتغي به وجه الله». هذا الحديث عن بناء مسجد حقيقي؛ المباني داخل التطبيق رموز تعليمية ولا تعني أن المستخدم بنى مسجداً واقعياً.',
    reviewStatus:'source_checked'
  },
  {
    id:'orphan-6005', topic:'كفالة اليتيم', category:'الإحسان',
    text:'أَنَا وَكَافِلُ الْيَتِيمِ فِي الْجَنَّةِ هَكَذَا، وَقَالَ بِإِصْبَعَيْهِ السَّبَّابَةِ وَالْوُسْطَى',
    narrator:'سهل بن سعد رضي الله عنه', collection:'صحيح البخاري', reference:'6005 · كتاب الأدب', grade:'صحيح', gradeSource:'صحيح البخاري',
    source:'https://sunnah.com/bukhari:6005',
    note:'يعرض النص للتوعية فقط. لا يجمع التطبيق أسماء الأيتام أو صورهم أو بيانات أسرهم، ولا يعدّ التسجيل في التطبيق كفالة فعلية.',
    reviewStatus:'source_checked'
  }
];

export const DEFAULT_TASKS = [
  { id:'welcome-walk', title:'استكشف الحديقة', description:'تجوّل بين الممرات وافتح لوحات المناطق للتعرف على الحديقة.', category:'استكشاف', kind:'once', sourceId:null, personal:true, completed:false, rewardItem:'flower', system:true },
  { id:'read-source', title:'اقرأ مرجعاً من المكتبة', description:'افتح أحد النصوص واقرأ مصدره ودرجة الحديث كما تظهر في صفحة المرجع.', category:'تعلم', kind:'once', sourceId:null, personal:true, completed:false, rewardItem:'bench', system:true }
];

export const ITEM_CATALOG = [
  { id:'sapling', name:'شتلة', category:'نباتات', description:'شجرة صغيرة للزراعة في المساحات الخضراء.', cost:0, color:'#6f9e65', symbol:'tree', starter:1 },
  { id:'palm', name:'نخلة', category:'نباتات', description:'عنصر نباتي رمزي. لا يمثل أجراً أو حقيقة من الغيب.', cost:0, color:'#4f8d68', symbol:'palm', starter:0 },
  { id:'flower', name:'زهرة برية', category:'زينة', description:'زهرة للزينة وتحسين شكل الحديقة.', cost:0, color:'#d58ca7', symbol:'flower', starter:1 },
  { id:'bench', name:'مقعد خشبي', category:'زينة', description:'مقعد استراحة للزينة.', cost:0, color:'#a7784f', symbol:'bench', starter:0 },
  { id:'fountain', name:'نافورة صغيرة', category:'مرافق', description:'نافورة رمزية ضمن بستان الصدقة.', cost:0, color:'#7caec1', symbol:'fountain', starter:0 },
  { id:'lamp', name:'فانوس حديقة', category:'زينة', description:'فانوس خفيف للممرات.', cost:0, color:'#d6ae69', symbol:'lamp', starter:0 }
];

export const AREA_BUILDING = [
  { id:'tree', title:'الأشجار والنباتات', allowed:['sapling','palm','flower'] },
  { id:'comfort', title:'الزينة والمرافق', allowed:['bench','fountain','lamp'] }
];
