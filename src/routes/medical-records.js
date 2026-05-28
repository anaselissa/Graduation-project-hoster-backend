const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ─── الأنواع المدعومة ─────────────────────────────────────────────────────────
const RECORD_TYPES = {
  sugar:  { label: 'سكري',         unit: 'mg/dL', low: 70,   high: 140  },
  bp:     { label: 'ضغط الدم',     unit: 'mmHg',  low: 60,   high: 130  },
  temp:   { label: 'درجة الحرارة', unit: '°C',    low: 36.0, high: 37.5 },
  custom: { label: null,            unit: null,    low: null,  high: null },
};

function calcStatus(record_type, rawValue) {
  const t = RECORD_TYPES[record_type];
  if (!t || t.low === null) return 'normal';
  const n = parseFloat(rawValue);
  if (isNaN(n))   return 'normal';
  if (n < t.low)  return 'low';
  if (n > t.high) return 'high';
  return 'normal';
}

// ─── GET /api/medical-records ─────────────────────────────────────────────────
// query params: user_id, search, sort (date-desc|date-asc|name-asc|name-desc)
router.get('/', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;
    const search = (req.query.search || '').trim().toLowerCase();
    const sort   = req.query.sort || 'date-desc';

    const sortMap = {
      'date-desc': { column: 'created_at', ascending: false },
      'date-asc':  { column: 'created_at', ascending: true  },
      'name-asc':  { column: 'label',      ascending: true  },
      'name-desc': { column: 'label',      ascending: false },
    };
    const { column, ascending } = sortMap[sort] ?? sortMap['date-desc'];

    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('user_id', userId)
      .order(column, { ascending });

    if (error) throw error;

    let result = (data || []).map(r => ({
      id:          r.id,
      label:       r.label       || 'سجل طبي',
      value:       r.value       || '',
      unit:        r.unit        || '',
      record_type: r.record_type || 'custom',
      category:    r.category    || 'basic',
      notes:       r.notes       || '',
      status:      r.status      || 'normal',
      created_at:  r.created_at,
    }));

    // فلترة البحث محلياً
    if (search) {
      result = result.filter(r =>
        r.label.toLowerCase().includes(search) ||
        r.value.toLowerCase().includes(search) ||
        r.notes.toLowerCase().includes(search)
      );
    }

    res.json(result);
  } catch (err) {
    console.error('getMedicalRecords error:', err);
    res.status(500).json({ error: 'فشل جلب السجلات', details: err.message });
  }
});

// ─── POST /api/medical-records ────────────────────────────────────────────────
// body: { user_id?, record_type, label?, value, notes? }
// created_at يُولَّد تلقائياً من Supabase (DEFAULT now())
router.post('/', auth.authenticateToken, async (req, res) => {
  try {
    const { user_id, record_type = 'custom', label, value, notes = '' } = req.body;
    const targetId = user_id || req.user.id;

    if (!targetId || !value) {
      return res.status(400).json({ error: 'value مطلوب' });
    }

    const typeInfo   = RECORD_TYPES[record_type] ?? RECORD_TYPES.custom;
    const finalLabel = record_type !== 'custom'
      ? typeInfo.label
      : (label?.trim() || 'تحليل مخصص');
    const unit   = typeInfo.unit   ?? '';
    const status = calcStatus(record_type, value);

    const { data, error } = await supabase
      .from('medical_records')
      .insert({
        id:          uuidv4(),
        user_id:     targetId,
        label:       finalLabel,
        value,
        unit,
        record_type,
        category:    record_type === 'custom' ? 'custom' : 'basic',
        notes,
        status,
        // created_at: لا ترسله — Supabase يولّده تلقائياً
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'تم إضافة السجل بنجاح',
      record: {
        id:          data.id,
        label:       data.label,
        value:       data.value,
        unit:        data.unit,
        record_type: data.record_type,
        category:    data.category,
        notes:       data.notes,
        status:      data.status,
        created_at:  data.created_at,
      },
    });
  } catch (err) {
    console.error('createMedicalRecord error:', err);
    res.status(500).json({ error: 'فشل إضافة السجل', details: err.message });
  }
});

// ─── DELETE /api/medical-records/:id ─────────────────────────────────────────
router.delete('/:id', auth.authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('medical_records')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'تم حذف السجل بنجاح' });
  } catch (err) {
    console.error('deleteMedicalRecord error:', err);
    res.status(500).json({ error: 'فشل حذف السجل', details: err.message });
  }
});

module.exports = router;