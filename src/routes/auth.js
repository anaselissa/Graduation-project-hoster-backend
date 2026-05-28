const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SECRET_KEY = process.env.JWT_SECRET;

function isValidPassword(password) {
    return (
        password.length >= 7 &&
        /[A-Z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

const VALID_SERVICE_TYPES = [
    'medicine_delivery',
    'food_delivery',
    'transportation',
    'medical_care',
    'home_maintenance',
    'educational_support',
    'shopping',
    'elderly_companionship',
];

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: إنشاء حساب مستخدم جديد
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - email
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: أحمد
 *               last_name:
 *                 type: string
 *                 example: محمد
 *               email:
 *                 type: string
 *                 example: ahmed@example.com
 *               phone:
 *                 type: string
 *                 example: "0791234567"
 *               password:
 *                 type: string
 *                 example: Ahmed@123
 *               user_type:
 *                 type: string
 *                 enum: [family, volunteer]
 *                 example: family
 *               service_type_id:
 *                 type: string
 *                 example: food_delivery
 *     responses:
 *       201:
 *         description: تم إنشاء الحساب بنجاح
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في السيرفر
 */
router.post('/register', async (req, res) => {
    const { first_name, last_name, email, phone, password, user_type, service_type_id } = req.body;

    if (!first_name || !first_name.trim())
        return res.status(400).json({ error: 'الرجاء إدخال الاسم' });
    if (!email || !email.trim())
        return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني' });
    if (!password)
        return res.status(400).json({ error: 'الرجاء إدخال كلمة المرور' });
    if (!isValidPassword(password))
        return res.status(400).json({
            error: 'كلمة المرور ضعيفة — يجب أن تحتوي على 7 أحرف على الأقل، حرف كبير، رقم، ورمز خاص'
        });

    const resolvedType = user_type || 'family';
    if (!['family', 'volunteer'].includes(resolvedType))
        return res.status(400).json({ error: 'نوع الحساب غير صحيح' });

    if (resolvedType === 'volunteer') {
        if (!service_type_id)
            return res.status(400).json({ error: 'يرجى تحديد نوع الخدمة التطوعية' });
        if (!VALID_SERVICE_TYPES.includes(service_type_id))
            return res.status(400).json({ error: 'نوع الخدمة غير صحيح' });
    }

    const cleanEmail     = email.trim().toLowerCase();
    const cleanFirstName = first_name.trim();
    const cleanLastName  = (last_name || '').trim();
    const fullName       = cleanLastName ? `${cleanFirstName} ${cleanLastName}` : cleanFirstName;

    try {
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (existingUser)
            return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });

        const hashedPassword = await bcrypt.hash(password, 12);

        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{
                name:          fullName,
                first_name:    cleanFirstName,
                last_name:     cleanLastName,
                email:         cleanEmail,
                password:      hashedPassword,
                password_hash: hashedPassword,
                role:          resolvedType,
                user_type:     resolvedType,
                phone_number:  phone || '0000000000',
                address:       '',
            }])
            .select('id, name, first_name, last_name, email, role, user_type')
            .single();

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            if (insertError.code === '23505')
                return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });
            throw insertError;
        }

        if (resolvedType === 'volunteer') {
            const { error: volError } = await supabase
                .from('volunteers')
                .insert([{
                    volunteer_id:     newUser.id,
                    bio:              '',
                    skills:           [],
                    is_available:     true,
                    service_type_id:  service_type_id,
                    documents_status: 'pending',
                }]);
            if (volError) {
                console.warn('Warning: failed to create volunteer record:', volError.message);
            }
        }

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: resolvedType, user_type: resolvedType },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            message: 'تم إنشاء الحساب بنجاح',
            token: token,
            user: {
                id:              newUser.id,
                email:           newUser.email,
                first_name:      newUser.first_name || newUser.name,
                last_name:       newUser.last_name || '',
                user_type:       resolvedType,
                service_type_id: resolvedType === 'volunteer' ? service_type_id : null,
            }
        });

    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ error: 'حدث خطأ في السيرفر، حاول مرة أخرى' });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: تسجيل الدخول والحصول على التوكن
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: ahmed@example.com
 *               password:
 *                 type: string
 *                 example: Ahmed@123
 *     responses:
 *       200:
 *         description: تم تسجيل الدخول بنجاح وإرجاع التوكن
 *       400:
 *         description: بيانات غير صحيحة
 *       500:
 *         description: خطأ في السيرفر
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, name, first_name, last_name, email, password, password_hash, role, user_type, phone_number')
            .eq('email', email.trim().toLowerCase())
            .maybeSingle();

        if (error || !user)
            return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

        const storedHash = user.password || user.password_hash || '';
        const isMatch = await bcrypt.compare(password, storedHash);
        if (!isMatch)
            return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

        const resolvedType = user.user_type || user.role || 'family';

        let serviceTypeId = null;
        if (resolvedType === 'volunteer') {
            const { data: volData } = await supabase
                .from('volunteers')
                .select('service_type_id')
                .eq('volunteer_id', user.id)
                .maybeSingle();
            serviceTypeId = volData?.service_type_id || null;
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: resolvedType, user_type: resolvedType },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        return res.json({
            message: 'تم تسجيل الدخول بنجاح',
            token: token,
            user: {
                id:              user.id,
                email:           user.email,
                first_name:      user.first_name || user.name || '',
                last_name:       user.last_name || '',
                user_type:       resolvedType,
                phone:           user.phone_number || '',
                service_type_id: serviceTypeId,
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

module.exports = router;