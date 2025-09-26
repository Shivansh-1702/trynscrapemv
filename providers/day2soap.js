const cheerio = require('cheerio-without-node-native');
const { getNuvioCompatibleLink } = require('../nuvio-resolver');
const { extractRealVideoUrl } = require('../real-url-extractor');

const BASE_URL = 'https://day2soap.xyz';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper function to make requests with proper headers
async function makeRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate'
        },
        ...options
    };

    try {
        const response = await fetch(url, defaultOptions);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Request failed for ${url}:`, error);
        throw error;
    }
}

// Helper function to make POST requests
async function makePostRequest(url, body) {
    return makeRequest(url, {
        method: 'POST',
        headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate'
        },
        body: new URLSearchParams(body).toString()
    });
}

// Helper function to extract movie data from HTML elements
function extractMovieData($, element) {
    const $element = $(element);
    const $link = $element.find('a.ml-mask');
    
    if (!$link.length) return null;
    
    const href = $link.attr('href');
    if (!href) return null;
    
    // Extract ID from URL (e.g., /watch-f1-911430 -> 911430)
    const idMatch = href.match(/watch-(.+)-(\d+)$/);
    const id = idMatch ? idMatch[2] : href.replace('/watch-', '').replace(/^.*-/, '');
    
    // Extract title and year
    const title = $link.find('h2').text().trim() || $link.attr('title') || '';
    const year = $element.find('.mli-quality').text().trim() || 'N/A';
    const rating = $element.find('.mli-imdbnum').text().trim() || '0';
    const poster = $element.find('img').attr('src') || '';
    
    return {
        id: id,
        title: title,
        year: year === 'n/a' ? 'N/A' : year,
        rating: parseFloat(rating) || 0,
        poster: poster.startsWith('http') ? poster : (poster ? `${BASE_URL}${poster}` : ''),
        url: `${BASE_URL}${href}`
    };
}

// Helper function to extract TV show data
function extractTVData($, element) {
    const $element = $(element);
    const $link = $element.find('a.ml-mask');
    
    if (!$link.length) return null;
    
    const href = $link.attr('href');
    if (!href || !href.includes('watch-tv')) return null;
    
    // Extract TMDB ID from URL (e.g., /watch-tv?tmdb=110316&season=1&episode=1)
    const urlParams = new URLSearchParams(href.split('?')[1] || '');
    const tmdbId = urlParams.get('tmdb');
    
    if (!tmdbId) return null;
    
    const title = $link.find('h2').text().trim() || $link.attr('title') || '';
    const year = $element.find('.mli-quality').text().trim() || 'N/A';
    const rating = $element.find('.mli-imdbnum').text().trim() || '0';
    const poster = $element.find('img').attr('src') || '';
    
    return {
        id: tmdbId,
        title: title,
        year: year === 'n/a' ? 'N/A' : year,
        rating: parseFloat(rating) || 0,
        poster: poster.startsWith('http') ? poster : (poster ? `${BASE_URL}${poster}` : ''),
        url: `${BASE_URL}${href}`,
        type: 'tv'
    };
}

// Search for movies and TV shows
async function searchMovies(query, page = 1) {
    try {
        const searchBody = {
            q: query,
            category: 'movies',
            page: page.toString()
        };
        
        const html = await makePostRequest(`${BASE_URL}/search`, searchBody);
        const $ = cheerio.load(html);
        
        const results = [];
        
        // Extract movie results
        $('.ml-item').each((index, element) => {
            const movieData = extractMovieData($, element);
            if (movieData) {
                results.push(movieData);
            }
        });
        
        return {
            results: results,
            hasNextPage: $('form[action*="page="]').length > 0,
            currentPage: page,
            totalResults: results.length
        };
    } catch (error) {
        console.error('Search error:', error);
        return { results: [], hasNextPage: false, currentPage: 1, totalResults: 0 };
    }
}

// Get movie details and streaming information
async function getMovieDetails(movieId, movieUrl = null) {
    try {
        let url = movieUrl;
        
        // If no URL provided, try to find the movie by searching
        if (!url) {
            // Try different search approaches
            const searchResults = await searchMovies(movieId);
            const movie = searchResults.results.find(m => m.id === movieId || m.url.includes(movieId));
            
            if (movie) {
                url = movie.url;
            } else {
                // Try searching by a more general term and look for the ID in results
                const generalSearch = await searchMovies('F1');
                const foundMovie = generalSearch.results.find(m => m.id === movieId || m.url.includes(`-${movieId}`));
                
                if (foundMovie) {
                    url = foundMovie.url;
                } else {
                    throw new Error(`Movie with ID ${movieId} not found`);
                }
            }
        }
        
        const html = await makeRequest(url);
        const $ = cheerio.load(html);
        
        // Extract movie details
        const title = $('h3').first().text().trim() || $('.btn-01').text().replace(/^\s*\S+\s*/, '').trim();
        const description = $('.desc p').text().trim() || '';
        const poster = $('.mvic-thumb').css('background-image');
        const posterUrl = poster ? poster.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1') : '';
        
        // Extract additional info
        const movieInfo = {};
        $('.mvic-info p').each((index, element) => {
            const text = $(element).text();
            if (text.includes('Release:')) {
                movieInfo.releaseDate = text.replace('Release:', '').trim();
            } else if (text.includes('Language:')) {
                movieInfo.language = text.replace('Language:', '').trim();
            } else if (text.includes('Duration:')) {
                movieInfo.duration = text.replace('Duration:', '').trim();
            } else if (text.includes('IMDB Rating:')) {
                movieInfo.imdbRating = $(element).find('.quality').text().trim();
            } else if (text.includes('Genres:')) {
                movieInfo.genres = text.replace('Genres:', '').trim().split(',').map(g => g.trim()).filter(g => g);
            }
        });
        
        // Extract streaming servers
        const servers = [];
        $('.les-content a').each((index, element) => {
            const $server = $(element);
            const serverText = $server.text().replace(/\s*\n\s*/g, ' ').trim();
            const onclickAttr = $server.attr('onclick');
            
            if (onclickAttr) {
                const urlMatch = onclickAttr.match(/go\(['"]([^'"]+)['"]\)/);
                if (urlMatch) {
                    // Extract server name by removing the play icon and trimming
                    let serverName = serverText.replace(/^\s*\uF04B?\s*/, '').trim(); // Remove play icon
                    serverName = serverName || `Server ${index + 1}`;
                    
                    servers.push({
                        name: serverName,
                        url: urlMatch[1],
                        quality: 'HD'
                    });
                }
            }
        });
        
        return {
            id: movieId,
            title: title,
            description: description,
            poster: posterUrl.startsWith('http') ? posterUrl : `${BASE_URL}${posterUrl}`,
            releaseDate: movieInfo.releaseDate || 'N/A',
            language: movieInfo.language || 'EN',
            duration: movieInfo.duration || 'N/A',
            rating: movieInfo.imdbRating || '0',
            genres: movieInfo.genres || [],
            servers: servers,
            url: url
        };
    } catch (error) {
        console.error('Error getting movie details:', error);
        throw error;
    }
}

// Get streaming links for a movie
async function getStreamingLinks(movieId) {
    try {
        const movieDetails = await getMovieDetails(movieId);
        
        const streamingLinks = movieDetails.servers.map(server => ({
            quality: server.quality,
            url: server.url,
            server: server.name,
            type: 'embed'
        }));
        
        return {
            movieId: movieId,
            title: movieDetails.title,
            links: streamingLinks
        };
    } catch (error) {
        console.error('Error getting streaming links:', error);
        return { movieId: movieId, title: '', links: [] };
    }
}

// Get trending movies
async function getTrendingMovies(page = 1) {
    try {
        const trendingBody = {
            home: 'home'
        };
        
        const html = await makePostRequest(`${BASE_URL}/trending`, trendingBody);
        const $ = cheerio.load(html);
        
        const movies = [];
        
        // Extract trending movies (first section)
        $('.ml-title:contains("Trending Movies")').next('.tab-content').find('.ml-item').each((index, element) => {
            const movieData = extractMovieData($, element);
            if (movieData) {
                movies.push(movieData);
            }
        });
        
        // If no specific trending section found, get from the first movie section
        if (movies.length === 0) {
            $('.tab-content .ml-item').each((index, element) => {
                const movieData = extractMovieData($, element);
                if (movieData && !movieData.url.includes('watch-tv')) {
                    movies.push(movieData);
                }
            });
        }
        
        return {
            movies: movies.slice(0, 20), // Limit to 20 for trending
            currentPage: page,
            hasNextPage: false
        };
    } catch (error) {
        console.error('Error getting trending movies:', error);
        return { movies: [], currentPage: 1, hasNextPage: false };
    }
}

// Get trending TV shows
async function getTrendingTVShows(page = 1) {
    try {
        const trendingBody = {
            home: 'home'
        };
        
        const html = await makePostRequest(`${BASE_URL}/trending`, trendingBody);
        const $ = cheerio.load(html);
        
    const shows = [];
        $('.ml-title:contains("Trending Series")').next('.tab-content').find('.ml-item').each((index, element) => {
            const showData = extractTVData($, element);
            if (showData) {
                shows.push(showData);
            }
        });
        
        return {
            shows: shows.slice(0, 20), // Limit to 20 for trending
            currentPage: page,
            hasNextPage: false
        };
    } catch (error) {
        console.error('Error getting trending TV shows:', error);
        return { shows: [], currentPage: 1, hasNextPage: false };
    }
}

// Helper function to extract direct video URLs from embed pages
async function extractDirectStreamingUrls(embedUrl, depth = 0) {
    try {
        console.log('Day2Soap: Extracting direct URLs from:', embedUrl);
        
        // First try the advanced real URL extractor
        const realVideoUrl = await extractRealVideoUrl(embedUrl, 'Day2Soap');
        
        if (realVideoUrl) {
            console.log('Day2Soap: ✅ Real URL extractor found:', realVideoUrl.url);
            return [{
                url: realVideoUrl.url,
                type: realVideoUrl.type,
                quality: realVideoUrl.quality,
                server: realVideoUrl.source,
                compatible: true
            }];
        }
        
        // Fallback to original extraction method
        console.log('Day2Soap: Real URL extractor failed, trying fallback method...');
        
        // Build dynamic Referer/Origin based on the embed URL
        let refererHeader = undefined;
        try {
            const origin = new URL(embedUrl).origin;
            refererHeader = origin.endsWith('/') ? origin : origin + '/';
        } catch {}

        const html = await makeRequest(embedUrl, {
            headers: {
                ...(refererHeader ? { 'Referer': refererHeader, 'Origin': refererHeader.replace(/\/$/, '') } : {})
            }
        });
        
        const directUrls = [];
        
        // Patterns to find video sources
        const videoPatterns = [
            // M3U8/HLS patterns
            /["']([^"']*\.m3u8[^"']*)["']/gi,
            /hlsManifestUrl['"]\s*:\s*['"]([^'"]+)['"]|"source":\s*"([^"]*\.m3u8[^"]*)"/gi,
            /file["']?\s*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /"hls":\s*"([^"]+)"/gi,
            
            // MP4 patterns
            /["']([^"']*\.mp4[^"']*)["']/gi,
            /file["']?\s*:\s*["']([^"']*\.mp4[^"']*)["']/gi,
            
            // VidSrc specific patterns
            /window\.location\.href\s*=\s*["']([^"']+)["']/gi,
            
            // General streaming patterns
            /sources?\s*:\s*\[\s*{[^}]*["']file["']\s*:\s*["']([^"']+)["']/gi,
            /src["']?\s*:\s*["']([^"']*\.(mp4|m3u8)[^"']*)["']/gi,
            /"url":\s*"([^"]*\.(mp4|m3u8)[^"]*)"/gi
        ];
        
        for (const pattern of videoPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const url = match[1] || match[2];
                if (url && (url.includes('.m3u8') || url.includes('.mp4')) && !url.includes('about:blank')) {
                    let fullUrl = url;
                    if (!url.startsWith('http')) {
                        if (url.startsWith('//')) {
                            fullUrl = `https:${url}`;
                        } else if (url.startsWith('/')) {
                            const domain = new URL(embedUrl).origin;
                            fullUrl = `${domain}${url}`;
                        } else {
                            fullUrl = `https://${url}`;
                        }
                    }
                    
                    directUrls.push({
                        url: fullUrl,
                        quality: url.includes('1080') ? '1080p' : url.includes('720') ? '720p' : 'HD',
                        type: url.includes('.m3u8') ? 'hls' : 'mp4'
                    });
                }
            }
        }
        
        // If none found yet, try nested iframes (limit recursion depth)
        if (directUrls.length === 0 && depth < 2) {
            const $ = cheerio.load(html);
            const iframes = $('iframe');
            for (let i = 0; i < iframes.length; i++) {
                const src = $(iframes[i]).attr('src');
                if (src && !src.includes('about:blank')) {
                    const fullSrc = src.startsWith('http') ? src : src.startsWith('//') ? `https:${src}` : `https://${src}`;
                    try {
                        const nested = await extractDirectStreamingUrls(fullSrc, depth + 1);
                        if (nested && nested.length) {
                            directUrls.push(...nested);
                            break;
                        }
                    } catch (e) {
                        console.log('Day2Soap: Nested iframe extraction failed:', e.message);
                    }
                }
            }
        }
        
        // Remove duplicates
        const uniqueUrls = directUrls.filter((item, index, self) => 
            index === self.findIndex(t => t.url === item.url)
        );
        
        return uniqueUrls;
    } catch (error) {
        console.error('Day2Soap: Error extracting direct URLs:', error);
        return [];
    }
}

