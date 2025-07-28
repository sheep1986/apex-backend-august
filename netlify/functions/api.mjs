export default async (req, context) => {
  // Simple health check for testing
  if (req.url.includes('/health') || req.url.endsWith('/api')) {
    return new Response(JSON.stringify({ 
      status: 'ok', 
      message: 'Apex AI Backend API is running on Netlify',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // Handle other routes
  return new Response(JSON.stringify({ 
    error: 'Not found',
    path: req.url 
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const config = {
  path: "/api/*"
};