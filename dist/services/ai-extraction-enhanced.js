"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIExtractionEnhanced = void 0;
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const AddressSchema = zod_1.z.object({
    line1: zod_1.z.string().optional(),
    line2: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    postal_code: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
});
const LeadExtractionSchema = zod_1.z.object({
    personal: zod_1.z.object({
        firstName: zod_1.z.string().optional(),
        lastName: zod_1.z.string().optional(),
        email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
        phone: zod_1.z.string().optional(),
    }),
    address: AddressSchema.optional(),
    professional: zod_1.z.object({
        company: zod_1.z.string().optional(),
        jobTitle: zod_1.z.string().optional(),
        website: zod_1.z.string().optional(),
        linkedin: zod_1.z.string().optional(),
    }).optional(),
    property: zod_1.z.object({
        type: zod_1.z.string().optional(),
        size: zod_1.z.string().optional(),
        value: zod_1.z.number().optional(),
    }).optional(),
    preferences: zod_1.z.object({
        preferredContactMethod: zod_1.z.string().optional(),
        preferredCallTime: zod_1.z.string().optional(),
        timezone: zod_1.z.string().optional(),
    }).optional(),
    financial: zod_1.z.object({
        budgetRange: zod_1.z.string().optional(),
        financingStatus: zod_1.z.string().optional(),
    }).optional(),
    timeline: zod_1.z.object({
        purchaseTimeline: zod_1.z.string().optional(),
        decisionTimeline: zod_1.z.string().optional(),
        urgency: zod_1.z.string().optional(),
    }).optional(),
    engagement: zod_1.z.object({
        interests: zod_1.z.array(zod_1.z.string()).optional(),
        painPoints: zod_1.z.array(zod_1.z.string()).optional(),
        objections: zod_1.z.array(zod_1.z.string()).optional(),
        questions: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
    appointment: zod_1.z.object({
        date: zod_1.z.string().optional(),
        time: zod_1.z.string().optional(),
        type: zod_1.z.string().optional(),
    }).optional(),
    competition: zod_1.z.object({
        currentSolution: zod_1.z.string().optional(),
        competitorsmentioned: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
});
class AIExtractionEnhanced {
    static async extractWithFunctionCalling(transcript) {
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
                temperature: 0.1,
                max_tokens: 2000,
            });
            const functionCall = completion.choices[0].message.function_call;
            if (!functionCall || !functionCall.arguments) {
                throw new Error('No function call response from OpenAI');
            }
            const rawExtraction = JSON.parse(functionCall.arguments);
            const validated = LeadExtractionSchema.parse(rawExtraction);
            const enhanced = this.applyRegexFallbacks(validated, transcript);
            return enhanced;
        }
        catch (error) {
            console.error('❌ Function calling extraction failed:', error);
            return this.fallbackRegexExtraction(transcript);
        }
    }
    static applyRegexFallbacks(extraction, transcript) {
        const patterns = {
            email: /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/gi,
            phone: /\b(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
            zipCode: /\b(\d{5}(?:-\d{4})?)\b/g,
            website: /\b(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9]+-?[a-z0-9]+\.(com|net|org|io|co))\b/gi,
            ssn: /\b(\d{3}-\d{2}-\d{4})\b/g,
        };
        const emailMatches = transcript.match(patterns.email);
        if (emailMatches && emailMatches.length > 0 && !extraction.personal?.email) {
            if (!extraction.personal)
                extraction.personal = { firstName: '', lastName: '', email: '', phone: '' };
            extraction.personal.email = emailMatches[0].toLowerCase();
        }
        const phoneMatches = transcript.match(patterns.phone);
        if (phoneMatches && phoneMatches.length > 0 && !extraction.personal?.phone) {
            if (!extraction.personal)
                extraction.personal = { firstName: '', lastName: '', email: '', phone: '' };
            extraction.personal.phone = phoneMatches[0].replace(/[^\d+]/g, '');
        }
        const zipMatches = transcript.match(patterns.zipCode);
        if (zipMatches && zipMatches.length > 0 && !extraction.address?.postal_code) {
            if (!extraction.address)
                extraction.address = {};
            extraction.address.postal_code = zipMatches[0];
        }
        const websiteMatches = transcript.match(patterns.website);
        if (websiteMatches && websiteMatches.length > 0 && !extraction.professional?.website) {
            if (!extraction.professional)
                extraction.professional = {};
            extraction.professional.website = websiteMatches[0];
        }
        return extraction;
    }
    static fallbackRegexExtraction(transcript) {
        const extraction = {
            personal: {},
        };
        const namePatterns = [
            /(?:my name is|this is|i'm|i am)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
            /(?:calling|speaking with)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i,
        ];
        for (const pattern of namePatterns) {
            const match = transcript.match(pattern);
            if (match) {
                extraction.personal.firstName = match[1];
                if (match[2])
                    extraction.personal.lastName = match[2];
                break;
            }
        }
        return this.applyRegexFallbacks(extraction, transcript);
    }
    static calculateConfidence(extraction) {
        let score = 0;
        let fields = 0;
        if (extraction.personal?.firstName) {
            score += 1;
            fields += 1;
        }
        if (extraction.personal?.lastName) {
            score += 1;
            fields += 1;
        }
        if (extraction.personal?.email) {
            score += 2;
            fields += 2;
        }
        if (extraction.personal?.phone) {
            score += 2;
            fields += 2;
        }
        if (extraction.address?.line1) {
            score += 1;
            fields += 1;
        }
        if (extraction.address?.city) {
            score += 1;
            fields += 1;
        }
        if (extraction.address?.state) {
            score += 1;
            fields += 1;
        }
        if (extraction.address?.postal_code) {
            score += 1;
            fields += 1;
        }
        if (extraction.professional?.company) {
            score += 1;
            fields += 1;
        }
        if (extraction.appointment?.date) {
            score += 2;
            fields += 2;
        }
        return fields > 0 ? (score / fields) * 100 : 0;
    }
}
exports.AIExtractionEnhanced = AIExtractionEnhanced;
exports.default = AIExtractionEnhanced;
