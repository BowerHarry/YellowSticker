export type NotificationPreference = 'email' | 'sms' | 'both';

export interface Production {
  id: string;
  slug: string;
  name: string;
  theatre: string;
  city?: string;
  scraping_url: string;
  description?: string;
  poster_url?: string;
  heroImage?: string;
  last_seen_status?: 'available' | 'unavailable' | 'unknown';
  last_checked_at?: string | null;
  last_standing_tickets_found_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export type PaymentType = 'subscription' | 'one-time';

export interface SubscriptionPayload {
  email: string;
  phone?: string;
  preference: NotificationPreference;
  productionId: string;
  productionSlug: string;
  paymentType?: PaymentType; // 'subscription' for auto-renew, 'one-time' for single month
}

export interface ProductionStatus {
  id: string;
  name: string;
  lastCheckedAt: string | null;
  lastStandingTicketsFoundAt: string | null;
  lastSeenStatus: 'available' | 'unavailable' | 'unknown' | null;
  status: 'healthy' | 'unhealthy' | 'paused'; // healthy = passed recently, unhealthy = failed recently, paused = outside hours but last run passed
}

export interface ServiceHealth {
  healthy: boolean;
}

export interface ScraperHealth extends ServiceHealth {
  used: number;
  limit: number;
  monthlyUsed?: number;
  monthlyLimit?: number;
}

export interface DatabaseHealth extends ServiceHealth {
  monthlyUsers: number;
  monthlyUserLimit: number;
  sizeBytes: number;
  sizeLimitBytes: number;
}

export interface EmailHealth extends ServiceHealth {
  dailyUsage: number;
  dailyLimit: number;
  monthlyUsage: number;
  monthlyLimit: number;
}

export interface PaymentHealth extends ServiceHealth {
  lastPaidAt: string | null;
  lookbackDays: number;
}

export interface MonitorStatusResponse {
  timestamp: string;
  productions: ProductionStatus[];
  services: {
    scraper: ScraperHealth;
    database: DatabaseHealth;
    email: EmailHealth;
    payment: PaymentHealth;
  };
}

