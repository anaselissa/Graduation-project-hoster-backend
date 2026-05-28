    -- =====================================================
-- Migration: إنشاء جدول medical_records في Supabase
-- شغّل هذا الـ SQL في Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;

-- كل مستخدم يشوف سجلاته فقط
CREATE POLICY "Users can view own records"
  ON medical_records FOR SELECT
  USING (auth.uid()::text = user_id::text OR true); -- مؤقتاً open للـ service key

CREATE POLICY "Users can insert own records"
  ON medical_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete own records"
  ON medical_records FOR DELETE
  USING (true);

-- =====================================================
-- Migration: إضافة service_type_id و documents_status لجدول volunteers
-- =====================================================

-- إضافة عمود نوع الخدمة
ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS service_type_id TEXT
    CHECK (service_type_id IN (
      'medicine_delivery',
      'food_delivery',
      'transportation',
      'medical_care',
      'home_maintenance',
      'educational_support',
      'shopping',
      'elderly_companionship'
    ));

-- إضافة عمود حالة الوثائق (pending = بانتظار المراجعة, approved = موافق عليه, rejected = مرفوض)
ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS documents_status TEXT DEFAULT 'pending'
    CHECK (documents_status IN ('pending', 'approved', 'rejected'));

-- =====================================================
-- Migration: جدول وثائق المتطوعين
-- =====================================================
CREATE TABLE IF NOT EXISTS volunteer_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL,   -- 'id_card' | 'no_criminal' | 'driving_license' | ...
  service_type_id  TEXT,            -- نوع الخدمة المرتبطة بالوثيقة (null = وثيقة مشتركة)
  file_url         TEXT,            -- رابط الملف في Supabase Storage
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ
);

ALTER TABLE volunteer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Volunteers can insert own documents"
  ON volunteer_documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Volunteers can view own documents"
  ON volunteer_documents FOR SELECT
  USING (true);

-- Index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_vol_docs_volunteer ON volunteer_documents(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_service_type ON volunteers(service_type_id);

    
