const { logCall, saveBooking } = require('./db') 
 
 async function runTool(toolName, params, client) {
  console.log('Running tool:', toolName, 'for client:', client.business_name)

  if (toolName === 'get_availability') {
    return getMockAvailability(params.date, params.appointment_type)
  }

  if (toolName === 'create_booking') {
    result = createMockBooking(params)
    await saveBooking({
      client_id: client.id,
      caller_name: params.caller_name,
      caller_phone: params.caller_phone,
      property_address: params.property_address,
      appointment_type: params.appointment_type,
      date: params.date,
      time: params.time,
      status: 'confirmed',
      booking_ref: result.bookingId
    })
  }

  if (toolName === 'cancel_booking') {
    return cancelMockBooking(params)
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

function cancelMockBooking(params) {
  return {
    success: true,
    message: `Booking cancelled for ${params.caller_name}`
  }
}

function rescheduleMockBooking(params) {
  return {
    success: true,
    message: `Booking rescheduled for ${params.caller_name} to ${params.new_date} at ${params.new_time}`
  }
}

module.exports = { runTool }