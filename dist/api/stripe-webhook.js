"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
console.log('⚠️ Stripe webhook disabled for development');
router.post('/webhook', (req, res) => {
    console.log('Stripe webhook called but disabled in development');
    res.status(200).json({
        received: true,
        message: 'Stripe webhook disabled in development mode'
    });
});
exports.default = router;
