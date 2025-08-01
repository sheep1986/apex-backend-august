import express from 'express';
import { EmailService } from '../services/email-service';

const router = express.Router();

// Send notification email to a single user
router.post('/send', async (req, res) => {
  try {
    const { email, userName, notification } = req.body;
    
    if (!email || !userName || !notification) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, userName, notification'
      });
    }

    // Validate notification object
    const requiredFields = ['type', 'title', 'message', 'category', 'priority', 'timestamp'];
    for (const field of requiredFields) {
      if (!notification[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing notification field: ${field}`
        });
      }
    }

    const result = await EmailService.sendNotificationEmail(email, userName, {
      ...notification,
      timestamp: new Date(notification.timestamp)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error sending notification email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification email',
      details: error.message
    });
  }
});

// Send notification email to multiple users
router.post('/send-bulk', async (req, res) => {
  try {
    const { recipients, notification } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || !notification) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipients (array), notification'
      });
    }

    // Validate recipients
    for (const recipient of recipients) {
      if (!recipient.email || !recipient.userName) {
        return res.status(400).json({
          success: false,
          error: 'Each recipient must have email and userName'
        });
      }
    }

    // Validate notification object
    const requiredFields = ['type', 'title', 'message', 'category', 'priority', 'timestamp'];
    for (const field of requiredFields) {
      if (!notification[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing notification field: ${field}`
        });
      }
    }

    const result = await EmailService.sendBulkNotificationEmails(recipients, {
      ...notification,
      timestamp: new Date(notification.timestamp)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error sending bulk notification emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send bulk notification emails',
      details: error.message
    });
  }
});

// Test notification email endpoint
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
      type: 'info' as const,
      title: 'Test Notification Email',
      message: 'This is a test notification to verify your email notification settings are working correctly.',
      category: 'system' as const,
      priority: 'low' as const,
      timestamp: new Date(),
      actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings`,
      actionLabel: 'View Settings'
    };

    const result = await EmailService.sendNotificationEmail(email, userName, testNotification);

    res.json({
      success: true,
      message: 'Test notification email sent successfully',
      data: result
    });

  } catch (error) {
    console.error('❌ Error sending test notification email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification email',
      details: error.message
    });
  }
});

// Check email service status
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

export default router;