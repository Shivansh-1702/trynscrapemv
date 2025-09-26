// YesMoviesHub Scraper for Nuvio Local Scrapers
// React Native compatible version with Cheerio support

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');
console.log('[YesMoviesHub] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_DOMAIN = 'https://yesmovieshub.online';
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Global variables for domain caching
let yesMoviesHubDomain = BASE_DOMAIN;
let domainCacheTimestamp = 0;

// Fetch latest domain (currently just returns base domain, but can be extended)
async function getYesMoviesHubDomain() {
  const now = Date.now();
  if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
    return yesMoviesHubDomain;
  }

  try {
    console.log('[YesMoviesHub] Using domain:', BASE_DOMAIN);
    yesMoviesHubDomain = BASE_DOMAIN;
    domainCacheTimestamp = now;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to validate domain: ${error.message}`);
  }

  return yesMoviesHubDomain;
}

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

// Helper function to extract quality from text
function extractQuality(text) {
  if (!text) return 'HD';

  const qualityMatch = text.match(/(480p|720p|1080p|2160p|4K|HD|CAM|TS)/i);
  if (qualityMatch) {
    return qualityMatch[1].toUpperCase();
  }

  return 'HD';
}

// Helper function to extract year from title
function extractYear(title) {
  if (!title) return null;
  
  const yearMatch = title.match(/\((\d{4})\)/);
  return yearMatch ? parseInt(yearMatch[1]) : null;
}

// Helper function to clean title
function cleanTitle(title) {
  if (!title) return '';
  
  return title
    .replace(/\(\d{4}\)/, '') // Remove year
    .replace(/&#8211;/g, '-') // Replace HTML entity
    .replace(/&#8217;/g, "'") // Replace HTML entity
    .trim();
}

// Parse quality for sorting
function parseQualityForSort(qualityString) {
  if (!qualityString) return 0;
  
  const qualityMap = {
    'CAM': 100,
    'TS': 200,
    '480P': 480,
    '720P': 720,
    'HD': 720,
    '1080P': 1080,
    '2160P': 2160,
    '4K': 2160
  };
  
  return qualityMap[qualityString.toUpperCase()] || 720;
}

// Search for movies/TV shows on YesMoviesHub
async function searchMovies(query) {
  try {
    const domain = await getYesMoviesHubDomain();
    const searchUrl = `${domain}/?s=${encodeURIComponent(query)}`;

    console.log(`[YesMoviesHub] Searching: ${searchUrl}`);

    const response = await makeRequest(searchUrl);
    const html = await response.text();

    const results = [];
    const $ = cheerio.load(html);

    // Parse search results from the movie grid
    $('.item').each((index, element) => {
      try {
        const $item = $(element);
        
        // Get the main link element
        const linkElement = $item.find('a.title').first();
        if (!linkElement.length) return;
        
        const url = linkElement.attr('href');
        const titleText = linkElement.text().trim();
        
        if (!url || !titleText) return;

        // Extract quality from the quality div
        const qualityDiv = $item.find('.quality').first();
        const quality = qualityDiv.length ? qualityDiv.text().trim() : 'HD';

        // Extract IMDB rating
        const imdbElement = $item.find('.imdb').first();
        const imdbRating = imdbElement.length ? parseFloat(imdbElement.text().replace(/[^\d.]/g, '')) : null;

        // Extract meta information (season/episode info for TV shows)
        const metaElement = $item.find('.meta').first();
        const metaText = metaElement.length ? metaElement.text().trim() : '';
        const isTVShow = metaText.includes('SS ') || metaText.includes('EP ');

        // Clean title and extract year
        const cleanedTitle = cleanTitle(titleText);
        const year = extractYear(titleText);

        // Get poster image
        const posterElement = $item.find('img').first();
        const poster = posterElement.length ? posterElement.attr('data-src') || posterElement.attr('src') : null;

        if (cleanedTitle && !results.some(item => item.url === url)) {
          results.push({
            title: cleanedTitle,
            year,
            url: url.startsWith('http') ? url : `${domain}${url}`,
            quality: extractQuality(quality),
            imdbRating,
            poster,
            type: isTVShow ? 'tv' : 'movie',
            metadata: {
              originalTitle: titleText,
              metaInfo: metaText
            }
          });
        }
      } catch (itemError) {
        console.error(`[YesMoviesHub] Error parsing item: ${itemError.message}`);
      }
    });

    console.log(`[YesMoviesHub] Found ${results.length} search results`);
    return results;
  } catch (error) {
    console.error(`[YesMoviesHub] Search failed: ${error.message}`);
    return [];
  }
}

// Get movie/TV show details and streaming links
async function getMovieDetails(url) {
  try {
    console.log(`[YesMoviesHub] Getting details for: ${url}`);

    const response = await makeRequest(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const details = {
      title: '',
      year: null,
      description: '',
      genres: [],
      country: '',
      imdbRating: null,
      poster: null,
      links: []
    };

    // Extract title
    const titleElement = $('h1.entry-title, .title').first();
    details.title = titleElement.length ? cleanTitle(titleElement.text().trim()) : '';

    // Extract year from title or metadata
    const fullTitle = titleElement.text().trim();
    details.year = extractYear(fullTitle);

    // Extract description
    const descElement = $('.desc, .description, .entry-content p').first();
    details.description = descElement.length ? descElement.text().trim() : '';

    // Extract genres
    $('a[href*="/category/"]').each((i, el) => {
      const genre = $(el).text().trim();
      if (genre && !details.genres.includes(genre)) {
        details.genres.push(genre);
      }
    });

    // Extract country
    const countryElement = $('a[href*="/country/"]').first();
    details.country = countryElement.length ? countryElement.text().trim() : '';

    // Extract IMDB rating
    const imdbElement = $('.imdb, .rating').first();
    if (imdbElement.length) {
      const ratingText = imdbElement.text().replace(/[^\d.]/g, '');
      details.imdbRating = ratingText ? parseFloat(ratingText) : null;
    }

    // Extract poster
    const posterElement = $('.poster img, .movie-poster img').first();
    details.poster = posterElement.length ? posterElement.attr('data-src') || posterElement.attr('src') : null;

    // Look for streaming links - this would need to be customized based on the actual site structure
    // YesMoviesHub likely embeds players or has download links in the content
    $('.entry-content a, .download-links a, .player-container').each((i, el) => {
      const $link = $(el);
      const linkUrl = $link.attr('href');
      const linkText = $link.text().trim();
      
      if (linkUrl && (linkUrl.includes('.mp4') || linkUrl.includes('stream') || linkUrl.includes('watch'))) {
        details.links.push({
          url: linkUrl,
          quality: extractQuality(linkText),
          type: linkText.toLowerCase().includes('download') ? 'download' : 'stream',
          source: 'YesMoviesHub'
        });
      }
    });

    console.log(`[YesMoviesHub] Extracted ${details.links.length} links for: ${details.title}`);
    return details;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to get movie details: ${error.message}`);
    return null;
  }
}

