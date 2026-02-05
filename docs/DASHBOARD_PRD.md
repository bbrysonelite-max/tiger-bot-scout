# Tiger Bot Scout Dashboard — Product Design Requirements

## Overview

**Product**: Tiger Bot Command Center Dashboard
**Version**: 1.0
**Author**: Brent Bryson / BotCraftWrks.ai
**Status**: Design Phase

The Tiger Bot Dashboard is the central command center for network marketing distributors using Tiger Bot Scout. It provides real-time visibility into prospect discovery, script performance, and hive learnings from the collective Tiger Bot network.

---

## User Stories

### As a Tiger Bot subscriber, I want to:
1. **See my daily prospects** at a glance so I know who to contact today
2. **Track script performance** to know which approaches are working
3. **Learn from the hive** by seeing what scripts work for other users (anonymized)
4. **Monitor my conversion funnel** from prospect → contacted → converted
5. **Access my bot settings** to customize discovery preferences
6. **See my ROI** — prospects found vs. conversions achieved

### As Brent (admin), I want to:
1. **See all tenant performance** to identify who needs help
2. **Monitor system health** across all Tiger Bots
3. **Track API costs** per tenant
4. **See aggregate conversion rates** for the entire hive
5. **Identify top-performing scripts** to feature or promote

---

## Information Architecture

```
Dashboard/
├── Overview (Home)
│   ├── Today's Prospects Card
│   ├── Script Performance Card
│   ├── Conversion Funnel Card
│   └── Hive Pulse Card
│
├── Prospects
│   ├── All Prospects Table
│   ├── Filters (status, score, source, date)
│   ├── Prospect Detail Modal
│   └── Quick Actions (script, mark status)
│
├── Scripts
│   ├── Generated Scripts History
│   ├── Feedback Status (pending/responded)
│   ├── Winning Scripts Gallery
│   └── Script Performance Analytics
│
├── Hive Learnings
│   ├── Top Converting Scripts
│   ├── Objection Handlers
│   ├── Source Performance (LINE vs FB)
│   └── Learning Trends
│
├── Analytics
│   ├── Conversion Funnel Chart
│   ├── Prospects Over Time
│   ├── Response Rate by Day/Time
│   └── ROI Calculator
│
└── Settings
    ├── Bot Configuration
    ├── Notification Preferences
    ├── Discovery Sources Toggle
    └── API Keys Status
```

---

## Component Specifications

### 1. Overview Page (Home)

#### 1.1 Today's Prospects Card
```typescript
interface TodaysProspectsCard {
  count: number;           // Prospects found in last 24h
  qualified: number;       // Score >= 70
  topProspect: {
    name: string;
    score: number;
    source: string;
    signal: string;
  } | null;
  trend: 'up' | 'down' | 'stable';  // vs previous day
}
```

**UI Requirements**:
- Large number display for count
- Green badge for qualified count
- Top prospect preview with "Get Script" CTA
- Trend indicator arrow

#### 1.2 Script Performance Card
```typescript
interface ScriptPerformanceCard {
  scriptsGenerated: number;    // Total scripts created
  pendingFeedback: number;     // Awaiting user response
  gotReply: number;            // Positive responses
  converted: number;           // Full conversions
  successRate: number;         // (gotReply + converted) / total with feedback
}
```

**UI Requirements**:
- Donut chart showing feedback breakdown
- Success rate as large percentage
- Pending feedback count with alert badge

#### 1.3 Conversion Funnel Card
```typescript
interface ConversionFunnelCard {
  stages: {
    name: 'new' | 'contacted' | 'qualified' | 'converted';
    count: number;
    percentage: number;  // vs previous stage
  }[];
}
```

**UI Requirements**:
- Horizontal funnel visualization
- Click-through to filtered prospect list
- Stage-to-stage conversion rates

#### 1.4 Hive Pulse Card
```typescript
interface HivePulseCard {
  totalHiveScripts: number;     // All learnings collected
  topWinningScript: {
    preview: string;            // First 100 chars
    successCount: number;
    context: {
      source?: string;
      signal?: string;
    };
  } | null;
  myContributions: number;      // How many of your scripts in hive
}
```

