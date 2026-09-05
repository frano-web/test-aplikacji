const { SUPABASE_URL='', SUPABASE_PUBLISHABLE_KEY='' } = window.PLANER_CONFIG || {};
const createClient = window.supabase?.createClient;

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');

const configured = Boolean(createClient && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_'));
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const state = {
  session: null,
  profile: null,
  directory: [],
  view: 'dashboard',
  trips: [],
  events: [],
  announcements: [],
  unread: 0,
  activeTripId: null,
  tripTab: 'overview',
  chatGroups: [],
  chatLabels: {},
  activeChatId: null,
  chatChannel: null,
  messageChannel: null,
  notificationChannel: null,
  chatUnread: {},
  chatUnreadTotal: 0,
  announcementReadIds: new Set(),
  calendarDate: new Date(),
  focusMode: false,
  loading: false
};

const ROLES = {
  admin: 'Administrator', coach: 'Trener', athlete: 'Zawodnik', mechanic: 'Mechanik', driver: 'Kierowca'
};
const ICONS = { dashboard:'⌂', trips:'🚐', calendar:'▦', chat:'◌', team:'♟', transport:'⌁', service:'🔧', tasks:'✓', finance:'₿', admin:'⚙', mytrip:'◎', documents:'▤' };

function esc(v='') { return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function fmtDate(v, withTime=true) { if(!v) return '—'; const d=new Date(v); return new Intl.DateTimeFormat('pl-PL', withTime?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric'}).format(d); }
function toLocalInput(v){ if(!v)return ''; const d=new Date(v); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
function toast(msg){ toastEl.textContent=msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'),2600); }
function fail(err, fallback='Wystąpił błąd.'){ console.error(err); toast(err?.message || fallback); }
function personName(id){ return state.directory.find(x=>x.id===id)?.full_name || 'Użytkownik'; }
function role(){ return state.profile?.role; }
function staff(){ return ['admin','coach'].includes(role()); }
function isAdmin(){ return role()==='admin'; }
function canUseQuickActions(){ return role()!=='athlete'; }
function codeActive(c){ return (!c.expires_at || new Date(c.expires_at)>new Date()) && (c.max_uses==null || Number(c.use_count||0)<Number(c.max_uses)); }
function unreadForGroup(id){ return Number(state.chatUnread[id]||0); }
function updateNavBadges(){
  document.querySelectorAll('[data-chat-badge]').forEach(el=>{ const n=state.chatUnreadTotal; el.textContent=n>99?'99+':String(n); el.classList.toggle('hidden',!n); });
  document.querySelectorAll('[data-group-badge]').forEach(el=>{ const n=unreadForGroup(el.dataset.groupBadge); el.textContent=n>99?'99+':String(n); el.classList.toggle('hidden',!n); });
}
async function requestBrowserNotifications(){
  if(!('Notification' in window)){ toast('Ta przeglądarka nie obsługuje powiadomień.'); return; }
  const permission=await Notification.requestPermission();
  toast(permission==='granted'?'Powiadomienia włączone.':'Powiadomienia nie zostały włączone.');
}
async function showBrowserNotification(title,body,tag){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  try{
    if('serviceWorker' in navigator){ const reg=await navigator.serviceWorker.ready; await reg.showNotification(title,{body,tag:`planer-${tag||'message'}`,renotify:true}); }
    else new Notification(title,{body});
  }catch(_e){}
}
function closeModal(){ if(modal.open) modal.close(); }
function showModal(title, body, onReady){ modalContent.innerHTML=`<div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" id="modal-close" type="button">✕</button></div><div class="modal-body">${body}</div>`; modalContent.querySelector('#modal-close').onclick=closeModal; modal.showModal(); onReady?.(); }
modal.addEventListener('click', e=>{ if(e.target===modal) closeModal(); });

function configScreen(){
  app.innerHTML=`<section class="auth-shell"><div class="auth-card"><div class="brand"><div class="brand-mark">P</div><div><h1>PLANER</h1><p>Konfiguracja połączenia</p></div></div><div class="notice important" style="margin-top:24px"><strong>Brakuje danych Supabase.</strong><p class="muted">Otwórz plik <code>config.js</code> i wklej Project URL oraz Publishable key. Nie używaj klucza <code>service_role</code> w przeglądarce.</p></div><div class="feature-list"><div class="feature"><strong>1. Supabase → SQL Editor</strong><div class="muted">Uruchom <code>supabase-schema.sql</code>.</div></div><div class="feature"><strong>2. Project Settings → API</strong><div class="muted">Skopiuj URL projektu i Publishable key.</div></div><div class="feature"><strong>3. GitHub Pages</strong><div class="muted">Wrzuć cały folder do repozytorium i włącz Pages.</div></div></div></div><aside class="auth-side"><h2>Projekt jest gotowy pod Supabase</h2><p class="muted">Logowanie kodami dostępu, role, RLS, wyjazdy, auta, czat, serwis, zadania, zakupy, dokumenty i finanse administratora są już spięte w kodzie.</p></aside></section>`;
}

function authScreen(mode='login'){
  const login=mode==='login';
  app.innerHTML=`<section class="auth-shell"><div class="auth-card"><div class="brand"><div class="brand-mark">P</div><div><h1>PLANER</h1><p>Klubowe centrum organizacji</p></div></div><div class="auth-tabs"><button id="auth-login-tab" class="${login?'active':''}" type="button">Logowanie</button><button id="auth-first-tab" class="${!login?'active':''}" type="button">Pierwsze logowanie</button></div>
  <form id="login-form" class="auth-form ${login?'':'hidden'}"><label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label><label class="field"><span>Hasło</span><input name="password" type="password" autocomplete="current-password" required minlength="6"></label><button class="primary" type="submit">Zaloguj</button><div class="hint">Po pierwszej aktywacji konta nie potrzebujesz już kodu dostępu.</div></form>
  <form id="signup-form" class="auth-form ${login?'hidden':''}"><label class="field"><span>Imię i nazwisko</span><input name="full_name" autocomplete="name" required maxlength="80"></label><label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label><label class="field"><span>Hasło</span><input name="password" type="password" autocomplete="new-password" required minlength="8"></label><label class="field"><span>Kod dostępu</span><input name="invite_code" class="code" inputmode="text" autocomplete="off" required minlength="6" maxlength="12" pattern="[A-Za-z0-9]+" placeholder="XXXXXXXX"></label><button class="primary" type="submit">Aktywuj konto</button><div class="hint">Kod określa rolę konta. Kod zawodnika może być wspólny i działać przez 24 godziny; kody pozostałych ról są jednorazowe.</div></form></div>
  <aside class="auth-side"><div class="mini-label">PLANER</div><h2>Mniej chaosu przed wyjazdem.</h2><p class="muted">Jedno miejsce na transport, pasażerów, rowery, hotel, czat, zadania, zakupy i ważne komunikaty.</p><div class="feature-list"><div class="feature"><strong>Role i uprawnienia</strong><div class="muted">Każdy widzi tylko funkcje, które są mu potrzebne.</div></div><div class="feature"><strong>Centrum gotowości</strong><div class="muted">Od razu widać, czego brakuje przed wyjazdem.</div></div><div class="feature"><strong>Czat grupowy</strong><div class="muted">Grupy, wyjazdy i wiadomości w czasie rzeczywistym.</div></div></div></aside></section>`;
  document.querySelector('#auth-login-tab').onclick=()=>authScreen('login');
  document.querySelector('#auth-first-tab').onclick=()=>authScreen('first');
  document.querySelector('#login-form').onsubmit=loginSubmit;
  document.querySelector('#signup-form').onsubmit=signupSubmit;
}

async function loginSubmit(e){
  e.preventDefault(); const f=new FormData(e.currentTarget);
  const { error }=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  if(error) return fail(error,'Nie udało się zalogować.');
}
async function signupSubmit(e){
  e.preventDefault(); const f=new FormData(e.currentTarget); const code=String(f.get('invite_code')).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const { error }=await sb.auth.signUp({email:f.get('email'),password:f.get('password'),options:{data:{full_name:String(f.get('full_name')).trim(),invite_code:code}}});
  if(error) return fail(error,'Nie udało się utworzyć konta. Sprawdź kod dostępu.');
  toast('Konto utworzone. Możesz korzystać z PLANER.');
}

async function loadProfile(){
  const { data, error }=await sb.from('profiles').select('*').eq('id',state.session.user.id).single();
  if(error) throw error; state.profile=data;
}
async function loadBase(){
  const [trips,events,ann,dir,chats]=await Promise.all([
    sb.from('trips').select('*').order('starts_at',{ascending:true}),
    sb.from('calendar_events').select('*').order('starts_at',{ascending:true}).limit(120),
    sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50),
    sb.from('directory').select('*').eq('active',true).order('full_name'),
    sb.from('chat_groups').select('*').order('created_at',{ascending:false})
  ]);
  if(trips.error) throw trips.error; if(events.error) throw events.error; if(ann.error) throw ann.error; if(dir.error) throw dir.error; if(chats.error) throw chats.error;
  let tripData=trips.data||[], eventData=events.data||[], annData=ann.data||[];
  if(role()==='athlete'){
    const {data:mine,error}=await sb.from('trip_members').select('trip_id').eq('user_id',state.session.user.id);
    if(error) throw error;
    const allowed=new Set((mine||[]).map(x=>x.trip_id));
    tripData=tripData.filter(t=>allowed.has(t.id));
    eventData=eventData.filter(e=>!e.trip_id||allowed.has(e.trip_id));
    annData=annData.filter(a=>!a.trip_id||allowed.has(a.trip_id));
  }
  state.trips=tripData; state.events=eventData; state.announcements=annData; state.directory=dir.data||[]; state.chatGroups=chats.data||[];
  state.chatLabels={};
  await Promise.all(state.chatGroups.filter(g=>g.kind==='direct').map(async g=>{const {data}=await sb.from('chat_members').select('user_id').eq('group_id',g.id);const other=(data||[]).find(x=>x.user_id!==state.session.user.id);state.chatLabels[g.id]=other?personName(other.user_id):'Rozmowa prywatna';}));
  if(!state.trips.some(t=>t.id===state.activeTripId)){ const upcoming=state.trips.find(t=>new Date(t.starts_at)>=new Date() && t.status!=='cancelled') || state.trips[0]; state.activeTripId=upcoming?.id||null; }
  if(!state.chatGroups.some(g=>g.id===state.activeChatId)) state.activeChatId=state.chatGroups[0]?.id||null;
  await Promise.all([loadUnread(),loadChatUnread()]);
}

async function loadUnread(){
  const ids=state.announcements.map(a=>a.id); state.announcementReadIds=new Set();
  if(!ids.length){state.unread=0;return;}
  const {data,error}=await sb.from('announcement_reads').select('announcement_id').eq('user_id',state.session.user.id).in('announcement_id',ids);
  if(error){state.unread=0;return;}
  state.announcementReadIds=new Set((data||[]).map(x=>x.announcement_id));
  state.unread=state.announcements.filter(a=>!state.announcementReadIds.has(a.id)).length;
}

async function loadChatUnread(){
  const {data,error}=await sb.rpc('get_chat_unread_counts');
  if(error){ state.chatUnread={}; state.chatUnreadTotal=0; return; }
  state.chatUnread={};
  for(const row of data||[]) state.chatUnread[row.group_id]=Number(row.unread_count||0);
  state.chatUnreadTotal=Object.values(state.chatUnread).reduce((a,b)=>a+Number(b||0),0);
}

async function markChatRead(groupId){
  if(!groupId) return;
  const {error}=await sb.rpc('mark_chat_read',{p_group_id:groupId});
  if(error){ console.warn(error); return; }
  state.chatUnreadTotal=Math.max(0,state.chatUnreadTotal-unreadForGroup(groupId));
  state.chatUnread[groupId]=0;
  updateNavBadges();
}

function navItems(){
  const base=[['dashboard','Start'],['trips','Wyjazdy'],['calendar','Kalendarz'],['chat','Czat']];
  if(role()==='athlete') return base.concat([['mytrip','Mój wyjazd'],['service','Mój sprzęt']]);
  if(role()==='mechanic') return base.concat([['transport','Transport'],['service','Serwis'],['tasks','Zadania'],['documents','Dokumenty']]);
  if(role()==='driver') return base.concat([['transport','Transport'],['tasks','Zadania'],['documents','Dokumenty']]);
  if(role()==='coach') return base.concat([['team','Zespół'],['transport','Transport'],['service','Sprzęt'],['tasks','Zadania'],['documents','Dokumenty']]);
  return base.concat([['team','Zespół'],['transport','Transport'],['service','Sprzęt'],['tasks','Zadania'],['documents','Dokumenty'],['finance','Finanse'],['admin','Administracja']]);
}

function shell(){
  const nav=navItems();
  const navButton=([id,n],extra='')=>`<button class="nav-btn ${state.view===id?'active':''} ${extra}" data-nav="${id}" type="button"><span>${ICONS[id]||'•'}</span><span class="nav-label">${n}${id==='chat'?` <b class="nav-alert ${state.chatUnreadTotal?'':'hidden'}" data-chat-badge>${state.chatUnreadTotal>99?'99+':state.chatUnreadTotal}</b>`:''}</span></button>`;
  const navHtml=nav.map(x=>navButton(x)).join('');
  const primaryIds=['dashboard','trips','calendar','chat'];
  const mobilePrimary=nav.filter(([id])=>primaryIds.includes(id)).map(x=>navButton(x,'mobile-primary')).join('');
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">P</div><div><strong>PLANER</strong><p>centrum klubu</p></div></div><div class="side-user"><strong>${esc(state.profile.full_name)}</strong><span>${esc(ROLES[role()]||role())}</span></div><nav class="nav">${navHtml}</nav><div class="sidebar-foot">${canUseQuickActions()?'<button id="quick-btn" class="ghost" type="button">⚡ Szybkie akcje</button>':''}<button id="logout-btn" class="danger-btn" type="button">↪ Wyloguj</button></div></aside><main class="main"><div class="mobile-userbar"><div class="mobile-user"><div class="mobile-avatar">${esc((state.profile.full_name||'P').trim().charAt(0).toUpperCase())}</div><div class="mobile-user-text"><strong>${esc(state.profile.full_name)}</strong><span>${esc(ROLES[role()]||role())}</span></div></div><button id="mobile-logout-btn" class="mobile-logout" type="button">Wyloguj</button></div><header class="topbar"><div class="top-title"><small id="eyebrow">PLANER</small><h2 id="page-title">Start</h2></div><div class="top-actions"><button id="focus-btn" class="icon-btn hide-mobile" type="button">⚡ Tryb wyjazdu</button><button id="notice-btn" class="icon-btn notice-mobile" type="button" aria-label="Powiadomienia">🔔 <span class="badge-count">${state.unread}</span></button><button id="mobile-menu-btn" class="icon-btn mobile-menu-trigger" type="button" aria-label="Otwórz pełne menu">☰</button></div></header><section id="content" class="content"></section></main></div><nav class="mobile-nav" aria-label="Główne menu mobilne">${mobilePrimary}<button class="nav-btn mobile-more" id="mobile-more-btn" type="button"><span>•••</span><span class="nav-label">Więcej</span></button></nav>`;
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  const doLogout=()=>sb.auth.signOut();
  document.querySelector('#logout-btn')?.addEventListener('click',doLogout);
  document.querySelector('#mobile-logout-btn')?.addEventListener('click',doLogout);
  document.querySelector('#notice-btn').onclick=showAnnouncements;
  document.querySelector('#focus-btn').onclick=()=>{state.focusMode=!state.focusMode;render();};
  document.querySelector('#quick-btn')?.addEventListener('click',quickActions);
  document.querySelector('#mobile-more-btn')?.addEventListener('click',mobileMenu);
  document.querySelector('#mobile-menu-btn')?.addEventListener('click',mobileMenu);
  updateNavBadges();
}

function mobileMenu(){
  const nav=navItems();
  showModal('Menu PLANER',`<div class="mobile-menu-sheet"><div class="mobile-menu-profile"><strong>${esc(state.profile.full_name)}</strong><span>${esc(ROLES[role()]||role())}</span></div><div class="mobile-menu-list">${nav.map(([id,n])=>`<button class="mobile-menu-item ${state.view===id?'active':''}" data-mobile-nav="${id}" type="button"><span class="mobile-menu-icon">${ICONS[id]||'•'}</span><span>${n}</span>${id==='chat'&&state.chatUnreadTotal?`<b class="nav-alert">${state.chatUnreadTotal>99?'99+':state.chatUnreadTotal}</b>`:''}</button>`).join('')}</div>${canUseQuickActions()?'<button id="mobile-quick" class="ghost mobile-menu-action" type="button">⚡ Szybkie akcje</button>':''}<button id="mobile-menu-logout" class="danger-btn mobile-menu-action" type="button">↪ Wyloguj z PLANER</button></div>`,()=>{
    modalContent.querySelectorAll('[data-mobile-nav]').forEach(b=>b.onclick=()=>{closeModal();navigate(b.dataset.mobileNav);});
    modalContent.querySelector('#mobile-menu-logout')?.addEventListener('click',()=>sb.auth.signOut());
    modalContent.querySelector('#mobile-quick')?.addEventListener('click',()=>{closeModal();quickActions();});
  });
}

function setTitle(eye,title){ document.querySelector('#eyebrow').textContent=eye; document.querySelector('#page-title').textContent=title; }
function content(html){ document.querySelector('#content').innerHTML=html; }
function navigate(v){ state.view=v; shell(); render(); }
function render(){
  const fn={dashboard:renderDashboard,trips:renderTrips,calendar:renderCalendar,chat:renderChat,team:renderTeam,transport:renderTransport,service:renderService,tasks:renderTasks,finance:renderFinance,admin:renderAdmin,mytrip:renderMyTrip,documents:renderDocuments}[state.view]||renderDashboard;
  fn();
}
function activeTrip(){ return state.trips.find(t=>t.id===state.activeTripId)||state.trips[0]||null; }
function chatLabel(g){ return g.kind==='direct'?(state.chatLabels[g.id]||'Rozmowa prywatna'):g.name; }
function statusPill(s){ const map={confirmed:['Potwierdzony','ok'],draft:['Planowany','warn'],cancelled:['Anulowany','danger'],finished:['Zakończony','']}; const x=map[s]||[s,'']; return `<span class="pill ${x[1]}">${esc(x[0])}</span>`; }
function tripMemberPill(s){const m={going:['Jadę','ok'],not_going:['Nie jadę','danger'],maybe:['Nie wiem','warn'],pending:['Brak odpowiedzi','warn']};const x=m[s]||[s,''];return `<span class="pill ${x[1]}">${x[0]}</span>`;}

async function getTripStats(tripId){
  if(!tripId) return {score:0,members:0,pending:0,bikesMissing:0,tasksOpen:0,cars:0};
  const [m,t,c]=await Promise.all([
    sb.from('trip_members').select('status,bike_status,bike_count').eq('trip_id',tripId),
    sb.from('tasks').select('done').eq('trip_id',tripId),
    sb.from('trip_vehicles').select('id').eq('trip_id',tripId)
  ]);
  const members=m.data||[], tasks=t.data||[], trip=state.trips.find(x=>x.id===tripId);
  const pending=members.filter(x=>x.status==='pending').length, bikesMissing=members.filter(x=>x.status==='going'&&(x.bike_status==='Brak danych'||x.bike_status==null)).length, tasksOpen=tasks.filter(x=>!x.done).length;
  let checks=0,total=5; if(members.length&&pending===0)checks++; if(bikesMissing===0)checks++; if((c.data||[]).length)checks++; if(trip?.hotel_name)checks++; if(tasks.length===0||tasksOpen===0)checks++;
  return {score:Math.round(checks/total*100),members:members.length,pending,bikesMissing,tasksOpen,cars:(c.data||[]).length};
}

async function renderDashboard(){
  setTitle('PLANER','Centrum dowodzenia'); const trip=activeTrip();
  content(`<div class="grid grid-2"><div class="card"><div class="skeleton"></div></div><div class="card"><div class="skeleton"></div></div></div>`);
  const st=await getTripStats(trip?.id); const urgent=state.announcements.find(a=>a.important&&!state.announcementReadIds.has(a.id));
  content(`${state.focusMode?`<div class="notice important pop"><strong>⚡ Tryb wyjazdu</strong><div class="muted">Pokazuję rzeczy, które mogą zablokować najbliższy wyjazd.</div></div><div style="height:12px"></div>`:''}
  ${urgent?`<div class="notice important"><strong>${esc(urgent.title)}</strong><div class="muted">${esc(urgent.body)}</div><button class="ghost" id="dash-ann-read" type="button" style="margin-top:8px">Odczytaj</button></div><div style="height:12px"></div>`:''}
  <div class="grid grid-2"><div class="card"><div class="mini-label">Najbliższy wyjazd</div>${trip?`<h3 style="margin:8px 0 4px">${esc(trip.title)}</h3><div class="muted">${fmtDate(trip.starts_at)} · ${esc(trip.location||'Miejsce do uzupełnienia')}</div><div class="actions" style="margin-top:14px"><button class="primary" id="open-trip" type="button">Otwórz wyjazd</button>${role()==='athlete'?'<button class="ghost" id="my-trip" type="button">Moje dane</button>':''}</div>`:`<div class="empty"><strong>Brak przypisanego wyjazdu</strong>${role()==='athlete'?'Zobaczysz wyjazd dopiero po przypisaniu przez kadrę.':'Brak zaplanowanych wyjazdów.'}</div>`}</div><div class="card soft"><div class="readiness"><div class="ring" style="--v:${st.score}"><strong>${st.score}%</strong></div><div><div class="mini-label">Gotowość wyjazdu</div><h3 style="margin:5px 0">${st.score===100?'Wszystko gotowe':'Są rzeczy do zrobienia'}</h3><div class="muted">${st.pending} bez odpowiedzi · ${st.bikesMissing} bez informacji o rowerze · ${st.tasksOpen} otwartych zadań</div></div></div></div></div>
  ${state.focusMode?'':`<div class="grid grid-4" style="margin-top:12px"><div class="card"><div class="metric">${st.members}</div><div class="metric-label">uczestnicy</div></div><div class="card"><div class="metric">${st.cars}</div><div class="metric-label">auta</div></div><div class="card"><div class="metric">${state.unread}</div><div class="metric-label">komunikaty</div></div><div class="card"><div class="metric">${st.tasksOpen}</div><div class="metric-label">zadania</div></div></div><div class="surface" style="margin-top:12px"><div class="toolbar"><div><strong>Najbliższe wydarzenia</strong><div class="muted">Kalendarz klubu</div></div><button class="ghost" id="calendar-more" type="button">Cały kalendarz</button></div>${state.events.filter(x=>new Date(x.starts_at)>=new Date(Date.now()-86400000)).slice(0,5).map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.title)}</strong><small>${fmtDate(x.starts_at)}${x.location?' · '+esc(x.location):''}</small></div><span class="pill">${esc(x.type)}</span></div>`).join('')||'<div class="empty">Brak wydarzeń.</div>'}</div>`}`);
  document.querySelector('#open-trip')?.addEventListener('click',()=>navigate('trips')); document.querySelector('#my-trip')?.addEventListener('click',()=>navigate('mytrip')); document.querySelector('#calendar-more')?.addEventListener('click',()=>navigate('calendar'));
  document.querySelector('#dash-ann-read')?.addEventListener('click',()=>markAnnouncementRead(urgent.id,true));
}

async function renderTrips(){
  setTitle('WYJAZDY','Planowanie wyjazdów');
  const trip=activeTrip();
  content(`<div class="surface"><div class="toolbar"><div><strong>Wyjazdy</strong><div class="muted">Wybierz wyjazd, aby otworzyć jego centrum organizacyjne.</div></div>${staff()?'<button class="primary" id="new-trip" type="button">+ Nowy wyjazd</button>':''}</div><div class="segments" style="margin-top:12px">${state.trips.map(t=>`<button class="seg-btn ${t.id===trip?.id?'active':''}" data-trip="${t.id}" type="button">${esc(t.title)}</button>`).join('')}</div></div><div id="trip-detail"></div>`);
  document.querySelectorAll('[data-trip]').forEach(b=>b.onclick=()=>{state.activeTripId=b.dataset.trip;renderTrips();}); document.querySelector('#new-trip')?.addEventListener('click',newTripModal);
  if(!trip){document.querySelector('#trip-detail').innerHTML='<div class="surface"><div class="empty"><strong>Brak wyjazdów</strong>Administrator lub trener może utworzyć pierwszy wyjazd.</div></div>';return;}
  let tabs=[['overview','Przegląd'],['hotel','Hotel'],['shopping','Zakupy'],['announcements','Komunikaty']]; if(staff()) tabs=[['overview','Przegląd'],['members','Uczestnicy'],['cars','Transport'],['hotel','Hotel'],['shopping','Zakupy'],['checklist','Checklista'],['announcements','Komunikaty']]; else if(role()==='driver') tabs=[['overview','Przegląd'],['cars','Transport'],['hotel','Hotel'],['shopping','Zakupy'],['checklist','Checklista'],['announcements','Komunikaty']]; else if(role()==='mechanic') tabs=[['overview','Przegląd'],['cars','Transport'],['hotel','Hotel'],['shopping','Zakupy'],['checklist','Checklista'],['announcements','Komunikaty']];
  document.querySelector('#trip-detail').innerHTML=`<div class="surface"><div class="toolbar"><div><div class="mini-label">${fmtDate(trip.starts_at,false)}</div><h3 style="margin:4px 0">${esc(trip.title)}</h3><div class="muted">${esc(trip.location||'Miejsce do uzupełnienia')} · ${statusPill(trip.status)}</div></div>${staff()?'<div class="actions"><button class="ghost" id="edit-trip" type="button">Edytuj</button></div>':''}</div><div class="segments" style="margin-top:16px">${tabs.map(([id,n])=>`<button class="seg-btn ${state.tripTab===id?'active':''}" data-tt="${id}" type="button">${n}</button>`).join('')}</div><div id="trip-tab"></div></div>`;
  document.querySelectorAll('[data-tt]').forEach(b=>b.onclick=()=>{state.tripTab=b.dataset.tt;renderTrips();}); document.querySelector('#edit-trip')?.addEventListener('click',()=>editTripModal(trip));
  await renderTripTab(trip);
}

async function renderTripTab(trip){
  const el=document.querySelector('#trip-tab'); el.innerHTML='<div style="margin-top:12px" class="skeleton"></div>';
  if(state.tripTab==='overview'){
    const st=await getTripStats(trip.id); el.innerHTML=`<div class="grid grid-3" style="margin-top:12px"><div class="card"><div class="mini-label">Start</div><strong>${fmtDate(trip.starts_at)}</strong></div><div class="card"><div class="mini-label">Hotel</div><strong>${esc(trip.hotel_name||'Nie ustawiono')}</strong></div><div class="card"><div class="mini-label">Gotowość</div><strong>${st.score}%</strong><div class="progress" style="margin-top:8px"><span style="width:${st.score}%"></span></div></div></div>${trip.notes?`<div class="card" style="margin-top:12px"><strong>Informacje</strong><p class="muted" style="margin:7px 0 0">${esc(trip.notes)}</p></div>`:''}`; return;
  }
  if(state.tripTab==='members') return renderTripMembers(trip,el);
  if(state.tripTab==='cars') return renderTripCars(trip,el);
  if(state.tripTab==='hotel') return renderTripHotel(trip,el);
  if(state.tripTab==='shopping') return renderShopping(trip,el);
  if(state.tripTab==='checklist') return renderChecklist(trip,el);
  if(state.tripTab==='announcements') return renderTripAnnouncements(trip,el);
}

async function renderTripMembers(trip,el){
  const {data,error}=await sb.from('trip_members').select('*, profiles:user_id(full_name), trip_vehicles(id,vehicles(name),driver_id), pickup_stops(label,pickup_time)').eq('trip_id',trip.id).order('updated_at');
  if(error){el.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return;}
  el.innerHTML=`<div class="toolbar" style="margin-top:12px"><div class="muted">${data.length} osób przypisanych</div>${staff()?'<button class="primary" id="add-members" type="button">+ Dodaj osoby</button>':''}</div><div class="card" style="margin-top:10px">${data.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.profiles?.full_name||'Użytkownik')}</strong><small>${esc(x.trip_vehicles?.vehicles?.name||'Brak auta')} · ${esc(x.pickup_stops?.label||x.pickup_custom||'Brak miejsca wsiadania')}</small></div><div style="text-align:right">${tripMemberPill(x.status)}<div class="muted" style="font-size:12px;margin-top:4px">🚲 ${esc(x.bike_status||'Brak danych')} ${x.bike_count?`×${x.bike_count}`:''}</div>${staff()?`<button class="ghost member-edit" data-user="${x.user_id}" type="button" style="margin-top:6px">Edytuj</button>`:''}</div></div>`).join('')||'<div class="empty">Brak uczestników.</div>'}</div>`;
  document.querySelector('#add-members')?.addEventListener('click',()=>addMembersModal(trip.id,data.map(x=>x.user_id))); document.querySelectorAll('.member-edit').forEach(b=>b.onclick=()=>memberAdminModal(trip.id,data.find(x=>x.user_id===b.dataset.user)));
}

async function renderTripCars(trip,el){
  const {data,error}=await sb.from('trip_vehicles').select('*, vehicles(*)').eq('trip_id',trip.id).order('departure_time');
  if(error){el.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return;}
  const blocks=[]; for(const v of data){ const [members,stops]=await Promise.all([sb.from('trip_members').select('user_id,pickup_custom,pickup_note').eq('trip_vehicle_id',v.id),sb.from('pickup_stops').select('*').eq('trip_vehicle_id',v.id).order('sort_order')]); blocks.push(`<div class="card"><div class="toolbar"><div><strong>${esc(v.vehicles?.name||'Pojazd')}</strong><div class="muted">Kierowca: ${esc(v.driver_id?personName(v.driver_id):'Nie przypisano')} · ${members.data?.length||0}/${v.vehicles?.seats||0} miejsc</div></div>${staff()?`<button class="ghost edit-tv" data-id="${v.id}" type="button">Ustawienia</button>`:''}</div><div class="timeline" style="margin-top:14px">${(stops.data||[]).map(s=>`<div class="timeline-item"><strong>${s.pickup_time?new Date(s.pickup_time).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'—'}</strong><div class="timeline-dot"></div><div><strong>${esc(s.label)}</strong>${s.completed_at?'<div class="pill ok" style="margin-top:4px">Odebrano</div>':''}</div></div>`).join('')||'<div class="muted">Brak trasy odbioru.</div>'}</div>${(members.data||[]).length?`<div style="margin-top:10px"><div class="mini-label">Pasażerowie</div>${members.data.map(m=>`<div class="row"><span>${esc(personName(m.user_id))}</span><span class="muted">${esc(m.pickup_custom||m.pickup_note||'')}</span></div>`).join('')}</div>`:''}</div>`); }
  el.innerHTML=`<div class="toolbar" style="margin-top:12px"><div class="muted">${data.length} pojazdów na wyjeździe</div>${staff()?'<button class="primary" id="assign-car" type="button">+ Dodaj auto</button>':''}</div><div class="grid grid-2" style="margin-top:10px">${blocks.join('')||'<div class="empty">Nie przypisano jeszcze żadnego auta.</div>'}</div>`;
  document.querySelector('#assign-car')?.addEventListener('click',()=>assignVehicleModal(trip.id)); document.querySelectorAll('.edit-tv').forEach(b=>b.onclick=()=>tripVehicleModal(b.dataset.id));
}

function renderTripHotel(trip,el){
  el.innerHTML=`<div class="grid grid-2" style="margin-top:12px"><div class="card"><div class="mini-label">Hotel</div><h3 style="margin:7px 0">${esc(trip.hotel_name||'Nie ustawiono')}</h3><div class="muted">${esc(trip.hotel_address||'Brak adresu')}</div><div class="row"><span>Check-in</span><strong>${esc(trip.hotel_checkin||'—')}</strong></div><div class="row"><span>Śniadanie</span><strong>${esc(trip.hotel_breakfast||'—')}</strong></div><div class="row"><span>Check-out</span><strong>${esc(trip.hotel_checkout||'—')}</strong></div>${staff()?'<button class="primary" id="hotel-edit" type="button" style="margin-top:12px">Edytuj hotel</button>':''}</div><div class="card"><strong>Informacje</strong><p class="muted" style="white-space:pre-wrap">${esc(trip.hotel_notes||'Brak dodatkowych informacji.')}</p></div></div>`;
  document.querySelector('#hotel-edit')?.addEventListener('click',()=>hotelModal(trip));
}

async function renderShopping(trip,el){
  const {data,error}=await sb.from('shopping_items').select('*').eq('trip_id',trip.id).order('created_at'); if(error){el.innerHTML=esc(error.message);return;}
  el.innerHTML=`<div class="toolbar" style="margin-top:12px"><div><strong>Lista zakupów</strong><div class="muted">${trip.shopping_enabled?'Aktywna — uczestnicy mogą dodawać produkty.':'Wyłączona — tylko podgląd.'}</div></div>${staff()?`<button class="ghost" id="shop-toggle" type="button">${trip.shopping_enabled?'Wyłącz':'Aktywuj'}</button>`:''}</div><div class="card" style="margin-top:10px">${data.map(x=>`<div class="row"><label class="check"><input class="shop-done" data-id="${x.id}" type="checkbox" ${x.done?'checked':''}><span>${esc(x.item)} ×${x.quantity}</span></label><small class="muted">${esc(personName(x.user_id))}</small></div>`).join('')||'<div class="empty">Lista jest pusta.</div>'}</div>${trip.shopping_enabled?`<form id="shop-form" class="chat-send" style="margin-top:10px"><input class="input" name="item" maxlength="120" placeholder="Dodaj produkt" required><button class="primary">Dodaj</button></form>`:''}`;
  document.querySelector('#shop-toggle')?.addEventListener('click',async()=>{const {error}=await sb.from('trips').update({shopping_enabled:!trip.shopping_enabled}).eq('id',trip.id);if(error)return fail(error);trip.shopping_enabled=!trip.shopping_enabled;renderTrips();});
  document.querySelector('#shop-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('shopping_items').insert({trip_id:trip.id,item:String(f.get('item')).trim(),created_by:state.session.user.id});if(error)return fail(error);renderTripTab(trip);});
  document.querySelectorAll('.shop-done').forEach(c=>c.onchange=async()=>{const {error}=await sb.from('shopping_items').update({done:c.checked}).eq('id',c.dataset.id);if(error){c.checked=!c.checked;fail(error);}});
}

async function renderChecklist(trip,el){
  const {data,error}=await sb.from('tasks').select('*,person:assigned_to(full_name)').eq('trip_id',trip.id).order('created_at');if(error){el.innerHTML=esc(error.message);return;}
  el.innerHTML=`<div class="toolbar" style="margin-top:12px"><div class="muted">${data.filter(x=>!x.done).length} otwartych</div>${staff()?'<button class="primary" id="task-add" type="button">+ Zadanie</button>':''}</div><div class="card" style="margin-top:10px">${data.map(x=>`<div class="row"><label class="check"><input class="task-check" data-id="${x.id}" type="checkbox" ${x.done?'checked':''}><span>${esc(x.title)}</span></label><span class="pill">${esc(x.person?.full_name||ROLES[x.assigned_role]||'Bez przypisania')}</span></div>`).join('')||'<div class="empty">Brak zadań.</div>'}</div>`; document.querySelector('#task-add')?.addEventListener('click',()=>taskModal(trip.id)); document.querySelectorAll('.task-check').forEach(c=>c.onchange=async()=>{const {error}=staff()?await sb.from('tasks').update({done:c.checked}).eq('id',c.dataset.id):await sb.rpc('set_my_task_done',{p_task_id:c.dataset.id,p_done:c.checked});if(error){c.checked=!c.checked;fail(error);}});
}
async function renderTripAnnouncements(trip,el){
  const data=state.announcements.filter(a=>a.trip_id===trip.id); el.innerHTML=`<div class="toolbar" style="margin-top:12px"><div class="muted">Ważne komunikaty dla uczestników</div>${staff()?'<button class="primary" id="ann-add" type="button">+ Komunikat</button>':''}</div>${data.map(x=>`<div class="notice ${x.important?'important':''}" style="margin-top:10px"><strong>${esc(x.title)}</strong><div class="muted">${esc(x.body)}</div></div>`).join('')||'<div class="empty">Brak komunikatów.</div>'}`; document.querySelector('#ann-add')?.addEventListener('click',()=>announcementModal(trip.id));
}

async function renderMyTrip(){
  if(role()!=='athlete') return navigate('dashboard'); setTitle('MÓJ WYJAZD','Twoje informacje'); const trip=activeTrip(); if(!trip){content('<div class="surface"><div class="empty">Brak wyjazdu.</div></div>');return;}
  const {data:member,error}=await sb.from('trip_members').select('*,trip_vehicles(id,driver_id,vehicles(name)),pickup_stops(id,label,pickup_time)').eq('trip_id',trip.id).eq('user_id',state.session.user.id).maybeSingle(); if(error)return fail(error);
  if(!member){content(`<div class="surface"><div class="empty"><strong>Nie jesteś przypisany do tego wyjazdu</strong>${esc(trip.title)}</div></div>`);return;}
  const {data:stops}=member.trip_vehicle_id?await sb.from('pickup_stops').select('*').eq('trip_vehicle_id',member.trip_vehicle_id).order('sort_order'):{data:[]};
  content(`<div class="grid grid-2"><div class="card"><div class="mini-label">${fmtDate(trip.starts_at)}</div><h3>${esc(trip.title)}</h3><div class="muted">${esc(trip.location||'')}</div><div class="row"><span>Auto</span><strong>${esc(member.trip_vehicles?.vehicles?.name||'Nie przypisano')}</strong></div><div class="row"><span>Kierowca</span><strong>${esc(member.trip_vehicles?.driver_id?personName(member.trip_vehicles.driver_id):'—')}</strong></div><div class="row"><span>Pokój</span><strong>${esc(member.room||'—')}</strong></div></div><form id="mytrip-form" class="card"><strong>Uzupełnij</strong><label class="field" style="margin-top:12px"><span>Czy jedziesz?</span><select name="status"><option value="pending">Brak odpowiedzi</option><option value="going">Jadę</option><option value="maybe">Nie wiem</option><option value="not_going">Nie jadę</option></select></label><label class="field"><span>Miejsce wsiadania</span><select name="pickup_stop_id"><option value="">Własne / inne</option>${(stops||[]).map(s=>`<option value="${s.id}">${esc(s.label)}${s.pickup_time?' · '+new Date(s.pickup_time).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):''}</option>`).join('')}</select></label><label class="field"><span>Własne miejsce wsiadania</span><input name="pickup_custom" value="${esc(member.pickup_custom||'')}" placeholder="np. parking, stacja, miejscowość"></label><label class="field"><span>Informacja dla kierowcy</span><input name="pickup_note" value="${esc(member.pickup_note||'')}" placeholder="Gdzie dokładnie będę czekać"></label><label class="field"><span>Rower</span><select name="bike_status"><option>Zabieram rower ze sobą</option><option>Rower jest u trenera</option><option>Rower jest u mechanika</option><option>Nie zabieram roweru</option><option>Inne</option></select></label><label class="field"><span>Liczba rowerów</span><input type="number" min="0" max="10" name="bike_count" value="${member.bike_count||0}"></label><button class="primary" type="submit">Zapisz informacje</button></form></div>`);
  const form=document.querySelector('#mytrip-form'); form.elements.status.value=member.status; form.elements.pickup_stop_id.value=member.pickup_stop_id||''; form.elements.bike_status.value=member.bike_status||'Zabieram rower ze sobą'; form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);const {error}=await sb.rpc('update_my_trip_response',{p_trip_id:trip.id,p_status:f.get('status'),p_pickup_stop_id:f.get('pickup_stop_id')||null,p_pickup_custom:f.get('pickup_custom'),p_pickup_note:f.get('pickup_note'),p_bike_status:f.get('bike_status'),p_bike_count:Number(f.get('bike_count')||0)});if(error)return fail(error);toast('Zapisano informacje o wyjeździe.');};
}

async function renderCalendar(){
  setTitle('KALENDARZ','Kalendarz klubu');
  const cursor=new Date(state.calendarDate); cursor.setDate(1); cursor.setHours(12,0,0,0); state.calendarDate=cursor;
  const y=cursor.getFullYear(),m=cursor.getMonth(); const first=new Date(y,m,1,12); const offset=(first.getDay()+6)%7; const start=new Date(y,m,1-offset,12);
  const monthLabel=new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(cursor);
  const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const byDay={}; for(const ev of state.events){const d=new Date(ev.starts_at),k=key(d);(byDay[k]??=[]).push(ev);}
  const cells=[]; for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=key(d),inside=d.getMonth()===m,today=k===key(new Date()),evs=byDay[k]||[];cells.push(`<div class="cal-day ${inside?'':'outside'} ${today?'today':''}"><div class="cal-date">${d.getDate()}</div><div class="cal-events">${evs.slice(0,3).map(ev=>`<button class="cal-event" data-event="${ev.id}" type="button"><span>${new Date(ev.starts_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</span>${esc(ev.title)}</button>`).join('')}${evs.length>3?`<div class="cal-more">+${evs.length-3} więcej</div>`:''}</div></div>`);}
  content(`<div class="surface"><div class="toolbar"><div><strong class="calendar-title">${esc(monthLabel)}</strong><div class="muted">Wyjazdy, treningi, zebrania i terminy.</div></div><div class="actions"><button class="ghost" id="cal-prev" type="button">←</button><button class="ghost" id="cal-today" type="button">Dzisiaj</button><button class="ghost" id="cal-next" type="button">→</button>${staff()?'<button class="primary" id="event-new" type="button">+ Wydarzenie</button>':''}</div></div><div class="calendar-scroll"><div class="calendar-grid calendar-head">${['Pon','Wt','Śr','Czw','Pt','Sob','Nd'].map(x=>`<div>${x}</div>`).join('')}</div><div class="calendar-grid calendar-body">${cells.join('')}</div></div></div>`);
  document.querySelector('#cal-prev').onclick=()=>{state.calendarDate=new Date(y,m-1,1,12);renderCalendar();}; document.querySelector('#cal-next').onclick=()=>{state.calendarDate=new Date(y,m+1,1,12);renderCalendar();}; document.querySelector('#cal-today').onclick=()=>{state.calendarDate=new Date();renderCalendar();}; document.querySelector('#event-new')?.addEventListener('click',eventModal);
  document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>{const ev=state.events.find(x=>x.id===b.dataset.event);if(ev)showModal(ev.title,`<div class="grid"><div><div class="mini-label">Termin</div><strong>${fmtDate(ev.starts_at)}</strong></div><div><div class="mini-label">Typ</div><span class="pill">${esc(ev.type)}</span></div>${ev.location?`<div><div class="mini-label">Miejsce</div><strong>${esc(ev.location)}</strong></div>`:''}${ev.description?`<div class="notice"><div>${esc(ev.description)}</div></div>`:''}</div>`);});
}

async function renderTeam(){
  if(!staff()) return navigate('dashboard'); setTitle('ZESPÓŁ','Użytkownicy i role'); const {data,error}=await sb.from('profiles').select('id,full_name,role,phone,active').order('full_name'); if(error)return fail(error);
  content(`<div class="surface"><div class="toolbar"><div><strong>${data.length} kont</strong><div class="muted">Dane administracyjne nie są widoczne dla zawodników.</div></div>${isAdmin()?'<button id="invite" class="primary" type="button">+ Kod dostępu</button>':''}</div><div style="margin-top:10px">${data.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.full_name)}</strong><small>${esc(x.phone||'Bez telefonu')}</small></div><div class="actions"><span class="pill">${esc(ROLES[x.role])}</span>${isAdmin()?`<button class="ghost edit-user" data-id="${x.id}" type="button">Edytuj</button>`:''}</div></div>`).join('')}</div></div>`); document.querySelector('#invite')?.addEventListener('click',inviteModal); document.querySelectorAll('.edit-user').forEach(b=>b.onclick=()=>editUserModal(data.find(x=>x.id===b.dataset.id)));
}

async function renderTransport(){
  setTitle('TRANSPORT','Auta, kierowcy i trasy'); const trip=activeTrip(); if(!trip){content('<div class="surface"><div class="empty">Brak dostępnego wyjazdu.</div></div>');return;}
  let q=sb.from('trip_vehicles').select('*,vehicles(*)').eq('trip_id',trip.id); if(role()==='driver')q=q.eq('driver_id',state.session.user.id); const {data,error}=await q; if(error)return fail(error);
  const cards=[]; for(const v of data){const [stops,members]=await Promise.all([sb.from('pickup_stops').select('*').eq('trip_vehicle_id',v.id).order('sort_order'),sb.from('trip_members').select('*').eq('trip_vehicle_id',v.id)]);const canMark=staff()||v.driver_id===state.session.user.id;cards.push(`<div class="card"><div class="toolbar"><div><strong>${esc(v.vehicles?.name||'Auto')}</strong><div class="muted">${esc(v.driver_id?personName(v.driver_id):'Brak kierowcy')} · ${members.data?.length||0}/${v.vehicles?.seats||0} osób · 🚲 ${v.vehicles?.bike_capacity||0}</div></div>${staff()?`<button class="ghost edit-tv" data-id="${v.id}" type="button">Edytuj</button>`:''}</div><div class="timeline" style="margin-top:14px">${(stops.data||[]).map(s=>`<div class="timeline-item"><strong>${s.pickup_time?new Date(s.pickup_time).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'—'}</strong><div class="timeline-dot"></div><div><strong>${esc(s.label)}</strong>${canMark?`<div style="margin-top:6px"><button class="ghost stop-done" data-id="${s.id}" data-done="${s.completed_at?'1':'0'}" type="button">${s.completed_at?'✓ Odebrano':'Oznacz odebrano'}</button></div>`:''}</div></div>`).join('')||'<div class="muted">Brak punktów odbioru.</div>'}</div><div style="margin-top:8px">${(members.data||[]).map(m=>`<div class="row"><div><strong>${esc(personName(m.user_id))}</strong><small class="muted">${esc(m.pickup_custom||m.pickup_note||'')}</small></div><span class="pill">🚲 ${esc(m.bike_status||'Brak danych')}</span></div>`).join('')}</div></div>`)}
  content(`<div class="toolbar"><div><strong>${esc(trip.title)}</strong><div class="muted">${role()==='mechanic'?'Pełny podgląd transportu; jeśli jesteś przypisany jako kierowca, możesz też odznaczać postoje.':''}</div></div>${staff()?'<button id="vehicle-add-trip" class="primary" type="button">+ Auta do wyjazdu</button>':''}</div><div class="grid grid-2" style="margin-top:10px">${cards.join('')||'<div class="surface"><div class="empty">Brak przypisanego transportu.</div></div>'}</div>`); document.querySelector('#vehicle-add-trip')?.addEventListener('click',()=>assignVehicleModal(trip.id)); document.querySelectorAll('.edit-tv').forEach(b=>b.onclick=()=>tripVehicleModal(b.dataset.id)); document.querySelectorAll('.stop-done').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('pickup_stops').update({completed_at:b.dataset.done==='1'?null:new Date().toISOString()}).eq('id',b.dataset.id);if(error)return fail(error);renderTransport();});
}

async function renderService(){
  setTitle('SPRZĘT',role()==='athlete'?'Moje rowery i zgłoszenia':'Serwis rowerów'); let bikesQ=sb.from('bikes').select('*').order('created_at'); let tickQ=sb.from('service_tickets').select('*,bike:bikes(name)').order('created_at',{ascending:false}); const [b,t]=await Promise.all([bikesQ,tickQ]); if(b.error||t.error)return fail(b.error||t.error);
  content(`<div class="grid grid-2"><div class="surface"><div class="toolbar"><div><strong>Rowery</strong><div class="muted">${b.data.length} zapisanych</div></div>${role()==='athlete'||staff()?'<button id="bike-add" class="primary" type="button">+ Rower</button>':''}</div>${b.data.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.name)}</strong><small>${esc(x.type||'')}</small></div>${role()!=='athlete'?`<span class="muted">${esc(personName(x.owner_id))}</span>`:''}</div>`).join('')||'<div class="empty">Brak rowerów.</div>'}</div><div class="surface"><div class="toolbar"><div><strong>Zgłoszenia serwisowe</strong><div class="muted">${t.data.filter(x=>x.status!=='ready').length} otwartych</div></div><button id="ticket-add" class="primary" type="button">+ Zgłoszenie</button></div>${t.data.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.bike?.name||'Rower')}</strong><small>${esc(x.description)} · ${esc(personName(x.user_id))}</small></div><div class="actions"><span class="pill ${x.status==='ready'?'ok':x.status==='in_progress'?'warn':''}">${x.status==='ready'?'Gotowy':x.status==='in_progress'?'W trakcie':'Do zrobienia'}</span>${['mechanic','admin','coach'].includes(role())?`<button class="ghost ticket-edit" data-id="${x.id}" type="button">Status</button>`:''}</div></div>`).join('')||'<div class="empty">Brak zgłoszeń.</div>'}</div></div>`); document.querySelector('#bike-add')?.addEventListener('click',bikeModal); document.querySelector('#ticket-add').onclick=()=>ticketModal(b.data); document.querySelectorAll('.ticket-edit').forEach(btn=>btn.onclick=()=>ticketStatusModal(t.data.find(x=>x.id===btn.dataset.id)));
}

async function renderTasks(){
  setTitle('ZADANIA','Do zrobienia'); let q=sb.from('tasks').select('*,trip:trip_id(title)').order('done').order('due_at',{ascending:true}); const {data,error}=await q;if(error)return fail(error); content(`<div class="surface"><div class="toolbar"><div><strong>${data.filter(x=>!x.done).length} otwartych</strong><div class="muted">Zadania dopasowane do roli i użytkownika.</div></div>${staff()?'<button id="task-global" class="primary" type="button">+ Zadanie</button>':''}</div>${data.map(x=>`<div class="row"><label class="check"><input class="task-check" data-id="${x.id}" type="checkbox" ${x.done?'checked':''}><div class="row-main"><strong>${esc(x.title)}</strong><small>${esc(x.trip?.title||'Bez wyjazdu')} ${x.due_at?'· '+fmtDate(x.due_at):''}</small></div></label><span class="pill">${esc(x.assigned_to?personName(x.assigned_to):(ROLES[x.assigned_role]||''))}</span></div>`).join('')||'<div class="empty">Brak zadań.</div>'}</div>`); document.querySelector('#task-global')?.addEventListener('click',()=>taskModal(null)); document.querySelectorAll('.task-check').forEach(c=>c.onchange=async()=>{const {error}=staff()?await sb.from('tasks').update({done:c.checked}).eq('id',c.dataset.id):await sb.rpc('set_my_task_done',{p_task_id:c.dataset.id,p_done:c.checked});if(error){c.checked=!c.checked;fail(error);}});
}

async function renderFinance(){
  if(!isAdmin())return navigate('dashboard'); setTitle('FINANSE','Koszty klubu i wyjazdów'); const {data,error}=await sb.from('expenses').select('*,trip:trip_id(title)').order('created_at',{ascending:false});if(error)return fail(error);const total=data.reduce((a,x)=>a+Number(x.amount),0); content(`<div class="grid grid-3"><div class="card soft"><div class="metric">${total.toLocaleString('pl-PL',{style:'currency',currency:'PLN'})}</div><div class="metric-label">łączne koszty</div></div><div class="card"><div class="metric">${data.length}</div><div class="metric-label">wpisów</div></div><div class="card"><button id="expense-add" class="primary" type="button">+ Dodaj koszt</button></div></div><div class="surface" style="margin-top:12px">${data.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.category)}</strong><small>${esc(x.description||'')}${x.trip?.title?' · '+esc(x.trip.title):''}</small></div><strong>${Number(x.amount).toLocaleString('pl-PL',{style:'currency',currency:'PLN'})}</strong></div>`).join('')||'<div class="empty">Brak kosztów.</div>'}</div>`); document.querySelector('#expense-add').onclick=expenseModal;
}

