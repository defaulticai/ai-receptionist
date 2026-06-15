const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { getClientByPhoneNumber } = require('./db'); // Assuming you have a helper to check contacts

async function connectToWhatsApp() {
    // 1. Manage session authentication state
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // 2. Initialize the WhatsApp socket connection
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Keeps logs clean
        printQRInTerminal: true // Prints QR code directly in terminal/Railway logs
    });

    // 3. Listen for credentials update to stay logged in
    sock.ev.on('creds.update', saveCreds);

    // 4. Handle connection states (Disconnects, Reconnects)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('WhatsApp connection closed due to ', lastDisconnect?.error, ', reconnecting: ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('🎉 WHATSAPP CONNECTION OPENED SUCCESSFULLY 🎉');
        }
    });

    // 5. Listen for incoming messages & Apply Family Interceptor
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            // Ignore messages sent by the instructor themselves
            if (msg.key.fromMe) continue;

            const senderNumber = msg.key.remoteJid.split('@')[0]; // Extracts the clean phone number
            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

            if (!messageText) continue;

            console.log(`Incoming WhatsApp from: ${senderNumber}`);

            try {
                // Check if sender is flagged as Family in Supabase
                const clientRecord = await getClientByPhoneNumber(senderNumber);
                
                if (clientRecord && clientRecord.is_family) {
                    console.log(`🤫 Family message detected from ${senderNumber}. AI is BLIND to this chat.`);
                    continue; // Skip processing completely. The instructor handles this manually.
                }

                // TODO: Route non-family student messages to your AI/Router logic here
                console.log(`🤖 AI Processing student message: "${messageText}"`);

            } catch (err) {
                console.error('Error handling WhatsApp message intercept:', err.message);
            }
        }
    });
}

module.exports = { connectToWhatsApp };
