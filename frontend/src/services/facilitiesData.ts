import { Facility, TriageLevel } from '../types/health';

export const DEMO_FACILITIES: Facility[] = [
  {
    id: 'fac_phc_hingna',
    name: 'Primary Health Centre (PHC) Hingna',
    type: 'phc',
    lat: 21.0667,
    lng: 78.9667,
    phone: '07104-242108',
    distance_km: 2.8,
    travel_min: 10,
    doctor_available: true,
    doctor_arrives_in_min: 0,
    queue_wait_min: 15,
    time_to_doctor_min: 25,
    availability_updated_min_ago: 5,
    cost_tier: 'free',
    pmjay_empanelled: true,
    has_maternity: true,
    emergency_capable: false,
    rating: 4.4,
    review_count: 92,
    simulated_fields: ['doctor_available', 'doctor_arrives_in_min', 'queue_wait_min', 'rating', 'review_count'],
  },
  {
    id: 'fac_chc_wadi',
    name: 'Community Health Centre (CHC) Wadi',
    type: 'chc',
    lat: 21.1497,
    lng: 78.9912,
    phone: '0712-234500',
    distance_km: 6.2,
    travel_min: 18,
    doctor_available: true,
    doctor_arrives_in_min: 0,
    queue_wait_min: 25,
    time_to_doctor_min: 43,
    availability_updated_min_ago: 12,
    cost_tier: 'free',
    pmjay_empanelled: true,
    has_maternity: true,
    emergency_capable: true,
    rating: 4.2,
    review_count: 145,
    simulated_fields: ['doctor_available', 'doctor_arrives_in_min', 'queue_wait_min', 'rating', 'review_count'],
  },
  {
    id: 'fac_dist_hosp',
    name: 'Nagpur District Civil Hospital',
    type: 'district_hospital',
    lat: 21.1458,
    lng: 79.0882,
    phone: '0712-2560555',
    distance_km: 11.5,
    travel_min: 26,
    doctor_available: true,
    doctor_arrives_in_min: 0,
    queue_wait_min: 35,
    time_to_doctor_min: 61,
    availability_updated_min_ago: 8,
    cost_tier: 'free',
    pmjay_empanelled: true,
    has_maternity: true,
    emergency_capable: true,
    rating: 4.1,
    review_count: 480,
    simulated_fields: ['doctor_available', 'doctor_arrives_in_min', 'queue_wait_min', 'rating', 'review_count'],
  },
  {
    id: 'fac_aiims_nagpur',
    name: 'AIIMS Super Specialty Hospital, MIHAN',
    type: 'medical_college',
    lat: 21.0422,
    lng: 79.0345,
    phone: '0712-2970500',
    distance_km: 14.0,
    travel_min: 28,
    doctor_available: true,
    doctor_arrives_in_min: 0,
    queue_wait_min: 40,
    time_to_doctor_min: 68,
    availability_updated_min_ago: 3,
    cost_tier: 'subsidized',
    pmjay_empanelled: true,
    has_maternity: true,
    emergency_capable: true,
    rating: 4.7,
    review_count: 810,
    simulated_fields: ['doctor_available', 'doctor_arrives_in_min', 'queue_wait_min', 'rating', 'review_count'],
  },
  {
    id: 'fac_shri_krishna',
    name: 'Shri Krishna Empanelled Care Centre',
    type: 'private',
    lat: 21.1211,
    lng: 79.0522,
    phone: '0712-2789123',
    distance_km: 8.4,
    travel_min: 20,
    doctor_available: false,
    doctor_arrives_in_min: 30,
    queue_wait_min: 10,
    time_to_doctor_min: 60,
    availability_updated_min_ago: 15,
    cost_tier: 'paid',
    pmjay_empanelled: true,
    has_maternity: false,
    emergency_capable: true,
    rating: 4.5,
    review_count: 210,
    simulated_fields: ['doctor_available', 'doctor_arrives_in_min', 'queue_wait_min', 'rating', 'review_count'],
  },
];

export function getRankedFacilities(
  triageLevel: TriageLevel,
  isPregnant: boolean = false
): Facility[] {
  let list = [...DEMO_FACILITIES];

  if (triageLevel === 'emergency') {
    // Only emergency-capable, ranked by pure travel time
    list = list.filter((f) => f.emergency_capable);
    list.sort((a, b) => a.travel_min - b.travel_min);
    return list;
  }

  if (isPregnant) {
    // Prefer facilities with maternity services
    list = list.filter((f) => f.has_maternity);
  }

  // Rank by time_to_doctor_min
  list.sort((a, b) => (a.time_to_doctor_min ?? Infinity) - (b.time_to_doctor_min ?? Infinity));
  return list;
}
