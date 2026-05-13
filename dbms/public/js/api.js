// API Helper Module
const API_BASE = window.location.origin;

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function removeToken() { localStorage.removeItem('token'); }
function getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function setUser(u) { localStorage.setItem('user', JSON.stringify(u)); }
function removeUser() { localStorage.removeItem('user'); }
function isLoggedIn() { return !!getToken(); }
function logout() { removeToken(); removeUser(); window.location.href = '/index.html'; }

function requireAuth() {
  if (!isLoggedIn()) { window.location.href = '/index.html'; return false; }
  return true;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json();
  
  if (!res.ok) {
    if (res.status === 401) { removeToken(); removeUser(); }
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

const API = {
  // Auth
  login: (email, password) => api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data) => api('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => api('/auth/me'),
  
  // Dashboard
  stats: () => api('/dashboard/stats'),
  
  // Events
  getEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/events${q ? '?' + q : ''}`);
  },
  getEvent: (id) => api(`/events/${id}`),
  createEvent: (data) => api('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id, data) => api(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEvent: (id) => api(`/events/${id}`, { method: 'DELETE' }),
  
  // Locations
  getLocations: () => api('/locations'),
  createLocation: (data) => api('/locations', { method: 'POST', body: JSON.stringify(data) }),
  
  // RSVP
  rsvp: (eventId, notes) => api(`/events/${eventId}/rsvp`, { method: 'POST', body: JSON.stringify({ notes }) }),
  myRsvp: (eventId) => api(`/events/${eventId}/rsvp/me`),
  updateRsvp: (eventId, status) => api(`/events/${eventId}/rsvp`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getAttendees: (eventId) => api(`/events/${eventId}/attendees`),
  getUserEvents: (userId) => api(`/users/${userId}/events`),

  // Admin
  pendingOrganizers: () => api('/admin/pending-organizers'),
  getAllUsers: () => api('/admin/users'),
  approveOrganizer: (id) => api(`/admin/approve-organizer/${id}`, { method: 'PATCH' }),
  rejectOrganizer: (id) => api(`/admin/reject-organizer/${id}`, { method: 'DELETE' }),
};
