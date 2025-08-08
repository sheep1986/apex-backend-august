require('dotenv').config();
const { Resend } = require('resend');

async function testEmailService() {
  console.log('🧪 Testing Resend email service...\n');

  // Check if API key is loaded
  const apiKey = process.env.RESEND_API_KEY;
  console.log('1️⃣ Checking API key...');
  if (!apiKey) {
    console.error('❌ RESEND_API_KEY not found in environment');
    return;
  }
  console.log('✅ RESEND_API_KEY loaded:', apiKey.substring(0, 10) + '...\n');

  // Initialize Resend
  const resend = new Resend(apiKey);

  // Test sending a simple email
  console.log('2️⃣ Testing email sending...');
  try {
    const { data, error } = await resend.emails.send({
      from: 'Apex AI <onboarding@resend.dev>', // Use Resend's default sender for testing
      to: 'seanwentz99@gmail.com',
      subject: 'Test Email from Apex Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Test Email</h2>
          <p>This is a test email to verify that Resend is working correctly with your Apex platform.</p>
          <p>If you received this email, the email service is configured properly!</p>
          <p>Time sent: ${new Date().toISOString()}</p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Email sending failed:', error);
      return;
    }

    console.log('✅ Test email sent successfully!');
    console.log('📧 Email ID:', data.id);
    console.log('📬 Check seanwentz99@gmail.com for the test email');
    
  } catch (error) {
    console.error('❌ Error sending test email:', error);
  }
}

testEmailService();