// Shared UI Logic
const CATEGORY_ICONS = { conference:'🎤', workshop:'🔧', meetup:'🤝', concert:'🎵', sports:'⚽', webinar:'💻', other:'📌' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}
function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}
function formatDateTime(d) { return `${formatDate(d)} · ${formatTime(d)}`; }
function timeUntil(d) {
  const diff = new Date(d) - new Date();
  if (diff < 0) return 'Past';
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d left`;
  const hrs = Math.floor(diff / 3600000);
  return `${hrs}h left`;
}

// Toast
function ensureToastContainer() {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  return c;
}
function showToast(msg, type = 'info') {
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; setTimeout(() => t.remove(), 300); }, 3500);
}

// Sidebar
function renderSidebar(activePage) {
  const user = getUser();
  if (!user) return '';
  const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';
  const isOrganizer = user.role === 'organizer' || user.role === 'admin';
  const isAdmin = user.role === 'admin';
  const links = [
    { href:'/dashboard.html', icon:'📊', label:'Dashboard', id:'dashboard' },
    ...(isOrganizer ? [{ href:'/create-event.html', icon:'➕', label:'Create Event', id:'create-event' }] : []),
    { href:'/my-events.html', icon:'🎟️', label:'My RSVPs', id:'my-events' },
    { href:'/profile.html', icon:'👤', label:'Profile', id:'profile' },
    ...(isAdmin ? [{ href:'/admin.html', icon:'🛡️', label:'Admin Panel', id:'admin' }] : []),
  ];
  return `
    <div class="sidebar-backdrop" onclick="toggleSidebar()"></div>
    <button class="mobile-toggle" onclick="toggleSidebar()">☰</button>
    <aside class="sidebar">
      <div class="sidebar-brand"><h2>EventHub</h2><span>Management Platform</span></div>
      <nav class="sidebar-nav">
        ${links.map(l => `<a href="${l.href}" class="nav-link ${activePage === l.id ? 'active' : ''}"><span class="icon">${l.icon}</span>${l.label}</a>`).join('')}
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">${initial}</div>
          <div><div class="user-name">${user.name}</div><div class="user-role">${user.role}</div></div>
        </div>
        <button class="btn btn-secondary btn-block btn-sm" style="margin-top:10px" onclick="logout()">🚪 Logout</button>
      </div>
    </aside>`;
}

function initPage(activePage) {
  if (!requireAuth()) return false;
  const sidebar = renderSidebar(activePage);
  const wrapper = document.getElementById('app');
  if (wrapper) wrapper.insertAdjacentHTML('afterbegin', sidebar);
  return true;
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-backdrop').classList.toggle('show');
}

function renderEventCard(e) {
  const icon = CATEGORY_ICONS[e.category] || '📌';
  const isPast = new Date(e.start_time) < new Date();
  return `
    <div class="event-card" onclick="window.location.href='/event.html?id=${e.id}'">
      <div class="event-card-banner">${e.banner_url ? `<img src="${e.banner_url}" alt="${e.title}">` : icon}</div>
      <div class="event-card-body">
        <h3>${e.title}</h3>
        <div class="event-meta">
          <div class="event-meta-item"><span class="icon">📅</span>${formatDate(e.start_time)} · ${formatTime(e.start_time)}</div>
          <div class="event-meta-item"><span class="icon">📍</span>${e.venue_name}, ${e.city}</div>
          <div class="event-meta-item"><span class="icon">👤</span>by ${e.organizer_name}</div>
        </div>
      </div>
      <div class="event-card-footer">
        <span class="badge badge-${e.status}">${e.status}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge badge-${e.is_paid ? 'paid' : 'free'}">${e.is_paid ? '₹'+e.ticket_price : 'Free'}</span>
          <span style="font-size:12px;color:var(--text-muted)">${e.confirmed_count || 0}/${e.capacity} RSVPs</span>
        </div>
      </div>
    </div>`;
}

function showLoading(el) { el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>'; }
function showEmpty(el, icon, title, desc, actionHtml = '') {
  el.innerHTML = `<div class="empty-state"><div class="icon">${icon}</div><h3>${title}</h3><p>${desc}</p>${actionHtml}</div>`;
}
