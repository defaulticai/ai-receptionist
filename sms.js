 async function sendSMS(to, message) {
  // Mock SMS for testing — we'll replace this with Twilio later
  console.log('SMS would be sent to:', to)
  console.log('Message:', message)
}

module.exports = { sendSMS }
