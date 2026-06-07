const { saveBooking, getBookingByDetails, updateBookingStatus } = require('./db')
const { createCalendarEvent, deleteCalendarEvent } = require('./calendar')

async function runTool(toolName, params, client) {
  console.log('Running tool:', toolName, 'for client:', client.business_name)

  if (toolName === 'get_availability') {
    return getMockAvailability(params.date, params.appointment_type)
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
        property_address: params.property_address,
        date: params.date,
        time: params.time
      })
      calendarEventId = calendarEvent.id
      console.log('Calendar event ID:', calendarEventId)
    } catch (err) {
      console.error('Calendar error:', err.message)
    }

    saveBooking({
      client_id: client.id,
      caller_name: params.caller_name || params.callerName || params.name,
      caller_phone: params.caller_phone || params.callerPhone || params.phone,
      property_address: params.property_address || params.propertyAddress || params.address,
      appointment_type: params.appointment_type || params.appointmentType || 'viewing',
      date: params.date,
      time: params.time,
      status: 'confirmed',
      booking_ref: result.bookingId,
      calendar_event_id: calendarEventId
    }).catch(err => console.error('Save error:', err.message))

    return result
  }

  if (toolName === 'cancel_booking') {
    console.log('CANCEL BOOKING PARAMS:', JSON.stringify(params))

    const booking = await getBookingByDetails(
      params.caller_name,
      params.property_address
    )

    if (!booking) {
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

    return {
      success: true,
      message: `Cancelled. ${booking.caller_name}'s viewing at ${booking.property_address} on ${booking.date} at ${booking.time} has been cancelled.`
    }
  }

  if (toolName === 'reschedule_booking') {
    return rescheduleMockBooking(params)
  }

  throw new Error('Unknown tool: ' + toolName)
}

function getMockAvailability(date, type) {
  return {
    available: true,
    slots: ['9:00am', '11:00am', '2:00pm', '4:00pm'],
    date: date,
    type: type
  }
}

function createMockBooking(params) {
  return {
    success: true,
    bookingId: 'MOCK-' + Math.floor(Math.random() * 10000),
    message: `Booking confirmed for ${params.caller_name} on ${params.date} at ${params.time}`
  }
}

function rescheduleMockBooking(params) {
  return {
    success: true,
    message: `Booking rescheduled for ${params.caller_name} to ${params.new_date} at ${params.new_time}`
  }
}

module.exports = { runTool }