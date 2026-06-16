const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function calcDistance(lat1, lng1, lat2, lng2) {
    return Math.round(Math.sqrt(Math.pow((lat2 - lat1) * 111, 2) + Math.pow((lng2 - lng1) * 111, 2)) * 10) / 10;
}

/**
 * @swagger
 * tags:
 *   name: Map
 *   description: مواقع المتطوعين والطلبات على الخريطة
 */

/**
 * @swagger
 * /api/map-locations/volunteers:
 *   get:
 *     summary: جلب مواقع المتطوعين
 *     tags: [Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: خط العرض للمستخدم
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: خط الطول للمستخدم
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 50
 *         description: نطاق البحث بالكيلومتر
 *     responses:
 *       200:
 *         description: قائمة المتطوعين القريبين
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 volunteers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       first_name: { type: string }
 *                       last_name: { type: string }
 *                       latitude: { type: number }
 *                       longitude: { type: number }
 *                       air_distance_km: { type: number }
 */
router.get('/volunteers', auth.authenticateToken, async (req, res) => {
    try {
        const { lat, lng, radius = 50 } = req.query;

        const { data: volLocs, error: e1 } = await supabase
            .from('volunteer_locations')
            .select('volunteer_id, latitude, longitude');

        if (e1) throw e1;

        if (!volLocs || volLocs.length === 0) {
            const { data: users, error: e2 } = await supabase
                .from('users')
                .select('id, first_name, last_name, name, latitude, longitude')
                .eq('role', 'volunteer')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null);

            if (e2) throw e2;

            const nearby = (users || []).map(v => ({
                id: v.id,
                first_name: v.first_name || v.name || '',
                last_name: v.last_name || '',
                latitude: parseFloat(v.latitude),
                longitude: parseFloat(v.longitude),
                air_distance_km: (lat && lng) ? calcDistance(parseFloat(lat), parseFloat(lng), v.latitude, v.longitude) : 0,
            })).filter(v => !lat || v.air_distance_km <= parseFloat(radius));

            return res.json({ count: nearby.length, volunteers: nearby });
        }

        const volunteerIds = volLocs.map(v => v.volunteer_id);
        const { data: users, error: e3 } = await supabase.from('users').select('id, first_name, last_name, name').in('id', volunteerIds);
        if (e3) throw e3;

        const usersMap = {};
        (users || []).forEach(u => usersMap[u.id] = u);

        const nearby = volLocs.map(v => {
            const user = usersMap[v.volunteer_id] || {};
            return {
                id: v.volunteer_id,
                first_name: user.first_name || user.name || '',
                last_name: user.last_name || '',
                latitude: parseFloat(v.latitude),
                longitude: parseFloat(v.longitude),
                air_distance_km: (lat && lng) ? calcDistance(parseFloat(lat), parseFloat(lng), parseFloat(v.latitude), parseFloat(v.longitude)) : 0,
            };
        }).filter(v => !lat || v.air_distance_km <= parseFloat(radius));

        res.json({ count: nearby.length, volunteers: nearby });
    } catch (err) {
        console.error('Map volunteers error:', err);
        res.status(500).json({ error: 'فشل جلب المتطوعين', details: err.message });
    }
});

/**
 * @swagger
 * /api/map-locations/requests:
 *   get:
 *     summary: جلب الطلبات المعلقة على الخريطة
 *     tags: [Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 50
 *     responses:
 *       200:
 *         description: قائمة الطلبات القريبة
 */
router.get('/requests', auth.authenticateToken, async (req, res) => {
    try {
        const { lat, lng, radius = 50 } = req.query;

        const { data: requests, error } = await supabase
            .from('service_requests')
            .select('id, title, description, urgency, location_latitude, location_longitude, location_address, family_user_id')
            .eq('status', 'pending')
            .not('location_latitude', 'is', null)
            .not('location_longitude', 'is', null);

        if (error) throw error;

        const nearby = (requests || []).map(r => ({
            id: r.id,
            title: r.title,
            description: r.description,
            urgency: r.urgency,
            latitude: parseFloat(r.location_latitude),
            longitude: parseFloat(r.location_longitude),
            address: r.location_address || '',
            air_distance_km: (lat && lng) ? calcDistance(parseFloat(lat), parseFloat(lng), parseFloat(r.location_latitude), parseFloat(r.location_longitude)) : 0,
        })).filter(r => !lat || r.air_distance_km <= parseFloat(radius));

        res.json({ count: nearby.length, requests: nearby });
    } catch (err) {
        console.error('Map requests error:', err);
        res.status(500).json({ error: 'فشل جلب الطلبات', details: err.message });
    }
});

/**
 * @swagger
 * /api/map-locations:
 *   get:
 *     summary: جلب مواقع عامة
 *     tags: [Map]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: قائمة المواقع
 */
router.get('/', auth.authenticateToken, (req, res) => {
    res.json({
        message: "تم جلب المواقع بنجاح",
        locations: [{ id: 1, lat: 32.5568, lng: 35.8469, info: "مركز إربد للرعاية" }]
    });
});

module.exports = router;