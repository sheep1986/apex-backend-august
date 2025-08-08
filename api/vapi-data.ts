import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/clerk-auth';
import { VAPIIntegrationService } from '../services/vapi-integration-service';

const router = Router();

// Apply authentication
router.use(authenticateUser);

// GET /api/vapi-data/assistants - Get VAPI assistants for the user's organization
router.get('/assistants', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        assistants: [] 
      });
    }

    console.log('🔍 Fetching VAPI assistants for organization:', organizationId);

    // Get VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      console.log('⚠️ No VAPI service available for organization');
      return res.json({ 
        assistants: [],
        message: 'VAPI integration not configured. Please add your VAPI API key in Organization Settings.',
        requiresConfiguration: true
      });
    }

    // Fetch assistants from VAPI
    const assistants = await vapiService.listAssistants();
    
    console.log(`✅ Retrieved ${assistants.length} assistants from VAPI`);
    
    res.json({ 
      assistants,
      count: assistants.length 
    });

  } catch (error) {
    console.error('❌ Error fetching VAPI assistants:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assistants',
      assistants: [] 
    });
  }
});

// GET /api/vapi-data/phone-numbers - Get VAPI phone numbers for the user's organization
router.get('/phone-numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        phoneNumbers: [] 
      });
    }

    console.log('📱 Fetching VAPI phone numbers for organization:', organizationId);

    // Get VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      console.log('⚠️ No VAPI service available for organization');
      return res.json({ 
        phoneNumbers: [],
        message: 'VAPI integration not configured. Please add your VAPI API key in Organization Settings.',
        requiresConfiguration: true
      });
    }

    // Fetch phone numbers from VAPI
    const phoneNumbers = await vapiService.getPhoneNumbers();
    
    console.log(`✅ Retrieved ${phoneNumbers.length} phone numbers from VAPI`);
    
    res.json({ 
      phoneNumbers,
      count: phoneNumbers.length 
    });

  } catch (error) {
    console.error('❌ Error fetching VAPI phone numbers:', error);
    res.status(500).json({ 
      error: 'Failed to fetch phone numbers',
      phoneNumbers: [] 
    });
  }
});

// GET /api/vapi-data/all - Get all VAPI data (assistants and phone numbers)
router.get('/all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        assistants: [],
        phoneNumbers: [] 
      });
    }

    console.log('🔄 Fetching all VAPI data for organization:', organizationId);

    // Get VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      console.log('⚠️ No VAPI service available for organization');
      return res.json({ 
        assistants: [],
        phoneNumbers: [],
        message: 'VAPI integration not configured' 
      });
    }

    // Fetch both assistants and phone numbers in parallel
    const [assistants, phoneNumbers] = await Promise.all([
      vapiService.listAssistants().catch(() => []),
      vapiService.getPhoneNumbers().catch(() => [])
    ]);
    
    console.log(`✅ Retrieved ${assistants.length} assistants and ${phoneNumbers.length} phone numbers from VAPI`);
    
    res.json({ 
      assistants,
      phoneNumbers,
      assistantCount: assistants.length,
      phoneNumberCount: phoneNumbers.length
    });

  } catch (error) {
    console.error('❌ Error fetching VAPI data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch VAPI data',
      assistants: [],
      phoneNumbers: [] 
    });
  }
});

export default router;