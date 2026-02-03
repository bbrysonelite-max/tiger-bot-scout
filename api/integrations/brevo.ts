// Brevo (formerly Sendinblue) Email API Client

export class BrevoClient {
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(params: {
    to: { email: string; name?: string }[];
    subject: string;
    htmlContent?: string;
    textContent?: string;
    sender?: { email: string; name: string };
    templateId?: number;
    params?: Record<string, string>;
  }) {
    const response = await fetch(`${this.baseUrl}/smtp/email`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: params.sender || { email: 'noreply@botcraftwrks.ai', name: 'Tiger Bot Scout' },
        to: params.to,
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
        templateId: params.templateId,
        params: params.params,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Brevo API error: ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  async getStatistics(days: number = 7) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await fetch(
      `${this.baseUrl}/smtp/statistics/aggregatedReport?startDate=${startDate}&endDate=${endDate}`,
      {
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Brevo API error: ${response.status}`);
    }

    return response.json();
  }
}
