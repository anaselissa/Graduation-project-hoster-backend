import supabase from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// الأنواع المدعومة مع قيمها المرجعية
const RECORD_TYPES = {
  sugar:  { label: 'سكري',          unit: 'mg/dL', low: 70,   high: 140  },
  bp:     { label: 'ضغط الدم',      unit: 'mmHg',  low: 60,   high: 130  },
  temp:   { label: 'درجة الحرارة',  unit: '°C',    low: 36.0, high: 37.5 },
  custom: { label: null,             unit: null,    low: null,  high: null },
};

// حساب الحالة تلقائياً (normal / high / low)
function calcStatus(record_type, numericValue) {
  const t = RECORD_TYPES[record_type];
  if (!t || t.low === null || isNaN(numericValue)) return 'normal';
  if (numericValue < t.low)  return 'low';
  if (numericValue > t.high) return 'high';
  return 'normal';
}

// ─── GET /medical-records?user_id=... ────────────────────────────────────────
export const getMedicalRecords = async (req, res) => {
  try {
    const { user_id, search, sort } = req.query;
    const targetId = user_id || req.user?.id;
    if (!targetId) return res.status(400).json({ error: 'user_id مطلوب' });

    let query = supabase
      .from('medical_records')
      .select('*')
      .eq('user_id', targetId);

    // فرز
    const sortMap = {
      'date-desc': { col: 'created_at', asc: false },
      'date-asc':  { col: 'created_at', asc: true  },
      'name-asc':  { col: 'label',      asc: true  },
      'name-desc': { col: 'label',      asc: false },
    };
    const s = sortMap[sort] ?? { col: 'created_at', asc: false };
    query = query.order(s.col, { ascending: s.asc });

    const { data, error } = await query;
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

    // بحث نصي (يُنفَّذ على الـ result بعد الجلب لأن Supabase ilike محدود)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r =>
        r.label.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q)
      );
    }

    res.json(result);
  } catch (error) {
    console.error('getMedicalRecords error:', error);
    res.status(500).json({ error: 'فشل جلب السجلات', details: error.message });
  }
};

// ─── POST /medical-records ────────────────────────────────────────────────────
export const createMedicalRecord = async (req, res) => {
  try {
    const { user_id, label, value, record_type = 'custom', notes = '' } = req.body;
    const targetId = user_id || req.user?.id;

    if (!targetId || !value) {
      return res.status(400).json({ error: 'user_id و value مطلوبان' });
    }

    // تحديد الـ label والـ unit تلقائياً حسب النوع
    const typeInfo  = RECORD_TYPES[record_type] ?? RECORD_TYPES.custom;
    const finalLabel = (record_type !== 'custom')
      ? typeInfo.label
      : (label?.trim() || 'تحليل مخصص');
    const unit   = typeInfo.unit ?? '';
    const status = calcStatus(record_type, parseFloat(value));

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
        // created_at يُولَّد تلقائياً من Supabase (now()) — لا حاجة لإرساله
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
  } catch (error) {
    console.error('createMedicalRecord error:', error);
    res.status(500).json({ error: 'فشل إضافة السجل', details: error.message });
  }
};

// ─── DELETE /medical-records/:id ─────────────────────────────────────────────
export const deleteMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id مطلوب' });

    const { error } = await supabase
      .from('medical_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'تم حذف السجل بنجاح' });
  } catch (error) {
    console.error('deleteMedicalRecord error:', error);
    res.status(500).json({ error: 'فشل حذف السجل', details: error.message });
  }
};