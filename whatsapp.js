const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const AUTH_FOLDER = path.join(__dirname, 'auth_info_baileys');

// Helper to wipe out the corrupted session files
function clearSessionFolder() {
    if (fs.existsSync(AUTH_FOLDER)) {
        try {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            console.log('🧹 Corrupted or expired WhatsApp session folder cleared out.');
        } catch (err) {
            console.error('Failed to clear session folder:', err.message);
        }
    }
}

async function connectToWhatsApp() {
    // 1. Manage clean authentication state
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    // 2. Initialize the WhatsApp socket connection using standard browser array strings
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '110.0.0.0'], // Clean standard string definition
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    // 3. Keep credentials updated
    sock.ev.on('creds.update', saveCreds);

    // 4. Handle connection updates and catch errors
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n==================================================');
            console.log('📱 SCAN THE QR CODE BELOW TO LINK WHATSAPP 📱');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
            console.log('\n==================================================\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
            console.log(`⚠️ WhatsApp connection closed (Status: ${statusCode}).`);

            // If the session is unvalidated, blocked, or bad (like 405 or 401)
            if (statusCode === 405 || statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
                console.log('🔄 Session is invalid. Performing safe credential reset...');
                clearSessionFolder();
                setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                // Regular temporary network drops or standard reconnects
                console.log('⏱️ Temporary disconnect. Attempting regular reconnection in 5 seconds...');
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('\n==================================================');
            console.log('🎉 WHATSAPP CONNECTION OPENED SUCCESSFULLY 🎉');
            console.log('==================================================\n');
        }
    });

    // 5. Basic message listener structure
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            if (msg.key.fromMe) continue;
            const senderNumber = msg.key.remoteJid.split('@')[0];
            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            if (!messageText) continue;
            console.log(`Incoming message from ${senderNumber}: "${messageText}"`);
        }
    });
}

module.exports = { connectToWhatsApp };
