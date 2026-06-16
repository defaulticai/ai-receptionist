const express = require('express')
const basicAuth = require('express-basic-auth') // Added security package
const { routeToolCall, handleWhatsAppWebhook, getStudents, updateStudent, createStudent } = require('./router')
const { sendWhatsAppText } = require('./whatsapp')
const { getAuthUrl } = require('./calendar')
const { google } = require('googleapis')
require('dotenv').config()

const app = express()
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 🔒 LOCK THE DOOR FOR GERALD
const geraldProtector = basicAuth({
    users: { 'gerald': 'geraldmvp2026' }, // Username: gerald | Password: geraldmvp2026
    challenge: true,
    unauthorizedResponse: 'Unauthorized access.'
})

// Serve static assets from public safely behind basic authentication credentials
app.use('/dashboard', geraldProtector, express.static('public', { index: 'dashboard.html' }));

// Helper function to convert robotic timestamps into a friendly human format
function formatHumanDateTime(isoString) {
    try {
        const dateObj = new Date(isoString);
        let timeString = dateObj.toLocaleTimeString('en-GB', {
            timeZone: 'Europe/London',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).toLowerCase().replace(/ /g, '');
        
        timeString = timeString.replace(':00', '');

        const weekday = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long' });
        const day = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric' });
        const month = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', month: 'long' });
        const year = dateObj.toLocaleDateString('en-GB', { timeZone: 'Europe/London', year: 'numeric' });

        let suffix = 'th';
        if (day.endsWith('1') && !day.endsWith('11')) suffix = 'st';
        else if (day.endsWith('2') && !day.endsWith('12')) suffix = 'nd';
        else if (day.endsWith('3') && !day.endsWith('13')) suffix = 'rd';

        return `${timeString} on ${weekday}, ${day}${suffix} ${month} ${year}`;
    } catch (e) {
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

// Webhook / API Endpoints
app.post('/webhooks/whatsapp', handleWhatsAppWebhook)

// These APIs handle data exchange for the dashboard table behind the scenes
app.get('/api/students', getStudents);
app.patch('/api/students/:id', updateStudent);

// Fixed: Clean architecture handling without causing inline arrow syntax error bugs
app.post('/api/students', async (req, res) => {
    // If router exports a custom handler, delegate directly to it
    if (typeof createStudent === 'function') {
        return createStudent(req, res);
    }
    
    // Otherwise, perform the direct inline database insertion fallback safely
    try {
        const { name, phone } = req.body;
        const { data, error } = await require('./supabaseClient').supabase
            .from('students')
            .insert([{ 
                name, 
                phone, 
                driving_status: 'not_started', 
                theory_passed: false, 
                payment_status: 'Paid',
                test_date: 'None Assigned'
            }]);
            
        if (error) throw error;
        res.status(201).json({ success: true, data });
    } catch(err) {
        console.error('Error creating user profile node inside database stub:', err);
        res.status(500).json({ error: err.message });
    }
});

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

    if (booking.triggerEvent === 'BOOKING_CREATED') {
        const payload = booking.payload;
        const studentName = payload.attendees?.[0]?.name || 'Student';
        const humanTime = formatHumanDateTime(payload.startTime);
        
        let phoneField = payload.attendees?.[0]?.phoneNumber || payload.responses?.phone || '';
        if (phoneField) {
            phoneField = phoneField.replace(/\+/g, '').replace(/\s+/g, '').trim();
        }

        const addressField = payload.responses?.address?.value || payload.responses?.address || 'Not provided';

        console.log(`New Booking Received! Name: ${studentName}, Phone: ${phoneField}, Address: ${addressField}`);

        if (phoneField) {
            const message = `Hi ${studentName}, your 2-hour driving assessment is all confirmed for ${humanTime}. Looking forward to seeing you then!`;
            await sendWhatsAppText(phoneField, message);
        } else {
            console.log(`⚠️ Could not send automated text: No phone number found for ${studentName}.`);
        }
    }
    res.status(200).send('Webhook received');
});

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
