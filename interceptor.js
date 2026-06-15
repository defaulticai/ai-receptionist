const supabase = require('./supabaseClient');

/**
 * Checks your dashboard settings in Supabase to see if the AI is allowed to speak to this number
 * @param {string} senderNumber - The raw phone number from WhatsApp
 * @returns {Object} { allowAI: boolean, name: string|null }
 */
async function checkContactPrivacy(senderNumber) {
    try {
        // Look up the contact and check their specific AI toggle setting
        const { data, error } = await supabase
            .from('contacts') 
            .select('name, ai_enabled') // Grabbing the toggle switch value
            .eq('phone_number', senderNumber)
            .single();

        if (error && error.code !== 'PGRST116') { 
            console.error('Supabase lookup error:', error);
            return { allowAI: true }; // Default to true if database has a minor issue
        }

        // 1. UNKNOWN NUMBER: If the contact doesn't exist in Supabase at all
        if (!data) {
            console.log(`✨ Unknown contact (${senderNumber}). Defaulting to AI handling.`);
            return { allowAI: true, name: null }; 
        }

        // 2. SAVED CONTACT: Check what the instructor chose on the dashboard
        if (data.ai_enabled === false) {
            // Instructor toggled this person OFF (e.g., Family/Friends)
            return { allowAI: false, name: data.name }; 
        } else {
            // Instructor toggled this person ON (e.g., Active Student)
            return { allowAI: true, name: data.name }; 
        }

    } catch (err) {
        console.error('Error in dashboard privacy shield:', err);
        return { allowAI: true };
    }
}

module.exports = { checkContactPrivacy };
