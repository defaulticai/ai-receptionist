const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Temporary dummy helper until we hook up the full Supabase interceptor
async function getClientByPhoneNumber(phone) {
    return null; 
}

let reconnectAttempts = 0;

async function connectToWhatsApp() {
    // 1. Manage session authentication state
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // 2. Initialize connection with standard Chrome headers to bypass 405 blocks
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'), // Sets user-agent to Ubuntu/Chrome to mask the host network
        syncFullHistory: false,             // Bypasses massive structural data loads that cause connection lag
        markOnlineOnConnect: true,          // Immediately keeps connection alive on shake
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    // 3. Listen for credentials update to stay logged in
    sock.ev.on('creds.update', saveCreds);

    // 4. Handle connection states cleanly
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Display the text QR code safely
        if (qr) {
            console.log('\n==================================================');
            console.log('📱 SCAN THE QR CODE BELOW TO LINK WHATSAPP 📱');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
            console.log('\n==================================================\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`⚠️ WhatsApp connection closed (Status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                reconnectAttempts++;
                // Slower throttle window to prevent WhatsApp security flags
                const delayMs = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000); 
                console.log(`⏱️ Waiting ${delayMs / 1000} seconds before attempting reconnect...`);
                
                setTimeout(() => {
                    connectToWhatsApp();
                }, delayMs);
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0; 
            console.log('\n==================================================');
            console.log('🎉 WHATSAPP CONNECTION OPENED SUCCESSFULLY 🎉');
            console.log('==================================================\n');
        }
    });

    // 5. Listen for incoming messages & Apply Family Interceptor
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (msg.key.fromMe) continue;

            const senderNumber = msg.key.remoteJid.split('@')[0];
            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

            if (!messageText) continue;

            console.log(`Incoming WhatsApp from: ${senderNumber}`);

            try {
                const clientRecord = await getClientByPhoneNumber(senderNumber);
                
                if (clientRecord && clientRecord.is_family) {
                    console.log(`🤫 Family message detected from ${senderNumber}. AI is BLIND to this chat.`);
                    continue; 
                }

                console.log(`🤖 AI Processing student message: "${messageText}"`);

            } catch (err) {
                console.error('Error handling WhatsApp message intercept:', err.message);
            }
        }
    });
}

module.exports = { connectToWhatsApp };
