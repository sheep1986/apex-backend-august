// Quick utility to get your Clerk User ID
// Run this after you've set up Clerk and logged in

const jwt = require('jsonwebtoken');

console.log('🔍 Clerk User ID Helper');
console.log('========================');
console.log('');

// If you have a Clerk JWT token, you can decode it here
function getClerkUserIdFromToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.sub) {
      console.log('✅ Found Clerk User ID:', decoded.sub);
      return decoded.sub;
    } else {
      console.log('❌ No user ID found in token');
      return null;
    }
  } catch (error) {
    console.log('❌ Error decoding token:', error.message);
    return null;
  }
}

// Instructions
console.log('📝 To get your Clerk User ID:');
console.log('');
console.log('1. Set up Clerk authentication in your frontend');
console.log('2. Log in to your app');
console.log('3. Open browser dev tools → Application → Local Storage');
console.log('4. Look for a key containing "clerk" or "auth"');
console.log('5. Copy the JWT token value');
console.log('6. Run: node get-clerk-user-id.js <your-jwt-token>');
console.log('');

// If token provided as argument
const token = process.argv[2];
if (token) {
  console.log('🔄 Decoding provided token...');
  const userId = getClerkUserIdFromToken(token);
  
  if (userId) {
    console.log('');
    console.log('🎯 COPY THIS USER ID:');
    console.log('====================');
    console.log(userId);
    console.log('====================');
    console.log('');
    console.log('📋 Update your setup-database.sql file:');
    console.log(`Replace 'demo_user_id_replace_me' with '${userId}'`);
  }
} else {
  console.log('💡 Alternative: Your Clerk User ID typically looks like:');
  console.log('   user_2ABC123DEF456 (starts with "user_")');
  console.log('');
  console.log('🔧 Quick setup for testing:');
  console.log('   You can use "demo_user_test" as a placeholder for now');
  console.log('   and update it later with your real Clerk User ID');
}

console.log('');
console.log('🚀 Ready to run your database setup!'); 