import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

let mongoServer: MongoMemoryServer;

// Global test setup
beforeAll(async () => {
  // Start MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to the in-memory database
  await mongoose.connect(mongoUri);
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN = 'test-access-token-secret-key-for-testing-purposes-only';
  process.env.REFRESH_TOKEN = 'test-refresh-token-secret-key-for-testing-purposes-only';
  process.env.ACTIVATION_SECRET = 'test-activation-secret-key-for-testing-purposes-only';
  process.env.IMAGEKIT_PUBLIC_KEY = 'test-imagekit-public-key';
  process.env.IMAGEKIT_PRIVATE_KEY = 'test-imagekit-private-key';
  process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/test';
  
  console.log('Test environment setup complete');
}, 60000);

// Clean up after each test
afterEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  
  // Redis is mocked in tests, no cleanup needed
});

// Global test teardown
afterAll(async () => {
  // Close MongoDB connection
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  
  // Stop MongoDB Memory Server
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 60000);

// Increase timeout for database operations
jest.setTimeout(30000);
