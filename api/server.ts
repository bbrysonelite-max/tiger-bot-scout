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

    // Create script_feedback table for tracking feedback on generated scripts
    await db.query(`
      CREATE TABLE IF NOT EXISTS script_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL DEFAULT 'default',
        prospect_id UUID REFERENCES leads(id) ON DELETE SET NULL,
        script_text TEXT NOT NULL,
        script_type TEXT DEFAULT 'approach',
        feedback TEXT CHECK (feedback IN ('no_response', 'got_reply', 'converted')),
        feedback_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create hive_learnings table for storing winning scripts across all users
    await db.query(`
      CREATE TABLE IF NOT EXISTS hive_learnings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        learning_type TEXT NOT NULL,
        content TEXT NOT NULL UNIQUE,
        context JSONB,
        success_count INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for efficient querying
    await db.query(`CREATE INDEX IF NOT EXISTS idx_script_feedback_tenant ON script_feedback(tenant_id)`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_script_feedback_feedback ON script_feedback(feedback)`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_hive_learnings_type ON hive_learnings(learning_type)`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_hive_learnings_success ON hive_learnings(success_count DESC)`).catch(() => {});

    console.log('✅ Database tables ready (leads, script_feedback, hive_learnings)');
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

// ==================== FEEDBACK & HIVE LEARNINGS API ====================

// Get script feedback stats
app.get('/ai-crm/feedback/stats', async (req, res) => {
  try {
    const totalScripts = await db.query('SELECT COUNT(*) as count FROM script_feedback');
    const withFeedback = await db.query('SELECT COUNT(*) as count FROM script_feedback WHERE feedback IS NOT NULL');
    const byFeedback = await db.query(`
      SELECT feedback, COUNT(*) as count
      FROM script_feedback
      WHERE feedback IS NOT NULL
      GROUP BY feedback
    `);
    const conversionRate = await db.query(`
      SELECT
        ROUND(100.0 * COUNT(CASE WHEN feedback = 'converted' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as rate
      FROM script_feedback
      WHERE feedback IS NOT NULL
    `);

    res.json({
      total_scripts: parseInt(totalScripts.rows[0].count),
      with_feedback: parseInt(withFeedback.rows[0].count),
      conversion_rate: parseFloat(conversionRate.rows[0].rate) || 0,
      by_feedback: Object.fromEntries(byFeedback.rows.map(r => [r.feedback, parseInt(r.count)])),
    });
  } catch (error: any) {
    console.error('Feedback stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent feedback entries (or all scripts if include_pending=true)
app.get('/ai-crm/feedback/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const includePending = req.query.include_pending === 'true';

    const whereClause = includePending ? '' : 'WHERE sf.feedback IS NOT NULL';
    const orderClause = includePending ? 'ORDER BY sf.created_at DESC' : 'ORDER BY sf.feedback_at DESC';

    const result = await db.query(`
      SELECT sf.*, l.name as prospect_name, l.source
      FROM script_feedback sf
      LEFT JOIN leads l ON sf.prospect_id = l.id
      ${whereClause}
      ${orderClause}
      LIMIT $1
    `, [limit]);
    res.json({ feedback: result.rows });
  } catch (error: any) {
    console.error('Recent feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit feedback for a script (from dashboard)
app.post('/ai-crm/feedback/:scriptId', async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { feedback } = req.body;

    if (!['no_response', 'got_reply', 'converted'].includes(feedback)) {
      res.status(400).json({ error: 'Invalid feedback type' });
      return;
    }

    // Update feedback
    await db.query(
      `UPDATE script_feedback SET feedback = $1, feedback_at = NOW() WHERE id = $2`,
      [feedback, scriptId]
    );

    // If successful, add to hive learnings
    if (feedback === 'got_reply' || feedback === 'converted') {
      const scriptRecord = await db.query(
        `SELECT sf.script_text, sf.script_type, l.source, l.notes
         FROM script_feedback sf
         LEFT JOIN leads l ON sf.prospect_id = l.id
         WHERE sf.id = $1`,
        [scriptId]
      );

      if (scriptRecord.rows.length > 0) {
        const { script_text, script_type, source, notes } = scriptRecord.rows[0];
        await db.query(
          `INSERT INTO hive_learnings (learning_type, content, context, success_count)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (content) DO UPDATE SET success_count = hive_learnings.success_count + 1`,
          [
            `winning_${script_type || 'approach'}`,
            script_text,
            JSON.stringify({ source, signal: notes, feedback })
          ]
        );
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate script from dashboard
app.post('/ai-crm/scripts/generate', async (req, res) => {
  try {
    const { prospect_name, prospect_id } = req.body;

    if (!prospect_name && !prospect_id) {
      res.status(400).json({ error: 'prospect_name or prospect_id required' });
      return;
    }

    // Find the prospect
    let prospect;
    if (prospect_id) {
      const result = await db.query('SELECT * FROM leads WHERE id = $1', [prospect_id]);
      prospect = result.rows[0];
    } else {
      const result = await db.query(
        `SELECT * FROM leads WHERE LOWER(name) LIKE LOWER($1) ORDER BY ai_score DESC LIMIT 1`,
        [`%${prospect_name}%`]
      );
      prospect = result.rows[0];
    }

    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Check if Anthropic API key is available
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      res.status(500).json({ error: 'AI service not configured' });
      return;
    }

    // Generate script using Anthropic
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are an expert network marketing recruiter. Generate a personalized approach message for this prospect.

Prospect: ${prospect.name}
Source: ${prospect.source}
Signal/Notes: ${prospect.notes || 'No specific signal'}
Score: ${prospect.ai_score}/100

Write:
1. A warm, natural opening message (2-3 sentences, like texting — not salesy)
2. A follow-up message if they respond positively
3. Top 2 likely objections and how to handle each

Keep it conversational and authentic. This is for Nu Skin wellness/health products in the Thai market. Messages should feel like they're from a real person, not a bot.`
      }]
    });

    const script = response.content[0].type === 'text' ? response.content[0].text : '';

    // Store the script
    const scriptRecord = await db.query(
      `INSERT INTO script_feedback (prospect_id, script_text, script_type, tenant_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [prospect.id, script, 'approach', process.env.DEFAULT_TENANT_ID || 'default']
    );

    res.json({
      script,
      script_id: scriptRecord.rows[0].id,
      prospect: {
        id: prospect.id,
        name: prospect.name,
        source: prospect.source,
        score: prospect.ai_score
      }
    });
  } catch (error: any) {
    console.error('Generate script error:', error);
    res.status(500).json({ error: 'Error generating script' });
  }
});

// Get hive learnings (winning scripts)
app.get('/ai-crm/hive/learnings', async (req, res) => {
  try {
    const type = req.query.type as string;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = 'SELECT * FROM hive_learnings';
    const params: any[] = [];
    let paramIdx = 1;

    if (type) {
      query += ` WHERE learning_type = $${paramIdx++}`;
      params.push(type);
    }

    query += ' ORDER BY success_count DESC LIMIT $' + paramIdx;
    params.push(limit);

    const result = await db.query(query, params);
    res.json({ learnings: result.rows, count: result.rows.length });
  } catch (error: any) {
    console.error('Hive learnings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get hive leaderboard (top performing scripts)
app.get('/ai-crm/hive/leaderboard', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        hl.id,
        hl.learning_type,
        hl.content,
        hl.context,
        hl.success_count,
        hl.created_at
      FROM hive_learnings hl
      ORDER BY hl.success_count DESC
      LIMIT 10
    `);
    res.json({ leaderboard: result.rows });
  } catch (error: any) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get source performance stats
