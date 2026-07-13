// ============================================================
// CareSync Backend Server
// Node + Express + PostgreSQL (pg)
// Run with: npm install && npm run dev   (see README.md)
// ============================================================

require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const SALT_ROUNDS = 12;
const HEARTBEAT_GRACE_MS = 20 * 60 * 1000; // 20 min grace window (interval is 15 min)

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'caresync',
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

// ------------------------------------------------------------
// Auth middleware
// ------------------------------------------------------------

function authenticateChild(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'child') {
      return res.status(403).json({ error: 'Child account required' });
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function authenticateParentDevice(req, res, next) {
  const deviceToken = req.headers['x-device-token'];
  if (!deviceToken) {
    return res.status(401).json({ error: 'Missing device token' });
  }
  try {
    const result = await pool.query(
      `SELECT id FROM users WHERE device_token = $1 AND role = 'parent'`,
      [deviceToken]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unrecognized device token' });
    }
    req.parentId = result.rows[0].id;
    next();
  } catch (err) {
    console.error('Device auth error:', err);
    return res.status(500).json({ error: 'Internal authentication error' });
  }
}

// ------------------------------------------------------------
// Health check
// ------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ------------------------------------------------------------
// ROUTE: Child registration
// ------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (role, name, email, password_hash)
       VALUES ('child', $1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, role: 'child' }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// ------------------------------------------------------------
// ROUTE: Child login
// ------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const result = await pool.query(
      `SELECT id, name, password_hash FROM users WHERE email = $1 AND role = 'child'`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ sub: user.id, role: 'child' }, JWT_SECRET, { expiresIn: '30d' });

    // Also return the paired parent id, if any, so the client can route directly
    const paired = await pool.query(`SELECT id FROM users WHERE paired_user_id = $1`, [user.id]);
    const parentId = paired.rows.length > 0 ? paired.rows[0].id : null;

    res.json({ user: { id: user.id, name: user.name }, token, parentId });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// ------------------------------------------------------------
