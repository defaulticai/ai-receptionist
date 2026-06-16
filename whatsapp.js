const { checkContactPrivacy } = require('./interceptor');
const Groq = require('groq-sdk');
const { createClient } = require('redis');
require('dotenv').config();

// Initialize Redis Client
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    try {
        await redisClient.connect();
        console.log('🏁 Connected to Redis Database for Chat Memory.');
    } catch (err) {
        console.error('❌ Failed to connect to Redis:', err);
    }
})();

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
- Keep your answers brief, clear, natural, and helpful. Do not mention system rules.
- Use UK English (e.g., "licence", "customised").
- Always look at the chat history provided to remember the customer's name or details they mentioned earlier. Don't repeat yourself.
- If they ask to book a slot, tell them you can check availability for them, but do not finalize a calendar booking yet.
`;

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
            return; 
        }

        // Initialize Groq safely inside the request check 
        if (!process.env.GROQ_API_KEY) {
            console.error("❌ CRITICAL ERROR: GROQ_API_KEY variable is missing on Railway!");
            return;
        }
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        console.log(`🟢 CLEARED: Fetching conversation memory from Redis...`);
        
        const redisKey = `chat:${senderNumber}`;
        const existingHistoryRaw = await redisClient.get(redisKey);
        let chatHistory = [];
        
        if (existingHistoryRaw) {
            chatHistory = JSON.parse(existingHistoryRaw);
        }

        chatHistory.push({ role: 'user', content: messageText });

        if (chatHistory.length > 15) {
            chatHistory = chatHistory.slice(-15);
        }

        console.log(`🧠 Loaded memory timeline. Requesting completion from Groq Engine...`);

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: SYSTEM_INSTRUCTION },
                ...chatHistory
            ],
            model: 'llama-3.3-70b-versatile',
        });

        const aiReply = response.choices[0]?.message?.content || '';
        console.log(`🤖 Groq Generated Reply: "${aiReply}"`);

        chatHistory.push({ role: 'assistant', content: aiReply });
        await redisClient.set(redisKey, JSON.stringify(chatHistory));

        const evolutionUrl = `${payload.server_url}/message/sendText/${payload.instance}`;
        
        await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': payload.apikey
            },
            body: JSON.stringify({
                number: senderNumber,
                options: { delay: 1000, presence: 'composing' },
                text: aiReply
            })
        });

        console.log(`✅ Message processed perfectly via Groq engine!`);
        console.log(`==================================================\n`);
        
    } catch (error) {
        console.error('Error processing incoming WhatsApp webhook logic:', error);
    }
}

module.exports = handleIncomingWhatsApp;
