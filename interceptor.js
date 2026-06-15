const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkContactPrivacy(incomingNumber) {
    if (!incomingNumber) return { allowAI: true, reason: 'No number provided' };
    
    const cleanNumber = incomingNumber.replace(/\D/g, ''); 

    const { data: contact, error } = await supabase
        .from('contacts')
        .select('relationship_type, name')
        .eq('phone_number', cleanNumber)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error("Database error during lookup:", error);
    }

    if (contact && contact.relationship_type === 'Family') {
        return { 
            allowAI: false, 
            reason: 'Family Privacy Shield Active', 
            name: contact.name 
        };
    }

    return { 
        allowAI: true, 
        reason: contact ? 'Existing Student' : 'New Lead', 
        name: contact ? contact.name : 'Unknown Caller' 
    };
}

module.exports = { checkContactPrivacy };
