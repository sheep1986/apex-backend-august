import { EmailService } from './email-service';

export interface NotificationData {
  type: 'success' | 'error' | 'warning' | 'info' | 'system' | 'campaign' | 'billing';
  title: string;
  message: string;
  category: 'system' | 'calls' | 'campaigns' | 'performance' | 'billing' | 'security';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  source: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
}

export interface UserNotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  categories: {
    calls: boolean;
    performance: boolean;
    system: boolean;
    billing: boolean;
    campaigns: boolean;
    security: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferences?: UserNotificationPreferences;
  timezone?: string;
}

export class NotificationService {
  // Send notification to a single user
  static async sendNotification(user: User, notification: NotificationData): Promise<{
    success: boolean;
    channels: {
      inApp: boolean;
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
    errors?: string[];
  }> {
    const results = {
      success: true,
      channels: {
        inApp: true, // Always true for in-app notifications
        email: false,
        push: false,
        sms: false
      },
      errors: [] as string[]
    };

    try {
      // Check user preferences
      const preferences = user.preferences || this.getDefaultPreferences();
      
      // Check if user wants this category of notifications
      if (!preferences.categories[notification.category]) {
        console.log(`🔇 User ${user.email} has disabled ${notification.category} notifications`);
        return results;
      }

      // Check quiet hours
      if (this.isInQuietHours(preferences.quietHours, user.timezone)) {
        console.log(`🌙 Notification skipped - user ${user.email} is in quiet hours`);
        return results;
      }

      // Send email notification if enabled
      if (preferences.emailNotifications) {
        try {
          await EmailService.sendNotificationEmail(
            user.email,
            `${user.firstName} ${user.lastName}`,
            {
              ...notification,
              timestamp: new Date()
            }
          );
          results.channels.email = true;
          console.log(`📧 Email notification sent to ${user.email}`);
        } catch (error) {
          results.errors.push(`Email failed: ${error.message}`);
          console.error(`❌ Email notification failed for ${user.email}:`, error);
        }
      }

      // TODO: Implement push notifications
      if (preferences.pushNotifications) {
        // Placeholder for push notification implementation
        console.log(`🔔 Push notification would be sent to ${user.email}`);
        results.channels.push = true;
      }

      // TODO: Implement SMS notifications
      if (preferences.smsNotifications) {
        // Placeholder for SMS notification implementation
        console.log(`📱 SMS notification would be sent to ${user.email}`);
        results.channels.sms = true;
      }

      return results;

    } catch (error) {
      console.error('❌ Error in notification service:', error);
      results.success = false;
      results.errors.push(`Service error: ${error.message}`);
      return results;
    }
  }

  // Send notification to multiple users
  static async sendBulkNotification(users: User[], notification: NotificationData): Promise<{
    success: boolean;
    totalUsers: number;
    results: Array<{
      userId: string;
      email: string;
      success: boolean;
      channels: {
        inApp: boolean;
        email?: boolean;
        push?: boolean;
        sms?: boolean;
      };
      errors?: string[];
    }>;
  }> {
    const results = {
      success: true,
      totalUsers: users.length,
      results: [] as any[]
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
      } catch (error) {
        results.results.push({
          userId: user.id,
          email: user.email,
          success: false,
          channels: { inApp: false },
          errors: [`Failed to process: ${error.message}`]
        });
      }
    }

    // Check if any notifications failed
    const failedCount = results.results.filter(r => !r.success).length;
    if (failedCount > 0) {
      results.success = false;
      console.warn(`⚠️ ${failedCount}/${users.length} notifications failed`);
    }

    return results;
  }

  // Send system-wide notification
  static async sendSystemNotification(
    notification: Omit<NotificationData, 'source'>,
    userFilter?: (user: User) => boolean
  ): Promise<any> {
    try {
      // TODO: Get all users from database
      // For now, return a placeholder response
      console.log('🔔 System notification would be sent:', notification.title);
      
      return {
        success: true,
        message: 'System notification queued for delivery',
        notification: {
          ...notification,
          source: 'system'
        }
      };
    } catch (error) {
      console.error('❌ Error sending system notification:', error);
      throw error;
    }
  }

  // Helper method to check if current time is in quiet hours
  private static isInQuietHours(quietHours: UserNotificationPreferences['quietHours'], timezone?: string): boolean {
    if (!quietHours.enabled) return false;

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

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime <= endTime;
      } else {
        return currentTime >= startTime && currentTime <= endTime;
      }
    } catch (error) {
      console.error('❌ Error checking quiet hours:', error);
      return false;
    }
  }

  // Get default notification preferences
  private static getDefaultPreferences(): UserNotificationPreferences {
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

  // Create notification helpers for common scenarios
  static createCampaignNotification(title: string, message: string, options?: Partial<NotificationData>) {
    return {
      type: 'campaign' as const,
      title,
      message,
      category: 'campaigns' as const,
      priority: 'medium' as const,
      source: 'campaign-manager',
      ...options
    };
  }

  static createSystemNotification(title: string, message: string, options?: Partial<NotificationData>) {
    return {
      type: 'system' as const,
      title,
      message,
      category: 'system' as const,
      priority: 'medium' as const,
      source: 'system',
      ...options
    };
  }

  static createBillingNotification(title: string, message: string, options?: Partial<NotificationData>) {
    return {
      type: 'billing' as const,
      title,
      message,
      category: 'billing' as const,
      priority: 'high' as const,
      source: 'billing',
      ...options
    };
  }

  static createErrorNotification(title: string, message: string, options?: Partial<NotificationData>) {
    return {
      type: 'error' as const,
      title,
      message,
      category: 'system' as const,
      priority: 'high' as const,
      source: 'error-handler',
      ...options
    };
  }
}