async function renderAdmin(){
  if(!isAdmin())return navigate('dashboard'); setTitle('ADMINISTRACJA','Dostęp i ustawienia'); const [{data:codes,error},{data:vehicles}]=await Promise.all([sb.from('invite_codes').select('*').order('created_at',{ascending:false}).limit(40),sb.from('vehicles').select('*').order('name')]);if(error)return fail(error);
  const active=(codes||[]).filter(codeActive);
  content(`<div class="grid grid-3"><div class="card soft"><div class="metric">${active.length}</div><div class="metric-label">aktywnych kodów</div><button id="invite-new" class="primary" style="margin-top:12px" type="button">Generuj kod</button></div><div class="card"><strong>Bezpieczeństwo</strong><p class="muted">Uprawnienia są sprawdzane przez RLS w bazie, nie tylko przez menu aplikacji.</p></div><div class="card"><strong>Kody zawodników</strong><p class="muted">Kod zawodnika jest wielokrotnego użytku przez 24 godziny. Pozostałe role otrzymują kod jednorazowy.</p></div></div><div class="surface" style="margin-top:12px"><div class="toolbar"><div><strong>Pojazdy</strong><div class="muted">Baza aut dostępnych przy planowaniu wyjazdów.</div></div><button id="vehicle-new" class="primary" type="button">+ Dodaj pojazd</button></div>${(vehicles||[]).map(v=>`<div class="row"><div class="row-main"><strong>${esc(v.name)}</strong><small>${esc(v.registration||'Bez numeru')} · ${v.seats} miejsc · ${v.bike_capacity} rowerów</small></div><span class="pill ${v.active?'ok':''}">${v.active?'Aktywny':'Nieaktywny'}</span></div>`).join('')||'<div class="empty">Brak pojazdów.</div>'}</div><div class="surface" style="margin-top:12px"><strong>Ostatnie kody dostępu</strong>${(codes||[]).map(x=>`<div class="row"><div><span class="code">${esc(x.code)}</span><div class="muted">${esc(ROLES[x.role])} · użycia: ${Number(x.use_count||0)}${x.max_uses==null?' / bez limitu':` / ${x.max_uses}`} ${x.expires_at?'· do '+fmtDate(x.expires_at):''}</div></div><span class="pill ${codeActive(x)?'ok':'danger'}">${codeActive(x)?'Aktywny':'Nieaktywny'}</span></div>`).join('')||'<div class="empty">Brak kodów.</div>'}</div>`); document.querySelector('#invite-new').onclick=inviteModal; document.querySelector('#vehicle-new').onclick=vehicleModal;
}