**UI Requirements**:
- "Pulse" animation indicating live data
- Anonymized winning script preview
- "View All Learnings" link

---

### 2. Prospects Page

#### 2.1 Prospects Table
```typescript
interface ProspectRow {
  id: string;
  name: string;
  source: string;
  aiScore: number;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  signal: string;
  createdAt: Date;
  lastActivity: Date | null;
}

interface ProspectsTableProps {
  prospects: ProspectRow[];
  filters: {
    status?: string[];
    minScore?: number;
    source?: string[];
    dateRange?: { start: Date; end: Date };
  };
  sort: {
    field: keyof ProspectRow;
    direction: 'asc' | 'desc';
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}
```

**UI Requirements**:
- Sortable columns
- Multi-select filters
- Score displayed as color-coded badge (red < 50, yellow 50-69, green 70+)
- Inline status dropdown to update status
- "Get Script" quick action button
- Row click opens detail modal

#### 2.2 Prospect Detail Modal
```typescript
interface ProspectDetailModal {
  prospect: ProspectRow & {
    email?: string;
    phone?: string;
    platformLink?: string;
    notes?: string;
    aiQualification?: string;
    nextBestAction?: string;
  };
  scripts: {
    id: string;
    text: string;
    feedback: 'no_response' | 'got_reply' | 'converted' | null;
    createdAt: Date;
  }[];
  activities: {
    type: string;
    description: string;
    timestamp: Date;
  }[];
}
```

**UI Requirements**:
- Full prospect information
- Script history with feedback status
- Activity timeline
- Edit notes functionality
- Direct link to platform (LINE/FB)
- "Generate New Script" CTA

---

### 3. Scripts Page

#### 3.1 Scripts History Table
```typescript
interface ScriptHistoryRow {
  id: string;
  prospectName: string;
  scriptPreview: string;      // First 150 chars
  scriptType: 'approach' | 'follow_up' | 'objection';
  feedback: 'no_response' | 'got_reply' | 'converted' | null;
  feedbackAt: Date | null;
  createdAt: Date;
}
```

**UI Requirements**:
- Expand row to see full script
- Feedback status indicator (pending = yellow, no_response = red, got_reply = blue, converted = green)
- Filter by feedback status
- "Copy Script" button
- "Add to Hive" manual option for non-Telegram feedback

#### 3.2 Winning Scripts Gallery
```typescript
interface WinningScriptCard {
  id: string;
  content: string;
  successCount: number;
  context: {
    source?: string;
    signal?: string;
    feedback?: string;
  };
  addedAt: Date;
}
```

**UI Requirements**:
- Card-based gallery layout
- Success count badge
- Source/signal context chips
- "Use This Script" button (pre-fills script generator)
- "Share to Hive" toggle (anonymized)

---

### 4. Hive Learnings Page

#### 4.1 Leaderboard
```typescript
interface HiveLeaderboardEntry {
  rank: number;
  scriptPreview: string;
  learningType: 'winning_approach' | 'winning_follow_up' | 'winning_objection';
  successCount: number;
  context: {
    source?: string;
    signalType?: string;
  };
}
```

**UI Requirements**:
- Top 10 scripts ranked by success count
- Category tabs (Approaches, Follow-ups, Objection Handlers)
- Click to expand full script
- "Try This Script" CTA

#### 4.2 Source Performance
```typescript
interface SourcePerformanceData {
  source: string;             // 'LINE OpenChat', 'Facebook Group', etc.
  prospectsFound: number;
  conversionRate: number;
  avgScore: number;
  topSignals: string[];       // Most common successful signals
}
```

**UI Requirements**:
- Bar chart comparing sources
- Drill-down to see prospects by source
- Signal word cloud for each source

#### 4.3 Learning Trends
```typescript
interface LearningTrendData {
  date: Date;
  newLearnings: number;
  totalSuccessCount: number;
  topLearningType: string;
}
```

