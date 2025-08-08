"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stable_vapi_data_service_1 = require("../services/stable-vapi-data-service");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const { page = '1', limit = '50', search = '', type = 'all', outcome = 'all', sentiment = 'all', agent = 'all', campaign = 'all', dateRange = 'all', sortBy = 'startTime', sortOrder = 'desc' } = req.query;
        const mockCalls = [
            {
                id: 'call-1',
                type: 'outbound',
                contact: {
                    name: 'John Smith',
                    phone: '+1234567890',
                    company: 'ABC Corp'
                },
                agent: {
                    name: 'AI Assistant',
                    type: 'ai'
                },
                campaign: {
                    name: 'Summer Campaign',
                    id: 'campaign-1'
                },
                startTime: new Date(Date.now() - 3600000).toISOString(),
                duration: 180,
                outcome: 'connected',
                sentiment: 'positive',
                cost: 0.25,
                recording: 'recording-url',
                transcript: 'Hello, this is a test call...',
                status: 'completed'
            },
            {
                id: 'call-2',
                type: 'outbound',
                contact: {
                    name: 'Jane Doe',
                    phone: '+1234567891',
                    company: 'XYZ Inc'
                },
                agent: {
                    name: 'AI Assistant',
                    type: 'ai'
                },
                campaign: {
                    name: 'Summer Campaign',
                    id: 'campaign-1'
                },
                startTime: new Date(Date.now() - 7200000).toISOString(),
                duration: 120,
                outcome: 'voicemail',
                sentiment: 'neutral',
                cost: 0.15,
                status: 'completed'
            }
        ];
        const mockMetrics = {
            totalCalls: mockCalls.length,
            connectedCalls: mockCalls.filter(c => c.outcome === 'connected').length,
            totalDuration: mockCalls.reduce((sum, call) => sum + call.duration, 0),
            totalCost: mockCalls.reduce((sum, call) => sum + call.cost, 0),
            averageDuration: mockCalls.reduce((sum, call) => sum + call.duration, 0) / mockCalls.length,
            connectionRate: (mockCalls.filter(c => c.outcome === 'connected').length / mockCalls.length) * 100,
            positiveRate: (mockCalls.filter(c => c.sentiment === 'positive').length / mockCalls.length) * 100
        };
        res.json({
            success: true,
            calls: mockCalls,
            metrics: mockMetrics,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: mockCalls.length,
                totalPages: 1
            }
        });
    }
    catch (error) {
        console.error('Error fetching calls:', error);
        res.status(500).json({
            error: 'Failed to fetch calls'
        });
    }
});
router.get('/metrics', async (req, res) => {
    try {
        const mockMetrics = {
            totalCalls: 150,
            connectedCalls: 120,
            totalDuration: 18000,
            totalCost: 45.50,
            averageDuration: 120,
            connectionRate: 80,
            positiveRate: 65
        };
        res.json(mockMetrics);
    }
    catch (error) {
        console.error('Error fetching call metrics:', error);
        res.status(500).json({
            error: 'Failed to fetch call metrics'
        });
    }
});
router.get('/user/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                error: 'Valid email address required'
            });
        }
        const calls = await stable_vapi_data_service_1.StableVapiDataService.getUserCalls(email);
        res.json({
            success: true,
            data: calls
        });
    }
    catch (error) {
        console.error('Error fetching user calls:', error);
        res.status(500).json({
            error: 'Failed to fetch user calls'
        });
    }
});
router.get('/stats/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                error: 'Valid email address required'
            });
        }
        const stats = await stable_vapi_data_service_1.StableVapiDataService.getUserCallStats(email);
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Error fetching user call stats:', error);
        res.status(500).json({
            error: 'Failed to fetch user call stats'
        });
    }
});
exports.default = router;
