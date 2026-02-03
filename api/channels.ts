// channels.ts — Multi-channel communication hub (Telegram + LINE)
import { Pool } from 'pg';
import { Router } from 'express';

export function createChannelsRouter(db: Pool) {
    const router = Router();

    // ==================== CHANNEL CONFIGURATION ====================

    // Get all configured channels for a tenant
    router.get('/channels', async (req, res) => {
        try {
            const result = await db.query(`
                SELECT * FROM channels ORDER BY created_at DESC
            `);
            res.json({ channels: result.rows });
        } catch (err) {
            console.error('Get channels error:', err);
            res.status(500).json({ error: 'Failed to get channels' });
        }
    });

    // Add a new channel (Telegram or LINE)
    router.post('/channels', async (req, res) => {
        try {
            const { type, name, config } = req.body;
            // type: 'telegram' | 'line'
            // config: { bot_token, channel_secret, channel_access_token, etc }

            if (!type || !name || !config) {
                res.status(400).json({ error: 'type, name, and config are required' });
                return;
            }

            const result = await db.query(`
                INSERT INTO channels (type, name, config, status, created_at)
                VALUES ($1, $2, $3, 'active', NOW())
                RETURNING *
            `, [type, name, JSON.stringify(config)]);

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Add channel error:', err);
            res.status(500).json({ error: 'Failed to add channel' });
        }
    });

    // Update channel status
    router.patch('/channels/:id', async (req, res) => {
        try {
            const { status, config } = req.body;
            const updates: string[] = [];
            const params: any[] = [];
            let idx = 1;

            if (status) { updates.push(`status = $${idx++}`); params.push(status); }
            if (config) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
            updates.push(`updated_at = NOW()`);

            params.push(req.params.id);
            const result = await db.query(
                `UPDATE channels SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'Channel not found' });
                return;
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Update channel error:', err);
            res.status(500).json({ error: 'Failed to update channel' });
        }
    });

    // ==================== MESSAGE SENDING ====================

    // Send message through a specific channel
    router.post('/channels/:id/send', async (req, res) => {
        try {
            const { recipient, message } = req.body;
            const channelResult = await db.query('SELECT * FROM channels WHERE id = $1', [req.params.id]);

            if (channelResult.rows.length === 0) {
                res.status(404).json({ error: 'Channel not found' });
                return;
            }

            const channel = channelResult.rows[0];
            const config = typeof channel.config === 'string' ? JSON.parse(channel.config) : channel.config;

            let result;
            if (channel.type === 'telegram') {
                result = await sendTelegramMessage(config.bot_token, recipient, message);
            } else if (channel.type === 'line') {
                result = await sendLineMessage(config.channel_access_token, recipient, message);
            } else {
                res.status(400).json({ error: `Unknown channel type: ${channel.type}` });
                return;
            }

            // Log the message
            await db.query(`
                INSERT INTO messages (channel_id, direction, recipient, content, status, created_at)
                VALUES ($1, 'outbound', $2, $3, $4, NOW())
            `, [channel.id, recipient, message, result.success ? 'sent' : 'failed']);

            res.json(result);
        } catch (err) {
            console.error('Send message error:', err);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    // Broadcast to all channels
    router.post('/broadcast', async (req, res) => {
        try {
            const { message, channels } = req.body; // channels: array of channel IDs, or 'all'

            let channelList;
            if (channels === 'all') {
                const result = await db.query(`SELECT * FROM channels WHERE status = 'active'`);
                channelList = result.rows;
            } else {
                const result = await db.query(`SELECT * FROM channels WHERE id = ANY($1)`, [channels]);
                channelList = result.rows;
            }

            const results = [];
            for (const channel of channelList) {
                // This would need the recipient list per channel
                results.push({
                    channel_id: channel.id,
                    channel_type: channel.type,
                    status: 'queued'
                });
            }

            res.json({ message: 'Broadcast queued', results });
        } catch (err) {
            console.error('Broadcast error:', err);
            res.status(500).json({ error: 'Failed to broadcast' });
        }
    });

    // ==================== MESSAGE HISTORY ====================

    router.get('/messages', async (req, res) => {
        try {
            const { channel_id, direction, limit } = req.query;
            let query = 'SELECT m.*, c.type as channel_type, c.name as channel_name FROM messages m JOIN channels c ON m.channel_id = c.id WHERE 1=1';
            const params: any[] = [];
            let idx = 1;

            if (channel_id) { query += ` AND m.channel_id = $${idx++}`; params.push(channel_id); }
            if (direction) { query += ` AND m.direction = $${idx++}`; params.push(direction); }

            query += ' ORDER BY m.created_at DESC';
            query += ` LIMIT $${idx++}`;
            params.push(parseInt(limit as string) || 50);

            const result = await db.query(query, params);
            res.json({ messages: result.rows });
        } catch (err) {
            console.error('Get messages error:', err);
            res.status(500).json({ error: 'Failed to get messages' });
        }
    });

    return router;
}

// ==================== TELEGRAM HELPERS ====================

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        });
        const data = await response.json();
        return { success: data.ok, data };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

// ==================== LINE HELPERS ====================

async function sendLineMessage(accessToken: string, userId: string, text: string) {
    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                to: userId,
                messages: [{ type: 'text', text }]
            })
        });

        if (response.ok) {
            return { success: true };
        } else {
            const error = await response.json();
            return { success: false, error };
        }
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

// ==================== LINE WEBHOOK HANDLER ====================

export function createLineWebhookHandler(db: Pool) {
    return async (req: any, res: any) => {
        try {
            const events = req.body.events || [];

            for (const event of events) {
                if (event.type === 'message' && event.message.type === 'text') {
                    const userId = event.source.userId;
                    const text = event.message.text;
                    const replyToken = event.replyToken;

                    // Log incoming message
                    await db.query(`
                        INSERT INTO messages (channel_id, direction, recipient, content, status, metadata, created_at)
                        VALUES ((SELECT id FROM channels WHERE type = 'line' LIMIT 1), 'inbound', $1, $2, 'received', $3, NOW())
                    `, [userId, text, JSON.stringify({ replyToken })]);

                    // Handle commands similar to Telegram bot
                    // This would be processed by the bot logic
                    console.log(`LINE message from ${userId}: ${text}`);
                }
            }

            res.status(200).json({ status: 'ok' });
        } catch (err) {
            console.error('LINE webhook error:', err);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    };
}
