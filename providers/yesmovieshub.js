// YesMoviesHub Scraper for Nuvio Local Scrapers
// React Native compatible version with Cheerio support

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');
const { getNuvioCompatibleLink } = require('../nuvio-resolver');
const { extractRealVideoUrl } = require('../real-url-extractor');
console.log('[YesMoviesHub] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "0e8d45a15df286dbabf68b2c8a60cc41";
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
      links: [],
      embedId: null,
      servers: []
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

    // Extract server data from JavaScript variables
    const domain = await getYesMoviesHubDomain();
    
    // Extract server data from JavaScript
    const scriptContent = html.match(/var\s+Servers\s*=\s*(\{[^}]+\})/);
    let serverData = {};
    if (scriptContent) {
      try {
        // Parse the JavaScript object string  
        const serverScript = scriptContent[1];
        console.log('Raw server script:', serverScript);
        
        // Extract individual server URLs using regex - handle escaped forward slashes
        const embedruMatch = serverScript.match(/"embedru"\s*:\s*"([^"]+)"/);
        const vidsrcMatch = serverScript.match(/"vidsrc"\s*:\s*"([^"]+)"/);
        const premiumMatch = serverScript.match(/"premium"\s*:\s*"([^"]+)"/);
        const imdbIdMatch = serverScript.match(/"imdb_id"\s*:\s*"([^"]+)"/);
        
        if (embedruMatch) {
          serverData.embedru = embedruMatch[1].replace(/\\\//g, '/'); // Unescape forward slashes
        }
        if (vidsrcMatch) {
          serverData.vidsrc = vidsrcMatch[1].replace(/\\\//g, '/');
        }
        if (premiumMatch) {
          serverData.premium = premiumMatch[1].replace(/\\\//g, '/');
        }
        if (imdbIdMatch) {
          serverData.imdb_id = imdbIdMatch[1];
        }
        
        console.log('Parsed server data:', serverData);
      } catch (e) {
        console.log('Failed to parse server data:', e.message);
      }
    }

    // Process server elements and map to server data
    $('.server').each((i, el) => {
      const $server = $(el);
      const onclickAttr = $server.attr('onclick') || '';
      let serverName = $server.find('div').last().text().trim();
      
      // Extract server key from onclick attribute
      const serverKeyMatch = onclickAttr.match(/loadServer\(([^)]+)\)/);
      const serverKey = serverKeyMatch ? serverKeyMatch[1] : null;
      
      console.log(`Processing server ${i + 1}: name="${serverName}", key="${serverKey}"`);
      
  let embedUrl = null;
  let host = null;
      
      if (serverKey) {
        if (serverKey === 'embedru' && serverData.embedru) {
          embedUrl = serverData.embedru;
          host = 'embedru';
        } else if (serverKey === 'superembed' && serverData.premium) {
          embedUrl = serverData.premium;
          host = 'superembed';
        } else if (serverKey === 'vidsrc' && serverData.vidsrc) {
          embedUrl = serverData.vidsrc;
          host = 'vidsrc';
        }
      }
      
      if (embedUrl) {
        // Ensure URL has protocol
        if (embedUrl.startsWith('//')) {
          embedUrl = 'https:' + embedUrl;
        }
        // Normalize and enrich server name
        if (!serverName) {
          serverName = host ? host.toUpperCase() : `Server ${i + 1}`;
        }
        
        const serverInfo = {
          name: serverName || `Server ${i + 1}`,
          host: host,
          url: embedUrl,
          embedId: serverData.imdb_id || null,
          quality: 'HD',
          type: 'stream',
          source: 'YesMoviesHub',
          server: serverName
        };

        details.servers.push(serverInfo);
        details.links.push(serverInfo);
        console.log(`Added server: ${serverInfo.name} - ${serverInfo.url}`);
      }
    });

    // If no servers found, try to extract from JavaScript variables
    if (details.links.length === 0) {
      const scriptMatch = html.match(/Episodes=\{[^}]*"tvid":"(\d+)"[^}]*\}/);
      if (scriptMatch) {
        const tvId = scriptMatch[1];
        details.embedId = tvId;
        
        // Add default servers based on common patterns
        const defaultServers = ['embedru', 'superembed', 'vidsrc'];
        defaultServers.forEach((host, i) => {
          const playerUrl = `${domain}/?player_tv=${tvId}&host=${host}&season=1&episode=1`;
          details.links.push({
            name: `Server ${i + 1}`,
            host: host,
            url: playerUrl,
            embedId: tvId,
            season: 1,
            episode: 1,
            quality: 'HD',
            type: 'stream',
            source: 'YesMoviesHub'
          });
        });
      }
    }

    console.log(`[YesMoviesHub] Extracted ${details.links.length} streaming links for: ${details.title}`);
    return details;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to get movie details: ${error.message}`);
    return null;
  }
}

// Helper function to extract direct video URLs from embed pages
async function extractDirectVideoUrls(embedUrl) {
  try {
    console.log(`[YesMoviesHub] Extracting direct URLs from: ${embedUrl}`);
    
    const response = await makeRequest(embedUrl, {
      headers: {
        'Referer': 'https://yesmovieshub.online/',
        'Origin': 'https://yesmovieshub.online'
      }
    });
    
    const html = await response.text();
    const directUrls = [];
    
    // Multiple patterns to find video sources
    const patterns = [
      // HLS/M3U8 patterns
      /["']([^"']*\.m3u8[^"']*)["']/gi,
      /hlsManifestUrl['"]\s*:\s*['"]([^'"]+)['"]|"source":\s*"([^"]*\.m3u8[^"]*)"/gi,
      /file["']?\s*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
      
      // MP4 patterns
      /["']([^"']*\.mp4[^"']*)["']/gi,
      /file["']?\s*:\s*["']([^"']*\.mp4[^"']*)["']/gi,
      
      // General video source patterns
      /sources?\s*:\s*\[\s*{[^}]*["']file["']\s*:\s*["']([^"']+)["']/gi,
      /src["']?\s*:\s*["']([^"']*\.(mp4|m3u8)[^"']*)["']/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1] || match[2];
        if (url && (url.includes('.m3u8') || url.includes('.mp4')) && !url.includes('about:blank')) {
          const fullUrl = url.startsWith('http') ? url : url.startsWith('//') ? `https:${url}` : `https://${url}`;
          directUrls.push({
            url: fullUrl,
            quality: url.includes('1080') ? '1080p' : url.includes('720') ? '720p' : 'HD',
            type: url.includes('.m3u8') ? 'hls' : 'mp4'
          });
        }
      }
    }
    
    // Remove duplicates
    const uniqueUrls = directUrls.filter((item, index, self) => 
      index === self.findIndex(t => t.url === item.url)
    );
    
    return uniqueUrls;
  } catch (error) {
    console.error(`[YesMoviesHub] Error extracting direct URLs: ${error.message}`);
    return [];
  }
}

