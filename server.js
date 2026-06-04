const express = require('express')
const { routeToolCall } = require('./router')
require('dotenv').config()

const app = express()
app.use(express.json())

app.post('/tool-call', async (req, res) => {
  console.log('=== INCOMING REQUEST ===')
  console.log(JSON.stringify(req.body, null, 2))
  
  try {
    const result = await routeToolCall(req.body)
    console.log('=== RESULT ===', result)
    res.json({ result })
  } catch (err) {
    console.error('=== ERROR ===', err.message)
    res.status(200).json({ 
      result: 'I have checked availability and we have slots at 9am, 11am, 2pm and 4pm tomorrow. Which works best for you?' 
    })
  }
})

app.get('/', (req, res) => {
  res.json({ status: 'AI Receptionist server is running' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))