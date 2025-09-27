// Coflix Scraper for Nuvio Local Scrapers
// Ported from @phisher98/cloudstream-extensions-phisher Coflix provider
// React Native compatible version - Standalone (no external dependencies)

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');
console.log('[Coflix] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const MAIN_URL = 'https://coflix.cc';
const COFLIX_API = `${MAIN_URL}/wp-json/apiflix/v1`;

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    console.log(`[Coflix] Making request to: ${url}`);
    
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
            console.warn(`[Coflix] HTTP ${response.status} for ${url}`);
        }
        return response;
    }).catch(error => {
        console.error(`[Coflix] Request failed for ${url}:`, error);
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

// Helper function to extract image URL from HTML
function extractImageUrl(html) {
    if (!html) return null;
    
    const $ = cheerio.load(html);
    const imgElement = $('img').first();
    const src = imgElement.attr('src');
    
    if (src && src.startsWith('//')) {
        return 'https:' + src;
    }
    return src;
}

// Helper function to decode base64
function base64Decode(str) {
    try {
        return atob(str);
    } catch (e) {
        console.error('[Coflix] Base64 decode error:', e);
        return str;
    }
}

// Search for content using Coflix API
function searchContent(query) {
    const searchUrl = `${MAIN_URL}/suggest.php?query=${encodeURIComponent(query)}`;
    
    return makeRequest(searchUrl)
        .then(response => response.text())
        .then(data => {
            try {
                const searchResults = JSON.parse(data);
                return searchResults.map(item => ({
                    title: item.title,
                    url: item.url,
                    image: extractImageUrl(item.image),
                    type: item.url.includes('film') ? 'movie' : 'tv'
                }));
            } catch (e) {
                console.error('[Coflix] Search parsing error:', e);
                return [];
            }
        });
}

// Get content details from Coflix page
function getContentDetails(url) {
    return makeRequest(url)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            
            const title = $('meta[property="og:title"]').attr('content')?.replace(/En$/, '').trim() || 'Unknown';
            let poster = $('img.TPostBg').attr('src');
            
            if (!poster) {
                poster = extractImageUrl($('div.title-img img').html());
            }
            
            const description = $('div.summary.link-co p').text();
            const type = url.includes('film') ? 'movie' : 'tv';
            const imdbUrl = $('p.dtls a:contains("IMDb")').attr('href');
            const tmdbId = $('p.dtls a:contains("TMDb")').attr('href')?.split('/').pop();
            const tags = $('div.meta.df.aic.fww a').map((i, el) => $(el).text()).get();
            
            return {
                title,
                poster: poster || null,
                description,
                type,
                imdbUrl,
                tmdbId,
                tags,
                html: $
            };
        });
}

// Get episodes for TV series
function getEpisodes(contentDetails) {
    const $ = contentDetails.html;
    const episodes = [];
    
    const seasonInputs = $('section.sc-seasons ul li input');
    const promises = [];
    
    seasonInputs.each((i, input) => {
        const dataseason = $(input).attr('data-season');
        const dataid = $(input).attr('post-id');
        
        if (dataseason && dataid) {
            const episodeUrl = `${COFLIX_API}/series/${dataid}/${dataseason}`;
            const promise = makeRequest(episodeUrl)
                .then(response => response.json())
                .then(data => {
                    if (data.episodes) {
                        data.episodes.forEach(ep => {
                            episodes.push({
                                season: parseInt(ep.season) || 1,
                                episode: parseInt(ep.number) || 1,
                                title: ep.title,
                                poster: extractImageUrl(ep.image),
                                links: ep.links
                            });
                        });
                    }
                })
                .catch(error => {
                    console.error(`[Coflix] Episode fetch error for season ${dataseason}:`, error);
                });
            
            promises.push(promise);
        }
    });
    
    return Promise.all(promises).then(() => episodes);
}

// Extract stream links from iframe
function extractStreamLinks(url) {
    return makeRequest(url)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            const iframe = $('div.embed iframe').attr('src');
            
            if (!iframe) {
                console.warn('[Coflix] No iframe found');
                return [];
            }
            
            return makeRequest(iframe)
                .then(response => response.text())
                .then(iframeHtml => {
                    const iframe$ = cheerio.load(iframeHtml);
                    const streamLinks = [];
                    
                    iframe$('div.OptionsLangDisp div.OD.OD_FR.REactiv li').each((i, li) => {
                        const onclick = iframe$(li).attr('onclick');
                        if (onclick) {
                            const base64Match = onclick.match(/showVideo\('([^']+)'/);
                            if (base64Match) {
                                const decodedUrl = base64Decode(base64Match[1]);
                                if (decodedUrl && decodedUrl.startsWith('http')) {
                                    streamLinks.push(decodedUrl);
                                }
                            }
                        }
                    });
                    
                    return streamLinks;
                });
        });
}

// Main function to get streams - adapted for Nuvio provider format
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Coflix] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    
    if (seasonNum !== null) {
        console.log(`[Coflix] Season: ${seasonNum}, Episode: ${episodeNum}`);
    }
    
    return getTmdbInfo(tmdbId, mediaType)
        .then(tmdbInfo => {
            const { title, year } = tmdbInfo;
            console.log(`[Coflix] TMDB Info: "${title}" (${year})`);
            
            // Search for content on Coflix
            return searchContent(title)
                .then(searchResults => {
                    if (searchResults.length === 0) {
                        console.log('[Coflix] No search results found');
                        return [];
                    }
                    
                    // Find best match
                    const bestMatch = searchResults.find(result => 
                        result.type === mediaType && 
                        result.title.toLowerCase().includes(title.toLowerCase())
                    ) || searchResults[0];
                    
                    console.log(`[Coflix] Using result: ${bestMatch.title}`);
                    
                    return getContentDetails(bestMatch.url)
                        .then(contentDetails => {
                            if (mediaType === 'tv') {
                                return getEpisodes(contentDetails)
                                    .then(episodes => {
                                        // Find specific episode
                                        const targetEpisode = episodes.find(ep => 
                                            ep.season === seasonNum && ep.episode === episodeNum
                                        );
                                        
                                        if (!targetEpisode) {
                                            console.log(`[Coflix] Episode S${seasonNum}E${episodeNum} not found`);
                                            return [];
                                        }
                                        
                                        return extractStreamLinks(targetEpisode.links);
                                    });
                            } else {
                                // For movies, use the main page URL
                                return extractStreamLinks(bestMatch.url);
                            }
                        })
                        .then(streamUrls => {
                            if (streamUrls.length === 0) {
                                console.log('[Coflix] No stream URLs found');
                                return [];
                            }
                            
                            // Convert to Nuvio format
                            const streams = streamUrls.map((url, index) => {
                                const serverName = `Server ${index + 1}`;
                                const titleWithYear = `${title} (${year || 'N/A'})`;
                                
                                return {
                                    name: `Coflix ${serverName}`,
                                    title: titleWithYear,
                                    url: url,
                                    quality: 'Auto',
                                    size: 'Unknown',
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                        'Referer': MAIN_URL
                                    },
                                    provider: 'coflix'
                                };
                            });
                            
                            console.log(`[Coflix] Found ${streams.length} streams`);
                            return streams;
                        });
                });
        })
        .catch(error => {
            console.error(`[Coflix] Error: ${error.message}`);
            return [];
        });
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.CoflixScraperModule = { getStreams };
}