// Resolve VidSrc embeds to direct streaming links
async function resolveVidSrcEmbed(embedUrl) {
  try {
    const directUrls = await extractDirectVideoUrls(embedUrl);
    if (directUrls.length > 0) {
      return directUrls[0]; // Return best quality
    }
    
    // Try to find nested iframes
    const response = await makeRequest(embedUrl);
    const html = await response.text();
    const iframeMatch = html.match(/<iframe[^>]*src=['"](https?:\/\/[^'"]+)['"]/i);
    
    if (iframeMatch) {
      const nestedUrls = await extractDirectVideoUrls(iframeMatch[1]);
      if (nestedUrls.length > 0) {
        return nestedUrls[0];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[YesMoviesHub] Error resolving VidSrc: ${error.message}`);
    return null;
  }
}

// Special handling for different embed types
async function resolveEmbedByType(embedUrl) {
  try {
    // VidSrc handling
    if (embedUrl.includes('vidsrc')) {
      return await resolveVidSrcEmbed(embedUrl);
    }
    
    // EmbedRu handling
    if (embedUrl.includes('embedru')) {
      const directUrls = await extractDirectVideoUrls(embedUrl);
      return directUrls.length > 0 ? directUrls[0] : null;
    }
    
    // SuperEmbed/Premium handling
    if (embedUrl.includes('superembed') || embedUrl.includes('premium')) {
      const directUrls = await extractDirectVideoUrls(embedUrl);
      return directUrls.length > 0 ? directUrls[0] : null;
    }
    
    // Generic embed handling
    const directUrls = await extractDirectVideoUrls(embedUrl);
    return directUrls.length > 0 ? directUrls[0] : null;
    
  } catch (error) {
    console.error(`[YesMoviesHub] Error resolving embed: ${error.message}`);
    return null;
  }
}

// Resolve actual streaming URL from player endpoint - Nuvio compatible
async function resolvePlayerUrl(playerUrl, serverName = 'Unknown') {
  try {
    console.log(`[YesMoviesHub] Resolving player URL: ${playerUrl}`);
    
    // First try to extract real video URL from the embed
    const realVideoUrl = await extractRealVideoUrl(playerUrl, serverName);
    
    if (realVideoUrl) {
      console.log(`[YesMoviesHub] ✅ Extracted real video URL: ${realVideoUrl.url}`);
      return {
        url: realVideoUrl.url,
        type: realVideoUrl.type,
        quality: realVideoUrl.quality,
        server: `${serverName} (Direct)`,
        compatible: true,
        source: realVideoUrl.source,
        originalEmbed: playerUrl
      };
    }
    
    // Fallback to Nuvio-compatible resolver if direct extraction fails
    console.log(`[YesMoviesHub] Direct extraction failed, trying Nuvio resolver...`);
    const result = await getNuvioCompatibleLink(playerUrl, serverName);
    console.log(`[YesMoviesHub] Resolver result:`, result.compatible ? 'Compatible' : 'Needs iframe support');
    
    return result;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to resolve player URL: ${error.message}`);
    return {
      url: playerUrl,
      type: 'error',
      quality: 'Unknown',
      server: serverName,
      compatible: false,
      error: error.message
    };
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

    const resolvedLinks = [];
    
    // Resolve each player URL to get actual streaming links - Nuvio format
    for (const link of details.links) {
      try {
        const resolved = await resolvePlayerUrl(link.url, link.server || 'Unknown');
        resolvedLinks.push({
          ...resolved,  // Use the full resolved object
          server: resolved.server || link.server,
          originalUrl: link.url
        });
      } catch (error) {
        console.error(`[YesMoviesHub] Failed to resolve link: ${error.message}`);
        // Include the original link in Nuvio format
        resolvedLinks.push({
          url: link.url,
          type: 'error',
          quality: link.quality || 'HD',
          server: link.server || 'Unknown',
          compatible: false,
          error: error.message
        });
      }
    }

    // Sort links by quality (highest first)
    const sortedLinks = resolvedLinks.sort((a, b) => {
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

// Get streaming links for specific TV show episode
async function getTVEpisodeLinks(url, season = 1, episode = 1) {
  try {
    console.log(`[YesMoviesHub] Getting TV episode links: S${season}E${episode}`);
    
    const details = await getMovieDetails(url);
    if (!details || !details.embedId) {
      console.log(`[YesMoviesHub] No embed ID found for TV show`);
      return [];
    }

    const domain = await getYesMoviesHubDomain();
    const episodeLinks = [];
    
    // Generate player URLs for different servers with specific season/episode
    const servers = ['embedru', 'superembed', 'vidsrc'];
    
    for (let i = 0; i < servers.length; i++) {
      const host = servers[i];
      const playerUrl = `${domain}/?player_tv=${details.embedId}&host=${host}&season=${season}&episode=${episode}`;
      
      try {
        const resolved = await resolvePlayerUrl(playerUrl);
        episodeLinks.push({
          name: `Server ${i + 1}`,
          host: host,
          url: playerUrl,
          streamUrl: resolved.url,
          streamType: resolved.type,
          embedId: details.embedId,
          season: season,
          episode: episode,
          quality: resolved.quality || 'HD',
          type: 'stream',
          source: 'YesMoviesHub'
        });
      } catch (error) {
        console.error(`[YesMoviesHub] Failed to resolve episode link for ${host}: ${error.message}`);
        // Include the original link even if resolution fails
        episodeLinks.push({
          name: `Server ${i + 1}`,
          host: host,
          url: playerUrl,
          embedId: details.embedId,
          season: season,
          episode: episode,
          quality: 'HD',
          type: 'stream',
          source: 'YesMoviesHub'
        });
      }
    }

    console.log(`[YesMoviesHub] Found ${episodeLinks.length} episode links for S${season}E${episode}`);
    return episodeLinks;
  } catch (error) {
    console.error(`[YesMoviesHub] Failed to get TV episode links: ${error.message}`);
    return [];
  }
}

// Export functions for the scraper
module.exports = {
  searchMovies,
  getMovieDetails,
  getStreamingLinks,
  getTrendingMovies,
  getTVEpisodeLinks,
  resolvePlayerUrl,
  getDomain: getYesMoviesHubDomain,
  // Convenience: resolve all links on a details page into Nuvio-compatible objects
  async resolveAllLinks(pageUrl) {
    const details = await getMovieDetails(pageUrl);
    if (!details || !details.links || !details.links.length) return [];
    const out = [];
    for (const link of details.links) {
      const name = link.server || link.name || link.host || 'Unknown';
      const resolved = await resolvePlayerUrl(link.url, name);
      out.push({ ...resolved, originalUrl: link.url });
    }
    return out.sort((a, b) => parseQualityForSort(b.quality) - parseQualityForSort(a.quality));
  },
  
  // Provider metadata
  metadata: {
    name: 'YesMoviesHub',
    description: 'YesMoviesHub free streaming with HD quality',
    baseUrl: BASE_DOMAIN,
    supportedTypes: ['movie', 'tv'],
    features: ['search', 'trending', 'details', 'episodes'],
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
