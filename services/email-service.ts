import { Resend } from 'resend';
import { EmailTemplate, getInvitationEmailTemplate, getWelcomeEmailTemplate } from './email-templates';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Notification email templates
interface NotificationEmailData {
  type: 'success' | 'error' | 'warning' | 'info' | 'system' | 'campaign' | 'billing';
  title: string;
  message: string;
  category: 'system' | 'calls' | 'campaigns' | 'performance' | 'billing' | 'security';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  actionUrl?: string;
  actionLabel?: string;
}

export class EmailService {
  static async sendInvitation(email: string, firstName: string, inviteLink: string) {
    // If no email service configured, log and return
    if (!resend) {
      console.log('📧 Email service not configured. Would send invitation to:', email);
      console.log('   Invite link:', inviteLink);
      return { success: true, messageId: 'mock-email-id' };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex AI <onboarding@resend.dev>',
        to: email,
        subject: 'You\'ve been invited to join Apex AI Calling Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Welcome to Apex AI Calling Platform!</h2>
            <p>Hi ${firstName},</p>
            <p>You've been invited to join the Apex support team. Click the link below to set up your account:</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="${inviteLink}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Set Up Account
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This invitation will expire in 7 days.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        `
      });

      if (error) throw error;
      
      console.log('✅ Invitation email sent to:', email);
      return { success: true, messageId: data?.id };
    } catch (error) {
      console.error('❌ Error sending invitation email:', error);
      throw error;
    }
  }

  static async sendInvitationWithTemplate(data: {
    recipientEmail: string;
    recipientName: string;
    organizationName: string;
    inviterName: string;
    role: string;
    invitationToken: string;
    expiresAt: Date;
  }) {
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation?token=${data.invitationToken}`;
    
    const template = getInvitationEmailTemplate({
      recipientName: data.recipientName,
      organizationName: data.organizationName,
      inviterName: data.inviterName,
      role: data.role,
      invitationLink,
      expiresAt: data.expiresAt
    });

    // If no email service configured, log and return
    if (!resend) {
      console.log('📧 Email service not configured. Would send invitation to:', data.recipientEmail);
      console.log('   Subject:', template.subject);
      console.log('   Invite link:', invitationLink);
      console.log('   Preview:', template.text.substring(0, 200) + '...');
      return { success: true, messageId: 'mock-email-id' };
    }

    try {
      const { data: result, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex AI <onboarding@resend.dev>',
        to: data.recipientEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      if (error) throw error;
      
      console.log('✅ Invitation email sent to:', data.recipientEmail);
      return { success: true, messageId: result?.id };
    } catch (error) {
      console.error('❌ Error sending invitation email:', error);
      throw error;
    }
  }

  static async sendWelcomeEmail(data: {
    userEmail: string;
    userName: string;
    organizationName: string;
  }) {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    
    const template = getWelcomeEmailTemplate({
      userName: data.userName,
      organizationName: data.organizationName,
      loginUrl
    });

    // If no email service configured, log and return
    if (!resend) {
      console.log('📧 Email service not configured. Would send welcome email to:', data.userEmail);
      console.log('   Subject:', template.subject);
      console.log('   Preview:', template.text.substring(0, 200) + '...');
      return { success: true };
    }

    try {
      const { data: result, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex AI <noreply@apexai.com>',
        to: data.userEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      if (error) throw error;
      
      console.log('✅ Welcome email sent to:', data.userEmail);
      return { success: true, messageId: result?.id };
    } catch (error) {
      console.error('❌ Error sending welcome email:', error);
      throw error;
    }
  }

  static async sendVerificationCode(email: string, code: string) {
    // If no email service configured, log and return
    if (!resend) {
      console.log('📧 Email service not configured. Would send verification code to:', email);
      console.log('   Code:', code);
      return { success: true };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex AI <onboarding@resend.dev>',
        to: email,
        subject: 'Your Apex Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Verification Code</h2>
            <p>Your verification code is:</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
              <h1 style="margin: 0; letter-spacing: 8px; font-size: 32px; color: #6366f1;">${code}</h1>
            </div>
            <p style="color: #666;">This code will expire in 10 minutes.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        `
      });

      if (error) throw error;
      
      console.log('✅ Verification code sent to:', email);
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending verification code:', error);
      throw error;
    }
  }

  static async sendPasswordReset(email: string, resetLink: string) {
    if (!resend) {
      console.log('📧 Email service not configured. Would send password reset to:', email);
      return { success: true };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex AI <onboarding@resend.dev>',
        to: email,
        subject: 'Reset Your Apex Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Password Reset Request</h2>
            <p>We received a request to reset your password. Click the link below to create a new password:</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="${resetLink}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        `
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending password reset:', error);
      throw error;
    }
  }

  static async sendNotificationEmail(email: string, userName: string, notification: NotificationEmailData) {
    if (!resend) {
      console.log('📧 Email service not configured. Would send notification to:', email);
      console.log('   Notification:', notification.title);
      return { success: true };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex AI <onboarding@resend.dev>',
        to: email,
        subject: this.getNotificationSubject(notification),
        html: this.generateNotificationTemplate(userName, notification)
      });

      if (error) throw error;
      
      console.log('✅ Notification email sent to:', email);
      return { success: true, messageId: data?.id };
    } catch (error) {
      console.error('❌ Error sending notification email:', error);
      throw error;
    }
  }

  static async sendBulkNotificationEmails(recipients: Array<{ email: string; userName: string }>, notification: NotificationEmailData) {
    if (!resend) {
      console.log('📧 Email service not configured. Would send bulk notification to:', recipients.length, 'recipients');
      return { success: true };
    }

    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendNotificationEmail(recipient.email, recipient.userName, notification);
        results.push({ email: recipient.email, success: true, messageId: result.messageId });
      } catch (error) {
        console.error(`❌ Failed to send notification to ${recipient.email}:`, error);
        results.push({ email: recipient.email, success: false, error: error.message });
      }
    }