app.get('/ai-crm/hive/source-performance', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l.source,
        COUNT(DISTINCT l.id) as prospects_found,
        COUNT(sf.id) as scripts_generated,
        COUNT(CASE WHEN sf.feedback = 'converted' THEN 1 END) as conversions,
        COUNT(CASE WHEN sf.feedback = 'got_reply' THEN 1 END) as replies,
        ROUND(AVG(l.ai_score), 1) as avg_score,
        ROUND(100.0 * COUNT(CASE WHEN sf.feedback IN ('converted', 'got_reply') THEN 1 END) /
          NULLIF(COUNT(CASE WHEN sf.feedback IS NOT NULL THEN 1 END), 0), 1) as success_rate
      FROM leads l
      LEFT JOIN script_feedback sf ON l.id = sf.prospect_id
      GROUP BY l.source
      ORDER BY conversions DESC, replies DESC
    `);

    res.json({ sources: result.rows });
  } catch (error: any) {
    console.error('Source performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get hive learning trends over time
app.get('/ai-crm/hive/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    // Daily script generation and feedback
    const scriptTrends = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as scripts_created,
        COUNT(CASE WHEN feedback IS NOT NULL THEN 1 END) as with_feedback,
        COUNT(CASE WHEN feedback = 'converted' THEN 1 END) as converted,
        COUNT(CASE WHEN feedback = 'got_reply' THEN 1 END) as got_reply
      FROM script_feedback
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Daily hive learnings added
    const hiveTrends = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as new_learnings,
        SUM(success_count) as total_successes
      FROM hive_learnings
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Summary stats
    const summary = await db.query(`
      SELECT
        COUNT(*) as total_learnings,
        SUM(success_count) as total_successes,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as this_week
      FROM hive_learnings
    `);

    res.json({
      script_trends: scriptTrends.rows,
      hive_trends: hiveTrends.rows,
      summary: summary.rows[0]
    });
  } catch (error: any) {
    console.error('Hive trends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top signals (what prospects say that leads to conversions)
app.get('/ai-crm/hive/top-signals', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l.notes as signal,
        l.source,
        COUNT(*) as count,
        COUNT(CASE WHEN sf.feedback = 'converted' THEN 1 END) as conversions
      FROM leads l
      JOIN script_feedback sf ON l.id = sf.prospect_id
      WHERE l.notes IS NOT NULL AND l.notes != ''
      GROUP BY l.notes, l.source
      HAVING COUNT(CASE WHEN sf.feedback IN ('converted', 'got_reply') THEN 1 END) > 0
      ORDER BY conversions DESC, count DESC
      LIMIT 10
    `);

    res.json({ signals: result.rows });
  } catch (error: any) {
    console.error('Top signals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tenant performance stats (for multi-tenant leaderboard)
app.get('/ai-crm/hive/tenant-stats', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        sf.tenant_id,
        COUNT(*) as total_scripts,
        COUNT(CASE WHEN sf.feedback = 'converted' THEN 1 END) as conversions,
        COUNT(CASE WHEN sf.feedback = 'got_reply' THEN 1 END) as replies,
        ROUND(100.0 * COUNT(CASE WHEN sf.feedback IN ('converted', 'got_reply') THEN 1 END) / NULLIF(COUNT(CASE WHEN sf.feedback IS NOT NULL THEN 1 END), 0), 1) as success_rate
      FROM script_feedback sf
      GROUP BY sf.tenant_id
      ORDER BY conversions DESC, replies DESC
    `);
    res.json({ tenants: result.rows });
  } catch (error: any) {
    console.error('Tenant stats error:', error);
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
