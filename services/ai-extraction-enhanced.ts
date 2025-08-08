import OpenAI from 'openai';
import { z } from 'zod';

/**
 * Enhanced AI Extraction with Function Calling and Strict Schemas
 * Based on recommendations from GPT5, Grok, and Claude 4.1
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Zod schema for lead extraction (strict validation)
const AddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
});

const LeadExtractionSchema = z.object({
  personal: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
  }),
  address: AddressSchema.optional(),
  professional: z.object({
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    website: z.string().optional(),
    linkedin: z.string().optional(),
  }).optional(),
  property: z.object({
    type: z.string().optional(),
    size: z.string().optional(),
    value: z.number().optional(),
  }).optional(),
  preferences: z.object({
    preferredContactMethod: z.string().optional(),
    preferredCallTime: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
  financial: z.object({
    budgetRange: z.string().optional(),
    financingStatus: z.string().optional(),
  }).optional(),
  timeline: z.object({
    purchaseTimeline: z.string().optional(),
    decisionTimeline: z.string().optional(),
    urgency: z.string().optional(),
  }).optional(),
  engagement: z.object({
    interests: z.array(z.string()).optional(),
    painPoints: z.array(z.string()).optional(),
    objections: z.array(z.string()).optional(),
    questions: z.array(z.string()).optional(),
  }).optional(),
  appointment: z.object({
    date: z.string().optional(),
    time: z.string().optional(),
    type: z.string().optional(),
  }).optional(),
  competition: z.object({
    currentSolution: z.string().optional(),
    competitorsmentioned: z.array(z.string()).optional(),
  }).optional(),
});

type LeadExtraction = z.infer<typeof LeadExtractionSchema>;

export class AIExtractionEnhanced {
  /**
   * Extract lead data using function calling with strict schema
   */
  static async extractWithFunctionCalling(transcript: string): Promise<LeadExtraction> {
    const functions = [{
      name: "extract_lead_data",
      description: "Extract all mentioned lead information from the call transcript",
      parameters: {
        type: "object",
        properties: {
          personal: {
            type: "object",
            properties: {
              firstName: { type: "string", description: "First name only, e.g., 'John' from 'John Smith'" },
              lastName: { type: "string", description: "Last name only, e.g., 'Smith' from 'John Smith'" },
              email: { type: "string", description: "Email address if mentioned" },
              phone: { type: "string", description: "Phone number if mentioned" },
            },
          },
          address: {
            type: "object",
            properties: {
              line1: { type: "string", description: "Street address line 1" },
              line2: { type: "string", description: "Street address line 2 (apt, suite, etc.)" },
              city: { type: "string", description: "City name" },
              state: { type: "string", description: "State or province" },
              postal_code: { type: "string", description: "ZIP or postal code" },
              country: { type: "string", description: "Country if mentioned" },
            },
          },
          professional: {
            type: "object",
            properties: {
              company: { type: "string" },
              jobTitle: { type: "string" },
              website: { type: "string" },
              linkedin: { type: "string" },
            },
          },
          property: {
            type: "object",
            properties: {
              type: { type: "string", description: "Property type (house, apartment, etc.)" },
              size: { type: "string", description: "Property size (e.g., '2500 sq ft')" },
              value: { type: "number", description: "Property value if mentioned" },
            },
          },
          preferences: {
            type: "object",
            properties: {
              preferredContactMethod: { type: "string" },
              preferredCallTime: { type: "string" },
              timezone: { type: "string" },
            },
          },
          financial: {
            type: "object",
            properties: {
              budgetRange: { type: "string" },
              financingStatus: { type: "string" },
            },
          },
          timeline: {
            type: "object",
            properties: {
              purchaseTimeline: { type: "string" },
              decisionTimeline: { type: "string" },
              urgency: { type: "string" },
            },
          },
          engagement: {
            type: "object",
            properties: {
              interests: { type: "array", items: { type: "string" } },
              painPoints: { type: "array", items: { type: "string" } },
              objections: { type: "array", items: { type: "string" } },
              questions: { type: "array", items: { type: "string" } },
            },
          },
          appointment: {
            type: "object",
            properties: {
              date: { type: "string" },
              time: { type: "string" },
              type: { type: "string" },
            },
          },
          competition: {
            type: "object",
            properties: {
              currentSolution: { type: "string" },
              competitorsmentioned: { type: "array", items: { type: "string" } },
            },
          },
        },
        required: [],
      },
    }];

    const systemPrompt = `You are a precise data extraction system. Extract ONLY information that is explicitly stated in the transcript.

CRITICAL RULES:
1. Extract ONLY what is directly stated - no inference or guessing
2. For names: If someone says "This is Matt", extract firstName: "Matt"
3. For addresses: Extract each component separately (street, city, state, zip)
4. Return null/empty for any field not explicitly mentioned
5. Do NOT make up information that isn't in the transcript`;

    const userPrompt = `Extract all mentioned information from this call transcript:

${transcript}

Remember: Only extract what is explicitly stated. Leave fields empty if not mentioned.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        functions: functions,
        function_call: { name: "extract_lead_data" },
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 2000,
      });

      const functionCall = completion.choices[0].message.function_call;
      if (!functionCall || !functionCall.arguments) {
        throw new Error('No function call response from OpenAI');
      }

      const rawExtraction = JSON.parse(functionCall.arguments);
      
      // Validate with Zod schema
      const validated = LeadExtractionSchema.parse(rawExtraction);
      
      // Apply regex fallbacks for critical fields
      const enhanced = this.applyRegexFallbacks(validated, transcript);
      
      return enhanced;
    } catch (error) {
      console.error('❌ Function calling extraction failed:', error);
      
      // Fallback to regex extraction
      return this.fallbackRegexExtraction(transcript);
    }
  }

  /**
   * Apply deterministic regex extraction for critical fields
   * Based on GPT5's recommendation for high-accuracy extraction
   */
  static applyRegexFallbacks(extraction: LeadExtraction, transcript: string): LeadExtraction {
    const patterns = {
      email: /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/gi,
      phone: /\b(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
      zipCode: /\b(\d{5}(?:-\d{4})?)\b/g,
      website: /\b(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9]+-?[a-z0-9]+\.(com|net|org|io|co))\b/gi,
      ssn: /\b(\d{3}-\d{2}-\d{4})\b/g, // To exclude from extraction for security
    };

    // Extract emails
    const emailMatches = transcript.match(patterns.email);
    if (emailMatches && emailMatches.length > 0 && !extraction.personal?.email) {
      if (!extraction.personal) extraction.personal = { firstName: '', lastName: '', email: '', phone: '' };
      extraction.personal.email = emailMatches[0].toLowerCase();
    }

    // Extract phone numbers
    const phoneMatches = transcript.match(patterns.phone);
    if (phoneMatches && phoneMatches.length > 0 && !extraction.personal?.phone) {
      if (!extraction.personal) extraction.personal = { firstName: '', lastName: '', email: '', phone: '' };
      // Clean up phone number format
      extraction.personal.phone = phoneMatches[0].replace(/[^\d+]/g, '');
    }

    // Extract ZIP codes
    const zipMatches = transcript.match(patterns.zipCode);
    if (zipMatches && zipMatches.length > 0 && !extraction.address?.postal_code) {
      if (!extraction.address) extraction.address = {};
      extraction.address.postal_code = zipMatches[0];
    }

    // Extract websites
    const websiteMatches = transcript.match(patterns.website);
    if (websiteMatches && websiteMatches.length > 0 && !extraction.professional?.website) {
      if (!extraction.professional) extraction.professional = {};
      extraction.professional.website = websiteMatches[0];
    }

    return extraction;
  }

  /**
   * Pure regex-based extraction as final fallback
   */
  static fallbackRegexExtraction(transcript: string): LeadExtraction {
    const extraction: LeadExtraction = {
      personal: {},
    };

    // Name extraction patterns
    const namePatterns = [
      /(?:my name is|this is|i'm|i am)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
      /(?:calling|speaking with)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
    ];

    for (const pattern of namePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        extraction.personal.firstName = match[1];
        if (match[2]) extraction.personal.lastName = match[2];
        break;
      }
    }

    // Apply standard regex patterns
    return this.applyRegexFallbacks(extraction, transcript);
  }

  /**
   * Calculate confidence score for extracted data
   */
  static calculateConfidence(extraction: LeadExtraction): number {
    let score = 0;
    let fields = 0;

    // Check personal info
    if (extraction.personal?.firstName) { score += 1; fields += 1; }
    if (extraction.personal?.lastName) { score += 1; fields += 1; }
    if (extraction.personal?.email) { score += 2; fields += 2; } // Email is more important
    if (extraction.personal?.phone) { score += 2; fields += 2; } // Phone is more important

    // Check address
    if (extraction.address?.line1) { score += 1; fields += 1; }
    if (extraction.address?.city) { score += 1; fields += 1; }
    if (extraction.address?.state) { score += 1; fields += 1; }
    if (extraction.address?.postal_code) { score += 1; fields += 1; }

    // Check other fields
    if (extraction.professional?.company) { score += 1; fields += 1; }
    if (extraction.appointment?.date) { score += 2; fields += 2; } // Appointment is important

    return fields > 0 ? (score / fields) * 100 : 0;
  }
}

// Export for use in other modules
export default AIExtractionEnhanced;