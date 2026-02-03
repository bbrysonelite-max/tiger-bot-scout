// Calendly API Client

export class CalendlyClient {
  private apiKey: string;
  private bookingLink: string;
  private baseUrl = 'https://api.calendly.com';

  constructor(apiKey: string, bookingLink: string) {
    this.apiKey = apiKey;
    this.bookingLink = bookingLink;
  }

  getBookingLink() {
    return this.bookingLink;
  }

  async getCurrentUser() {
    const response = await fetch(`${this.baseUrl}/users/me`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }

    return response.json();
  }

  async getScheduledEvents(userUri: string, count: number = 10) {
    const response = await fetch(
      `${this.baseUrl}/scheduled_events?user=${encodeURIComponent(userUri)}&count=${count}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }

    return response.json();
  }
}
