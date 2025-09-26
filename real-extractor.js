// Advanced embed URL extractor - extracts real direct video links from iframes
const cheerio = require('cheerio-without-node-native');
const { getStreams: getVidSrcStreams } = require('./providers/vidsrc');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Safe base64 decoder (Node-friendly)
function b64decode(input) {
    try {
        return Buffer.from(input, 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

// Make request with proper headers
async function makeRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Referer': 'https://yesmovieshub.online/',
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(url, defaultOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Request failed for ${url}:`, error.message);
        throw error;
    }
}

// Extract real video URLs from VidSrc embeds
async function extractVidSrcRealUrl(embedUrl) {
    try {
        console.log('🔍 Extracting real URL from VidSrc:', embedUrl);
        
        // Try first-party VidSrc resolver to get guaranteed direct URLs
        try {
            const directFromProvider = await resolveVidSrcViaProvider(embedUrl);
            if (directFromProvider) {
                return directFromProvider;
            }
        } catch (providerError) {
            console.log('VidSrc provider resolution failed:', providerError.message);
        }
        
        const html = await makeRequest(embedUrl);
        
        // Look for video sources in multiple formats
        const videoPatterns = [
            // M3U8/HLS patterns
            /file\s*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /src\s*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /source\s*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /playlist\s*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /"hls"\s*:\s*"([^"]+\.m3u8[^"]*)"/gi,
            
            // MP4 patterns
            /file\s*:\s*["']([^"']*\.mp4[^"']*)["']/gi,
            /src\s*:\s*["']([^"']*\.mp4[^"']*)["']/gi,
            
            // JWPlayer patterns
            /sources?\s*:\s*\[\s*{\s*["']file["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            
            // Embedded JSON patterns
            /"file"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/gi,
            /"url"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/gi
        ];
        
        for (const pattern of videoPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                let videoUrl = match[1];
                if (videoUrl && !videoUrl.includes('about:blank')) {
                    // Fix relative URLs
                    if (!videoUrl.startsWith('http')) {
                        if (videoUrl.startsWith('//')) {
                            videoUrl = `https:${videoUrl}`;
                        } else if (videoUrl.startsWith('/')) {
                            const domain = new URL(embedUrl).origin;
                            videoUrl = `${domain}${videoUrl}`;
                        } else {
                            videoUrl = `https://${videoUrl}`;
                        }
                    }
                    
                    console.log('✅ Found VidSrc direct URL:', videoUrl);
                    return {
                        url: videoUrl,
                        type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4',
                        quality: 'HD',
                        source: 'vidsrc_direct'
                    };
                }
            }
        }
        
        // Look for nested iframes
        const $ = cheerio.load(html);
        const nestedIframe = $('iframe').first().attr('src');
        if (nestedIframe && !nestedIframe.includes('about:blank')) {
            const fullIframeUrl = nestedIframe.startsWith('http') ? nestedIframe : 
                                 nestedIframe.startsWith('//') ? `https:${nestedIframe}` : 
                                 `https://${nestedIframe}`;
            
            console.log('🔍 Following nested iframe:', fullIframeUrl);
            return await extractGenericRealUrl(fullIframeUrl);
        }
        
        return null;
    } catch (error) {
        console.error('VidSrc extraction failed:', error.message);
        return null;
    }
}

// Use the dedicated VidSrc provider to resolve direct streams
async function resolveVidSrcViaProvider(embedUrl) {
    try {
        const urlObj = new URL(embedUrl);
        const pathname = urlObj.pathname || '';
        const params = urlObj.searchParams;
        const isTv = pathname.includes('/tv') || params.get('type') === 'tv';
        const mediaType = isTv ? 'tv' : 'movie';
        
        let id = params.get('tmdb') || params.get('imdb');
        if (!id) {
            const segments = pathname.split('/').filter(Boolean);
            id = segments.pop();
        }
        
        if (!id) {
            console.log('VidSrc provider: No identifier found in embed URL');
            return null;
        }
        
        const season = params.get('season') || params.get('s');
        const episode = params.get('episode') || params.get('e');
        
        const seasonNum = season ? parseInt(season, 10) : null;
        const episodeNum = episode ? parseInt(episode, 10) : null;
        
        const streams = await getVidSrcStreams(id, mediaType, seasonNum, episodeNum);
        if (!streams || streams.length === 0) {
            return null;
        }
        
        // Streams are already sorted by quality (highest first)
        const bestStream = streams.find(stream => stream && stream.url);
        if (!bestStream) {
            return null;
        }
        
        const streamUrl = bestStream.url;
        const isHls = streamUrl.includes('.m3u8');
        
        return {
            url: streamUrl,
            type: isHls ? 'hls' : 'mp4',
            quality: bestStream.quality || (isHls ? 'HLS' : 'HD'),
            source: 'vidsrc_provider'
        };
    } catch (error) {
        console.log('VidSrc provider resolution threw error:', error.message);
        return null;
    }
}

