const supabase = require('./supabaseClient');

/**
 * Checks your Supabase table to see if the contact is Family or a Student
 * @param {string} senderNumber - The raw phone number from WhatsApp
 * @returns {Object} { allowAI: boolean, name: string|null }
 */
async function checkContactPrivacy(senderNumber) {
    try {
        // Look up the contact based on your real columns: name and relationship_type
        const { data, error } = await supabase
            .from('contacts') 
            .select('name, relationship_type') 
            .eq('phone_number', senderNumber)
            .single();

        if (error && error.code !== 'PGRST116') { 
            console.error('Supabase lookup error:', error);
            return { allowAI: true }; // Default to letting AI handle it if database errors out
        }

        // 1. UNKNOWN NUMBER: If the number is NOT in your database (a brand new student/stranger)
        if (!data) {
            console.log(`✨ Unknown contact (${senderNumber}). Defaulting to AI handling.`);
            return { allowAI: true, name: null }; 
        }

        // 2. SAVED CONTACT: Check their relationship type from your screenshot
        if (data.relationship_type === 'Family') {
            // It's Mom! Block the AI so you can text her normally.
            console.log(`🛡️ INTERCEPTED: ${data.name} is Family. Muting AI.`);
            return { allowAI: false, name: data.name }; 
        } 
        
        if (data.relationship_type === 'Student') {
            // It's a student you manually added! Let the AI speak to them.
            console.log(`🟢 CLEARED: ${data.name} is a Student. Forwarding to AI.`);
            return { allowAI: true, name: data.name }; 
        }

        // Catch-all safety default
        return { allowAI: true, name: data.name };

    } catch (err) {
        console.error('Error in relationship interceptor:', err);
        return { allowAI: true };
    }
}

module.exports = { checkContactPrivacy };
