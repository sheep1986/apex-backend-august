"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const email_service_1 = require("./email-service");
class NotificationService {
    static async sendNotification(user, notification) {
        const results = {
            success: true,
            channels: {
                inApp: true,
                email: false,
                push: false,
                sms: false
            },
            errors: []
        };
        try {
            const preferences = user.preferences || this.getDefaultPreferences();
            if (!preferences.categories[notification.category]) {
                console.log(`🔇 User ${user.email} has disabled ${notification.category} notifications`);
                return results;
            }
            if (this.isInQuietHours(preferences.quietHours, user.timezone)) {
                console.log(`🌙 Notification skipped - user ${user.email} is in quiet hours`);
                return results;
            }
            if (preferences.emailNotifications) {
                try {
                    await email_service_1.EmailService.sendNotificationEmail(user.email, `${user.firstName} ${user.lastName}`, {
                        ...notification,
                        timestamp: new Date()
                    });
                    results.channels.email = true;
                    console.log(`📧 Email notification sent to ${user.email}`);
                }
                catch (error) {
                    results.errors.push(`Email failed: ${error.message}`);
                    console.error(`❌ Email notification failed for ${user.email}:`, error);
                }
            }
            if (preferences.pushNotifications) {
                console.log(`🔔 Push notification would be sent to ${user.email}`);
                results.channels.push = true;
            }
            if (preferences.smsNotifications) {
                console.log(`📱 SMS notification would be sent to ${user.email}`);
                results.channels.sms = true;
            }
            return results;
        }
        catch (error) {
            console.error('❌ Error in notification service:', error);
            results.success = false;
            results.errors.push(`Service error: ${error.message}`);
            return results;
        }
    }
    static async sendBulkNotification(users, notification) {
        const results = {
            success: true,
            totalUsers: users.length,
            results: []
        };
        for (const user of users) {
            try {
                const userResult = await this.sendNotification(user, notification);
                results.results.push({
                    userId: user.id,
                    email: user.email,
                    success: userResult.success,
                    channels: userResult.channels,
                    errors: userResult.errors
                });
            }
            catch (error) {
                results.results.push({
                    userId: user.id,
                    email: user.email,
                    success: false,
                    channels: { inApp: false },
                    errors: [`Failed to process: ${error.message}`]
                });
            }
        }
        const failedCount = results.results.filter(r => !r.success).length;
        if (failedCount > 0) {
            results.success = false;
            console.warn(`⚠️ ${failedCount}/${users.length} notifications failed`);
        }
        return results;
    }
    static async sendSystemNotification(notification, userFilter) {
        try {
            console.log('🔔 System notification would be sent:', notification.title);
            return {
                success: true,
                message: 'System notification queued for delivery',
                notification: {
                    ...notification,
                    source: 'system'
                }
            };
        }
        catch (error) {
            console.error('❌ Error sending system notification:', error);
            throw error;
        }
    }
    static isInQuietHours(quietHours, timezone) {
        if (!quietHours.enabled)
            return false;
        try {
            const now = new Date();
            const userTime = timezone ?
                new Date(now.toLocaleString("en-US", { timeZone: timezone })) :
                now;
            const currentTime = userTime.getHours() * 60 + userTime.getMinutes();
            const [startHour, startMin] = quietHours.start.split(':').map(Number);
            const [endHour, endMin] = quietHours.end.split(':').map(Number);
            const startTime = startHour * 60 + startMin;
            const endTime = endHour * 60 + endMin;
            if (startTime > endTime) {
                return currentTime >= startTime || currentTime <= endTime;
            }
            else {
                return currentTime >= startTime && currentTime <= endTime;
            }
        }
        catch (error) {
            console.error('❌ Error checking quiet hours:', error);
            return false;
        }
    }
    static getDefaultPreferences() {
        return {
            emailNotifications: true,
            pushNotifications: true,
            smsNotifications: false,
            categories: {
                calls: true,
                performance: true,
                system: true,
                billing: true,
                campaigns: true,
                security: true,
            },
            quietHours: {
                enabled: false,
                start: '22:00',
                end: '08:00',
            },
        };
    }
    static createCampaignNotification(title, message, options) {
        return {
            type: 'campaign',
            title,
            message,
            category: 'campaigns',
            priority: 'medium',
            source: 'campaign-manager',
            ...options
        };
    }
    static createSystemNotification(title, message, options) {
        return {
            type: 'system',
            title,
            message,
            category: 'system',
            priority: 'medium',
            source: 'system',
            ...options
        };
    }
    static createBillingNotification(title, message, options) {
        return {
            type: 'billing',
            title,
            message,
            category: 'billing',
            priority: 'high',
            source: 'billing',
            ...options
        };
    }
    static createErrorNotification(title, message, options) {
        return {
            type: 'error',
            title,
            message,
            category: 'system',
            priority: 'high',
            source: 'error-handler',
            ...options
        };
    }
}
exports.NotificationService = NotificationService;
