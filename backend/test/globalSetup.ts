import dotenv from 'dotenv';
import path from 'path';

export default async function globalSetup() {
  // Load test environment variables
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  
  // Suppress console logs during tests (optional)
  if (process.env.SUPPRESS_TEST_LOGS === 'true') {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
}
