"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const email_service_1 = require("../services/email-service");
const router = express_1.default.Router();
router.post('/send', async (req, res) => {
    try {
        const { email, userName, notification } = req.body;
        if (!email || !userName || !notification) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, userName, notification'
            });
        }
        const requiredFields = ['type', 'title', 'message', 'category', 'priority', 'timestamp'];
        for (const field of requiredFields) {
            if (!notification[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing notification field: ${field}`
                });
            }
        }
        const result = await email_service_1.EmailService.sendNotificationEmail(email, userName, {
            ...notification,
            timestamp: new Date(notification.timestamp)
        });
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('❌ Error sending notification email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send notification email',
            details: error.message
        });
    }
});
router.post('/send-bulk', async (req, res) => {
    try {
        const { recipients, notification } = req.body;
        if (!recipients || !Array.isArray(recipients) || !notification) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: recipients (array), notification'
            });
        }
        for (const recipient of recipients) {
            if (!recipient.email || !recipient.userName) {
                return res.status(400).json({
                    success: false,
                    error: 'Each recipient must have email and userName'
                });
            }
        }
        const requiredFields = ['type', 'title', 'message', 'category', 'priority', 'timestamp'];
        for (const field of requiredFields) {
            if (!notification[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing notification field: ${field}`
                });
            }
        }
        const result = await email_service_1.EmailService.sendBulkNotificationEmails(recipients, {
            ...notification,
            timestamp: new Date(notification.timestamp)
        });
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('❌ Error sending bulk notification emails:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send bulk notification emails',
            details: error.message
        });
    }
});
router.post('/test', async (req, res) => {
    try {
        const { email, userName } = req.body;
        if (!email || !userName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, userName'
            });
        }
        const testNotification = {
            type: 'info',
            title: 'Test Notification Email',
            message: 'This is a test notification to verify your email notification settings are working correctly.',
            category: 'system',
            priority: 'low',
            timestamp: new Date(),
            actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings`,
            actionLabel: 'View Settings'
        };
        const result = await email_service_1.EmailService.sendNotificationEmail(email, userName, testNotification);
        res.json({
            success: true,
            message: 'Test notification email sent successfully',
            data: result
        });
    }
    catch (error) {
        console.error('❌ Error sending test notification email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send test notification email',
            details: error.message
        });
    }
});
router.get('/status', (req, res) => {
    const isConfigured = !!process.env.RESEND_API_KEY;
    res.json({
        success: true,
        data: {
            emailServiceConfigured: isConfigured,
            provider: 'Resend',
            fromAddress: process.env.EMAIL_FROM || 'Apex Platform <noreply@apex.com>',
            status: isConfigured ? 'ready' : 'not_configured'
        }
    });
});
exports.default = router;
