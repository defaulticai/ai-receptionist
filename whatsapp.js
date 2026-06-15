const { checkContactPrivacy } = require('./interceptor');
require('dotenv').config();

/**
 * Handles incoming webhooks fired from your Evolution API container on Railway
 * @param {Object} payload - The raw data packet sent from Evolution API
 */
async function handleIncomingWhatsApp(payload) {
    try {
        // 1. Ensure the webhook payload represents a new incoming message event
        if (payload.event !== 'MESSAGES_UPSERT' || payload.data?.key?.fromMe === true) {
            return; 
        }

        const messageData = payload.data;
        
        // 2. Extract the clean phone number and message content from Evolution API's payload
        // Evolution JIDs look like "447123456789@s.whatsapp.net", so we split it to get just the number
        const rawRemoteJid = messageData.key?.remoteJid || '';
        const senderNumber = rawRemoteJid.split('@')[0];
        
        const messageText = messageData.message?.conversation || 
                            messageData.message?.extendedTextMessage?.text || 
                            '';

        if (!senderNumber || !messageText) {
            return;
        }

        console.log(`\n==================================================`);
        console.log(`📩 New message from ${senderNumber}: "${messageText}"`);

        // 3. Run the phone number through your security privacy shield
        const privacyCheck = await checkContactPrivacy(senderNumber);
        
        if (!privacyCheck.allowAI) {
            console.log(`🛡️ INTERCEPTED: Blocked AI processing for ${privacyCheck.name || senderNumber}. Reason: ${privacyCheck.reason}`);
            console.log(`==================================================\n`);
            return; // Stops execution immediately. The AI will never see this text.
        }

        // 4. If cleared by the interceptor, pass it to your business flow
        console.log(`🟢 CLEARED: Contact is a ${privacyCheck.reason} (${privacyCheck.name}). Forwarding to AI Brain...`);
        console.log(`==================================================\n`);

        // TODO: Next step will be hooking up Gemini API right here to read 'messageText' and answer back!
        
    } catch (error) {
        console.error('Error processing incoming WhatsApp webhook logic:', error);
    }
}

// Export it as a plain function so router.js can invoke it directly via: await whatsappHandler(req.body)
module.exports = handleIncomingWhatsApp;
