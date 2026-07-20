// Maps balldontlie's free-text country names (fighters.nationality and
// events.country — both plain English names, not ISO codes: "USA", "Brazil",
// "England", "Türkiye", …) to country-flag-icons' flag keys, so a flag can be
// rendered next to a fighter's nationality or an event's location.
//
// country-flag-icons exposes the raw SVG string per key under
// `country-flag-icons/string/3x2`. We access it by bracket notation, which
// sidesteps two problems: the UK constituents ship as GB_ENG/GB_SCT/GB_WLS/
// GB_NIR (real English/Scottish/Welsh/Northern-Irish flags, not just the Union
// Jack — worth having for an MMA roster), and codes like DO aren't valid as
// bare named imports. We import the whole 3x2 index (~265 flags): any country
// name the map below resolves gets a flag with no further wiring, so a fighter
// from a not-yet-seen country works the moment its name is added here.
//
// The keys below are exactly the distinct values currently present in the DB
// (checked 2026-07-20) plus a few common alternate spellings as a safety net.
// An unmapped name simply renders no flag (see flagSvgForCountry), never errors.
import * as FlagStrings from 'country-flag-icons/string/3x2';

const flags = FlagStrings as unknown as Record<string, string | undefined>;

const COUNTRY_TO_FLAG_KEY: Record<string, string> = {
  Afghanistan: 'AF',
  Albania: 'AL',
  Algeria: 'DZ',
  Angola: 'AO',
  Argentina: 'AR',
  Armenia: 'AM',
  Aruba: 'AW',
  Australia: 'AU',
  Austria: 'AT',
  Azerbaijan: 'AZ',
  Bahrain: 'BH',
  Barbados: 'BB',
  Belgium: 'BE',
  Benin: 'BJ',
  Bolivia: 'BO',
  'Bosnia & Herzegovina': 'BA',
  'Bosnia and Herzegovina': 'BA',
  Brazil: 'BR',
  'Burkina Faso': 'BF',
  Cameroon: 'CM',
  Canada: 'CA',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  Croatia: 'HR',
  Cuba: 'CU',
  Czechia: 'CZ',
  'Czech Republic': 'CZ',
  'Democratic Republic of Congo': 'CD',
  'DR Congo': 'CD',
  Denmark: 'DK',
  'Dominican Republic': 'DO',
  Ecuador: 'EC',
  Egypt: 'EG',
  England: 'GB_ENG',
  Finland: 'FI',
  France: 'FR',
  Georgia: 'GE',
  Germany: 'DE',
  Greece: 'GR',
  Guam: 'GU',
  Guinea: 'GN',
  'Guinea-Bissau': 'GW',
  Guyana: 'GY',
  Haiti: 'HT',
  Hungary: 'HU',
  India: 'IN',
  Iran: 'IR',
  Iraq: 'IQ',
  Ireland: 'IE',
  Italy: 'IT',
  'Ivory Coast': 'CI',
  Jamaica: 'JM',
  Japan: 'JP',
  Jordan: 'JO',
  Kazakhstan: 'KZ',
  Kenya: 'KE',
  Kuwait: 'KW',
  Kyrgyzstan: 'KG',
  Latvia: 'LV',
  Lebanon: 'LB',
  Liberia: 'LR',
  Lithuania: 'LT',
  Macau: 'MO',
  Mexico: 'MX',
  Moldova: 'MD',
  Mongolia: 'MN',
  Morocco: 'MA',
  Myanmar: 'MM',
  Netherlands: 'NL',
  'New Zealand': 'NZ',
  Nigeria: 'NG',
  'Northern Ireland': 'GB_NIR',
  Norway: 'NO',
  Palestine: 'PS',
  Panama: 'PA',
  Peru: 'PE',
  Philippines: 'PH',
  Poland: 'PL',
  Portugal: 'PT',
  'Puerto Rico': 'PR',
  Qatar: 'QA',
  Romania: 'RO',
  Russia: 'RU',
  Rwanda: 'RW',
  'Saudi Arabia': 'SA',
  Scotland: 'GB_SCT',
  Senegal: 'SN',
  Serbia: 'RS',
  Singapore: 'SG',
  Slovakia: 'SK',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  Spain: 'ES',
  Suriname: 'SR',
  Sweden: 'SE',
  Switzerland: 'CH',
  Syria: 'SY',
  Tajikistan: 'TJ',
  Tanzania: 'TZ',
  Thailand: 'TH',
  Tunisia: 'TN',
  Türkiye: 'TR',
  Turkey: 'TR',
  Turkmenistan: 'TM',
  Uganda: 'UG',
  Ukraine: 'UA',
  'United Arab Emirates': 'AE',
  'United Kingdom': 'GB',
  'United States': 'US',
  Uruguay: 'UY',
  USA: 'US',
  Uzbekistan: 'UZ',
  Venezuela: 'VE',
  Vietnam: 'VN',
  'Virgin Islands': 'VI',
  Wales: 'GB_WLS',
  Zambia: 'ZM',
  Zimbabwe: 'ZW',
};

// Lowercased index for a case-insensitive fallback, so a casing drift upstream
// ("england" vs "England") still resolves.
const LOWER_INDEX: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_TO_FLAG_KEY).map(([name, key]) => [name.toLowerCase(), key])
);

// Returns the raw SVG string for a country name, or null if we don't have a
// mapping (or the key somehow isn't in the flag set). Callers render nothing
// on null.
export function flagSvgForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  const key = COUNTRY_TO_FLAG_KEY[trimmed] ?? LOWER_INDEX[trimmed.toLowerCase()];
  if (!key) return null;
  return flags[key] ?? null;
}
