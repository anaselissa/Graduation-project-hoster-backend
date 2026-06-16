const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: الملف الشخصي للمستخدم
 */

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: جلب الملف الشخصي
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات المستخدم
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 email: { type: string }
 *                 first_name: { type: string }
 *                 last_name: { type: string }
 *                 user_type: { type: string }
 *                 phone: { type: string }
 *                 address: { type: string }
 *       404:
 *         description: المستخدم غير موجود
 */
router.get('/profile', auth.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: user, error } = await supabase
            .from('users')
            .select('id, name, email, role, first_name, last_name, phone_number, address')
            .eq('id', userId)
            .single();

        if (error || !user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        res.json({
            id: user.id,
            email: user.email,
            first_name: user.first_name || user.name || '',
            last_name: user.last_name || '',
            user_type: user.role,
            phone: user.phone_number || '',
            address: user.address || '',
        });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'فشل جلب الملف الشخصي', details: err.message });
    }
});

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: تحديث الملف الشخصي
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name: { type: string, example: أحمد }
 *               last_name: { type: string, example: الخالد }
 *               phone: { type: string, example: "0791234567" }
 *               address: { type: string, example: إربد، الأردن }
 *     responses:
 *       200:
 *         description: تم التحديث بنجاح
 *       500:
 *         description: خطأ في السيرفر
 */
router.put('/profile', auth.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { first_name, last_name, phone, address } = req.body;
        const updates = {};
        if (first_name !== undefined) { updates.first_name = first_name; updates.name = first_name; }
        if (last_name !== undefined) updates.last_name = last_name;
        if (phone !== undefined) updates.phone_number = phone;
        if (address !== undefined) updates.address = address;

        const { data: user, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select('id, email, name, first_name, last_name, role, phone_number, address')
            .single();

        if (error) throw error;

        res.json({
            message: 'تم تحديث الملف الشخصي بنجاح',
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name || user.name || '',
                last_name: user.last_name || '',
                user_type: user.role,
                phone: user.phone_number || '',
                address: user.address || '',
            }
        });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'فشل تحديث الملف الشخصي', details: err.message });
    }
});

module.exports = router;