exports.handler = async (event, context) => {
    // Simple health check for testing
    if (event.path.includes('/health') || event.path.endsWith('/api')) {
          return {
                  statusCode: 200,
                  headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                  },
                  body: JSON.stringify({
                            status: 'ok',
                            message: 'Apex AI Backend API is running on Netlify',
                            timestamp: new Date().toISOString()
                  })
          };
    }

    // Handle other routes
    return {
          statusCode: 404,
          headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
                  error: 'Not found',
                  path: event.path
          })
    };
};
