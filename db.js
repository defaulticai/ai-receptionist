const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    db: { schema: 'public' }
  }
)

async function getClientByAssistantId(assistantId) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('assistant_id', assistantId)
    .single()

  if (error) {
    console.log('Client not found, using default mock client')
    return {
      id: null,
      business_name: 'Prestige Property',
      assistant_id: assistantId,
      booking_system: 'mock',
      api_key: null
    }
  }

  return data
}

async function logCall(entry) {
  const { error } = await supabase
    .from('call_logs')
    .insert(entry)

  if (error) console.error('Log error:', error.message)
}

async function saveBooking(booking) {
  console.log('Attempting to save booking:', JSON.stringify(booking))
  
  if (!booking.client_id) {
    delete booking.client_id
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert(booking)
    .select()

  if (error) {
    console.error('Booking save error:', JSON.stringify(error))
  } else {
    console.log('Booking saved successfully:', JSON.stringify(data))
  }
}

async function getBookingByDetails(callerName, propertyAddress) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .ilike('caller_name', `%${callerName}%`)
    .ilike('property_address', `%${propertyAddress}%`)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.error('Get booking error:', error.message)
    return null
  }
  return data
}

async function updateBookingStatus(bookingId, status) {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)

  if (error) console.error('Update booking error:', error.message)
}

module.exports = { getClientByAssistantId, logCall, saveBooking, getBookingByDetails, updateBookingStatus }