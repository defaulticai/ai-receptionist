const express = require('express')
// STEP 1: Added the 3 new functions to the router import line here
const { routeToolCall, handleWhatsAppWebhook, getStudents, updateStudent, broadcastMessage } = require('./router')
const { sendWhatsAppText } = require('./whatsapp')
const { getAuthUrl } = require('./calendar')
const { google } = require('googleapis')
require('dotenv').config()

const app = express()
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper function to turn a robotic timestamp into a friendly human date/time
function formatHumanDateTime(isoString) {
    try {
        const dateObj = new Date(isoString);
        
        // Format the time cleanly (e.g., "1pm" or "1:30pm")
        let timeString = dateObj.toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).toLowerCase().replace(/ /g, '');
        
        // If it's a clean hour like "1:00pm", turn it into "1pm"
        timeString = timeString.replace(':00', '');

        // Format the day and month (e.g., "Wednesday, 24 June")
        const weekday = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long' });
        const day = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric' });
        const month = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', month: 'long' });
        const year = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', year: 'numeric' });

        // Add the English ordinal suffix (st, nd, rd, th) to the day number
        let suffix = 'th';
        if (day.endsWith('1') && !day.endsWith('11')) suffix = 'st';
        else if (day.endsWith('2') && !day.endsWith('12')) suffix = 'nd';
        else if (day.endsWith('3') && !day.endsWith('13')) suffix = 'rd';

        return `${timeString} on ${weekday}, ${day}${suffix} ${month} ${year}`;
    } catch (e) {
        // Fallback just in case
        return isoString;
    }
}

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

// STEP 2: Mounted your 3 new dashboard API endpoints right here
app.get('/api/students', getStudents);
app.patch('/api/students/:id', updateStudent);
app.post('/api/broadcast', broadcastMessage);

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
        
        // Extract student details safely
        const studentName = payload.attendees?.[0]?.name || 'Student';
        
        // Use our new human date formatter!
        const humanTime = formatHumanDateTime(payload.startTime);
        
        // Pull phone directly from the attendee metadata object
        let phoneField = payload.attendees?.[0]?.phoneNumber || payload.responses?.phone || '';
        
        if (phoneField) {
            phoneField = phoneField.replace(/\+/g, '').replace(/\s+/g, '').trim();
        }

        const addressField = payload.responses?.address?.value || payload.responses?.address || 'Not provided';

        console.log(`New Booking Received! Name: ${studentName}, Phone: ${phoneField}, Address: ${addressField}`);

        if (phoneField) {
            // Updated conversational tone message
            const message = `Hi ${studentName}, your 2-hour driving assessment is all confirmed for ${humanTime}. Looking forward to seeing you then!`;
            
            // Fire the text live
            await sendWhatsAppText(phoneField, message);
        } else {
            console.log(`⚠️ Could not send automated text: No phone number found for ${studentName}.`);
        }
    }

    // Always respond with a 200 OK so Cal.com knows we received it
    res.status(200).send('Webhook received');
});

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
