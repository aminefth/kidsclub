describe('Simple Infrastructure Test', () => {
  it('should verify Jest is working correctly', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect(true).toBeTruthy();
  });

  it('should verify environment variables are loaded', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.ACCESS_TOKEN).toBeDefined();
    expect(process.env.REFRESH_TOKEN).toBeDefined();
  });

  it('should verify async operations work', async () => {
    const promise = new Promise(resolve => {
      setTimeout(() => resolve('success'), 10);
    });

    const result = await promise;
    expect(result).toBe('success');
  });
});
