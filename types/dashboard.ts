// Tiger Bot Scout Dashboard Type Definitions
// Version: 1.0

// ==================== CORE ENTITIES ====================

export interface Prospect {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  source: string;
  status: ProspectStatus;
  priority: 'low' | 'medium' | 'high';
  aiScore: number;
  signalText?: string;
  platformLink?: string;
  linkedinProfile?: string;
  position?: string;
  notes?: string;
  assignedTo?: string;
  aiQualification?: string;
  nextBestAction?: string;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ProspectStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export interface ScriptFeedback {
  id: string;
  tenantId: string;
  prospectId: string;
  prospectName?: string;  // Joined from leads table
  source?: string;        // Joined from leads table
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
  context: HiveLearningContext;
  successCount: number;
  createdAt: Date;
}

export interface HiveLearningContext {
  source?: string;
  signal?: string;
  feedback?: string;
  [key: string]: unknown;
}

export interface Tenant {
  id: string;
  email: string;
  name?: string;
  telegramChatId?: string;
  stripeCustomerId?: string;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing';
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  discoverySchedule?: string;
  notificationPreferences?: NotificationPreferences;
  timezone?: string;
  [key: string]: unknown;
}

export interface NotificationPreferences {
  dailyReport: boolean;
  newHighScoreProspect: boolean;
  weeklyDigest: boolean;
}

export interface Activity {
  id: string;
  tenantId: string;
  prospectId?: string;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type ActivityType =
  | 'prospect_found'
  | 'script_generated'
  | 'feedback_received'
  | 'status_changed'
  | 'note_added'
  | 'message_sent';

// ==================== DASHBOARD DATA ====================

export interface DashboardOverview {
  todaysProspects: TodaysProspectsData;
  scriptPerformance: ScriptPerformanceData;
  conversionFunnel: ConversionFunnelData;
  hivePulse: HivePulseData;
}

export interface TodaysProspectsData {
  count: number;
  qualified: number;
  topProspect: Prospect | null;
  trend: 'up' | 'down' | 'stable';
  trendValue?: number;  // Percentage change
}

export interface ScriptPerformanceData {
  total: number;
  pendingFeedback: number;
  noResponse: number;
  gotReply: number;
  converted: number;
  successRate: number;  // Percentage
}

export interface ConversionFunnelData {
  stages: FunnelStage[];
}

export interface FunnelStage {
  name: ProspectStatus;
  count: number;
  percentage: number;  // Conversion rate from previous stage
  fill: string;        // Color for chart
}

export interface HivePulseData {
  totalLearnings: number;
  topScript: HiveLearning | null;
  myContributions: number;
  recentLearnings: number;  // Last 24h
}

// ==================== ANALYTICS DATA ====================

export interface AnalyticsData {
  funnel: FunnelChartData;
  timeline: TimelineData[];
  responseRates: ResponseRateData[];
  roi: ROIData;
}

export interface FunnelChartData {
  stages: {
    name: string;
    value: number;
    fill: string;
  }[];
  conversionRates: {
    fromTo: string;
    rate: number;
  }[];
}

export interface TimelineData {
  date: string;  // ISO date string
  new: number;
  contacted: number;
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
  subscriptionCost: number;
  prospectsFound: number;
  timeSavedHours: number;
  conversions: number;
  avgDealValue: number;
  revenue: number;
  roi: number;  // Percentage
}

// ==================== HIVE LEADERBOARD ====================

export interface HiveLeaderboardEntry {
  rank: number;
  id: string;
  scriptPreview: string;
  learningType: string;
  successCount: number;
  context: HiveLearningContext;
  createdAt: Date;
}

export interface SourcePerformanceData {
  source: string;
  prospectsFound: number;
  conversionRate: number;
  avgScore: number;
  topSignals: string[];
}

export interface TenantPerformanceData {
  tenantId: string;
  totalScripts: number;
  conversions: number;
  replies: number;
  successRate: number;
}

// ==================== API RESPONSES ====================

export interface ApiResponse<T> {
  data: T;
  error?: string;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface LeadsResponse {
  leads: Prospect[];
  count: number;
}

export interface FeedbackStatsResponse {
  total_scripts: number;
  with_feedback: number;
  conversion_rate: number;
  by_feedback: Record<FeedbackType, number>;
}

export interface HiveLeaderboardResponse {
  leaderboard: HiveLeaderboardEntry[];
}

export interface HiveLearningsResponse {
  learnings: HiveLearning[];
  count: number;
}

export interface TenantStatsResponse {
  tenants: TenantPerformanceData[];
}

// ==================== TABLE & FILTER TYPES ====================

export interface ProspectsTableFilters {
  status?: ProspectStatus[];
  minScore?: number;
  maxScore?: number;
  source?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
}

export interface ProspectsTableSort {
  field: keyof Prospect;
  direction: 'asc' | 'desc';
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface TableState {
  filters: ProspectsTableFilters;
  sort: ProspectsTableSort;
  pagination: PaginationState;
}

// ==================== SETTINGS ====================

export interface UserSettings {
  botConfiguration: BotConfiguration;
  notificationPreferences: NotificationPreferences;
  discoverySources: DiscoverySourceConfig[];
  apiKeysStatus: APIKeyStatus[];
}

export interface BotConfiguration {
  telegramBotToken: string;  // Masked
  discoverySchedule: string;
  timezone: string;
}

export interface DiscoverySourceConfig {
  id: string;
  name: string;
  sourceType: 'line_openchat' | 'facebook_group' | 'linkedin' | 'twitter';
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface APIKeyStatus {
  service: string;
  status: 'connected' | 'error' | 'not_configured';
  lastChecked: Date;
  errorMessage?: string;
}

// ==================== COMPONENT PROPS ====================

export interface TodaysProspectsCardProps {
  data: TodaysProspectsData;
  onViewAll: () => void;
  onGetScript: (prospectId: string) => void;
}

export interface ScriptPerformanceCardProps {
  data: ScriptPerformanceData;
  onViewPending: () => void;
}

export interface ConversionFunnelCardProps {
  data: ConversionFunnelData;
  onStageClick: (status: ProspectStatus) => void;
}

export interface HivePulseCardProps {
  data: HivePulseData;
  onViewLearnings: () => void;
}

export interface ProspectsTableProps {
  prospects: Prospect[];
  filters: ProspectsTableFilters;
  sort: ProspectsTableSort;
  pagination: PaginationState;
  onFiltersChange: (filters: ProspectsTableFilters) => void;
  onSortChange: (sort: ProspectsTableSort) => void;
  onPageChange: (page: number) => void;
  onRowClick: (prospect: Prospect) => void;
  onStatusChange: (prospectId: string, status: ProspectStatus) => void;
  onGetScript: (prospectId: string) => void;
}

export interface ProspectDetailModalProps {
  prospect: Prospect;
  scripts: ScriptFeedback[];
  activities: Activity[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateNotes: (notes: string) => void;
  onStatusChange: (status: ProspectStatus) => void;
  onGenerateScript: () => void;
}

export interface ScriptFeedbackButtonsProps {
  scriptId: string;
  currentFeedback: FeedbackType | null;
  onFeedback: (scriptId: string, feedback: FeedbackType) => Promise<void>;
  disabled?: boolean;
}

export interface HiveLeaderboardProps {
  entries: HiveLeaderboardEntry[];
  onViewScript: (id: string) => void;
  onUseScript: (content: string) => void;
}

// ==================== CHART DATA ====================

export interface DonutChartData {
  name: string;
  value: number;
  fill: string;
}

export interface BarChartData {
  name: string;
  value: number;
  fill?: string;
}

export interface LineChartData {
  name: string;
  [key: string]: string | number;
}

export interface HeatmapData {
  x: string;
  y: number;
  value: number;
}

// ==================== UTILITY TYPES ====================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type Nullable<T> = T | null;

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};
