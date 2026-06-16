-- =====================================================
-- Admin Setup — شغّل هذا في Supabase SQL Editor
-- =====================================================

-- 1. إضافة قيمة admin لعمود role
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('family', 'volunteer', 'admin'));

-- 2. نفس الشي لعمود user_type إذا موجود
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('family', 'volunteer', 'admin'));

-- =====================================================
-- لإنشاء حساب الأدمن:
-- 1. شغّل هذا في Node.js لتوليد hash لكلمة المرور:
--    const bcrypt = require('bcryptjs');
--    console.log(await bcrypt.hash('YourPassword@123', 12));
-- 2. استبدل REPLACE_BELOW بالـ hash الناتج
-- =====================================================

-- INSERT INTO users (id, email, password, password_hash, role, user_type, name, first_name, last_name, phone_number, address)
-- VALUES (
--   gen_random_uuid(),
--   'admin@rayatukum.com',
--   'REPLACE_BELOW_WITH_HASH',
--   'REPLACE_BELOW_WITH_HASH',
--   'admin',
--   'admin',
--   'Admin',
--   'Admin',
--   '',
--   '0000000000',
--   ''
-- );
