const supabase = require('./supabaseClient');

/**
 * Checks if a contact is a friend/family member who should NOT be handled by the AI
 * @param {string} senderNumber - The raw phone number from WhatsApp
 * @returns {Object} { allowAI: boolean, name: string|null }
 */
async function checkContactPrivacy(senderNumber) {
    try {
        // Look up the phone number in your Supabase 'contacts' table
        const { data, error } = await supabase
            .from('contacts') 
            .select('name')
            .eq('phone_number', senderNumber)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means "no rows found", which is a normal stranger
            console.error('Supabase lookup error:', error);
            return { allowAI: true }; // If database errors, default to letting AI handle it safely
        }

        // 1. If data is found, they ARE family or a friend -> DO NOT LET AI REPLY
        if (data) {
            return { allowAI: false, name: data.name }; 
        }

        // 2. If NO data is found, they are a student, customer, or stranger -> LET AI REPLY!
        return { allowAI: true, name: null };

    } catch (err) {
        console.error('Error in privacy shield execution:', err);
        return { allowAI: true };
    }
}

module.exports = { checkContactPrivacy };
