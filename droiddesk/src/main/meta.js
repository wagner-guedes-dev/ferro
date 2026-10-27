'use strict';

// Device presets. Resolution/density values match the real hardware so the
// emulator renders exactly like the physical phone.
const DEVICES = [
  { id: 'pixel_8', name: 'Google Pixel 8', manufacturer: 'Google', model: 'Pixel 8', width: 1080, height: 2400, density: 420, ram: 4096 },
  { id: 'pixel_7', name: 'Google Pixel 7', manufacturer: 'Google', model: 'Pixel 7', width: 1080, height: 2400, density: 420, ram: 4096 },
  { id: 'pixel_6', name: 'Google Pixel 6', manufacturer: 'Google', model: 'Pixel 6', width: 1080, height: 2400, density: 420, ram: 3072 },
  { id: 'pixel_5', name: 'Google Pixel 5', manufacturer: 'Google', model: 'Pixel 5', width: 1080, height: 2340, density: 440, ram: 3072 },
  { id: 'pixel_4a', name: 'Google Pixel 4a', manufacturer: 'Google', model: 'Pixel 4a', width: 1080, height: 2340, density: 440, ram: 2048 },
  { id: 'galaxy_s23', name: 'Samsung Galaxy S23', manufacturer: 'samsung', model: 'SM-S911B', width: 1080, height: 2340, density: 420, ram: 4096 },
  { id: 'galaxy_s21', name: 'Samsung Galaxy S21', manufacturer: 'samsung', model: 'SM-G991B', width: 1080, height: 2400, density: 420, ram: 3072 },
  { id: 'galaxy_a54', name: 'Samsung Galaxy A54', manufacturer: 'samsung', model: 'SM-A546B', width: 1080, height: 2340, density: 400, ram: 3072 },
  { id: 'galaxy_s10', name: 'Samsung Galaxy S10', manufacturer: 'samsung', model: 'SM-G973F', width: 1080, height: 2280, density: 420, ram: 2048 },
  { id: 'xiaomi_13', name: 'Xiaomi 13', manufacturer: 'Xiaomi', model: '2211133C', width: 1080, height: 2400, density: 440, ram: 4096 },
  { id: 'redmi_note_12', name: 'Xiaomi Redmi Note 12', manufacturer: 'Xiaomi', model: '23021RAAEG', width: 1080, height: 2400, density: 400, ram: 3072 },
  { id: 'moto_g_power', name: 'Motorola Moto G Power', manufacturer: 'motorola', model: 'moto g power', width: 720, height: 1600, density: 280, ram: 2048 },
  { id: 'oneplus_11', name: 'OnePlus 11', manufacturer: 'OnePlus', model: 'CPH2449', width: 1080, height: 2400, density: 420, ram: 4096 },
  { id: 'tablet_10', name: 'Tablet 10"', manufacturer: 'Google', model: 'Pixel Tablet', width: 1600, height: 2560, density: 320, ram: 4096 },
];

// Country list: ISO code, flag, default locale and timezone.
const COUNTRIES = [
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
  { code: 'US', name: 'USA', flag: '🇺🇸', locale: 'en-US', timezone: 'America/New_York' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', locale: 'en-GB', timezone: 'Europe/London' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', locale: 'de-DE', timezone: 'Europe/Berlin' },
  { code: 'FR', name: 'France', flag: '🇫🇷', locale: 'fr-FR', timezone: 'Europe/Paris' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', locale: 'es-ES', timezone: 'Europe/Madrid' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', locale: 'it-IT', timezone: 'Europe/Rome' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', locale: 'pt-PT', timezone: 'Europe/Lisbon' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', locale: 'nl-NL', timezone: 'Europe/Amsterdam' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', locale: 'pl-PL', timezone: 'Europe/Warsaw' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', locale: 'sv-SE', timezone: 'Europe/Stockholm' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', locale: 'tr-TR', timezone: 'Europe/Istanbul' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', locale: 'ru-RU', timezone: 'Europe/Moscow' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', locale: 'en-CA', timezone: 'America/Toronto' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', locale: 'es-MX', timezone: 'America/Mexico_City' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', locale: 'es-AR', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', locale: 'es-CO', timezone: 'America/Bogota' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', locale: 'es-CL', timezone: 'America/Santiago' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', locale: 'es-PE', timezone: 'America/Lima' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', locale: 'en-AU', timezone: 'Australia/Sydney' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', locale: 'ja-JP', timezone: 'Asia/Tokyo' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', locale: 'ko-KR', timezone: 'Asia/Seoul' },
  { code: 'IN', name: 'India', flag: '🇮🇳', locale: 'en-IN', timezone: 'Asia/Kolkata' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', locale: 'id-ID', timezone: 'Asia/Jakarta' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', locale: 'en-PH', timezone: 'Asia/Manila' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', locale: 'th-TH', timezone: 'Asia/Bangkok' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', locale: 'ar-SA', timezone: 'Asia/Riyadh' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', locale: 'ar-AE', timezone: 'Asia/Dubai' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', locale: 'en-NG', timezone: 'Africa/Lagos' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', locale: 'en-ZA', timezone: 'Africa/Johannesburg' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', locale: 'ar-EG', timezone: 'Africa/Cairo' },
];

// API level -> Android version name.
const ANDROID_VERSIONS = {
  26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L',
  33: '13', 34: '14', 35: '15', 36: '16', 37: '17',
};

function androidVersionName(api) {
  return ANDROID_VERSIONS[api] || `API ${api}`;
}

function findDevice(id) {
  return DEVICES.find((d) => d.id === id) || DEVICES[2];
}

function findCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

module.exports = { DEVICES, COUNTRIES, ANDROID_VERSIONS, androidVersionName, findDevice, findCountry };
