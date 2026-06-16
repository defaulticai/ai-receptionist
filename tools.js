const { saveBooking, getBookingByDetails, updateBookingStatus, rescheduleBooking, logCall, getBookingByEmail } = require('./db')
const { createCalendarEvent, deleteCalendarEvent } = require('./calendar')
const { sendBookingConfirmation, sendCancellationConfirmation, sendRescheduleConfirmation } = require('./email')

async function runTool(toolName, params, client) {
  console.log('Running tool:', toolName, 'for client:', client.business_name)

  // Establish live authentication token configuration using environment variables
  const tokens = {
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  }

  if (toolName === 'get_availability') {
    try {
      return await getAvailabilityFromCalendar(params.date, tokens)
    } catch (err) {
      console.error('Calendar availability error:', err.message)
      // Fallback slot array if Google API encounters local operational blocks
      return {
        available: true,
        slots: ['9:00am', '11:00am', '2:00pm', '4:00pm'],
        date: params.date,
        transmission_type: params.transmission_type || 'manual'
      }
    }
  }

  if (toolName === 'create_booking') {
    console.log('CREATE BOOKING PARAMS:', JSON.stringify(params))
    
    let calendarEventId = null
    let liveBookingUrl = null

    // Execute real creation loop directly into live Google Calendar Architecture
    try {
      const calendarEvent = await createCalendarEvent(tokens, {
        caller_name: params.caller_name,
        caller_phone: params.caller_phone,
        property_address: params.property_address, // Maps structural parameter reference to pickup address
        date: params.date,
        time: params.time
      })
      calendarEventId = calendarEvent.id
      liveBookingUrl = calendarEvent.htmlLink
    } catch (err) {
      console.error('Live Google Calendar Insertion Error:', err.message)
    }

    // Generate real distinct booking ID string from the Google Resource Event ID block
    const uniqueRefId = calendarEventId ? `REFL-${calendarEventId.substring(0, 6).toUpperCase()}` : `REFL-${Math.floor(Math.random() * 10000)}`

    // Log tracking transaction details down to persistent database tier
    await saveBooking({
      client_id: client.id,
      caller_name: params.caller_name,
      caller_phone: params.caller_phone || null,
      caller_email: params.caller_email || null,
      property_address: params.property_address,
      appointment_type: params.transmission_type || 'manual',
      date: params.date,
      time: params.time,
      status: 'confirmed',
      booking_ref: uniqueRefId,
      calendar_event_id: calendarEventId
    }).catch(err => console.error('Database preservation crash:', err.message))

    logCall({
      client_id: client.id,
      caller_name: params.caller_name,
      caller_phone: params.caller_phone,
      action: 'booked',
      notes: `Driving lesson slot initialized for ${params.caller_name} at pickup location: ${params.property_address} on ${params.date} at ${params.time}`
    }).catch(err => console.error('Operational call log failure:', err.message))

    if (client.send_email_confirmation && params.caller_email) {
      try {
        await sendBookingConfirmation({
          callerName: params.caller_name,
          callerEmail: params.caller_email,
          propertyAddress: params.property_address,
          date: params.date,
          time: params.time,
          businessName: client.business_name
        })
      } catch (err) {
        console.error('Confirmation email output log failure:', err.message)
      }
    }

    return {
      success: true,
      bookingId: uniqueRefId,
      calendarLink: liveBookingUrl,
      message: `Booking confirmed for ${params.caller_name} on ${params.date} at ${params.time}`
    }
  }

  if (toolName === 'cancel_booking') {
    console.log('CANCEL BOOKING PARAMS:', JSON.stringify(params))

    const booking = await getBookingByDetails(
      params.caller_name,
      params.property_address,
      params.caller_phone,
      params.date
    )

    if (!booking) {
      logCall({
        client_id: client.id,
        caller_name: params.caller_name,
        caller_phone: params.caller_phone,
        action: 'cancel_failed',
        notes: `Could not target booking reference for cancellation processing — key phone: ${params.caller_phone} date: ${params.date}`
      }).catch(err => console.error('Log handling error:', err.message))

      return {
        success: false,
        message: 'I could not find a lesson booking matching those specific details. Could you please verify the name and pickup address sequence?'
      }
    }

    await updateBookingStatus(booking.id, 'cancelled')

    if (booking.calendar_event_id) {
      await deleteCalendarEvent(tokens, booking.calendar_event_id)
        .catch(err => console.error('Live Calendar elimination routine failure:', err.message))
    }

    logCall({
      client_id: client.id,
      caller_name: booking.caller_name,
      caller_phone: booking.caller_phone,
      action: 'cancelled',
      notes: `Driving Lesson at ${booking.property_address} on ${booking.date} at ${booking.time} has been wiped out.`,
      booking_id: booking.id
    }).catch(err => console.error('Log framework error:', err.message))

    return {
      success: true,
      message: `Cancelled. ${booking.caller_name}'s driving lesson assignment at ${booking.property_address} on ${booking.date} at ${booking.time} has been dropped successfully.`
    }
  }

  if (toolName === 'reschedule_booking') {
    console.log('RESCHEDULE BOOKING PARAMS:', JSON.stringify(params))

    const booking = await getBookingByDetails(
      params.caller_name,
      params.property_address,
      params.caller_phone,
      params.date
    )

    if (!booking) {
      return {
        success: false,
        message: 'I could not target a driving reservation matching those details.'
      }
    }

    if (booking.calendar_event_id) {
      await deleteCalendarEvent(tokens, booking.calendar_event_id)
        .catch(err => console.error('Calendar clear down step failure:', err.message))
    }

    let newCalendarEventId = null
    try {
      const calendarEvent = await createCalendarEvent(tokens, {
        caller_name: booking.caller_name,
        caller_phone: booking.caller_phone,
        property_address: booking.property_address,
        date: params.new_date,
        time: params.new_time
      })
      newCalendarEventId = calendarEvent.id
    } catch (err) {
      console.error('Calendar reset relocation exception error:', err.message)
    }

    await rescheduleBooking(booking.id, params.new_date, params.new_time, newCalendarEventId)

    return {
      success: true,
      message: `Rescheduled. ${booking.caller_name}'s driving lesson schedule has been moved to ${params.new_date} at ${params.new_time}.`
    }
  }

  if (toolName === 'confirm_booking') {
    console.log('CONFIRM BOOKING PARAMS:', JSON.stringify(params))

    const booking = await getBookingByEmail(params.caller_email)

    if (!booking) {
      return {
        success: false,
        message: 'I could not locate an established driving profile booking associated with that information.'
      }
    }

    return {
      success: true,
      message: `Confirmed. ${booking.caller_name}, your driving lesson pick up at ${booking.property_address} is locked in for ${booking.date} at ${booking.time}.`
    }
  }

  throw new Error('Unknown tool: ' + toolName)
}

async function getAvailabilityFromCalendar(date, tokens) {
  const { google } = require('googleapis')
  const { getOAuthClient } = require('./calendar')

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials(tokens)

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  const startOfDay = new Date(`${date}T00:00:00Z`)
  const endOfDay = new Date(`${date}T23:59:59Z`)

  // References variable target calendar ID string configuration dynamically
  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true
  })

  const bookedTimes = response.data.items.map(event => {
    const start = new Date(event.start.dateTime || event.start.date)
    const hours = start.getHours()
    const minutes = start.getMinutes()
    const period = hours >= 12 ? 'pm' : 'am'
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
    return `${displayHours}:${minutes.toString().padStart(2, '0')}${period}`
  })

  const allSlots = ['9:00am', '11:00am', '2:00pm', '4:00pm']
  const available = allSlots.filter(slot => !bookedTimes.includes(slot))

  return {
    available: available.length > 0,
    slots: available,
    date: date,
    type: 'driving_lesson'
  }
}

module.exports = { runTool }
