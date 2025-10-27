#!/usr/bin/env node
/**
 * Test Deepgram API Key and Live Transcription
 *
 * This script tests if your Deepgram API key works and can
 * establish a live transcription connection.
 */

import 'dotenv/config';
import { createClient } from '@deepgram/sdk';

const DG_KEY = process.env.DEEPGRAM_API_KEY;

console.log('🔍 Deepgram API Key Test\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Check if API key exists
console.log('Test 1: Checking API key...');
if (!DG_KEY) {
	console.error('❌ FAIL: DEEPGRAM_API_KEY is not set in .env file');
	console.log('\n📝 Create a .env file with:');
	console.log('   DEEPGRAM_API_KEY=your_key_here\n');
	process.exit(1);
}

console.log(
	`✅ PASS: API key found (${DG_KEY.substring(0, 10)}...${DG_KEY.substring(
		DG_KEY.length - 4,
	)})`,
);
console.log(`   Length: ${DG_KEY.length} characters\n`);

// Test 2: Create Deepgram client
console.log('Test 2: Creating Deepgram client...');
let dg;
try {
	dg = createClient(DG_KEY);
	console.log('✅ PASS: Deepgram client created\n');
} catch (e) {
	console.error('❌ FAIL: Could not create Deepgram client');
	console.error('   Error:', e.message);
	process.exit(1);
}

// Test 3: Test API key with a simple API call
console.log('Test 3: Testing API key with Deepgram API...');
try {
	const response = await fetch('https://api.deepgram.com/v1/projects', {
		headers: {
			Authorization: `Token ${DG_KEY}`,
		},
	});

	if (response.ok) {
		const data = await response.json();
		console.log('✅ PASS: API key is valid');
		console.log(`   Projects found: ${data.projects?.length || 0}\n`);
	} else {
		console.error(`❌ FAIL: API returned HTTP ${response.status}`);
		const text = await response.text();
		console.error('   Response:', text.substring(0, 200));
		console.log('\n💡 Common issues:');
		console.log('   - Invalid API key');
		console.log('   - API key expired or deleted');
		console.log('   - Check https://console.deepgram.com/\n');
		process.exit(1);
	}
} catch (e) {
	console.error('❌ FAIL: Could not reach Deepgram API');
	console.error('   Error:', e.message);
	console.log('\n💡 Check your internet connection\n');
	process.exit(1);
}

// Test 4: Test live transcription connection
console.log('Test 4: Testing live transcription connection...');
let testPassed = false;
let errorOccurred = false;

try {
	const dgLive = await dg.listen.live({
		model: 'nova-2',
		language: 'en-US',
		interim_results: true,
		smart_format: true,
		encoding: 'linear16',
		sample_rate: 16000,
	});

	dgLive.addListener('open', () => {
		console.log('✅ PASS: Live connection opened successfully');
		console.log('   Model: nova-2');
		console.log('   Language: en-US');
		console.log('   Ready to receive audio\n');
		testPassed = true;

		// Close the connection after successful test
		setTimeout(() => {
			dgLive.finish();
			console.log('🎉 All tests passed!\n');
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
			console.log('✅ Your Deepgram API key is working correctly.');
			console.log('✅ Live transcription connection can be established.');
			console.log("\n💡 If your app still doesn't work, the issue is likely:");
			console.log('   - Audio format/encoding mismatch');
			console.log('   - Microphone permissions');
			console.log('   - WebSocket connection issues\n');
			process.exit(0);
		}, 1000);
	});

	dgLive.addListener('error', (e) => {
		console.error('❌ FAIL: Error in live connection');
		console.error('   Error:', e);
		errorOccurred = true;
	});

	dgLive.addListener('close', (closeEvent) => {
		if (!testPassed && !errorOccurred) {
			console.error('❌ FAIL: Connection closed unexpectedly');
			if (closeEvent) {
				console.error(
					`   Code: ${closeEvent.code}, Reason: ${closeEvent.reason}`,
				);
			}
		}
	});

	// Wait for connection to open
	await new Promise((resolve) => setTimeout(resolve, 3000));

	if (!testPassed && !errorOccurred) {
		console.error('❌ FAIL: Connection did not open within 3 seconds');
		console.log('\n💡 This might indicate:');
		console.log('   - Network issues');
		console.log('   - Firewall blocking WebSocket connections');
		console.log('   - Deepgram service issues\n');
		process.exit(1);
	}
} catch (e) {
	console.error('❌ FAIL: Could not create live connection');
	console.error('   Error:', e.message);
	console.log('\n💡 Check the error message above for details\n');
	process.exit(1);
}
