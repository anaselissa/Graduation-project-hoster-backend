import { calculateAirDistance, getDrivingDistance } from '../services/mapService.js';
import supabase from '../config/database.js';

export const getNearbyVolunteers = async (req, res) => {
  try {
    const { lat, lng, radius = 10, service_type_id } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat و lng مطلوبان' });

    let query = supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        bio,
        latitude,
        longitude,
        volunteer_services!inner(
          id,
          is_available,
          service_types(id, name)
        )
      `)
      .eq('user_type', 'volunteer')
      .eq('volunteer_services.is_available', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (service_type_id) {
      query = query.eq('volunteer_services.service_types.id', service_type_id);
    }

    const { data: volunteers, error } = await query;
    if (error) throw error;

    const nearby = (volunteers || [])
      .map(v => ({
        id: v.id,
        first_name: v.first_name,
        last_name: v.last_name,
        latitude: v.latitude,
        longitude: v.longitude,
        bio: v.bio,
        service_type_name: v.volunteer_services?.[0]?.service_types?.name,
        air_distance_km: Math.round(
          calculateAirDistance(
            parseFloat(lat),
            parseFloat(lng),
            v.latitude,
            v.longitude
          ) * 10
        ) / 10,
      }))
      .filter(v => v.air_distance_km <= parseFloat(radius))
      .sort((a, b) => a.air_distance_km - b.air_distance_km);

    res.json({ count: nearby.length, volunteers: nearby });
  } catch (error) {
    console.error('getNearbyVolunteers error:', error);
    res.status(500).json({ error: 'فشل جلب المتطوعين', details: error.message });
  }
};

export const getDrivingDistanceEndpoint = async (req, res) => {
  try {
    const { patient_lat, patient_lng, volunteer_lat, volunteer_lng } = req.query;
    if (!patient_lat || !patient_lng || !volunteer_lat || !volunteer_lng) {
      return res.status(400).json({ error: 'جميع الإحداثيات مطلوبة' });
    }

    const result = await getDrivingDistance(
      parseFloat(patient_lat),
      parseFloat(patient_lng),
      parseFloat(volunteer_lat),
      parseFloat(volunteer_lng)
    );
    res.json(result);
  } catch (error) {
    console.error('getDrivingDistance error:', error);
    res.status(500).json({ error: 'فشل حساب المسافة', details: error.message });
  }
};

export const getElderlyLocations = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('elderly_profiles')
      .select('id, full_name, latitude, longitude, address, notes')
      .eq('family_user_id', req.user.id)
      .not('latitude', 'is', null);

    if (error) throw error;
    res.json({ count: data.length, elderly: data });
  } catch (error) {
    console.error('getElderlyLocations error:', error);
    res.status(500).json({ error: 'فشل جلب مواقع المسنين', details: error.message });
  }
};