// Resolve specific embed types
async function resolveEmbedType(embedUrl) {
    try {
        // VidAPI.xyz handling
        if (embedUrl.includes('vidapi.xyz')) {
            const directUrls = await extractDirectStreamingUrls(embedUrl);
            if (directUrls.length > 0) {
                return directUrls[0];
            }
        }
        
        // Player4u.xyz handling
        if (embedUrl.includes('player4u.xyz')) {
            const directUrls = await extractDirectStreamingUrls(embedUrl);
            if (directUrls.length > 0) {
                return directUrls[0];
            }
        }
        
        // VSrc handling
        if (embedUrl.includes('2embed.cc') || embedUrl.includes('vsrc')) {
            const directUrls = await extractDirectStreamingUrls(embedUrl);
            if (directUrls.length > 0) {
                return directUrls[0];
            }
        }
        
        // VidSrc.cc handling
        if (embedUrl.includes('vidsrc.cc')) {
            const directUrls = await extractDirectStreamingUrls(embedUrl);
            if (directUrls.length > 0) {
                return directUrls[0];
            }
        }
        
        // MoviesAPI handling
        if (embedUrl.includes('moviesapi.club')) {
            const directUrls = await extractDirectStreamingUrls(embedUrl);
            if (directUrls.length > 0) {
                return directUrls[0];
            }
        }
        
        // NoTon handling
        if (embedUrl.includes('nontongo.win')) {
            const directUrls = await extractDirectStreamingUrls(embedUrl);
            if (directUrls.length > 0) {
                return directUrls[0];
            }
        }
        
        // Generic embed handling
        const directUrls = await extractDirectStreamingUrls(embedUrl);
        return directUrls.length > 0 ? directUrls[0] : null;
        
    } catch (error) {
        console.error('Day2Soap: Error resolving embed type:', error);
        return null;
    }
}

