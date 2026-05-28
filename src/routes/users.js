const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// GET /api/users/profile
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

// PUT /api/users/profile
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