async function renderDocuments(){
  if(role()==='athlete') return navigate('dashboard');
  setTitle('DOKUMENTY','Pliki wyjazdowe');const {data,error}=await sb.from('documents').select('*,trip:trip_id(title)').order('created_at',{ascending:false});if(error)return fail(error); content(`<div class="surface"><div class="toolbar"><div><strong>Dokumenty</strong><div class="muted">PDF-y, potwierdzenia, listy startowe i inne pliki.</div></div>${staff()?'<button id="doc-add" class="primary" type="button">+ Dodaj plik</button>':''}</div>${data.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.title)}</strong><small>${esc(x.trip?.title||'Bez wyjazdu')} · ${x.visible_to_members?'widoczny dla uprawnionych':'tylko kadra'}</small></div><button class="ghost doc-open" data-path="${esc(x.storage_path)}" type="button">Otwórz</button></div>`).join('')||'<div class="empty">Brak dokumentów.</div>'}</div>`); document.querySelector('#doc-add')?.addEventListener('click',documentModal); document.querySelectorAll('.doc-open').forEach(b=>b.onclick=async()=>{const {data,error}=await sb.storage.from('planer-files').createSignedUrl(b.dataset.path,300);if(error)return fail(error);window.open(data.signedUrl,'_blank','noopener');});
}

async function renderChat(){
  setTitle('CZAT','Wiadomości');
  if(!state.chatGroups.length){content(`<div class="surface"><div class="toolbar"><div><strong>Brak czatów</strong><div class="muted">Utwórz pierwszą rozmowę.</div></div><div class="actions"><button id="notify-enable" class="ghost" type="button">🔔 Powiadomienia</button><button id="chat-new" class="primary" type="button">+ Nowa grupa</button></div></div></div>`);document.querySelector('#chat-new').onclick=chatModal;document.querySelector('#notify-enable').onclick=requestBrowserNotifications;return;}
  if(!state.activeChatId) state.activeChatId=state.chatGroups[0].id; const group=state.chatGroups.find(g=>g.id===state.activeChatId)||state.chatGroups[0]; state.activeChatId=group.id;
  content(`<div class="chat-layout"><div class="surface"><div class="toolbar"><strong>Czaty</strong><button id="chat-new" class="ghost" type="button">+</button></div><div class="chat-list" style="margin-top:10px">${state.chatGroups.map(g=>`<button class="nav-btn ${g.id===group.id?'active':''}" data-chat="${g.id}" type="button"><span>◌</span><span class="nav-label">${esc(chatLabel(g))}<b class="nav-alert ${unreadForGroup(g.id)?'':'hidden'}" data-group-badge="${g.id}">${unreadForGroup(g.id)>99?'99+':unreadForGroup(g.id)}</b></span></button>`).join('')}</div></div><div class="surface chat-room"><div class="toolbar"><div><strong>${esc(chatLabel(group))}</strong><div class="muted">${group.kind==='direct'?'Rozmowa prywatna':'Wiadomości grupowe'}</div></div><button id="notify-enable" class="ghost" type="button">🔔 Włącz powiadomienia</button></div><div id="messages" class="messages"><div class="skeleton"></div></div><form id="message-form" class="chat-send"><input name="body" class="input" maxlength="4000" autocomplete="off" placeholder="Napisz wiadomość…" required><button class="primary">Wyślij</button></form></div></div>`);
  document.querySelector('#chat-new').onclick=chatModal; document.querySelector('#notify-enable').onclick=requestBrowserNotifications; document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=async()=>{state.activeChatId=b.dataset.chat;await markChatRead(state.activeChatId);renderChat();}); document.querySelector('#message-form').onsubmit=sendMessage; await loadMessages(group.id); await markChatRead(group.id); updateNavBadges();
}

async function loadMessages(groupId){ const {data,error}=await sb.from('messages').select('id,body,created_at,sender_id').eq('group_id',groupId).order('created_at').limit(150);if(error)return fail(error); const el=document.querySelector('#messages');if(!el)return; el.innerHTML=(data||[]).map(m=>`<div class="bubble ${m.sender_id===state.session.user.id?'me':''}"><small>${esc(personName(m.sender_id))} · ${new Date(m.created_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</small>${esc(m.body)}</div>`).join('')||'<div class="empty">Napisz pierwszą wiadomość.</div>';el.scrollTop=el.scrollHeight; }
async function sendMessage(e){e.preventDefault();const f=new FormData(e.currentTarget),body=String(f.get('body')).trim();if(!body)return;const {error}=await sb.from('messages').insert({group_id:state.activeChatId,sender_id:state.session.user.id,body});if(error)return fail(error);e.currentTarget.reset();}
function subscribeMessages(_groupId){ /* Globalna subskrypcja obsługuje czat i liczniki. */ }

function quickActions(){
  if(!canUseQuickActions()) return;
  showModal('Szybkie akcje',`<div class="grid"><button class="primary q" data-v="trips" type="button">🚐 Otwórz najbliższy wyjazd</button><button class="ghost q" data-v="chat" type="button">💬 Przejdź do czatu</button>${isAdmin()?'<button class="ghost" id="quick-invite" type="button">🔐 Wygeneruj kod dostępu</button>':''}</div>`,()=>{modalContent.querySelectorAll('.q').forEach(b=>b.onclick=()=>{closeModal();navigate(b.dataset.v);});modalContent.querySelector('#quick-invite')?.addEventListener('click',inviteModal);});
}

async function showAnnouncements(){
  const html=state.announcements.map(a=>{const read=state.announcementReadIds.has(a.id);return `<div class="notice ${a.important?'important':''}" style="margin-bottom:8px"><strong>${esc(a.title)}</strong><div class="muted">${esc(a.body)}</div><button class="ghost read-ann" data-id="${a.id}" type="button" style="margin-top:8px" ${read?'disabled':''}>${read?'✓ Odczytano':'Odczytaj'}</button></div>`;}).join('')||'<div class="empty">Brak komunikatów.</div>';
  showModal('Powiadomienia',html,()=>modalContent.querySelectorAll('.read-ann:not([disabled])').forEach(b=>b.onclick=()=>markAnnouncementRead(b.dataset.id,false)));
}

async function markAnnouncementRead(id,close=true){
  const {error}=await sb.rpc('mark_announcement_read',{p_announcement_id:id});
  if(error) return fail(error,'Nie udało się oznaczyć komunikatu jako odczytany.');
  if(!state.announcementReadIds.has(id)) state.unread=Math.max(0,state.unread-1);
  state.announcementReadIds.add(id);
  if(close){ closeModal(); shell(); render(); return; }
  document.querySelectorAll('.badge-count').forEach(x=>x.textContent=state.unread);
  const btn=modalContent.querySelector(`.read-ann[data-id="${id}"]`); if(btn){btn.disabled=true;btn.textContent='✓ Odczytano';}
  render();
}

function newTripModal(){ showModal('Nowy wyjazd',`<form id="trip-form" class="form-grid"><label class="field"><span>Nazwa</span><input name="title" required maxlength="120"></label><div class="form-grid two"><label class="field"><span>Start</span><input name="starts_at" type="datetime-local" required></label><label class="field"><span>Koniec</span><input name="ends_at" type="datetime-local"></label></div><label class="field"><span>Miejsce</span><input name="location"></label><label class="field"><span>Status</span><select name="status"><option value="draft">Planowany</option><option value="confirmed">Potwierdzony</option></select></label><label class="field"><span>Informacje</span><textarea name="notes"></textarea></label><div class="modal-actions"><button class="primary">Utwórz</button></div></form>`,()=>document.querySelector('#trip-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload={title:f.get('title'),starts_at:new Date(f.get('starts_at')).toISOString(),ends_at:f.get('ends_at')?new Date(f.get('ends_at')).toISOString():null,location:f.get('location')||null,status:f.get('status'),notes:f.get('notes')||null,created_by:state.session.user.id};const {data,error}=await sb.from('trips').insert(payload).select().single();if(error)return fail(error);await sb.from('calendar_events').insert({title:payload.title,starts_at:payload.starts_at,ends_at:payload.ends_at,type:'wyjazd',location:payload.location,trip_id:data.id,created_by:state.session.user.id});closeModal();await refresh();state.activeTripId=data.id;navigate('trips');}); }
function editTripModal(t){showModal('Edytuj wyjazd',`<form id="trip-edit" class="form-grid"><label class="field"><span>Nazwa</span><input name="title" value="${esc(t.title)}" required></label><div class="form-grid two"><label class="field"><span>Start</span><input name="starts_at" type="datetime-local" value="${toLocalInput(t.starts_at)}" required></label><label class="field"><span>Koniec</span><input name="ends_at" type="datetime-local" value="${toLocalInput(t.ends_at)}"></label></div><label class="field"><span>Miejsce</span><input name="location" value="${esc(t.location||'')}"></label><label class="field"><span>Status</span><select name="status"><option value="draft">Planowany</option><option value="confirmed">Potwierdzony</option><option value="cancelled">Anulowany</option><option value="finished">Zakończony</option></select></label><label class="field"><span>Informacje</span><textarea name="notes">${esc(t.notes||'')}</textarea></label><div class="modal-actions"><button class="primary">Zapisz</button></div></form>`,()=>{const f=document.querySelector('#trip-edit');f.elements.status.value=t.status;f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);const {error}=await sb.from('trips').update({title:d.get('title'),starts_at:new Date(d.get('starts_at')).toISOString(),ends_at:d.get('ends_at')?new Date(d.get('ends_at')).toISOString():null,location:d.get('location')||null,status:d.get('status'),notes:d.get('notes')||null,updated_at:new Date().toISOString()}).eq('id',t.id);if(error)return fail(error);closeModal();await refresh();renderTrips();};});}
function hotelModal(t){showModal('Hotel',`<form id="hotel-form" class="form-grid"><label class="field"><span>Nazwa hotelu</span><input name="hotel_name" value="${esc(t.hotel_name||'')}"></label><label class="field"><span>Adres</span><input name="hotel_address" value="${esc(t.hotel_address||'')}"></label><div class="form-grid two"><label class="field"><span>Check-in</span><input name="hotel_checkin" value="${esc(t.hotel_checkin||'')}"></label><label class="field"><span>Check-out</span><input name="hotel_checkout" value="${esc(t.hotel_checkout||'')}"></label></div><label class="field"><span>Śniadanie</span><input name="hotel_breakfast" value="${esc(t.hotel_breakfast||'')}"></label><label class="field"><span>Dodatkowe informacje</span><textarea name="hotel_notes">${esc(t.hotel_notes||'')}</textarea></label><div class="modal-actions"><button class="primary">Zapisz</button></div></form>`,()=>document.querySelector('#hotel-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),obj=Object.fromEntries(f.entries());const {error}=await sb.from('trips').update(obj).eq('id',t.id);if(error)return fail(error);closeModal();Object.assign(t,obj);renderTrips();});}
async function addMembersModal(tripId,current){ const opts=state.directory.filter(x=>!current.includes(x.id)); showModal('Dodaj uczestników',`<form id="members-form"><div class="form-grid">${opts.map(x=>`<label class="check"><input name="member" type="checkbox" value="${x.id}"><span>${esc(x.full_name)}</span></label>`).join('')||'<div class="empty">Wszyscy są już przypisani.</div>'}</div><div class="modal-actions"><button class="primary">Dodaj zaznaczonych</button></div></form>`,()=>document.querySelector('#members-form').onsubmit=async e=>{e.preventDefault();const ids=new FormData(e.currentTarget).getAll('member');if(!ids.length)return;const {error}=await sb.from('trip_members').insert(ids.map(user_id=>({trip_id:tripId,user_id})));if(error)return fail(error);closeModal();renderTrips();}); }
async function assignVehicleModal(tripId){
  const [veh,profiles,current]=await Promise.all([sb.from('vehicles').select('*').eq('active',true).order('name'),sb.from('profiles').select('id,full_name,role').eq('active',true),sb.from('trip_vehicles').select('vehicle_id').eq('trip_id',tripId)]);
  const used=new Set((current.data||[]).map(x=>x.vehicle_id)); const available=(veh.data||[]).filter(x=>!used.has(x.id)); const drivers=(profiles.data||[]).filter(x=>['driver','mechanic','admin','coach'].includes(x.role));
  showModal('Dodaj auta do wyjazdu',`<form id="tv-form" class="form-grid"><div class="hint">Możesz zaznaczyć kilka aut naraz i od razu przypisać osobnego kierowcę oraz godzinę wyjazdu do każdego z nich.</div><div class="vehicle-picker">${available.map(v=>`<div class="vehicle-pick"><label class="check"><input name="vehicle" type="checkbox" value="${v.id}"><span><strong>${esc(v.name)}</strong><small>${v.seats} miejsc · ${v.bike_capacity} rowerów</small></span></label><div class="form-grid two"><label class="field"><span>Kierowca</span><select name="driver_${v.id}"><option value="">Brak</option>${drivers.map(x=>`<option value="${x.id}">${esc(x.full_name)} · ${esc(ROLES[x.role])}</option>`).join('')}</select></label><label class="field"><span>Godzina wyjazdu</span><input type="datetime-local" name="departure_${v.id}"></label></div></div>`).join('')||'<div class="empty">Wszystkie aktywne auta są już przypisane do tego wyjazdu.</div>'}</div>${available.length?'<div class="modal-actions"><button class="primary">Dodaj zaznaczone auta</button></div>':''}</form>`,()=>{const form=document.querySelector('#tv-form');if(!available.length)return;form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),ids=f.getAll('vehicle');if(!ids.length){toast('Zaznacz przynajmniej jedno auto.');return;}const rows=ids.map(vehicle_id=>{const dep=f.get(`departure_${vehicle_id}`);return {trip_id:tripId,vehicle_id,driver_id:f.get(`driver_${vehicle_id}`)||null,departure_time:dep?new Date(dep).toISOString():null};});const {error}=await sb.from('trip_vehicles').insert(rows);if(error)return fail(error);closeModal();renderTrips();};});
}

async function tripVehicleModal(id){ const [{data:v},{data:stops},{data:members},{data:people}]=await Promise.all([sb.from('trip_vehicles').select('*,vehicles(*)').eq('id',id).single(),sb.from('pickup_stops').select('*').eq('trip_vehicle_id',id).order('sort_order'),sb.from('trip_members').select('user_id').eq('trip_vehicle_id',id),sb.from('trip_members').select('user_id').eq('trip_id',activeTrip().id)]); showModal('Ustawienia transportu',`<div class="mini-label">${esc(v.vehicles?.name||'Pojazd')}</div><h3>Trasa odbioru</h3><div id="stop-list">${(stops||[]).map(s=>`<div class="row"><span>${esc(s.label)}</span><span class="muted">${s.pickup_time?fmtDate(s.pickup_time):'—'}</span></div>`).join('')}</div><form id="stop-form" class="form-grid" style="margin-top:12px"><label class="field"><span>Nazwa punktu</span><input name="label" required></label><label class="field"><span>Czas</span><input name="pickup_time" type="datetime-local"></label><button class="ghost">+ Dodaj punkt</button></form><h3 style="margin-top:20px">Przypisz pasażera</h3><form id="pass-form" class="chat-send"><select class="input" name="user_id"><option value="">Wybierz osobę</option>${(people||[]).map(x=>`<option value="${x.user_id}">${esc(personName(x.user_id))}</option>`).join('')}</select><button class="primary">Przypisz</button></form>`,()=>{document.querySelector('#stop-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('pickup_stops').insert({trip_vehicle_id:id,label:f.get('label'),pickup_time:f.get('pickup_time')?new Date(f.get('pickup_time')).toISOString():null,sort_order:(stops?.length||0)+1});if(error)return fail(error);closeModal();tripVehicleModal(id);};document.querySelector('#pass-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!f.get('user_id'))return;const {error}=await sb.from('trip_members').update({trip_vehicle_id:id}).eq('trip_id',activeTrip().id).eq('user_id',f.get('user_id'));if(error)return fail(error);closeModal();renderTrips();};}); }
async function memberAdminModal(tripId,m){const {data:cars}=await sb.from('trip_vehicles').select('id,vehicles(name)').eq('trip_id',tripId);showModal('Uczestnik wyjazdu',`<form id="member-admin" class="form-grid"><div class="notice"><strong>${esc(personName(m.user_id))}</strong></div><label class="field"><span>Status</span><select name="status"><option value="pending">Brak odpowiedzi</option><option value="going">Jadę</option><option value="maybe">Nie wiem</option><option value="not_going">Nie jadę</option></select></label><label class="field"><span>Auto</span><select name="trip_vehicle_id"><option value="">Brak</option>${(cars||[]).map(v=>`<option value="${v.id}">${esc(v.vehicles?.name||'Pojazd')}</option>`).join('')}</select></label><label class="field"><span>Pokój</span><input name="room" value="${esc(m.room||'')}" placeholder="np. 204"></label><label class="field"><span>Notatka organizacyjna</span><textarea name="admin_note">${esc(m.admin_note||'')}</textarea></label><div class="modal-actions"><button class="primary">Zapisz</button></div></form>`,()=>{const f=document.querySelector('#member-admin');f.elements.status.value=m.status;f.elements.trip_vehicle_id.value=m.trip_vehicle_id||'';f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);const {error}=await sb.from('trip_members').update({status:d.get('status'),trip_vehicle_id:d.get('trip_vehicle_id')||null,room:d.get('room')||null,admin_note:d.get('admin_note')||null,updated_at:new Date().toISOString()}).eq('trip_id',tripId).eq('user_id',m.user_id);if(error)return fail(error);closeModal();renderTrips();};});}
function vehicleModal(){showModal('Nowy pojazd',`<form id="vehicle-form" class="form-grid"><label class="field"><span>Nazwa</span><input name="name" required placeholder="np. Bus 1"></label><label class="field"><span>Numer rejestracyjny</span><input name="registration"></label><div class="form-grid two"><label class="field"><span>Liczba miejsc</span><input name="seats" type="number" min="1" max="60" value="9"></label><label class="field"><span>Pojemność rowerów</span><input name="bike_capacity" type="number" min="0" max="60" value="8"></label></div><label class="field"><span>Uwagi</span><textarea name="notes"></textarea></label><div class="modal-actions"><button class="primary">Dodaj pojazd</button></div></form>`,()=>document.querySelector('#vehicle-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('vehicles').insert({name:f.get('name'),registration:f.get('registration')||null,seats:Number(f.get('seats')),bike_capacity:Number(f.get('bike_capacity')),notes:f.get('notes')||null});if(error)return fail(error);closeModal();renderAdmin();});}
function eventModal(){showModal('Nowe wydarzenie',`<form id="event-form" class="form-grid"><label class="field"><span>Nazwa</span><input name="title" required></label><div class="form-grid two"><label class="field"><span>Start</span><input type="datetime-local" name="starts_at" required></label><label class="field"><span>Koniec</span><input type="datetime-local" name="ends_at"></label></div><label class="field"><span>Typ</span><select name="type"><option>trening</option><option>zawody</option><option>zebranie</option><option>termin</option><option>inne</option></select></label><label class="field"><span>Miejsce</span><input name="location"></label><label class="field"><span>Opis</span><textarea name="description"></textarea></label><div class="modal-actions"><button class="primary">Dodaj</button></div></form>`,()=>document.querySelector('#event-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('calendar_events').insert({title:f.get('title'),starts_at:new Date(f.get('starts_at')).toISOString(),ends_at:f.get('ends_at')?new Date(f.get('ends_at')).toISOString():null,type:f.get('type'),location:f.get('location')||null,description:f.get('description')||null,created_by:state.session.user.id});if(error)return fail(error);closeModal();await refresh();renderCalendar();});}
function inviteModal(){
  showModal('Kod dostępu',`<form id="invite-form" class="form-grid"><label class="field"><span>Rola</span><select name="role"><option value="athlete">Zawodnik</option><option value="mechanic">Mechanik</option><option value="driver">Kierowca</option><option value="coach">Trener</option><option value="admin">Administrator</option></select></label><div id="invite-athlete-info" class="notice"><strong>Kod zawodnika</strong><div class="muted">Wielokrotnego użytku przez 24 godziny. Możesz wysłać ten sam kod całej grupie zawodników.</div></div><label class="field" id="invite-hours-wrap"><span>Ważność kodu jednorazowego</span><select name="hours"><option value="24">24 godziny</option><option value="72">3 dni</option><option value="168" selected>7 dni</option><option value="720">30 dni</option></select></label><div class="modal-actions"><button class="primary">Generuj</button></div></form><div id="invite-result"></div>`,()=>{const form=document.querySelector('#invite-form'),roleSelect=form.elements.role,hoursWrap=document.querySelector('#invite-hours-wrap'),info=document.querySelector('#invite-athlete-info');const sync=()=>{const athlete=roleSelect.value==='athlete';hoursWrap.classList.toggle('hidden',athlete);info.classList.toggle('hidden',!athlete);};roleSelect.onchange=sync;sync();form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),r=f.get('role'),hours=r==='athlete'?24:Number(f.get('hours'));const {data,error}=await sb.rpc('generate_invite_code',{p_role:r,p_expires_hours:hours});if(error)return fail(error);document.querySelector('#invite-result').innerHTML=`<div class="notice" style="margin-top:14px"><div class="mini-label">Kod ${r==='athlete'?'24h · wielokrotny':'jednorazowy'}</div><div class="code" style="margin-top:5px">${esc(data)}</div><div class="muted" style="margin-top:5px">${r==='athlete'?'Ten sam kod może aktywować wiele kont zawodników przez 24 godziny.':'Po pierwszym użyciu kod przestanie działać.'}</div></div>`;};});
}

function editUserModal(u){showModal('Edytuj użytkownika',`<form id="user-form" class="form-grid"><label class="field"><span>Imię i nazwisko</span><input name="full_name" value="${esc(u.full_name)}" required></label><label class="field"><span>Telefon</span><input name="phone" value="${esc(u.phone||'')}"></label><label class="field"><span>Rola</span><select name="role">${Object.entries(ROLES).map(([v,n])=>`<option value="${v}" ${u.role===v?'selected':''}>${n}</option>`).join('')}</select></label><label class="check"><input name="active" type="checkbox" ${u.active?'checked':''}><span>Konto aktywne</span></label><div class="modal-actions"><button class="primary">Zapisz</button></div></form>`,()=>document.querySelector('#user-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('profiles').update({full_name:f.get('full_name'),phone:f.get('phone')||null,role:f.get('role'),active:f.get('active')==='on'}).eq('id',u.id);if(error)return fail(error);closeModal();renderTeam();});}
function taskModal(tripId){showModal('Nowe zadanie',`<form id="task-form" class="form-grid"><label class="field"><span>Zadanie</span><input name="title" required></label><label class="field"><span>Wyjazd</span><select name="trip_id"><option value="">Bez wyjazdu</option>${state.trips.map(t=>`<option value="${t.id}" ${tripId===t.id?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label><label class="field"><span>Przypisz do roli</span><select name="assigned_role"><option value="">Brak</option>${Object.entries(ROLES).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label class="field"><span>Lub konkretna osoba</span><select name="assigned_to"><option value="">Brak</option>${state.directory.map(x=>`<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></label><label class="field"><span>Termin</span><input type="datetime-local" name="due_at"></label><div class="modal-actions"><button class="primary">Dodaj</button></div></form>`,()=>document.querySelector('#task-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('tasks').insert({title:f.get('title'),trip_id:f.get('trip_id')||null,assigned_role:f.get('assigned_role')||null,assigned_to:f.get('assigned_to')||null,due_at:f.get('due_at')?new Date(f.get('due_at')).toISOString():null,created_by:state.session.user.id});if(error)return fail(error);closeModal();render();});}
function announcementModal(tripId){showModal('Nowy komunikat',`<form id="ann-form" class="form-grid"><label class="field"><span>Tytuł</span><input name="title" required></label><label class="field"><span>Treść</span><textarea name="body" required></textarea></label><label class="check"><input name="important" type="checkbox"><span>Ważny komunikat</span></label><div class="modal-actions"><button class="primary">Opublikuj</button></div></form>`,()=>document.querySelector('#ann-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('announcements').insert({trip_id:tripId,title:f.get('title'),body:f.get('body'),important:f.get('important')==='on',created_by:state.session.user.id});if(error)return fail(error);closeModal();await refresh();renderTrips();});}
function bikeModal(){showModal('Dodaj rower',`<form id="bike-form" class="form-grid">${staff()?`<label class="field"><span>Właściciel</span><select name="owner_id">${state.directory.map(x=>`<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></label>`:''}<label class="field"><span>Nazwa</span><input name="name" placeholder="np. Rower szosowy" required></label><label class="field"><span>Typ</span><input name="type" placeholder="szosa / gravel / CX / tor"></label><label class="field"><span>Uwagi</span><textarea name="notes"></textarea></label><div class="modal-actions"><button class="primary">Dodaj</button></div></form>`,()=>document.querySelector('#bike-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('bikes').insert({owner_id:staff()?(f.get('owner_id')||state.session.user.id):state.session.user.id,name:f.get('name'),type:f.get('type')||null,notes:f.get('notes')||null});if(error)return fail(error);closeModal();renderService();});}
function ticketModal(bikes){showModal('Zgłoszenie serwisowe',`<form id="ticket-form" class="form-grid"><label class="field"><span>Rower</span><select name="bike_id"><option value="">Bez przypisania</option>${bikes.map(x=>`<option value="${x.id}">${esc(x.name)}${x.owner_id?' · '+esc(personName(x.owner_id)):''}</option>`).join('')}</select></label><label class="field"><span>Wyjazd</span><select name="trip_id"><option value="">Bez wyjazdu</option>${state.trips.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label><label class="field"><span>Problem / zadanie</span><textarea name="description" required></textarea></label><div class="modal-actions"><button class="primary">Wyślij</button></div></form>`,()=>document.querySelector('#ticket-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('service_tickets').insert({bike_id:f.get('bike_id')||null,trip_id:f.get('trip_id')||null,created_by:state.session.user.id,description:f.get('description')});if(error)return fail(error);closeModal();renderService();});}
function ticketStatusModal(t){showModal('Status zgłoszenia',`<form id="ticket-status" class="form-grid"><label class="field"><span>Status</span><select name="status"><option value="open">Do zrobienia</option><option value="in_progress">W trakcie</option><option value="ready">Gotowy</option></select></label><label class="field"><span>Notatka mechanika</span><textarea name="mechanic_note">${esc(t.mechanic_note||'')}</textarea></label><div class="modal-actions"><button class="primary">Zapisz</button></div></form>`,()=>{const f=document.querySelector('#ticket-status');f.elements.status.value=t.status;f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);const {error}=await sb.from('service_tickets').update({status:d.get('status'),mechanic_note:d.get('mechanic_note')||null,assigned_to:role()==='mechanic'?state.session.user.id:t.assigned_to,updated_at:new Date().toISOString()}).eq('id',t.id);if(error)return fail(error);closeModal();renderService();};});}
function expenseModal(){showModal('Dodaj koszt',`<form id="expense-form" class="form-grid"><label class="field"><span>Kategoria</span><input name="category" required placeholder="np. hotel, paliwo, wpisowe"></label><label class="field"><span>Kwota PLN</span><input name="amount" type="number" min="0" step="0.01" required></label><label class="field"><span>Wyjazd</span><select name="trip_id"><option value="">Bez wyjazdu</option>${state.trips.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label><label class="field"><span>Opis</span><input name="description"></label><div class="modal-actions"><button class="primary">Dodaj</button></div></form>`,()=>document.querySelector('#expense-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await sb.from('expenses').insert({category:f.get('category'),amount:Number(f.get('amount')),trip_id:f.get('trip_id')||null,description:f.get('description')||null,created_by:state.session.user.id});if(error)return fail(error);closeModal();renderFinance();});}
async function chatModal(){showModal('Nowa rozmowa',`<form id="chat-create" class="form-grid"><label class="field"><span>Typ</span><select name="kind"><option value="direct">Wiadomość prywatna</option><option value="group">Czat grupowy</option></select></label><label class="field" id="chat-name-wrap"><span>Nazwa grupy</span><input name="name" maxlength="80" placeholder="Nazwa czatu"></label><div><div class="mini-label">Wybierz osoby</div><div style="max-height:260px;overflow:auto;margin-top:8px">${state.directory.filter(x=>x.id!==state.session.user.id).map(x=>`<label class="check row"><input name="member" type="checkbox" value="${x.id}"><span>${esc(x.full_name)}</span></label>`).join('')}</div></div><div class="hint" id="chat-kind-hint">Dla rozmowy prywatnej zaznacz dokładnie jedną osobę.</div><div class="modal-actions"><button class="primary">Utwórz</button></div></form>`,()=>{const form=document.querySelector('#chat-create'),kind=form.elements.kind,nameWrap=document.querySelector('#chat-name-wrap'),hint=document.querySelector('#chat-kind-hint');const sync=()=>{const direct=kind.value==='direct';nameWrap.classList.toggle('hidden',direct);hint.textContent=direct?'Dla rozmowy prywatnej zaznacz dokładnie jedną osobę.':'Możesz zaznaczyć dowolną liczbę osób.';};kind.onchange=sync;sync();form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),members=f.getAll('member');let data,error;if(f.get('kind')==='direct'){if(members.length!==1){toast('Wybierz dokładnie jedną osobę.');return;}({data,error}=await sb.rpc('create_direct_chat',{p_other_user:members[0]}));}else{const name=String(f.get('name')||'').trim();if(!name){toast('Podaj nazwę grupy.');return;}({data,error}=await sb.rpc('create_chat',{p_name:name,p_member_ids:members,p_trip_id:null}));}if(error)return fail(error);closeModal();await refresh();state.activeChatId=data;navigate('chat');};});}
async function documentModal(){showModal('Dodaj dokument',`<form id="doc-form" class="form-grid"><label class="field"><span>Tytuł</span><input name="title" required></label><label class="field"><span>Wyjazd</span><select name="trip_id"><option value="">Bez wyjazdu</option>${state.trips.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label><label class="field"><span>Plik</span><input name="file" type="file" required></label><label class="check"><input name="visible" type="checkbox" checked><span>Widoczny dla członków</span></label><div class="modal-actions"><button class="primary">Wyślij</button></div></form>`,()=>document.querySelector('#doc-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file');if(!file?.name)return;const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${Date.now()}_${crypto.randomUUID()}_${safe}`;const up=await sb.storage.from('planer-files').upload(path,file,{upsert:false});if(up.error)return fail(up.error);const {error}=await sb.from('documents').insert({trip_id:f.get('trip_id')||null,title:f.get('title'),storage_path:path,visible_to_members:f.get('visible')==='on',uploaded_by:state.session.user.id});if(error)return fail(error);closeModal();renderDocuments();});}

function subscribeGlobalMessages(){
  if(state.notificationChannel) sb.removeChannel(state.notificationChannel);
  state.notificationChannel=sb.channel(`planer-global-messages-${state.session.user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},async payload=>{
    const msg=payload.new; if(!msg||msg.sender_id===state.session.user.id) return;
    const group=state.chatGroups.find(g=>g.id===msg.group_id); if(!group) return;
    if(state.view==='chat'&&state.activeChatId===msg.group_id){ await loadMessages(msg.group_id); await markChatRead(msg.group_id); return; }
    state.chatUnread[msg.group_id]=unreadForGroup(msg.group_id)+1; state.chatUnreadTotal++;
    updateNavBadges(); toast(`Nowa wiadomość · ${chatLabel(group)}`); await showBrowserNotification(`PLANER · ${chatLabel(group)}`,String(msg.body||'Nowa wiadomość').slice(0,180),msg.group_id);
  }).subscribe();
}

async function refresh(){ await loadBase(); updateNavBadges(); }

function withTimeout(promise, ms, message='Przekroczono czas oczekiwania.') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer=setTimeout(()=>reject(new Error(message)), ms); })
  ]).finally(()=>clearTimeout(timer));
}

async function boot(){
  document.documentElement.dataset.planerBoot='starting';
  if(!configured){configScreen();document.documentElement.dataset.planerBoot='ready';return;}
  let session=null;
  try {
    const result=await withTimeout(sb.auth.getSession(), 5000, 'Supabase nie odpowiedział podczas sprawdzania sesji.');
    session=result.data.session;
  } catch(e) {
    console.warn(e);
    session=null;
  }
  state.session=session;
  sb.auth.onAuthStateChange(async (_event,session)=>{state.session=session;if(!session){state.profile=null;if(state.notificationChannel)sb.removeChannel(state.notificationChannel);authScreen();document.documentElement.dataset.planerBoot='ready';return;}try{await loadProfile();await loadBase();shell();render();subscribeGlobalMessages();}catch(e){fail(e);authScreen();}});
  if(!session){authScreen();document.documentElement.dataset.planerBoot='ready';return;} try{await loadProfile();await loadBase();shell();render();subscribeGlobalMessages();}catch(e){fail(e);authScreen();}
  document.documentElement.dataset.planerBoot='ready';
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=23').catch(()=>{});
}

boot();
