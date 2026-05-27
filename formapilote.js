/**
 * ====================================================================
 * FORMAPILOTE v3.0 — JAVASCRIPT PRINCIPAL
 * Connecté à Supabase — remplace localStorage
 * ====================================================================
 */

// ── CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://eqadaccfdonpxhkftyql.supabase.co";
const SUPABASE_KEY = "sb_publishable_sNWsK6Nir7AsTdpgF3_mpA_kPut_EuT";
const PROXY_URL    = "https://script.google.com/macros/s/AKfycbz4hraC2q3Rhr9pqktce9QihGimY9OC9d1sfroWBFJi7beDKnKZcC8i8rpc788iz8m05w/exec";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── STATE (cache local) ─────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  sessions: [], participants: [], paiements: [],
  user: null,
  partTab: 'tous', paiTab: 'tous', sessFilter: 'tous',
  search: '', loading: false
};

// ====================================================================
// AUTH
// ====================================================================
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { showLoginPage(); return; }
  state.user = session.user;
  document.getElementById('sidebar-email').textContent = session.user.email;
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  await loadAllData();
  showPage('dashboard');
  initRealtime();
}

function showLoginPage() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-pwd').value;
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  btn.textContent = 'Connexion…'; btn.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
  if (error) {
    errEl.textContent = 'Identifiants incorrects. Vérifiez votre email et mot de passe.';
    errEl.style.display = 'block';
    btn.textContent = 'Se connecter'; btn.disabled = false;
    return;
  }
  btn.textContent = '✓ Connecté !';
  setTimeout(() => init(), 500);
}

async function doLogout() {
  await supabase.auth.signOut();
  state.sessions = []; state.participants = []; state.paiements = [];
  showLoginPage();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-page').style.display !== 'none') doLogin();
});

// ====================================================================
// CHARGEMENT DONNÉES
// ====================================================================
async function loadAllData() {
  setLoading(true);
  await Promise.all([loadSessions(), loadParticipants(), loadPaiements()]);
  setLoading(false);
}

async function loadSessions() {
  const { data, error } = await supabase.from('sessions').select('*').order('date');
  if (!error) state.sessions = data || [];
}

async function loadParticipants() {
  const { data, error } = await supabase.from('participants').select('*').order('created_at', { ascending: false });
  if (!error) state.participants = data || [];
}

async function loadPaiements() {
  const { data, error } = await supabase.from('paiements').select('*').order('created_at', { ascending: false });
  if (!error) state.paiements = data || [];
}

function setLoading(v) {
  state.loading = v;
  if (v) document.getElementById('content').innerHTML = '<div class="page-loader"><div class="spinner"></div><span>Chargement…</span></div>';
}

// ====================================================================
// REALTIME
// ====================================================================
function initRealtime() {
  supabase.channel('formapilote-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'sessions' }, async () => {
      await loadSessions(); renderPage(state.currentPage); showToast('Sessions mises à jour', 'info');
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'participants' }, async () => {
      await loadParticipants(); renderPage(state.currentPage);
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'paiements' }, async () => {
      await loadPaiements(); renderPage(state.currentPage);
    })
    .subscribe();
}

// ====================================================================
// NAVIGATION
// ====================================================================
const pageTitles = {
  dashboard:'Tableau de bord', sessions:'Créneaux de formation',
  participants:'Participants', paiements:'Encaissements',
  inscription:"Formulaire d'inscription public", import:'Import / Export'
};

function showPage(page) {
  state.currentPage = page;
  state.search = '';
  const si = document.getElementById('global-search');
  if (si) si.value = '';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    if (el.textContent.trim().toLowerCase().includes(pageTitles[page]?.toLowerCase().split(' ')[0]?.toLowerCase() || page))
      el.classList.add('active');
  });
  document.getElementById('page-title').textContent = pageTitles[page] || page;
  renderPage(page);
}

function renderPage(page) {
  if (state.loading) return;
  const c = document.getElementById('content');
  c.innerHTML = '';
  const pages = { dashboard:renderDashboard, sessions:renderSessions, participants:renderParticipants, paiements:renderPaiements, inscription:renderInscription, import:renderImport };
  if (pages[page]) c.innerHTML = pages[page]();
  setTimeout(() => {
    document.querySelectorAll('.chart-bar-fill').forEach(el => { el.style.width = el.dataset.w || '0%'; });
  }, 100);
  closeAllDropdowns();
}

// ====================================================================
// SEARCH & KEYBOARD
// ====================================================================
function handleSearch(val) { state.search = val.toLowerCase().trim(); renderPage(state.currentPage); }
function highlight(text, search) {
  if (!search || !text) return text || '—';
  return String(text).replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'), m=>`<mark>${m}</mark>`);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeAllDropdowns(); }
  if ((e.ctrlKey||e.metaKey) && e.key==='n') { e.preventDefault(); if(state.currentPage==='sessions') openSessionModal(); else if(state.currentPage==='participants') openParticipantModal(); else if(state.currentPage==='paiements') openPaiementModal(); }
  if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
});

// ====================================================================
// DROPDOWN STATUT
// ====================================================================
function closeAllDropdowns() { document.querySelectorAll('.status-dropdown.open').forEach(d=>d.classList.remove('open')); }
document.addEventListener('click', e=>{ if(!e.target.closest('.status-dropdown')) closeAllDropdowns(); });
function toggleDropdown(id) { const el=document.getElementById(id); const was=el.classList.contains('open'); closeAllDropdowns(); if(!was) el.classList.add('open'); }

