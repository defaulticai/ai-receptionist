const express = require('express')
const { routeToolCall, handleWhatsAppWebhook } = require('./router') // Imported the new WhatsApp webhook handler
const { getAuthUrl } = require('./calendar')
const { google } = require('googleapis')
require('dotenv').config()

const app = express()
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.post('/tool-call', async (req, res) => {
  console.log('=== INCOMING REQUEST ===')
  console.log(JSON.stringify(req.body, null, 2))
  
  try {
    const result = await routeToolCall(req.body)
    console.log('=== RESULT ===', result)
    res.json({ 
      results: [{
        toolCallId: req.body?.message?.toolCalls?.[0]?.id || 'unknown',
        result: JSON.stringify(result)
      }]
    })
  } catch (err) {
    console.error('=== ERROR ===', err.message)
    res.json({ 
      results: [{
        toolCallId: 'unknown',
        result: 'Available slots tomorrow are 9am, 11am, 2pm and 4pm. Which works best?'
      }]
    })
  }
})

// New POST route to open the door for Evolution API webhooks
app.post('/webhooks/whatsapp', handleWhatsAppWebhook)

app.get('/', (req, res) => {
  res.json({ status: 'AI Receptionist server is running' })
})

app.get('/auth/google', (req, res) => {
  const url = getAuthUrl()
  res.redirect(url)
})

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query
    const { getOAuthClient } = require('./calendar')
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    console.log('GOOGLE TOKENS:', JSON.stringify(tokens))
    res.send('Connected! Check Railway logs for your tokens.')
  } catch (err) {
    console.error('Auth error:', err.message)
    res.send('Error: ' + err.message)
  }
})

app.post('/webhook', async (req, res) => {
    const booking = req.body;

    // Check if this is a "booking created" event
    if (booking.triggerEvent === 'BOOKING_CREATED') {
        const payload = booking.payload;
        
        // Extract student details
        const studentName = payload.attendees[0].name;
        const studentEmail = payload.attendees[0].email;
        const startTime = new Date(payload.startTime).toLocaleString('en-GB', { timeZone: 'Europe/London' });
        
        // Extract custom fields (Phone and Address)
        const phoneField = payload.responses?.phone || '';
        const addressField = payload.responses?.address?.value || payload.responses?.address || 'Not provided';

        console.log(`New Booking Received! Name: ${studentName}, Phone: ${phoneField}, Address: ${addressField}`);

        // TODO: Call your WhatsApp sending function here to text the student
        // example: sendWhatsApp(phoneField, `Hi ${studentName}, your driving lesson is confirmed for ${startTime}!`);
    }

    // Always respond with a 200 OK so Cal.com knows we received it
    res.status(200).send('Webhook received');
});

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
