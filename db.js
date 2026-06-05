const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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
  
  // Remove client_id if null to avoid foreign key error
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

module.exports = { getClientByAssistantId, logCall, saveBooking }