**UI Requirements**:
- Line chart showing learnings over time
- Annotations for significant milestones
- "This week's highlights" section

---

### 5. Analytics Page

#### 5.1 Conversion Funnel Chart
```typescript
interface FunnelChartData {
  stages: {
    name: string;
    value: number;
    fill: string;        // Color
  }[];
  conversionRates: {
    fromTo: string;      // "new → contacted"
    rate: number;
  }[];
}
```

**UI Requirements**:
- Visual funnel with stage counts
- Percentage between each stage
- Hover for detailed breakdown
- Date range filter

#### 5.2 Prospects Over Time
```typescript
interface ProspectsTimelineData {
  date: Date;
  new: number;
  qualified: number;
  converted: number;
}
```

**UI Requirements**:
- Stacked area chart
- Daily/weekly/monthly toggle
- Comparison to previous period

#### 5.3 Response Rate Analytics
```typescript
interface ResponseRateData {
  dayOfWeek: string;
  hour: number;
  responseRate: number;
  sampleSize: number;
}
```

**UI Requirements**:
- Heatmap showing best times to contact
- Recommendations based on data

#### 5.4 ROI Calculator
```typescript
interface ROICalculatorData {
  input: {
    subscriptionCost: number;      // $99/mo
    avgDealValue: number;          // User input
    timeSpentPerProspectManual: number;  // Minutes
  };
  output: {
    prospectsFound: number;
    timeSaved: number;             // Hours
    conversions: number;
    revenue: number;
    roi: number;                   // Percentage
  };
}
```

**UI Requirements**:
- Input fields for user variables
- Dynamic calculation
- Visual ROI gauge/meter
- Share/export capability

---

### 6. Settings Page

#### 6.1 Bot Configuration
```typescript
interface BotConfiguration {
  telegramBotToken: string;        // Masked
  discoverySchedule: string;       // Cron expression
  sourcesToMonitor: {
    name: string;
    enabled: boolean;
    config?: Record<string, any>;
  }[];
  notificationPreferences: {
    dailyReport: boolean;
    newHighScoreProspect: boolean;
    weeklyDigest: boolean;
  };
}
```

**UI Requirements**:
- Toggle switches for sources
- Time picker for report schedule
- Notification toggles
- "Test Bot Connection" button

#### 6.2 API Keys Status
```typescript
interface APIKeyStatus {
  service: string;
  status: 'connected' | 'error' | 'not_configured';
  lastChecked: Date;
  errorMessage?: string;
}
```

**UI Requirements**:
- Status indicators (green/red/gray)
- "Test Connection" per service
- Link to documentation

---

## Database Schema

```sql
-- Core tables (already exist)
-- leads, script_feedback, hive_learnings

-- New tables needed

-- Tenant/user profiles
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  telegram_chat_id TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity log for timeline
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  prospect_id UUID REFERENCES leads(id),
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Discovery source configuration
CREATE TABLE discovery_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  source_type TEXT NOT NULL,  -- 'line_openchat', 'facebook_group', etc.
  source_config JSONB NOT NULL,  -- Room IDs, group URLs, etc.
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_activities_tenant ON activities(tenant_id);
CREATE INDEX idx_activities_prospect ON activities(prospect_id);
CREATE INDEX idx_discovery_sources_tenant ON discovery_sources(tenant_id);
CREATE INDEX idx_tenants_email ON tenants(email);
```

---

## API Endpoints Required

### Dashboard Overview
- `GET /dashboard/overview` — Aggregated data for all cards
- `GET /dashboard/today` — Today's prospects summary

### Prospects
- `GET /ai-crm/leads` — List with filters ✅ (exists)
- `GET /ai-crm/leads/:id` — Single prospect ✅ (exists)
- `PATCH /ai-crm/leads/:id` — Update prospect ✅ (exists)
- `GET /ai-crm/leads/:id/scripts` — Scripts for prospect (NEW)
- `GET /ai-crm/leads/:id/activities` — Activity timeline (NEW)