const statutPaiCfg = { 'Encaissé':{dot:'dot-green',label:'Encaissé'}, 'En attente':{dot:'dot-yellow',label:'En attente'}, 'Remboursé':{dot:'dot-red',label:'Remboursé'} };
const statutPartCfg = { 'Confirmé':{dot:'dot-green',label:'Confirmé'}, 'En attente':{dot:'dot-yellow',label:'En attente'}, 'Annulé':{dot:'dot-red',label:'Annulé'}, 'Présent':{dot:'dot-blue',label:'Présent'} };

function makeStatusDropdown(id, current, configMap, onChangeFn) {
  const cur = configMap[current] || {dot:'dot-gray', label:current||'—'};
  const items = Object.entries(configMap).map(([key,cfg])=>
    `<button class="status-menu-item" onclick="${onChangeFn}('${id}','${key}')"><span class="dot ${cfg.dot}"></span>${cfg.label}</button>`
  ).join('');
  return `<div class="status-dropdown" id="dd-${id}">
    <button class="btn btn-ghost btn-sm" style="display:flex;align-items:center;gap:6px" onclick="toggleDropdown('dd-${id}');event.stopPropagation()">
      <span class="dot ${cur.dot}"></span>${cur.label}<span style="font-size:9px;margin-left:2px">▼</span>
    </button>
    <div class="status-menu">${items}</div>
  </div>`;
}

async function changePaiementStatut(id, statut) {
  const updates = { statut };
  if (statut === 'Encaissé') updates.date_paiement = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('paiements').update(updates).eq('id', id);
  if (!error) { await loadPaiements(); showToast('Statut mis à jour ✓'); renderPage('paiements'); }
  else showToast('Erreur : ' + error.message, 'error');
  closeAllDropdowns();
}

async function changeParticipantStatut(id, statut) {
  const { error } = await supabase.from('participants').update({ statut }).eq('id', id);
  if (!error) { await loadParticipants(); showToast('Statut mis à jour ✓'); renderPage('participants'); }
  else showToast('Erreur : ' + error.message, 'error');
  closeAllDropdowns();
}

// ====================================================================
// DASHBOARD
// ====================================================================
function renderDashboard() {
  const actifs = state.participants.filter(p=>p.statut!=='Annulé').length;
  const confirmes = state.participants.filter(p=>p.statut==='Confirmé').length;
  const sessOuvertes = state.sessions.filter(s=>s.statut==='Ouvert').length;
  const encaisse = state.paiements.filter(p=>p.statut==='Encaissé').reduce((a,p)=>a+(p.montant||0),0);
  const attente  = state.paiements.filter(p=>p.statut==='En attente').reduce((a,p)=>a+(p.montant||0),0);
  const moisCourant = new Date().toISOString().slice(0,7);
  const caMois = state.paiements.filter(p=>p.statut==='Encaissé'&&(p.date_paiement||'').startsWith(moisCourant)).reduce((a,p)=>a+(p.montant||0),0);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = state.sessions.filter(s=>s.date>=today&&s.statut!=='Terminé').sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);

  const fillBars = state.sessions.filter(s=>s.statut!=='Terminé').map(s=>{
    const pct = Math.round((s.inscrits/s.places)*100);
    return `<div class="chart-bar-item"><div class="chart-bar-label" title="${s.titre}">${s.titre}</div><div class="chart-bar-track"><div class="chart-bar-fill" data-w="${pct}%" style="width:0%;background:${pct>=100?'var(--red)':pct>=80?'var(--yellow)':'var(--accent)'}"></div></div><div class="chart-bar-val">${pct}%</div></div>`;
  }).join('');

  const recentRows = [...state.participants].slice(0,5).map(p=>`
    <tr><td><strong>${p.prenom} ${p.nom}</strong></td><td style="font-size:12px">${p.session_titre||'—'}</td><td>${formatDate(p.date_inscription)}</td><td>${badgeStatut(p.statut)}</td></tr>`).join('');

  const upcomingHTML = upcoming.length ? upcoming.map(s=>{
    const d = new Date(s.date+'T00:00:00');
    const pct = Math.round((s.inscrits/s.places)*100);
    const col = pct>=100?'var(--red)':pct>=80?'var(--yellow)':'var(--green)';
    return `<div class="upcoming-item">
      <div class="upcoming-date"><div class="day">${d.getDate().toString().padStart(2,'0')}</div><div class="month">${d.toLocaleDateString('fr-FR',{month:'short'})}</div></div>
      <div class="upcoming-info"><div class="upcoming-title">${s.titre}</div><div class="upcoming-meta">${s.heure||''} · ${s.formateur||'—'} · ${s.duree}h</div></div>
      <div style="text-align:right;flex-shrink:0"><div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${col}">${pct}%</div><div style="font-size:10px;color:var(--muted)">${s.inscrits}/${s.places}</div></div>
    </div>`;
  }).join('') : '<div class="empty"><p>Aucune session à venir</p></div>';

  return `
    <div class="quick-actions">
      <button class="quick-btn" onclick="showPage('sessions');setTimeout(openSessionModal,50)">📅 Nouveau créneau</button>
      <button class="quick-btn" onclick="showPage('participants');setTimeout(openParticipantModal,50)">👤 Inscrire</button>
      <button class="quick-btn" onclick="showPage('paiements');state.paiTab='En attente';renderPage('paiements')">💶 Impayés (${state.paiements.filter(p=>p.statut==='En attente').length})</button>
      <button class="quick-btn" onclick="exportJSON()">⬇️ Exporter</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card clickable" onclick="showPage('participants')"><div class="stat-label">Participants actifs</div><div class="stat-value blue">${actifs}</div><div class="stat-sub">${confirmes} confirmés</div><div class="stat-arrow">→ Voir les participants</div></div>
      <div class="stat-card clickable" onclick="showPage('sessions')"><div class="stat-label">Créneaux ouverts</div><div class="stat-value orange">${sessOuvertes}</div><div class="stat-sub">sur ${state.sessions.length} au total</div><div class="stat-arrow">→ Voir les créneaux</div></div>
      <div class="stat-card clickable" onclick="showPage('paiements')"><div class="stat-label">Total encaissé</div><div class="stat-value green">${encaisse.toLocaleString('fr-FR')} €</div><div class="stat-sub">CA mois : ${caMois.toLocaleString('fr-FR')} €</div><div class="stat-arrow">→ Voir les encaissements</div></div>
      <div class="stat-card clickable" onclick="showPage('paiements');state.paiTab='En attente';renderPage('paiements')"><div class="stat-label">En attente</div><div class="stat-value yellow">${attente.toLocaleString('fr-FR')} €</div><div class="stat-sub">${state.paiements.filter(p=>p.statut==='En attente').length} relances à faire</div><div class="stat-arrow">→ Voir les impayés</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="panel"><div class="panel-header"><div class="panel-title">📅 Sessions à venir</div><button class="btn btn-ghost btn-sm" onclick="showPage('sessions')">Voir tout →</button></div><div class="panel-body">${upcomingHTML}</div></div>
      <div class="panel"><div class="panel-header"><div class="panel-title">Taux de remplissage</div></div><div class="panel-body"><div class="chart-bar-wrap">${fillBars||'<div class="empty"><p>Aucune session ouverte</p></div>'}</div></div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="panel"><div class="panel-header"><div class="panel-title">💶 Paiements</div></div><div class="panel-body"><div class="chart-bar-wrap">
        ${['Encaissé','En attente','Remboursé'].map(s=>{const total=state.paiements.filter(p=>p.statut===s).reduce((a,p)=>a+(p.montant||0),0);const max=encaisse+attente||1;const pct=Math.round((total/max)*100);const col=s==='Encaissé'?'var(--green)':s==='En attente'?'var(--yellow)':'var(--red)';return `<div class="chart-bar-item"><div class="chart-bar-label">${s}</div><div class="chart-bar-track"><div class="chart-bar-fill" data-w="${pct}%" style="width:0%;background:${col}"></div></div><div class="chart-bar-val">${total}€</div></div>`;}).join('')}
      </div></div></div>
      <div class="panel"><div class="panel-header"><div class="panel-title">Inscriptions récentes</div><button class="btn btn-ghost btn-sm" onclick="showPage('participants')">Voir tout →</button></div>
        <div class="panel-body" style="padding:0"><table class="data-table"><thead><tr><th>Participant</th><th>Session</th><th>Date</th><th>Statut</th></tr></thead>
          <tbody>${recentRows||'<tr><td colspan="4"><div class="empty"><p>Aucune inscription</p></div></td></tr>'}</tbody></table></div>
      </div>
    </div>`;
}

