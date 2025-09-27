// Test script for Coflix provider
// Testing with Fight Club (TMDB ID: 550) and Breaking Bad S01E01 (TMDB ID: 1396)

const { getStreams } = require('./providers/coflix.js');

console.log('Testing Coflix Provider...\n');

// Test 1: Movie - Fight Club
console.log('=== Test 1: Movie - Fight Club (TMDB ID: 550) ===');
getStreams('550', 'movie')
    .then(streams => {
        console.log(`✅ Found ${streams.length} streams for Fight Club`);
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
        console.error('❌ Error testing Fight Club:', error.message);
    })
    .then(() => {
        console.log('\n=== Test 2: TV Show - Breaking Bad S01E01 (TMDB ID: 1396) ===');
        
        // Test 2: TV Show - Breaking Bad Season 1 Episode 1
        return getStreams('1396', 'tv', 1, 1);
    })
    .then(streams => {
        console.log(`✅ Found ${streams.length} streams for Breaking Bad S01E01`);
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
        console.error('❌ Error testing Breaking Bad:', error.message);
    })
    .then(() => {
        console.log('\n=== Test 3: Movie - Inception (TMDB ID: 27205) ===');
        
        // Test 3: Movie - Inception
        return getStreams('27205', 'movie');
    })
    .then(streams => {
        console.log(`✅ Found ${streams.length} streams for Inception`);
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
        console.error('❌ Error testing Inception:', error.message);
    })
    .then(() => {
        console.log('✅ Coflix provider testing completed!');
    });