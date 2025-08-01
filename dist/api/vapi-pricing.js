"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/platform-pricing', auth_1.authenticateUser, async (req, res) => {
    try {
        const pricing = {
            telephony: {
                perMinute: 0.03,
                connectionFee: 0.00,
                minimumCharge: 0.01,
                regions: {
                    us: 0.03,
                    canada: 0.04,
                    europe: 0.05,
                    asia: 0.06
                }
            },
            stt: {
                perMinute: 0.01,
                providers: {
                    deepgram: {
                        nova: 0.01,
                        enhanced: 0.015,
                        whisper: 0.02
                    },
                    assemblyai: {
                        standard: 0.012,
                        premium: 0.018
                    }
                }
            },
            llm: {
                perMinute: 0.02,
                providers: {
                    openai: {
                        'gpt-4': 0.03,
                        'gpt-4-turbo': 0.02,
                        'gpt-3.5-turbo': 0.01
                    },
                    anthropic: {
                        'claude-3': 0.025,
                        'claude-2': 0.02
                    }
                }
            },
            tts: {
                perMinute: 0.015,
                providers: {
                    elevenlabs: {
                        standard: 0.015,
                        premium: 0.025,
                        turbo: 0.01
                    },
                    playht: {
                        standard: 0.012,
                        premium: 0.02
                    }
                }
            },
            features: {
                recording: 0.005,
                transcriptStorage: 0.001,
                analytics: 0.002,
                webhooks: 0.001
            },
            modifiers: {
                peakHours: {
                    enabled: false,
                    multiplier: 1.2,
                    hours: { start: 9, end: 17 },
                    timezone: 'America/New_York'
                },
                volumeDiscounts: [
                    { minutes: 1000, discount: 0.05 },
                    { minutes: 5000, discount: 0.10 },
                    { minutes: 10000, discount: 0.15 }
                ]
            },
            lastUpdated: new Date().toISOString(),
            currency: 'USD',
            billingIncrement: 1,
            minimumBilling: 1
        };
        res.json(pricing);
    }
    catch (error) {
        console.error('Error fetching VAPI pricing:', error);
        res.status(500).json({
            error: 'Failed to fetch pricing data',
            message: 'Using default pricing rates'
        });
    }
});
router.get('/assistant-costs', auth_1.authenticateUser, async (req, res) => {
    try {
        const costs = {
            '1': 0.08,
            '2': 0.06,
            '3': 0.07,
            '4': 0.09,
            '5': 0.05
        };
        res.json(costs);
    }
    catch (error) {
        console.error('Error fetching assistant costs:', error);
        res.status(500).json({ error: 'Failed to fetch assistant costs' });
    }
});
router.get('/balance', auth_1.authenticateUser, async (req, res) => {
    try {
        const balance = 25.50;
        res.json({
            balance,
            currency: 'USD',
            lowBalanceThreshold: 5.00,
            autoRecharge: {
                enabled: false,
                amount: 50.00,
                threshold: 10.00
            }
        });
    }
    catch (error) {
        console.error('Error fetching VAPI balance:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});
router.post('/estimate', auth_1.authenticateUser, async (req, res) => {
    try {
        const { assistantId, totalCalls, avgCallDuration, dailyCallLimit, concurrentCalls } = req.body;
        const pricing = {
            assistant: 0.07,
            platform: 0.075,
            total: 0.145
        };
        const totalMinutes = totalCalls * avgCallDuration;
        const totalCost = totalMinutes * pricing.total;
        const dailyCost = dailyCallLimit * avgCallDuration * pricing.total;
        const estimatedDays = Math.ceil(totalCalls / dailyCallLimit);
        const peakConcurrentCalls = Math.min(10, concurrentCalls || 1);
        const peakHourCost = peakConcurrentCalls * avgCallDuration * pricing.total;
        res.json({
            estimate: {
                totalCost,
                dailyCost,
                totalMinutes,
                estimatedDays,
                peakHourCost,
                breakdown: {
                    assistantCost: totalMinutes * pricing.assistant,
                    platformCost: totalMinutes * pricing.platform
                }
            },
            warnings: {
                concurrentCallLimit: concurrentCalls > 10,
                lowBalance: false
            }
        });
    }
    catch (error) {
        console.error('Error calculating estimate:', error);
        res.status(500).json({ error: 'Failed to calculate estimate' });
    }
});
exports.default = router;
