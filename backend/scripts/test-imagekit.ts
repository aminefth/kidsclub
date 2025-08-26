import { imageKit } from '../utils/imagekit';

async function testImageKit() {
  console.log('Starting ImageKit test...');
  
  // Test 1: Check if imageKit is properly initialized
  console.log('\n=== Test 1: Service Initialization ===');
  console.log('ImageKit instance:', imageKit ? '✅ Initialized' : '❌ Not initialized');
  
  // Test 2: Get authentication parameters
  console.log('\n=== Test 2: Authentication Parameters ===');
  try {
    const auth = await imageKit.getAuthenticationParameters();
    console.log('Auth params:', auth);
    console.log(auth.success ? '✅ Success' : '❌ Failed');
  } catch (error) {
    console.error('❌ Error getting auth params:', error);
  }
  
  // Test 3: Health check
  console.log('\n=== Test 3: Health Check ===');
  try {
    const health = await imageKit.healthCheck();
    console.log('Health check:', health);
    console.log(health.healthy ? '✅ Healthy' : '❌ Unhealthy');
  } catch (error) {
    console.error('❌ Health check failed:', error);
  }
  
  // Test 4: Upload from URL
  const testImageUrl = 'https://ik.imagekit.io/demo/img/image10.jpeg?tr=w-200';
  console.log('\n=== Test 4: Upload from URL ===');
  console.log('Uploading test image from URL:', testImageUrl);
  
  try {
    const result = await imageKit.uploadFromUrl(testImageUrl, {
      folder: 'test-uploads',
      fileName: 'test-upload-' + Date.now() + '.jpg'
    });
    
    console.log('Upload result:', result);
    
    if (result.success) {
      console.log('✅ Upload successful!');
      console.log('File URL:', result.data?.url);
      console.log('File ID:', result.data?.fileId);
    } else {
      console.error('❌ Upload failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error during upload:', error);
  }
  
  console.log('\n=== Test Complete ===');
}

// Run the tests
if (require.main === module) {
  testImageKit()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
