const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth.js'); 
const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Middleware: أدمن فقط ──────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح — للأدمن فقط' });
    }
    next();
};

// ── GET /api/admin/stats — إحصائيات عامة ────────────────────────────
router.get('/stats', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [
            { count: totalUsers },
            { count: totalVolunteers },
            { count: totalFamilies },
            { count: pendingRequests },
            { count: completedRequests },
            { count: pendingDocs },
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'volunteer'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'family'),
            supabase.from('service_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('service_requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
            supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('documents_status', 'pending'),
        ]);

        res.json({
            totalUsers: totalUsers || 0,
            totalVolunteers: totalVolunteers || 0,
            totalFamilies: totalFamilies || 0,
            pendingRequests: pendingRequests || 0,
            completedRequests: completedRequests || 0,
            pendingDocs: pendingDocs || 0,
        });
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب الإحصائيات', details: err.message });
    }
});

// ── GET /api/admin/users — كل المستخدمين ────────────────────────────
router.get('/users', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, first_name, last_name, email, role, user_type, phone_number, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب المستخدمين', details: err.message });
    }
});

// ── DELETE /api/admin/users/:id — حذف مستخدم ────────────────────────
router.delete('/users/:id', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('users').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'فشل حذف المستخدم', details: err.message });
    }
});

// ── GET /api/admin/requests — كل الطلبات ────────────────────────────
router.get('/requests', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('service_requests')
            .select('id, title, description, status, urgency, created_at, family_user_id, volunteer_id, service_type_id')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // إضافة بيانات العائلة والمتطوع لكل طلب
        const enriched = await Promise.all((data || []).map(async (r, index) => {
            const [familyRes, volunteerRes] = await Promise.all([
                r.family_user_id
                    ? supabase.from('users').select('first_name, last_name, phone_number').eq('id', r.family_user_id).single()
                    : Promise.resolve({ data: null }),
                r.volunteer_id
                    ? supabase.from('users').select('first_name, last_name').eq('id', r.volunteer_id).single()
                    : Promise.resolve({ data: null }),
            ]);

            return {
                ...r,
                request_number: index + 1,
                family: familyRes.data,
                volunteer: volunteerRes.data,
            };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب الطلبات', details: err.message });
    }
});

// ── GET /api/admin/volunteers — المتطوعون + حالة وثائقهم ─────────────
router.get('/volunteers', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data: vols, error } = await supabase
            .from('volunteers')
            .select('volunteer_id, service_type_id, documents_status, is_available, bio')
            .order('documents_status', { ascending: true });

        if (error) throw error;

        const enriched = await Promise.all((vols || []).map(async (v) => {
            const { data: user } = await supabase
                .from('users')
                .select('first_name, last_name, email, phone_number, created_at')
                .eq('id', v.volunteer_id)
                .single();

            const { data: docs } = await supabase
                .from('volunteer_documents')
                .select('id, document_type, status, file_url, uploaded_at')
                .eq('volunteer_id', v.volunteer_id);

            return { ...v, user, documents: docs || [] };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب المتطوعين', details: err.message });
    }
});

// ── PUT /api/admin/volunteers/:id/approve — قبول وثائق متطوع ─────────
router.put('/volunteers/:id/approve', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('volunteers')
            .update({ documents_status: 'approved' })
            .eq('volunteer_id', req.params.id);

        if (error) throw error;
        res.json({ message: 'تم قبول المتطوع ✅' });
    } catch (err) {
        res.status(500).json({ error: 'فشل القبول', details: err.message });
    }
});

// ── PUT /api/admin/volunteers/:id/reject — رفض وثائق متطوع ──────────
router.put('/volunteers/:id/reject', auth.authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('volunteers')
            .update({ documents_status: 'rejected' })
            .eq('volunteer_id', req.params.id);

        if (error) throw error;
        res.json({ message: 'تم رفض المتطوع ❌' });
    } catch (err) {
        res.status(500).json({ error: 'فشل الرفض', details: err.message });
    }
});

// ── POST /api/admin/create-volunteer — إنشاء حساب متطوع بواسطة الأدمن ──
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

router.post('/create-volunteer', auth.authenticateToken, requireAdmin, async (req, res) => {
    const bcrypt = require('bcryptjs');
    const { first_name, last_name, email, password, phone, service_type_id } = req.body;

    // التحقق من الحقول المطلوبة
    if (!first_name || !first_name.trim())
        return res.status(400).json({ error: 'الرجاء إدخال الاسم الأول' });
    if (!email || !email.trim())
        return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني' });
    if (!password || password.length < 7)
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 7 أحرف على الأقل' });
    if (!service_type_id || !VALID_SERVICE_TYPES.includes(service_type_id))
        return res.status(400).json({ error: 'يرجى تحديد نوع الخدمة التطوعية بشكل صحيح' });

    const cleanEmail = email.trim().toLowerCase();
    const cleanFirst = first_name.trim();
    const cleanLast  = (last_name || '').trim();
    const fullName   = cleanLast ? `${cleanFirst} ${cleanLast}` : cleanFirst;

    try {
        // التحقق من عدم تكرار البريد الإلكتروني
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (existing)
            return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });

        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{
                name:          fullName,
                first_name:    cleanFirst,
                last_name:     cleanLast,
                email:         cleanEmail,
                password:      hashedPassword,
                password_hash: hashedPassword,
                role:          'volunteer',
                user_type:     'volunteer',
                phone_number:  phone || '0000000000',
                address:       '',
            }])
            .select('id, name, first_name, last_name, email, role')
            .single();

        if (insertError) {
            if (insertError.code === '23505')
                return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });
            throw insertError;
        }

        // إنشاء سجل المتطوع
        const { error: volError } = await supabase
            .from('volunteers')
            .insert([{
                volunteer_id:     newUser.id,
                bio:              '',
                skills:           [],
                is_available:     true,
                service_type_id:  service_type_id,
                documents_status: 'approved', // الأدمن يُنشئ الحساب مباشرةً معتمداً
            }]);

        if (volError) {
            console.warn('Warning: failed to create volunteer record:', volError.message);
        }

        res.status(201).json({
            message: 'تم إنشاء حساب المتطوع بنجاح ✅',
            user: {
                id:              newUser.id,
                email:           newUser.email,
                first_name:      newUser.first_name,
                last_name:       newUser.last_name,
                role:            'volunteer',
                service_type_id: service_type_id,
            }
        });

    } catch (err) {
        console.error('Create volunteer error:', err);
        res.status(500).json({ error: 'حدث خطأ في السيرفر', details: err.message });
    }
});

module.exports = router;