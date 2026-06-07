const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendBookingConfirmation({ callerName, callerEmail, propertyAddress, date, time, businessName, businessPhone }) {
  try {
    await resend.emails.send({
      from: 'Prestige Property <onboarding@resend.dev>',
      to: callerEmail,
      subject: `Your viewing is confirmed — ${propertyAddress}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Viewing Confirmed</h2>
          <p>Hi ${callerName},</p>
          <p>Your viewing has been confirmed:</p>
          <table style="width:100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; font-weight: bold;">Property</td>
              <td style="padding: 8px;">${propertyAddress}</td>
            </tr>
            <tr style="background:#f9f9f9">
              <td style="padding: 8px; font-weight: bold;">Date</td>
              <td style="padding: 8px;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Time</td>
              <td style="padding: 8px;">${time}</td>
            </tr>
          </table>
          <p>If you need to make any changes please call us back.</p>
          <p>Best regards,<br/><strong>${businessName}</strong><br/>${businessPhone || ''}</p>
        </div>
      `
    })
    console.log('Confirmation email sent to:', callerEmail)
  } catch (err) {
    console.error('Email error:', err.message)
  }
}

async function sendCancellationConfirmation({ callerName, callerEmail, propertyAddress, date, time, businessName }) {
  try {
    await resend.emails.send({
      from: 'Prestige Property <onboarding@resend.dev>',
      to: callerEmail,
      subject: `Your viewing has been cancelled — ${propertyAddress}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Viewing Cancelled</h2>
          <p>Hi ${callerName},</p>
          <p>Your viewing at <strong>${propertyAddress}</strong> on <strong>${date}</strong> at <strong>${time}</strong> has been cancelled.</p>
          <p>If you'd like to rebook please call us back.</p>
          <p>Best regards,<br/><strong>${businessName}</strong></p>
        </div>
      `
    })
    console.log('Cancellation email sent to:', callerEmail)
  } catch (err) {
    console.error('Email error:', err.message)
  }
}

async function sendRescheduleConfirmation({ callerName, callerEmail, propertyAddress, oldDate, oldTime, newDate, newTime, businessName }) {
  try {
    await resend.emails.send({
      from: 'Prestige Property <onboarding@resend.dev>',
      to: callerEmail,
      subject: `Your viewing has been rescheduled — ${propertyAddress}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Viewing Rescheduled</h2>
          <p>Hi ${callerName},</p>
          <p>Your viewing at <strong>${propertyAddress}</strong> has been moved:</p>
          <table style="width:100%; border-collapse: collapse;">
            <tr style="background:#f9f9f9">
              <td style="padding: 8px; font-weight: bold;">New Date</td>
              <td style="padding: 8px;">${newDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">New Time</td>
              <td style="padding: 8px;">${newTime}</td>
            </tr>
          </table>
          <p>If you need to make any changes please call us back.</p>
          <p>Best regards,<br/><strong>${businessName}</strong></p>
        </div>
      `
    })
    console.log('Reschedule email sent to:', callerEmail)
  } catch (err) {
    console.error('Email error:', err.message)
  }
}

module.exports = { sendBookingConfirmation, sendCancellationConfirmation, sendRescheduleConfirmation }