#!/usr/bin/env node
/**
 * Test to verify DRY_RUN mode prevents all API calls
 */

const { getConfigManager } = require('../src/config');
const { getCurrentOpenDMs, closeDM, reopenDM } = require('../src/discord-api');

// Mock axios to detect if any HTTP requests are attempted
let httpRequestAttempted = false;
const axios = require('axios');
const originalGet = axios.get;
const originalPost = axios.post;
const originalDelete = axios.delete;

axios.get = function(...args) {
    httpRequestAttempted = true;
    console.error('HTTP GET request attempted during DRY_RUN mode!');
    console.error('   URL:', args[0]);
    throw new Error('HTTP request should not be made in DRY_RUN mode');
};

axios.post = function(...args) {
    httpRequestAttempted = true;
    console.error('HTTP POST request attempted during DRY_RUN mode!');
    console.error('   URL:', args[0]);
    throw new Error('HTTP request should not be made in DRY_RUN mode');
};

axios.delete = function(...args) {
    httpRequestAttempted = true;
    console.error('HTTP DELETE request attempted during DRY_RUN mode!');
    console.error('   URL:', args[0]);
    throw new Error('HTTP request should not be made in DRY_RUN mode');
};

async function runTests() {
    console.log('Testing DRY_RUN mode protection\n');
    
    const configManager = getConfigManager();
    configManager.config.DRY_RUN = true;
    console.log('DRY_RUN mode enabled\n');
    
    const startTime = Date.now();
    let testsRun = 0;
    let testsPassed = 0;
    
    // Test 1: getCurrentOpenDMs
    try {
        console.log('Test 1: getCurrentOpenDMs()...');
        const result = await getCurrentOpenDMs('fake-token', console.log);
        if (Array.isArray(result) && result.length === 0 && !httpRequestAttempted) {
            console.log('   PASSED - No HTTP request, returned empty array\n');
            testsPassed++;
        } else {
            throw new Error('Unexpected result');
        }
        testsRun++;
    } catch (error) {
        console.error(`   FAILED - ${error.message}\n`);
        testsRun++;
    }
    
    // Test 2: closeDM
    try {
        console.log('Test 2: closeDM()...');
        httpRequestAttempted = false;
        await closeDM('fake-token', 'fake-channel-id', console.log);
        if (!httpRequestAttempted) {
            console.log('   PASSED - No HTTP request\n');
            testsPassed++;
        } else {
            throw new Error('HTTP request was made');
        }
        testsRun++;
    } catch (error) {
        console.error(`   FAILED - ${error.message}\n`);
        testsRun++;
    }
    
    // Test 3: reopenDM
    try {
        console.log('Test 3: reopenDM()...');
        httpRequestAttempted = false;
        const result = await reopenDM('fake-token', 'fake-user-id', console.log);
        if (result && result.id === 'dry-run-id' && !httpRequestAttempted) {
            console.log('   PASSED - No HTTP request, returned mock data\n');
            testsPassed++;
        } else {
            throw new Error('Unexpected result or HTTP request made');
        }
        testsRun++;
    } catch (error) {
        console.error(`   FAILED - ${error.message}\n`);
        testsRun++;
    }
    
    // Test 4: Multiple operations in sequence (simulating batch processing)
    try {
        console.log('Test 4: Batch operations (10 reopens, 5 closes)...');
        httpRequestAttempted = false;
        
        for (let i = 0; i < 10; i++) {
            await reopenDM('fake-token', `user-${i}`, console.log);
        }
        
        for (let i = 0; i < 5; i++) {
            await closeDM('fake-token', `channel-${i}`, console.log);
        }
        
        if (!httpRequestAttempted) {
            console.log('   PASSED - No HTTP requests for 15 operations\n');
            testsPassed++;
        } else {
            throw new Error('HTTP request was made during batch operations');
        }
        testsRun++;
    } catch (error) {
        console.error(`   FAILED - ${error.message}\n`);
        testsRun++;
    }
    
    const elapsedTime = Date.now() - startTime;
    
    axios.get = originalGet;
    axios.post = originalPost;
    axios.delete = originalDelete;
    
    console.log('Test Results: ' + testsPassed + '/' + testsRun + ' passed');
    console.log('Execution time: ' + elapsedTime + 'ms');
    
    if (testsPassed === testsRun) {
        console.log('\nALL TESTS PASSED');
        console.log('DRY_RUN mode successfully prevents all API calls');
        
        if (elapsedTime > 1000) {
            console.warn('\nWarning: Tests took longer than expected');
            console.warn('This might indicate rate limiting is still being applied');
        } else {
            console.log('Operations completed instantly (no rate limiting)');
        }
        
        process.exit(0);
    } else {
        console.error('\nSOME TESTS FAILED');
        console.error('DRY_RUN mode is not fully protecting against API calls');
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('\nUnexpected error:', error);
    process.exit(1);
});
