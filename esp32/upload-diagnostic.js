const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function uploadDiagnostic() {
    console.log('🔧 Uploading ESP32-S3 Diagnostic Firmware');
    console.log('=========================================');
    console.log('');
    console.log('This firmware will:');
    console.log('1. Use different GPIO pins (4, 5, 12, 13, 14, 15)');
    console.log('2. Test each pin individually on startup');
    console.log('3. Provide detailed serial output');
    console.log('4. Help identify the software issue');
    console.log('');

    try {
        // Step 1: Copy diagnostic code to main.cpp
        console.log('📝 Step 1: Copying diagnostic firmware...');
        await copyDiagnosticCode();
        
        // Step 2: Upload to ESP32
        console.log('📤 Step 2: Uploading to ESP32...');
        await uploadToESP32();
        
        console.log('');
        console.log('🎉 Diagnostic firmware uploaded!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Watch the relay board during startup');
        console.log('2. Each GPIO pin will be tested individually');
        console.log('3. Check which channels light up for which pins');
        console.log('4. Open serial monitor to see detailed output');
        console.log('');
        console.log('🔧 To open serial monitor:');
        console.log('   platformio device monitor --port COM6 --baud 115200');
        
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        process.exit(1);
    }
}

async function copyDiagnosticCode() {
    const sourcePath = path.join(__dirname, 'diagnostic_firmware.ino');
    const targetPath = path.join(__dirname, 'src', 'main.cpp');
    
    try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log('✅ Diagnostic code copied to main.cpp');
    } catch (error) {
        throw new Error(`Failed to copy diagnostic code: ${error.message}`);
    }
}

async function uploadToESP32() {
    try {
        const { stdout, stderr } = await execAsync('platformio run --target upload', {
            cwd: __dirname
        });
        
        if (stderr) {
            console.warn('⚠️  Upload warnings:', stderr);
        }
        
        console.log('✅ Upload completed successfully');
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        throw error;
    }
}

// Run the diagnostic upload
uploadDiagnostic(); 