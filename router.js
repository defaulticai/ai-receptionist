const { getClientByAssistantId } = require('./db')
const { runTool } = require('./tools')
const whatsappHandler = require('./whatsapp') // Import your whatsapp helper file

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

// New Express webhook handler function for Evolution API
async function handleWhatsAppWebhook(req, res) {
  try {
    console.log('Incoming WhatsApp Webhook Data:', JSON.stringify(req.body));
    
    // Pass the webhook data payload straight to your whatsapp.js file logic
    await whatsappHandler(req.body);
    
    // Always tell Evolution API we received the message successfully
    return res.status(200).send({ status: 'success' });
  } catch (error) {
    console.error('Error in WhatsApp webhook endpoint:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
}

module.exports = { 
  routeToolCall,
  handleWhatsAppWebhook 
}