// Get streaming links for a movie/TV show
async function getStreamingLinks(url) {
  try {
    const details = await getMovieDetails(url);
    if (!details || !details.links.length) {
      console.log(`[YesMoviesHub] No streaming links found for: ${url}`);
      return [];
    }

    // Sort links by quality (highest first)
    const sortedLinks = details.links.sort((a, b) => {
      return parseQualityForSort(b.quality) - parseQualityForSort(a.quality);
    });

    console.log(`[YesMoviesHub] Found ${sortedLinks.length} streaming links`);
    return sortedLinks;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to get streaming links: ${error.message}`);
    return [];
  }
}

// Get popular/trending movies
async function getTrendingMovies() {
  try {
    const domain = await getYesMoviesHubDomain();
    const trendingUrl = `${domain}`;

    console.log(`[YesMoviesHub] Getting trending movies from: ${trendingUrl}`);

    const response = await makeRequest(trendingUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];

    // Parse trending movies from homepage
    $('.item').slice(0, 20).each((index, element) => {
      try {
        const $item = $(element);
        
        const linkElement = $item.find('a.title').first();
        if (!linkElement.length) return;
        
        const url = linkElement.attr('href');
        const titleText = linkElement.text().trim();
        
        if (!url || !titleText) return;

        const qualityDiv = $item.find('.quality').first();
        const quality = qualityDiv.length ? qualityDiv.text().trim() : 'HD';

        const imdbElement = $item.find('.imdb').first();
        const imdbRating = imdbElement.length ? parseFloat(imdbElement.text().replace(/[^\d.]/g, '')) : null;

        const metaElement = $item.find('.meta').first();
        const metaText = metaElement.length ? metaElement.text().trim() : '';
        const isTVShow = metaText.includes('SS ') || metaText.includes('EP ');

        const cleanedTitle = cleanTitle(titleText);
        const year = extractYear(titleText);

        const posterElement = $item.find('img').first();
        const poster = posterElement.length ? posterElement.attr('data-src') || posterElement.attr('src') : null;

        if (cleanedTitle && !results.some(item => item.url === url)) {
          results.push({
            title: cleanedTitle,
            year,
            url: url.startsWith('http') ? url : `${domain}${url}`,
            quality: extractQuality(quality),
            imdbRating,
            poster,
            type: isTVShow ? 'tv' : 'movie'
          });
        }
      } catch (itemError) {
        console.error(`[YesMoviesHub] Error parsing trending item: ${itemError.message}`);
      }
    });

    console.log(`[YesMoviesHub] Found ${results.length} trending movies`);
    return results;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to get trending movies: ${error.message}`);
    return [];
  }
}

// Export functions for the scraper
module.exports = {
  searchMovies,
  getMovieDetails,
  getStreamingLinks,
  getTrendingMovies,
  getDomain: getYesMoviesHubDomain,
  
  // Provider metadata
  metadata: {
    name: 'YesMoviesHub',
    description: 'YesMoviesHub free streaming with HD quality',
    baseUrl: BASE_DOMAIN,
    supportedTypes: ['movie', 'tv'],
    features: ['search', 'trending', 'details'],
    contentLanguage: ['en']
  }
};

// Main search function for compatibility
async function search(query, type = 'movie') {
  try {
    console.log(`[YesMoviesHub] Searching for: ${query} (type: ${type})`);
    const results = await searchMovies(query);
    
    // Filter by type if specified
    if (type !== 'all') {
      return results.filter(item => item.type === type);
    }
    
    return results;
  } catch (error) {
    console.error(`[YesMoviesHub] Search error: ${error.message}`);
    return [];
  }
}

// Export main search function
module.exports.search = search;
