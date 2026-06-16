import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

function calculateAirDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

async function getDrivingDistance(patientLat, patientLng, volunteerLat, volunteerLng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('مفتاح خرائط جوجل غير موجود في ملف .env');
  }

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${patientLat},${patientLng}&destinations=${volunteerLat},${volunteerLng}&key=${apiKey}`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      return {
        success: true,
        distanceText: data.rows[0].elements[0].distance.text,
        distanceKm: data.rows[0].elements[0].distance.value / 1000,
        durationText: data.rows[0].elements[0].duration.text,
      };
    } else {
      return { success: false, message: 'لا يوجد مسار سيارة متاح.' };
    }
  } catch (error) {
    console.error('Google Maps API Error:', error.message);
    return { success: false, message: 'خطأ في الاتصال بخرائط جوجل.' };
  }
}

export { calculateAirDistance, getDrivingDistance };
