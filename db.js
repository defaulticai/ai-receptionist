async function getClientByAssistantId(assistantId) {
  // Mock client for testing — we'll replace this with Supabase later
  return {
    id: 1,
    business_name: 'Prestige Property',
    assistant_id: assistantId,
    booking_system: 'mock',
    api_key: null
  }
}

async function logCall(entry) {
  // Mock log for testing — we'll replace this with Supabase later
  console.log('Call log:', entry)
}

module.exports = { getClientByAssistantId, logCall }
