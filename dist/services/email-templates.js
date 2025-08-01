"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvitationEmailTemplate = getInvitationEmailTemplate;
exports.getWelcomeEmailTemplate = getWelcomeEmailTemplate;
exports.getPasswordResetEmailTemplate = getPasswordResetEmailTemplate;
function getInvitationEmailTemplate(data) {
    const { recipientName, organizationName, inviterName, role, invitationLink, expiresAt } = data;
    const formattedRole = role
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    const expirationDate = new Date(expiresAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
    const subject = `You've been invited to join ${organizationName} on Apex AI`;
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to ${organizationName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 0 20px !important; }
      .content { padding: 30px 20px !important; }
      .button { width: 100% !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table class="container" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #111111; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Apex AI</h1>
              <p style="margin: 10px 0 0 0; color: #d1fae5; font-size: 16px;">AI-Powered Sales Automation Platform</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 50px 40px;">
              <h2 style="margin: 0 0 10px 0; color: #ffffff; font-size: 24px; font-weight: 600;">Hello ${recipientName},</h2>
              
              <p style="margin: 20px 0; color: #d1d5db; font-size: 16px; line-height: 1.6;">
                ${inviterName} has invited you to join <strong style="color: #10b981;">${organizationName}</strong> as a <strong style="color: #10b981;">${formattedRole}</strong> on the Apex AI platform.
              </p>
              
              <div style="background-color: #1f2937; border-radius: 8px; padding: 25px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px 0; color: #10b981; font-size: 18px; font-weight: 600;">What is Apex AI?</h3>
                <ul style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 14px; line-height: 1.8;">
                  <li>Automated AI-powered outbound calling campaigns</li>
                  <li>Intelligent lead qualification and CRM integration</li>
                  <li>Real-time analytics and campaign optimization</li>
                  <li>Advanced retry logic and timezone management</li>
                </ul>
              </div>
              
              <p style="margin: 20px 0; color: #d1d5db; font-size: 16px; line-height: 1.6;">
                Click the button below to accept your invitation and set up your account:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 35px 0;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px;">
                    <a href="${invitationLink}" target="_blank" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: 0.5px;">
                      Accept Invitation & Set Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0; color: #d1d5db; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:<br>
                <a href="${invitationLink}" style="color: #10b981; word-break: break-all; text-decoration: none;">
                  ${invitationLink}
                </a>
              </p>
              
              <div style="background-color: #374151; border-radius: 6px; padding: 15px; margin: 25px 0;">
                <p style="margin: 0; color: #fbbf24; font-size: 13px;">
                  <strong>⚠️ Important:</strong> This invitation will expire on ${expirationDate}
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #374151; margin: 40px 0;">
              
              <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 13px; line-height: 1.5;">
                If you didn't expect this invitation or have any questions, please contact your administrator or reply to this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #1f2937; padding: 30px 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 14px;">
                © ${new Date().getFullYear()} Apex AI. All rights reserved.
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                Empowering sales teams with AI-driven automation
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
    const text = `
You've been invited to join ${organizationName} on Apex AI

Hello ${recipientName},

${inviterName} has invited you to join ${organizationName} as a ${formattedRole} on the Apex AI platform.

What is Apex AI?
- Automated AI-powered outbound calling campaigns
- Intelligent lead qualification and CRM integration
- Real-time analytics and campaign optimization
- Advanced retry logic and timezone management

To accept this invitation and set up your account, please visit:
${invitationLink}

IMPORTANT: This invitation will expire on ${expirationDate}

If you didn't expect this invitation or have any questions, please contact your administrator.

© ${new Date().getFullYear()} Apex AI. All rights reserved.
Empowering sales teams with AI-driven automation
`;
    return { subject, html, text };
}
function getWelcomeEmailTemplate(data) {
    const { userName, organizationName, loginUrl } = data;
    const subject = `Welcome to ${organizationName} on Apex AI!`;
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Apex AI</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 0 20px !important; }
      .content { padding: 30px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table class="container" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #111111; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Welcome to Apex AI!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 50px 40px;">
              <h2 style="margin: 0 0 20px 0; color: #ffffff; font-size: 24px;">Hi ${userName},</h2>
              
              <p style="margin: 20px 0; color: #d1d5db; font-size: 16px; line-height: 1.6;">
                Your account has been successfully created! You're now part of <strong style="color: #10b981;">${organizationName}</strong> on Apex AI.
              </p>
              
              <div style="background-color: #1f2937; border-radius: 8px; padding: 25px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px 0; color: #10b981; font-size: 18px;">Quick Start Guide:</h3>
                <ol style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 14px; line-height: 1.8;">
                  <li>Log in to your dashboard</li>
                  <li>Set up your first AI assistant</li>
                  <li>Create a campaign and upload leads</li>
                  <li>Launch your automated calling campaign</li>
                </ol>
              </div>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 35px 0;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px;">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 14px;">
                Need help? Check out our documentation or contact support.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #1f2937; padding: 30px 40px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 14px;">
                © ${new Date().getFullYear()} Apex AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
    const text = `
Welcome to Apex AI!

Hi ${userName},

Your account has been successfully created! You're now part of ${organizationName} on Apex AI.

Quick Start Guide:
1. Log in to your dashboard
2. Set up your first AI assistant
3. Create a campaign and upload leads
4. Launch your automated calling campaign

Go to Dashboard: ${loginUrl}

Need help? Check out our documentation or contact support.

© ${new Date().getFullYear()} Apex AI. All rights reserved.
`;
    return { subject, html, text };
}
function getPasswordResetEmailTemplate(data) {
    const { userName, resetLink, expiresInHours } = data;
    const subject = 'Reset your Apex AI password';
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #111111; border-radius: 8px;">
          <tr>
            <td style="padding: 50px 40px;">
              <h2 style="margin: 0 0 20px 0; color: #ffffff; font-size: 24px;">Password Reset Request</h2>
              
              <p style="margin: 20px 0; color: #d1d5db; font-size: 16px;">
                Hi ${userName},<br><br>
                We received a request to reset your password. Click the button below to create a new password:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 35px 0;">
                <tr>
                  <td align="center" style="background-color: #10b981; border-radius: 8px;">
                    <a href="${resetLink}" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0; color: #9ca3af; font-size: 14px;">
                This link will expire in ${expiresInHours} hours. If you didn't request this reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
    const text = `
Password Reset Request

Hi ${userName},

We received a request to reset your password. Visit the link below to create a new password:

${resetLink}

This link will expire in ${expiresInHours} hours. If you didn't request this reset, you can safely ignore this email.

© ${new Date().getFullYear()} Apex AI. All rights reserved.
`;
    return { subject, html, text };
}
