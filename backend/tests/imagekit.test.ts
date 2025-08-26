import { imageKit } from '../utils/imagekit';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_FOLDER = 'test-uploads';
const TEST_IMAGE_URL = 'https://ik.imagekit.io/demo/img/image10.jpeg?tr=w-200';

// Helper function to clean up after tests
async function cleanup() {
  try {
    // In a real test, you would delete the test files from ImageKit here
    console.log('Cleanup complete');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Test suite
describe('ImageKit Service', () => {
  beforeAll(async () => {
    console.log('Starting ImageKit tests...');
  });

  afterAll(async () => {
    await cleanup();
  });

  test('should be properly initialized', () => {
    expect(imageKit).toBeDefined();
    expect(typeof imageKit.uploadFile).toBe('function');
    expect(typeof imageKit.uploadFromUrl).toBe('function');
  });

  test('should upload from URL', async () => {
    console.log('Testing upload from URL...');
    
    const result = await imageKit.uploadFromUrl(TEST_IMAGE_URL, {
      folder: TEST_FOLDER,
      fileName: 'test-upload-from-url.jpg'
    });

    console.log('Upload from URL result:', result);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeDefined();
      expect(result.data.url).toBeDefined();
      expect(result.data.fileId).toBeDefined();
    }
  });

  test('should handle invalid URL', async () => {
    console.log('Testing invalid URL...');
    
    const result = await imageKit.uploadFromUrl('invalid-url', {
      folder: TEST_FOLDER
    });

    console.log('Invalid URL result:', result);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should get authentication parameters', async () => {
    console.log('Testing authentication parameters...');
    
    const auth = await imageKit.getAuthenticationParameters();
    
    console.log('Auth params:', auth);
    
    expect(auth.success).toBe(true);
    if (auth.success) {
      expect(auth.data.token).toBeDefined();
      expect(auth.data.expire).toBeDefined();
      expect(auth.data.signature).toBeDefined();
    }
  });

  test('should check service health', async () => {
    console.log('Testing health check...');
    
    const health = await imageKit.healthCheck();
    
    console.log('Health check result:', health);
    
    expect(health.healthy).toBe(true);
  });
});

// Run the tests if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      console.log('Running ImageKit tests...');
      
      // Test initialization
      console.log('Testing initialization...');
      expect(imageKit).toBeDefined();
      
      // Test upload from URL
      console.log('\nTesting upload from URL...');
      const uploadResult = await imageKit.uploadFromUrl(TEST_IMAGE_URL, {
        folder: TEST_FOLDER,
        fileName: 'direct-test.jpg'
      });
      
      console.log('Upload result:', uploadResult);
      
      if (uploadResult.success) {
        console.log('Upload successful!');
        console.log('File URL:', uploadResult.data.url);
      } else {
        console.error('Upload failed:', uploadResult.error);
      }
      
      // Test authentication parameters
      console.log('\nTesting authentication parameters...');
      const auth = await imageKit.getAuthenticationParameters();
      console.log('Auth params:', auth);
      
      // Test health check
      console.log('\nTesting health check...');
      const health = await imageKit.healthCheck();
      console.log('Health check:', health);
      
      console.log('\nAll tests completed!');
      process.exit(0);
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  })();
}
