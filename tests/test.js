const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runTest(file1, file2) {
    try {
        // Execute both files
        const output1 = execSync(`node ${file1}`, { encoding: 'utf-8' }).trim();
        const output2 = execSync(`node ${file2}`, { encoding: 'utf-8' }).trim();

        // Compare outputs
        if (output1 === output2) {
            console.log('✓ Test passed: outputs are equal');
            return true;
        } else {
            console.log('✗ Test failed: outputs differ');
            console.log(`-----Output 1-----: ${output1}`);
            console.log(`-----Output 2-----: ${output2}`);
            return false;
        }
    } catch (error) {
        console.error('Error executing files:', error.message);
        return false;
    }
}

// Usage example
const file1 = process.argv[2] || './src/orderReportLegacy_refactored.js';
const file2 = process.argv[3] || './legacy/orderReportLegacy.js';

runTest(file1, file2);