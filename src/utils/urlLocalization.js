// Country detection and URL localization utilities

/**
 * Get user's country code using IP geolocation
 * Falls back to 'US' if detection fails
 */
export async function detectUserCountry() {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return 'US'; // Default for server environments
  }

  try {
    // Try multiple geolocation services for better reliability
    const services = [
      { url: 'https://ipapi.co/country/', prop: null },
      { url: 'https://ipinfo.io/json', prop: 'country' },
      { url: 'https://ip-api.com/json/', prop: 'countryCode' }
    ];

    for (const service of services) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        const response = await fetch(service.url, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          if (service.prop) {
            const data = await response.json();
            const country = data[service.prop];
            if (country && typeof country === 'string' && country.length === 2) {
              return country.toUpperCase();
            }
          } else {
            const country = await response.text();
            if (country && typeof country === 'string' && country.trim().length === 2) {
              return country.trim().toUpperCase();
            }
          }
        }
      } catch (error) {
        console.warn(`Geolocation service failed: ${service.url}`, error);
        continue; // Try next service
      }
    }
  } catch (error) {
    console.warn('All geolocation services failed:', error);
  }

  // Fallback: try to detect from browser language or timezone
  try {
    // Check browser language for country hints
    const language = typeof navigator !== 'undefined' ? (navigator.language || navigator.userLanguage) : null;
    if (language) {
      const parts = language.split('-');
      if (parts.length > 1) {
        const countryFromLang = parts[1].toUpperCase();
        // Validate it's a reasonable country code
        if (['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'JP', 'IN', 'BR'].includes(countryFromLang)) {
          return countryFromLang;
        }
      }
    }

    // Check timezone for country hints
    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    if (timezone) {
      const timezoneCountryMap = {
        'America/New_York': 'US',
        'America/Chicago': 'US',
        'America/Denver': 'US',
        'America/Los_Angeles': 'US',
        'America/Toronto': 'CA',
        'America/Vancouver': 'CA',
        'Europe/London': 'GB',
        'Europe/Berlin': 'DE',
        'Europe/Paris': 'FR',
        'Europe/Rome': 'IT',
        'Europe/Madrid': 'ES',
        'Australia/Sydney': 'AU',
        'Australia/Melbourne': 'AU',
        'Asia/Tokyo': 'JP',
        'Asia/Kolkata': 'IN',
        'America/Sao_Paulo': 'BR'
      };

      if (timezoneCountryMap[timezone]) {
        return timezoneCountryMap[timezone];
      }
    }
  } catch (error) {
    console.warn('Browser-based country detection failed:', error);
  }

  // Final fallback
  return 'US';
}

/**
 * Amazon domain mapping by country code
 */
const AMAZON_DOMAINS = {
  'US': 'amazon.com',
  'CA': 'amazon.ca',
  'GB': 'amazon.co.uk',
  'DE': 'amazon.de',
  'FR': 'amazon.fr',
  'IT': 'amazon.it',
  'ES': 'amazon.es',
  'JP': 'amazon.co.jp',
  'AU': 'amazon.com.au',
  'IN': 'amazon.in',
  'BR': 'amazon.com.br',
  'MX': 'amazon.com.mx',
  'NL': 'amazon.nl',
  'SG': 'amazon.sg',
  'AE': 'amazon.ae',
  'SA': 'amazon.sa',
  'TR': 'amazon.com.tr',
  'PL': 'amazon.pl',
  'SE': 'amazon.se',
  'EG': 'amazon.eg'
};

/**
 * Localize Amazon URL based on user's country
 * @param {string} url - Original Amazon URL
 * @param {string} countryCode - User's country code (2-letter ISO)
 * @returns {string} Localized Amazon URL
 */
export function localizeAmazonUrl(url, countryCode) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Check if this is an Amazon URL
  const amazonRegex = /https?:\/\/(?:www\.)?amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au|in|com\.br|com\.mx|nl|sg|ae|sa|com\.tr|pl|se|eg)(?:\/|$)/i;

  if (!amazonRegex.test(url)) {
    return url; // Not an Amazon URL, return as-is
  }

  // Get the appropriate domain for the user's country
  const targetDomain = AMAZON_DOMAINS[countryCode] || AMAZON_DOMAINS['US'];

  // Replace the domain in the URL
  const localizedUrl = url.replace(amazonRegex, (match, currentDomain) => {
    return match.replace(`amazon.${currentDomain}`, `amazon.${targetDomain.split('.').slice(1).join('.')}`);
  });

  return localizedUrl;
}

/**
 * Localize any external URL based on user's country
 * Currently focuses on Amazon, but can be extended for other platforms
 * @param {string} url - Original URL
 * @param {string} countryCode - User's country code (2-letter ISO)
 * @returns {string} Localized URL
 */
export function localizeUrl(url, countryCode) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // For Amazon URLs, use the specialized function
  if (url.includes('amazon.')) {
    return localizeAmazonUrl(url, countryCode);
  }

  // Add more URL localization logic here for other platforms if needed
  // For example: eBay, AliExpress, etc.

  return url; // Return as-is for non-supported URLs
}

/**
 * Cache for user country to avoid repeated API calls
 */
let cachedCountry = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Get user country with caching
 * @returns {Promise<string>} Country code
 */
export async function getCachedUserCountry() {
  const now = Date.now();

  // Return cached value if it's still valid
  if (cachedCountry && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedCountry;
  }

  // Detect country and cache result
  cachedCountry = await detectUserCountry();
  cacheTimestamp = now;

  return cachedCountry;
}

/**
 * Process external URL for display - handles country detection and localization
 * @param {string} url - Original external URL
 * @param {boolean} detectCountry - Whether to apply country detection (default: true)
 * @returns {Promise<string>} Localized URL
 */
export async function processExternalUrl(url, detectCountry = true) {
  if (!url) return url;

  // If country detection is disabled, return original URL
  if (!detectCountry) {
    return url;
  }

  try {
    const userCountry = await getCachedUserCountry();
    return localizeUrl(url, userCountry);
  } catch (error) {
    console.warn('Failed to process external URL:', error);
    return url; // Return original URL on error
  }
}