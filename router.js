const { getClientByAssistantId } = require('./db')
const { runTool } = require('./tools')

async function routeToolCall(body) {
  const { message } = body
  
  const assistantId = message?.call?.assistantId
  const toolName = message?.toolCalls?.[0]?.function?.name
  const parameters = message?.toolCalls?.[0]?.function?.arguments

  console.log('Incoming tool call:', { assistantId, toolName, parameters })

  const client = await getClientByAssistantId(assistantId)
  if (!client) throw new Error('Unknown assistant: ' + assistantId)

  return runTool(toolName, parameters, client)
}

module.exports = { routeToolCall }
