// netlify/functions/chat.js
exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
    try {
        const { message, context } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Chybí API klíč.');
        const ltv = context.formData.propertyValue ? Math.round((context.formData.loanAmount / context.formData.propertyValue)*100) : 0;
        const dsti = context.calculation?.selectedOffer ? Math.round((context.calculation.selectedOffer.monthlyPayment / context.formData.income)*100) : 0;
        
        const prompt = `Jsi profesionální hypoteční AI stratég pro Hypoteky Ai. 
        Mluv stručně, v odstavcích, max 3 věty. 
        Když klient požádá o specialistu, schůzku nebo kontakt, vždy odpověz POUZE platným JSONem: {"tool":"showLeadForm"}
        Pokud LTV > 90% nebo DSTI > 45%, upozorni na problém. U OSVČ zmiň obratové hypotéky.
        Aktuální parametry klienta: Úvěr ${context.formData.loanAmount} Kč, LTV: ${ltv}%, DSTI: ${dsti}%, Příjem: ${context.formData.income} Kč.
        Dotaz klienta: ${message}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text.trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return { statusCode: 200, headers, body: jsonMatch[0] };
        return { statusCode: 200, headers, body: JSON.stringify({ response: responseText.replace(/```json\n?|```\n?/g, "") }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
};
