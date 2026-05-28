const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth.js');

const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * @swagger
 * /api/requests:
 *   get:
 *     summary: جلب طلبات الخدمة حسب نوع خدمة المتطوع
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم جلب البيانات بنجاح
 */
router.get('/', auth.authenticateToken, async (req, res) => {
    try {
        const volunteerId = req.user.id;

        // 1. جلب نوع خدمة المتطوع (medicine_delivery مثلاً)
        const { data: volData, error: volError } = await supabase
            .from('volunteers')
            .select('service_type_id')
            .eq('volunteer_id', volunteerId)
            .single();

        if (volError || !volData) {
            return res.status(403).json({ message: 'المتطوع غير موجود' });
        }

        const serviceTypeName = volData.service_type_id; // e.g. 'medicine_delivery'

        // 2. جلب الـ UUID من جدول service_types
        const { data: serviceType, error: stError } = await supabase
            .from('service_types')
            .select('id')
            .eq('name', serviceTypeName)
            .single();

        // 3. جلب الطلبات — إذا ما لقينا الـ UUID نرجع كل الطلبات
        let query = supabase
            .from('service_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (!stError && serviceType) {
            query = query.eq('service_type_id', serviceType.id);
        }

        const { data: requests, error } = await query;
        if (error) throw error;

        // 4. جلب بيانات العائلة لكل طلب
        const enriched = await Promise.all(requests.map(async (r) => {
            if (!r.family_user_id) return { ...r, users: null };
            const { data: user } = await supabase
                .from('users')
                .select('first_name, last_name, phone_number')
                .eq('id', r.family_user_id)
                .single();
            return { ...r, users: user || null };
        }));

        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب الطلبات' });
    }
});

/**
 * @swagger
 * /api/requests/{id}/accept:
 *   put:
 *     summary: قبول طلب خدمة من قبل المتطوع
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم قبول الطلب بنجاح
 *       404:
 *         description: الطلب غير موجود
 */
router.put('/:id/accept', auth.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const volunteerId = req.user.id;

        const { data: existing, error: fetchError } = await supabase
            .from('service_requests')
            .select('id, status')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        if (existing.status !== 'pending') {
            return res.status(400).json({ message: 'الطلب ليس في حالة انتظار' });
        }

        const { data, error } = await supabase
            .from('service_requests')
            .update({
                status: 'accepted',
                volunteer_id: volunteerId,
                accepted_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        res.json({ message: 'تم قبول الطلب بنجاح ✅', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ أثناء قبول الطلب' });
    }
});

/**
 * @swagger
 * /api/requests/{id}/complete:
 *   put:
 *     summary: إكمال طلب خدمة من قبل المتطوع
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إكمال الطلب بنجاح
 *       404:
 *         description: الطلب غير موجود
 */
router.put('/:id/complete', auth.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: existing, error: fetchError } = await supabase
            .from('service_requests')
            .select('id, status')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        if (existing.status !== 'accepted') {
            return res.status(400).json({ message: 'الطلب ليس في حالة مقبولة' });
        }

        const { data, error } = await supabase
            .from('service_requests')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        res.json({ message: 'تم إكمال الطلب بنجاح 🎉', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ أثناء إكمال الطلب' });
    }
});

/**
 * @swagger
 * /api/requests/{id}/cancel:
 *   put:
 *     summary: إلغاء طلب خدمة
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إلغاء الطلب
 */
router.put('/:id/cancel', auth.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('service_requests')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        res.json({ message: 'تم إلغاء الطلب', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الطلب' });
    }
});

module.exports = router;