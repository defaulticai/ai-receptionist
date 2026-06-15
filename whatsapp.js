const { checkContactPrivacy } = require('./interceptor');
// 1. Change the package name to match your new package.json dependency
const { GoogleGenAI } = require('@google/generative-ai'); 
require('dotenv').config();

// 2. Initialize the client using the correct library syntax
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Handles incoming webhooks fired from your Evolution API container on Railway
 * @param {Object} payload - The raw data packet sent from Evolution API
 */
async function handleIncomingWhatsApp(payload) {
    try {
        // Ensure the webhook payload represents a new incoming message event (case-insensitive)
        if (!payload.event || payload.event.toLowerCase() !== 'messages.upsert' || payload.data?.key?.fromMe === true) {
            return; 
        }

        const messageData = payload.data;
        
        // Extract the clean phone number and message content
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

        // Run the phone number through your privacy shield
        const privacyCheck = await checkContactPrivacy(senderNumber);
        
        if (!privacyCheck.allowAI) {
            console.log(`🛡️ INTERCEPTED: Blocked AI processing for ${privacyCheck.name || senderNumber}.`);
            console.log(`==================================================\n`);
            return; 
        }

        console.log(`🟢 CLEARED: Forwarding to Gemini AI Brain...`);
        
        // Use the standard generation function for this package configuration
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: messageText,
            config: {
                systemInstruction: "You are a helpful and polite receptionist assistant. Keep your answers brief, clear, and friendly.",
            }
        });

        const aiReply = response.text;
        console.log(`🤖 Gemini Generated Reply: "${aiReply}"`);

        // Send the reply back out to WhatsApp via Evolution API
        const evolutionUrl = `${payload.server_url}/message/sendText/${payload.instance}`;
        
        console.log(`📤 Sending reply back to WhatsApp to URL: ${evolutionUrl}`);
        const apiResponse = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': payload.apikey
            },
            body: JSON.stringify({
                number: senderNumber,
                options: {
                    delay: 1200,
                    presence: 'composing'
                },
                textMessage: {
                    text: aiReply
                }
            })
        });

        const apiResult = await apiResponse.json().catch(() => ({}));
        console.log(`Evolution API Raw Response:`, JSON.stringify(apiResult));

        console.log(`✅ Reply attempt finished!`);
        console.log(`==================================================\n`);
        
    } catch (error) {
        console.error('Error processing incoming WhatsApp webhook logic:', error);
    }
}

module.exports = handleIncomingWhatsApp;
