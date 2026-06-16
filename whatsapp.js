const { checkContactPrivacy } = require('./interceptor');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const { createClient } = require('redis');
require('dotenv').config();

// 1. Initialize Gemini
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. Initialize Redis Client (Railway automatically provides process.env.REDIS_URL to your environment)
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis immediately when the server starts
(async () => {
    try {
        await redisClient.connect();
        console.log('🏁 Connected to Redis Database for Chat Memory.');
    } catch (err) {
        console.error('❌ Failed to connect to Redis:', err);
    }
})();

// Define Gerald Driver Training Business Instructions
const SYSTEM_INSTRUCTION = `
You are an expert, friendly, and polite AI receptionist for "Gerald Driver Training", a premium driving school based in Staines-upon-Thames (Postcode: TW19 7AQ).
Your job is to answer questions, provide pricing, and guide clients toward booking a lesson.

BUSINESS INFO:
- Instructors: Gerald and Zahid.
- Tuition Offered: Both Manual and Automatic cars. All cars are dual-controlled for safety.
- Service Features: Client-centred approach, customized lesson plans, pickup & drop-off service included, online resources (quizzes/videos).
- Areas Covered: Staines, Stanwell, Hounslow, Feltham, Spelthorne, and surrounding areas.
- Standard Hours: 09:00 – 17:00, Monday to Saturday.

PRICING STRUCTURE:
- 1 Hour standard lesson: £46
- 1.5 Hours standard lesson: £69
- 2 Hours standard lesson: £92
- After 5 PM or Weekends (Premium Rate): £50 per hour
- Mock Test: £60
- Refresher Lessons / International Licence conversions: Rates are negotiated/tailored based on experience.

CONVERSATION RULES:
- Keep your answers brief, clear, natural, and helpful. 
- Use UK English (e.g., "licence", "customised").
- Always look at the chat history provided to remember the customer's name, their chosen car type (manual/automatic), or details they mentioned earlier. Don't repeat yourself.
- If they ask to book a slot, tell them you can check availability for them, but do not finalize a calendar booking yet (we will implement calendar booking next!).
`;

/**
 * Handles incoming webhooks fired from your Evolution API container on Railway
 * @param {Object} payload - The raw data packet sent from Evolution API
 */
async function handleIncomingWhatsApp(payload) {
    try {
        if (!payload.event || payload.event.toLowerCase() !== 'messages.upsert' || payload.data?.key?.fromMe === true) {
            return; 
        }

        const messageData = payload.data;
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

        const privacyCheck = await checkContactPrivacy(senderNumber);
        if (!privacyCheck.allowAI) {
            console.log(`🛡️ INTERCEPTED: Blocked AI processing for ${privacyCheck.name || senderNumber}.`);
            console.log(`==================================================\n`);
            return; 
        }

        console.log(`🟢 CLEARED: Fetching conversation memory from Redis database...`);
        
        // 3. DATABASE MEMORY: Fetch past history for this phone number
        const redisKey = `chat:${senderNumber}`;
        const existingHistoryRaw = await redisClient.get(redisKey);
        let chatHistory = [];
        
        if (existingHistoryRaw) {
            chatHistory = JSON.parse(existingHistoryRaw);
        }

        // Add the new user message to the historical log array
        chatHistory.push({ role: 'user', parts: [{ text: messageText }] });

        // Limit history to the last 15 messages so the prompt doesn't get massively overloaded over time
        if (chatHistory.length > 15) {
            chatHistory = chatHistory.slice(-15);
        }

        console.log(`🧠 Loaded ${chatHistory.length - 1} past message interactions. Syncing with Gemini...`);

        // 4. Initialize Gemini with History and System Commands
        const model = ai.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION
        });
        
        // Start a chat session using the history arrays pulled straight out of Redis
        const chatSession = model.startChat({
            history: chatHistory.slice(0, -1) // Pass previous history, excluding the very last message we just added
        });

        // Send the latest message inside the session timeline
        const result = await chatSession.sendMessage(messageText);
        const aiReply = result.response.text();
        
        console.log(`🤖 Gemini Generated Reply: "${aiReply}"`);

        // Add the AI's reply to the chat history array and save back to Redis
        chatHistory.push({ role: 'model', parts: [{ text: aiReply }] });
        await redisClient.set(redisKey, JSON.stringify(chatHistory));

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
                text: aiReply
            })
        });

        const apiResult = await apiResponse.json().catch(() => ({}));
        console.log(`Evolution API Raw Response:`, JSON.stringify(apiResult));

        console.log(`✅ Reply attempt finished & saved to Database!`);
        console.log(`==================================================\n`);
        
    } catch (error) {
        console.error('Error processing incoming WhatsApp webhook logic:', error);
    }
}

module.exports = handleIncomingWhatsApp;
