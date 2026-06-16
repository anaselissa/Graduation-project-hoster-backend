const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: المساعد الذكي (Chatbot)
 */

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: إرسال رسالة للمساعد الذكي
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: كيف أطلب خدمة توصيل دواء؟
 *               userId:
 *                 type: string
 *                 description: معرّف مستخدم آخر (اختياري)
 *     responses:
 *       200:
 *         description: رد المساعد الذكي
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *       400:
 *         description: الرسالة مطلوبة
 *       500:
 *         description: فشل إرسال الرسالة
 */
router.post('/', auth.authenticateToken, async (req, res) => {
    try {
        const { message, userId } = req.body;
        const targetId = userId || req.user.id;

        if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `أنت مساعد ذكي لتطبيق "رعايتكم" - منصة أردنية تربط الأهالي بالمتطوعين لرعاية كبار السن.\nمهمتك مساعدة المستخدمين في:\n- طلب الخدمات (توصيل دواء، طعام، نقل، رعاية طبية)\n- الإجابة على أسئلتهم عن التطبيق\n- تقديم نصائح في رعاية كبار السن\nتحدث دائماً باللغة العربية بأسلوب ودود ومهني.`,
                    },
                    { role: 'user', content: message },
                ],
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!groqResponse.ok) {
            const errData = await groqResponse.json();
            throw new Error(errData.error?.message || 'Groq API error');
        }

        const data = await groqResponse.json();
        const reply = data.choices?.[0]?.message?.content || 'عذراً، لم أستطع الرد الآن.';

        await supabase.from('chat_history').insert({
            id: uuidv4(),
            user_id: targetId,
            user_message: message,
            bot_reply: reply,
            created_at: new Date().toISOString(),
        });

        res.json({ reply });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: 'فشل إرسال الرسالة', details: err.message });
    }
});

module.exports = router;