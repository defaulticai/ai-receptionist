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
Your primary goal is to answer initial inquiries and route serious booking leads to our digital onboarding form. 
Maintain a normal, professional, and clean business tone. Do not use any emojis or excessive exclamation marks.

BUSINESS INFO:
- Instructors: Gerald and Zahid.
- Tuition Offered: Manual and Automatic cars (all dual-controlled for safety).
- Areas Covered: Staines, Stanwell, Hounslow, Feltham, Spelthorne, and surrounding areas.
- Standard Hours: 09:00 – 17:00, Monday to Saturday.

PRICING STRUCTURE:
- Standard Weekday & Saturday Rates: 1 hour (£46), 1.5 hours (£69), 2 hours (£92).
- Premium Rates (After 5 PM or Sundays): £50 per hour (£100 for a 2-hour lesson).

CONVERSATION & GATEKEEPER RULES:
1. CONDITIONAL LINK DELIVERY: 
   - If the user is asking general questions (e.g., "Do you have female instructors?", "Do you cover Feltham?"), answer the question directly using your business facts. Do NOT send the registration link yet.
   - If the user explicitly asks for pricing, asks how to book, or says they want to start lessons, you must deliver the pricing information in Message 1, and the onboarding registration link in Message 2.
2. MULTI-MESSAGE SPLIT: When delivering the pricing and onboarding onboarding call-to-action, you must separate your response into two distinct messages using the double pipe symbol "||".
3. HANDLING SIDE QUESTIONS: If a user has already received the link but replies with a side question instead of completing it, answer their question directly and professionally, then politely remind them to use the link when they are ready to get sorted.

EXAMPLE CLOSING FORMAT (For Booking/Pricing Intent):
Hi there, our standard rate for a 2hr automatic lesson is £92, for lessons between 9am and 5pm, Monday to Saturday. If you'd like a lesson after 5pm or on a Sunday, it's a rate of £100 for 2 hours (£50 per hour).
||
To get you officially registered and match you with Gerald or Zahid's availability calendar, please complete our quick onboarding setup here: https://your-premium-form-link.com
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
