# CloudStream to Nuvio Provider Conversion Guide

This document outlines the key differences and conversion process from CloudStream extensions to Nuvio providers.

## Key Differences

### 1. Language & Platform
- **CloudStream**: Kotlin/Android
- **Nuvio**: JavaScript/React Native

### 2. Async Handling
- **CloudStream**: Uses Kotlin coroutines with `suspend` functions
- **Nuvio**: Uses Promises with `.then()` and `.catch()` (no async/await allowed)

### 3. HTTP Requests
- **CloudStream**: Uses `app.get()` from CloudStream framework
- **Nuvio**: Uses native `fetch()` with custom wrapper functions

### 4. HTML Parsing
- **CloudStream**: Uses Jsoup for DOM manipulation
- **Nuvio**: Uses `cheerio-without-node-native` for React Native compatibility

## Conversion Examples

### HTTP Requests
```kotlin
// CloudStream (Kotlin)
val response = app.get(url)
val document = response.document
```

```javascript
// Nuvio (JavaScript)
function makeRequest(url) {
    return fetch(url, { headers: {...} })
        .then(response => response.text())
        .then(html => cheerio.load(html));
}
```

### DOM Parsing
```kotlin
// CloudStream (Kotlin)
val title = document.selectFirst("h1.title")?.text()
val links = document.select("a.download-link")
```

```javascript
// Nuvio (JavaScript)
const $ = cheerio.load(html);
const title = $('h1.title').text();
const links = $('a.download-link');
```

### Stream Object Format
```kotlin
// CloudStream (Kotlin)
newExtractorLink(
    name = "Provider Name",
    url = streamUrl,
    quality = Qualities.P1080.value
)
```

```javascript
// Nuvio (JavaScript)
{
    name: "Provider Name - 1080p",
    title: "Movie Title (2023)",
    url: streamUrl,
    quality: "1080p",
    size: "Unknown",
    headers: { "User-Agent": "...", "Referer": "..." },
    provider: "providerId"
}
```

## Conversion Process

1. **Analyze the CloudStream provider structure**
   - Main API class extending `MainAPI`
   - `search()`, `load()`, and `loadLinks()` functions
   - Extractor classes for link resolution

2. **Convert to JavaScript structure**
   - Create main `getStreams()` function
   - Implement helper functions for HTTP requests
   - Convert DOM parsing to cheerio syntax

3. **Handle async operations**
   - Replace `suspend` functions with Promise-based approach
   - Use `.then()` and `.catch()` instead of async/await
   - Chain operations properly

4. **Format output for Nuvio**
   - Convert to required stream object format
   - Add proper headers and metadata
   - Include provider identification

## Examples Implemented

### 1. Coflix Provider
- **Original**: Kotlin CloudStream extension with complex API integration
- **Converted**: JavaScript provider with TV series support
- **Features**: Multi-server support, Base64 decoding, episode handling

### 2. FiveMovieRulz Provider  
- **Original**: Simple Kotlin provider for Hindi movies
- **Converted**: JavaScript provider with download link extraction
- **Features**: Quality detection, multiple hosting servers, smart matching

## Testing Strategy

1. **Mock Testing**: Test provider structure without external network calls
2. **Real Testing**: Test with actual API calls when network is available
3. **Error Handling**: Ensure graceful degradation on failures
4. **Format Validation**: Verify output matches Nuvio requirements

## Best Practices

1. **Error Handling**: Always wrap network calls in try-catch
2. **Logging**: Use console.log for debugging with provider prefix
3. **Compatibility**: Use React Native compatible libraries only
4. **Performance**: Implement reasonable timeouts and retries
5. **Standards**: Follow existing Nuvio provider patterns

## Files Created

- `providers/coflix.js` - Full-featured streaming provider
- `providers/fivemovierulz.js` - Movie-focused provider  
- `test_*.js` - Comprehensive test suites
- `manifest.json` - Updated with new provider configurations

This conversion demonstrates how CloudStream's rich ecosystem of providers can be successfully ported to Nuvio's JavaScript-based format while maintaining functionality and reliability.