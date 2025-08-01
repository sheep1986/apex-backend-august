import { Router, Request, Response } from 'express';
import { VAPIIntegrationService } from '../services/vapi-integration-service';

const router = Router();

// Debug endpoint - no authentication required - hardcoded to Emerald Green Energy
router.get('/emerald-green-test', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Debug: Testing VAPI for Emerald Green Energy (no auth)');
    
    // Hardcode Emerald Green Energy organization ID
    const emeraldGreenOrgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    
    // Get VAPI service
    const vapiService = await VAPIIntegrationService.forOrganization(emeraldGreenOrgId);
    
    if (!vapiService) {
      return res.json({
        success: false,
        message: 'No VAPI service available for Emerald Green Energy',
        organizationId: emeraldGreenOrgId
      });
    }
    
    console.log('✅ VAPI service created for Emerald Green Energy');
    
    // Try to get assistants and phone numbers
    const [assistantsResult, phoneNumbersResult] = await Promise.all([
      vapiService.listAssistants().then(data => ({ success: true, data })).catch(err => ({ success: false, error: err.message })),
      vapiService.getPhoneNumbers().then(data => ({ success: true, data })).catch(err => ({ success: false, error: err.message }))
    ]);
    
    console.log('📊 Results:');
    console.log('   - Assistants:', assistantsResult.success ? `${assistantsResult.data.length} found` : `Error: ${assistantsResult.error}`);
    console.log('   - Phone Numbers:', phoneNumbersResult.success ? `${phoneNumbersResult.data.length} found` : `Error: ${phoneNumbersResult.error}`);
    
    res.json({
      success: true,
      message: 'VAPI test completed for Emerald Green Energy',
      organizationId: emeraldGreenOrgId,
      organizationName: 'Emerald Green Energy Ltd',
      results: {
        assistants: assistantsResult,
        phoneNumbers: phoneNumbersResult
      },
      summary: {
        assistantCount: assistantsResult.success ? assistantsResult.data.length : 0,
        phoneNumberCount: phoneNumbersResult.success ? phoneNumbersResult.data.length : 0,
        assistantsWorking: assistantsResult.success,
        phoneNumbersWorking: phoneNumbersResult.success
      }
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

export default router;