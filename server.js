const express = require('express')
const basicAuth = require('express-basic-auth')
const fs = require('fs');
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
    users: { 'gerald': 'geraldmvp2026' },
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

// --- LIVE SUPABASE DASHBOARD HANDLERS ---

app.get('/api/students', getStudents);
app.patch('/api/students/:id', updateStudent);

app.post('/api/students', async (req, res) => {
    try {
        const { supabase } = require('./db');
        const { name, phone } = req.body;
        
        if (!supabase) throw new Error('Supabase client missing from db module.');

        const { data, error } = await supabase
            .from('contacts')
            .insert([
                {
                    name: name,
                    phone: phone,
                    driving_status: 'not_started',
                    theory_passed: false,
                    payment_status: 'Paid',
                    test_date: 'None Assigned'
                }
            ])
            .select();

        if (error) throw error;
        
        console.log(`Successfully added student to live Supabase contacts table: ${name}`);
        res.status(201).json(data[0]);
    } catch(err) {
        console.error('Supabase dashboard insert error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- LIVE GOOGLE CALENDAR SYNC ENDPOINT ---
app.get('/api/calendar-events', async (req, res) => {
    try {
        let tokens;
        if (fs.existsSync('./tokens.json')) {
            tokens = JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
        } else if (process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN) {
            tokens = {
                access_token: process.env.GOOGLE_ACCESS_TOKEN,
                refresh_token: process.env.GOOGLE_REFRESH_TOKEN
            };
        }

        if (!tokens) {
            console.warn("No calendar sync keys found in local filesystem or environment.");
            return res.json({}); 
        }

        const { getOAuthClient } = require('./calendar');
        const oauth2Client = getOAuthClient();
        oauth2Client.setCredentials(tokens);

        const calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
        
        const response = await calendarClient.events.list({
            calendarId: 'primary',
            timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), 
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const googleEvents = response.data.items || [];
        const formattedRegistry = {};
        
        googleEvents.forEach(event => {
            const startDateTime = event.start.dateTime || event.start.date;
            if (!startDateTime) return;
            
            const dateKey = startDateTime.split('T')[0]; 
            
            let timeString = "All Day";
            if (event.start.dateTime && event.end.dateTime) {
                const start = new Date(event.start.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const end = new Date(event.end.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                timeString = `${start} - ${end}`;
            }

            if (!formattedRegistry[dateKey]) {
                formattedRegistry[dateKey] = [];
            }

            formattedRegistry[dateKey].push({
                name: event.summary || "Driving Lesson",
                type: event.description ? event.description.substring(0, 40) : "Cal.com Appointment",
                location: event.location || "Maidstone Route Area",
                time: timeString
            });
        });

        res.json(formattedRegistry);
    } catch (err) {
        console.error("Error fetching Google Calendar:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------

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
    
    console.log('GOOGLE TOKENS RECEIVED:', JSON.stringify(tokens))
    fs.writeFileSync('./tokens.json', JSON.stringify(tokens, null, 2));
    
    res.send('Connected! Your calendar is now linked. You can close this tab and refresh your dashboard.');
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
