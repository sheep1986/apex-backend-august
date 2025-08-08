"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const VAPI_API_KEY = 'da8956d4-0508-474e-bd96-7eda82d2d943';
console.log('\n🔍 Testing VAPI with axios from backend...');
console.log('='.repeat(60));
async function testVAPIWithAxios() {
    try {
        const client = axios_1.default.create({
            baseURL: 'https://api.vapi.ai',
            headers: {
                'Authorization': `Bearer ${VAPI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            validateStatus: (status) => status < 500
        });
        client.interceptors.request.use((config) => {
            console.log('📤 Request config:', {
                url: config.url,
                baseURL: config.baseURL,
                headers: config.headers,
                timeout: config.timeout
            });
            return config;
        }, (error) => {
            console.error('❌ Request error:', error);
            return Promise.reject(error);
        });
        client.interceptors.response.use((response) => {
            console.log('📥 Response:', {
                status: response.status,
                statusText: response.statusText,
                dataLength: Array.isArray(response.data) ? response.data.length : 'not array'
            });
            return response;
        }, (error) => {
            console.error('❌ Response error:', error.message);
            if (error.response) {
                console.error('Response details:', {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                });
            }
            else if (error.request) {
                console.error('No response received:', {
                    message: error.message,
                    code: error.code
                });
            }
            return Promise.reject(error);
        });
        console.log('\n1️⃣ Testing /assistant endpoint...');
        try {
            const assistantsResponse = await client.get('/assistant');
            console.log('✅ Assistants retrieved:', assistantsResponse.data.length);
        }
        catch (error) {
            console.error('❌ Failed to get assistants:', error.message);
        }
        console.log('\n2️⃣ Testing /phone-number endpoint...');
        try {
            const phoneResponse = await client.get('/phone-number');
            console.log('✅ Phone numbers retrieved:', phoneResponse.data.length);
        }
        catch (error) {
            console.error('❌ Failed to get phone numbers:', error.message);
        }
    }
    catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}
testVAPIWithAxios();
