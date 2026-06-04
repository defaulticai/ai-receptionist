const { getClientByAssistantId } = require('./db')
const { runTool } = require('./tools')

async function routeToolCall(body) {
  console.log('Full request body:', JSON.stringify(body, null, 2))

  const assistantId = body?.call?.assistantId || body?.assistantId
  const toolName = body?.toolCalls?.[0]?.function?.name 
    || body?.name 
    || body?.function?.name
  const parameters = body?.toolCalls?.[0]?.function?.arguments 
    || body?.parameters 
    || body?.arguments 
    || {}

  console.log('Parsed:', { assistantId, toolName, parameters })

  const client = await getClientByAssistantId(assistantId)
  return runTool(toolName, parameters, client)
}

module.exports = { routeToolCall }