// Resolve player URL to get direct streaming link - Nuvio compatible
async function resolvePlayerUrl(embedUrl, serverName = 'Unknown') {
    try {
        console.log('Day2Soap: Resolving embed URL:', embedUrl);
        
        // Attempt real video extraction first
        const realVideoUrl = await extractRealVideoUrl(embedUrl, serverName);
        if (realVideoUrl) {
            console.log('Day2Soap: ✅ Extracted real video URL:', realVideoUrl.url);
            return {
                url: realVideoUrl.url,
                type: realVideoUrl.type,
                quality: realVideoUrl.quality,
                server: `${serverName} (Direct)` ,
                compatible: true,
                source: realVideoUrl.source,
                originalEmbed: embedUrl
            };
        }
        
        // Fallback to Nuvio-compatible resolver
        const result = await getNuvioCompatibleLink(embedUrl, serverName);
        console.log('Day2Soap: Resolver result:', result.compatible ? 'Compatible' : 'Needs iframe support');
        
        return result;
    } catch (error) {
        console.error('Day2Soap: Failed to resolve player URL:', error.message);
        return {
            url: embedUrl,
            type: 'error',
            quality: 'Unknown',
            server: serverName,
            compatible: false,
            error: error.message
        };
    }
}

// Get recent movies
async function getRecentMovies(page = 1) {
    try {
        const recentBody = {
            recent: 'recent'
        };
        
        const html = await makePostRequest(`${BASE_URL}/recent`, recentBody);
        const $ = cheerio.load(html);
        
        const movies = [];
        
        $('.ml-item').each((index, element) => {
            const movieData = extractMovieData($, element);
            if (movieData) {
                movies.push(movieData);
            }
        });
        
        return {
            movies: movies,
            currentPage: page,
            hasNextPage: $('form[action*="page="]').length > 0
        };
    } catch (error) {
        console.error('Error getting recent movies:', error);
        return { movies: [], currentPage: 1, hasNextPage: false };
    }
}

module.exports = {
    searchMovies,
    // alias for compatibility
    search: searchMovies,
    getMovieDetails,
    getStreamingLinks,
    getTrendingMovies,
    getTrendingTVShows,
    resolvePlayerUrl,
    getRecentMovies,
    extractDirectStreamingUrls,
    BASE_URL
};