### Scripts & Feedback
- `GET /ai-crm/feedback/stats` — Feedback stats ✅ (exists)
- `GET /ai-crm/feedback/recent` — Recent feedback ✅ (exists)
- `POST /ai-crm/scripts/generate` — Generate script via API (NEW)
- `POST /ai-crm/feedback/:scriptId` — Submit feedback via dashboard (NEW)

### Hive Learnings
- `GET /ai-crm/hive/learnings` — All learnings ✅ (exists)
- `GET /ai-crm/hive/leaderboard` — Top scripts ✅ (exists)
- `GET /ai-crm/hive/tenant-stats` — Per-tenant stats ✅ (exists)
- `GET /ai-crm/hive/source-performance` — By source (NEW)
- `GET /ai-crm/hive/trends` — Over time (NEW)

### Analytics
- `GET /analytics/funnel` — Conversion funnel data (NEW)
- `GET /analytics/timeline` — Prospects over time (NEW)
- `GET /analytics/response-rates` — Best times to contact (NEW)
- `GET /analytics/roi` — ROI metrics (NEW)

### Settings
- `GET /settings` — User settings (NEW)
- `PATCH /settings` — Update settings (NEW)
- `GET /settings/integrations` — Integration status (NEW)
- `POST /settings/test-connection/:service` — Test integration (NEW)

---

## UI/UX Requirements

