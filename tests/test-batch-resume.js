/**
 * Test: Batch Resume Functionality
 * 
 * Tests the batch state save/load and resume logic.
 */

const fs = require('fs');
const path = require('path');
const {
    saveBatchState,
    loadBatchState,
    clearBatchState,
    hasIncompleteBatchSession
} = require('../src/batch/batch-state');
const { resolveConfigPath } = require('../src/lib/file-utils');

// Test will use the actual config directory
const testStateFile = resolveConfigPath('batch-state.json');

function setupTestDir() {
    // Clean up any existing test state
    if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
    }
}

function cleanupTestDir() {
    // Clean up test state
    if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
    }
}

function assertEqual(actual, expected, testName) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        console.error(`❌ FAIL: ${testName}`);
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual: ${JSON.stringify(actual)}`);
        return false;
    }
    console.log(`✅ PASS: ${testName}`);
    return true;
}

async function test1_SaveAndLoadBatchState() {
    console.log('\n=== Test 1: Save and Load Batch State ===');
    setupTestDir();

    const testState = {
        allDmIds: ['123', '456', '789'],
        totalBatches: 3,
        currentBatch: 1,
        processedUsers: ['user1', 'user2'],
        skippedUsers: ['user3'],
        timestamp: new Date().toISOString(),
        inProgress: true,
        lastCompletedBatch: 0
    };

    // Save state
    saveBatchState(testState);

    // Verify file was created
    if (!fs.existsSync(testStateFile)) {
        console.error('❌ FAIL: State file was not created');
        cleanupTestDir();
        return false;
    }

    // Load state
    const loadedState = loadBatchState();

    // Verify all fields match
    let allPass = true;
    allPass &= assertEqual(loadedState.allDmIds, testState.allDmIds, 'allDmIds match');
    allPass &= assertEqual(loadedState.totalBatches, testState.totalBatches, 'totalBatches match');
    allPass &= assertEqual(loadedState.currentBatch, testState.currentBatch, 'currentBatch match');
    allPass &= assertEqual(loadedState.processedUsers, testState.processedUsers, 'processedUsers match');
    allPass &= assertEqual(loadedState.skippedUsers, testState.skippedUsers, 'skippedUsers match');
    allPass &= assertEqual(loadedState.inProgress, testState.inProgress, 'inProgress match');
    allPass &= assertEqual(loadedState.lastCompletedBatch, testState.lastCompletedBatch, 'lastCompletedBatch match');

    cleanupTestDir();
    return allPass;
}

async function test2_MarkBatchCompletion() {
    console.log('\n=== Test 2: Mark Batch Completion ===');
    setupTestDir();

    const initialState = {
        allDmIds: ['123', '456', '789', '101112', '131415', '161718'],
        totalBatches: 3,
        currentBatch: 1,
        processedUsers: [],
        skippedUsers: [],
        timestamp: new Date().toISOString(),
        inProgress: true,
        lastCompletedBatch: 0
    };

    saveBatchState(initialState);

    // Simulate completing batch 1
    const afterBatch1 = {
        ...initialState,
        currentBatch: 2,
        lastCompletedBatch: 1,
        processedUsers: ['user1', 'user2']
    };
    saveBatchState(afterBatch1);
    
    let loaded = loadBatchState();
    let allPass = assertEqual(loaded.lastCompletedBatch, 1, 'Batch 1 marked complete');

    // Simulate completing batch 2
    const afterBatch2 = {
        ...afterBatch1,
        currentBatch: 3,
        lastCompletedBatch: 2,
        processedUsers: ['user1', 'user2', 'user3', 'user4']
    };
    saveBatchState(afterBatch2);

    loaded = loadBatchState();
    allPass &= assertEqual(loaded.lastCompletedBatch, 2, 'Batch 2 marked complete');
    allPass &= assertEqual(loaded.currentBatch, 3, 'Current batch is 3');

    cleanupTestDir();
    return allPass;
}

async function test3_ResumeFromIncompleteSession() {
    console.log('\n=== Test 3: Resume from Incomplete Session ===');
    setupTestDir();

    // Simulate an interrupted session after batch 2 completed
    const interruptedState = {
        allDmIds: ['id1', 'id2', 'id3', 'id4', 'id5', 'id6', 'id7', 'id8', 'id9'],
        totalBatches: 3,
        currentBatch: 3,
        processedUsers: ['user1', 'user2', 'user3', 'user4', 'user5', 'user6'],
        skippedUsers: ['user7'],
        timestamp: new Date().toISOString(),
        inProgress: true,
        lastCompletedBatch: 2  // Only batches 1 and 2 completed
    };

    saveBatchState(interruptedState);

    // Check if incomplete session is detected
    const hasIncomplete = hasIncompleteBatchSession();
    let allPass = assertEqual(hasIncomplete, true, 'Incomplete session detected');

    // Load state for resume
    const resumeState = loadBatchState();
    allPass &= assertEqual(resumeState.lastCompletedBatch, 2, 'Resume from batch 2');
    allPass &= assertEqual(resumeState.currentBatch, 3, 'Should resume at batch 3');
    allPass &= assertEqual(resumeState.inProgress, true, 'Session still in progress');

    cleanupTestDir();
    return allPass;
}

async function test4_ClearBatchStateOnCompletion() {
    console.log('\n=== Test 4: Clear Batch State on Completion ===');
    setupTestDir();

    const testState = {
        allDmIds: ['123', '456'],
        totalBatches: 1,
        currentBatch: 1,
        processedUsers: ['user1', 'user2'],
        skippedUsers: [],
        timestamp: new Date().toISOString(),
        inProgress: false,
        lastCompletedBatch: 1
    };

    saveBatchState(testState);

    // Clear the state
    clearBatchState();

    // Verify file was deleted
    const fileExists = fs.existsSync(testStateFile);
    const allPass = assertEqual(fileExists, false, 'State file deleted');

    // Verify hasIncompleteBatchSession returns false
    const hasIncomplete = hasIncompleteBatchSession();
    assertEqual(hasIncomplete, false, 'No incomplete session after clear');

    cleanupTestDir();
    return allPass;
}

async function test5_AtomicWrite() {
    console.log('\n=== Test 5: Atomic Write Verification ===');
    setupTestDir();

    const testState = {
        allDmIds: ['123'],
        totalBatches: 1,
        currentBatch: 1,
        processedUsers: [],
        skippedUsers: [],
        timestamp: new Date().toISOString(),
        inProgress: true,
        lastCompletedBatch: 0
    };

    // Save state
    saveBatchState(testState);

    // Verify file was created and no temporary files left behind
    const configDir = path.dirname(testStateFile);
    const files = fs.readdirSync(configDir);
    const hasTempFiles = files.some(f => f.includes('.tmp') || f.includes('.temp'));
    const allPass = assertEqual(hasTempFiles, false, 'No temporary files left behind');

    // Verify file is valid JSON
    const content = fs.readFileSync(testStateFile, 'utf8');
    let isValidJson = false;
    try {
        JSON.parse(content);
        isValidJson = true;
    } catch (e) {
        isValidJson = false;
    }
    assertEqual(isValidJson, true, 'File contains valid JSON');

    cleanupTestDir();
    return allPass;
}

// Run all tests
(async () => {
    console.log('🧪 Running Batch Resume Tests\n');
    
    const results = [];
    results.push(await test1_SaveAndLoadBatchState());
    results.push(await test2_MarkBatchCompletion());
    results.push(await test3_ResumeFromIncompleteSession());
    results.push(await test4_ClearBatchStateOnCompletion());
    results.push(await test5_AtomicWrite());

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Test Results: ${passed}/${total} passed`);
    console.log('='.repeat(50));

    if (passed === total) {
        console.log('✅ All tests passed!');
        process.exit(0);
    } else {
        console.log(`❌ ${total - passed} test(s) failed`);
        process.exit(1);
    }
})();
