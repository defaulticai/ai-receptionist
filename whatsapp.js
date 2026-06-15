const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Temporary dummy helper until we hook up the full Supabase interceptor
async function getClientByPhoneNumber(phone) {
    return null; 
}

async function connectToWhatsApp() {
    // 1. Manage session authentication state
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // 2. Initialize the WhatsApp socket connection (Removed deprecated option)
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    // 3. Listen for credentials update to stay logged in
    sock.ev.on('creds.update', saveCreds);

    // 4. Handle connection states (Catch the QR code here manually!)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // If a QR code is sent by WhatsApp, print it to the logs manually
        if (qr) {
            console.log('--- SCAN THE QR CODE BELOW TO LINK WHATSAPP ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('WhatsApp connection closed, reconnecting: ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('==================================================');
            console.log('🎉 WHATSAPP CONNECTION OPENED SUCCESSFULLY 🎉');
            console.log('==================================================');
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
