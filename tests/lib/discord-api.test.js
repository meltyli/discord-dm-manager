const axios = require('axios');
const { getCurrentOpenDMs, validateUser, reopenDM, closeDM } = require('../../src/discord-api');

// Mock axios
jest.mock('axios');

// Mock config
jest.mock('../../src/config', () => ({
    getConfigManager: () => ({
        get: jest.fn((key) => {
            const config = {
                'MAX_RETRIES': 3,
                'RETRY_DELAY_MS': 100,
                'RATE_LIMIT_REQUESTS': 50,
                'RATE_LIMIT_INTERVAL_MS': 60000,
                'DRY_RUN': false
            };
            return config[key];
        })
    })
}));

describe('getCurrentOpenDMs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should fetch open DMs successfully', async () => {
        const mockChannels = [
            { id: '123', type: 1, recipients: [{ id: '456' }] },
            { id: '789', type: 1, recipients: [{ id: '101' }] }
        ];

        axios.get.mockResolvedValueOnce({ data: mockChannels });

        const result = await getCurrentOpenDMs('test-token');

        expect(result).toEqual(mockChannels);
        expect(axios.get).toHaveBeenCalledWith(
            'https://discord.com/api/v9/users/@me/channels',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'test-token'
                })
            })
        );
    });

    test('should retry on failure', async () => {
        axios.get
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ data: [] });

        const result = await getCurrentOpenDMs('test-token');

        expect(result).toEqual([]);
        expect(axios.get).toHaveBeenCalledTimes(2);
    });
});

describe('validateUser', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should return true for valid user', async () => {
        axios.post.mockResolvedValueOnce({ data: { id: '123' } });

        const result = await validateUser('test-token', '12345');

        expect(result).toBe(true);
    });

    test('should return false for 404 error', async () => {
        axios.post.mockRejectedValueOnce({
            response: { status: 404 }
        });

        const result = await validateUser('test-token', '12345');

        expect(result).toBe(false);
    });

    test('should return false for 400 error', async () => {
        axios.post.mockRejectedValueOnce({
            response: { status: 400 }
        });

        const result = await validateUser('test-token', 'invalid-id');

        expect(result).toBe(false);
    });

    test('should return false for 403 error', async () => {
        axios.post.mockRejectedValueOnce({
            response: { status: 403 }
        });

        const result = await validateUser('test-token', '12345');

        expect(result).toBe(false);
    });
});

describe('reopenDM', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should reopen DM successfully when user is valid', async () => {
        const mockChannel = { id: '123', recipients: ['456'] };

        // Mock validateUser response
        axios.post.mockResolvedValueOnce({ data: { id: '123' } });
        // Mock reopenDM response
        axios.post.mockResolvedValueOnce({ data: mockChannel });

        const result = await reopenDM('test-token', '456');

        expect(result).toEqual(mockChannel);
        expect(axios.post).toHaveBeenCalledWith(
            'https://discord.com/api/v9/users/@me/channels',
            { recipients: ['456'] },
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'test-token'
                })
            })
        );
    });

    test('should return null when user is invalid', async () => {
        // Mock validateUser to return false
        axios.post.mockRejectedValueOnce({
            response: { status: 404 }
        });

        const result = await reopenDM('test-token', 'invalid-user');

        expect(result).toBeNull();
        expect(axios.post).toHaveBeenCalledTimes(1);
    });
});

describe('closeDM', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should close DM successfully', async () => {
        axios.delete.mockResolvedValueOnce({ data: {} });

        await closeDM('test-token', '123');

        expect(axios.delete).toHaveBeenCalledWith(
            'https://discord.com/api/v9/channels/123',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'test-token'
                })
            })
        );
    });

    test('should retry on failure', async () => {
        axios.delete
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ data: {} });

        await closeDM('test-token', '123');

        expect(axios.delete).toHaveBeenCalledTimes(2);
    });
});