// ====================================================================
// SESSIONS
// ====================================================================
function renderSessions() {
  const search = state.search; const filt = state.sessFilter||'tous';
  let list = [...state.sessions];
  if (search) list = list.filter(s=>(s.titre+s.formateur).toLowerCase().includes(search));
  if (filt !== 'tous') list = list.filter(s=>s.statut===filt);

  const rows = list.map(s=>{
    const pct = Math.round((s.inscrits/s.places)*100);
    const sc = {Ouvert:'badge-green',Complet:'badge-red',Terminé:'badge-gray'}[s.statut]||'badge-blue';
    const fillCol = pct>=100?'var(--red)':pct>=80?'var(--yellow)':'var(--accent)';
    return `<tr>
      <td><strong>${highlight(s.titre,search)}</strong></td>
      <td>${formatDate(s.date)}</td>
      <td style="color:var(--muted)">${s.heure||'—'}</td>
      <td style="color:var(--muted)">${s.duree}h</td>
      <td>${highlight(s.formateur||'—',search)}</td>
      <td><div class="fill-bar"><div class="fill-bar-track"><div class="fill-bar-fill" style="width:${pct}%;background:${fillCol}"></div></div><span style="font-size:11px;color:var(--muted)">${s.inscrits}/${s.places}</span></div></td>
      <td style="color:var(--muted);font-size:12px">${s.prix?s.prix+' €':'—'}</td>
      <td style="color:var(--green);font-size:12px;font-weight:600">${s.inscrits&&s.prix?(s.inscrits*s.prix).toLocaleString('fr-FR')+' €':'—'}</td>
      <td><span class="badge ${sc}">${s.statut}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="detailSession('${s.id}')" title="Détail">👁</button>
        <button class="btn btn-ghost btn-sm" onclick="openSessionModal('${s.id}')" title="Modifier">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="duplicateSession('${s.id}')" title="Dupliquer">⎘</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSession('${s.id}')" title="Supprimer">🗑</button>
      </td>
    </tr>`;
  }).join('');

  const filtBtns = ['tous','Ouvert','Complet','Terminé'].map(f=>
    `<button class="tab ${filt===f?'active':''}" onclick="state.sessFilter='${f}';renderPage('sessions')">${f==='tous'?'Toutes':f}</button>`
  ).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div class="tabs">${filtBtns}</div>
      <button class="btn btn-primary" onclick="openSessionModal()">+ Nouveau créneau</button>
    </div>
    <div class="panel">
      <div class="panel-header"><div class="panel-title">Créneaux (${list.length})</div><button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Imprimer</button></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Formation</th><th>Date</th><th>Heure</th><th>Durée</th><th>Formateur</th><th>Remplissage</th><th>Prix</th><th>CA estimé</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${rows||`<tr><td colspan="10"><div class="empty"><div class="icon">📅</div><p>${search?'Aucun résultat':'Aucun créneau'}</p><button class="btn btn-primary" onclick="openSessionModal()">+ Créer</button></div></td></tr>`}</tbody>
      </table></div>
    </div>`;
}

function openSessionModal(id) {
  const s = id ? state.sessions.find(x=>x.id===id) : null;
  const f = s || { titre:'', date:'', heure:'09:00', duree:7, places:10, formateur:'', prix:290, statut:'Ouvert' };
  openModal(`
    <div class="modal-title">${s?'✏️ Modifier':'➕ Nouveau créneau'}</div>
    <div class="form-group"><label class="form-label">Titre *</label><input class="form-control" id="f-titre" value="${f.titre||''}" autofocus></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date *</label><input type="date" class="form-control" id="f-date" value="${f.date||''}"></div>
      <div class="form-group"><label class="form-label">Heure</label><input type="time" class="form-control" id="f-heure" value="${f.heure||'09:00'}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Durée (h)</label><input type="number" class="form-control" id="f-duree" value="${f.duree||7}" step="0.5"></div>
      <div class="form-group"><label class="form-label">Places</label><input type="number" class="form-control" id="f-places" value="${f.places||10}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Formateur</label><input class="form-control" id="f-form" value="${f.formateur||''}"></div>
      <div class="form-group"><label class="form-label">Prix (€)</label><input type="number" class="form-control" id="f-prix" value="${f.prix||0}"></div>
    </div>
    ${s?`<div class="form-group"><label class="form-label">Statut</label><select class="form-control" id="f-statut"><option ${f.statut==='Ouvert'?'selected':''}>Ouvert</option><option ${f.statut==='Complet'?'selected':''}>Complet</option><option ${f.statut==='Terminé'?'selected':''}>Terminé</option></select></div>`:''}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveSession('${id||''}')">Enregistrer</button>
    </div>`);
}

async function saveSession(id) {
  const titre = val('f-titre'), date = val('f-date');
  if (!titre||!date) { showToast('Titre et date requis','error'); return; }
  const payload = {
    titre, date, heure:val('f-heure'),
    duree:parseFloat(val('f-duree'))||7,
    places:parseInt(val('f-places'))||10,
    formateur:val('f-form'),
    prix:parseInt(val('f-prix'))||0,
    user_id: state.user?.id
  };
  if (id) {
    payload.statut = val('f-statut');
    const { error } = await supabase.from('sessions').update(payload).eq('id',id);
    if (error) { showToast('Erreur : '+error.message,'error'); return; }
    showToast('Créneau mis à jour ✓');
  } else {
    payload.statut = 'Ouvert'; payload.inscrits = 0;
    const { error } = await supabase.from('sessions').insert(payload);
    if (error) { showToast('Erreur : '+error.message,'error'); return; }
    showToast('Créneau créé ✓');
  }
  await loadSessions(); closeModal(); renderPage('sessions');
}

async function duplicateSession(id) {
  const s = state.sessions.find(x=>x.id===id);
  if (!s) return;
  const { id:_, created_at:__, ...fields } = s;
  const { error } = await supabase.from('sessions').insert({ ...fields, inscrits:0, statut:'Ouvert', date:'', user_id:state.user?.id });
  if (!error) { await loadSessions(); showToast('Dupliqué — mettez la date à jour','info'); renderPage('sessions'); }
}

async function deleteSession(id) {
  const s = state.sessions.find(x=>x.id===id);
  if (!s) return;
  const nbPart = state.participants.filter(p=>p.session_id===id).length;
  const msg = nbPart>0 ? `Supprimer "${s.titre}" ?\n⚠️ ${nbPart} participant(s) lié(s) seront détachés.` : `Supprimer "${s.titre}" ?`;
  if (!confirm(msg)) return;
  const { error } = await supabase.from('sessions').delete().eq('id',id);
  if (!error) { await loadAllData(); showToast('Créneau supprimé'); renderPage('sessions'); }
  else showToast('Erreur : '+error.message,'error');
}

function detailSession(id) {
  const s = state.sessions.find(x=>x.id===id);
  if (!s) return;
  const parts = state.participants.filter(p=>p.session_id===id);
  const pct = Math.round((s.inscrits/s.places)*100);
  const ca = state.paiements.filter(p=>p.session_id===id&&p.statut==='Encaissé').reduce((a,p)=>a+(p.montant||0),0);
  const partRows = parts.map(p=>`<tr><td><strong>${p.prenom} ${p.nom}</strong></td><td><a href="mailto:${p.email}" style="color:var(--blue);font-size:12px">${p.email}</a></td><td>${p.telephone||'—'}</td><td>${badgeStatut(p.statut)}</td></tr>`).join('');
  openModal(`<div style="width:680px;max-width:100%">
    <div class="modal-title">📅 ${s.titre}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Date</div><div class="detail-value">${formatDate(s.date)} à ${s.heure||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Formateur</div><div class="detail-value">${s.formateur||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Durée</div><div class="detail-value">${s.duree}h</div></div>
      <div class="detail-item"><div class="detail-label">Remplissage</div><div class="detail-value">${s.inscrits}/${s.places} (${pct}%)</div></div>
      <div class="detail-item"><div class="detail-label">Prix unitaire</div><div class="detail-value">${s.prix?s.prix+' €':'—'}</div></div>
      <div class="detail-item"><div class="detail-label">CA encaissé</div><div class="detail-value" style="color:var(--green)">${ca.toLocaleString('fr-FR')} €</div></div>
    </div>
    <div style="font-family:var(--font-display);font-size:13px;font-weight:700;margin-bottom:12px">Participants (${parts.length})</div>
    ${parts.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Statut</th></tr></thead><tbody>${partRows}</tbody></table></div>`:'<div class="empty"><p>Aucun participant</p></div>'}
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Fermer</button><button class="btn btn-primary" onclick="closeModal();showPage('participants')">Gérer →</button></div>
  </div>`);
}

// ====================================================================
// PARTICIPANTS
// ====================================================================
function renderParticipants() {
  const tab = state.partTab||'tous'; const search = state.search;
  let list = [...state.participants];
  if (tab!=='tous') list = list.filter(p=>p.statut===tab);
  if (search) list = list.filter(p=>(p.prenom+p.nom+p.email+(p.session_titre||'')).toLowerCase().includes(search));

  const rows = list.map(p=>`<tr>
    <td><strong>${highlight(p.prenom+' '+p.nom,search)}</strong>${p.notes?`<span style="font-size:10px;color:var(--muted);margin-left:6px" title="${p.notes}">📝</span>`:''}</td>
    <td><a href="mailto:${p.email}" style="color:var(--blue);font-size:12px">${highlight(p.email,search)}</a></td>
    <td style="color:var(--muted);font-size:12px">${p.telephone||'—'}</td>
    <td style="font-size:12px">${highlight(p.session_titre||'—',search)}</td>
    <td style="font-size:12px;color:var(--muted)">${formatDate(p.date_inscription)}</td>
    <td>${badgeStatut(p.statut)}</td>
    <td>${makeStatusDropdown(p.id,p.statut,statutPartCfg,'changeParticipantStatut')}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-ghost btn-sm" onclick="editParticipantModal('${p.id}')">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="deleteParticipant('${p.id}')">🗑</button>
    </td>
  </tr>`).join('');

  const tabs = ['tous','Confirmé','En attente','Annulé','Présent'].map(t=>
    `<button class="tab ${tab===t?'active':''}" onclick="state.partTab='${t}';renderPage('participants')">${t==='tous'?'Tous':t} (${t==='tous'?state.participants.length:state.participants.filter(p=>p.statut===t).length})</button>`
  ).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div class="tabs">${tabs}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="exportCSVParticipants()">📊 CSV</button>
        <button class="btn btn-primary" onclick="openParticipantModal()">+ Inscrire</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><div class="panel-title">${list.length} participant(s)</div></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Session</th><th>Inscription</th><th>Statut</th><th>Changer</th><th></th></tr></thead>
        <tbody>${rows||`<tr><td colspan="8"><div class="empty"><div class="icon">👥</div><p>${search?'Aucun résultat':'Aucun participant'}</p></div></td></tr>`}</tbody>
      </table></div>
    </div>`;
}

function openParticipantModal() {
  const sessOpts = state.sessions.filter(s=>s.statut==='Ouvert').map(s=>`<option value="${s.id}">${s.titre} (${s.places-s.inscrits} places)</option>`).join('');
  openModal(`
    <div class="modal-title">👤 Inscrire un participant</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Prénom *</label><input class="form-control" id="p-prenom" autofocus></div>
      <div class="form-group"><label class="form-label">Nom *</label><input class="form-control" id="p-nom"></div>
    </div>
    <div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-control" id="p-email"></div>
    <div class="form-group"><label class="form-label">Téléphone</label><input class="form-control" id="p-tel"></div>
    <div class="form-group"><label class="form-label">Session</label>
      <select class="form-control" id="p-session"><option value="">— Choisir —</option>${sessOpts}</select>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-control" id="p-notes" rows="2"></textarea></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveParticipant()">Inscrire</button>
    </div>`);
}

function editParticipantModal(id) {
  const p = state.participants.find(x=>x.id===id);
  if (!p) return;
  const sessOpts = state.sessions.map(s=>`<option value="${s.id}" ${s.id===p.session_id?'selected':''}>${s.titre}</option>`).join('');
  openModal(`
    <div class="modal-title">✏️ Modifier le participant</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Prénom *</label><input class="form-control" id="p-prenom" value="${p.prenom||''}" autofocus></div>
      <div class="form-group"><label class="form-label">Nom *</label><input class="form-control" id="p-nom" value="${p.nom||''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-control" id="p-email" value="${p.email||''}"></div>
    <div class="form-group"><label class="form-label">Téléphone</label><input class="form-control" id="p-tel" value="${p.telephone||''}"></div>
    <div class="form-group"><label class="form-label">Session</label><select class="form-control" id="p-session"><option value="">— Aucune —</option>${sessOpts}</select></div>
    <div class="form-group"><label class="form-label">Statut</label>
      <select class="form-control" id="p-statut">${['En attente','Confirmé','Annulé','Présent'].map(s=>`<option ${p.statut===s?'selected':''}>${s}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-control" id="p-notes" rows="2">${p.notes||''}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="updateParticipant('${id}')">Enregistrer</button>
    </div>`);
}

async function saveParticipant() {
  const prenom=val('p-prenom'),nom=val('p-nom'),email=val('p-email'),session_id=val('p-session');
  if (!prenom||!email) { showToast('Prénom et email requis','error'); return; }
  const sess = state.sessions.find(s=>s.id===session_id);
  const payload = { prenom, nom, email, telephone:val('p-tel'), session_id:session_id||null, session_titre:sess?.titre||null, notes:val('p-notes'), statut:'En attente', date_inscription:new Date().toISOString().split('T')[0], user_id:state.user?.id };
  const { data: newPart, error } = await supabase.from('participants').insert(payload).select().single();
  if (error) { showToast('Erreur : '+error.message,'error'); return; }
  if (sess) {
    await supabase.from('paiements').insert({ participant_id:newPart.id, participant_nom:`${prenom} ${nom}`, session_id:session_id, session_titre:sess.titre, montant:sess.prix||0, statut:'En attente', mode:'Virement', user_id:state.user?.id });
  }
  await loadAllData(); showToast('Participant inscrit ✓'); closeModal(); renderPage('participants');
}

async function updateParticipant(id) {
  const prenom=val('p-prenom'),nom=val('p-nom'),email=val('p-email'),session_id=val('p-session');
  if (!prenom||!email) { showToast('Prénom et email requis','error'); return; }
  const sess = state.sessions.find(s=>s.id===session_id);
  const { error } = await supabase.from('participants').update({ prenom, nom, email, telephone:val('p-tel'), session_id:session_id||null, session_titre:sess?.titre||null, statut:val('p-statut'), notes:val('p-notes') }).eq('id',id);
  if (!error) { await loadAllData(); showToast('Mis à jour ✓'); closeModal(); renderPage('participants'); }
  else showToast('Erreur : '+error.message,'error');
}

async function deleteParticipant(id) {
  const p = state.participants.find(x=>x.id===id);
  if (!p||!confirm(`Supprimer ${p.prenom} ${p.nom} ?`)) return;
  const { error } = await supabase.from('participants').delete().eq('id',id);
  if (!error) { await loadAllData(); showToast('Participant supprimé'); renderPage('participants'); }
  else showToast('Erreur : '+error.message,'error');
}

// ====================================================================
// PAIEMENTS
// ====================================================================
function renderPaiements() {
  const tab=state.paiTab||'tous'; const search=state.search;
  let list = [...state.paiements];
  if (tab!=='tous') list = list.filter(p=>p.statut===tab);
  if (search) list = list.filter(p=>(p.participant_nom+(p.session_titre||'')).toLowerCase().includes(search));

  const encaisse = state.paiements.filter(p=>p.statut==='Encaissé').reduce((a,p)=>a+(p.montant||0),0);
  const attente  = state.paiements.filter(p=>p.statut==='En attente').reduce((a,p)=>a+(p.montant||0),0);
  const rembourse= state.paiements.filter(p=>p.statut==='Remboursé').reduce((a,p)=>a+(p.montant||0),0);

  const rows = list.map(p=>`<tr>
    <td><strong>${highlight(p.participant_nom,search)}</strong></td>
    <td style="font-size:12px">${highlight(p.session_titre||'—',search)}</td>
    <td><strong style="color:${p.statut==='Encaissé'?'var(--green)':p.statut==='Remboursé'?'var(--red)':'var(--text)'}">${(p.montant||0).toLocaleString('fr-FR')} €</strong></td>
    <td style="color:var(--muted);font-size:12px">${p.mode||'—'}</td>
    <td style="font-size:12px">${formatDate(p.date_paiement)}</td>
    <td>${badgeStatutPai(p.statut)}</td>
    <td>${makeStatusDropdown(p.id,p.statut,statutPaiCfg,'changePaiementStatut')}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-ghost btn-sm" onclick="editPaiementModal('${p.id}')">✏️</button>
      ${p.statut==='En attente'?`<button class="btn btn-blue btn-sm" onclick="relancerPaiement('${p.id}')" title="Relance email">📧</button>`:''}
    </td>
  </tr>`).join('');

  const tabs = ['tous','Encaissé','En attente','Remboursé'].map(t=>
    `<button class="tab ${tab===t?'active':''}" onclick="state.paiTab='${t}';renderPage('paiements')">${t==='tous'?'Tous':t} (${t==='tous'?state.paiements.length:state.paiements.filter(p=>p.statut===t).length})</button>`
  ).join('');

  return `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="stat-card"><div class="stat-label">Encaissé</div><div class="stat-value green">${encaisse.toLocaleString('fr-FR')} €</div></div>
      <div class="stat-card"><div class="stat-label">En attente</div><div class="stat-value yellow">${attente.toLocaleString('fr-FR')} €</div></div>
      <div class="stat-card"><div class="stat-label">Remboursé</div><div class="stat-value" style="color:var(--red)">${rembourse.toLocaleString('fr-FR')} €</div></div>
      <div class="stat-card"><div class="stat-label">Taux d'encaissement</div><div class="stat-value orange">${encaisse+attente>0?Math.round(encaisse/(encaisse+attente)*100):0}%</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div class="tabs">${tabs}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="relancerTousImpayés()">📧 Relancer tous</button>
        <button class="btn btn-ghost btn-sm" onclick="exportCSVPaiements()">📊 CSV</button>
        <button class="btn btn-primary btn-sm" onclick="openPaiementModal()">+ Paiement</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><div class="panel-title">${list.length} paiement(s)</div></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Participant</th><th>Session</th><th>Montant</th><th>Mode</th><th>Date</th><th>Statut</th><th>Changer</th><th>Actions</th></tr></thead>
        <tbody>${rows||`<tr><td colspan="8"><div class="empty"><p>${search?'Aucun résultat':'Aucun paiement'}</p></div></td></tr>`}</tbody>
      </table></div>
    </div>`;
}

function badgeStatutPai(s) {
  const map={'Encaissé':'badge-green','En attente':'badge-yellow','Remboursé':'badge-red'};
  return `<span class="badge ${map[s]||'badge-gray'}">${s||'—'}</span>`;
}

function editPaiementModal(id) {
  const p = state.paiements.find(x=>x.id===id);
  if (!p) return;
  openModal(`
    <div class="modal-title">✏️ Modifier le paiement</div>
    <div class="form-group"><label class="form-label">Participant</label><input class="form-control" value="${p.participant_nom}" disabled style="opacity:.6"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Montant (€)</label><input type="number" class="form-control" id="pai-montant" value="${p.montant||0}"></div>
      <div class="form-group"><label class="form-label">Mode</label>
        <select class="form-control" id="pai-mode">${['Virement','CB','Chèque'].map(m=>`<option ${p.mode===m?'selected':''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-control" id="pai-date" value="${p.date_paiement||''}"></div>
      <div class="form-group"><label class="form-label">Statut</label>
        <select class="form-control" id="pai-statut">${['En attente','Encaissé','Remboursé'].map(s=>`<option ${p.statut===s?'selected':''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="savePaiement('${id}')">Enregistrer</button>
    </div>`);
}

async function savePaiement(id) {
  const statut=val('pai-statut');
  const updates = { montant:parseInt(val('pai-montant'))||0, mode:val('pai-mode'), date_paiement:val('pai-date')||null, statut };
  const { error } = await supabase.from('paiements').update(updates).eq('id',id);
  if (!error) { await loadPaiements(); showToast('Paiement mis à jour ✓'); closeModal(); renderPage('paiements'); }
  else showToast('Erreur : '+error.message,'error');
}

function openPaiementModal() {
  const partOpts = state.participants.map(p=>`<option value="${p.id}">${p.prenom} ${p.nom}</option>`).join('');
  openModal(`
    <div class="modal-title">➕ Paiement manuel</div>
    <div class="form-group"><label class="form-label">Participant</label><select class="form-control" id="pai-part"><option value="">— Choisir —</option>${partOpts}</select></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Montant (€)</label><input type="number" class="form-control" id="pai-montant" value="0"></div>
      <div class="form-group"><label class="form-label">Mode</label><select class="form-control" id="pai-mode"><option>Virement</option><option>CB</option><option>Chèque</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-control" id="pai-date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group"><label class="form-label">Statut</label><select class="form-control" id="pai-statut"><option>En attente</option><option>Encaissé</option></select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="createPaiement()">Créer</button>
    </div>`);
}

async function createPaiement() {
  const pid=val('pai-part'); if (!pid) { showToast('Participant requis','error'); return; }
  const p = state.participants.find(x=>x.id===pid);
  const { error } = await supabase.from('paiements').insert({ participant_id:pid, participant_nom:`${p?.prenom||''} ${p?.nom||''}`.trim(), session_id:p?.session_id||null, session_titre:p?.session_titre||null, montant:parseInt(val('pai-montant'))||0, mode:val('pai-mode'), date_paiement:val('pai-date')||null, statut:val('pai-statut'), user_id:state.user?.id });
  if (!error) { await loadPaiements(); showToast('Paiement créé ✓'); closeModal(); renderPage('paiements'); }
  else showToast('Erreur : '+error.message,'error');
}

function relancerPaiement(id) {
  const p = state.paiements.find(x=>x.id===id); if (!p) return;
  const part = state.participants.find(x=>x.id===p.participant_id);
  const email = part?.email||'';
  const sujet = encodeURIComponent(`Relance paiement — ${p.session_titre||''}`);
  const corps = encodeURIComponent(`Bonjour ${part?.prenom||''},\n\nNous vous rappelons que le paiement de ${p.montant} € pour la formation "${p.session_titre}" est en attente.\n\nMode : ${p.mode}\n\nCordialement`);
  window.open(`mailto:${email}?subject=${sujet}&body=${corps}`);
}

function relancerTousImpayés() {
  const impayés = state.paiements.filter(p=>p.statut==='En attente');
  if (!impayés.length) { showToast('Aucun impayé','info'); return; }
  if (!confirm(`Ouvrir ${impayés.length} email(s) de relance ?`)) return;
  impayés.forEach((p,i)=>setTimeout(()=>relancerPaiement(p.id),i*400));
}

// ====================================================================
// FORMULAIRE PUBLIC
// ====================================================================
function renderInscription() {
  const sessOpts = state.sessions.filter(s=>s.statut==='Ouvert').map(s=>
    `<option value="${s.id}">${s.titre} — ${formatDate(s.date)} (${s.places-s.inscrits} places)</option>`).join('');
  return `
    <div style="max-width:560px;margin:0 auto">
      <div class="panel">
        <div class="panel-header"><div class="panel-title">✍️ Formulaire d'inscription public</div></div>
        <div class="panel-body">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Prénom *</label><input class="form-control" id="pub-prenom"></div>
            <div class="form-group"><label class="form-label">Nom *</label><input class="form-control" id="pub-nom"></div>
          </div>
          <div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-control" id="pub-email"></div>
          <div class="form-group"><label class="form-label">Téléphone</label><input class="form-control" id="pub-tel"></div>
          <div class="form-group"><label class="form-label">Formation *</label>
            <select class="form-control" id="pub-session"><option value="">— Choisir —</option>${sessOpts}</select>
          </div>
          <div class="form-group"><label class="form-label">Message</label><textarea class="form-control" id="pub-msg" rows="3"></textarea></div>
          <button class="btn btn-primary" style="width:100%;padding:13px;font-size:14px" onclick="submitInscription()">Envoyer ma demande</button>
        </div>
      </div>
    </div>`;
}

async function submitInscription() {
  const prenom=val('pub-prenom'),nom=val('pub-nom'),email=val('pub-email'),session_id=val('pub-session');
  if (!prenom||!email||!session_id) { showToast('Champs obligatoires manquants','error'); return; }
  const sess = state.sessions.find(s=>s.id===session_id);
  const { data:newPart, error } = await supabase.from('participants').insert({ prenom,nom,email,telephone:val('pub-tel'),session_id,session_titre:sess?.titre,notes:val('pub-msg'),statut:'En attente',date_inscription:new Date().toISOString().split('T')[0],user_id:state.user?.id }).select().single();
  if (!error&&sess) {
    await supabase.from('paiements').insert({ participant_id:newPart.id,participant_nom:`${prenom} ${nom}`,session_id,session_titre:sess.titre,montant:sess.prix||0,statut:'En attente',mode:'Virement',user_id:state.user?.id });
  }
  await loadAllData(); showToast('Inscription enregistrée ✓'); renderPage('inscription');
}

// ====================================================================
// IMPORT / EXPORT
// ====================================================================
function renderImport() {
  return `
    <div style="max-width:640px;margin:0 auto">
      <div class="panel">
        <div class="panel-header"><div class="panel-title">⬆️ Importer des données JSON</div></div>
        <div class="panel-body">
          <div class="import-zone" id="drop-zone" onclick="document.getElementById('file-input').click()" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleFileDrop(event)">
            <div class="icon">📂</div>
            <p><strong>Cliquez ou déposez un fichier JSON</strong></p>
            <p style="margin-top:6px;font-size:11px">Format FormaPilote v2 ou v3</p>
          </div>
          <input type="file" id="file-input" accept=".json" style="display:none" onchange="handleFileSelect(event)">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
            <button class="btn btn-ghost" onclick="exportJSON()">⬇️ Exporter JSON</button>
            <button class="btn btn-ghost" onclick="exportCSVAll()">📊 Exporter CSV complet</button>
          </div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;font-size:11px;color:var(--muted)">
            <strong style="color:var(--text)">Raccourcis clavier</strong><br><br>
            <kbd class="kbd">⌘N</kbd> Nouveau · <kbd class="kbd">⌘F</kbd> Rechercher · <kbd class="kbd">Esc</kbd> Fermer
          </div>
        </div>
      </div>
    </div>`;
}

function handleFileDrop(e) { e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f) importFile(f); }
function handleFileSelect(e) { const f=e.target.files[0]; if(f) importFile(f); }

async function importFile(file) {
  if (!file.name.endsWith('.json')) { showToast('Fichier JSON uniquement','error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      const s=data.sessions||[], p=data.participants||[], pay=data.paiements||[];
      if (!confirm(`Importer ${s.length} sessions, ${p.length} participants, ${pay.length} paiements dans Supabase ?`)) return;
      showToast('Import en cours…','info');
      if (s.length) { const rows=s.map(x=>({...x.fields,user_id:state.user?.id})); await supabase.from('sessions').insert(rows); }
      if (p.length) { const rows=p.map(x=>({...x.fields,nom:x.fields.Nom,prenom:x.fields.Prenom,email:x.fields.Email,telephone:x.fields.Telephone,session_titre:x.fields.Session,statut:x.fields.Statut,date_inscription:x.fields.DateInscription,notes:x.fields.Notes||'',user_id:state.user?.id})); await supabase.from('participants').insert(rows); }
      await loadAllData(); showToast('Import réussi ✓'); showPage('dashboard');
    } catch(err) { showToast('Fichier invalide : '+err.message,'error'); }
  };
  reader.readAsText(file);
}

function exportJSON() {
  const data = { sessions:state.sessions, participants:state.participants, paiements:state.paiements, exportedAt:new Date().toISOString() };
  downloadBlob(JSON.stringify(data,null,2),`formapilote-${today()}.json`,'application/json');
  showToast('Export JSON ✓');
}

function exportCSVAll() {
  const rows=[['Type','Prénom','Nom','Email','Téléphone','Session','Statut','Date','Montant','Mode']];
  state.participants.forEach(p=>rows.push(['Participant',p.prenom,p.nom,p.email,p.telephone||'',p.session_titre||'',p.statut,p.date_inscription||'','','']));
  state.paiements.forEach(p=>rows.push(['Paiement','','',p.participant_nom,'',p.session_titre||'',p.statut,p.date_paiement||'',p.montant,p.mode]));
  downloadCSVRows(rows,`formapilote-complet-${today()}.csv`);
}

function exportCSVParticipants() {
  const rows=[['Prénom','Nom','Email','Téléphone','Session','Statut','Date inscription','Notes']];
  state.participants.forEach(p=>rows.push([p.prenom,p.nom,p.email,p.telephone||'',p.session_titre||'',p.statut,p.date_inscription||'',p.notes||'']));
  downloadCSVRows(rows,`participants-${today()}.csv`);
  showToast('CSV participants ✓');
}

function exportCSVPaiements() {
  const rows=[['Participant','Session','Montant','Mode','Date','Statut']];
  state.paiements.forEach(p=>rows.push([p.participant_nom,p.session_titre||'',p.montant,p.mode,p.date_paiement||'',p.statut]));
  downloadCSVRows(rows,`paiements-${today()}.csv`);
  showToast('CSV paiements ✓');
}

function downloadCSVRows(rows,filename) {
  const csv="\ufeff"+rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadBlob(csv,filename,'text/csv;charset=utf-8;');
}
function downloadBlob(content,filename,type) {
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

// ====================================================================
// HELPERS
// ====================================================================
function val(id) { return (document.getElementById(id)||{}).value||''; }
function today() { return new Date().toISOString().split('T')[0]; }
function formatDate(d) {
  if (!d) return '—';
  const dt=new Date(d+'T00:00:00');
  return isNaN(dt)?d:dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
}
function badgeStatut(s) {
  const map={'Confirmé':'badge-green','En attente':'badge-yellow','Annulé':'badge-red','Présent':'badge-blue'};
  return `<span class="badge ${map[s]||'badge-gray'}">${s||'—'}</span>`;
}

function openModal(html) {
  document.getElementById('modal-inner').innerHTML = html;
  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.querySelector('#modal-inner [autofocus]')?.focus(),100);
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
function handleModalClick(e) { if(e.target===document.getElementById('modal')) closeModal(); }

let toastTimer;
function showToast(msg,type='success') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast show'+(type?' '+type:'');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3500);
}

function showSaveIndicator() {
  const ind=document.getElementById('save-indicator');
  if(ind){ind.classList.add('show');setTimeout(()=>ind.classList.remove('show'),2000);}
}

// ── INIT ──
init();
