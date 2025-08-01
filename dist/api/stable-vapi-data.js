"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stable_vapi_data_service_1 = require("../services/stable-vapi-data-service");
const router = (0, express_1.Router)();
router.get('/user/:email/stats', async (req, res) => {
    try {
        const { email } = req.params;
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                error: 'Valid email address required'
            });
        }
        const stats = await stable_vapi_data_service_1.StableVapiDataService.getUserCallStats(email);
        if (!stats) {
            return res.status(404).json({
                error: 'No data found for user',
                email
            });
        }
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ Error getting user stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/user/:email/calls', async (req, res) => {
    try {
        const { email } = req.params;
        const { limit = 10 } = req.query;
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                error: 'Valid email address required'
            });
        }
        const calls = await stable_vapi_data_service_1.StableVapiDataService.getUserRecentCalls(email, parseInt(limit));
        res.json({
            success: true,
            userEmail: email,
            calls,
            total: calls.length
        });
    }
    catch (error) {
        console.error('❌ Error getting user calls:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/calls/:callId', async (req, res) => {
    try {
        const { callId } = req.params;
        const { events, summary, error } = await stable_vapi_data_service_1.StableVapiDataService.getCallEvents(callId);
        if (error) {
            return res.status(404).json({
                error,
                callId
            });
        }
        res.json({
            success: true,
            callId,
            summary,
            events,
            totalEvents: events.length
        });
    }
    catch (error) {
        console.error('❌ Error getting call data:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/search', async (req, res) => {
    try {
        const { q: searchTerm, user_email, limit = 20 } = req.query;
        if (!searchTerm || typeof searchTerm !== 'string') {
            return res.status(400).json({
                error: 'Search term (q) is required'
            });
        }
        const calls = await stable_vapi_data_service_1.StableVapiDataService.searchCallsByTranscript(searchTerm, user_email, parseInt(limit));
        res.json({
            success: true,
            searchTerm,
            userEmail: user_email || 'all',
            calls,
            total: calls.length
        });
    }
    catch (error) {
        console.error('❌ Error searching calls:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/platform/stats', async (req, res) => {
    try {
        const { user_email } = req.query;
        if (user_email !== 'sean@artificialmedia.co.uk') {
            return res.status(403).json({
                error: 'Access denied - platform owner only'
            });
        }
        const stats = await stable_vapi_data_service_1.StableVapiDataService.getPlatformStats();
        res.json({
            success: true,
            platformStats: stats,
            generatedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Error getting platform stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/export/csv', async (req, res) => {
    try {
        const { user_email, start_date, end_date } = req.query;
        const csvContent = await stable_vapi_data_service_1.StableVapiDataService.exportCallsToCSV(user_email, start_date, end_date);
        const filename = `vapi-calls-${user_email || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    }
    catch (error) {
        console.error('❌ Error exporting CSV:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/webhook-data', async (req, res) => {
    try {
        const { user_email, webhook_type, call_status, start_date, end_date, limit = 50, offset = 0 } = req.query;
        const { data, total, error } = await stable_vapi_data_service_1.StableVapiDataService.getWebhookData({
            userEmail: user_email,
            webhookType: webhook_type,
            callStatus: call_status,
            startDate: start_date,
            endDate: end_date,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        if (error) {
            return res.status(500).json({
                error,
                filters: { user_email, webhook_type, call_status, start_date, end_date }
            });
        }
        res.json({
            success: true,
            data,
            total,
            filters: {
                user_email,
                webhook_type,
                call_status,
                start_date,
                end_date
            },
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: (parseInt(offset) + parseInt(limit)) < total
            }
        });
    }
    catch (error) {
        console.error('❌ Error getting webhook data:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'stable-vapi-data-api',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: {
            userStats: '/api/stable-vapi-data/user/:email/stats',
            userCalls: '/api/stable-vapi-data/user/:email/calls',
            callDetails: '/api/stable-vapi-data/calls/:callId',
            search: '/api/stable-vapi-data/search',
            platformStats: '/api/stable-vapi-data/platform/stats',
            exportCSV: '/api/stable-vapi-data/export/csv',
            webhookData: '/api/stable-vapi-data/webhook-data'
        }
    });
});
exports.default = router;
