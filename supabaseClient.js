const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ MISSING SUPABASE CREDENTIALS IN ENVIRONMENT VARIABLES!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
