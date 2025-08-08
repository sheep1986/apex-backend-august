import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/clerk-auth';
import supabase from '../services/supabase-client';
import axios from 'axios';

const router = Router();

/**
 * Enhanced campaign endpoint that includes phone number details
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get campaign from database
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get organization's VAPI credentials
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key, settings')
      .eq('id', organizationId)
      .single();

    const vapiApiKey = org?.vapi_private_key || org?.settings?.vapi?.privateKey;
    
    // Get phone numbers from VAPI if we have credentials
    let phoneNumbers = [];
    if (vapiApiKey && campaign.phone_number_id) {
      try {
        const response = await axios.get('https://api.vapi.ai/phone-number', {
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        const allNumbers = response.data;
        // Find the specific phone number for this campaign
        const campaignNumber = allNumbers.find((n: any) => n.id === campaign.phone_number_id);
        if (campaignNumber) {
          phoneNumbers = [{
            id: campaignNumber.id,
            number: campaignNumber.number,
            name: campaignNumber.name || 'Primary',
            provider: campaignNumber.provider
          }];
        }
      } catch (error) {
        console.error('Error fetching VAPI phone numbers:', error);
      }
    }

    // Get assistant info similarly
    let assistant = null;
    if (vapiApiKey && campaign.assistant_id) {
      try {
        const response = await axios.get('https://api.vapi.ai/assistant', {
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        const allAssistants = response.data;
        assistant = allAssistants.find((a: any) => a.id === campaign.assistant_id);
      } catch (error) {
        console.error('Error fetching VAPI assistants:', error);
      }
    }

    // Return enhanced campaign data
    const enhancedCampaign = {
      ...campaign,
      phoneNumbers: phoneNumbers.map(n => n.number), // Frontend expects array of strings
      phoneNumberDetails: phoneNumbers, // Full details
      assistantName: assistant?.name || 'AI Assistant',
      assistantDetails: assistant
    };

    res.json({ campaign: enhancedCampaign });
  } catch (error) {
    console.error('Error fetching campaign with phone:', error);
    res.status(500).json({ error: 'Failed to fetch campaign details' });
  }
});

export default router;