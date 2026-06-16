const express = require('express')
const basicAuth = require('express-basic-auth') // Added security package
const { routeToolCall, handleWhatsAppWebhook, getStudents, updateStudent } = require('./router')
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

// Local in-memory storage array for tracking dashboard-only students
let localDashboardStudents = [];

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

// --- DASHBOARD MEMORY HANDLERS ---

// Returns the local runtime student list to feed the tracking UI
app.get('/api/students', (req, res) => {
    res.json(localDashboardStudents);
});

// Appends manually entered profiles instantly to local memory loop
app.post('/api/students', (req, res) => {
    try {
        const { name, phone } = req.body;
        
        const newStudent = {
            id: 'local_' + Date.now(),
            name: name,
            phone: phone,
            driving_status: 'not_started',
            theory_passed: false,
            payment_status: 'Paid',
            test_date: 'None Assigned'
        };

        localDashboardStudents.push(newStudent);
        console.log(`Successfully added student to local dashboard memory: ${name}`);
        res.status(201).json(newStudent);
    } catch(err) {
        console.error('Local memory storage error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Handles field toggles and dropdown edits within the frontend table row matrices
app.patch('/api/students/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const index = localDashboardStudents.findIndex(s => s.id === id);
        if (index !== -1) {
            localDashboardStudents[index] = { ...localDashboardStudents[index], ...updates };
            return res.json({ success: true, data: localDashboardStudents[index] });
        }
        
        res.status(404).json({ error: "Student profile index location not found." });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------

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
