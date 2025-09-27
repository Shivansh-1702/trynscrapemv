// Test script for FiveMovieRulz provider
// Testing with popular Hindi movies

const { getStreams } = require('./providers/fivemovierulz.js');

console.log('Testing FiveMovieRulz Provider...\n');

// Test 1: Movie - 3 Idiots (TMDB ID: 20453)
console.log('=== Test 1: Movie - 3 Idiots (TMDB ID: 20453) ===');
getStreams('20453', 'movie')
    .then(streams => {
        console.log(`✅ Found ${streams.length} streams for 3 Idiots`);
        streams.forEach((stream, index) => {
            console.log(`  ${index + 1}. ${stream.name}`);
            console.log(`     Title: ${stream.title}`);
            console.log(`     Quality: ${stream.quality}`);
            console.log(`     URL: ${stream.url.substring(0, 100)}...`);
            console.log(`     Provider: ${stream.provider}`);
            console.log('');
        });
    })
    .catch(error => {
        console.error('❌ Error testing 3 Idiots:', error.message);
    })
    .then(() => {
        console.log('\n=== Test 2: TV Show - Breaking Bad (should fail) ===');
        
        // Test 2: TV Show - Should fail since FiveMovieRulz only supports movies
        return getStreams('1396', 'tv', 1, 1);
    })
    .then(streams => {
        console.log(`✅ TV Show test completed - Found ${streams.length} streams (expected 0)`);
        if (streams.length === 0) {
            console.log('   ✅ Correctly rejected TV show request');
        }
    })
    .catch(error => {
        console.error('❌ Error testing TV show:', error.message);
    })
    .then(() => {
        console.log('\n=== Test 3: Movie - Dangal (TMDB ID: 360814) ===');
        
        // Test 3: Movie - Dangal
        return getStreams('360814', 'movie');
    })
    .then(streams => {
        console.log(`✅ Found ${streams.length} streams for Dangal`);
        streams.forEach((stream, index) => {
            console.log(`  ${index + 1}. ${stream.name}`);
            console.log(`     Title: ${stream.title}`);
            console.log(`     Quality: ${stream.quality}`);
            console.log(`     URL: ${stream.url.substring(0, 100)}...`);
            console.log(`     Provider: ${stream.provider}`);
            console.log('');
        });
    })
    .catch(error => {
        console.error('❌ Error testing Dangal:', error.message);
    })
    .then(() => {
        console.log('✅ FiveMovieRulz provider testing completed!');
    });