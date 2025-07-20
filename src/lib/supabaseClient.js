import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qxywnumwtpzqmljoraru.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXdudW13dHB6cW1sam9yYXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5NDU3NjUsImV4cCI6MjA2ODUyMTc2NX0.JPbL0UcNO8kir1KhmPK4V2cb5Jr9DU19RNeRpgz253c"
export const supabase = createClient(supabaseUrl, supabaseAnonKey)