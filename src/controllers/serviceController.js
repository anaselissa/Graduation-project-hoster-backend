import supabase from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export const createServiceRequest = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      urgency, 
      location_latitude, 
      location_longitude,
      location_address,
      elderly_profile_id,
      service_type_id,
      estimated_duration_minutes,
      budget
    } = req.body;

    const { data: request, error } = await supabase
      .from('service_requests')
      .insert({
        id: uuidv4(),
        family_user_id: req.user.id,
        elderly_profile_id: elderly_profile_id || null,
        service_type_id: service_type_id || null,
        title: title || description || 'طلب خدمة',
        description: description || '',
        urgency: urgency || 'normal',
        status: 'pending',
        location_latitude: location_latitude || 31.9454,
        location_longitude: location_longitude || 35.9284,
        location_address: location_address || '',
        estimated_duration_minutes: estimated_duration_minutes || 60,
        budget: budget || 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'تم إنشاء طلب الخدمة بنجاح',
      request: {
        id: request.id,
        title: request.title,
        status: request.status,
        created_at: request.created_at,
      }
    });
  } catch (error) {
    console.error('Create service request error:', error);
    res.status(500).json({ error: 'فشل إنشاء الطلب', details: error.message });
  }
};

export const getAvailableServices = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10, service_type_id } = req.query;

    let query = supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        bio,
        latitude,
        longitude,
        volunteer_services(
          id,
          is_available,
          service_types(id, name)
        )
      `)
      .eq('user_type', 'volunteer')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    const { data: volunteers, error } = await query;

    if (error) throw error;

    let result = (volunteers || [])
      .filter(v => v.volunteer_services && v.volunteer_services.length > 0)
      .map(v => ({
        id: v.id,
        first_name: v.first_name,
        last_name: v.last_name,
        bio: v.bio,
        latitude: v.latitude,
        longitude: v.longitude,
        services: v.volunteer_services,
      }));

    if (latitude && longitude && radius) {
      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);
      const radiusNum = parseFloat(radius);

      result = result.filter(v => {
        const dLat = (v.latitude - latNum) * 111;
        const dLng = (v.longitude - lngNum) * 111 * Math.cos(latNum * Math.PI / 180);
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);
        return distance <= radiusNum;
      });
    }

    if (service_type_id) {
      result = result.filter(v =>
        v.services.some(s => s.service_types?.id === service_type_id)
      );
    }

    res.json(result);
  } catch (error) {
    console.error('Get available services error:', error);
    res.status(500).json({ error: 'فشل جلب الخدمات', details: error.message });
  }
};

export const getServiceTypes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_types')
      .select('id, name, description');

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Get service types error:', error);
    res.status(500).json({ error: 'فشل جلب أنواع الخدمات', details: error.message });
  }
};

export const getUserServiceRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        urgency,
        created_at,
        service_types(id, name)
      `)
      .eq('family_user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Get user requests error:', error);
    res.status(500).json({ error: 'فشل جلب الطلبات', details: error.message });
  }
};

export const getVolunteerRequests = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        urgency,
        created_at,
        service_types(id, name)
      `)
      .or(`status.eq.pending,volunteer_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Get volunteer requests error:', error);
    res.status(500).json({ error: 'فشل جلب الطلبات', details: error.message });
  }
};

export const acceptServiceRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const { data: existing } = await supabase
      .from('service_requests')
      .select('id, family_user_id')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (!existing) return res.status(404).json({ error: 'الطلب غير موجود أو تم قبوله مسبقاً' });

    const { data: request, error } = await supabase
      .from('service_requests')
      .update({ 
        volunteer_id: req.user.id, 
        status: 'accepted', 
        accepted_at: new Date().toISOString() 
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'تم قبول الطلب بنجاح', request });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ error: 'فشل قبول الطلب', details: error.message });
  }
};

export const completeServiceRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const { data: request, error } = await supabase
      .from('service_requests')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString() 
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error || !request) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json({ message: 'تم إكمال الطلب بنجاح', request });
  } catch (error) {
    console.error('Complete request error:', error);
    res.status(500).json({ error: 'فشل إكمال الطلب', details: error.message });
  }
};