// ROUTE: Child generates a 6-digit pairing code
// ------------------------------------------------------------
app.post('/api/pairing/generate-code', authenticateChild, async (req, res) => {
  try {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `UPDATE users SET join_code = $1, join_code_expires_at = $2 WHERE id = $3`,
      [code, expiresAt, req.userId]
    );
    res.json({ joinCode: code, expiresAt });
  } catch (err) {
    console.error('Generate code error:', err);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// ------------------------------------------------------------
// ROUTE: Parent tablet redeems the code — permanently binds accounts
// ------------------------------------------------------------
app.post('/api/pairing/redeem', async (req, res) => {
  const { joinCode, parentName } = req.body;
  if (!joinCode || !parentName) {
    return res.status(400).json({ error: 'joinCode and parentName are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const childResult = await client.query(
      `SELECT id, paired_user_id FROM users
       WHERE join_code = $1 AND role = 'child' AND join_code_expires_at > NOW()
       FOR UPDATE`,
      [joinCode]
    );
    if (childResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invalid or expired join code' });
    }
    const child = childResult.rows[0];
    if (child.paired_user_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This account is already paired' });
    }

    const deviceToken = crypto.randomBytes(32).toString('hex');
    const parentResult = await client.query(
      `INSERT INTO users (role, name, paired_user_id, device_token)
       VALUES ('parent', $1, $2, $3)
       RETURNING id`,
      [parentName, child.id, deviceToken]
    );
    const parentId = parentResult.rows[0].id;

    await client.query(
      `UPDATE users SET paired_user_id = $1, join_code = NULL, join_code_expires_at = NULL
       WHERE id = $2`,
      [parentId, child.id]
    );

    await client.query(
      `INSERT INTO system_state (parent_id, is_unlocked, last_unlock_date)
       VALUES ($1, FALSE, NULL)`,
      [parentId]
    );

    await client.query('COMMIT');
    res.status(201).json({ parentId, deviceToken });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Pairing redeem error:', err);
    res.status(500).json({ error: 'Failed to complete pairing' });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------
// ROUTE: Parent tablet fetches today's task list
// ------------------------------------------------------------
app.get('/api/tasks/today', authenticateParentDevice, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, category, recurrence_type, last_completed_date,
              (last_completed_date = CURRENT_DATE) AS completed_today
       FROM daily_tasks
       WHERE parent_id = $1
         AND (
           recurrence_type = 'daily'
           OR (recurrence_type = 'weekly' AND day_of_week = EXTRACT(DOW FROM CURRENT_DATE))
           OR (recurrence_type = 'once' AND specific_date = CURRENT_DATE)
         )
       ORDER BY category, title`,
      [req.parentId]
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ------------------------------------------------------------
// ROUTE: Toggle a task — tap completes, long-press resets
// ------------------------------------------------------------
app.post('/api/tasks/:taskId/toggle', authenticateParentDevice, async (req, res) => {
  const { taskId } = req.params;
  const { action } = req.body;

  if (!['complete', 'reset'].includes(action)) {
    return res.status(400).json({ error: "action must be 'complete' or 'reset'" });
  }

  try {
    const result = await pool.query(
      `UPDATE daily_tasks
       SET last_completed_date = CASE WHEN $3 = 'complete' THEN CURRENT_DATE ELSE NULL END
       WHERE id = $1 AND parent_id = $2
       RETURNING id, title, last_completed_date`,
      [taskId, req.parentId, action]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found for this device' });
    }
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('Toggle task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ------------------------------------------------------------
// ROUTE: Child creates a task
// ------------------------------------------------------------
app.post('/api/tasks', authenticateChild, async (req, res) => {
  const { parentId, title, category, recurrenceType, dayOfWeek, specificDate } = req.body;

  if (!parentId || !title || !recurrenceType) {
    return res.status(400).json({ error: 'parentId, title, and recurrenceType are required' });
  }
  if (recurrenceType === 'weekly' && dayOfWeek === undefined) {
    return res.status(400).json({ error: 'dayOfWeek is required for weekly tasks' });
  }
  if (recurrenceType === 'once' && !specificDate) {
    return res.status(400).json({ error: 'specificDate is required for one-time tasks' });
  }

  try {
    const ownership = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND paired_user_id = $2`,
      [parentId, req.userId]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not paired with this parent account' });
    }

    const result = await pool.query(
      `INSERT INTO daily_tasks
        (parent_id, created_by, title, category, recurrence_type, day_of_week, specific_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [parentId, req.userId, title, category || 'chore', recurrenceType, dayOfWeek ?? null, specificDate ?? null]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ------------------------------------------------------------
// ROUTE: List all tasks the child has configured for a parent
// (used by the "Manage Tasks" list view; not strictly required
// by the original spec but useful for a usable UI)
// ------------------------------------------------------------
app.get('/api/tasks', authenticateChild, async (req, res) => {
  const { parentId } = req.query;
  if (!parentId) {
    return res.status(400).json({ error: 'parentId query param is required' });
  }
  try {
    const ownership = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND paired_user_id = $2`,
      [parentId, req.userId]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not paired with this parent account' });
    }
    const result = await pool.query(
      `SELECT * FROM daily_tasks WHERE parent_id = $1 ORDER BY created_at DESC`,
      [parentId]
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// ------------------------------------------------------------
// ROUTE: Parent tablet heartbeat ping
// ------------------------------------------------------------
app.post('/api/heartbeat', authenticateParentDevice, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO system_state (parent_id, last_heartbeat_at)
       VALUES ($1, NOW())
       ON CONFLICT (parent_id)
       DO UPDATE SET last_heartbeat_at = NOW(), updated_at = NOW()`,
      [req.parentId]
    );
    res.status(204).send();
  } catch (err) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

// ------------------------------------------------------------
// ROUTE: Child dashboard reads connection + unlock status
// ------------------------------------------------------------
app.get('/api/status/:parentId', authenticateChild, async (req, res) => {
  const { parentId } = req.params;
  try {
    const ownership = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND paired_user_id = $2`,
      [parentId, req.userId]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not paired with this parent account' });
    }

    const result = await pool.query(
      `SELECT last_heartbeat_at, is_unlocked, last_unlock_date FROM system_state WHERE parent_id = $1`,
      [parentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No system state found for this parent' });
    }

    const state = result.rows[0];
    const isOnline = !!state.last_heartbeat_at &&
      (Date.now() - new Date(state.last_heartbeat_at).getTime()) < HEARTBEAT_GRACE_MS;

    const unlockedToday = state.is_unlocked &&
      state.last_unlock_date &&
      new Date(state.last_unlock_date).toDateString() === new Date().toDateString();

    res.json({
      online: isOnline,
      lastHeartbeatAt: state.last_heartbeat_at,
      unlockedToday,
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// ------------------------------------------------------------
// ROUTE: Child hits "Verify Call" — unlocks today's checklist view
// ------------------------------------------------------------
app.post('/api/unlock/:parentId', authenticateChild, async (req, res) => {
  const { parentId } = req.params;
  try {
    const ownership = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND paired_user_id = $2`,
      [parentId, req.userId]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not paired with this parent account' });
    }

    const result = await pool.query(
      `INSERT INTO system_state (parent_id, is_unlocked, last_unlock_date, unlocked_by)
       VALUES ($1, TRUE, CURRENT_DATE, $2)
       ON CONFLICT (parent_id)
       DO UPDATE SET is_unlocked = TRUE, last_unlock_date = CURRENT_DATE,
                     unlocked_by = $2, updated_at = NOW()
       RETURNING last_unlock_date`,
      [parentId, req.userId]
    );
    res.json({ unlocked: true, unlockDate: result.rows[0].last_unlock_date });
  } catch (err) {
    console.error('Unlock error:', err);
    res.status(500).json({ error: 'Failed to unlock daily checklist' });
  }
});

// ------------------------------------------------------------
// Global fallback error handler
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`CareSync server running on port ${PORT}`));
