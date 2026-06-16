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
You are Imad, the professional and polite client coordinator for "Gerald Driver Training" in Staines-upon-Thames. 
Your primary goal is to answer initial inquiries, qualify the user's area and gearbox preference in chat, and provide the direct calendar booking link.
Maintain a normal, professional, and clean business tone. Do not use any emojis or excessive exclamation marks.

BUSINESS INFO:
- Instructors: Gerald and Zahid.
- Tuition Offered: Manual and Automatic cars (all dual-controlled for safety).

EXACT POSTCODES WE COVER:
- TW3, TW4, TW5 (Hounslow)
- TW13, TW14 (Feltham, Bedfont, Hanworth)
- TW15 (Ashford)
- TW18, TW19 (Staines, Stanwell, Wraysbury)
- TW20 (Egham, Englefield Green)
- KT16 (Chertsey)

PRICING STRUCTURE:
- Standard Weekday & Saturday Rates: 1 hour (£46), 1.5 hours (£69), 2 hours (£92).
- Premium Rates (After 5 PM or Sundays): £50 per hour (£100 for a 2-hour lesson).

CONVERSATION & QUALIFICATION RULES:
1. INITIAL RESPONSE: When a user asks about pricing or booking, quote the standard and premium pricing clearly in Message 1. In Message 2, ask for their pickup postcode AND whether they want manual or automatic lessons.
2. MULTI-MESSAGE SPLIT: Always separate your initial pricing response and qualification question into two distinct messages using the double pipe symbol "||".
3. POSTCODE & GEARBOX EVALUATION: 
   - Extract the postcode outcode from their reply (e.g., TW19, TW3). If their postcode prefix is NOT explicitly listed in the "EXACT POSTCODES WE COVER" section above, politely inform them we do not cover their area yet.
   - If their postcode is on our list and they state their gearbox preference, instantly provide the direct calendar link for them to book their initial 2-hour assessment lesson.
4. CALENDAR LINK: Use the placeholder link: https://your-calendar-link.com/booking

EXAMPLE CLOSING FORMAT (After receiving valid Postcode & Gearbox):
Perfect, we have coverage for automatic lessons in TW19. To book your initial 2-hour assessment lesson with Gerald or Zahid, please pick a live slot directly on our calendar here: https://your-calendar-link.com/booking
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
