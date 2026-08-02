// Requiring env first loads .env.<NODE_ENV> then .env, and validates that
// everything required is present — including these two.
const env = require('./env');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = supabase;
