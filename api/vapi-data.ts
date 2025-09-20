import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/clerk-auth';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const router = Router();
router.use(authenticateUser);

// Simple VAPI service class to avoid import issues
class SimpleVAPIService {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async getAssistants() {
    try {
      const response = await axios.get('https://api.vapi.ai/assistant', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('VAPI Error:', error);
      return [];
    }
  }
}

// Get VAPI assistants
router.get('/assistants', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        assistants: [] 
      });
    }

    // Get VAPI key from organization
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key, vapi_api_key')
      .eq('id', organizationId)
      .single();

    const apiKey = org?.vapi_private_key || org?.vapi_api_key;
    
    if (!apiKey) {
      return res.json({ 
        assistants: [],
        message: 'VAPI integration not configured',
        requiresConfiguration: true
      });
    }

    const vapiService = new SimpleVAPIService(apiKey);
    const assistants = await vapiService.getAssistants();
    
    res.json({ 
      assistants,
      count: assistants.length 
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assistants',
      assistants: [] 
    });
  }
});

// Phone numbers endpoint
router.get('/phone-numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        phoneNumbers: [] 
      });
    }

    // Try to get from database first
    const { data: phoneNumbers } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('organization_id', organizationId);
    
    res.json({ 
      phoneNumbers: phoneNumbers || [],
      count: phoneNumbers?.length || 0 
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch phone numbers',
      phoneNumbers: [] 
    });
  }
});

// All data endpoint
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

    res.json({ 
      assistants: [],
      phoneNumbers: [],
      message: 'VAPI integration available' 
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch VAPI data',
      assistants: [],
      phoneNumbers: [] 
    });
  }
});

export default router;