    return { success: true, results };
  }

  private static getNotificationSubject(notification: NotificationEmailData): string {
    const priorityPrefix = notification.priority === 'urgent' ? '[URGENT] ' : 
                          notification.priority === 'high' ? '[HIGH] ' : '';
    
    return `${priorityPrefix}${notification.title} - Apex Platform`;
  }

  private static getNotificationIcon(type: string): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      system: '🔧',
      campaign: '📞',
      billing: '💳'
    };
    return icons[type] || '📢';
  }

  private static getPriorityColor(priority: string): string {
    const colors = {
      urgent: '#dc2626',   // red-600
      high: '#ea580c',     // orange-600
      medium: '#2563eb',   // blue-600
      low: '#059669'       // emerald-600
    };
    return colors[priority] || '#6b7280';
  }

  private static generateNotificationTemplate(userName: string, notification: NotificationEmailData): string {
    const icon = this.getNotificationIcon(notification.type);
    const priorityColor = this.getPriorityColor(notification.priority);
    const formattedTime = notification.timestamp.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%); padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Apex AI Platform</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Notification Update</p>
        </div>

        <!-- Notification Content -->
        <div style="padding: 32px 24px;">
          <!-- Priority Badge -->
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; background: ${priorityColor}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              ${notification.priority} Priority
            </span>
          </div>

          <!-- Main Content -->
          <div style="background: #f9fafb; border-left: 4px solid ${priorityColor}; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
              <div style="font-size: 24px; line-height: 1;">${icon}</div>
              <div style="flex: 1;">
                <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 18px; font-weight: 600;">${notification.title}</h2>
                <p style="margin: 0; color: #4b5563; font-size: 16px; line-height: 1.5;">${notification.message}</p>
              </div>
            </div>
          </div>

          <!-- Action Button -->
          ${notification.actionUrl ? `
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${notification.actionUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                ${notification.actionLabel || 'View Details'}
              </a>
            </div>
          ` : ''}

          <!-- Metadata -->
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
              <div>
                <strong style="color: #374151;">Category:</strong>
                <span style="color: #6b7280; text-transform: capitalize;">${notification.category}</span>
              </div>
              <div>
                <strong style="color: #374151;">Type:</strong>
                <span style="color: #6b7280; text-transform: capitalize;">${notification.type}</span>
              </div>
              <div style="grid-column: 1 / -1;">
                <strong style="color: #374151;">Time:</strong>
                <span style="color: #6b7280;">${formattedTime}</span>
              </div>
            </div>
          </div>

          <!-- Personal Message -->
          <p style="color: #4b5563; font-size: 16px; margin-bottom: 8px;">Hi ${userName},</p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            This notification was sent because you have email notifications enabled for ${notification.category} updates. 
            You can manage your notification preferences in your account settings.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings" style="color: #2563eb; text-decoration: none;">Manage Notifications</a> •
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" style="color: #2563eb; text-decoration: none;">Dashboard</a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} Apex AI Platform. All rights reserved.
          </p>
        </div>
      </div>
    `;
  }
} 