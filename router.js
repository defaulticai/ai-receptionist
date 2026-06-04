const { getClientByAssistantId } = require('./db')
const { runTool } = require('./tools')

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

module.exports = { routeToolCall }