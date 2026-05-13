-- ============================================================
-- Event Management App — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS event_mgmt;
USE event_mgmt;

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  phone      VARCHAR(20),
  password   VARCHAR(255)  NOT NULL,
  role       ENUM('organizer','participant','admin') DEFAULT 'participant',
  approved   BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Locations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  venue_name VARCHAR(200)  NOT NULL,
  address    VARCHAR(300),
  city       VARCHAR(100)  NOT NULL,
  state      VARCHAR(100),
  country    VARCHAR(100)  DEFAULT 'India',
  zip_code   VARCHAR(20),
  lat        DECIMAL(10,7),
  lng        DECIMAL(10,7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  organizer_id INT NOT NULL,
  location_id  INT NOT NULL,
  title        VARCHAR(250) NOT NULL,
  start_time   DATETIME     NOT NULL,
  end_time     DATETIME     NOT NULL,
  capacity     INT          DEFAULT 100,
  status       ENUM('draft','published','cancelled','completed') DEFAULT 'draft',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id)  REFERENCES locations(id) ON DELETE CASCADE
);

-- ── Event Details ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_details (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  event_id     INT NOT NULL UNIQUE,
  description  TEXT,
  banner_url   VARCHAR(500),
  tags         VARCHAR(300),
  category     ENUM('conference','workshop','meetup','concert','sports','webinar','other') DEFAULT 'other',
  is_paid      BOOLEAN DEFAULT FALSE,
  ticket_price DECIMAL(10,2) DEFAULT 0.00,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- ── RSVP ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsvp (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  event_id      INT NOT NULL,
  user_id       INT NOT NULL,
  status        ENUM('confirmed','waitlisted','cancelled') DEFAULT 'confirmed',
  notes         TEXT,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_rsvp (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_events_status     ON events(status);
CREATE INDEX idx_events_start      ON events(start_time);
CREATE INDEX idx_rsvp_event_status ON rsvp(event_id, status);
CREATE INDEX idx_locations_city    ON locations(city);
