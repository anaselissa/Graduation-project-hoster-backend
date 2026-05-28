import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log("🔍 SUPABASE CONFIG:");
console.log("URL:", process.env.SUPABASE_URL ? "SET ✅" : "NOT SET ❌");
console.log("KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET ✅" : "NOT SET ❌");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default supabase;