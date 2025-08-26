// Mock Redis for testing
export const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  ping: jest.fn().mockResolvedValue('PONG'),
  flushall: jest.fn().mockResolvedValue('OK'),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1)
};

// Mock the redis module
jest.mock('../../utils/redis', () => ({
  redis: mockRedis
}));
