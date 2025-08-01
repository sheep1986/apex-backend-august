import { Router, Request, Response } from 'express';

const router = Router();

// Debug endpoint - no authentication required
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Backend is reachable from frontend',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    userAgent: req.get('User-Agent')
  });
});

// Debug VAPI data endpoint - no authentication required
router.get('/vapi-test', async (req: Request, res: Response) => {
  try {
    // Hardcode Test Corp organization for testing
    const testCorpOrgId = '0f88ab8a-b760-4c2a-b289-79b54d7201cf';
    
    // Import VAPIIntegrationService dynamically
    const { VAPIIntegrationService } = await import('../services/vapi-integration-service');
    
    // Get VAPI service
    const vapiService = await VAPIIntegrationService.forOrganization(testCorpOrgId);
    
    if (!vapiService) {
      return res.json({
        success: false,
        message: 'No VAPI service available for Test Corp',
        organizationId: testCorpOrgId
      });
    }
    
    // Try to get assistants and phone numbers
    const [assistants, phoneNumbers] = await Promise.all([
      vapiService.listAssistants().catch(err => ({ error: err.message })),
      vapiService.getPhoneNumbers().catch(err => ({ error: err.message }))
    ]);
    
    res.json({
      success: true,
      message: 'VAPI test completed',
      organizationId: testCorpOrgId,
      data: {
        assistants: Array.isArray(assistants) ? assistants : assistants,
        phoneNumbers: Array.isArray(phoneNumbers) ? phoneNumbers : phoneNumbers,
        assistantCount: Array.isArray(assistants) ? assistants.length : 0,
        phoneNumberCount: Array.isArray(phoneNumbers) ? phoneNumbers.length : 0
      }
    });
    
  } catch (error) {
    console.error('Debug VAPI test error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

export default router;