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
  const { error } = await supabase
    .from('bookings')
    .insert(booking)

  if (error) console.error('Booking save error:', error.message)
}

module.exports = { getClientByAssistantId, logCall, saveBooking }