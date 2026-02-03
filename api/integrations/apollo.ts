// Apollo.io People Search API Client

export class ApolloClient {
  private apiKey: string;
  private baseUrl = 'https://api.apollo.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchPeople(params: {
    q_organization_domains?: string[];
    person_titles?: string[];
    person_locations?: string[];
    per_page?: number;
    page?: number;
  }) {
    const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        ...params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Apollo API error: ${response.status}`);
    }

    return response.json();
  }

  async enrichPerson(email: string) {
    const response = await fetch(`${this.baseUrl}/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        email,
      }),
    });

    if (!response.ok) {
      throw new Error(`Apollo API error: ${response.status}`);
    }

    return response.json();
  }
}
