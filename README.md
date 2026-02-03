# Tiger Bot Scout

AI Recruiting Partner for Network Marketing - delivered via Telegram.

**Product of [BotCraftWrks.ai](https://botcraftwrks.ai)**

## What It Does

Tiger Bot Scout monitors social platforms for prospects, delivers daily reports, and generates personalized approach scripts for network marketing distributors.

- Daily prospect reports at 7 AM (Bangkok time)
- AI-powered approach scripts
- Objection handling
- Pipeline tracking

## Project Structure

```
tiger-bot-scout/
├── website/           # Landing page + dashboard
│   ├── index.html
│   └── dashboard.html
├── api/               # Backend API
│   ├── server.ts
│   ├── telegram-bot.ts
│   ├── channels.ts
│   ├── provisioning.ts
│   └── integrations/
└── package.json
```

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in values
3. Install dependencies: `npm install`
4. Run locally: `npm run dev`
5. Build for production: `npm run build`

## Deployment

The API runs on DreamCompute at `208.113.131.83`.

```bash
ssh -i "botcraft key pair.pem" ubuntu@208.113.131.83
cd /home/ubuntu/tiger-bot-api
git pull
npm install
pm2 restart tiger-bot
```

## Telegram Commands

- `/start` - Welcome message
- `/report` - Today's prospect report
- `/pipeline` - Pipeline summary
- `/script <name>` - Approach script for a prospect
- `/objection <text>` - Handle an objection
- `/stats` - Weekly stats
- `/recent` - Last 5 prospects

## API Endpoints

- `GET /health` - Health check
- `POST /ai-crm/leads` - Create lead
- `GET /ai-crm/leads` - List leads
- `GET /ai-crm/priority-prospects` - High-score prospects
- `GET /ai-crm/stats` - Pipeline stats
- `POST /admin/provision` - Provision new customer
- `GET /admin/tenants` - List tenants

## License

Proprietary - BotCraft LLC
