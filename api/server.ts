import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { ApolloClient } from './integrations/apollo.js';
import { BrevoClient } from './integrations/brevo.js';
import { TwilioClient } from './integrations/twilio.js';
import { CalendlyClient } from './integrations/calendly.js';
import { startTelegramBot } from './telegram-bot.js';

const app = express();
const port = process.env.PORT || 4000;

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test',
  ssl: false,
});

// Auto-create / migrate database tables on startup
async function initDatabase() {
  try {
    // Create leads table with email optional (prospects from social media won't have emails)
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        website TEXT,
        notes TEXT,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        priority TEXT NOT NULL DEFAULT 'medium',
        ai_score INTEGER NOT NULL DEFAULT 0,
        signal_text TEXT,
        platform_link TEXT,
        linkedin_profile TEXT,
        position TEXT,
        assigned_to TEXT,
        ai_qualification TEXT,
        next_best_action TEXT,
        last_activity_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: if table existed with email NOT NULL, make it nullable
    await db.query(`ALTER TABLE leads ALTER COLUMN email DROP NOT NULL`).catch(() => {});

    // Migration: add new columns if missing
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS signal_text TEXT`).catch(() => {});
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform_link TEXT`).catch(() => {});

    // Drop unique constraint on email if it exists (prospects may not have emails)
    await db.query(`ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_key`).catch(() => {});

    console.log('✅ Database table ready');
  } catch (error) {
    console.error('Database init error:', error);
  }
}

await initDatabase();

// Initialize integration clients
const apollo = new ApolloClient(process.env.APOLLO_API_KEY!);
const brevo = new BrevoClient(process.env.BREVO_API_KEY!);
const twilio = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
  process.env.TWILIO_PHONE_NUMBER!
);
const calendly = new CalendlyClient(process.env.CALENDLY_API_KEY!, process.env.CALENDLY_LINK!);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== LEADS / PROSPECTS API ====================

// Create lead (used by Agent Zero to submit prospects)
app.post('/ai-crm/leads', async (req, res) => {
  try {
    const { name, email, phone, company, website, notes, source, score, signal_text, platform_link } = req.body;

    if (!name || !source) {
      res.status(400).json({ error: 'name and source are required' });
      return;
    }

    const result = await db.query(
      `INSERT INTO leads (name, email, phone, company, website, notes, source, status, priority, ai_score, signal_text, platform_link, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        name,
        email || null,
        phone || null,
        company || null,
        website || null,
        notes || null,
        source,
        'new',
        score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low',
        score || 0,
        signal_text || null,
        platform_link || null
      ]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Create lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List leads with optional filters
app.get('/ai-crm/leads', async (req, res) => {
  try {
    const { status, min_score, since, limit } = req.query;
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (min_score) {
      query += ` AND ai_score >= $${paramIdx++}`;
      params.push(parseInt(min_score as string));
    }
    if (since) {
      query += ` AND created_at >= $${paramIdx++}`;
      params.push(since);
    }

    query += ' ORDER BY ai_score DESC, created_at DESC';
    query += ` LIMIT $${paramIdx++}`;
    params.push(parseInt(limit as string) || 50);

    const result = await db.query(query, params);
    res.json({ leads: result.rows, count: result.rows.length });
  } catch (error: any) {
    console.error('List leads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single lead
app.get('/ai-crm/leads/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update lead status
app.patch('/ai-crm/leads/:id', async (req, res) => {
  try {
    const { status, notes, ai_score, next_best_action } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (notes) { updates.push(`notes = $${idx++}`); params.push(notes); }
    if (ai_score !== undefined) { updates.push(`ai_score = $${idx++}`); params.push(ai_score); }
    if (next_best_action) { updates.push(`next_best_action = $${idx++}`); params.push(next_best_action); }
    updates.push(`updated_at = NOW()`);

    if (updates.length <= 1) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    params.push(req.params.id);
    const result = await db.query(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Priority prospects (score 70+, last 24h)
app.get('/ai-crm/priority-prospects', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const result = await db.query(
      `SELECT * FROM leads WHERE ai_score >= 70 AND created_at >= $1 ORDER BY ai_score DESC`,
      [since]
    );
    res.json({ prospects: result.rows, count: result.rows.length });
  } catch (error: any) {
    console.error('Priority prospects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pipeline stats
app.get('/ai-crm/stats', async (req, res) => {
  try {
    const total = await db.query('SELECT COUNT(*) as count FROM leads');
    const byStatus = await db.query('SELECT status, COUNT(*) as count FROM leads GROUP BY status');
    const avgScore = await db.query('SELECT COALESCE(AVG(ai_score), 0) as avg FROM leads');
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thisWeek = await db.query('SELECT COUNT(*) as count FROM leads WHERE created_at >= $1', [weekAgo]);

    res.json({
      total: parseInt(total.rows[0].count),
      this_week: parseInt(thisWeek.rows[0].count),
      avg_score: Math.round(parseFloat(avgScore.rows[0].avg)),
      by_status: Object.fromEntries(byStatus.rows.map(r => [r.status, parseInt(r.count)])),
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== INTEGRATIONS API ====================

app.post('/integrations/apollo/search', async (req, res) => {
  try {
    const result = await apollo.searchPeople(req.body);
    res.json({ people: result.people, total: result.pagination.total_entries });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/integrations/brevo/send', async (req, res) => {
  try {
    const result = await brevo.sendEmail(req.body);
    res.json({ messageId: result.messageId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/integrations/brevo/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const stats = await brevo.getStatistics(days);
    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/integrations/twilio/send', async (req, res) => {
  try {
    const result = await twilio.sendSMS(req.body);
    res.json({ sid: result.sid, status: result.status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/integrations/calendly/link', async (req, res) => {
  res.json({ link: calendly.getBookingLink() });
});

app.get('/integrations/health', async (req, res) => {
  const integrations: Record<string, any> = {};
  try { await apollo.searchPeople({ per_page: 1 }); integrations.apollo = { status: 'connected' }; } catch (e: any) { integrations.apollo = { status: 'error', message: e.message }; }
  try { await brevo.getStatistics(1); integrations.brevo = { status: 'connected' }; } catch (e: any) { integrations.brevo = { status: 'error', message: e.message }; }
  try { await twilio.getRecentMessages(1); integrations.twilio = { status: 'connected' }; } catch (e: any) { integrations.twilio = { status: 'error', message: e.message }; }
  try { await calendly.getCurrentUser(); integrations.calendly = { status: 'connected' }; } catch (e: any) { integrations.calendly = { status: 'error', message: e.message }; }
  res.json({ integrations });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Tiger Bot API running on port ${port}`);
  console.log(`📍 Health: http://localhost:${port}/health`);
  console.log(`📍 Leads: http://localhost:${port}/ai-crm/leads`);
  console.log(`📍 Integrations: http://localhost:${port}/integrations/health`);
});

// Start Telegram bot
startTelegramBot(db);
