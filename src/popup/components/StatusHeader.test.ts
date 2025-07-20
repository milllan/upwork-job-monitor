import { StatusHeader } from './StatusHeader';

// Mock the timeAgo utility function
jest.mock('../../utils/utils.js', () => ({
  timeAgo: jest.fn(),
}));

// Import the mocked function to assert its usage
import { timeAgo } from '../../utils/utils.js';

describe('StatusHeader', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Clear the DOM before each test
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'status-header-container';
    document.body.appendChild(container);
    // Reset mocks before each test
    (timeAgo as jest.Mock).mockClear();
  });

  it('should render with default initial state', () => {
    new StatusHeader(container); // Removed unused statusHeader variable
    expect(container.querySelector('[title="Current monitor status"]')?.textContent).toBe('Initializing...');
    expect(container.querySelector('[title="Last successful check time"]')?.textContent).toBe('Last: N/A');
    expect(container.querySelector('[title="Jobs you\'ve deleted from the list"]')?.textContent).toBe('Del: 0');
    expect(timeAgo).not.toHaveBeenCalled();
  });

  it('should update status text correctly', () => {
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ statusText: 'Monitoring' });
    expect(container.querySelector('[title="Current monitor status"]')?.textContent).toBe('Monitoring');
  });

  it('should display last check timestamp correctly when provided', () => {
    const now = Date.now();
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ lastCheckTimestamp: now });

    const expectedTime = new Date(now).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(container.innerHTML).toContain(`Last: ${expectedTime}`);
    expect(timeAgo).toHaveBeenCalledWith(new Date(now));
  });

  it('should display deleted jobs count correctly', () => {
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ deletedJobsCount: 5 });
    expect(container.innerHTML).toContain('Del: 5</span>');
  });

  it('should reflect multiple state updates', () => {
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ statusText: 'Active', deletedJobsCount: 10 });
    const now = Date.now();
    statusHeader.update({ lastCheckTimestamp: now, statusText: 'Running' });

    expect(container.innerHTML).toContain('Current monitor status">Running</span>');
    const expectedTime = new Date(now).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(container.innerHTML).toContain(`Last: ${expectedTime}`);
    expect(container.innerHTML).toContain('Del: 10</span>');
    expect(timeAgo).toHaveBeenCalledWith(new Date(now));
  });

  it('should handle null lastCheckTimestamp after it was set', () => {
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ lastCheckTimestamp: Date.now() });
    expect(container.innerHTML).not.toContain('N/A');

    statusHeader.update({ lastCheckTimestamp: null });
    expect(container.innerHTML).toContain('Last: N/A</span>');
    expect(timeAgo).toHaveBeenCalledTimes(1); // Should not be called for null timestamp
  });

  it('should render "Idle" if statusText is empty', () => {
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ statusText: '' });
    expect(container.innerHTML).toContain('Current monitor status">Idle</span>');
  });

  it('should render "0" if deletedJobsCount is 0', () => {
    const statusHeader = new StatusHeader(container);
    statusHeader.update({ deletedJobsCount: 0 });
    expect(container.innerHTML).toContain('Del: 0</span>');
  });

  it('should throw error if container element is not provided in constructor', () => {
    expect(() => new StatusHeader(null as unknown as HTMLElement)).toThrow('StatusHeader component requires a container element.');
  });
});