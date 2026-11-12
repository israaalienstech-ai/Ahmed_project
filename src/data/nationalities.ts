/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Nationality {
  code: string;
  name: string; // Arabic nationality demonym / country
}

export const ARABIC_NATIONALITIES: Nationality[] = [
  // Arab Countries
  { code: 'KW', name: 'كويتي' },
  { code: 'SA', name: 'سعودي' },
  { code: 'AE', name: 'إماراتي' },
  { code: 'QA', name: 'قطري' },
  { code: 'BH', name: 'بحريني' },
  { code: 'OM', name: 'عماني' },
  { code: 'EG', name: 'مصري' },
  { code: 'JO', name: 'أردني' },
  { code: 'LB', name: 'لبناني' },
  { code: 'SY', name: 'سوري' },
  { code: 'IQ', name: 'عراقي' },
  { code: 'PS', name: 'فلسطيني' },
  { code: 'YE', name: 'يمني' },
  { code: 'SD', name: 'سوداني' },
  { code: 'TN', name: 'تونسي' },
  { code: 'MA', name: 'مغربي' },
  { code: 'DZ', name: 'جزائري' },
  { code: 'LY', name: 'ليبي' },
  { code: 'MR', name: 'موريتاني' },
  { code: 'SO', name: 'صومالي' },
  { code: 'DJ', name: 'جيبوتي' },
  { code: 'KM', name: 'قمري' },

  // South & East & Southeast Asia
  { code: 'IN', name: 'هندي' },
  { code: 'PK', name: 'باكستاني' },
  { code: 'BD', name: 'بنغلاديشي' },
  { code: 'PH', name: 'فلبيني' },
  { code: 'LK', name: 'سريلانكي' },
  { code: 'NP', name: 'نيبالي' },
  { code: 'ID', name: 'إندونيسي' },
  { code: 'TH', name: 'تايلاندي' },
  { code: 'VN', name: 'فيتنامي' },
  { code: 'MY', name: 'ماليزي' },
  { code: 'MM', name: 'ميانماري' },
  { code: 'CN', name: 'صيني' },
  { code: 'JP', name: 'ياباني' },
  { code: 'KR', name: 'كوري جنوبي' },
  { code: 'AF', name: 'أفغاني' },
  { code: 'IR', name: 'إيراني' },
  { code: 'TR', name: 'تركي' },

  // Europe
  { code: 'GB', name: 'بريطاني' },
  { code: 'FR', name: 'فرنسي' },
  { code: 'DE', name: 'ألماني' },
  { code: 'IT', name: 'إيطالي' },
  { code: 'ES', name: 'إسباني' },
  { code: 'PT', name: 'برتغالي' },
  { code: 'NL', name: 'هولندي' },
  { code: 'BE', name: 'بلجيكي' },
  { code: 'CH', name: 'سويسري' },
  { code: 'AT', name: 'نمساوي' },
  { code: 'SE', name: 'سويدي' },
  { code: 'NO', name: 'نرويجي' },
  { code: 'DK', name: 'دنماركي' },
  { code: 'FI', name: 'فنلندي' },
  { code: 'IE', name: 'أيرلندي' },
  { code: 'RU', name: 'روسي' },
  { code: 'UA', name: 'أوكراني' },
  { code: 'PL', name: 'بولندي' },
  { code: 'RO', name: 'روماني' },
  { code: 'GR', name: 'يوناني' },
  { code: 'CZ', name: 'تشيكي' },
  { code: 'HU', name: 'مجري' },
  { code: 'BG', name: 'بلغاري' },
  { code: 'RS', name: 'صربي' },
  { code: 'BA', name: 'بوسني' },
  { code: 'HR', name: 'كرواتي' },
  { code: 'AL', name: 'ألباني' },
  { code: 'CY', name: 'قبرصي' },
  { code: 'GE', name: 'جورجي' },
  { code: 'AM', name: 'أرميني' },
  { code: 'AZ', name: 'أذربيجاني' },

  // Americas & Oceania
  { code: 'US', name: 'أمريكي' },
  { code: 'CA', name: 'كندي' },
  { code: 'MX', name: 'مكسيكي' },
  { code: 'BR', name: 'برازيلي' },
  { code: 'AR', name: 'أرجنتيني' },
  { code: 'CL', name: 'تشيلي' },
  { code: 'CO', name: 'كولومبي' },
  { code: 'VE', name: 'فنزويلي' },
  { code: 'AU', name: 'أسترالي' },
  { code: 'NZ', name: 'نيوزيلندي' },

  // Africa
  { code: 'ET', name: 'إثيوبي' },
  { code: 'ER', name: 'إريتري' },
  { code: 'KE', name: 'كيني' },
  { code: 'UG', name: 'أوغندي' },
  { code: 'TZ', name: 'تنزاني' },
  { code: 'NG', name: 'نيجيري' },
  { code: 'GH', name: 'غاني' },
  { code: 'SN', name: 'سنغالي' },
  { code: 'CI', name: 'إيفواري' },
  { code: 'CM', name: 'كاميروني' },
  { code: 'ZA', name: 'جنوب أفريقي' },
  { code: 'ML', name: 'مالي' },
  { code: 'NE', name: 'نيجري' },
  { code: 'TD', name: 'تشادي' },
  { code: 'ZW', name: 'زيمبابوي' },
  { code: 'MG', name: 'مدغشقري' },

  // Central Asia
  { code: 'KZ', name: 'كازاخستاني' },
  { code: 'UZ', name: 'أوزبكستاني' },
  { code: 'KG', name: 'قيرغيزستاني' },
  { code: 'TJ', name: 'طاجيكستاني' },
  { code: 'TM', name: 'تركمانستاني' }
];
