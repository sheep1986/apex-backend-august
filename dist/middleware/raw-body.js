"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRawBodyMiddleware = exports.rawBodyMiddleware = void 0;
const express_1 = __importDefault(require("express"));
exports.rawBodyMiddleware = express_1.default.json({
    verify: (req, res, buf, encoding) => {
        req.rawBody = buf.toString('utf8');
        req.rawBodyBuffer = buf;
        console.log('📦 Raw body captured:', {
            size: buf.length,
            hasBody: !!req.rawBody,
            url: req.url
        });
    }
});
exports.webhookRawBodyMiddleware = express_1.default.raw({
    type: 'application/json',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
        req.rawBodyBuffer = buf;
    }
});
