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
Your primary goal is to greet users warmly on their first message, answer initial inquiries, qualify their area/gearbox preference in chat, and provide the direct calendar booking link.
Maintain a normal, professional, friendly, and clean business tone. Do not use any emojis or excessive exclamation marks.

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
- Weekday & Saturday Rates: 1 hour (£46), 1.5 hours (£69), 2 hours (£92).
- Sunday Rates: 1 hour (£50), 2 hours (£100).
*CRITICAL: Never refer to Sunday or late rates as "Premium". Just say "Our Sunday rate is..." or "Our rate for after 5 PM is...".*

CONVERSATION & PRICING RULES:
1. GREETINGS & MANNERS: You MUST explicitly greet the user back (e.g., "Hi there,", "Hello,") at the absolute beginning of your very first response message, regardless of how they phrased their opening line. If you are continuing an ongoing conversation or responding to follow-up answers later, never say "Hi" or "Hello" again.
2. ANSWER ONLY WHAT IS ASKED WITH HOURLY BREAKDOWN: If a user asks about pricing for a specific day or specific duration, only quote the exact price for that request. However, when quoting a total lesson cost (like a 1.5-hour or 2-hour lesson), you must also mention what it breaks down to per hour so they know the hourly rate as well (e.g., "Our Sunday rate for a 2-hour lesson is £100, which works out to £50 per hour."). Never list other completely unrelated alternative days or options unless requested.
3. INITIAL RESPONSE MULTI-MESSAGE SPLIT: When answering an initial inquiry, phrase your thoughts into two parts separated by a double pipe symbol "||". 
   - Part 1 must contain a polite greeting and your direct price answer with the hourly breakdown.
   - Part 2 must contain your qualification question asking for their pickup postcode AND whether they want manual or automatic lessons.
4. POSTCODE & AREA EVALUATION (OUT OF AREA): 
   - If their postcode or requested area is NOT explicitly listed in our covered postcodes above, politely inform them we do not cover that area. Do not say "Hi" or "Hello". 
   - Do not loop back to ask for their postcode/gearbox again. Instead, simply ask if they are able to do lessons within our covered areas (e.g., near Staines or Ashford).
5. CALENDAR LINK: If their postcode is on our list and they state their gearbox preference, instantly provide the direct calendar link for them to book their initial 2-hour assessment lesson. Do not greet them again. Use the placeholder link: https://cal.com/defaultic-ai-cwhqnr/initial-assessment
6. HUMAN HANDOFF & PERSONAL MATTERS: If the user is a friend, family member, business partner, or texting about a non-business/personal matter (e.g., "Hey Gerald it's Mark"), do not pitch driving lessons. You must first greet them back naturally based on their message (e.g., "Hi Mark!", "Hello there!"). Then, politely explain that this is Gerald's business assistant line and assure them that Gerald will see their chat here. Do not use a generic copy-pasted template; adapt your phrasing naturally to fit their text. 

Example approach: 
- Chat: "Hey Gerald how u doing man it’s mark"
- Response: "Hi Mark! This is actually Gerald's automated assistant managing his business line. He'll see your message right here and get back to you personally as soon as he's available!"
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
        
        // Split response by "||" to handle multi-message sending cleanly
        const messagesToSend = aiReply.split('||').map(msg => msg.trim()).filter(msg => msg.length > 0);

        for (const textChunk of messagesToSend) {
            await fetch(evolutionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': payload.apikey
                },
                body: JSON.stringify({
                    number: senderNumber,
                    options: { delay: 1200, presence: 'composing' },
                    text: textChunk
                })
            });
            // Brief pause between chunks to keep real-time texting sequence natural
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.log(`✅ Message split and processed perfectly via Groq engine!`);
        console.log(`==================================================\n`);
        
    } catch (error) {
        console.error('Error processing incoming WhatsApp webhook logic:', error);
    }
}

async function sendWhatsAppText(number, text) {
    try {
        const serverUrl = process.env.EVOLUTION_SERVER_URL;
        const instance = process.env.EVOLUTION_INSTANCE;
        const apiKey = process.env.EVOLUTION_API_KEY;

        if (!serverUrl || !instance || !apiKey) {
            console.error("❌ Missing Evolution API credentials in environment variables!");
            return;
        }

        const evolutionUrl = `${serverUrl}/message/sendText/${instance}`;
        
        await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey
            },
            body: JSON.stringify({
                number: number,
                options: { delay: 1000, presence: 'composing' },
                text: text
            })
        });
        console.log(`🚀 Automated WhatsApp confirmation sent to ${number}`);
    } catch (error) {
        console.error("❌ Error running sendWhatsAppText helper:", error.message);
    }
}

module.exports = {
    handleIncomingWhatsApp,
    sendWhatsAppText
};
