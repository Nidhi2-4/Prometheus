export interface GeoCoordinates {
  lat: number;
  lng: number;
}

// Nagpur and Vidarbha district centers as fallback
export const DISTRICT_FALLBACKS: Record<string, GeoCoordinates> = {
  Nagpur: { lat: 21.1458, lng: 79.0882 },
  Wardha: { lat: 20.7453, lng: 78.6022 },
  Bhandara: { lat: 21.1714, lng: 79.6547 },
  Chandrapur: { lat: 19.9615, lng: 79.2961 },
  Amravati: { lat: 20.9374, lng: 77.7796 },
  Yavatmal: { lat: 20.3888, lng: 78.1204 },
};

export function getDeviceLocation(
  onSuccess: (coords: GeoCoordinates) => void,
  onError?: (fallback: GeoCoordinates) => void
) {
  if (!navigator.geolocation) {
    if (onError) onError(DISTRICT_FALLBACKS.Nagpur);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      onSuccess({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    },
    () => {
      // Denied or timeout -> fallback to district center
      if (onError) onError(DISTRICT_FALLBACKS.Nagpur);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
