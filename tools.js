const { saveBooking, getBookingByDetails, updateBookingStatus, rescheduleBooking, logCall, getBookingByEmail } = require('./db')
const { createCalendarEvent, deleteCalendarEvent } = require('./calendar')
const { sendBookingConfirmation, sendCancellationConfirmation, sendRescheduleConfirmation } = require('./email')

async function runTool(toolName, params, client) {
  console.log('Running tool:', toolName, 'for client:', client.business_name)

  if (toolName === 'get_availability') {
    const tokens = {
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    }
    try {
      return await getAvailabilityFromCalendar(params.date, tokens)
    } catch (err) {
      console.error('Calendar availability error:', err.message)
      return {
        available: true,
        slots: ['9:00am', '11:00am', '2:00pm', '4:00pm'],
        date: params.date,
        type: params.appointment_type
      }
    }
  }

  if (toolName === 'create_booking') {
    console.log('CREATE BOOKING PARAMS:', JSON.stringify(params))
    const result = createMockBooking(params)

    const tokens = {
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    }

    let calendarEventId = null
    try {
      const calendarEvent = await createCalendarEvent(tokens, {
        caller_name: params.caller_name,
        caller_phone: params.caller_phone,
        caller_email: params.caller_email,
        property_address: params.property_address,
        date: params.date,
        time: params.time
      })
      calendarEventId = calendarEvent.id
    } catch (err) {
      console.error('Calendar error:', err.message)
    }

    saveBooking({
      client_id: client.id,
      caller_name: params.caller_name || params.callerName || params.name,
      caller_phone: params.caller_phone || params.callerPhone || params.phone,
      caller_email: params.caller_email || null,
      property_address: params.property_address || params.propertyAddress || params.address,
      appointment_type: params.appointment_type || params.appointmentType || 'viewing',
      date: params.date,
      time: params.time,
      status: 'confirmed',
      booking_ref: result.bookingId,
      calendar_event_id: calendarEventId
    }).catch(err => console.error('Save error:', err.message))

    logCall({
      client_id: client.id,
      caller_name: params.caller_name,
      caller_phone: params.caller_phone,
      action: 'booked',
      notes: `Viewing booked at ${params.property_address} on ${params.date} at ${params.time}`
    }).catch(err => console.error('Log error:', err.message))

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
        console.error('Email error:', err.message)
      }
    }

    if (client.business_email) {
      try {
        await sendBookingConfirmation({
          callerName: client.business_name,
          callerEmail: client.business_email,
          propertyAddress: params.property_address,
          date: params.date,
          time: params.time,
          businessName: `New booking from ${params.caller_name} (${params.caller_phone})`
        })
      } catch (err) {
        console.error('Email error:', err.message)
      }
    }

    return result
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
        notes: `Could not find booking to cancel — searched by phone ${params.caller_phone} date ${params.date}`
      }).catch(err => console.error('Log error:', err.message))

      return {
        success: false,
        message: 'I could not find a booking matching those details. Could you double check the name and property address?'
      }
    }

    await updateBookingStatus(booking.id, 'cancelled')

    if (booking.calendar_event_id) {
      const tokens = {
        access_token: process.env.GOOGLE_ACCESS_TOKEN,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      }
      deleteCalendarEvent(tokens, booking.calendar_event_id)
        .catch(err => console.error('Calendar delete error:', err.message))
    }

    logCall({
      client_id: client.id,
      caller_name: booking.caller_name,
      caller_phone: booking.caller_phone,
      action: 'cancelled',
      notes: `Viewing at ${booking.property_address} on ${booking.date} at ${booking.time} cancelled`,
      booking_id: booking.id
    }).catch(err => console.error('Log error:', err.message))

    if (client.send_email_confirmation && params.caller_email) {
      try {
        await sendCancellationConfirmation({
          callerName: booking.caller_name,
          callerEmail: params.caller_email,
          propertyAddress: booking.property_address,
          date: booking.date,
          time: booking.time,
          businessName: client.business_name
        })
      } catch (err) {
        console.error('Email error:', err.message)
      }
    }

    if (client.business_email) {
      try {
        await sendCancellationConfirmation({
          callerName: client.business_name,
          callerEmail: client.business_email,
          propertyAddress: booking.property_address,
          date: booking.date,
          time: booking.time,
          businessName: `Cancelled by ${booking.caller_name} (${booking.caller_phone})`
        })
      } catch (err) {
        console.error('Email error:', err.message)
      }
    }

    return {
      success: true,
      message: `Cancelled. ${booking.caller_name}'s viewing at ${booking.property_address} on ${booking.date} at ${booking.time} has been cancelled.`
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
      logCall({
        client_id: client.id,
        caller_name: params.caller_name,
        caller_phone: params.caller_phone,
        action: 'reschedule_failed',
        notes: `Could not find booking to reschedule — searched by phone ${params.caller_phone} date ${params.date}`
      }).catch(err => console.error('Log error:', err.message))

      return {
        success: false,
        message: 'I could not find a booking matching those details. Could you double check the name and date?'
      }
    }

    const tokens = {
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    }

    if (booking.calendar_event_id) {
      deleteCalendarEvent(tokens, booking.calendar_event_id)
        .catch(err => console.error('Calendar delete error:', err.message))
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
      console.error('Calendar error:', err.message)
    }

    await rescheduleBooking(booking.id, params.new_date, params.new_time, newCalendarEventId)

    logCall({
      client_id: client.id,
      caller_name: booking.caller_name,
      caller_phone: booking.caller_phone,
      action: 'rescheduled',
      notes: `Viewing at ${booking.property_address} moved from ${booking.date} at ${booking.time} to ${params.new_date} at ${params.new_time}`,
      booking_id: booking.id
    }).catch(err => console.error('Log error:', err.message))

    if (client.send_email_confirmation && params.caller_email) {
      try {
        await sendRescheduleConfirmation({
          callerName: booking.caller_name,
          callerEmail: params.caller_email,
          propertyAddress: booking.property_address,
          oldDate: booking.date,
          oldTime: booking.time,
          newDate: params.new_date,
          newTime: params.new_time,
          businessName: client.business_name
        })
      } catch (err) {
        console.error('Email error:', err.message)
      }
    }

    if (client.business_email) {
      try {
        await sendRescheduleConfirmation({
          callerName: client.business_name,
          callerEmail: client.business_email,
          propertyAddress: booking.property_address,
          oldDate: booking.date,
          oldTime: booking.time,
          newDate: params.new_date,
          newTime: params.new_time,
          businessName: `Rescheduled by ${booking.caller_name} (${booking.caller_phone})`
        })
      } catch (err) {
        console.error('Email error:', err.message)
      }
    }

    return {
      success: true,
      message: `Rescheduled. ${booking.caller_name}'s viewing at ${booking.property_address} has been moved to ${params.new_date} at ${params.new_time}.`
    }
  }

  if (toolName === 'confirm_booking') {
    console.log('CONFIRM BOOKING PARAMS:', JSON.stringify(params))

    const booking = await getBookingByEmail(params.caller_email)

    if (!booking) {
      return {
        success: false,
        message: 'I could not find a confirmed booking for that email address. Could you double check the email you used when booking?'
      }
    }

    logCall({
      client_id: client.id,
      caller_name: booking.caller_name,
      caller_phone: booking.caller_phone,
      action: 'confirmed_check',
      notes: `Caller checked booking at ${booking.property_address} on ${booking.date} at ${booking.time}`,
      booking_id: booking.id
    }).catch(err => console.error('Log error:', err.message))

    return {
      success: true,
      message: `Confirmed. ${booking.caller_name}, your viewing at ${booking.property_address} is confirmed for ${booking.date} at ${booking.time}.`
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

  const response = await calendar.events.list({
    calendarId: 'primary',
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
    type: 'viewing'
  }
}

function createMockBooking(params) {
  return {
    success: true,
    bookingId: 'MOCK-' + Math.floor(Math.random() * 10000),
    message: `Booking confirmed for ${params.caller_name} on ${params.date} at ${params.time}`
  }
}

module.exports = { runTool }