// Extract real video URLs from 2Embed
async function extract2EmbedRealUrl(embedUrl) {
    try {
        console.log('🔍 Extracting real URL from 2Embed:', embedUrl);
        
        const html = await makeRequest(embedUrl);
        
        // Look for API calls or AJAX requests that might contain video URLs
        const apiPatterns = [
            /fetch\(['"]([^'"]*api[^'"]*)['"]/gi,
            /xhr\.open\(['"]GET['"],\s*['"]([^'"]*)['"]/gi,
            /\$\.get\(['"]([^'"]*)['"]/gi,
            /ajax\(['"]([^'"]*)['"]/gi
        ];
        
        for (const pattern of apiPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const apiUrl = match[1];
                try {
                    console.log('🔍 Trying API endpoint:', apiUrl);
                    const apiResponse = await makeRequest(apiUrl, {
                        headers: { 'Referer': embedUrl }
                    });
                    
                    // Look for video URLs in API response
                    const videoMatch = apiResponse.match(/"(?:file|url|source)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/);
                    if (videoMatch) {
                        console.log('✅ Found 2Embed API direct URL:', videoMatch[1]);
                        return {
                            url: videoMatch[1],
                            type: videoMatch[1].includes('.m3u8') ? 'hls' : 'mp4',
                            quality: 'HD',
                            source: '2embed_api'
                        };
                    }
                } catch (apiError) {
                    console.log('API endpoint failed:', apiError.message);
                }
            }
        }
        
        // Fallback to generic extraction
        return await extractGenericRealUrl(embedUrl);
    } catch (error) {
        console.error('2Embed extraction failed:', error.message);
        return null;
    }
}

// Extract real video URLs from AutoEmbed
async function extractAutoEmbedRealUrl(embedUrl) {
    try {
        console.log('🔍 Extracting real URL from AutoEmbed:', embedUrl);
        
        const html = await makeRequest(embedUrl);
        
        // AutoEmbed often uses encrypted or base64 encoded URLs
        const encodedPatterns = [
            /atob\(['"]([^'"]+)['"]\)/gi,
            /decode\(['"]([^'"]+)['"]\)/gi,
            /decrypt\(['"]([^'"]+)['"]\)/gi
        ];
        
        for (const pattern of encodedPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                try {
                    const decoded = b64decode(match[1]);
                    if (decoded.includes('.m3u8') || decoded.includes('.mp4')) {
                        console.log('✅ Found AutoEmbed decoded URL:', decoded);
                        return {
                            url: decoded,
                            type: decoded.includes('.m3u8') ? 'hls' : 'mp4',
                            quality: 'HD',
                            source: 'autoembed_decoded'
                        };
                    }
                } catch (decodeError) {
                    // Ignore decode errors
                }
            }
        }
        
        // Fallback to generic extraction
        return await extractGenericRealUrl(embedUrl);
    } catch (error) {
        console.error('AutoEmbed extraction failed:', error.message);
        return null;
    }
}

// Generic real URL extractor for any embed
async function extractGenericRealUrl(embedUrl) {
    try {
        console.log('🔍 Generic extraction from:', embedUrl);
        
        const html = await makeRequest(embedUrl);
        
        // Comprehensive video URL patterns
        const allPatterns = [
            // Direct video file patterns
            /file\s*[:=]\s*["']([^"']*\.(?:m3u8|mp4|mkv|avi|webm)[^"']*)["']/gi,
            /src\s*[:=]\s*["']([^"']*\.(?:m3u8|mp4|mkv|avi|webm)[^"']*)["']/gi,
            /source\s*[:=]\s*["']([^"']*\.(?:m3u8|mp4|mkv|avi|webm)[^"']*)["']/gi,
            /url\s*[:=]\s*["']([^"']*\.(?:m3u8|mp4|mkv|avi|webm)[^"']*)["']/gi,
            
            // HLS specific patterns
            /playlist\s*[:=]\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /hls\s*[:=]\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /m3u8\s*[:=]\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            
            // JSON patterns
            /"(?:file|url|source|stream|video)"\s*:\s*"([^"]+\.(?:m3u8|mp4|mkv|avi|webm)[^"]*)"/gi,
            
            // JWPlayer patterns
            /jwplayer[^}]*sources?\s*:\s*\[\s*{\s*["']file["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            
            // Video.js patterns
            /videojs[^}]*src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
            
            // Encrypted/obfuscated patterns
            /(?:https?:)?\/\/[^"'\s]+\.(?:m3u8|mp4|mkv|avi|webm)(?:[^"'\s]*)?/gi
        ];
        
        for (const pattern of allPatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                let videoUrl = match[1] || match[0];
                
                if (videoUrl && !videoUrl.includes('about:blank') && !videoUrl.includes('javascript:')) {
                    // Clean and fix the URL
                    if (!videoUrl.startsWith('http')) {
                        if (videoUrl.startsWith('//')) {
                            videoUrl = `https:${videoUrl}`;
                        } else if (videoUrl.startsWith('/')) {
                            const domain = new URL(embedUrl).origin;
                            videoUrl = `${domain}${videoUrl}`;
                        } else if (!videoUrl.includes('://')) {
                            videoUrl = `https://${videoUrl}`;
                        }
                    }
                    
                    // Validate it looks like a real video URL
                    if (videoUrl.match(/\.(m3u8|mp4|mkv|avi|webm)(\?|$|#)/)) {
                        console.log('✅ Found generic direct URL:', videoUrl);
                        return {
                            url: videoUrl,
                            type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4',
                            quality: videoUrl.includes('1080') ? '1080p' : videoUrl.includes('720') ? '720p' : 'HD',
                            source: 'generic_extracted'
                        };
                    }
                }
            }
        }
        
        // Look for nested iframes as last resort
        const $ = cheerio.load(html);
        const nestedIframes = $('iframe');
        
        for (let i = 0; i < Math.min(nestedIframes.length, 3); i++) {
            const iframeSrc = $(nestedIframes[i]).attr('src');
            if (iframeSrc && !iframeSrc.includes('about:blank')) {
                const fullUrl = iframeSrc.startsWith('http') ? iframeSrc : 
                               iframeSrc.startsWith('//') ? `https:${iframeSrc}` : 
                               `https://${iframeSrc}`;
                
                console.log('🔍 Trying nested iframe:', fullUrl);
                try {
                    const nestedResult = await extractGenericRealUrl(fullUrl);
                    if (nestedResult) {
                        return nestedResult;
                    }
                } catch (nestedError) {
                    console.log('Nested iframe failed:', nestedError.message);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Generic extraction failed:', error.message);
        return null;
    }
}

// Master function to extract real URLs from any embed
async function extractRealVideoUrl(embedUrl, serverHint = '') {
    try {
        console.log(`🎯 Extracting real video URL from: ${embedUrl}`);
        console.log(`🏷️ Server hint: ${serverHint}`);
        
        // Route to specific extractors based on URL domain
        if (isVidSrcFamilyUrl(embedUrl)) {
            const result = await extractVidSrcRealUrl(embedUrl);
            if (result) return result;
        }
        
        if (embedUrl.includes('2embed.cc')) {
            const result = await extract2EmbedRealUrl(embedUrl);
            if (result) return result;
        }
        
        if (embedUrl.includes('autoembed.cc') || embedUrl.includes('player.autoembed')) {
            const result = await extractAutoEmbedRealUrl(embedUrl);
            if (result) return result;
        }
        
        if (embedUrl.includes('vidapi.xyz')) {
            const result = await extractGenericRealUrl(embedUrl);
            if (result) return result;
        }
        
        if (embedUrl.includes('player4u.xyz')) {
            const result = await extractGenericRealUrl(embedUrl);
            if (result) return result;
        }
        
        // Generic fallback for any embed
        const result = await extractGenericRealUrl(embedUrl);
        if (result) return result;
        
        console.log('❌ Could not extract real video URL');
        return null;
        
    } catch (error) {
        console.error('Real URL extraction failed:', error.message);
        return null;
    }
}

function isVidSrcFamilyUrl(url) {
    const lowered = url.toLowerCase();
    return [
        'vidsrc.',
        'vidapi.',
        'vsrc',
        'streamsrcs.',
        'vidsrc.cc'
    ].some(keyword => lowered.includes(keyword));
}

module.exports = {
    extractRealVideoUrl,
    extractVidSrcRealUrl,
    extract2EmbedRealUrl,
    extractAutoEmbedRealUrl,
    extractGenericRealUrl
};
