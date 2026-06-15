const { checkContactPrivacy } = require('./interceptor');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// Initialize the Gemini AI engine using the key you saved in Railway
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
        
        // 2. Extract the clean phone number and message content
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

        // 3. Run the phone number through your privacy shield
        const privacyCheck = await checkContactPrivacy(senderNumber);
        
        if (!privacyCheck.allowAI) {
            console.log(`🛡️ INTERCEPTED: Blocked AI processing for ${privacyCheck.name || senderNumber}.`);
            console.log(`==================================================\n`);
            return; 
        }

        // 4. If cleared by the interceptor, pass it to Gemini
        console.log(`🟢 CLEARED: Forwarding to Gemini AI Brain...`);
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: messageText,
            config: {
                systemInstruction: "You are a helpful and polite receptionist assistant. Keep your answers brief, clear, and friendly.",
            }
        });

        const aiReply = response.text;
        console.log(`🤖 Gemini Generated Reply: "${aiReply}"`);

        // 5. Send the reply back out to WhatsApp via Evolution API
        // We use payload.server_url and payload.apikey so it automatically uses your live credentials!
        const evolutionUrl = `${payload.server_url}/message/sendText/${payload.instance}`;
        
        console.log(`📤 Sending reply back to WhatsApp...`);
        await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': payload.apikey
            },
            body: JSON.stringify({
                number: senderNumber,
                options: {
                    delay: 1200, // Makes it look realistic by waiting 1.2 seconds before replying
                    presence: 'composing' // Shows the "typing..." status on WhatsApp
                },
                textMessage: {
                    text: aiReply
                }
            })
        });

        console.log(`✅ Reply successfully sent!`);
        console.log(`==================================================\n`);
        
    } catch (error) {
        console.error('Error processing incoming WhatsApp webhook logic:', error);
    }
}

module.exports = handleIncomingWhatsApp;
