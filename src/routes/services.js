const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// خريطة تربط key النصي (في volunteers.service_type_id) بالاسم العربي (في service_types.name)
// عدّل هذه القيم لتطابق ما هو موجود فعلاً في جدول service_types
// الأسماء الحقيقية من جدول service_types في Supabase
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

// دالة مساعدة: تحول الـ key النصي إلى UUID من service_types
async function getServiceTypeIdByKey(serviceKey) {
  if (!serviceKey) return null;

  // أولاً: جلب كل الأنواع
  const { data: types } = await supabase
    .from('service_types')
    .select('id, name');

  if (!types || types.length === 0) return null;

  const keywords = SERVICE_KEY_MAP[serviceKey] || [serviceKey];

  for (const type of types) {
    const dbName = (type.name || '').toLowerCase().trim();

    // مطابقة مباشرة بالـ key
    if (dbName === serviceKey.toLowerCase()) return type.id;

    // مطابقة بالكلمات المفتاحية
    for (const kw of keywords) {
      if (dbName === kw.toLowerCase() || dbName.includes(kw.toLowerCase())) {
        return type.id;
      }
    }
  }

  return null;
}

// GET /api/services/types
router.get('/types', auth.authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_types')
      .select('id, name, description');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب أنواع الخدمات', details: err.message });
  }
});

// GET /api/services/requests - للأهالي
router.get('/requests', auth.authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('service_requests')
      .select('id, title, description, status, urgency, created_at, service_type_id, volunteer_id')
      .eq('family_user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const requests = await Promise.all((data || []).map(async (r) => {
      if (r.volunteer_id) {
        const { data: volUser } = await supabase
          .from('users')
          .select('first_name, last_name, phone_number')
          .eq('id', r.volunteer_id)
          .maybeSingle();
        return { ...r, volunteer_info: volUser || null };
      }
      return { ...r, volunteer_info: null };
    }));

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب الطلبات', details: err.message });
  }
});

// GET /api/services/volunteer-requests - للمتطوعين
router.get('/volunteer-requests', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. جيب تخصص الـ volunteer (النص مثل 'medicine_delivery')
    const { data: volRows } = await supabase
      .from('volunteers')
      .select('service_type_id')
      .eq('volunteer_id', userId)
      .limit(1);

    console.log("👤 volunteer rows:", JSON.stringify(volRows));
    const volunteerServiceKey = (volRows && volRows.length > 0)
      ? (volRows[0].service_type_id || null)
      : null;

    // 2. حوّل الـ key إلى UUID باستخدام الدالة المحسّنة
    let serviceTypeId = null;
    console.log("🔑 volunteerServiceKey:", volunteerServiceKey);
    if (volunteerServiceKey) {
      serviceTypeId = await getServiceTypeIdByKey(volunteerServiceKey);
      console.log("🆔 serviceTypeId من الـ key:", serviceTypeId);

      // لو ما لقينا UUID — جرب مطابقة مباشرة في volunteer_services
      if (!serviceTypeId) {
        const { data: vsRows } = await supabase
          .from('volunteer_services')
          .select('service_type_id')
          .eq('volunteer_id', userId)
          .limit(1);
        if (vsRows && vsRows.length > 0) {
          serviceTypeId = vsRows[0].service_type_id;
        }
      }
    }

    let data, error;

    if (serviceTypeId) {
      // الطلبات المطابقة لتخصصه (pending) + طلباته هو (مهما كان service_type_id)
      ({ data, error } = await supabase
        .from('service_requests')
        .select('id, title, description, status, urgency, location_address, created_at, service_type_id, volunteer_id, family_user_id')
        .or(`and(status.eq.pending,service_type_id.eq.${serviceTypeId}),volunteer_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(30));
    } else {
      // ما عنده تخصص محدد — يشوف طلباته بس
      ({ data, error } = await supabase
        .from('service_requests')
        .select('id, title, description, status, urgency, location_address, created_at, service_type_id, volunteer_id, family_user_id')
        .eq('volunteer_id', userId)
        .order('created_at', { ascending: false })
        .limit(30));
    }

    if (error) throw error;

    // إزالة التكرار
    const seen = new Set();
    const unique = (data || []).filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // إضافة معلومات الأهالي للطلبات المقبولة/المكتملة
    const enriched = await Promise.all(unique.map(async (r) => {
      if (r.family_user_id && (r.status === 'accepted' || r.status === 'completed')) {
        const { data: familyUser } = await supabase
          .from('users')
          .select('first_name, last_name, phone_number')
          .eq('id', r.family_user_id)
          .maybeSingle();
        return { ...r, users: familyUser || null };
      }
      return { ...r, users: null };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('volunteer-requests error:', JSON.stringify(err, null, 2));
    res.status(500).json({
      error: 'فشل جلب الطلبات',
      details: err.message,
      hint: err.hint,
      code: err.code
    });
  }
});

// POST /api/services/requests - إنشاء طلب
router.post('/requests', auth.authenticateToken, async (req, res) => {
  try {
    const { title, description, urgency, location_address, service_type_id, service_key } = req.body;

    console.log("📦 بيانات الطلب الواصلة:", JSON.stringify(req.body, null, 2));

    // نعتمد على service_key دائماً لأنه الأدق — يتجاهل service_type_id الواصل من Flutter
    let resolvedServiceTypeId = null;
    if (service_key) {
      resolvedServiceTypeId = await getServiceTypeIdByKey(service_key);
      console.log("🔑 service_key:", service_key, "→ UUID:", resolvedServiceTypeId);
    } else if (service_type_id) {
      // fallback لو ما في service_key
      resolvedServiceTypeId = service_type_id;
    }

    console.log("✅ resolvedServiceTypeId النهائي:", resolvedServiceTypeId);

    const { data: request, error } = await supabase
      .from('service_requests')
      .insert({
        id: uuidv4(),
        family_user_id: req.user.id,
        service_type_id: resolvedServiceTypeId,
        title: title || 'طلب خدمة',
        description: description || '',
        urgency: urgency || 'normal',
        status: 'pending',
        location_latitude: 31.9454,
        location_longitude: 35.9284,
        location_address: location_address || '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'تم إنشاء الطلب بنجاح',
      request: {
        id: request.id,
        title: request.title,
        status: request.status,
        service_type_id: request.service_type_id,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'فشل إنشاء الطلب', details: err.message });
  }
});

// POST /api/services/requests/:id/accept
router.post('/requests/:id/accept', auth.authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .update({
        volunteer_id: req.user.id,
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'الطلب غير موجود أو تم قبوله مسبقاً' });
    }
    res.json({ message: 'تم قبول الطلب بنجاح', request: data });
  } catch (err) {
    res.status(500).json({ error: 'فشل قبول الطلب', details: err.message });
  }
});

// POST /api/services/requests/:id/complete
router.post('/requests/:id/complete', auth.authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }
    res.json({ message: 'تم إكمال الطلب بنجاح', request: data });
  } catch (err) {
    res.status(500).json({ error: 'فشل إكمال الطلب', details: err.message });
  }
});

module.exports = router;