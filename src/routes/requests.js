const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth.js');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// نفس خريطة المفاتيح المستخدمة في routes/services.js
// بنخليها هنا متطابقة حرفياً عشان منطق المطابقة يكون نفسه بكل مكان بالتطبيق
const SERVICE_KEY_MAP = {
  'medicine_delivery':     ['medicine_delivery', 'توصيل أدوية'],
  'food_delivery':         ['food_delivery', 'طهي', 'توصيل طعام', 'طعام'],
  'transportation':        ['transportation', 'نقل ومواصلات', 'نقل'],
  'medical_care':          ['medical_care', 'مرافقة طبية', 'رعاية طبية', 'طبي'],
  'home_maintenance':      ['home_maintenance', 'تنظيف وتنظيم', 'زيارة منزلية', 'صيانة'],
  'educational_support':   ['educational_support', 'دعم تعليمي', 'تعليم'],
  'shopping':              ['shopping', 'تسوق', 'تسوق وشراء'],
  'elderly_companionship': ['elderly_companionship', 'مرافقة كبار', 'مرافقة'],
};

// بتحول مفتاح/قيمة نوع الخدمة المخزّنة عند المتطوع (زي "medicine_delivery")
// إلى id الصف الحقيقي بجدول service_types، بمطابقة مرنة (مش حرفية متطابقة 100%)
async function resolveServiceTypeId(rawValue) {
  if (!rawValue) return null;
  const { data: types } = await supabase.from('service_types').select('id, name');
  if (!types || types.length === 0) return null;

  const value = rawValue.toString().toLowerCase().trim();
  const keywords = SERVICE_KEY_MAP[rawValue] || [rawValue];

  for (const type of types) {
    const dbName = (type.name || '').toLowerCase().trim();
    if (dbName === value) return type.id;
    for (const kw of keywords) {
      if (dbName === kw.toLowerCase() || dbName.includes(kw.toLowerCase())) return type.id;
    }
  }
  return null;
}

/**
 * @swagger
 * tags:
 *   name: Requests
 *   description: طلبات الخدمة (للمتطوع)
 */

/**
 * @swagger
 * /api/requests:
 *   get:
 *     summary: جلب الطلبات المتاحة للمتطوع حسب تخصصه
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: قائمة الطلبات
 *       403:
 *         description: المتطوع غير موجود
 */
router.get('/', auth.authenticateToken, async (req, res) => {
    try {
        const volunteerId = req.user.id;

        const { data: volData, error: volError } = await supabase
            .from('volunteers')
            .select('service_type_id')
            .eq('volunteer_id', volunteerId)
            .single();

        if (volError || !volData) {
            return res.status(403).json({ message: 'المتطوع غير موجود' });
        }

        const volunteerServiceKey = volData.service_type_id;
        const matchedServiceTypeId = await resolveServiceTypeId(volunteerServiceKey);

        let query = supabase
            .from('service_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (matchedServiceTypeId) {
            // الطلبات المعلّقة من نفس تخصص المتطوع + أي طلب صار مرتبط فيه هو شخصياً
            query = query.or(
                `and(status.eq.pending,service_type_id.eq.${matchedServiceTypeId}),volunteer_id.eq.${volunteerId}`
            );
        } else {
            console.warn(
                `تنبيه: ما قدرنا نطابق نوع خدمة المتطوع (${volunteerServiceKey}) مع أي صف بجدول service_types`
            );
        }

        const { data: requests, error } = await query;
        if (error) throw error;

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
 *     summary: قبول طلب خدمة
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرّف الطلب
 *     responses:
 *       200:
 *         description: تم قبول الطلب بنجاح
 *       400:
 *         description: الطلب ليس في حالة انتظار
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
 *     summary: إكمال طلب خدمة
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: معرّف الطلب
 *     responses:
 *       200:
 *         description: تم إكمال الطلب بنجاح
 *       400:
 *         description: الطلب ليس في حالة مقبولة
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
 *         description: معرّف الطلب
 *     responses:
 *       200:
 *         description: تم إلغاء الطلب
 *       500:
 *         description: خطأ في السيرفر
 */
router.put('/:id/cancel', auth.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('service_requests')
            .update({ status: 'cancelled' })
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
