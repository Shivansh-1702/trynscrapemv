// FiveMovieRulz Scraper for Nuvio Local Scrapers
// Ported from @phisher98/cloudstream-extensions-phisher FiveMovieRulz provider
// React Native compatible version - Standalone (no external dependencies)

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');
console.log('[FiveMovieRulz] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const MAIN_URL = 'https://5movierulz.mom';

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    console.log(`[FiveMovieRulz] Making request to: ${url}`);
    
    return fetch(url, {
        method: options.method || 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            ...options.headers
        },
        body: options.body,
        ...options
    }).then(response => {
        if (!response.ok) {
            console.warn(`[FiveMovieRulz] HTTP ${response.status} for ${url}`);
        }
        return response;
    }).catch(error => {
        console.error(`[FiveMovieRulz] Request failed for ${url}:`, error);
        throw error;
    });
}

// Helper function to get TMDB info
function getTmdbInfo(tmdbId, mediaType) {
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    return makeRequest(tmdbUrl)
        .then(response => response.json())
        .then(data => {
            if (mediaType === 'movie') {
                return {
                    title: data.title,
                    year: data.release_date ? data.release_date.substring(0, 4) : null,
                    imdbId: data.imdb_id
                };
            } else {
                return {
                    title: data.name,
                    year: data.first_air_date ? data.first_air_date.substring(0, 4) : null,
                    imdbId: data.external_ids?.imdb_id
                };
            }
        });
}

// Search for content on FiveMovieRulz
function searchContent(query) {
    const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
    
    return makeRequest(searchUrl)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            const results = [];
            
            $('#main .cont_display').each((i, element) => {
                const $element = $(element);
                const title = $element.find('a').attr('title')?.trim()?.split('(')[0]?.trim();
                const href = $element.find('a').attr('href');
                const posterUrl = $element.find('img').attr('src');
                
                if (title && href) {
                    results.push({
                        title,
                        href,
                        posterUrl
                    });
                }
            });
            
            return results;
        });
}

// Get content details from movie page
function getContentDetails(url) {
    return makeRequest(url)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            
            const title = $('h2.entry-title').text()?.trim()?.split('(')[0]?.trim();
            const poster = $('.entry-content img').attr('src');
            const description = $('div.entry-content > p:nth-child(6)').text().trim();
            
            // Extract year from title
            const yearMatch = $('h2.entry-title').text().match(/\d{4}/);
            const year = yearMatch ? yearMatch[0] : null;
            
            // Extract tags/genres
            const genresText = $('div.entry-content > p:nth-child(5)').text();
            const tags = genresText.includes('Genres:') 
                ? genresText.split('Genres:')[1]?.split('Country:')[0]?.split(',').map(t => t.trim()).filter(t => t)
                : [];
            
            // Extract actors
            const actors = genresText.includes('Starring by:')
                ? genresText.split('Starring by:')[1]?.split('Genres:')[0]?.split(',').map(a => a.trim()).filter(a => a)
                : [];
            
            return {
                title,
                poster,
                description,
                year,
                tags,
                actors,
                html: $
            };
        });
}

// Extract download links from movie page
function extractDownloadLinks(contentDetails) {
    const $ = contentDetails.html;
    const links = [];
    
    // Look for FileLions or other streaming links
    $('a[href*="filelions.to"], a[href*="streamplay"], a[href*="doodstream"], a[href*="mixdrop"]').each((i, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();
        
        if (href && href.startsWith('http')) {
            links.push({
                url: href,
                quality: extractQualityFromText(text),
                server: extractServerFromUrl(href)
            });
        }
    });
    
    // Also look for any download buttons or links
    $('a[href*="download"], a[href*="stream"], .download-link').each((i, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();
        
        if (href && href.startsWith('http') && !links.some(l => l.url === href)) {
            links.push({
                url: href,
                quality: extractQualityFromText(text),
                server: extractServerFromUrl(href)
            });
        }
    });
    
    return links;
}

// Extract quality from text (720p, 1080p, etc.)
function extractQualityFromText(text) {
    const qualityMatch = text.match(/(\d{3,4}p|HD|CAM|TS|WEBRip|BluRay)/i);
    return qualityMatch ? qualityMatch[1] : 'Unknown';
}

// Extract server name from URL
function extractServerFromUrl(url) {
    try {
        const hostname = new URL(url).hostname;
        if (hostname.includes('filelions')) return 'FileLions';
        if (hostname.includes('streamplay')) return 'StreamPlay';
        if (hostname.includes('doodstream')) return 'DoodStream';
        if (hostname.includes('mixdrop')) return 'MixDrop';
        return hostname;
    } catch (e) {
        return 'Unknown Server';
    }
}

// Find best match from search results
function findBestMatch(results, targetTitle, targetYear) {
    if (results.length === 0) return null;
    
    // Exact title match with year
    let bestMatch = results.find(result => 
        result.title.toLowerCase().includes(targetTitle.toLowerCase()) &&
        (targetYear ? result.title.includes(targetYear) : true)
    );
    
    // Fallback to partial title match
    if (!bestMatch) {
        bestMatch = results.find(result => 
            result.title.toLowerCase().includes(targetTitle.toLowerCase())
        );
    }
    
    // Fallback to first result
    return bestMatch || results[0];
}

// Main function to get streams - adapted for Nuvio provider format
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[FiveMovieRulz] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    
    // FiveMovieRulz only supports movies
    if (mediaType !== 'movie') {
        console.log('[FiveMovieRulz] Only movies are supported');
        return Promise.resolve([]);
    }
    
    return getTmdbInfo(tmdbId, mediaType)
        .then(tmdbInfo => {
            const { title, year } = tmdbInfo;
            console.log(`[FiveMovieRulz] TMDB Info: "${title}" (${year})`);
            
            // Search for content on FiveMovieRulz
            return searchContent(title)
                .then(searchResults => {
                    if (searchResults.length === 0) {
                        console.log('[FiveMovieRulz] No search results found');
                        return [];
                    }
                    
                    // Find best match
                    const bestMatch = findBestMatch(searchResults, title, year);
                    if (!bestMatch) {
                        console.log('[FiveMovieRulz] No suitable match found');
                        return [];
                    }
                    
                    console.log(`[FiveMovieRulz] Using result: ${bestMatch.title}`);
                    
                    return getContentDetails(bestMatch.href)
                        .then(contentDetails => {
                            const downloadLinks = extractDownloadLinks(contentDetails);
                            
                            if (downloadLinks.length === 0) {
                                console.log('[FiveMovieRulz] No download links found');
                                return [];
                            }
                            
                            // Convert to Nuvio format
                            const streams = downloadLinks.map(link => {
                                const titleWithYear = `${title} (${year || 'N/A'})`;
                                
                                return {
                                    name: `FiveMovieRulz ${link.server} - ${link.quality}`,
                                    title: titleWithYear,
                                    url: link.url,
                                    quality: link.quality,
                                    size: 'Unknown',
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                        'Referer': MAIN_URL
                                    },
                                    provider: 'fivemovierulz'
                                };
                            });
                            
                            console.log(`[FiveMovieRulz] Found ${streams.length} streams`);
                            return streams;
                        });
                });
        })
        .catch(error => {
            console.error(`[FiveMovieRulz] Error: ${error.message}`);
            return [];
        });
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.FiveMovieRulzScraperModule = { getStreams };
}