### Design System
- **Framework**: React 19 + TypeScript
- **Components**: shadcn/ui (already in agent-code-Leap)
- **Charts**: Recharts or Tremor
- **Icons**: Lucide
- **Colors**:
  - Primary: Orange (#F97316) — Tiger theme
  - Secondary: Black (#0A0A0A)
  - Accent: Blue (#3B82F6) — Tech/trust
  - Success: Green (#22C55E)
  - Warning: Yellow (#EAB308)
  - Error: Red (#EF4444)

### Responsive Breakpoints
- Mobile: 320px - 767px
- Tablet: 768px - 1023px
- Desktop: 1024px+

### Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- Color contrast ratios ≥ 4.5:1

### Performance
- Initial load < 3 seconds
- Route transitions < 500ms
- Real-time updates via WebSocket or polling (30s interval)

---

## Test Plan

### Unit Tests
```typescript
// Example test cases

// Components
describe('TodaysProspectsCard', () => {
  it('renders prospect count correctly');
  it('shows qualified badge when count > 0');
  it('displays trend indicator');
  it('handles zero prospects gracefully');
});

describe('ProspectsTable', () => {
  it('renders all columns');
  it('sorts by score descending by default');
  it('filters by status correctly');
  it('opens detail modal on row click');
  it('updates status inline');
});

describe('ScriptFeedbackButtons', () => {
  it('sends feedback on click');
  it('disables buttons after feedback');
  it('shows success message');
});

// API Integration
describe('API: /ai-crm/leads', () => {
  it('returns leads with pagination');
  it('filters by status');
  it('filters by min_score');
  it('sorts correctly');
});

describe('API: /ai-crm/hive/leaderboard', () => {
  it('returns top 10 by default');
  it('orders by success_count DESC');
});
```

### Integration Tests
- End-to-end flow: Create prospect → Generate script → Submit feedback → Appears in hive
- Authentication flow with Clerk
- Real-time updates when new prospect found

### Manual Test Checklist
- [ ] Overview page loads with correct data
- [ ] Prospects table filters work
- [ ] Prospect detail modal shows all info
- [ ] Script generation works from dashboard
- [ ] Feedback buttons work in dashboard (not just Telegram)
- [ ] Hive leaderboard updates after new feedback
- [ ] Analytics charts render correctly
- [ ] Settings save correctly
- [ ] Mobile responsive layout works
- [ ] Dark mode (if implemented)

---

## Implementation Phases

### Phase 1: Core Dashboard (Week 1)
- [ ] Overview page with 4 cards
- [ ] Prospects table with basic filters
- [ ] Prospect detail modal
- [ ] Connect to existing API endpoints

### Phase 2: Scripts & Feedback (Week 2)
- [ ] Scripts history page
- [ ] Feedback submission from dashboard
- [ ] Winning scripts gallery
- [ ] New API endpoints for scripts

### Phase 3: Hive Learnings (Week 3)
- [ ] Leaderboard page
- [ ] Source performance charts
- [ ] Learning trends visualization
- [ ] New API endpoints for hive

### Phase 4: Analytics & Settings (Week 4)
- [ ] Analytics page with all charts
- [ ] Settings page
- [ ] ROI calculator
- [ ] Polish and optimization

### Phase 5: Testing & Launch (Week 5)
- [ ] Unit tests (80% coverage)
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Bug fixes
- [ ] Deploy to production

---

## Success Metrics

### User Engagement
- Daily active users (DAU) / Monthly active users (MAU)
- Average session duration
- Pages per session
- Feature adoption rates

### Business Metrics
- Prospects → Contacted conversion rate
- Contacted → Converted conversion rate
- Scripts generated per user per day
- Feedback submission rate

### Technical Metrics
- Page load time < 3s
- API response time < 500ms
- Error rate < 1%
- Uptime > 99.9%

---

## Dependencies

### External Services
- **Anthropic Claude API** — Script generation
- **PostgreSQL** — Data storage
- **Stripe** — Billing (future)
- **Clerk** — Authentication (future)
- **Telegram Bot API** — Bot delivery

### Internal Dependencies
- Tiger Bot API (server.ts) — Backend
- Agent Zero — Prospect discovery
- Hive learnings system — Knowledge base

---

## Open Questions

1. **Multi-language support**: Should dashboard support Thai language toggle?
2. **Notification system**: In-app notifications or email-only?
3. **Dark mode**: Required for v1 or future enhancement?
4. **Offline mode**: Should dashboard work offline with cached data?
5. **Export functionality**: PDF reports, CSV exports needed?

---

## Appendix: Type Definitions

See `/types/dashboard.ts` for complete TypeScript type definitions.

```typescript
// /types/dashboard.ts

export interface Prospect {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source: string;
  status: ProspectStatus;
  aiScore: number;
  signalText?: string;
  platformLink?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ProspectStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export interface ScriptFeedback {
  id: string;
  tenantId: string;
  prospectId: string;
  scriptText: string;
  scriptType: ScriptType;
  feedback: FeedbackType | null;
  feedbackAt: Date | null;
  createdAt: Date;
}

export type ScriptType = 'approach' | 'follow_up' | 'objection';
export type FeedbackType = 'no_response' | 'got_reply' | 'converted';

export interface HiveLearning {
  id: string;
  learningType: string;
  content: string;
  context: {
    source?: string;
    signal?: string;
    feedback?: string;
  };
  successCount: number;
  createdAt: Date;
}

export interface DashboardOverview {
  todaysProspects: {
    count: number;
    qualified: number;
    topProspect: Prospect | null;
    trend: 'up' | 'down' | 'stable';
  };
  scriptPerformance: {
    total: number;
    pendingFeedback: number;
    gotReply: number;
    converted: number;
    successRate: number;
  };
  conversionFunnel: {
    stages: FunnelStage[];
  };
  hivePulse: {
    totalLearnings: number;
    topScript: HiveLearning | null;
    myContributions: number;
  };
}

export interface FunnelStage {
  name: ProspectStatus;
  count: number;
  percentage: number;
}

export interface AnalyticsData {
  funnel: FunnelChartData;
  timeline: TimelineData[];
  responseRates: ResponseRateData[];
  roi: ROIData;
}

export interface TimelineData {
  date: Date;
  new: number;
  qualified: number;
  converted: number;
}

export interface ResponseRateData {
  dayOfWeek: string;
  hour: number;
  responseRate: number;
  sampleSize: number;
}

export interface ROIData {
  prospectsFound: number;
  timeSaved: number;
  conversions: number;
  revenue: number;
  roi: number;
}
```

---

**Document Version**: 1.0
**Last Updated**: February 4, 2026
**Next Review**: February 11, 2026
