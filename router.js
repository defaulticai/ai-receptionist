const { getClientByAssistantId, supabase } = require('./db'); // Added supabase import here
const { runTool } = require('./tools');
const { handleIncomingWhatsApp, sendWhatsAppText } = require('./whatsapp'); // Imported sendWhatsAppText for broadcasting

async function routeToolCall(body) {
  console.log('BODY:', JSON.stringify(body))

  const assistantId = 
    body?.message?.call?.assistantId ||
    body?.call?.assistantId ||
    body?.assistantId ||
    'unknown'

  const toolCall = 
    body?.message?.toolCalls?.[0] ||
    body?.toolCalls?.[0]

  const toolName = toolCall?.function?.name
  const parameters = toolCall?.function?.arguments || {}

  console.log('Tool:', toolName, 'Params:', parameters)

  const client = await getClientByAssistantId(assistantId)
  return runTool(toolName, parameters, client)
}

async function handleWhatsAppWebhook(req, res) {
  try {
    console.log('Incoming WhatsApp Webhook Data:', JSON.stringify(req.body));
    await handleIncomingWhatsApp(req.body); 
    return res.status(200).send({ status: 'success' });
  } catch (error) {
    console.error('Error in WhatsApp webhook endpoint:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
}

// ----------------------------------------------------------------
// NEW MVP DASHBOARD ENDPOINTS
// ----------------------------------------------------------------

// 1. Fetch all student profiles from Supabase
async function getStudents(req, res) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching students:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// 2. Update a student's profile checkboxes or fields dynamically
async function updateStudent(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body; // e.g. { theory_passed: true }

    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error updating student:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// 3. Loop through active student records and dispatch a mass text blast via WhatsApp
async function broadcastMessage(req, res) {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message content is required.' });

    // Grab only active students who have valid phone numbers
    const { data: students, error } = await supabase
      .from('contacts')
      .select('phone')
      .not('phone', 'is', null);

    if (error) throw error;

    console.log(`📣 BROADCAST ENGINE STARTED: Blasting to ${students.length} numbers...`);

    // Loop through records and cleanly space execution to maintain network hygiene
    for (const student of students) {
      if (student.phone) {
        await sendWhatsAppText(student.phone, message);
        // Half-second buffer between dispatches to keep your API traffic clean
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return res.status(200).json({ success: true, sentCount: students.length });
  } catch (error) {
    console.error('Error executing broadcast engine:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { 
  routeToolCall,
  handleWhatsAppWebhook,
  getStudents,
  updateStudent,
  broadcastMessage
};
