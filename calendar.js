const { google } = require('googleapis')

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/auth/google/callback'
  )
}

function getAuthUrl() {
  const oauth2Client = getOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent'
  })
}

async function createCalendarEvent(tokens, booking) {
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials(tokens)

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  const startDateTime = new Date(`${booking.date}T${convertTo24Hour(booking.time)}:00`)
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000) // 1 hour

  const event = {
    summary: `Property Viewing — ${booking.property_address}`,
    description: `Caller: ${booking.caller_name}\nPhone: ${booking.caller_phone}\nBooked via AI Receptionist`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'Europe/London'
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'Europe/London'
    }
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event
  })

  console.log('Calendar event created:', response.data.htmlLink)
  return response.data
}

function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(/(?=[ap]m)/i)
  let [hours, minutes] = time.split(':')
  if (!minutes) minutes = '00'
  if (modifier.toLowerCase() === 'pm' && hours !== '12') {
    hours = parseInt(hours, 10) + 12
  }
  if (modifier.toLowerCase() === 'am' && hours === '12') {
    hours = '00'
  }
  return `${String(hours).padStart(2, '0')}:${minutes}`
}

module.exports = { getAuthUrl, createCalendarEvent }