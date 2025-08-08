"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UltraDetailedBriefGenerator = void 0;
const axios_1 = __importDefault(require("axios"));
class UltraDetailedBriefGenerator {
    static async generateBrief(transcript, vapiData, existingLeadData) {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            return this.generateBasicBrief(transcript, vapiData, existingLeadData);
        }
        try {
            const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert sales intelligence analyst. Extract EVERYTHING from the call transcript to create an ultra-detailed brief.

Your goal is to provide the sales team with:
1. Every piece of information mentioned (no matter how small)
2. Identify what information is MISSING and how to get it
3. Create specific action items and follow-up questions
4. Calendar events with exact dates/times
5. Personal details for rapport building
6. Strategic recommendations

BE EXTREMELY THOROUGH. Extract:
- Every name mentioned
- Every date, time, or timeframe
- Every company or competitor named
- Every pain point or problem
- Every question asked
- Every objection raised
- Every positive signal
- Every requirement or need
- Personal information (hobbies, interests, small talk)
- Communication preferences
- Budget indicators
- Decision-making process
- Timeline and urgency
- Current solutions and satisfaction
- Specific product/service interests

For MISSING INFORMATION, provide:
- What's missing
- Why it's important
- Specific questions to ask
- How to naturally bring it up

For CALENDAR ITEMS:
- Extract exact dates and times
- If relative dates (e.g., "next Tuesday"), calculate actual dates
- Include preparation notes
- Set follow-up sequences

Return comprehensive JSON following the UltraDetailedBrief structure.`
                    },
                    {
                        role: 'user',
                        content: `Call Transcript:\n${transcript}\n\nVAPI Data: ${JSON.stringify(vapiData)}\n\nExisting Lead Data: ${JSON.stringify(existingLeadData)}`
                    }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const briefData = JSON.parse(response.data.choices[0].message.content);
            return this.enrichAndValidateBrief(briefData, transcript, vapiData);
        }
        catch (error) {
            console.error('Error generating ultra-detailed brief:', error);
            return this.generateBasicBrief(transcript, vapiData, existingLeadData);
        }
    }
    static generateBasicBrief(transcript, vapiData, existingLeadData) {
        const lowerTranscript = transcript.toLowerCase();
        const appointments = this.extractAppointments(transcript);
        const missingInfo = this.identifyMissingInfo(transcript, existingLeadData);
        return {
            executiveSummary: {
                callOutcome: this.determineOutcome(transcript),
                interestLevel: this.calculateInterestLevel(transcript),
                readyToBuy: lowerTranscript.includes('ready') || lowerTranscript.includes('let\'s do it'),
                nextAction: this.determineNextContact(transcript, appointments),
                priority: this.calculatePriority(transcript)
            },
            contactInfo: {
                fullName: vapiData?.customer?.name || existingLeadData?.name || 'Unknown',
                phone: vapiData?.customer?.number || existingLeadData?.phone || '',
                email: this.extractEmail(transcript),
                bestTimeToCall: this.extractBestTimeToCall(transcript)
            },
            companyDetails: {
                company: this.extractCompany(transcript),
                jobTitle: this.extractJobTitle(transcript),
                companySize: this.extractCompanySize(transcript),
                industry: this.extractIndustry(transcript)
            },
            locationDetails: {
                fullAddress: this.extractAddress(transcript),
                city: this.extractCity(transcript),
                state: this.extractState(transcript),
                zipCode: this.extractZipCode(transcript)
            },
            qualification: {
                budget: {
                    amount: this.extractBudget(transcript),
                    approved: lowerTranscript.includes('budget approved')
                },
                timeline: {
                    urgency: this.extractUrgency(transcript),
                    targetDate: this.extractTargetDate(transcript)
                },
                authority: {
                    isDecisionMaker: this.isDecisionMaker(transcript),
                    decisionMakers: this.extractDecisionMakers(transcript)
                },
                need: {
                    painPoints: this.extractPainPoints(transcript),
                    currentSolution: this.extractCurrentSolution(transcript)
                }
            },
            conversationInsights: {
                questionsAsked: this.extractQuestions(transcript),
                objections: this.extractObjections(transcript),
                buyingSignals: this.extractBuyingSignals(transcript),
                competitorsmentioned: this.extractCompetitors(transcript),
                specificRequirements: this.extractRequirements(transcript)
            },
            calendar: {
                appointments: appointments,
                nextContact: this.determineNextContact(transcript, appointments),
                followUpSchedule: this.createFollowUpSchedule(transcript, appointments)
            },
            actionItems: {
                missingInfo: missingInfo,
                tasksToDo: this.generateTasks(transcript, missingInfo),
                documentsToSend: this.identifyDocumentsToSend(transcript),
                informationToGather: this.identifyInfoToGather(transcript)
            },
            salesIntelligence: {
                personalInfo: {
                    interests: this.extractPersonalInterests(transcript),
                    communicationStyle: this.analyzeCommunicationStyle(transcript)
                },
                negotiation: {
                    priceExpectation: this.extractPriceExpectation(transcript),
                    negotiationPoints: this.extractNegotiationPoints(transcript)
                },
                competitivePosition: {
                    currentVendor: this.extractCurrentVendor(transcript),
                    switchingFactors: this.extractSwitchingFactors(transcript)
                }
            },
            aiRecommendations: {
                nextBestAction: this.recommendNextAction(transcript, appointments, missingInfo),
                talkingPoints: this.generateTalkingPoints(transcript, missingInfo),
                winProbability: this.calculateWinProbability(transcript),
                suggestedOffer: this.suggestOffer(transcript),
                personalizedApproach: this.suggestApproach(transcript)
            },
            metadata: {
                callId: vapiData?.callId || '',
                callDate: new Date().toISOString(),
                callDuration: vapiData?.duration || 0,
                sentiment: this.analyzeSentiment(transcript),
                callQuality: this.assessCallQuality(transcript),
                dataCompleteness: this.calculateDataCompleteness(transcript, existingLeadData)
            }
        };
    }
    static extractAppointments(transcript) {
        const appointments = [];
        const patterns = [
            /(?:appointment|meeting|call|demo|consultation|visit).*?(?:on |at |for )?([A-Za-z]+day)(?:,? )?(?:at )?(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/gi,
            /(?:schedule|book|set up).*?(?:for )?([A-Za-z]+day)(?:,? )?(?:at )?(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/gi,
            /([A-Za-z]+day)(?:,? )?(?:at )?(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?.*?(?:appointment|meeting|call|demo|consultation|visit))/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                appointments.push({
                    type: this.determineAppointmentType(transcript, match.index),
                    date: this.parseRelativeDate(match[1]),
                    time: this.normalizeTime(match[2]),
                    confirmed: true
                });
            }
        }
        return appointments;
    }
    static identifyMissingInfo(transcript, existingData) {
        const missing = [];
        const lowerTranscript = transcript.toLowerCase();
        if (!this.extractEmail(transcript) && !existingData?.email) {
            missing.push({
                field: 'Email Address',
                importance: 'critical',
                howToGet: 'Ask directly in next call',
                question: 'What\'s the best email address to send you the proposal/information?'
            });
        }
        if (!this.extractBudget(transcript)) {
            missing.push({
                field: 'Budget',
                importance: 'critical',
                howToGet: 'Discuss pricing expectations',
                question: 'To ensure we provide the right solution, what budget range are you working with?'
            });
        }
        if (!this.extractCompany(transcript) && !existingData?.company) {
            missing.push({
                field: 'Company Name',
                importance: 'important',
                howToGet: 'Ask about their business',
                question: 'What company are you with?'
            });
        }
        if (!this.extractJobTitle(transcript) && !existingData?.jobTitle) {
            missing.push({
                field: 'Job Title/Role',
                importance: 'important',
                howToGet: 'Ask about their role',
                question: 'What\'s your role at the company?'
            });
        }
        if (!lowerTranscript.includes('decision') && !lowerTranscript.includes('approve')) {
            missing.push({
                field: 'Decision Making Process',
                importance: 'critical',
                howToGet: 'Understand approval process',
                question: 'Who else would be involved in making this decision?'
            });
        }
        if (!this.extractTargetDate(transcript)) {
            missing.push({
                field: 'Implementation Timeline',
                importance: 'important',
                howToGet: 'Understand urgency',
                question: 'When are you looking to have a solution in place?'
            });
        }
        return missing;
    }
    static generateTasks(transcript, missingInfo) {
        const tasks = [];
        for (const info of missingInfo) {
            if (info.importance === 'critical') {
                tasks.push({
                    task: `Get ${info.field}`,
                    deadline: this.getNextBusinessDay(),
                    priority: 'high'
                });
            }
        }
        if (transcript.toLowerCase().includes('send') || transcript.toLowerCase().includes('email')) {
            tasks.push({
                task: 'Send follow-up email with information',
                deadline: 'Today',
                priority: 'urgent'
            });
        }
        if (transcript.toLowerCase().includes('proposal')) {
            tasks.push({
                task: 'Prepare and send proposal',
                deadline: this.getNextBusinessDay(),
                priority: 'high'
            });
        }
        return tasks;
    }
    static createFollowUpSchedule(transcript, appointments) {
        const schedule = [];
        const today = new Date();
        if (appointments.length > 0) {
            const appointmentDate = new Date(appointments[0].date);
            const dayAfter = new Date(appointmentDate);
            dayAfter.setDate(dayAfter.getDate() + 1);
            schedule.push({
                date: dayAfter.toISOString(),
                action: 'Follow up on appointment',
                notes: 'Check how the meeting went, address any concerns'
            });
        }
        if (this.calculateInterestLevel(transcript) >= 6) {
            for (let i = 1; i <= 4; i++) {
                const followUpDate = new Date(today);
                followUpDate.setDate(followUpDate.getDate() + (i * 7));
                schedule.push({
                    date: followUpDate.toISOString(),
                    action: `Week ${i} follow-up`,
                    notes: 'Check progress, maintain engagement'
                });
            }
        }
        return schedule;
    }
    static recommendNextAction(transcript, appointments, missingInfo) {
        if (appointments.length > 0) {
            return `Prepare for ${appointments[0].type} on ${appointments[0].date} at ${appointments[0].time}. Create agenda and gather materials.`;
        }
        if (missingInfo.some(i => i.importance === 'critical')) {
            return `Call back to gather critical missing information: ${missingInfo.filter(i => i.importance === 'critical').map(i => i.field).join(', ')}`;
        }
        if (this.calculateInterestLevel(transcript) >= 7) {
            return 'Send proposal and schedule follow-up call within 48 hours';
        }
        return 'Nurture lead with valuable content and check in next week';
    }
    static determineOutcome(transcript) {
        const lower = transcript.toLowerCase();
        if (lower.includes('appointment') || lower.includes('meeting'))
            return 'meeting_booked';
        if (lower.includes('call me back') || lower.includes('follow up'))
            return 'callback_scheduled';
        if (lower.includes('interested'))
            return 'qualified';
        if (lower.includes('not interested'))
            return 'not_qualified';
        return 'needs_nurturing';
    }
    static calculateInterestLevel(transcript) {
        let score = 5;
        const lower = transcript.toLowerCase();
        if (lower.includes('very interested'))
            score += 3;
        else if (lower.includes('interested'))
            score += 2;
        if (lower.includes('appointment'))
            score += 2;
        if (lower.includes('when can'))
            score += 1;
        if (lower.includes('how much'))
            score += 1;
        if (lower.includes('sounds good'))
            score += 1;
        if (lower.includes('not interested'))
            score -= 4;
        if (lower.includes('too expensive'))
            score -= 2;
        if (lower.includes('not now'))
            score -= 2;
        if (lower.includes('already have'))
            score -= 1;
        return Math.max(1, Math.min(10, score));
    }
    static calculatePriority(transcript) {
        const interest = this.calculateInterestLevel(transcript);
        const lower = transcript.toLowerCase();
        if (lower.includes('urgent') || lower.includes('asap'))
            return 'urgent';
        if (interest >= 8)
            return 'high';
        if (interest >= 5)
            return 'medium';
        return 'low';
    }
    static extractEmail(transcript) {
        const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        return emailMatch ? emailMatch[0] : undefined;
    }
    static extractBudget(transcript) {
        const patterns = [
            /\$[\d,]+(?:k|K|m|M)?/,
            /\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|eur|gbp|pounds)/i,
            /budget.*?(\d+)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[0];
        }
        return undefined;
    }
    static extractCompany(transcript) {
        const patterns = [
            /(?:company|work at|with|from)\s+([A-Z][A-Za-z0-9\s&]+(?:Inc|LLC|Ltd|Corp|Company)?)/,
            /([A-Z][A-Za-z0-9\s&]+(?:Inc|LLC|Ltd|Corp|Company))/
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match && match[1] && !match[1].includes('Energy')) {
                return match[1].trim();
            }
        }
        return undefined;
    }
    static parseRelativeDate(dayName) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = new Date();
        const todayDay = today.getDay();
        const targetDay = days.indexOf(dayName.toLowerCase());
        if (targetDay === -1)
            return dayName;
        let daysUntil = targetDay - todayDay;
        if (daysUntil <= 0)
            daysUntil += 7;
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        return targetDate.toISOString().split('T')[0];
    }
    static normalizeTime(timeStr) {
        if (!timeStr)
            return '12:00 PM';
        if (timeStr.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)) {
            return timeStr.toUpperCase();
        }
        if (timeStr.match(/\d{1,2}\s*(?:AM|PM)/i)) {
            const parts = timeStr.match(/(\d{1,2})\s*(AM|PM)/i);
            if (parts) {
                return `${parts[1]}:00 ${parts[2].toUpperCase()}`;
            }
        }
        return timeStr;
    }
    static determineAppointmentType(transcript, position) {
        const before = transcript.substring(Math.max(0, position - 50), position).toLowerCase();
        const after = transcript.substring(position, Math.min(transcript.length, position + 50)).toLowerCase();
        const context = before + after;
        if (context.includes('demo'))
            return 'demo';
        if (context.includes('consultation'))
            return 'consultation';
        if (context.includes('visit') || context.includes('come by'))
            return 'visit';
        if (context.includes('meeting'))
            return 'meeting';
        if (context.includes('call back'))
            return 'callback';
        return 'follow_up';
    }
    static getNextBusinessDay() {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        if (date.getDay() === 0)
            date.setDate(date.getDate() + 1);
        if (date.getDay() === 6)
            date.setDate(date.getDate() + 2);
        return date.toISOString().split('T')[0];
    }
    static extractBestTimeToCall(transcript) {
        const patterns = [
            /best time.*?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
            /call.*?(?:after|before|at|around)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
            /(?:morning|afternoon|evening)s?\s+(?:work|is good|is best)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[0];
        }
        return undefined;
    }
    static extractJobTitle(transcript) {
        const patterns = [
            /(?:I'm|I am|work as|role is|position is)\s+(?:a |an |the )?([A-Za-z\s]+(?:manager|director|executive|coordinator|specialist|analyst|developer|engineer|consultant))/i,
            /(?:title is|job is)\s+([A-Za-z\s]+)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[1]?.trim();
        }
        return undefined;
    }
    static extractAddress(transcript) {
        const patterns = [
            /\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd)/i,
            /(?:address is|located at|find us at)\s+([^,.]+)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[0]?.trim();
        }
        return undefined;
    }
    static extractCity(transcript) {
        const match = transcript.match(/(?:in |from |city of |located in )\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        return match ? match[1] : undefined;
    }
    static extractState(transcript) {
        const statePattern = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
        const match = transcript.match(statePattern);
        return match ? match[0] : undefined;
    }
    static extractZipCode(transcript) {
        const match = transcript.match(/\b\d{5}(?:-\d{4})?\b/);
        return match ? match[0] : undefined;
    }
    static extractCompanySize(transcript) {
        const patterns = [
            /(\d+)\s*(?:employees|people|staff)/i,
            /(?:small|medium|large|enterprise)\s+(?:business|company|organization)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[0];
        }
        return undefined;
    }
    static extractIndustry(transcript) {
        const industries = [
            'technology', 'healthcare', 'finance', 'retail', 'manufacturing',
            'education', 'real estate', 'construction', 'hospitality', 'automotive',
            'energy', 'telecommunications', 'media', 'transportation', 'agriculture'
        ];
        const lower = transcript.toLowerCase();
        for (const industry of industries) {
            if (lower.includes(industry))
                return industry;
        }
        return undefined;
    }
    static extractTargetDate(transcript) {
        const patterns = [
            /(?:by |before |deadline is |need it by |target date is )([A-Za-z]+\s+\d{1,2})/i,
            /(?:in |within )(\d+)\s*(?:days|weeks|months)/i,
            /(?:Q1|Q2|Q3|Q4)\s*\d{4}/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[0];
        }
        return undefined;
    }
    static extractUrgency(transcript) {
        const lower = transcript.toLowerCase();
        if (lower.includes('urgent') || lower.includes('asap'))
            return 'urgent';
        if (lower.includes('soon') || lower.includes('quickly'))
            return 'high';
        if (lower.includes('eventually') || lower.includes('future'))
            return 'low';
        return 'medium';
    }
    static isDecisionMaker(transcript) {
        const lower = transcript.toLowerCase();
        return lower.includes('i decide') ||
            lower.includes('i approve') ||
            lower.includes('my decision') ||
            lower.includes('i\'m the owner') ||
            lower.includes('i run the');
    }
    static extractDecisionMakers(transcript) {
        const makers = [];
        const patterns = [
            /(?:speak with|talk to|involve|consult with)\s+(?:my |our |the )?([a-z]+)/gi,
            /(?:boss|manager|director|ceo|cfo|owner|partner)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1] || match[0]) {
                    makers.push(match[1] || match[0]);
                }
            }
        }
        return [...new Set(makers)];
    }
    static extractPainPoints(transcript) {
        const painPoints = [];
        const patterns = [
            /(?:problem|issue|challenge|struggle|difficulty|pain|frustration)(?:s)?\s+(?:is|are|with)\s+([^,.]+)/gi,
            /(?:too |very )\s*(expensive|slow|complicated|difficult|time-consuming|manual)/gi,
            /(?:need|want|looking for)\s+(?:to |a |an )?([^,.]+)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    painPoints.push(match[1].trim());
                }
            }
        }
        return painPoints.slice(0, 5);
    }
    static extractCurrentSolution(transcript) {
        const patterns = [
            /(?:currently using|current solution is|right now we use|we have)\s+([^,.]+)/i,
            /(?:working with|using)\s+([A-Za-z0-9\s]+)(?:\s+for|to)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[1]?.trim();
        }
        return undefined;
    }
    static extractQuestions(transcript) {
        const questions = [];
        const sentences = transcript.split(/[.!?]+/);
        for (const sentence of sentences) {
            if (sentence.includes('?') ||
                sentence.match(/^(how|what|when|where|why|who|can|could|would|will|is|are|do|does)/i)) {
                questions.push(sentence.trim());
            }
        }
        return questions.slice(0, 10);
    }
    static extractObjections(transcript) {
        const objections = [];
        const patterns = [
            /(?:concern|worried|hesitant|not sure)(?:s)?\s+(?:about|with|that)\s+([^,.]+)/gi,
            /(?:too |very )\s*(expensive|risky|complicated)/gi,
            /(?:but|however|although)\s+([^,.]+)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    objections.push(match[1].trim());
                }
            }
        }
        return objections.slice(0, 5);
    }
    static extractBuyingSignals(transcript) {
        const signals = [];
        const positive = [
            'sounds good', 'interested', 'like that', 'perfect', 'exactly what',
            'when can', 'how soon', 'next step', 'move forward', 'get started'
        ];
        const lower = transcript.toLowerCase();
        for (const signal of positive) {
            if (lower.includes(signal)) {
                const index = lower.indexOf(signal);
                const context = transcript.substring(Math.max(0, index - 20), Math.min(transcript.length, index + 50));
                signals.push(context.trim());
            }
        }
        return signals;
    }
    static extractCompetitors(transcript) {
        const competitors = [];
        const patterns = [
            /(?:looking at|considering|talking to|spoke with|comparing with)\s+([A-Z][A-Za-z0-9\s]+)/g,
            /(?:vendor|supplier|provider|competitor)\s+(?:is |called |named )?([A-Z][A-Za-z0-9\s]+)/g
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    competitors.push(match[1].trim());
                }
            }
        }
        return [...new Set(competitors)];
    }
    static extractRequirements(transcript) {
        const requirements = [];
        const patterns = [
            /(?:need|require|must have|essential|important)\s+(?:to |that |for )?\s*([^,.]+)/gi,
            /(?:looking for|want)\s+(?:something that|a solution that|to be able to)\s+([^,.]+)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    requirements.push(match[1].trim());
                }
            }
        }
        return requirements.slice(0, 10);
    }
    static determineNextContact(transcript, appointments) {
        if (appointments.length > 0) {
            return {
                date: appointments[0].date,
                time: appointments[0].time,
                purpose: `${appointments[0].type} as scheduled`,
                medium: appointments[0].type === 'visit' ? 'in_person' : 'phone'
            };
        }
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return {
            date: tomorrow.toISOString().split('T')[0],
            time: '10:00 AM',
            purpose: 'Follow up on initial conversation',
            medium: 'phone'
        };
    }
    static identifyDocumentsToSend(transcript) {
        const docs = [];
        const lower = transcript.toLowerCase();
        if (lower.includes('brochure'))
            docs.push('Product brochure');
        if (lower.includes('pricing') || lower.includes('cost'))
            docs.push('Pricing sheet');
        if (lower.includes('proposal'))
            docs.push('Custom proposal');
        if (lower.includes('case study') || lower.includes('example'))
            docs.push('Case studies');
        if (lower.includes('specification') || lower.includes('specs'))
            docs.push('Technical specifications');
        return docs;
    }
    static identifyInfoToGather(transcript) {
        const info = [];
        const lower = transcript.toLowerCase();
        if (lower.includes('research') || lower.includes('look into')) {
            info.push('Research prospect\'s company and industry');
        }
        if (lower.includes('competitor')) {
            info.push('Competitive analysis and comparison');
        }
        if (lower.includes('reference') || lower.includes('testimonial')) {
            info.push('Gather relevant customer references');
        }
        return info;
    }
    static extractPersonalInterests(transcript) {
        const interests = [];
        const patterns = [
            /(?:hobby|interest|enjoy|like|love)\s+(?:is |are )?\s*([^,.]+)/gi,
            /(?:free time|weekend)\s+(?:I |we )?\s*([^,.]+)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    interests.push(match[1].trim());
                }
            }
        }
        return interests;
    }
    static analyzeCommunicationStyle(transcript) {
        const lower = transcript.toLowerCase();
        if (lower.includes('data') || lower.includes('number') || lower.includes('fact')) {
            return 'analytical';
        }
        if (lower.includes('feel') || lower.includes('team') || lower.includes('people')) {
            return 'relational';
        }
        if (lower.includes('quick') || lower.includes('bottom line') || lower.includes('cut to')) {
            return 'direct';
        }
        return 'conversational';
    }
    static extractPriceExpectation(transcript) {
        const patterns = [
            /(?:expecting|thinking|budget|spend)\s+(?:around|about|roughly)?\s*(\$[\d,]+)/i,
            /(\$[\d,]+)\s+(?:range|ballpark|area)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[1];
        }
        return undefined;
    }
    static extractNegotiationPoints(transcript) {
        const points = [];
        const patterns = [
            /(?:if |provided that|as long as|assuming)\s+([^,.]+)/gi,
            /(?:negotiate|flexible on|discuss)\s+([^,.]+)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    points.push(match[1].trim());
                }
            }
        }
        return points;
    }
    static extractCurrentVendor(transcript) {
        const patterns = [
            /(?:currently with|using|vendor is|provider is)\s+([A-Z][A-Za-z0-9\s]+)/i,
            /([A-Z][A-Za-z0-9\s]+)\s+(?:is our|as our)\s+(?:vendor|provider|supplier)/i
        ];
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match)
                return match[1]?.trim();
        }
        return undefined;
    }
    static extractSwitchingFactors(transcript) {
        const factors = [];
        const patterns = [
            /(?:switch if|change if|move if|consider if)\s+([^,.]+)/gi,
            /(?:problem with current|issue with current)\s+(?:is |are )?\s*([^,.]+)/gi
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(transcript)) !== null) {
                if (match[1]) {
                    factors.push(match[1].trim());
                }
            }
        }
        return factors;
    }
    static generateTalkingPoints(transcript, missingInfo) {
        const points = [];
        const painPoints = this.extractPainPoints(transcript);
        for (const pain of painPoints.slice(0, 3)) {
            points.push(`How our solution addresses: ${pain}`);
        }
        for (const info of missingInfo.slice(0, 2)) {
            points.push(info.question);
        }
        points.push('ROI and cost savings demonstration');
        points.push('Implementation timeline and support');
        return points;
    }
    static calculateWinProbability(transcript) {
        let probability = 50;
        const lower = transcript.toLowerCase();
        if (lower.includes('appointment'))
            probability += 20;
        if (lower.includes('very interested'))
            probability += 15;
        if (lower.includes('budget approved'))
            probability += 15;
        if (lower.includes('decision maker'))
            probability += 10;
        if (this.extractEmail(transcript))
            probability += 5;
        if (lower.includes('not interested'))
            probability -= 30;
        if (lower.includes('happy with current'))
            probability -= 20;
        if (lower.includes('no budget'))
            probability -= 25;
        if (lower.includes('just looking'))
            probability -= 15;
        return Math.max(5, Math.min(95, probability));
    }
    static suggestOffer(transcript) {
        const interest = this.calculateInterestLevel(transcript);
        const lower = transcript.toLowerCase();
        if (interest >= 8) {
            return 'Provide best pricing with implementation incentive';
        }
        if (lower.includes('price') || lower.includes('expensive')) {
            return 'Offer flexible payment terms or starter package';
        }
        if (lower.includes('trial') || lower.includes('test')) {
            return 'Propose pilot program or free trial period';
        }
        return 'Standard package with follow-up consultation';
    }
    static suggestApproach(transcript) {
        const style = this.analyzeCommunicationStyle(transcript);
        const interest = this.calculateInterestLevel(transcript);
        if (style === 'analytical') {
            return 'Focus on data, ROI metrics, and detailed specifications';
        }
        if (style === 'relational') {
            return 'Emphasize partnership, support, and success stories';
        }
        if (style === 'direct') {
            return 'Get to the point quickly, focus on bottom-line benefits';
        }
        if (interest < 5) {
            return 'Educational approach, provide value before selling';
        }
        return 'Consultative approach, understand needs before proposing';
    }
    static analyzeSentiment(transcript) {
        const lower = transcript.toLowerCase();
        let positive = 0;
        let negative = 0;
        const positiveWords = ['good', 'great', 'excellent', 'interested', 'love', 'perfect', 'amazing', 'definitely'];
        for (const word of positiveWords) {
            if (lower.includes(word))
                positive++;
        }
        const negativeWords = ['not interested', 'expensive', 'problem', 'issue', 'concerned', 'worried', 'difficult'];
        for (const word of negativeWords) {
            if (lower.includes(word))
                negative++;
        }
        if (positive > negative * 2)
            return 'positive';
        if (negative > positive * 2)
            return 'negative';
        if (positive > 0 && negative > 0)
            return 'mixed';
        return 'neutral';
    }
    static assessCallQuality(transcript) {
        let quality = 5;
        if (transcript.length > 1000)
            quality += 2;
        if (this.extractQuestions(transcript).length > 3)
            quality += 1;
        if (this.extractEmail(transcript))
            quality += 1;
        if (this.extractBudget(transcript))
            quality += 1;
        if (transcript.length < 200)
            quality -= 2;
        if (transcript.toLowerCase().includes('not interested'))
            quality -= 1;
        return Math.max(1, Math.min(10, quality));
    }
    static calculateDataCompleteness(transcript, existingData) {
        let fieldsCollected = 0;
        const totalFields = 10;
        if (this.extractEmail(transcript) || existingData?.email)
            fieldsCollected++;
        if (this.extractCompany(transcript) || existingData?.company)
            fieldsCollected++;
        if (this.extractJobTitle(transcript) || existingData?.jobTitle)
            fieldsCollected++;
        if (this.extractBudget(transcript))
            fieldsCollected++;
        if (this.extractTargetDate(transcript))
            fieldsCollected++;
        if (this.extractAddress(transcript) || existingData?.address)
            fieldsCollected++;
        if (this.isDecisionMaker(transcript))
            fieldsCollected++;
        if (this.extractPainPoints(transcript).length > 0)
            fieldsCollected++;
        if (this.extractCurrentSolution(transcript))
            fieldsCollected++;
        if (this.extractAppointments(transcript).length > 0)
            fieldsCollected++;
        return Math.round((fieldsCollected / totalFields) * 100);
    }
    static enrichAndValidateBrief(briefData, transcript, vapiData) {
        return {
            executiveSummary: briefData.executiveSummary || this.generateBasicBrief(transcript, vapiData).executiveSummary,
            contactInfo: briefData.contactInfo || {},
            companyDetails: briefData.companyDetails || {},
            locationDetails: briefData.locationDetails || {},
            qualification: briefData.qualification || {},
            conversationInsights: briefData.conversationInsights || {},
            calendar: briefData.calendar || {},
            actionItems: briefData.actionItems || {},
            salesIntelligence: briefData.salesIntelligence || {},
            aiRecommendations: briefData.aiRecommendations || {},
            metadata: briefData.metadata || this.generateBasicBrief(transcript, vapiData).metadata
        };
    }
}
exports.UltraDetailedBriefGenerator = UltraDetailedBriefGenerator;
exports.default = UltraDetailedBriefGenerator;
