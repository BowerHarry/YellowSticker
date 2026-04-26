export type NotificationPreference = 'email' | 'telegram' | 'both';

export type UserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  telegram_chat_id?: number | null;
};

export type ProductionRecord = {
  id: string;
  slug: string;
  name: string;
  theatre: string;
  city?: string | null;
  scraping_url: string;
  last_seen_status: 'available' | 'unavailable' | 'unknown' | null;
  last_checked_at: string | null;
  last_standing_tickets_found_at: string | null;
  description?: string | null;
  poster_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  series_code?: string | null;
  adapter?: string | null;
  scrape_disabled_reason?: string | null;
};

export type SubscriptionPayload = {
  email: string;
  phone?: string;
  preference: NotificationPreference;
  productionId: string;
  productionSlug: string;
};

export type ScrapeResult = {
  status: 'available' | 'unavailable';
  reason?: string;
  price?: string;
  standCount?: number;
};

