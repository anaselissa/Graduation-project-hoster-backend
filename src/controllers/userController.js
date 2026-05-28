import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth.js';
import supabase from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export const registerUser = async (req, res) => {
  try {
    const { email, password, first_name, last_name, user_type, phone } = req.body;

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        id: uuidv4(),
        email,
        password_hash: hashedPassword,
        first_name,
        last_name,
        phone_number: phone || '0000000000',
        user_type: user_type,
        address: '',
      })
      .select('id, email, first_name, last_name, user_type')
      .single();

    if (error) throw error;

    const normalized = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      user_type: user.user_type,
    };

    const token = generateToken(normalized);
    res.status(201).json({ 
      message: 'تم التسجيل بنجاح', 
      user: normalized, 
      token 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'فشل التسجيل', details: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user) return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

    const normalized = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      user_type: user.user_type,
    };

    const token = generateToken(normalized);
    res.json({ message: 'تم تسجيل الدخول بنجاح', user: normalized, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'فشل تسجيل الدخول', details: error.message });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, user_type, phone_number, address')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      user_type: user.user_type,
      phone: user.phone_number,
      address: user.address,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'فشل جلب الملف الشخصي', details: error.message });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone, bio, address, latitude, longitude } = req.body;
    const updates = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (phone !== undefined) updates.phone_number = phone;
    if (address !== undefined) updates.address = address;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, email, first_name, last_name, user_type, phone_number, address')
      .single();

    if (error) throw error;

    res.json({
      message: 'تم تحديث الملف الشخصي بنجاح',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        user_type: user.user_type,
        phone: user.phone_number,
        address: user.address,
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'فشل تحديث الملف الشخصي', details: error.message });
  }
};

export const getVolunteerProfile = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone_number, address, bio')
      .eq('id', req.params.id)
      .eq('user_type', 'volunteer')
      .single();

    if (error || !user) return res.status(404).json({ error: 'المتطوع غير موجود' });

    const { data: services } = await supabase
      .from('volunteer_services')
      .select(`
        id, 
        is_available,
        service_types(id, name)
      `)
      .eq('volunteer_id', user.id);

    const { data: ratings } = await supabase
      .from('volunteer_ratings')
      .select('rating')
      .eq('volunteer_id', user.id);

    const avgRating = ratings && ratings.length > 0
      ? ratings.reduce((a, b) => a + b.rating, 0) / ratings.length
      : 0;

    res.json({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone_number,
      address: user.address,
      bio: user.bio || '',
      services: services || [],
      rating: {
        average_rating: Math.round(avgRating * 10) / 10,
        total_ratings: ratings?.length || 0,
        total_services_completed: services?.filter(s => !s.is_available).length || 0,
      },
    });
  } catch (error) {
    console.error('Get volunteer profile error:', error);
    res.status(500).json({ error: 'فشل جلب ملف المتطوع', details: error.message });
  }
};