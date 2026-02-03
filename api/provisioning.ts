// provisioning.ts — Customer provisioning when they subscribe
import { Pool } from 'pg';
import { Router } from 'express';
import crypto from 'crypto';

export function createProvisioningRouter(db: Pool) {
    const router = Router();

    // ==================== STRIPE WEBHOOK ====================
    // This is called by Stripe when a customer subscribes via Stan Store

    router.post('/webhooks/stripe', async (req, res) => {
        try {
            const event = req.body;

            // Handle subscription created
            if (event.type === 'customer.subscription.created') {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const email = subscription.customer_email || event.data.object.metadata?.email;
                const plan = subscription.items.data[0]?.price?.lookup_key || 'scout';

                console.log(`New subscription: ${email} -> ${plan}`);

                // Provision the customer
                const tenant = await provisionCustomer(db, {
                    stripe_customer_id: customerId,
                    email,
                    plan,
                    subscription_id: subscription.id
                });

                console.log(`Provisioned tenant: ${tenant.id}`);
            }

            // Handle subscription cancelled
            if (event.type === 'customer.subscription.deleted') {
                const subscription = event.data.object;
                await deactivateTenant(db, subscription.customer);
            }

            res.json({ received: true });
        } catch (err) {
            console.error('Stripe webhook error:', err);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    });

    // ==================== MANUAL PROVISIONING ====================
    // For testing or manual customer setup

    router.post('/provision', async (req, res) => {
        try {
            const { email, name, plan, telegram_chat_id } = req.body;

            if (!email) {
                res.status(400).json({ error: 'email is required' });
                return;
            }

            const tenant = await provisionCustomer(db, {
                email,
                name,
                plan: plan || 'scout',
                telegram_chat_id
            });

            res.json({
                success: true,
                tenant,
                message: `Welcome! Your Tiger Bot Scout is ready.`,
                telegram_bot: '@TigerBotScout_bot',
                dashboard: 'https://botcraftwrks.ai/dashboard'
            });
        } catch (err) {
            console.error('Provision error:', err);
            res.status(500).json({ error: 'Failed to provision customer' });
        }
    });

    // ==================== TENANT MANAGEMENT ====================

    router.get('/tenants', async (req, res) => {
        try {
            const result = await db.query(`
                SELECT t.*,
                       (SELECT COUNT(*) FROM leads WHERE tenant_id = t.id) as prospect_count
                FROM tenants t
                ORDER BY t.created_at DESC
            `);
            res.json({ tenants: result.rows });
        } catch (err) {
            console.error('Get tenants error:', err);
            res.status(500).json({ error: 'Failed to get tenants' });
        }
    });

    router.get('/tenants/:id', async (req, res) => {
        try {
            const result = await db.query('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
            if (result.rows.length === 0) {
                res.status(404).json({ error: 'Tenant not found' });
                return;
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Get tenant error:', err);
            res.status(500).json({ error: 'Failed to get tenant' });
        }
    });

    return router;
}

// ==================== PROVISIONING LOGIC ====================

interface ProvisionRequest {
    stripe_customer_id?: string;
    email: string;
    name?: string;
    plan: string;
    subscription_id?: string;
    telegram_chat_id?: string;
}

async function provisionCustomer(db: Pool, request: ProvisionRequest) {
    const {
        stripe_customer_id,
        email,
        name,
        plan,
        subscription_id,
        telegram_chat_id
    } = request;

    // Generate unique tenant ID
    const tenantId = crypto.randomUUID();
    const apiKey = `tb_${crypto.randomBytes(24).toString('hex')}`;

    // Create tenant record
    const tenantResult = await db.query(`
        INSERT INTO tenants (
            id, email, name, plan, status,
            stripe_customer_id, subscription_id,
            api_key, telegram_chat_id,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
    `, [
        tenantId, email, name || email.split('@')[0], plan,
        stripe_customer_id, subscription_id, apiKey, telegram_chat_id
    ]);

    const tenant = tenantResult.rows[0];

    // Create default Telegram channel for the tenant
    await db.query(`
        INSERT INTO channels (tenant_id, type, name, status, created_at)
        VALUES ($1, 'telegram', 'Tiger Bot Scout', 'active', NOW())
    `, [tenantId]);

    // Send welcome message if we have their Telegram chat ID
    if (telegram_chat_id) {
        await sendWelcomeMessage(telegram_chat_id, tenant);
    }

    return tenant;
}

async function deactivateTenant(db: Pool, stripeCustomerId: string) {
    await db.query(`
        UPDATE tenants
        SET status = 'cancelled', updated_at = NOW()
        WHERE stripe_customer_id = $1
    `, [stripeCustomerId]);

    // Get tenant info to send goodbye message
    const result = await db.query(
        'SELECT * FROM tenants WHERE stripe_customer_id = $1',
        [stripeCustomerId]
    );

    if (result.rows.length > 0 && result.rows[0].telegram_chat_id) {
        await sendGoodbyeMessage(result.rows[0].telegram_chat_id);
    }
}

async function sendWelcomeMessage(chatId: string, tenant: any) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const message = `🐯 *Welcome to Tiger Bot Scout!*

Your AI recruiting partner is now active.

*Your Plan:* ${tenant.plan.toUpperCase()}
*Commands:*
/report — Get your daily prospect report
/pipeline — View your pipeline
/script <name> — Get approach script
/objection <text> — Handle objections
/help — All commands

I'll deliver fresh prospects to you every morning at 7 AM.

Let's fill your pipeline! 🚀`;

    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
        });
    } catch (err) {
        console.error('Failed to send welcome message:', err);
    }
}

async function sendGoodbyeMessage(chatId: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const message = `🐯 Your Tiger Bot Scout subscription has ended.

Thanks for being a customer! Your data will be retained for 30 days if you want to resubscribe.

We hope to see you again soon.`;

    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
        });
    } catch (err) {
        console.error('Failed to send goodbye message:', err);
    }
}

// ==================== DATABASE SCHEMA FOR MULTI-TENANCY ====================

export const PROVISIONING_SCHEMA = `
-- Tenants (customers)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    plan TEXT NOT NULL DEFAULT 'scout',
    status TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id TEXT,
    subscription_id TEXT,
    api_key TEXT UNIQUE,
    telegram_chat_id TEXT,
    line_user_id TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add tenant_id to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Channels (Telegram, LINE, etc per tenant)
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    type TEXT NOT NULL, -- 'telegram', 'line', 'messenger'
    name TEXT,
    config JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages log
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id),
    tenant_id UUID REFERENCES tenants(id),
    direction TEXT NOT NULL, -- 'inbound', 'outbound'
    recipient TEXT,
    content TEXT,
    status TEXT DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
`;
