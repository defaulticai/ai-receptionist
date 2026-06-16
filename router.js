const { getClientByAssistantId, supabase } = require('./db'); 
const { runTool } = require('./tools');
const { handleIncomingWhatsApp, sendWhatsAppText } = require('./whatsapp'); 

async function routeToolCall(body) {
  console.log('BODY:', JSON.stringify(body))
  const assistantId = body?.message?.call?.assistantId || body?.call?.assistantId || body?.assistantId || 'unknown'
  const toolCall = body?.message?.toolCalls?.[0] || body?.toolCalls?.[0]
  const toolName = toolCall?.function?.name
  const parameters = toolCall?.function?.arguments || {}
  const client = await getClientByAssistantId(assistantId)
  return runTool(toolName, parameters, client)
}

async function handleWhatsAppWebhook(req, res) {
  try {
    console.log('Incoming WhatsApp Webhook Data:', JSON.stringify(req.body));
    
    // Extract metadata safely from the WhatsApp webhook structure
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const messageData = change?.value?.messages?.[0];

    if (messageData) {
      const fromNumber = messageData.from; // e.g., "447824012556"
      const messageText = messageData.text?.body || messageData.button?.text || '';

      if (messageText && fromNumber) {
        // Log the student's incoming message straight to Supabase
        await supabase
          .from('message_logs')
          .insert([
            {
              phone_number: fromNumber,
              message_body: messageText,
              sender: 'student'
            }
          ]);
        console.log(`💾 Logged incoming text from ${fromNumber} to message_logs`);
      }
    }

    // Hand over to the existing AI logic
    await handleIncomingWhatsApp(req.body); 
    return res.status(200).send({ status: 'success' });
  } catch (error) {
    console.error('Error in WhatsApp webhook endpoint:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
}

// 1. Fetch all student profiles from Supabase safely
async function getStudents(req, res) {
  try {
    if (!supabase) {
      console.error('❌ Supabase instance is completely missing from imports.');
      return res.status(500).json([]);
    }

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return res.status(200).json(data || []);
  } catch (error) {
    console.error('Error fetching students:', error.message);
    return res.status(500).json([]); 
  }
}

// 2. Update a student's profile checkboxes or fields dynamically
async function updateStudent(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body; 

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

    const { data: students, error } = await supabase
      .from('contacts')
      .select('phone')
      .not('phone', 'is', null);

    if (error) throw error;

    console.log(`📣 BROADCAST ENGINE STARTED: Blasting to ${students.length} numbers...`);

    for (const student of students) {
      if (student.phone) {
        await sendWhatsAppText(student.phone, message);
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
