// Twilio SMS API Client

export class TwilioClient {
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;
  private baseUrl: string;

  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.phoneNumber = phoneNumber;
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  }

  private getAuthHeader() {
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  async sendSMS(params: { to: string; body: string }) {
    const formData = new URLSearchParams();
    formData.append('To', params.to);
    formData.append('From', this.phoneNumber);
    formData.append('Body', params.body);

    const response = await fetch(`${this.baseUrl}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twilio API error: ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  async getRecentMessages(limit: number = 20) {
    const response = await fetch(`${this.baseUrl}/Messages.json?PageSize=${limit}`, {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status}`);
    }

    return response.json();
  }
}
