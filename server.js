 const express = require('express')
const { routeToolCall } = require('./router')
require('dotenv').config()

const app = express()
app.use(express.json())

app.post('/tool-call', async (req, res) => {
  try {
    const result = await routeToolCall(req.body)
    res.json({ result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/', (req, res) => {
  res.json({ status: 'AI Receptionist server is running' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
