import { Resend } from 'resend';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
        from: process.env.EMAIL_FROM || 'Apex Platform <noreply@apex.com>',
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

  static async sendVerificationCode(email: string, code: string) {
    // If no email service configured, log and return
    if (!resend) {
      console.log('📧 Email service not configured. Would send verification code to:', email);
      console.log('   Code:', code);
      return { success: true };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Apex Platform <noreply@apex.com>',
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
        from: process.env.EMAIL_FROM || 'Apex Platform <noreply@apex.com>',
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
} 