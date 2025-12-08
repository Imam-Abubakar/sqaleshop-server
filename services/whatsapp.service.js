const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.apiUrl = 'https://graph.facebook.com/v17.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.token = process.env.WHATSAPP_API_TOKEN;
  }

  async sendMessage(to, template, components = []) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: {
              code: 'en',
            },
            components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('WhatsApp API Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new WhatsAppService(); 