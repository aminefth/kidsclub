// Mock ImageKit service for testing
export const mockImageKit = {
  uploadFile: jest.fn().mockImplementation((file: any, options?: any) => {
    return Promise.resolve({
      success: true,
      data: {
        fileId: 'mock-file-id-' + Date.now(),
        url: 'https://ik.imagekit.io/test/mock-image.webp',
        name: options?.fileName || 'mock-image',
        size: 1024,
        filePath: '/test/' + (options?.fileName || 'mock-image'),
        tags: options?.tags || [],
        isPrivateFile: false,
        customCoordinates: null,
        fileType: 'image'
      }
    });
  }),

  deleteFile: jest.fn().mockResolvedValue({
    success: true
  }),

  getAuthenticationParameters: jest.fn().mockReturnValue({
    token: 'mock-token',
    expire: Date.now() + 3600000,
    signature: 'mock-signature'
  }),

  listFiles: jest.fn().mockResolvedValue({
    success: true,
    data: []
  })
};

// Mock the imagekit module
jest.mock('../../utils/imagekit', () => ({
  __esModule: true,
  default: mockImageKit
}));
