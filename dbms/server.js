// ============================================================
// Event Management App — Express.js Backend
// Stack: Node.js + Express + mysql2 + bcryptjs + jsonwebtoken
// ============================================================
// npm install express mysql2 bcryptjs jsonwebtoken dotenv cors

import express from 'express';
import mysql   from 'mysql2/promise';
import bcrypt  from 'bcryptjs';
import jwt     from 'jsonwebtoken';
import dotenv  from 'dotenv';
import cors    from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// ── Serve Static Frontend ────────────────────────────────────
app.use(express.static(join(__dirname, 'public')));

// ── DB Connection Pool ───────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'event_mgmt',
  waitForConnections: true,
  connectionLimit: 10,
});

// ── Auth Middleware ──────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /auth/register
app.post('/auth/register', async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const userRole = role || 'participant';
    const approved = userRole === 'organizer' ? false : true;
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, phone, password, role, approved) VALUES (?,?,?,?,?,?)',
      [name, email, phone || null, hash, userRole, approved]
    );
    const msg = userRole === 'organizer'
      ? 'Registration submitted! Your organizer account needs admin approval before you can log in.'
      : 'User registered';
    res.status(201).json({ id: result.insertId, message: msg, needsApproval: !approved });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid credentials' });

  if (user.role === 'organizer' && !user.approved)
    return res.status(403).json({ error: 'Your organizer account is pending admin approval. Please wait for approval before logging in.' });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// GET /auth/me — get current user info from token
app.get('/auth/me', auth, async (req, res) => {
  const [[user]] = await pool.execute(
    'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});
// ============================================================
// ADMIN ROUTES
// ============================================================

// GET /admin/pending-organizers — list all unapproved organizer accounts (admin only)
app.get('/admin/pending-organizers', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, created_at FROM users WHERE role = ? AND approved = ?',
    ['organizer', false]
  );
  res.json(rows);
});

// GET /admin/users — list all users (admin only)
app.get('/admin/users', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, approved, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(rows);
});

// PATCH /admin/approve-organizer/:id — approve an organizer (admin only)
app.patch('/admin/approve-organizer/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  const [result] = await pool.execute(
    'UPDATE users SET approved = true WHERE id = ? AND role = ? AND approved = ?',
    [req.params.id, 'organizer', false]
  );
  if (result.affectedRows === 0)
    return res.status(404).json({ error: 'No pending organizer found with that ID' });
  res.json({ message: 'Organizer approved successfully' });
});

// DELETE /admin/reject-organizer/:id — reject (delete) a pending organizer (admin only)
app.delete('/admin/reject-organizer/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  const [result] = await pool.execute(
    'DELETE FROM users WHERE id = ? AND role = ? AND approved = ?',
    [req.params.id, 'organizer', false]
  );
  if (result.affectedRows === 0)
    return res.status(404).json({ error: 'No pending organizer found with that ID' });
  res.json({ message: 'Organizer request rejected' });
});

// ============================================================
// DASHBOARD STATS
// ============================================================

app.get('/dashboard/stats', auth, async (req, res) => {
  try {
    const [[eventStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_events,
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_events,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_events,
         SUM(CASE WHEN start_time > NOW() AND status = 'published' THEN 1 ELSE 0 END) AS upcoming_events
       FROM events`
    );

    const [[rsvpStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_rsvps,
         SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_rsvps,
         SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlisted_rsvps
       FROM rsvp`
    );

    const [[userStats]] = await pool.execute(
      'SELECT COUNT(*) AS total_users FROM users'
    );

    const [[locationStats]] = await pool.execute(
      'SELECT COUNT(*) AS total_locations FROM locations'
    );

    res.json({
      events: eventStats,
      rsvps: rsvpStats,
      users: userStats,
      locations: locationStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// LOCATION ROUTES
// ============================================================

// POST /locations
app.post('/locations', auth, async (req, res) => {
  const { venue_name, address, city, state, country, zip_code, lat, lng } = req.body;
  const [result] = await pool.execute(
    `INSERT INTO locations (venue_name, address, city, state, country, zip_code, lat, lng)
     VALUES (?,?,?,?,?,?,?,?)`,
    [venue_name, address, city, state || null, country || 'India', zip_code || null, lat || null, lng || null]
  );
  res.status(201).json({ id: result.insertId });
});

// GET /locations
app.get('/locations', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM locations ORDER BY city');
  res.json(rows);
});

// ============================================================
// EVENT ROUTES
// ============================================================

// POST /events  — create event + details in one request (organizers only)
app.post('/events', auth, async (req, res) => {
  if (req.user.role !== 'organizer' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only organizers can create events' });
  const {
    title, location_id, start_time, end_time, capacity, status,
    description, banner_url, tags, category, is_paid, ticket_price
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [evtResult] = await conn.execute(
      `INSERT INTO events (organizer_id, location_id, title, start_time, end_time, capacity, status)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.id, location_id, title, start_time, end_time, capacity || 100, status || 'draft']
    );
    const eventId = evtResult.insertId;

    await conn.execute(
      `INSERT INTO event_details (event_id, description, banner_url, tags, category, is_paid, ticket_price)
       VALUES (?,?,?,?,?,?,?)`,
      [eventId, description || null, banner_url || null, tags || null,
       category || 'other', is_paid || false, ticket_price || 0]
    );

    await conn.commit();
    res.status(201).json({ id: eventId, message: 'Event created' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /events  — list all published events with location + details
app.get('/events', async (req, res) => {
  const { status, city, category } = req.query;
  let query = `
    SELECT e.*, u.name AS organizer_name,
           l.venue_name, l.city, l.address,
           d.description, d.category, d.is_paid, d.ticket_price, d.tags, d.banner_url,
           (SELECT COUNT(*) FROM rsvp r WHERE r.event_id = e.id AND r.status = 'confirmed') AS confirmed_count
    FROM events e
    JOIN users        u ON u.id = e.organizer_id
    JOIN locations    l ON l.id = e.location_id
    LEFT JOIN event_details d ON d.event_id = e.id
    WHERE 1=1
  `;
  const params = [];
  if (status)   { query += ' AND e.status = ?';    params.push(status); }
  if (city)     { query += ' AND l.city LIKE ?';   params.push(`%${city}%`); }
  if (category) { query += ' AND d.category = ?';  params.push(category); }
  query += ' ORDER BY e.start_time ASC';

  const [rows] = await pool.execute(query, params);
  res.json(rows);
});

// GET /events/:id  — single event with RSVP count
app.get('/events/:id', async (req, res) => {
  const [[event]] = await pool.execute(
    `SELECT e.*, u.name AS organizer_name,
            l.venue_name, l.city, l.state, l.address, l.lat, l.lng,
            d.description, d.category, d.is_paid, d.ticket_price, d.tags, d.banner_url,
            (SELECT COUNT(*) FROM rsvp r WHERE r.event_id = e.id AND r.status = 'confirmed') AS confirmed_count
     FROM events e
     JOIN users        u ON u.id = e.organizer_id
     JOIN locations    l ON l.id = e.location_id
     LEFT JOIN event_details d ON d.event_id = e.id
     WHERE e.id = ?`, [req.params.id]
  );
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// PATCH /events/:id  — update status or details
app.patch('/events/:id', auth, async (req, res) => {
  const { status, title, capacity } = req.body;
  await pool.execute(
    `UPDATE events SET
       status   = COALESCE(?, status),
       title    = COALESCE(?, title),
       capacity = COALESCE(?, capacity)
     WHERE id = ? AND organizer_id = ?`,
    [status || null, title || null, capacity || null, req.params.id, req.user.id]
  );
  res.json({ message: 'Event updated' });
});

// DELETE /events/:id
app.delete('/events/:id', auth, async (req, res) => {
  await pool.execute(
    'DELETE FROM events WHERE id = ? AND organizer_id = ?',
    [req.params.id, req.user.id]
  );
  res.json({ message: 'Event deleted' });
});

// ============================================================
// RSVP (ATTENDEE) ROUTES
// ============================================================

// POST /events/:id/rsvp  — user registers for an event
app.post('/events/:id/rsvp', auth, async (req, res) => {
  const eventId = req.params.id;
  const userId  = req.user.id;

  // Check capacity
  const [[event]] = await pool.execute(
    `SELECT e.capacity,
            (SELECT COUNT(*) FROM rsvp r WHERE r.event_id = e.id AND r.status = 'confirmed') AS confirmed
     FROM events e WHERE e.id = ?`, [eventId]
  );
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const rsvpStatus = event.confirmed >= event.capacity ? 'waitlisted' : 'confirmed';

  try {
    const [result] = await pool.execute(
      'INSERT INTO rsvp (event_id, user_id, status, notes) VALUES (?,?,?,?)',
      [eventId, userId, rsvpStatus, req.body.notes || null]
    );
    res.status(201).json({ id: result.insertId, status: rsvpStatus });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'You have already RSVP\'d to this event' });
    res.status(500).json({ error: err.message });
  }
});

// GET /events/:id/rsvp/me — check current user's RSVP status
app.get('/events/:id/rsvp/me', auth, async (req, res) => {
  const [[rsvp]] = await pool.execute(
    'SELECT * FROM rsvp WHERE event_id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  res.json(rsvp || null);
});

// GET /events/:id/attendees  — list all confirmed attendees
app.get('/events/:id/attendees', auth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT r.id, r.status, r.registered_at, r.notes,
            u.name, u.email, u.phone
     FROM rsvp r
     JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ?
     ORDER BY r.registered_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

// PATCH /events/:id/rsvp  — cancel or update your own RSVP
app.patch('/events/:id/rsvp', auth, async (req, res) => {
  const { status } = req.body;
  await pool.execute(
    'UPDATE rsvp SET status = ? WHERE event_id = ? AND user_id = ?',
    [status, req.params.id, req.user.id]
  );
  res.json({ message: 'RSVP updated' });
});

// GET /users/:id/events  — all events a user has RSVP'd to
app.get('/users/:id/events', auth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT e.id, e.title, e.start_time, e.end_time, e.status, e.capacity,
            r.status AS rsvp_status, r.registered_at,
            l.venue_name, l.city,
            d.category, d.is_paid, d.ticket_price,
            (SELECT COUNT(*) FROM rsvp r2 WHERE r2.event_id = e.id AND r2.status = 'confirmed') AS confirmed_count
     FROM rsvp r
     JOIN events    e ON e.id = r.event_id
     JOIN locations l ON l.id = e.location_id
     LEFT JOIN event_details d ON d.event_id = e.id
     WHERE r.user_id = ?
     ORDER BY e.start_time ASC`,
    [req.params.id]
  );
  res.json(rows);
});

// ============================================================
// SPA Fallback — serve index.html for unknown routes
// ============================================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/events') ||
      req.path.startsWith('/locations') || req.path.startsWith('/users') ||
      req.path.startsWith('/dashboard') || req.path.startsWith('/admin')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
